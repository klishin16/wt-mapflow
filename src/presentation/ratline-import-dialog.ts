import type {RatlineImportOptions, RatlineImportPreview} from '../application/ports.ts';
import type {PositionContext} from '../application/position-service.ts';
import {PositionService} from '../application/position-service.ts';

interface Options {
    readonly service: PositionService;
    readonly context: () => PositionContext | null;
    readonly onImported: (result: {saved: number; protected: number}) => Promise<void>;
}

export class RatlineImportDialog {
    private readonly dialog = document.createElement('dialog');
    private readonly options: Options;
    private preview: RatlineImportPreview | null = null;
    private target: PositionContext | null = null;
    private revision = 0;
    private busy = false;

    constructor(options: Options) {
        this.options = options;
        this.dialog.className = 'position-dialog ratline-dialog';
        this.dialog.setAttribute('aria-label', 'Импорт JSON Ratline');
        this.dialog.innerHTML = `
            <h2>Импорт JSON Ratline</h2>
            <p>Вставь JSON-ответ карты Ratline или выбери файл. Название Ratline может отличаться от имени игровой карты.</p>
            <label>Источник JSON<select data-source><option value="text">Вставить текст</option><option value="file">Выбрать файл</option></select></label>
            <label data-text-field>JSON карты<textarea data-text rows="8" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder='{"mapName":"Tunisia","pins":[],"routes":[]}'></textarea></label>
            <label data-file-field hidden>Файл карты<input data-file type="file" accept="application/json,.json"></label>
            <label><input data-bind type="checkbox" checked> Привязать к текущей игровой карте и её варианту</label>
            <p data-context class="help"></p>
            <details><summary>Настройки координат</summary>
                <label>Единицы<select data-units><option value="auto">Автоматически</option><option value="normalized">От 0 до 1</option><option value="pixels">Пиксели</option></select></label>
                <label>Порядок пар<select data-order><option value="xy">X, Y</option><option value="yx">Y, X</option></select></label>
                <label><input data-flip type="checkbox" checked> Поменять верх и низ (перевернуть ось Y)</label>
                <label>Поле пути (необязательно)<input data-field placeholder="Для segments[].points определяется автоматически"></label>
                <label>Ширина исходной карты, px<input data-width type="number" min="1" placeholder="Из imageUrl"></label>
                <label>Высота исходной карты, px<input data-height type="number" min="1" placeholder="Из imageUrl"></label>
            </details>
            <p class="help">По умолчанию точки и маршруты отражаются относительно горизонтальной оси (Y → 1 − Y). Это можно отключить в настройках координат. Для привязки границы обеих карт должны совпадать. Размеры можно указать вручную, если исходное изображение недоступно.</p>
            <p data-status role="status">Вставь JSON или выбери файл и выполни предпросмотр.</p>
            <div data-preview class="ratline-preview" hidden></div>
            <div class="dialog-actions"><button data-check type="button">Предпросмотр</button>
                <button data-save type="button" disabled>Импортировать</button><button data-close type="button">Закрыть</button></div>`;
        this.get<HTMLButtonElement>('[data-check]').onclick = () => { void this.check(); };
        this.get<HTMLButtonElement>('[data-save]').onclick = () => { void this.save(); };
        this.get<HTMLButtonElement>('[data-close]').onclick = () => this.dialog.close();
        this.get<HTMLSelectElement>('[data-source]').addEventListener('change', () => {
            const text = this.get<HTMLSelectElement>('[data-source]').value === 'text';
            this.get('[data-text-field]').hidden = !text;
            this.get('[data-file-field]').hidden = text;
        });
        this.dialog.addEventListener('input', () => this.invalidate());
        this.dialog.addEventListener('change', () => this.invalidate());
        this.dialog.addEventListener('close', () => this.invalidate());
        this.dialog.addEventListener('cancel', event => { if (this.busy) event.preventDefault(); });
        document.body.append(this.dialog);
    }

    open(): void {
        if (this.dialog.open) return;
        const context = this.options.context();
        this.get('[data-context]').textContent = context ? `Текущая карта: ${context.mapId}. Название Ratline менять не нужно.` : 'Текущая карта ещё не загружена. Можно снять привязку и сохранить по названию из JSON.';
        this.dialog.showModal();
    }
    destroy(): void { this.revision++; this.dialog.remove(); }
    private get<T extends HTMLElement>(selector: string): T { return this.dialog.querySelector<T>(selector)!; }
    private input(selector: string): HTMLInputElement { return this.get<HTMLInputElement>(selector); }
    private status(message: string): void { this.get('[data-status]').textContent = message; }
    private invalidate(): void {
        this.revision++; this.preview = null; this.target = null;
        this.get<HTMLButtonElement>('[data-save]').disabled = true;
        this.get('[data-preview]').replaceChildren(); this.get('[data-preview]').hidden = true;
        this.status('Выполни предпросмотр перед импортом.');
    }

