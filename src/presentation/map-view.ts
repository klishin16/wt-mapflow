import type {MapViewState} from '../application/map-controller.ts';
import {isSameMap} from '../domain/map-identity.ts';
import {Camera} from './camera.ts';
import {mapGridFrame} from './map-grid-frame.ts';
import {CanvasRenderer} from './canvas-renderer.ts';
import {attachMapInput} from './map-input.ts';
import {PlayerFollowing} from './player-following.ts';
import {AircraftMapOverview} from './aircraft-map-overview.ts';
import type {Point} from '../domain/geometry.ts';
import type {TacticalPosition} from '../domain/position.ts';
import type {PositionOverlay} from './canvas-renderer.ts';
import {airGroundGuidance} from '../domain/air-ground-guidance.ts';
import {spawnGuidanceLabel} from './air-ground-guidance-renderer.ts';

interface MapViewElements {
    readonly viewport: HTMLElement;
    readonly root: HTMLElement;
    readonly canvas: HTMLCanvasElement;
    readonly connectionStatus: HTMLElement;
    readonly mapStatus: HTMLElement;
    readonly playerSide: HTMLElement;
    readonly battleMode: HTMLElement;
    readonly zoomIn: HTMLButtonElement;
    readonly zoomOut: HTMLButtonElement;
    readonly overview: HTMLButtonElement;
    readonly follow: HTMLButtonElement;
    readonly zoomLevel: HTMLOutputElement;
    readonly cameraMode: HTMLElement;
    readonly markerSize: HTMLInputElement;
    readonly markerSizeValue: HTMLOutputElement;
    readonly spawnGuidance: HTMLInputElement;
    readonly spawnGuidanceInfo: HTMLElement;
}

export class MapView {
    private readonly elements: MapViewElements;
    private readonly demo: boolean;
    private readonly camera = new Camera();
    private readonly following = new PlayerFollowing(this.camera);
    private readonly aircraftMapOverview = new AircraftMapOverview();
    private groundOverview = false;
    private readonly controls = new AbortController();
    private readonly renderer: CanvasRenderer;
    private readonly resizeObserver: ResizeObserver;
    private readonly detachInput: () => void;
    private state: MapViewState<HTMLImageElement> | null = null;
    private frame: number | null = null;
    private lastFrame = 0;
    private ratio = 1;
    private overlay: PositionOverlay | null = null;
    private readonly onGuidanceChange: ((enabled: boolean) => void) | undefined;
    private readonly mapName: (id: string) => string;

    constructor(elements: MapViewElements, {demo = false, onClick, onLongPress, spawnGuidance = true, onGuidanceChange, mapName = id => id}: {
        demo?: boolean; onClick?: (point: Point) => void; onLongPress?: (point: Point) => void;
        spawnGuidance?: boolean; onGuidanceChange?: (enabled: boolean) => void;
        mapName?: (id: string) => string;
    } = {}) {
        this.elements = elements;
        this.demo = demo;
        this.onGuidanceChange = onGuidanceChange;
        this.mapName = mapName;
        elements.spawnGuidance.checked = spawnGuidance;
        this.renderer = new CanvasRenderer(elements.canvas, this.camera);
        this.detachInput = attachMapInput(elements.canvas, this.camera, {
            onPan: () => this.following.pause(),
            onZoom: () => this.following.rememberZoom(),
            onClick: point => onClick?.(this.camera.screenToMap(point)),
            onLongPress: point => { this.following.pause(); onLongPress?.(this.camera.screenToMap(point)); }
        });
        this.attachControls();
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(elements.viewport);
        this.resize();
    }

    setAdaptiveAircraftZoom(enabled: boolean): void {
        this.following.setAdaptiveAircraftZoom(enabled);
        this.updateControls();
    }

    setShowPreparationRoutes(enabled: boolean): void { this.renderer.setShowPreparationRoutes(enabled); }

    setOverlay(overlay: PositionOverlay): void { this.overlay = overlay; }

    pauseFollowing(): void { this.following.pause(); }

