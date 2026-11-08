import type {TacticalPosition} from '../domain/position.ts';
import type {MapImageSource, MapRecognizer, PositionRepository} from './ports.ts';
import {asError} from './errors.ts';

export type MapStatus = 'idle' | 'loading' | 'identifying' | 'positions-loading' | 'unknown' | 'ready' | 'no-positions' | 'error';

export interface MapSessionState<Image> {
    readonly generation: number;
    readonly image: Image | null;
    readonly mapId: string | null;
    readonly positions: readonly TacticalPosition[];
    readonly status: MapStatus;
    readonly error?: string;
    readonly warning?: string;
}

export interface MapSessionOptions<Image> {
    readonly imageSource: MapImageSource<Image>;
    readonly identify: MapRecognizer<Image>;
    readonly positions: PositionRepository;
    readonly onChange: (state: MapSessionState<Image>) => void;
}

export class MapSession<Image> {
    private version = 0;
    private controller: AbortController | null = null;
    private readonly options: MapSessionOptions<Image>;

    constructor(options: MapSessionOptions<Image>) {
        this.options = options;
    }

    async open(generation: number, url: string): Promise<void> {
        const version = ++this.version;
        this.controller?.abort();
        this.controller = new AbortController();
        const {signal} = this.controller;
        let state: MapSessionState<Image> = {generation, image: null, mapId: null, positions: [], status: 'loading'};
        const publish = (changes: Partial<MapSessionState<Image>>): boolean => {
            if (version !== this.version) return false;
            state = {...state, ...changes};
            this.options.onChange(state);
            return true;
        };
        publish({});
        try {
            const image = await this.options.imageSource.load(url, {signal});
            if (!publish({image, status: 'identifying'})) return;
            const mapId = await this.options.identify(image);
            if (version !== this.version) return;
            if (!mapId) {
                publish({status: 'unknown'});
                return;
            }
            publish({mapId, status: 'positions-loading'});
            const result = await this.options.positions.list(mapId, {signal});
            publish({positions: result.positions, status: result.missing ? 'no-positions' : 'ready', warning: result.warning});
        } catch (value: unknown) {
            const error = asError(value);
            if (error.name !== 'AbortError') publish({status: 'error', error: error.message});
        }
    }

    close(): void {
        this.version++;
        this.controller?.abort();
    }
}
