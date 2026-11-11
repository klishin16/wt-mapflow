import type {BattleObject, PointObject} from '../domain/battle.ts';
import type {MapGeometry, Point} from '../domain/geometry.ts';
import type {TacticalPosition} from '../domain/position.ts';
import type {MapViewState} from '../application/map-controller.ts';
import {Camera} from './camera.ts';
import {mapGrid, gridRowLabel} from '../domain/map-grid.ts';
import {MarkerRenderer} from './marker-renderer.ts';
import type {AirGroundGuidance} from '../domain/air-ground-guidance.ts';
import {isAircraftClass} from '../domain/air-ground-guidance.ts';
import {AirGroundGuidanceRenderer} from './air-ground-guidance-renderer.ts';
import {drawPositionRoute} from './position-route-renderer.ts';

const approach = (from: number, to: number, dt: number): number => from + (1 - Math.exp(-dt / 0.4)) * (to - from);

export interface PositionOverlay {
    readonly positions: readonly TacticalPosition[];
    readonly selectedId: string | null;
    readonly draft: {readonly point: Point; readonly aimPoint?: Point; readonly approachPath?: readonly Point[]} | null;
}

export class CanvasRenderer {
    private readonly context: CanvasRenderingContext2D;
    private readonly camera: Camera;
    private readonly markers = new MarkerRenderer();
    private readonly guidanceRenderer = new AirGroundGuidanceRenderer();
    private guidance: AirGroundGuidance | null = null;
    private showPreparationRoutes = true;
    private width = 1;
    private height = 1;
    private pixelRatio = 1;
    private lastPlayer: {position: Point; angle: number} | null = null;

    constructor(canvas: HTMLCanvasElement, camera: Camera) {
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D недоступен');
        this.context = context;
        this.camera = camera;
    }

    resize(width: number, height: number, pixelRatio: number): void {
        this.width = width;
        this.height = height;
        this.pixelRatio = pixelRatio;
        this.context.canvas.width = Math.round(width * pixelRatio);
        this.context.canvas.height = Math.round(height * pixelRatio);
        this.camera.resize(width, height);
    }

    resetPlayer(): void { this.lastPlayer = null; }

    setShowPreparationRoutes(enabled: boolean): void { this.showPreparationRoutes = enabled; }

    setMarkerSize(size: number): void { this.markers.setSize(size); }

    setAirGroundGuidance(guidance: AirGroundGuidance | null): void { this.guidance = guidance; }

    render(state: MapViewState<HTMLImageElement>, dt: number, time: number, overlay: PositionOverlay | null = null): void {
        const ctx = this.context;
        ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);
        const origin = this.camera.mapToScreen({x: 0, y: 0});
        if (state.image?.complete && state.image.naturalWidth > 0) {
            ctx.drawImage(state.image, origin.x, origin.y, this.width * this.camera.scale, this.height * this.camera.scale);
        }
        if (state.info?.geometry) this.drawGrid(state.info.geometry);
        const player = state.objects.find((object): object is PointObject => object.kind === 'point' && object.icon === 'Player');
        this.markers.setAircraftMap(isAircraftClass(player?.vehicleClass));
        if (player) this.updatePlayer(player, dt);
        else this.lastPlayer = null;
        if (this.guidance && this.lastPlayer) {
            this.guidanceRenderer.draw(ctx, this.camera, this.guidance, this.lastPlayer.position, this.width, this.height);
        }
        const positions = overlay?.positions ?? state.positions;
        const selected = positions.find(position => position.id === overlay?.selectedId);
        if (this.showPreparationRoutes && state.image && state.connection === 'connected' && state.objectsReady && !state.battleStarted) {
            for (const position of positions) {
                if (position.id !== selected?.id && position.approachPath) drawPositionRoute(ctx, this.camera, position.approachPath, false, true);
            }
        }
        if (selected?.approachPath) drawPositionRoute(ctx, this.camera, selected.approachPath, false);
        if (overlay?.draft?.approachPath) drawPositionRoute(ctx, this.camera, overlay.draft.approachPath, true);
        for (const object of state.objects) {
            if (object !== player) this.drawObject(object, time);
        }
        for (const position of overlay?.positions ?? state.positions) {
            this.drawPosition(position, position.id === overlay?.selectedId);
        }
        if (overlay?.draft) {
            this.drawAim(overlay.draft.point, overlay.draft.aimPoint);
            const point = this.camera.mapToScreen(overlay.draft.point);
            ctx.beginPath();
            ctx.arc(point.x, point.y, 13, 0, Math.PI * 2);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        if (this.lastPlayer) this.markers.drawPlayer(ctx, this.camera.mapToScreen(this.lastPlayer.position), this.lastPlayer.angle);
    }

