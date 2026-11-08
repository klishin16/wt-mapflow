import type {BattleObject, PointObject, VehicleClass} from './battle.ts';
import type {MapGeometry} from './geometry.ts';

const aircraftClasses: readonly VehicleClass[] = ['aircraft', 'fighter', 'bomber', 'attacker'];

export function isAircraftClass(vehicleClass: VehicleClass | undefined): boolean {
    return vehicleClass !== undefined && aircraftClasses.includes(vehicleClass);
}

export interface GroundSpawnTarget {
    readonly spawn: PointObject;
    readonly distanceMeters: number | null;
    readonly bearingDegrees: number;
    readonly turnDegrees: number | null;
}

export interface AirGroundGuidance {
    readonly player: PointObject;
    // Nearest first. Only tank appearance bases are eligible targets.
    readonly targets: readonly GroundSpawnTarget[];
}

export function airGroundGuidance(objects: readonly BattleObject[], geometry: MapGeometry | null): AirGroundGuidance | null {
    const player = objects.find((object): object is PointObject => object.kind === 'point' && object.icon === 'Player');
    if (!player || !isAircraftClass(player.vehicleClass)) return null;
    const scaleX = geometry ? geometry.max.x - geometry.min.x : 1;
    const scaleY = geometry ? geometry.max.y - geometry.min.y : 1;
    const heading = Math.atan2(player.direction.x * scaleX, -player.direction.y * scaleY);
    const hasHeading = Math.hypot(player.direction.x, player.direction.y) > 0.000001;
    const targets = objects.flatMap((spawn): (GroundSpawnTarget & {distance: number})[] => {
        if (spawn.kind !== 'point' || spawn.spawnType !== 'tank' || spawn.affiliation !== 'enemy') return [];
        const dx = (spawn.position.x - player.position.x) * scaleX;
        const dy = (spawn.position.y - player.position.y) * scaleY;
        const bearing = Math.atan2(dx, -dy);
        const distance = Math.hypot(dx, dy);
        return [{
            spawn, distance, distanceMeters: geometry ? distance : null,
            bearingDegrees: (bearing * 180 / Math.PI + 360) % 360,
            turnDegrees: hasHeading ? Math.atan2(Math.sin(bearing - heading), Math.cos(bearing - heading)) * 180 / Math.PI : null
        }];
    }).sort((a, b) => a.distance - b.distance || a.spawn.position.x - b.spawn.position.x || a.spawn.position.y - b.spawn.position.y);
    return {player, targets};
}
