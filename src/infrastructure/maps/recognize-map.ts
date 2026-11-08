import {ahash} from './ahash/ahash.ts';
import {maps} from './catalog.ts';
import type {MapHashSample, MapRecognition} from '../../domain/map-recognition.ts';
import {recognizeMapHashes} from '../../domain/map-recognition.ts';
import {isRecord} from '../records.ts';
import {validMapName} from './map-name.ts';

const bindingKey = 'wt-rat.map-bindings.v1';
export const mapNames = [...new Set(Object.values(maps).flatMap(map => map ? [map.name] : []))].sort();
const references = Object.entries(maps).flatMap(([hash, map]) => map ? [{hash, mapId: map.name}] : []);

export class BrowserMapRecognizer {
    private readonly fingerprints = new WeakMap<HTMLImageElement, Promise<readonly MapHashSample[]>>();
    private readonly bindings = new Map<string, string>();

    constructor() {
        try {
            const value: unknown = JSON.parse(localStorage.getItem(bindingKey) ?? '{}');
            if (isRecord(value)) for (const [hash, name] of Object.entries(value)) {
                if (/^[a-f0-9]{16}$/.test(hash) && typeof name === 'string' && validMapName(name)) this.bindings.set(hash, name);
            }
        } catch { /* Bindings still work for this session if storage is unavailable. */ }
    }

    async recognize(image: HTMLImageElement): Promise<MapRecognition> {
        let fingerprint = this.fingerprints.get(image);
        if (!fingerprint) {
            fingerprint = this.hashes(image);
            this.fingerprints.set(image, fingerprint);
            void fingerprint.catch(() => this.fingerprints.delete(image));
        }
        const samples = await fingerprint;
        // Preserve custom-* IDs, so pre-existing personal positions remain accessible.
        const imageHash = samples[0].hash;
        return recognizeMapHashes(imageHash, samples, references, this.bindings.get(imageHash));
    }

    bind(hash: string, mapId: string | null): boolean {
        if (!/^[a-f0-9]{16}$/.test(hash) || (mapId !== null && !validMapName(mapId))) throw new Error('Некорректное название карты');
        if (mapId === null) this.bindings.delete(hash);
        else this.bindings.set(hash, mapId);
        try { localStorage.setItem(bindingKey, JSON.stringify(Object.fromEntries(this.bindings))); return true; }
        catch { return false; }
    }

    private async hashes(image: HTMLImageElement): Promise<readonly MapHashSample[]> {
        const legacy = await ahash(image);
        const grayscaleFirst = await ahash(image, 8, true);
        return [
            {format: 'legacy / LSB', hash: legacy.toHexString()},
            {format: 'legacy / MSB', hash: legacy.toHexStringReversed()},
            {format: 'grayscale first / MSB', hash: grayscaleFirst.toHexStringReversed()},
            {format: 'grayscale first / LSB', hash: grayscaleFirst.toHexString()}
        ];
    }
}
