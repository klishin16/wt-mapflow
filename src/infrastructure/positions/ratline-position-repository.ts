import type {LoadOptions, PositionRepository, PositionSet} from '../../application/ports.ts';
import {throwIfAborted} from '../../application/errors.ts';
import {RatlineCache} from './ratline-cache.ts';

interface Options {
    readonly fallback: PositionRepository;
    readonly cache: RatlineCache;
}

// Preserve previously downloaded snapshots. Network updates are intentionally absent.
export class RatlinePositionRepository implements PositionRepository {
    private readonly options: Options;
    constructor(options: Options) { this.options = options; }

    async list(mapId: string, {signal}: LoadOptions = {}): Promise<PositionSet> {
        throwIfAborted(signal);
        const snapshot = await this.options.cache.read(mapId).catch(() => null);
        throwIfAborted(signal);
        if (snapshot) return {positions: snapshot.positions, missing: snapshot.positions.length === 0};
        return this.options.fallback.list(mapId, {signal});
    }
}
