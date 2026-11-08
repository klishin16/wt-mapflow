import type {BattleObject, MapInfo} from '../domain/battle.ts';
import {isSameMap, mapVariantId} from '../domain/map-identity.ts';
import {groupTankSpawns} from '../domain/spawn-bases.ts';
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
    readonly connectionError?: string;
    readonly mapError?: string;
    readonly positionWarning?: string;
}

interface MapControllerOptions<Image> extends Omit<MapSessionOptions<Image>, 'onChange'> {
    readonly gateway: TelemetryGateway;
    readonly imageUrl: MapImageUrl;
    readonly onChange: (state: MapViewState<Image>) => void;
    readonly interval?: number;
}

export class MapController<Image> {
    private readonly session: MapSession<Image>;
    private readonly live: LiveBattle;
    private readonly options: MapControllerOptions<Image>;
    private positionRevision = 0;
    private opening: Promise<void> = Promise.resolve();
    private state: MapViewState<Image> = {
        info: null, image: null, mapId: null, objects: [], positions: [],
        connection: 'connecting', mapStatus: 'idle'
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
            onObjects: objects => this.publish({objects: groupTankSpawns(objects, this.state.info?.geometry ?? null)}),
            onConnection: (connected, error) => this.publish({
                connection: connected ? 'connected' : 'offline',
                connectionError: error?.message,
                ...(!connected ? {objects: []} : {})
            }),
            onWaiting: () => {
                this.positionRevision++;
                this.session.close();
                this.publish({
                    connection: 'waiting', info: null, image: null, mapId: null,
                    objects: [], positions: [], mapStatus: 'idle', mapError: undefined
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
        this.state = {...this.state, ...changes};
        this.options.onChange(this.state);
    }

    private receiveInfo(info: MapInfo): void {
        const changed = !isSameMap(this.state.info, info);
        if (changed) this.positionRevision++;
        this.publish({info, ...(changed ? {
            objects: [], positions: [], image: null, mapId: null, mapStatus: 'loading' as const, mapError: undefined
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
            connection: 'connecting', mapStatus: 'idle'
        };
    }
}
