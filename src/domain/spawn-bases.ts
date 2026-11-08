import type {BattleObject, PointObject} from './battle.ts';
import type {MapGeometry} from './geometry.ts';

// Telemetry can describe a base as many individual vehicle appearance points.
// Group in map/world coordinates so zooming never changes the number of bases.
const maxBaseDiameterMeters = 300;
const maxBaseDiameterNormalized = 0.035;

export function groupTankSpawns(objects: readonly BattleObject[], geometry: MapGeometry | null): readonly BattleObject[] {
    const spawns: PointObject[] = [];
    const others: BattleObject[] = [];
    for (const object of objects) {
        if (object.kind === 'point' && object.spawnType === 'tank') spawns.push(object);
        else others.push(object);
    }
    if (spawns.length === 0) return objects;

    spawns.sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
    const scaleX = geometry ? geometry.max.x - geometry.min.x : 1;
    const scaleY = geometry ? geometry.max.y - geometry.min.y : 1;
    const limit = geometry ? maxBaseDiameterMeters : maxBaseDiameterNormalized;
    const groups: PointObject[][] = [];
    for (const spawn of spawns) {
        const color = spawn.color.trim().toLowerCase();
        const group = groups.find(group => group[0].color.trim().toLowerCase() === color && group.every(member =>
            Math.hypot((member.position.x - spawn.position.x) * scaleX, (member.position.y - spawn.position.y) * scaleY) <= limit
        ));
        // Requiring proximity to every member prevents chains merging far bases.
        if (group) group.push(spawn);
        else groups.push([spawn]);
    }

    const bases: PointObject[] = groups.map(group => {
        const representative = group.reduce((best, item) => item.blink > best.blink ? item : best);
        return {
            ...representative,
            vehicleClass: undefined,
            rotates: false,
            position: {
                x: group.reduce((sum, item) => sum + item.position.x, 0) / group.length,
                y: group.reduce((sum, item) => sum + item.position.y, 0) / group.length
            }
        };
    });
    return [...bases, ...others];
}
