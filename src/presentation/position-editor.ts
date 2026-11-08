import type {Point} from '../domain/geometry.ts';
import type {PositionDraft, TacticalPosition} from '../domain/position.ts';
import type {PositionContext} from '../application/position-service.ts';
import {PositionService} from '../application/position-service.ts';
import type {ScreenshotInput} from '../application/ports.ts';
import {element} from './dom.ts';
import {ScreenshotGallery} from './screenshot-gallery.ts';

export interface SpawnChoice { readonly label: string; readonly point: Point; }
export type PickMode = 'point' | 'aim' | 'route';

interface EditorOptions {
    readonly service: PositionService;
    readonly onSaved: (position: TacticalPosition) => Promise<void>;
    readonly onPick: (mode: PickMode, draft: PositionDraft) => void;
    readonly onPreview: (draft: PositionDraft | null) => void;
    readonly onClose: () => void;
}

export class PositionEditor {
    private readonly options: EditorOptions;
    private readonly lifecycle = new AbortController();
    private readonly dialog = element('position-dialog', HTMLDialogElement);
    private readonly form = element('position-form', HTMLFormElement);
    private readonly title = element('position-name', HTMLInputElement);
    private readonly description = element('position-description', HTMLTextAreaElement);
    private readonly radius = element('position-radius', HTMLInputElement);
    private readonly spawn = element('position-spawn', HTMLSelectElement);
    private readonly filesInput = element('position-files', HTMLInputElement);
    private readonly galleryElement = element('editor-screenshots', HTMLElement);
    private readonly error = element('editor-error', HTMLElement);
    private readonly saveButton = element('position-save', HTMLButtonElement);
    private readonly gallery: ScreenshotGallery;
    private context: PositionContext | null = null;
    private existing: TacticalPosition | undefined;
    private point: Point = {x: 0.5, y: 0.5};
    private aim: Point | undefined;
    private route: Point[] = [];
    private routeBeforePick: Point[] = [];
    private screenshots: string[] = [];
    private files: ScreenshotInput[] = [];
    private spawns: readonly SpawnChoice[] = [];
    private busy = false;
    private revision = 0;

    constructor(options: EditorOptions) {
        this.options = options;
        this.gallery = new ScreenshotGallery(reference => options.service.screenshot(reference));
        const {signal} = this.lifecycle;
        this.form.addEventListener('submit', event => { event.preventDefault(); void this.save(); }, {signal});
        this.form.addEventListener('input', () => this.preview(), {signal});
        this.dialog.addEventListener('cancel', event => { event.preventDefault(); if (!this.busy) this.close(); }, {signal});
        element('position-cancel', HTMLButtonElement).addEventListener('click', () => { if (!this.busy) this.close(); }, {signal});
        element('position-pick-point', HTMLButtonElement).addEventListener('click', () => this.pick('point'), {signal});
        element('position-pick-aim', HTMLButtonElement).addEventListener('click', () => this.pick('aim'), {signal});
        element('position-clear-aim', HTMLButtonElement).addEventListener('click', () => { this.aim = undefined; this.preview(); }, {signal});
        element('position-pick-route', HTMLButtonElement).addEventListener('click', () => this.pick('route'), {signal});
        element('position-clear-route', HTMLButtonElement).addEventListener('click', () => { this.route = []; this.preview(); }, {signal});
        this.filesInput.addEventListener('change', () => {
            this.addFiles([...this.filesInput.files ?? []]);
            this.filesInput.value = '';
        }, {signal});
        this.dialog.addEventListener('paste', event => {
            const files = [...event.clipboardData?.files ?? []];
            if (files.length) { event.preventDefault(); this.addFiles(files); }
        }, {signal});
        const drop = element('screenshot-drop', HTMLElement);
        drop.addEventListener('dragover', event => {
            if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
        }, {signal});
        drop.addEventListener('drop', event => {
            event.preventDefault();
            this.addFiles([...event.dataTransfer?.files ?? []]);
        }, {signal});
    }

    get isEditing(): boolean { return this.context !== null; }

    open(context: PositionContext, point: Point, spawns: readonly SpawnChoice[], existing?: TacticalPosition): void {
        if (this.busy) return;
        this.revision++;
        this.context = context;
        this.existing = existing;
        this.point = point;
        this.aim = existing?.aimPoint;
        this.route = [...existing?.approachPath?.slice(0, -1) ?? []];
        this.routeBeforePick = [];
        this.screenshots = [...existing?.screenshots ?? []];
        this.files = [];
        this.spawns = [...spawns];
        this.form.reset();
        this.title.value = existing?.title ?? '';
        this.description.value = existing?.description ?? '';
        this.radius.value = String(existing?.triggerRadiusMeters ?? 100);
        this.error.textContent = '';
        element('editor-fields', HTMLFieldSetElement).disabled = false;
        element('position-dialog-title', HTMLElement).textContent = existing ? 'Редактировать позицию' : 'Новая позиция';
        this.spawn.replaceChildren(new Option('Для любой стороны', ''));
        const savedSpawn = existing?.spawnPoint;
        if (savedSpawn) {
            const same = this.spawns.findIndex(spawn => Math.hypot(spawn.point.x - savedSpawn.x, spawn.point.y - savedSpawn.y) < 0.01);
            if (same < 0) this.spawns = [...this.spawns, {label: 'Сохранённый спавн', point: savedSpawn}];
        }
        this.spawns.forEach((spawn, index) => this.spawn.add(new Option(spawn.label, String(index))));
        if (savedSpawn) {
            this.spawn.value = String(this.spawns.findIndex(spawn => Math.hypot(spawn.point.x - savedSpawn.x, spawn.point.y - savedSpawn.y) < 0.01));
        }
        this.renderImages();
        this.preview();
        this.dialog.showModal();
        this.title.focus();
    }

