import type {BattleObject, PointObject} from './battle.ts';
import type {MapGeometry, Point} from './geometry.ts';
import type {TacticalPosition} from './position.ts';
import {mapDistanceMeters} from './position.ts';

/** A route belongs to its starting team, not the team nearest its destination. */
export function appliesToPlayerSpawns(position: TacticalPosition, objects: readonly BattleObject[], geometry: MapGeometry | null): boolean {
    const origin = position.spawnPoint ?? position.approachPath?.[0];
    if (!origin) return true; // Positions without a spawn/path are shared.
    const spawns = objects.filter((object): object is PointObject => object.kind === 'point' && object.spawnType === 'tank' &&
        Number.isFinite(object.position.x) && Number.isFinite(object.position.y));
    const friendly = spawns.filter(spawn => spawn.affiliation === 'friendly');
    const enemy = spawns.filter(spawn => spawn.affiliation === 'enemy');
    if (!friendly.length || !enemy.length) return true;
    const distance = (point: Point): number => geometry ? mapDistanceMeters(origin, point, geometry) : Math.hypot(origin.x - point.x, origin.y - point.y);
    const nearest = (group: readonly PointObject[]): number => group.reduce((best, spawn) => Math.min(best, distance(spawn.position)), Infinity);
    // Keep ambiguous origins visible instead of treating shared approaches as enemy-only.
    const tolerance = geometry ? 50 : 0.005;
    return nearest(friendly) <= nearest(enemy) + tolerance;
}