    centerPoint(): Point {
        return this.camera.screenToMap({x: this.elements.canvas.clientWidth / 2, y: this.elements.canvas.clientHeight / 2});
    }

    hitPosition(point: Point): TacticalPosition | null {
        const screen = this.camera.mapToScreen(point);
        let closest: TacticalPosition | null = null;
        let limit = 22;
        for (const position of this.overlay?.positions ?? this.state?.positions ?? []) {
            const candidate = this.camera.mapToScreen(position.point);
            const distance = Math.hypot(candidate.x - screen.x, candidate.y - screen.y);
            if (distance < limit) { closest = position; limit = distance; }
        }
        return closest;
    }

    setState(state: MapViewState<HTMLImageElement>): void {
        const player = state.objects.find(object => object.kind === 'point' && object.icon === 'Player');
        const groundOverview = this.aircraftMapOverview.update(state.info, player?.kind === 'point' ? player.vehicleClass : undefined);
        if (!isSameMap(state.info, this.state?.info) || groundOverview !== this.groundOverview) {
            const frame = mapGridFrame(state.info?.geometry);
            this.camera.frame(frame.center, frame.scale);
            this.following.reset();
            this.renderer.resetPlayer();
            if (groundOverview) this.following.pause();
        }
        this.groundOverview = groundOverview;
        this.following.setPlayer(player?.kind === 'point' ? player.position : null, player?.kind === 'point' ? player.vehicleClass : undefined);
        this.state = state;
        this.updateGuidance();
        this.elements.connectionStatus.textContent = this.connectionLabel(state);
        this.elements.mapStatus.textContent = this.mapLabel(state);
        const sideLabels = {upper: 'Верхний респ', lower: 'Нижний респ', unknown: 'Сторона не определена'};
        this.elements.playerSide.textContent = sideLabels[state.playerSide];
        const modes = {domination: 'Превосходство', conquest: 'Захват', battle: 'Сражение', unknown: 'Режим не определён'};
        const mode = state.battleMode;
        this.elements.battleMode.textContent = `${modes[mode.kind]}${mode.variantId ? ` · вариант ${mode.variantId.split('-')[1]}` : ''}`;
        this.elements.battleMode.title = mode.variantId ? mode.variantId : mode.candidates.length > 1
            ? `Несколько вариантов с одинаковой сеткой: ${mode.candidates.join(', ')}`
            : 'Базовый режим определяется по точкам захвата. Для номера варианта нужны название карты и совпадение сетки.';
        this.updateControls();
    }

    private attachControls(): void {
        const {signal} = this.controls;
        this.elements.spawnGuidance.addEventListener('change', () => {
            this.onGuidanceChange?.(this.elements.spawnGuidance.checked);
            this.updateGuidance();
        }, {signal});
        const resizeMarkers = (): void => {
            const size = this.elements.markerSize.valueAsNumber;
            this.renderer.setMarkerSize(size);
            this.elements.markerSizeValue.textContent = `${size} px`;
        };
        this.elements.markerSize.addEventListener('input', resizeMarkers, {signal});
        resizeMarkers();
        const zoom = (factor: number): void => {
            this.camera.zoomBy(factor);
            this.following.rememberZoom();
            this.updateControls();
        };
        this.elements.zoomIn.addEventListener('click', () => zoom(1.4), {signal});
        this.elements.zoomOut.addEventListener('click', () => zoom(1 / 1.4), {signal});
        this.elements.overview.addEventListener('click', () => {
            this.following.pause();
            const frame = mapGridFrame(this.state?.info?.geometry);
            this.camera.frame(frame.center, frame.scale);
            this.updateControls();
        }, {signal});
        this.elements.follow.addEventListener('click', () => {
            this.following.start();
            this.updateControls();
        }, {signal});
    }

    private updateGuidance(): void {
        const guidance = this.state ? airGroundGuidance(this.state.objects, this.state.info?.geometry ?? null) : null;
        this.following.setGroundSpawnContext(guidance?.targets[0]?.distanceMeters ?? null, this.state?.info?.geometry ?? null);
        this.renderer.setAirGroundGuidance(this.elements.spawnGuidance.checked ? guidance : null);
        const info = this.elements.spawnGuidanceInfo;
        info.hidden = !guidance || !this.elements.spawnGuidance.checked;
        const target = guidance?.targets[0];
        const label = target ? spawnGuidanceLabel(target) : 'Вражеские танковые спавны не видны';
        if (info.textContent !== label) info.textContent = label;
    }

