import type {Point} from '../domain/geometry.ts';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

export class Camera {
    scale = 1;
    private offset: Point = {x: 0, y: 0};
    private width = 1;
    private height = 1;

    resize(width: number, height: number): void {
        this.offset = {x: this.offset.x * width / this.width, y: this.offset.y * height / this.height};
        this.width = width;
        this.height = height;
        this.clampOffset();
    }

    reset(): void {
        this.scale = 1;
        this.offset = {x: 0, y: 0};
    }

    mapToScreen(point: Point): Point {
        return {x: point.x * this.width * this.scale + this.offset.x, y: point.y * this.height * this.scale + this.offset.y};
    }

    screenToMap(point: Point): Point {
        return {x: (point.x - this.offset.x) / (this.width * this.scale), y: (point.y - this.offset.y) / (this.height * this.scale)};
    }

    zoomAt(anchor: Point, factor: number): void {
        const next = clamp(this.scale * factor, 1, 15);
        const ratio = next / this.scale;
        this.offset = {x: anchor.x - (anchor.x - this.offset.x) * ratio, y: anchor.y - (anchor.y - this.offset.y) * ratio};
        this.scale = next;
        this.clampOffset();
    }

    panBy(delta: Point): void {
        this.offset = {x: this.offset.x + delta.x, y: this.offset.y + delta.y};
        this.clampOffset();
    }

    zoomBy(factor: number): void {
        this.zoomAt({x: this.width / 2, y: this.height / 2}, factor);
    }

    focusOn(point: Point, scale: number, dt: number): void {
        const blend = 1 - Math.exp(-Math.max(0, dt) / 0.18);
        this.scale += (clamp(scale, 1, 15) - this.scale) * blend;
        const target = {
            x: clamp(this.width / 2 - point.x * this.width * this.scale, -(this.scale - 1) * this.width, 0),
            y: clamp(this.height / 2 - point.y * this.height * this.scale, -(this.scale - 1) * this.height, 0)
        };
        this.offset = {
            x: this.offset.x + (target.x - this.offset.x) * blend,
            y: this.offset.y + (target.y - this.offset.y) * blend
        };
        this.clampOffset();
    }

    private clampOffset(): void {
        this.offset = {
            x: clamp(this.offset.x, -(this.scale - 1) * this.width, 0),
            y: clamp(this.offset.y, -(this.scale - 1) * this.height, 0)
        };
    }
}
