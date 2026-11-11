import './style.css';
import {MapController} from './application/map-controller.ts';
import {BrowserImageSource} from './infrastructure/maps/browser-image-source.ts';
import {BrowserMapRecognizer} from './infrastructure/maps/recognize-map.ts';
import {BrowserMapCatalog} from './infrastructure/maps/browser-map-catalog.ts';
import type {MapRecognition} from './domain/map-recognition.ts';
import {MapRecognitionPanel} from './presentation/map-recognition-panel.ts';
import {StaticPositionRepository} from './infrastructure/positions/static-position-repository.ts';
import {HttpTelemetryGateway} from './infrastructure/telemetry/http-telemetry-gateway.ts';
import {DemoGateway, demoPositions} from './infrastructure/demo/demo-gateway.ts';
import demoMapUrl from './infrastructure/demo/map.svg?url';
import {MapView} from './presentation/map-view.ts';
import {SettingsMenu} from './presentation/settings-menu.ts';
import {appliesToPlayerSpawns} from './domain/position-visibility.ts';
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
const lifecycle = new AbortController();
const settingsMenu = new SettingsMenu();
let workspace: PositionWorkspace;
let recognitionPanel: MapRecognitionPanel;
const mapCatalog = new BrowserMapCatalog();
const recognizer = new BrowserMapRecognizer(mapCatalog);
const recognitionReports = new WeakMap<HTMLImageElement, MapRecognition>();
let lastState: MapViewState<HTMLImageElement> | null = null;
let showRatline = settings.showRatline();
let onlyOwnSpawnPositions = settings.onlyOwnSpawnPositions();
const ownSpawnToggle = element('only-own-spawn-positions', HTMLInputElement);
ownSpawnToggle.checked = onlyOwnSpawnPositions;
let showAirfieldAirDefence = settings.showAirfieldAirDefence();
const airfieldAirDefenceToggle = element('show-airfield-air-defence', HTMLInputElement);
airfieldAirDefenceToggle.checked = showAirfieldAirDefence;
const adaptiveAircraftZoomToggle = element('adaptive-aircraft-zoom', HTMLInputElement);
adaptiveAircraftZoomToggle.checked = settings.adaptiveAircraftZoom();
const preparationRoutesToggle = element('show-preparation-routes', HTMLInputElement);
preparationRoutesToggle.checked = settings.showPreparationRoutes();
const ratlineToggle = element('show-ratline', HTMLInputElement);
ratlineToggle.checked = showRatline;
function render(state: MapViewState<HTMLImageElement>): void {
    lastState = state;
    const visible = {
        ...state,
        positions: state.positions.filter(position =>
            (showRatline || position.source?.provider !== 'ratline') &&
            (!onlyOwnSpawnPositions || appliesToPlayerSpawns(position, state.objects, state.info?.geometry ?? null))),
        // Airdefence is the static map symbol; mobile SPAA/SAM keep their vehicle markers.
        objects: showAirfieldAirDefence ? state.objects : state.objects.filter(object =>
            object.kind !== 'point' || object.icon !== 'Airdefence' || object.vehicleClass === 'anti-air')
    };
    view.setState(visible);
    workspace.setState(visible);
    recognitionPanel.setState(state, state.image ? recognitionReports.get(state.image) ?? null : null);
}
ownSpawnToggle.addEventListener('change', () => {
    onlyOwnSpawnPositions = ownSpawnToggle.checked;
    settings.setOnlyOwnSpawnPositions(onlyOwnSpawnPositions);
    if (lastState) render(lastState);
}, {signal: lifecycle.signal});
ratlineToggle.addEventListener('change', () => {
    showRatline = ratlineToggle.checked;
    settings.setShowRatline(showRatline);
    if (lastState) render(lastState);
}, {signal: lifecycle.signal});
airfieldAirDefenceToggle.addEventListener('change', () => {
    showAirfieldAirDefence = airfieldAirDefenceToggle.checked;
    settings.setShowAirfieldAirDefence(showAirfieldAirDefence);
    if (lastState) render(lastState);
}, {signal: lifecycle.signal});
const view = new MapView({
    viewport: element('map-viewport', HTMLElement),
    root: element('map-root', HTMLElement),
    canvas: element('map-canvas', HTMLCanvasElement),
    connectionStatus: element('connection-status', HTMLElement),
    mapStatus: element('map-status', HTMLElement),
    playerSide: element('player-side', HTMLElement),
    battleMode: element('battle-mode', HTMLElement),
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
    mapName: id => mapCatalog.find(id)?.name ?? id,
    onGuidanceChange: enabled => settings.setEnemyTankSpawnGuidance(enabled)
});

view.setAdaptiveAircraftZoom(adaptiveAircraftZoomToggle.checked);
adaptiveAircraftZoomToggle.addEventListener('change', () => {
    settings.setAdaptiveAircraftZoom(adaptiveAircraftZoomToggle.checked);
    view.setAdaptiveAircraftZoom(adaptiveAircraftZoomToggle.checked);
}, {signal: lifecycle.signal});
view.setShowPreparationRoutes(preparationRoutesToggle.checked);
preparationRoutesToggle.addEventListener('change', () => {
    settings.setShowPreparationRoutes(preparationRoutesToggle.checked);
    view.setShowPreparationRoutes(preparationRoutesToggle.checked);
}, {signal: lifecycle.signal});

const store = new IndexedDbPositionStore();
const screenshots = new BrowserScreenshots();
const positionService = new PositionService({
    store, screenshots, backup: new JsonPositionBackup(screenshots),
    ratline: new RatlineMapImporter(new BrowserImageSource({crossOrigin: false}), mapCatalog),
    createId: () => crypto.randomUUID(), now: () => new Date().toISOString()
});
const ratlinePositions = demo ? null : new RatlinePositionRepository({
    fallback: new StaticPositionRepository(new BrowserImageSource({crossOrigin: false}), mapCatalog),
    cache: new RatlineCache()
});

const basePositions = ratlinePositions ?? demoPositions;

// Composition root: concrete browser/HTTP adapters are wired only here.
const controller = new MapController<HTMLImageElement>({
    gateway: demo ? new DemoGateway({aircraft: aircraftDemo}) : new HttpTelemetryGateway(),
    battleModes: mapCatalog,
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

let catalogReload: Promise<void> | null = null;
const unsubscribeCatalog = mapCatalog.subscribe(() => {
    catalogReload = controller.reloadMap();
    void catalogReload.catch(error => console.error('Не удалось обновить карту после изменения каталога', error));
});

recognitionPanel = new MapRecognitionPanel({
    get maps() { return mapCatalog.list(); },
    onBind: async mapId => {
        const image = lastState?.image;
        const report = image ? recognitionReports.get(image) : null;
        if (!report) throw new Error('Дождись распознавания карты');
        mapCatalog.bindHash(report.imageHash, mapId);
        await catalogReload;
        return true;
    }
});

view.start();
controller.start();

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
        unsubscribeCatalog();
        mapCatalog.destroy();
        view.destroy();
    });
}
