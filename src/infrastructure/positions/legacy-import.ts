import type {ImageDimensions, Point} from '../../domain/geometry.ts';
import type {TacticalPosition} from '../../domain/position.ts';
import {normalizedPoint, normalizePixels} from '../../domain/geometry.ts';
import {finiteNumber, isRecord} from '../records.ts';

export interface LegacyPin {
    readonly x: number;
    readonly y: number;
    readonly coordinateSpace?: 'normalized' | 'pixels';
    readonly id?: string;
    readonly title: string;
    readonly description: string;
    readonly imageUrl?: string;
}

export interface LegacyMap {
    readonly mapName?: string;
    readonly imageUrl?: string;
    readonly pins: readonly LegacyPin[];
}

export function decodeLegacyMap(value: unknown): LegacyMap {
    if (!isRecord(value) || !isRecord(value.map)) throw new Error('Некорректный набор позиций');
    const map = value.map;
    const rawPins: unknown = map.pins ?? [];
    if (!Array.isArray(rawPins)) throw new Error('Некорректный список позиций');
    return {
        mapName: typeof map.mapName === 'string' ? map.mapName : undefined,
        imageUrl: typeof map.imageUrl === 'string' ? map.imageUrl : undefined,
        pins: rawPins.flatMap((pin: unknown): LegacyPin[] => {
            if (!isRecord(pin) || !finiteNumber(pin.x) || !finiteNumber(pin.y)) return [];
            if (pin.coordinateSpace !== undefined && pin.coordinateSpace !== 'normalized' && pin.coordinateSpace !== 'pixels') {
                throw new Error('Неизвестная система координат позиции');
            }
            return [{
                x: pin.x, y: pin.y, coordinateSpace: pin.coordinateSpace,
                id: typeof pin._id === 'string' ? pin._id : undefined,
                title: typeof pin.title === 'string' ? pin.title : 'Тактическая позиция',
                description: typeof pin.description === 'string' ? pin.description : '',
                imageUrl: typeof pin.imageUrl === 'string' ? pin.imageUrl : undefined
            }];
        })
    };
}

export function isNormalizedPin(pin: LegacyPin): boolean {
    return pin.coordinateSpace === 'normalized' ||
        (!pin.coordinateSpace && pin.x >= 0 && pin.x <= 1 && pin.y >= 0 && pin.y <= 1);
}

export function convertLegacyPins(map: LegacyMap, dimensions?: ImageDimensions, fallbackMapId = 'unknown'): readonly TacticalPosition[] {
    return map.pins.flatMap((pin, index): TacticalPosition[] => {
        let point: Point | null;
        if (isNormalizedPin(pin)) {
            point = normalizedPoint(pin.x, pin.y);
        } else {
            if (!dimensions) throw new Error('Неизвестны размеры исходной карты для пиксельных позиций');
            point = normalizePixels(pin, dimensions);
        }
        if (!point) return [];
        return [{
            id: pin.id ?? `imported-${index}`, mapId: map.mapName ?? fallbackMapId, point,
            title: pin.title, description: pin.description,
            screenshots: pin.imageUrl ? [pin.imageUrl] : []
        }];
    });
}

// Only the import adapter knows about mixed historical coordinate formats.
export function importLegacyPins(value: unknown, dimensions?: ImageDimensions): readonly TacticalPosition[] {
    return convertLegacyPins(decodeLegacyMap(value), dimensions);
}
