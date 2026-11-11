import type {BattleMap, BattleObject, MapInfo, Rgb, SpawnType, VehicleClass} from '../../domain/battle.ts';
import type {Point} from '../../domain/geometry.ts';
import {finiteNumber, isRecord} from '../records.ts';

function point(value: unknown): Point | null {
    if (!Array.isArray(value) || !finiteNumber(value[0]) || !finiteNumber(value[1])) return null;
    return {x: value[0], y: value[1]};
}

export function decodeMap(value: unknown): BattleMap {
    if (!isRecord(value)) throw new Error('Некорректные данные карты');
    if (value.valid === false) return {kind: 'waiting'};
    if (!finiteNumber(value.map_generation)) throw new Error('Некорректные данные карты');
    const min = point(value.map_min);
    const max = point(value.map_max);
    const gridStep = point(value.grid_steps);
    const gridOrigin = point(value.grid_zero);
    const gridSize = point(value.grid_size);
    const geometry: MapInfo['geometry'] = min && max && gridStep &&
        max.x > min.x && max.y > min.y && gridStep.x > 0 && gridStep.y > 0
        ? {
            min, max, gridStep,
            ...(gridOrigin ? {gridOrigin} : {}),
            ...(gridSize && gridSize.x > 0 && gridSize.y > 0 ? {gridSize} : {})
        } : null;
    return {kind: 'active', info: {
        generation: value.map_generation, geometry,
        ...(finiteNumber(value.hud_type) ? {hudType: value.hud_type} : {})
    }};
}

function rgb(value: unknown): Rgb | undefined {
    if (!Array.isArray(value) || !finiteNumber(value[0]) || !finiteNumber(value[1]) || !finiteNumber(value[2])) return undefined;
    return [value[0], value[1], value[2]];
}

function affiliation(channels: unknown, color: unknown): 'friendly' | 'enemy' | 'unknown' {
    let components = rgb(channels);
    if (!components && typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)) {
        components = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
    }
    if (!components) return 'unknown';
    const [red, green, blue] = components;
    // The local map API uses team marker colors. Unknown colors are not targeted.
    if (red >= 120 && red > green * 1.4 && red > blue * 1.4) return 'enemy';
    if ((blue >= 120 && blue > red * 1.4) || (green >= 120 && green > red * 1.4 && green > blue * 1.4)) return 'friendly';
    return 'unknown';
}

const vehicleClasses: Readonly<Record<string, VehicleClass | undefined>> = {
    lighttank: 'light-tank', mediumtank: 'medium-tank', heavytank: 'heavy-tank',
    tankdestroyer: 'tank-destroyer', spg: 'tank-destroyer', spaa: 'anti-air', sam: 'anti-air',
    ifv: 'ground-vehicle', apc: 'ground-vehicle', wheeled: 'ground-vehicle', tracked: 'ground-vehicle',
    groundmodel: 'ground-vehicle', tank: 'ground-vehicle',
    fighter: 'fighter', bomber: 'bomber', assault: 'attacker', attacker: 'attacker',
    heavyfighter: 'attacker', strike: 'attacker', helicopter: 'helicopter', aircraft: 'aircraft',
    ship: 'ship', destroyer: 'ship', cruiser: 'ship', battleship: 'ship', frigate: 'ship',
    corvette: 'ship', missiledestroyer: 'ship', torpedoboat: 'boat', boat: 'boat'
};

function vehicleClass(value: unknown): VehicleClass | undefined {
    if (typeof value !== 'string') return undefined;
    return vehicleClasses[value.toLowerCase().replace(/[\s_-]/g, '')];
}

function spawnType(value: unknown): SpawnType | undefined {
    if (typeof value !== 'string') return undefined;
    switch (value.toLowerCase()) {
        case 'respawn_base_tank': case 'spawn_tank': return 'tank';
        case 'respawn_base_fighter': case 'spawn_fighter': return 'fighter';
        case 'respawn_base_bomber': case 'spawn_bomber': return 'bomber';
        default: return undefined;
    }
}

function captureLabel(item: Record<string, unknown>): string | undefined {
    if (item.icon !== 'capture_zone' && item.type !== 'capture_zone') return undefined;
    const label = typeof item.zone_label === 'string' ? item.zone_label.trim() : '';
    if (/^[\p{L}\p{N}]{1,4}$/u.test(label)) return label;
    const code = item.zone_label_code;
    if (finiteNumber(code) && Number.isInteger(code) && code >= 0 && code <= 0x10ffff) {
        const character = String.fromCodePoint(code);
        if (/^[\p{L}\p{N}]$/u.test(character)) return character;
    }
    return undefined;
}

export function decodeObjects(value: unknown): readonly BattleObject[] {
    if (!Array.isArray(value)) throw new Error('Некорректные данные объектов');
    return value.flatMap((item: unknown): BattleObject[] => {
        if (!isRecord(item)) return [];
        const style = {
            color: typeof item.color === 'string' ? item.color : '#fff',
            blink: item.blink === 2 ? 2 as const : item.blink ? 1 as const : 0 as const,
            blinkColor: rgb(item['color[]']),
            affiliation: affiliation(item['color[]'], item.color)
        };
        if (item.type === 'airfield') {
            if (!finiteNumber(item.sx) || !finiteNumber(item.sy) || !finiteNumber(item.ex) || !finiteNumber(item.ey)) return [];
            return [{kind: 'airfield', start: {x: item.sx, y: item.sy}, end: {x: item.ex, y: item.ey}, ...style}];
        }
        if (!finiteNumber(item.x) || !finiteNumber(item.y) || typeof item.icon !== 'string') return [];
        const label = captureLabel(item);
        return [{
            kind: 'point', position: {x: item.x, y: item.y}, icon: item.icon,
            vehicleClass: vehicleClass(item.icon) ?? vehicleClass(item.icon_bg) ?? vehicleClass(item.type),
            spawnType: spawnType(item.type) ?? spawnType(item.icon),
            ...(label ? {captureLabel: label} : {}),
            direction: {x: finiteNumber(item.dx) ? item.dx : 0, y: finiteNumber(item.dy) ? item.dy : -1},
            rotates: item.type === 'respawn_base_fighter' || item.type === 'respawn_base_bomber',
            ...style
        }];
    });
}
