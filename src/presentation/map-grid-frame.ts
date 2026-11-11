import type {MapGeometry, Point} from '../domain/geometry.ts';
import {mapGrid} from '../domain/map-grid.ts';

/** Frame the playable grid within the image; telemetry positions remain image-relative. */
export function mapGridFrame(geometry: MapGeometry | null | undefined): {center: Point; scale: number} {
    const grid = geometry ? mapGrid(geometry) : null;
    const full = {center: {x: 0.5, y: 0.5}, scale: 1};
    if (!grid) return full;
    const left = Math.max(0, grid.origin.x);
    const top = Math.max(0, grid.origin.y);
    const right = Math.min(1, grid.origin.x + grid.size.x);
    const bottom = Math.min(1, grid.origin.y + grid.size.y);
    if (right <= left || bottom <= top) return full;
    return {
        center: {x: (left + right) / 2, y: (top + bottom) / 2},
        scale: Math.min(15, 1 / Math.max(right - left, bottom - top))
    };
}
