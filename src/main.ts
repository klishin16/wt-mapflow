import './style.css';
import {MapController} from './application/map-controller.ts';
import {BrowserImageSource} from './infrastructure/maps/browser-image-source.ts';
import {BrowserMapRecognizer, mapNames} from './infrastructure/maps/recognize-map.ts';
import type {MapRecognition} from './domain/map-recognition.ts';
import {MapRecognitionPanel} from './presentation/map-recognition-panel.ts';
import {StaticPositionRepository} from './infrastructure/positions/static-position-repository.ts';
import {HttpTelemetryGateway} from './infrastructure/telemetry/http-telemetry-gateway.ts';
import {DemoGateway, demoPositions} from './infrastructure/demo/demo-gateway.ts';
import demoMapUrl from './infrastructure/demo/map.svg?url';
import {MapView} from './presentation/map-view.ts';
import {SettingsMenu} from './presentation/settings-menu.ts';
import {element} from './presentation/dom.ts';
import {PositionWorkspace} from './presentation/position-workspace.ts';
import {MergedPositionRepository} from './application/merged-position-repository.ts';
import {PositionService} from './application/position-service.ts';
import {IndexedDbPositionStore} from './infrastructure/positions/indexeddb-position-store.ts';
import {BrowserScreenshots} from './infrastructure/positions/browser-screenshots.ts';
import {JsonPositionBackup} from './infrastructure/positions/json-position-backup.ts';
import {RatlineMapImporter} from './infrastructure/positions/ratline-map-importer.ts';
import {RatlinePositionRepository} from './infrastructure/positions/ratline-position-repository.ts';
import {RatlineCache} from './infrastructure/positions/ratline-cache.ts';
import type {MapViewState} from './application/map-controller.ts';
import {BrowserMapSettings} from './infrastructure/browser-map-settings.ts';

const demo = new URLSearchParams(window.location.search).get('demo') === '1';
const aircraftDemo = demo && new URLSearchParams(window.location.search).get('vehicle') === 'aircraft';
const settings = new BrowserMapSettings();
const settingsMenu = new SettingsMenu();
let workspace: PositionWorkspace;
let recognitionPanel: MapRecognitionPanel;
const recognizer = new BrowserMapRecognizer();
const recognitionReports = new WeakMap<HTMLImageElement, MapRecognition>();
let lastState: MapViewState<HTMLImageElement> | null = null;
let showRatline = settings.showRatline();
const ratlineToggle = element('show-ratline', HTMLInputElement);
ratlineToggle.checked = showRatline;
function render(state: MapViewState<HTMLImageElement>): void {
    lastState = state;
    const visible = showRatline ? state : {...state, positions: state.positions.filter(position => position.source?.provider !== 'ratline')};
    view.setState(visible);
    workspace.setState(visible);
    recognitionPanel.setState(state, state.image ? recognitionReports.get(state.image) ?? null : null);
}
ratlineToggle.addEventListener('change', () => {
    showRatline = ratlineToggle.checked;
    settings.setShowRatline(showRatline);
    if (lastState) render(lastState);
});
const view = new MapView({
    viewport: element('map-viewport', HTMLElement),
    root: element('map-root', HTMLElement),
    canvas: element('map-canvas', HTMLCanvasElement),
    connectionStatus: element('connection-status', HTMLElement),
    mapStatus: element('map-status', HTMLElement),
    zoomIn: element('zoom-in', HTMLButtonElement),
    zoomOut: element('zoom-out', HTMLButtonElement),
    overview: element('map-overview', HTMLButtonElement),
    follow: element('follow-player', HTMLButtonElement),
    zoomLevel: element('zoom-level', HTMLOutputElement),
    cameraMode: element('camera-mode', HTMLElement),
    markerSize: element('marker-size', HTMLInputElement),
    markerSizeValue: element('marker-size-value', HTMLOutputElement),
    spawnGuidance: element('enemy-spawn-guidance', HTMLInputElement),
    spawnGuidanceInfo: element('spawn-guidance-info', HTMLElement)
}, {
    demo, onClick: point => workspace.click(point), onLongPress: point => workspace.create(point),
    spawnGuidance: settings.enemyTankSpawnGuidance(),
    onGuidanceChange: enabled => settings.setEnemyTankSpawnGuidance(enabled)
});

const store = new IndexedDbPositionStore();
const screenshots = new BrowserScreenshots();
const positionService = new PositionService({
    store, screenshots, backup: new JsonPositionBackup(screenshots),
    ratline: new RatlineMapImporter(new BrowserImageSource({crossOrigin: false})),
    createId: () => crypto.randomUUID(), now: () => new Date().toISOString()
});
const ratlinePositions = demo ? null : new RatlinePositionRepository({
    fallback: new StaticPositionRepository(new BrowserImageSource({crossOrigin: false})),
    cache: new RatlineCache()
});

const basePositions = ratlinePositions ?? demoPositions;

// Composition root: concrete browser/HTTP adapters are wired only here.
const controller = new MapController<HTMLImageElement>({
    gateway: demo ? new DemoGateway({aircraft: aircraftDemo}) : new HttpTelemetryGateway(),
    imageSource: new BrowserImageSource({cacheBust: !demo}),
    identify: demo ? async () => 'demo' : async image => {
        const report = await recognizer.recognize(image);
        recognitionReports.set(image, report);
        console.info('Распознавание карты', report);
        return report.mapId;
    },
    positions: new MergedPositionRepository(basePositions, store),
    imageUrl: demo ? () => demoMapUrl : info => `/telemetry/map.img?gen=${info.generation}`,
    onChange: render
});

workspace = new PositionWorkspace({service: positionService, view, refresh: () => controller.refreshPositions()});

recognitionPanel = new MapRecognitionPanel({
    names: mapNames,
    onBind: async mapId => {
        const image = lastState?.image;
        const report = image ? recognitionReports.get(image) : null;
        if (!report) throw new Error('Дождись распознавания карты');
        const persistent = recognizer.bind(report.imageHash, mapId);
        await controller.reloadMap();
        return persistent;
    }
});

view.start();
controller.start();

const lifecycle = new AbortController();
window.addEventListener('pagehide', () => {
    controller.stop();
    view.stop();
}, {signal: lifecycle.signal});
window.addEventListener('pageshow', event => {
    if (event.persisted) {
        view.start();
        controller.start();
    }
}, {signal: lifecycle.signal});

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        lifecycle.abort();
        controller.stop();
        workspace.destroy();
        settingsMenu.destroy();
        recognitionPanel.destroy();
        view.destroy();
    });
}
