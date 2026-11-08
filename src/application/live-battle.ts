import type {BattleObject, MapInfo} from '../domain/battle.ts';
import {isSameMap} from '../domain/map-identity.ts';
import type {TelemetryGateway} from './ports.ts';
import {asError} from './errors.ts';

export interface LiveBattleOptions {
    readonly gateway: TelemetryGateway;
    readonly onInfo: (info: MapInfo) => void;
    readonly onObjects: (objects: readonly BattleObject[]) => void;
    readonly onConnection: (connected: boolean, error?: Error) => void;
    readonly onWaiting: () => void;
    readonly interval?: number;
}

export class LiveBattle {
    private readonly options: LiveBattleOptions;
    private controller: AbortController | null = null;
    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor(options: LiveBattleOptions) {
        this.options = options;
    }

    start(): void {
        if (this.controller) return;
        this.controller = new AbortController();
        void this.poll(this.controller);
    }

    private async poll(controller: AbortController): Promise<void> {
        const active = (): boolean => this.controller === controller && !controller.signal.aborted;
        try {
            const map = await this.options.gateway.readMap(controller.signal);
            if (!active()) return;
            if (map.kind === 'waiting') {
                this.options.onConnection(true);
                this.options.onWaiting();
                return;
            }
            this.options.onInfo(map.info);
            const objects = await this.options.gateway.readObjects(controller.signal);
            if (!active()) return;
            // Discard objects obtained while the battle was changing.
            const latest = await this.options.gateway.readMap(controller.signal);
            if (!active()) return;
            if (latest.kind === 'waiting') {
                this.options.onConnection(true);
                this.options.onWaiting();
                return;
            }
            if (!isSameMap(latest.info, map.info)) {
                this.options.onInfo(latest.info);
                return;
            }
            this.options.onObjects(objects);
            this.options.onConnection(true);
        } catch (value: unknown) {
            if (active()) this.options.onConnection(false, asError(value));
        } finally {
            if (active()) this.timer = setTimeout(() => void this.poll(controller), this.options.interval ?? 500);
        }
    }

    stop(): void {
        this.controller?.abort();
        this.controller = null;
        clearTimeout(this.timer);
    }
}
