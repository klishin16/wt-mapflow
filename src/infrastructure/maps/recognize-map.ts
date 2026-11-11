import {ahash} from './ahash/ahash.ts';
import type {MapCatalogRepository} from '../../application/map-catalog.ts';
import type {MapHashSample, MapRecognition} from '../../domain/map-recognition.ts';
import {recognizeMapHashes} from '../../domain/map-recognition.ts';

export class BrowserMapRecognizer {
    private readonly fingerprints = new WeakMap<HTMLImageElement, Promise<readonly MapHashSample[]>>();
    private readonly catalog: MapCatalogRepository;

    constructor(catalog: MapCatalogRepository) {
        this.catalog = catalog;
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
        const references = this.catalog.list().flatMap(map => map.hashes.map(hash => ({hash, mapId: map.id})));
        return recognizeMapHashes(imageHash, samples, references, references.find(reference => reference.hash === imageHash)?.mapId);
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