    private updateControls(): void {
        const {zoomIn, zoomOut, overview, follow, zoomLevel, cameraMode} = this.elements;
        const ready = this.state?.image !== null && this.state?.image !== undefined;
        zoomIn.disabled = !ready || this.camera.scale >= 14.99;
        zoomOut.disabled = !ready || this.camera.scale <= 1.001;
        overview.disabled = !ready;
        follow.disabled = this.groundOverview || !this.following.hasPlayer || !ready;
        follow.setAttribute('aria-pressed', String(this.following.isEnabled));
        const level = `${this.camera.scale.toFixed(1)}×`;
        if (zoomLevel.textContent !== level) zoomLevel.textContent = level;
        const label = this.groundOverview ? 'Обзор танковой карты' : this.following.isEnabled
            ? (this.following.hasPlayer ? (this.following.isPlayerOutsideMap ? 'Игрок вне области карты' : this.following.isAdaptiveZoomActive ? 'Следование · автомасштаб' : 'Следование за игроком') : 'Ожидание игрока')
            : 'Свободный обзор';
        if (cameraMode.textContent !== label) cameraMode.textContent = label;
    }

    private connectionLabel(state: MapViewState<HTMLImageElement>): string {
        if (this.demo) return 'Демо · синтетические данные';
        switch (state.connection) {
            case 'connecting': return 'Подключение к игре…';
            case 'connected': return 'Игра подключена';
            case 'waiting': return 'Игра подключена · ожидание карты боя';
            case 'offline': return `Ошибка подключения: ${state.connectionError ?? 'нет ответа'} · повторная попытка…`;
        }
    }

    private mapLabel(state: MapViewState<HTMLImageElement>): string {
        const map = this.demo ? 'Учебная карта' : state.mapId?.startsWith('custom-') ? 'Неизвестная карта' : state.mapId ? this.mapName(state.mapId) : null;
        switch (state.mapStatus) {
            case 'idle': return state.connection === 'waiting' ? 'Игровой API пока не предоставляет данные карты' : '';
            case 'loading': return 'Загрузка карты…';
            case 'identifying': return 'Распознавание карты…';
            case 'positions-loading': return `${map} · загрузка позиций…`;
            case 'ready': return `${map} · позиций: ${state.positions.length}`;
            case 'no-positions': return `${map} · для этой карты нет набора позиций`;
            case 'unknown': return 'Неизвестная карта · игровые объекты доступны';
            case 'error': return state.mapError ?? 'Не удалось загрузить карту';
        }
    }

    private resize(): void {
        const viewport = this.elements.viewport.getBoundingClientRect();
        const size = Math.max(1, Math.floor(Math.min(viewport.width, viewport.height)));
        this.elements.root.style.width = `${size}px`;
        this.elements.root.style.height = `${size}px`;
        const {width, height} = this.elements.canvas.getBoundingClientRect();
        this.ratio = window.devicePixelRatio || 1;
        this.renderer.resize(Math.max(1, width), Math.max(1, height), this.ratio);
    }

    start(): void {
        if (this.frame !== null) return;
        this.lastFrame = performance.now();
        const render = (time: number): void => {
            if (this.ratio !== window.devicePixelRatio) this.resize();
            const dt = Math.min((time - this.lastFrame) / 1000, 0.1);
            this.lastFrame = time;
            if (this.state?.image) this.following.update(dt);
            this.updateControls();
            if (this.state) this.renderer.render(this.state, dt, time / 1000, this.overlay);
            this.frame = requestAnimationFrame(render);
        };
        this.frame = requestAnimationFrame(render);
    }

    stop(): void {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
    }

    destroy(): void {
        this.stop();
        this.resizeObserver.disconnect();
        this.detachInput();
        this.controls.abort();
    }
}
