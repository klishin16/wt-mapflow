import type {MapViewState} from '../application/map-controller.ts';
import type {MapRecognition} from '../domain/map-recognition.ts';
import {mapMatchMargin, mapMatchThreshold} from '../domain/map-recognition.ts';
import {element} from './dom.ts';

interface Options {
    readonly names: readonly string[];
    readonly onBind: (mapId: string | null) => Promise<boolean>;
}

export class MapRecognitionPanel {
    private readonly options: Options;
    private readonly lifecycle = new AbortController();
    private readonly input = element('map-name-choice', HTMLInputElement);
    private readonly apply = element('map-name-apply', HTMLButtonElement);
    private readonly automatic = element('map-name-auto', HTMLButtonElement);
    private readonly status = element('map-recognition-status', HTMLElement);
    private readonly diagnostics = element('map-recognition-diagnostics', HTMLElement);
    private readonly message = element('map-recognition-message', HTMLElement);
    private busy = false;
    private available = false;
    private signature = '';

    constructor(options: Options) {
        this.options = options;
        const names = element('map-name-options', HTMLDataListElement);
        names.replaceChildren(...options.names.map(name => new Option(name, name)));
        this.apply.addEventListener('click', () => { void this.bind(this.input.value.trim()); }, {signal: this.lifecycle.signal});
        this.automatic.addEventListener('click', () => { void this.bind(null); }, {signal: this.lifecycle.signal});
        this.input.addEventListener('keydown', event => {
            if (event.key === 'Enter') { event.preventDefault(); void this.bind(this.input.value.trim()); }
        }, {signal: this.lifecycle.signal});
    }

    setState(state: MapViewState<HTMLImageElement>, report: MapRecognition | null): void {
        this.available = !!state.info && !!state.image && !!report;
        this.controls();
        if (!report) {
            this.signature = '';
            this.status.textContent = 'Диагностика станет доступна после распознавания игровой карты.';
            this.diagnostics.textContent = '';
            return;
        }
        const signature = `${report.imageHash}:${report.mapId}:${report.method}`;
        if (signature === this.signature) return;
        this.signature = signature;
        this.message.textContent = '';
        const labels = {manual: 'Выбрана вручную', exact: 'Точное совпадение', similar: 'Близкое совпадение', ambiguous: 'Несколько близких карт — выбери вручную', unknown: 'Совпадение не найдено — выбери вручную'};
        this.status.textContent = `${labels[report.method]}${report.mapId.startsWith('custom-') ? '' : `: ${report.mapId}`}`;
        this.input.value = report.mapId.startsWith('custom-') ? '' : report.mapId;
        this.diagnostics.textContent = [
            `Размер изображения: ${state.image?.naturalWidth} × ${state.image?.naturalHeight}`,
            ...report.samples.map(sample => `${sample.format}: ${sample.hash}`),
            `Порог: ${mapMatchThreshold} бита из 64; отрыв от другой карты: ≥ ${mapMatchMargin} бита.`,
            'Ближайшие карты (по лучшему варианту хеша):',
            ...report.candidates.map(candidate => `${candidate.mapId}: ${candidate.distance}/64 · ${candidate.format} · эталон ${candidate.reference}`),
            'Каталог: исторические aHash + дополнительные варианты из PowerBroker2/WarThunder. Сверен 08.11.2026; актуальность всех эталонов в игре не подтверждена.'
        ].join('\n');
    }

    private controls(): void {
        this.apply.disabled = this.busy || !this.available;
        this.automatic.disabled = this.busy || !this.available;
        this.input.disabled = this.busy || !this.available;
    }

    private async bind(mapId: string | null): Promise<void> {
        if (this.busy || !this.available) return;
        if (mapId === '') { this.message.textContent = 'Выбери или введи название игровой карты.'; return; }
        this.busy = true; this.controls();
        this.message.textContent = 'Применяю выбор карты…';
        try {
            const persistent = await this.options.onBind(mapId);
            this.message.textContent = persistent ? 'Выбор сохранён для этого изображения карты.' : 'Выбор применён только в этой вкладке: хранилище браузера недоступно.';
        } catch (error: unknown) { this.message.textContent = error instanceof Error ? error.message : String(error); }
        finally { this.busy = false; this.controls(); }
    }

    destroy(): void { this.lifecycle.abort(); }
}
