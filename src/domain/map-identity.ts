import type {MapInfo} from './battle.ts';

export function mapVariantId(info: MapInfo): string {
    const bounds = info.geometry;
    return bounds ? [bounds.min.x, bounds.min.y, bounds.max.x, bounds.max.y].join(':') : 'default';
}

// A single battle generation can contain different map extents (air/ground).
// All consumers must agree when the image's coordinate system has changed.
export function isSameMap(first: MapInfo | null | undefined, second: MapInfo | null | undefined): boolean {
    if (!first || !second) return first === second;
    if (first.generation !== second.generation) return false;
    const a = first.geometry;
    const b = second.geometry;
    if (!a || !b) return a === b;
    return a.min.x === b.min.x && a.min.y === b.min.y &&
        a.max.x === b.max.x && a.max.y === b.max.y &&
        a.gridStep.x === b.gridStep.x && a.gridStep.y === b.gridStep.y;
}
