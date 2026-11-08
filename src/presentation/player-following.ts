import type {Point} from '../domain/geometry.ts';
import {Camera} from './camera.ts';
import type {VehicleClass} from '../domain/battle.ts';
import {isAircraftClass} from '../domain/air-ground-guidance.ts';

const defaultScales = {ground: 3, aircraft: 3};
type ZoomProfile = keyof typeof defaultScales;

export class PlayerFollowing {
    private readonly camera: Camera;
    private player: Point | null = null;
    private enabled = true;
    private scales: Record<ZoomProfile, number> = {...defaultScales};
    private profile: ZoomProfile | null = null;
    private pendingZoom: number | null = null;

    constructor(camera: Camera) {
        this.camera = camera;
    }

    get isEnabled(): boolean { return this.enabled; }
    get hasPlayer(): boolean { return this.player !== null; }

    setPlayer(point: Point | null, vehicleClass?: VehicleClass): void {
        this.player = point;
        if (!point) return;
        const profile = isAircraftClass(vehicleClass) ? 'aircraft' : 'ground';
        if (this.profile === null && this.pendingZoom !== null) {
            this.scales[profile] = this.pendingZoom;
            this.pendingZoom = null;
        }
        this.profile = profile;
    }

    start(): void {
        this.enabled = true;
    }

    pause(): void {
        this.enabled = false;
    }

    rememberZoom(): void {
        // Wheel/buttons may change scale without turning off player tracking.
        if (this.profile) this.scales[this.profile] = this.camera.scale;
        else this.pendingZoom = this.camera.scale;
    }

    reset(): void {
        this.enabled = true;
        this.scales = {...defaultScales};
        this.profile = null;
        this.pendingZoom = null;
        this.player = null;
    }

    update(dt: number): void {
        if (this.enabled && this.player) this.camera.focusOn(this.player, this.scales[this.profile ?? 'ground'], dt);
    }
}
