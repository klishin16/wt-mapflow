import type {MapGeometry} from '../domain/geometry.ts';

const nearDistanceMeters = 2000;
const farDistanceMeters = 12000;
const closeViewMeters = 4000;

/** Distance is the same horizontal distance used by enemy tank-spawn guidance. */
export function aircraftZoomScale(distanceMeters: number | null, geometry: MapGeometry | null): number | null {
    if (distanceMeters === null || !Number.isFinite(distanceMeters) || distanceMeters < 0 || !geometry) return null;
    const span = Math.min(geometry.max.x - geometry.min.x, geometry.max.y - geometry.min.y);
    if (!Number.isFinite(span) || span <= 0) return null;
    const nearScale = Math.min(15, Math.max(3, span / closeViewMeters));
    const progress = Math.max(0, Math.min(1, (farDistanceMeters - distanceMeters) / (farDistanceMeters - nearDistanceMeters)));
    const blend = progress * progress * (3 - 2 * progress);
    return 3 + (nearScale - 3) * blend;
}
