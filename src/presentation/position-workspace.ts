import type {MapViewState} from '../application/map-controller.ts';
import type {DeletedPosition} from '../application/position-service.ts';
import {PositionService} from '../application/position-service.ts';
import {PositionProximity} from '../application/position-proximity.ts';
import type {Point} from '../domain/geometry.ts';
import type {PositionDraft, TacticalPosition} from '../domain/position.ts';
import {appliesToSpawn, approachPathLength, mapDistanceMeters} from '../domain/position.ts';
import {isSameMap, mapVariantId} from '../domain/map-identity.ts';
import {element, button} from './dom.ts';
import {MapView} from './map-view.ts';
import {PositionEditor} from './position-editor.ts';
import type {PickMode, SpawnChoice} from './position-editor.ts';
import {RatlineImportDialog} from './ratline-import-dialog.ts';
import {ScreenshotGallery} from './screenshot-gallery.ts';

interface WorkspaceOptions {
    readonly service: PositionService;
    readonly view: MapView;
    readonly refresh: () => Promise<void>;
}

export class PositionWorkspace {
    private readonly options: WorkspaceOptions;
    private readonly editor: PositionEditor;
    private readonly ratline: RatlineImportDialog;
    private readonly proximity = new PositionProximity();
    private readonly gallery: ScreenshotGallery;
    private readonly lifecycle = new AbortController();
    private readonly card = element('position-card', HTMLElement);
    private readonly list = element('position-list', HTMLSelectElement);
    private readonly filter = element('spawn-filter', HTMLSelectElement);
    private readonly newButton = element('position-new', HTMLButtonElement);
    private state: MapViewState<HTMLImageElement> | null = null;
    private selected: TacticalPosition | null = null;
    private manualSelection = false;
    private spawn: Point | null = null;
    private spawns: readonly SpawnChoice[] = [];
    private visible: readonly TacticalPosition[] = [];
    private draft: PositionDraft | null = null;
    private picking: PickMode | null = null;
    private listSignature = '';
    private spawnSignature = '';
    private deleting = false;