    private draft(): PositionDraft {
        return {
            point: this.point, aimPoint: this.aim,
            approachPath: this.route.length ? [...this.route, this.point] : undefined,
            title: this.title.value, description: this.description.value,
            triggerRadiusMeters: this.radius.valueAsNumber,
            screenshots: this.screenshots,
            spawnPoint: this.spawn.value === '' ? undefined : this.spawns[Number(this.spawn.value)]?.point
        };
    }

    private preview(): void {
        if (!this.context) return;
        const point = (value: Point): string => `${(value.x * 100).toFixed(1)}%, ${(value.y * 100).toFixed(1)}%`;
        element('position-coordinates', HTMLElement).textContent = point(this.point);
        element('position-aim-value', HTMLElement).textContent = this.aim ? point(this.aim) : 'Не задано';
        element('position-route-value', HTMLElement).textContent = this.route.length ? `${this.route.length + 1} точек · заканчивается на позиции` : 'Не задан';
        this.options.onPreview(this.draft());
    }

    private pick(mode: PickMode): void {
        if (!this.context || this.busy) return;
        if (mode === 'route') this.routeBeforePick = [...this.route];
        this.dialog.close();
        this.options.onPick(mode, this.draft());
    }

    applyPick(mode: PickMode, point: Point): void {
        if (!this.context) return;
        if (mode === 'route') {
            if (this.route.length >= 255) return;
            const previous = this.route[this.route.length - 1];
            if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > 0.00001) this.route.push(point);
            this.preview();
            return;
        }
        if (mode === 'point') this.point = point;
        else this.aim = point;
        this.resume();
    }

    undoRoutePoint(): void { this.route.pop(); this.preview(); }

    finishRoute(save: boolean): void {
        if (!save) this.route = [...this.routeBeforePick];
        this.resume();
    }

    resume(): void {
        if (!this.context) return;
        this.preview();
        if (!this.dialog.open) this.dialog.showModal();
    }

    private addFiles(files: readonly File[]): void {
        if (this.busy) return;
        if (this.files.length + this.screenshots.length + files.length > 6) {
            this.error.textContent = 'Можно прикрепить не более 6 скриншотов'; return;
        }
        if (files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)) {
            this.error.textContent = 'Выбери PNG, JPEG или WebP размером до 8 МБ каждый'; return;
        }
        this.error.textContent = '';
        this.files.push(...files.map(file => ({name: file.name || 'Скриншот', blob: file})));
        this.renderImages();
    }

    private renderImages(): void {
        this.gallery.render(this.galleryElement, [
            ...this.screenshots.map((reference, index) => ({key: `ref:${index}`, reference, name: `Скриншот ${index + 1}`})),
            ...this.files.map((file, index) => ({key: `file:${index}`, blob: file.blob, name: file.name}))
        ], key => {
            if (this.busy) return;
            const [kind, index] = key.split(':');
            if (kind === 'ref') this.screenshots.splice(Number(index), 1);
            else this.files.splice(Number(index), 1);
            this.renderImages();
        });
    }

    private async save(): Promise<void> {
        if (!this.context || this.busy || !this.form.reportValidity()) return;
        const revision = this.revision;
        this.busy = true;
        this.saveButton.disabled = true;
        element('editor-fields', HTMLFieldSetElement).disabled = true;
        this.saveButton.textContent = 'Сохранение…';
        this.error.textContent = '';
        try {
            const position = await this.options.service.save(this.context, this.draft(), this.files, this.existing);
            if (revision === this.revision) this.close();
            await this.options.onSaved(position);
        } catch (error: unknown) {
            if (revision === this.revision) this.error.textContent = error instanceof Error ? error.message : String(error);
        } finally {
            this.busy = false;
            this.saveButton.disabled = false;
            element('editor-fields', HTMLFieldSetElement).disabled = false;
            this.saveButton.textContent = 'Сохранить';
        }
    }

    close(): void {
        this.revision++;
        this.context = null;
        this.dialog.close();
        this.gallery.clear();
        this.files = [];
        this.options.onPreview(null);
        this.options.onClose();
    }

    destroy(): void { this.close(); this.lifecycle.abort(); }
}
