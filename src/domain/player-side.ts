import type {BattleObject, PointObject} from './battle.ts';

export type PlayerSide = 'upper' | 'lower' | 'unknown';

/** Compare team spawn heights, never the player's changing position. */
export function determinePlayerSide(objects: readonly BattleObject[]): PlayerSide {
    const spawns = objects.filter((object): object is PointObject => object.kind === 'point' && object.spawnType === 'tank' &&
        Number.isFinite(object.position.x) && Number.isFinite(object.position.y));
    const friendly = spawns.filter(spawn => spawn.affiliation === 'friendly');
    const enemy = spawns.filter(spawn => spawn.affiliation === 'enemy');
    if (!friendly.length || !enemy.length) return 'unknown';
    const averageY = (group: readonly PointObject[]): number => group.reduce((sum, spawn) => sum + spawn.position.y, 0) / group.length;
    const difference = averageY(friendly) - averageY(enemy);
    // Image Y grows downwards. Nearly equal heights do not identify a side.
    if (Math.abs(difference) <= 0.0001) return 'unknown';
    return difference < 0 ? 'upper' : 'lower';
}
