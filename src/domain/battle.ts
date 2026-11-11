import type {MapGeometry, Point} from './geometry.ts';

export interface MapInfo {
    readonly generation: number;
    readonly geometry: MapGeometry | null;
    /** Opaque HUD/map selection supplied by telemetry, independent of the vehicle. */
    readonly hudType?: number;
}

export type BattleMap = {readonly kind: 'waiting'} | {readonly kind: 'active'; readonly info: MapInfo};

export type Rgb = readonly [number, number, number];

export type VehicleClass = 'light-tank' | 'medium-tank' | 'heavy-tank' | 'tank-destroyer' |
    'anti-air' | 'ground-vehicle' | 'fighter' | 'bomber' | 'attacker' | 'helicopter' | 'aircraft' | 'ship' | 'boat';

export type SpawnType = 'tank' | 'fighter' | 'bomber';

interface ObjectStyle {
    readonly color: string;
    readonly blink: 0 | 1 | 2;
    readonly blinkColor?: Rgb;
    readonly affiliation?: 'friendly' | 'enemy' | 'unknown';
}

export interface PointObject extends ObjectStyle {
    readonly kind: 'point';
    readonly icon: string;
    readonly vehicleClass?: VehicleClass;
    readonly spawnType?: SpawnType;
    readonly captureLabel?: string;
    readonly position: Point;
    readonly direction: Point;
    readonly rotates: boolean;
}

export interface AirfieldObject extends ObjectStyle {
    readonly kind: 'airfield';
    readonly start: Point;
    readonly end: Point;
}

export type BattleObject = PointObject | AirfieldObject;
