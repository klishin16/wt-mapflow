import type {PointObject} from '../domain/battle.ts';
import type {Point} from '../domain/geometry.ts';
import {vehicleSymbols} from './vehicle-symbols.ts';
import {gameSymbols} from './game-symbols.ts';

const playerSymbol = 'M0-13L9 11L0 6L-9 11Z';
const unknownSymbol = 'M0-10L10 0L0 10L-10 0Z';
const tankSpawnSymbol = 'M-8-12H-5V10H-8ZM-5-11H11L7-5L11 1H-5ZM-12 10H2V13H-12Z';
const vehicleScale = 0.65;
const playerScale = 0.85;
const aircraftMapScale = 0.7;

export class MarkerRenderer {
    private readonly paths = new Map<string, Path2D>();
    private size = 32;
    private mapScale = 1;

    setAircraftMap(enabled: boolean): void { this.mapScale = enabled ? aircraftMapScale : 1; }

    setSize(size: number): void {
        if (Number.isFinite(size)) this.size = Math.max(20, Math.min(48, size));
    }

    drawObject(context: CanvasRenderingContext2D, object: PointObject, position: Point, color: string): void {
        const symbol = object.spawnType === 'tank' ? tankSpawnSymbol :
            gameSymbols[object.icon] ?? (object.vehicleClass ? vehicleSymbols[object.vehicleClass] : unknownSymbol);
        const angle = object.rotates ? Math.atan2(object.direction.x, -object.direction.y) : 0;
        const emphasis = object.spawnType || gameSymbols[object.icon] ? 1 : vehicleScale;
        this.draw(context, symbol, position, color, angle, emphasis);
    }

    drawPlayer(context: CanvasRenderingContext2D, position: Point, angle: number): void {
        this.draw(context, playerSymbol, position, '#fff', angle + Math.PI / 2, playerScale);
    }

    private draw(context: CanvasRenderingContext2D, symbol: string, position: Point, color: string, angle: number, emphasis = 1): void {
        let path = this.paths.get(symbol);
        if (!path) {
            path = new Path2D(symbol);
            this.paths.set(symbol, path);
        }
        context.save();
        context.translate(position.x, position.y);
        context.rotate(angle);
        const scale = this.size / 24 * emphasis * this.mapScale;
        context.scale(scale, scale);
        context.lineJoin = 'round';
        context.lineCap = 'round';
        // A light outer edge and dark inner edge work on both snow and foliage.
        context.strokeStyle = 'rgba(255,255,255,0.75)';
        context.lineWidth = 4;
        context.stroke(path);
        context.strokeStyle = '#131920';
        context.lineWidth = 2.3;
        context.stroke(path);
        context.fillStyle = color;
        context.fill(path);
        context.restore();
    }
}