    private async check(): Promise<void> {
        this.invalidate();
        const revision = this.revision;
        const fromText = this.get<HTMLSelectElement>('[data-source]').value === 'text';
        const text = this.get<HTMLTextAreaElement>('[data-text]').value.trim();
        const file = fromText ? (text ? new Blob([text], {type: 'application/json'}) : null) : this.input('[data-file]').files?.[0];
        if (!file) { this.status(fromText ? 'Вставь JSON карты Ratline.' : 'Выбери JSON-файл карты Ratline.'); return; }
        const context = this.input('[data-bind]').checked ? this.options.context() : null;
        if (this.input('[data-bind]').checked && !context) { this.status('Дождись загрузки игровой карты или сними привязку.'); return; }
        this.status('Читаю JSON и координаты…');
        const options: RatlineImportOptions = {
            coordinates: this.get<HTMLSelectElement>('[data-units]').value as RatlineImportOptions['coordinates'],
            pairOrder: this.get<HTMLSelectElement>('[data-order]').value as RatlineImportOptions['pairOrder'],
            flipY: this.input('[data-flip]').checked, routeField: this.input('[data-field]').value.trim() || undefined,
            width: this.input('[data-width]').value ? Number(this.input('[data-width]').value) : undefined,
            height: this.input('[data-height]').value ? Number(this.input('[data-height]').value) : undefined,
            targetMapId: context?.mapId, variantId: context?.variantId
        };
        try {
            const preview = await this.options.service.previewRatline(file, options);
            if (revision !== this.revision || !this.dialog.open) return;
            this.preview = preview; this.target = context;
            this.status(`${preview.sourceMapName} → ${preview.mapId}: точек ${preview.pinCount}, маршрутов ${preview.routeCount}. Личные правки и удаления сохранятся.`);
            this.draw(preview);
            this.get<HTMLButtonElement>('[data-save]').disabled = preview.backup.changes.length === 0;
        } catch (error: unknown) { if (revision === this.revision) this.status(error instanceof SyntaxError ? `Некорректный JSON: ${error.message}` : error instanceof Error ? error.message : String(error)); }
    }

    private draw(preview: RatlineImportPreview): void {
        const container = this.get('[data-preview]'); container.hidden = false;
        if (preview.imageUrl) {
            const image = document.createElement('img'); image.src = preview.imageUrl; image.alt = preview.sourceMapName; container.append(image);
        }
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 1000 1000');
        svg.setAttribute('aria-label', 'Предпросмотр точек и маршрутов');
        for (const change of preview.backup.changes) {
            const position = change.position; if (!position) continue;
            if (position.approachPath) {
                const path = document.createElementNS(ns, 'polyline');
                path.setAttribute('points', position.approachPath.map(point => `${point.x * 1000},${point.y * 1000}`).join(' '));
                path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#67eda7'); path.setAttribute('stroke-width', '4'); svg.append(path);
            }
            const circle = document.createElementNS(ns, 'circle');
            circle.setAttribute('cx', String(position.point.x * 1000)); circle.setAttribute('cy', String(position.point.y * 1000));
            circle.setAttribute('r', '7'); circle.setAttribute('fill', '#ffd45e'); svg.append(circle);
        }
        container.append(svg);
    }

    private async save(): Promise<void> {
        if (!this.preview || this.busy) return;
        if (this.target) {
            const current = this.options.context();
            if (current?.mapId !== this.target.mapId || current.variantId !== this.target.variantId) {
                this.invalidate(); this.status('Игровая карта сменилась. Выполни предпросмотр заново.'); return;
            }
        }
        this.busy = true;
        this.dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('input, textarea, select, button').forEach(control => { control.disabled = true; });
        try {
            const result = await this.options.service.importRatline(this.preview);
            this.preview = null;
            this.status(`Сохранено ${result.saved}, защищено личных записей ${result.protected}.`);
            await this.options.onImported(result);
            this.dialog.close();
        } catch (error: unknown) { this.status(error instanceof Error ? error.message : String(error)); }
        finally {
            this.busy = false;
            this.dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('input, textarea, select, button').forEach(control => { control.disabled = false; });
            this.get<HTMLButtonElement>('[data-save]').disabled = !this.preview;
        }
    }
}