    private drawGrid(geometry: MapGeometry): void {
        const grid = mapGrid(geometry);
        if (!grid) return;
        const topLeft = this.camera.screenToMap({x: 0, y: 0});
        const bottomRight = this.camera.screenToMap({x: this.width, y: this.height});
        const min = {x: Math.max(0, grid.origin.x, topLeft.x), y: Math.max(0, grid.origin.y, topLeft.y)};
        const max = {
            x: Math.min(1, grid.origin.x + grid.size.x, bottomRight.x),
            y: Math.min(1, grid.origin.y + grid.size.y, bottomRight.y)
        };
        if (max.x <= min.x || max.y <= min.y) return;
        const start = this.camera.mapToScreen(min);
        const end = this.camera.mapToScreen(max);
        const ctx = this.context;
        ctx.save();
        ctx.beginPath();
        ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
        ctx.clip();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#555';
        ctx.fillStyle = '#111';
        ctx.font = '12px sans-serif';
        const drawAxis = (axis: 'x' | 'y'): void => {
            const origin = grid.origin[axis];
            const step = grid.step[axis];
            const count = axis === 'x' ? grid.columns : grid.rows;
            const first = Math.max(0, Math.floor((min[axis] - origin) / step));
            const last = Math.min(count - 1, Math.floor((max[axis] - origin) / step));
            ctx.beginPath();
            // Only visit visible cells, with a cap for pathological telemetry.
            for (let index = first; index <= last && index - first < 512; index++) {
                const boundary = origin + index * step;
                const screen = this.camera.mapToScreen({x: boundary, y: boundary});
                if (axis === 'x') {
                    ctx.moveTo(Math.floor(screen.x) + 0.5, start.y);
                    ctx.lineTo(Math.floor(screen.x) + 0.5, end.y);
                } else {
                    ctx.moveTo(start.x, Math.floor(screen.y) + 0.5);
                    ctx.lineTo(end.x, Math.floor(screen.y) + 0.5);
                }
                const cellEnd = Math.min(boundary + step, origin + grid.size[axis]);
                const middle = (boundary + cellEnd) / 2;
                const center = this.camera.mapToScreen({x: middle, y: middle});
                if (axis === 'x') {
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(String(index + 1), center.x, start.y + 3);
                } else {
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(gridRowLabel(index), start.x + 3, center.y);
                }
            }
            ctx.stroke();
        };
        drawAxis('x');
        drawAxis('y');
        const gridStart = this.camera.mapToScreen(grid.origin);
        const gridEnd = this.camera.mapToScreen({x: grid.origin.x + grid.size.x, y: grid.origin.y + grid.size.y});
        ctx.strokeRect(gridStart.x, gridStart.y, gridEnd.x - gridStart.x, gridEnd.y - gridStart.y);
        ctx.restore();
    }

    private color(object: BattleObject, time: number): string {
        if (!object.blink || !object.blinkColor) return object.color;
        const period = object.blink === 2 ? 1.2 : 2;
        const blend = Math.exp(-Math.pow(5 * (time % period) - 2, 4));
        const color = object.blinkColor.map((channel, index) => Math.floor(channel + ((index === 2 ? 0 : 255) - channel) * blend));
        return `rgb(${color.join(',')})`;
    }

    private drawObject(object: BattleObject, time: number): void {
        const ctx = this.context;
        const color = this.color(object, time);
        if (object.kind === 'airfield') {
            const start = this.camera.mapToScreen(object.start);
            const end = this.camera.mapToScreen(object.end);
            ctx.strokeStyle = color;
            ctx.lineWidth = 3 * Math.sqrt(this.camera.scale);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            return;
        }
        const point = this.camera.mapToScreen(object.position);
        this.markers.drawObject(ctx, object, point, color);
    }

    private drawPosition(position: TacticalPosition, selected: boolean): void {
        const {x, y} = this.camera.mapToScreen(position.point);
        const ctx = this.context;
        if (selected) {
            this.drawAim(position.point, position.aimPoint);
            ctx.beginPath();
            ctx.arc(x, y, 14, 0, Math.PI * 2);
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(x, y - 9);
        ctx.lineTo(x + 9, y);
        ctx.lineTo(x, y + 9);
        ctx.lineTo(x - 9, y);
        ctx.closePath();
        ctx.fillStyle = '#ffc857';
        ctx.strokeStyle = '#1f2329';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
    }

    private drawAim(origin: Point, target?: Point): void {
        if (!target) return;
        const start = this.camera.mapToScreen(origin);
        const end = this.camera.mapToScreen(target);
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const ctx = this.context;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.strokeStyle = '#ffc857';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(end.x - 12 * Math.cos(angle - 0.45), end.y - 12 * Math.sin(angle - 0.45));
        ctx.lineTo(end.x, end.y);
        ctx.lineTo(end.x - 12 * Math.cos(angle + 0.45), end.y - 12 * Math.sin(angle + 0.45));
        ctx.stroke();
        ctx.restore();
    }

    private updatePlayer(player: PointObject, dt: number): void {
        let {x, y} = player.position;
        let angle = Math.atan2(player.direction.y, player.direction.x);
        if (this.lastPlayer) {
            const previous = this.lastPlayer;
            if (Math.abs(previous.position.x - x) < 0.01) x = approach(previous.position.x, x, dt);
            if (Math.abs(previous.position.y - y) < 0.01) y = approach(previous.position.y, y, dt);
            const delta = Math.atan2(Math.sin(angle - previous.angle), Math.cos(angle - previous.angle));
            if (Math.abs(delta) < Math.PI / 4) angle = previous.angle + approach(0, delta, dt);
        }
        this.lastPlayer = {position: {x, y}, angle};
    }
}
