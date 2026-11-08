import type {BattleMap, BattleObject, PointObject, VehicleClass} from '../../domain/battle.ts';
import type {TacticalPosition} from '../../domain/position.ts';
import type {PositionRepository, TelemetryGateway} from '../../application/ports.ts';
import {throwIfAborted} from '../../application/errors.ts';

export class DemoGateway implements TelemetryGateway {
    private readonly started = performance.now();
    private readonly aircraft: boolean;

    constructor({aircraft = false}: {aircraft?: boolean} = {}) { this.aircraft = aircraft; }

    async readMap(signal: AbortSignal): Promise<BattleMap> {
        throwIfAborted(signal);
        const extent = this.aircraft ? 20000 : 2000;
        return {kind: 'active', info: {
            generation: 1,
            geometry: {min: {x: 0, y: 0}, max: {x: extent, y: extent}, gridStep: {x: extent / 8, y: extent / 8}}
        }};
    }

    async readObjects(signal: AbortSignal): Promise<readonly BattleObject[]> {
        throwIfAborted(signal);
        const angle = (performance.now() - this.started) / 18000;
        const x = 0.5 + Math.cos(angle) * 0.22;
        const y = 0.5 + Math.sin(angle) * 0.22;
        return [
            {kind: 'point', icon: 'Player', vehicleClass: this.aircraft ? 'aircraft' : 'ground-vehicle', position: {x, y}, direction: {x: -Math.sin(angle), y: Math.cos(angle)}, color: '#fff', blink: 0, rotates: false},
            this.marker('LightTank', x - 0.08, y - 0.06, '#3e9bff', 'light-tank'),
            this.marker('MediumTank', x - 0.06, y + 0.04, '#3e9bff', 'medium-tank'),
            this.marker('HeavyTank', x + 0.08, y + 0.03, '#3e9bff', 'heavy-tank'),
            this.marker('TankDestroyer', x + 0.09, y - 0.06, '#ff5147', 'tank-destroyer'),
            this.marker('SPAA', x, y + 0.1, '#3e9bff', 'anti-air'),
            this.marker('HeavyTank', x + 0.15, y - 0.12, '#ff5147', 'heavy-tank'),
            this.marker('Fighter', x - 0.16, y - 0.13, '#ff5147', 'fighter'),
            this.marker('capture_zone', 0.42, 0.51, '#83d6ff'),
            this.marker('capture_zone', 0.72, 0.3, '#ff8b83'),
            ...this.spawnBase(0.2, 0.87, '#83d6ff'),
            ...this.spawnBase(0.87, 0.12, '#ff8b83'),
            ...(this.aircraft ? [
                ...this.spawnBase(0.62, 0.19, '#ff8b83'),
                {...this.marker('respawn_base_fighter', 0.9, 0.06, '#ff8b83'), spawnType: 'fighter' as const, affiliation: 'enemy' as const},
                this.marker('bombing_point', 0.45, 0.16, '#ff8b83')
            ] : [])
        ];
    }

    private spawnBase(x: number, y: number, color: string): PointObject[] {
        const scale = this.aircraft ? 0.1 : 1;
        return [[0, 0], [-0.012, -0.01], [0.015, 0.008], [-0.008, 0.012], [0.01, -0.015]].map(([dx, dy]) => ({
            ...this.marker('respawn_base_tank', x + dx * scale, y + dy * scale, color), spawnType: 'tank',
            affiliation: color === '#ff8b83' ? 'enemy' : 'friendly'
        }));
    }

    private marker(icon: string, x: number, y: number, color: string, vehicleClass?: VehicleClass): PointObject {
        return {kind: 'point', icon, vehicleClass, position: {x, y}, direction: {x: 0, y: -1}, color, blink: 0, rotates: false};
    }
}

const positions: readonly TacticalPosition[] = [
    {id: 'demo-1', mapId: 'demo', point: {x: 0.46, y: 0.38}, title: 'Обзор перекрёстка',
        approachPath: [{x: 0.2, y: 0.87}, {x: 0.36, y: 0.71}, {x: 0.42, y: 0.51}, {x: 0.46, y: 0.38}],
        description: 'Контролируй дорогу на северо-восток. Держись у края здания и возвращайся за укрытие после выстрела.',
        aimPoint: {x: 0.68, y: 0.27}, triggerRadiusMeters: 180, screenshots: []},
    {id: 'demo-2', mapId: 'demo', point: {x: 0.63, y: 0.61}, title: 'Укрытие у здания',
        approachPath: [{x: 0.87, y: 0.12}, {x: 0.73, y: 0.31}, {x: 0.77, y: 0.54}, {x: 0.63, y: 0.61}],
        description: 'Используй угол здания для наблюдения за восточным подходом. Перед выездом проверь фланг.',
        aimPoint: {x: 0.82, y: 0.54}, triggerRadiusMeters: 180, screenshots: []}
];

export const demoPositions: PositionRepository = {
    async list() { return {positions, missing: false}; }
};
