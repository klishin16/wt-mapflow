import type {MapGeometry, Point} from '../domain/geometry.ts';
import {aircraftZoomScale} from './aircraft-zoom.ts';
import {Camera} from './camera.ts';
import {mapGridFrame} from './map-grid-frame.ts';
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
    private adaptiveAircraftZoom = true;
    private manualAircraftZoom = false;
    private manualGroundZoom = false;
    private spawnDistance: number | null = null;
    private geometry: MapGeometry | null = null;
    private adaptiveScale: number | null = null;

    constructor(camera: Camera) {
        this.camera = camera;
    }

    get isEnabled(): boolean { return this.enabled; }
    get hasPlayer(): boolean { return this.player !== null; }
    get isPlayerOutsideMap(): boolean {
        const point = this.player;
        if (!point) return false;
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return true;
        return false;
    }
    get isAdaptiveZoomActive(): boolean {
        return this.enabled && !this.isPlayerOutsideMap && this.profile === 'aircraft' && this.adaptiveAircraftZoom && !this.manualAircraftZoom &&
            aircraftZoomScale(this.spawnDistance, this.geometry) !== null;
    }

    setAdaptiveAircraftZoom(enabled: boolean): void {
        if (this.adaptiveAircraftZoom === enabled) return;
        if (!enabled && this.profile === 'aircraft') this.scales.aircraft = this.camera.scale;
        this.adaptiveAircraftZoom = enabled;
        this.manualAircraftZoom = false;
        this.adaptiveScale = null;
    }

    setGroundSpawnContext(distance: number | null, geometry: MapGeometry | null): void {
        this.spawnDistance = distance;
        this.geometry = geometry;
    }

    setPlayer(point: Point | null, vehicleClass?: VehicleClass): void {
        this.player = point;
        if (!point) return;
        const profile = isAircraftClass(vehicleClass) ? 'aircraft' : 'ground';
        const hadPendingZoom = this.profile === null && this.pendingZoom !== null;
        if (hadPendingZoom && this.pendingZoom !== null) {
            this.scales[profile] = this.pendingZoom;
            if (profile === 'ground') this.manualGroundZoom = true;
            this.pendingZoom = null;
        }
        if (this.profile !== profile) {
            this.manualAircraftZoom = hadPendingZoom && profile === 'aircraft' && this.adaptiveAircraftZoom;
            this.adaptiveScale = null;
        }
        this.profile = profile;
    }

    start(): void {
        this.enabled = true;
        this.manualAircraftZoom = false;
        this.adaptiveScale = null;
    }

    pause(): void {
        this.enabled = false;
    }

    rememberZoom(): void {
        if (this.profile === 'ground') this.manualGroundZoom = true;
        if (this.profile === 'aircraft' && this.adaptiveAircraftZoom) this.manualAircraftZoom = true;
        this.adaptiveScale = null;
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
        this.manualAircraftZoom = false;
        this.adaptiveScale = null;
        this.spawnDistance = null;
        this.geometry = null;
        this.manualGroundZoom = false;
    }

    update(dt: number): void {
        if (!this.enabled || !this.player || this.isPlayerOutsideMap) return;
        let scale = this.scales[this.profile ?? 'ground'];
        if (this.profile === 'ground' && !this.manualGroundZoom) scale *= mapGridFrame(this.geometry).scale;
        if (this.profile === 'aircraft' && this.adaptiveAircraftZoom && !this.manualAircraftZoom) {
            const target = aircraftZoomScale(this.spawnDistance, this.geometry) ?? scale;
            const blend = 1 - Math.exp(-Math.max(0, dt) / 1.2);
            const current = this.adaptiveScale ?? this.camera.scale;
            this.adaptiveScale = current + (target - current) * blend;
            scale = this.adaptiveScale;
        }
        this.camera.focusOn(this.player, scale, dt);
    }
}