    constructor(options: WorkspaceOptions) {
        this.options = options;
        this.ratline = new RatlineImportDialog({
            service: options.service,
            context: () => this.state?.mapId && this.state.info ? {mapId: this.state.mapId, variantId: mapVariantId(this.state.info)} : null,
            onImported: async result => {
                this.notice(`Ratline: импортировано ${result.saved}, защищено личных записей ${result.protected}`);
                await options.refresh();
            }
        });
        this.gallery = new ScreenshotGallery(reference => options.service.screenshot(reference));
        this.editor = new PositionEditor({
            service: options.service,
            onSaved: async position => {
                try {
                    await options.refresh();
                    if (this.state?.mapId === position.mapId && this.state.info && position.variantId === mapVariantId(this.state.info)) {
                        const saved = this.state.positions.find(item => item.id === position.id);
                        if (saved) this.showCard(saved, true);
                    }
                    this.notice('Позиция сохранена на этом устройстве');
                } catch (error: unknown) { this.notice(`Позиция сохранена, но список не обновился: ${this.message(error)}`); }
            },
            onPick: (mode, draft) => {
                this.picking = mode;
                this.draft = draft;
                options.view.pauseFollowing();
                element('map-pick-bar', HTMLElement).hidden = false;
                element('map-pick-instruction', HTMLElement).textContent = mode === 'aim' ?
                    'Нажми на карте, куда направить стрельбу' : mode === 'route' ?
                        'Отметь начало и повороты пути по порядку. Конец привязан к позиции.' : 'Нажми новое место позиции на карте';
                this.updateRouteControls();
                this.overlay();
            },
            onPreview: draft => { this.draft = draft; this.updateRouteControls(); this.overlay(); },
            onClose: () => {
                this.picking = null;
                element('map-pick-bar', HTMLElement).hidden = true;
                if (this.selected && this.visible.some(position => position.id === this.selected?.id)) this.showCard(this.selected, this.manualSelection);
                else this.overlay();
            }
        });
        const {signal} = this.lifecycle;
        this.newButton.addEventListener('click', () => this.create(options.view.centerPoint()), {signal});
        element('card-close', HTMLButtonElement).addEventListener('click', () => this.closeCard(true), {signal});
        element('card-edit', HTMLButtonElement).addEventListener('click', () => {
            if (this.selected) this.edit(this.selected.point, this.selected);
        }, {signal});
        element('card-delete', HTMLButtonElement).addEventListener('click', () => { void this.remove(); }, {signal});
        element('map-pick-cancel', HTMLButtonElement).addEventListener('click', () => {
            this.finishPick(false);
        }, {signal});
        element('map-route-done', HTMLButtonElement).addEventListener('click', () => this.finishPick(true), {signal});
        element('map-route-undo', HTMLButtonElement).addEventListener('click', () => this.editor.undoRoutePoint(), {signal});
        this.list.addEventListener('change', () => {
            const position = this.visible.find(position => position.id === this.list.value);
            if (position) this.showCard(position, true);
        }, {signal});
        this.filter.addEventListener('change', () => {
            this.spawn = this.filter.value === '' ? null : this.spawns[Number(this.filter.value)]?.point ?? null;
            this.closeCard(false);
            this.reconcile();
        }, {signal});
        element('ratline-import', HTMLButtonElement).addEventListener('click', () => this.ratline.open(), {signal});
        element('positions-export', HTMLButtonElement).addEventListener('click', () => { void this.export(); }, {signal});
        const importInput = element('positions-import-file', HTMLInputElement);
        element('positions-import', HTMLButtonElement).addEventListener('click', () => importInput.click(), {signal});
        importInput.addEventListener('change', () => {
            const file = importInput.files?.[0];
            importInput.value = '';
            if (file) void this.import(file);
        }, {signal});
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            if (this.picking) {
                event.preventDefault();
                this.finishPick(false);
            } else if (!this.editor.isEditing) this.closeCard(true);
        }, {signal});
    }

    setState(state: MapViewState<HTMLImageElement>): void {
        const changed = !isSameMap(state.info, this.state?.info) || state.mapId !== this.state?.mapId;
        this.state = state;
        if (changed) {
            this.editor.close();
            this.proximity.reset();
            this.spawn = null;
            this.spawnSignature = '';
            this.closeCard(false);
        }
        this.reconcile();
    }

    private canEdit(): boolean {
        return !!this.state?.mapId && !!this.state.image && !!this.state.info &&
            ['ready', 'no-positions'].includes(this.state.mapStatus);
    }

    private spawnChoices(): readonly SpawnChoice[] {
        const geometry = this.state?.info?.geometry;
        return (this.state?.objects ?? []).flatMap(object => {
            if (object.kind !== 'point' || object.spawnType !== 'tank') return [];
            let location = `${Math.round(object.position.x * 100)}%, ${Math.round(object.position.y * 100)}%`;
            if (geometry) {
                const row = Math.floor(object.position.y * (geometry.max.y - geometry.min.y) / geometry.gridStep.y);
                const column = Math.floor(object.position.x * (geometry.max.x - geometry.min.x) / geometry.gridStep.x) + 1;
                if (row >= 0 && row < 26) location = `${String.fromCharCode(65 + row)}${column}`;
            }
            return [{label: `Спавн · ${location}`, point: object.position}];
        });
    }

    private reconcile(): void {
        if (!this.state) return;
        this.newButton.disabled = !this.canEdit();
        const status = element('positions-status', HTMLElement);
        status.textContent = this.state.positionWarning ?? (this.canEdit() ?
            'Долгое нажатие или правая кнопка мыши — новая позиция' : 'Добавление позиций станет доступно после загрузки карты');
        this.spawns = this.spawnChoices();
        const spawnSignature = this.spawns.map(spawn => `${spawn.label}:${spawn.point.x}:${spawn.point.y}`).join('|');
        if (spawnSignature !== this.spawnSignature) {
            this.spawnSignature = spawnSignature;
            this.filter.replaceChildren(new Option('Все стороны', ''));
            this.spawns.forEach((spawn, index) => this.filter.add(new Option(spawn.label, String(index))));
            if (this.spawn) {
                const index = this.spawns.findIndex(spawn => Math.hypot(spawn.point.x - this.spawn!.x, spawn.point.y - this.spawn!.y) < 0.01);
                if (index >= 0) this.filter.value = String(index);
                else { this.spawn = null; this.filter.value = ''; }
            }
        }
        this.visible = this.state.positions.filter(position => appliesToSpawn(position, this.spawn, this.state?.info?.geometry ?? null));
        const signature = this.visible.map(position => `${position.id}:${position.title}`).join('|');
        if (signature !== this.listSignature) {
            this.listSignature = signature;
            this.list.replaceChildren(new Option('Позиции на карте', ''));
            for (const position of this.visible) this.list.add(new Option(position.title, position.id));
        }
        this.list.disabled = this.visible.length === 0;
        this.list.value = this.selected?.id ?? '';
        if (this.selected) {
            const current = this.visible.find(position => position.id === this.selected?.id);
            if (!current) this.closeCard(false);
            else if (current !== this.selected) this.showCard(current, this.manualSelection);
        }
        const player = this.state.objects.find(object => object.kind === 'point' && object.icon === 'Player');
        if (!this.editor.isEditing && !this.manualSelection) {
            const nearby = this.proximity.update(this.visible, player?.kind === 'point' ? player.position : null, this.state.info?.geometry ?? null);
            if (nearby && nearby.id !== this.selected?.id) this.showCard(nearby, false);
            else if (!nearby && this.selected) this.closeCard(false);
        }
        if (this.selected) {
            const distance = player?.kind === 'point' && this.state.info?.geometry ?
                `${Math.round(mapDistanceMeters(player.position, this.selected.point, this.state.info.geometry))} м от игрока` : '';
            element('card-distance', HTMLElement).textContent = distance;
        }
        this.overlay();
    }

    click(point: Point): void {
        if (this.picking) {
            const mode = this.picking;
            if (mode === 'route') { this.editor.applyPick(mode, point); return; }
            this.picking = null;
            element('map-pick-bar', HTMLElement).hidden = true;
            this.editor.applyPick(mode, point);
            return;
        }
        const position = this.options.view.hitPosition(point);
        if (position) this.showCard(position, true);
        else this.closeCard(true);
    }

    private finishPick(save: boolean): void {
        const mode = this.picking;
        this.picking = null;
        element('map-pick-bar', HTMLElement).hidden = true;
        if (mode === 'route') this.editor.finishRoute(save);
        else this.editor.resume();
    }

    private updateRouteControls(): void {
        const active = this.picking === 'route';
        element('map-pick-cancel', HTMLButtonElement).textContent = active ? 'Отменить изменения пути' : 'Вернуться к форме';
        element('map-route-done', HTMLButtonElement).hidden = !active;
        const undo = element('map-route-undo', HTMLButtonElement);
        undo.hidden = !active;
        undo.disabled = !this.draft?.approachPath?.length;
        const count = Math.max(0, (this.draft?.approachPath?.length ?? 0) - 1);
        const status = element('map-route-count', HTMLElement);
        status.hidden = !active;
        status.textContent = `${count}/255 точек до позиции`;
    }

    create(point: Point): void {
        if (this.picking) { this.click(point); return; }
        if (this.editor.isEditing) return;
        this.edit(point);
    }

    private edit(point: Point, existing?: TacticalPosition): void {
        if (!this.canEdit() || !this.state?.mapId || !this.state.info) {
            this.notice('Дождись загрузки карты и позиций'); return;
        }
        this.options.view.pauseFollowing();
        this.card.hidden = true;
        this.editor.open({mapId: this.state.mapId, variantId: mapVariantId(this.state.info)}, point, this.spawns, existing);
    }

    private showCard(position: TacticalPosition, manual: boolean): void {
        this.selected = position;
        this.manualSelection = manual;
        this.card.hidden = false;
        this.list.value = position.id;
        element('card-title', HTMLElement).textContent = position.title;
        element('card-source', HTMLElement).textContent = `${manual ? 'Выбрано на карте' : 'Позиция рядом'} · ${position.createdAt ? 'личная' : position.source?.provider === 'ratline' ? 'Ratline' : 'встроенная'}`;
        element('card-description', HTMLElement).textContent = position.description || 'Описание пока не добавлено';
        element('card-details', HTMLElement).textContent = [
            `Подсказка: ${position.triggerRadiusMeters ?? 100} м`,
            position.aimPoint ? 'Направление показано стрелкой' : '',
            position.approachPath?.length ? (this.state?.info?.geometry ?
                `Путь: ${Math.round(approachPathLength(position, this.state.info.geometry))} м` : 'Путь подъезда показан на карте') : '',
            position.spawnPoint ? 'Привязана к спавну' : 'Для любой стороны'
        ].filter(Boolean).join(' · ');
        this.gallery.render(element('card-screenshots', HTMLElement), position.screenshots.map((reference, index) => ({
            key: reference, reference, name: `Скриншот ${index + 1}`
        })));
        element('card-edit', HTMLButtonElement).disabled = !this.canEdit() || this.deleting;
        element('card-delete', HTMLButtonElement).disabled = !this.canEdit() || this.deleting;
        this.overlay();
    }

    private closeCard(dismiss: boolean): void {
        if (dismiss && this.selected) this.proximity.dismiss(this.selected.id);
        this.selected = null;
        this.manualSelection = false;
        this.card.hidden = true;
        this.gallery.clear();
        this.list.value = '';
        this.overlay();
    }

    private overlay(): void {
        this.options.view.setOverlay({positions: this.visible, selectedId: this.editor?.isEditing ? null : this.selected?.id ?? null, draft: this.draft});
    }

    private message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

    private notice(text: string, undo?: DeletedPosition): void {
        const container = element('position-notice', HTMLElement);
        container.replaceChildren(document.createTextNode(text));
        container.hidden = false;
        if (undo) {
            const restore = button('Отменить удаление', () => {
                restore.disabled = true;
                void this.options.service.undo(undo).then(async () => {
                    await this.options.refresh(); this.notice('Позиция восстановлена');
                }).catch((error: unknown) => { this.notice(this.message(error), undo); });
            });
            container.append(restore);
        }
        const dismiss = button('×', () => { container.hidden = true; });
        dismiss.setAttribute('aria-label', 'Скрыть сообщение');
        container.append(dismiss);
    }

    private async remove(): Promise<void> {
        const position = this.selected;
        if (!position || this.deleting || !this.canEdit()) return;
        this.deleting = true;
        element('card-delete', HTMLButtonElement).disabled = true;
        element('card-edit', HTMLButtonElement).disabled = true;
        try {
            const deleted = await this.options.service.remove(position);
            if (this.selected?.id === position.id) this.closeCard(true);
            await this.options.refresh();
            this.notice('Позиция удалена из личной карты', deleted);
        } catch (error: unknown) { this.notice(this.message(error)); }
        finally {
            this.deleting = false;
            if (this.selected) this.showCard(this.selected, this.manualSelection);
        }
    }

    private async export(): Promise<void> {
        const control = element('positions-export', HTMLButtonElement);
        control.disabled = true;
        try {
            const file = await this.options.service.export();
            const url = URL.createObjectURL(file);
            const link = document.createElement('a');
            link.href = url;
            link.download = `wt-rat-positions-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
            this.notice('Личные позиции и скриншоты экспортированы');
        } catch (error: unknown) { this.notice(this.message(error)); }
        finally { control.disabled = false; }
    }

    private async import(file: File): Promise<void> {
        const control = element('positions-import', HTMLButtonElement);
        control.disabled = true;
        this.notice('Импорт позиций и скриншотов…');
        try {
            await this.options.service.import(file);
            await this.options.refresh();
            this.notice('Позиции импортированы. Совпадающие записи заменены версией из файла');
        } catch (error: unknown) { this.notice(`Импорт не выполнен: ${this.message(error)}`); }
        finally { control.disabled = false; }
    }

    destroy(): void { this.ratline.destroy(); this.editor.destroy(); this.gallery.clear(); this.lifecycle.abort(); }
}
