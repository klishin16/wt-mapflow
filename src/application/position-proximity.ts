import type {MapGeometry, Point} from '../domain/geometry.ts';
import type {TacticalPosition} from '../domain/position.ts';
import {mapDistanceMeters} from '../domain/position.ts';

export class PositionProximity {
    private readonly dismissed = new Set<string>();
    private current: string | null = null;

    dismiss(id: string): void {
        this.dismissed.add(id);
        if (this.current === id) this.current = null;
    }

    reset(): void { this.dismissed.clear(); this.current = null; }

    update(positions: readonly TacticalPosition[], player: Point | null, geometry: MapGeometry | null): TacticalPosition | null {
        if (!player || !geometry) return null;
        for (const id of this.dismissed) {
            const position = positions.find(position => position.id === id);
            if (!position || mapDistanceMeters(player, position.point, geometry) > (position.triggerRadiusMeters ?? 100) * 1.3) this.dismissed.delete(id);
        }
        const active = positions.find(position => position.id === this.current);
        if (active && !this.dismissed.has(active.id) &&
            mapDistanceMeters(player, active.point, geometry) <= (active.triggerRadiusMeters ?? 100) * 1.3) return active;
        const nearest = positions.filter(position => !this.dismissed.has(position.id) &&
            mapDistanceMeters(player, position.point, geometry) <= (position.triggerRadiusMeters ?? 100))
            .sort((a, b) => mapDistanceMeters(player, a.point, geometry) - mapDistanceMeters(player, b.point, geometry))[0] ?? null;
        this.current = nearest?.id ?? null;
        return nearest;
    }
}
