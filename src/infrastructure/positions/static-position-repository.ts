import type {LoadOptions, MapImageSource, PositionRepository, PositionSet} from '../../application/ports.ts';
import type {ImageDimensions} from '../../domain/geometry.ts';
import {RatlineMapImporter} from './ratline-map-importer.ts';
import {isRecord} from '../records.ts';
import {convertLegacyPins, decodeLegacyMap, isNormalizedPin} from './legacy-import.ts';

export class StaticPositionRepository implements PositionRepository {
    private readonly imageSource: MapImageSource<HTMLImageElement>;

    constructor(imageSource: MapImageSource<HTMLImageElement>) {
        this.imageSource = imageSource;
    }

    async list(mapId: string, {signal}: LoadOptions = {}): Promise<PositionSet> {
        const response = await fetch(`/maps/${encodeURIComponent(mapId)}.json`, {signal});
        if (response.status === 404) return {positions: [], missing: true};
        if (!response.ok) throw new Error('Не удалось загрузить позиции');
        const data: unknown = await response.json();
        if (isRecord(data) && isRecord(data.map) && Array.isArray(data.map.routes) && data.map.routes.length) {
            const preview = await new RatlineMapImporter(this.imageSource).preview(new Blob([JSON.stringify(data)]), {
                coordinates: 'auto', pairOrder: 'xy', flipY: false, targetMapId: mapId
            });
            return {positions: preview.backup.changes.flatMap(change => change.position ? [change.position] : []), missing: false};
        }
        const map = decodeLegacyMap(data);
        let dimensions: ImageDimensions | undefined;
        if (map.pins.some(pin => !isNormalizedPin(pin))) {
            if (!map.imageUrl) throw new Error('Не задано исходное изображение позиций');
            const image = await this.imageSource.load(map.imageUrl, {signal});
            dimensions = {width: image.naturalWidth, height: image.naturalHeight};
        }
        return {positions: convertLegacyPins(map, dimensions, mapId).map(position => ({...position, source: {provider: 'ratline' as const, url: 'https://ratline.site/maps'}})), missing: false};
    }
}
