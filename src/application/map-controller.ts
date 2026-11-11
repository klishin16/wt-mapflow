import {determineBattleMode} from '../domain/battle-mode.ts';
import type {BattleModeDetection} from '../domain/battle-mode.ts';
import type {BattleModeCatalog} from './ports.ts';
import type {BattleObject, MapInfo} from '../domain/battle.ts';
import {isSameMap, mapVariantId} from '../domain/map-identity.ts';
import {groupTankSpawns} from '../domain/spawn-bases.ts';
import {determinePlayerSide} from '../domain/player-side.ts';
import type {PlayerSide} from '../domain/player-side.ts';
import type {TacticalPosition} from '../domain/position.ts';
import type {MapImageUrl, TelemetryGateway} from './ports.ts';
import {LiveBattle} from './live-battle.ts';
import {MapSession} from './map-session.ts';
import type {MapSessionOptions, MapStatus} from './map-session.ts';

export interface MapViewState<Image> {
    readonly info: MapInfo | null;
    readonly image: Image | null;
    readonly mapId: string | null;
    readonly objects: readonly BattleObject[];
    readonly positions: readonly TacticalPosition[];
    readonly connection: 'connecting' | 'connected' | 'waiting' | 'offline';
    readonly mapStatus: MapStatus;
    readonly battleStarted: boolean;
    readonly objectsReady: boolean;
    readonly playerSide: PlayerSide;
    readonly battleMode: BattleModeDetection;
    readonly connectionError?: string;
    readonly mapError?: string;
    readonly positionWarning?: string;
}

interface MapControllerOptions<Image> extends Omit<MapSessionOptions<Image>, 'onChange'> {
    readonly gateway: TelemetryGateway;
    readonly imageUrl: MapImageUrl;
    readonly onChange: (state: MapViewState<Image>) => void;
    readonly interval?: number;
    readonly battleModes?: BattleModeCatalog;
}

export class MapController<Image> {
    private readonly session: MapSession<Image>;
    private readonly live: LiveBattle;
    private readonly options: MapControllerOptions<Image>;
    private positionRevision = 0;
    private battleGeneration: number | null = null;
    private battleStarted = false;
    private opening: Promise<void> = Promise.resolve();
    private state: MapViewState<Image> = {
        info: null, image: null, mapId: null, objects: [], positions: [],
        connection: 'connecting', mapStatus: 'idle', battleStarted: false, objectsReady: false, playerSide: 'unknown', battleMode: {kind: 'unknown', candidates: []}
    };

    constructor(options: MapControllerOptions<Image>) {
        this.options = options;
        this.session = new MapSession({
            ...options,
            onChange: session => this.publish({
                image: session.image, mapId: session.mapId, positions: this.forCurrentVariant(session.positions),
                mapStatus: session.status, mapError: session.error, positionWarning: session.warning
            })
        });
        this.live = new LiveBattle({
            gateway: options.gateway,
            interval: options.interval,
            onInfo: info => this.receiveInfo(info),
            onObjects: objects => {
                this.battleStarted ||= objects.some(object => object.kind === 'point' && object.icon === 'Player');
                const grouped = groupTankSpawns(objects, this.state.info?.geometry ?? null);
                this.publish({
                    objects: grouped, playerSide: determinePlayerSide(grouped),
                    battleStarted: this.battleStarted, objectsReady: true
                });
            },
            onConnection: (connected, error) => this.publish({
                connection: connected ? 'connected' : 'offline',
                connectionError: error?.message,
                ...(!connected ? {objects: [], objectsReady: false, playerSide: 'unknown', battleMode: {kind: 'unknown', candidates: []} as const} : {})
            }),
            onWaiting: () => {
                this.positionRevision++;
                this.session.close();
                this.publish({
                    connection: 'waiting', info: null, image: null, mapId: null,
                    objects: [], positions: [], mapStatus: 'idle', mapError: undefined, objectsReady: false, playerSide: 'unknown', battleMode: {kind: 'unknown', candidates: []} as const
                });
            }
        });
    }

    private forCurrentVariant(positions: readonly TacticalPosition[]): readonly TacticalPosition[] {
        const info = this.state.info;
        if (!info) return [];
        const variant = mapVariantId(info);
        return positions.filter(position => !position.variantId || position.variantId === variant);
    }

    async refreshPositions(): Promise<void> {
        // Import may finish while the initial built-in dataset is still loading.
        // Wait for that session, then read a fresh merged snapshot.
        let opening: Promise<void>;
        do {
            opening = this.opening;
            await opening;
        } while (opening !== this.opening);
        const {mapId, info} = this.state;
        if (!mapId || !info) return;
        const revision = ++this.positionRevision;
        const result = await this.options.positions.list(mapId);
        if (revision !== this.positionRevision || this.state.mapId !== mapId || !isSameMap(info, this.state.info)) return;
        const positions = this.forCurrentVariant(result.positions);
        this.publish({positions, positionWarning: result.warning, mapStatus: positions.length ? 'ready' : 'no-positions'});
    }

    private publish(changes: Partial<MapViewState<Image>>): void {
        const next = {...this.state, ...changes};
        this.state = {
            ...next,
            battleMode: determineBattleMode(next.objects, next.info?.geometry ?? null, this.options.battleModes?.variants(next.mapId) ?? [])
        };
        this.options.onChange(this.state);
    }

    private receiveInfo(info: MapInfo): void {
        if (this.battleGeneration !== info.generation) {
            this.battleGeneration = info.generation;
            this.battleStarted = false;
        }
        const changed = !isSameMap(this.state.info, info);
        if (changed) this.positionRevision++;
        this.publish({info, battleStarted: this.battleStarted, ...(changed ? {
            objects: [], positions: [], image: null, mapId: null, mapStatus: 'loading' as const, mapError: undefined, objectsReady: false, playerSide: 'unknown', battleMode: {kind: 'unknown', candidates: []} as const
        } : {})});
        if (changed || this.state.mapStatus === 'error') {
            this.opening = this.session.open(info.generation, this.options.imageUrl(info));
        }
    }

    async reloadMap(): Promise<void> {
        const {info} = this.state;
        if (!info) return;
        this.positionRevision++;
        this.opening = this.session.open(info.generation, this.options.imageUrl(info));
        await this.opening;
    }

    start(): void {
        this.options.onChange(this.state);
        this.live.start();
    }

    stop(): void {
        this.positionRevision++;
        this.live.stop();
        this.session.close();
        // A resumed page must reopen a session that was cancelled while loading.
        this.state = {
            info: null, image: null, mapId: null, objects: [], positions: [],
            connection: 'connecting', mapStatus: 'idle', battleStarted: this.battleStarted, objectsReady: false, playerSide: 'unknown', battleMode: {kind: 'unknown', candidates: []}
        };
    }
}
