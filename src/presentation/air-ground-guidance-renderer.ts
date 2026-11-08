import type {AirGroundGuidance, GroundSpawnTarget} from '../domain/air-ground-guidance.ts';
import type {Point} from '../domain/geometry.ts';
import {Camera} from './camera.ts';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

export function spawnDistance(distance: number | null): string {
    if (distance === null) return '';
    return distance >= 1000 ? `${(distance / 1000).toFixed(1).replace('.', ',')} км` : `${Math.round(distance)} м`;
}

export function spawnGuidanceLabel(target: GroundSpawnTarget): string {
    const heading = `${Math.round(target.bearingDegrees) % 360}°`;
    const turn = target.turnDegrees;
    const correction = turn === null ? '' : Math.abs(turn) < 3 ? 'по курсу' : `${turn > 0 ? 'вправо' : 'влево'} ${Math.round(Math.abs(turn))}°`;
    return ['Ближний танковый спавн', spawnDistance(target.distanceMeters), `курс ${heading}`, correction].filter(Boolean).join(' · ');
}

function clipLine(start: Point, end: Point, width: number, height: number): {start: Point; end: Point} | null {
    const margin = Math.min(18, width / 4, height / 4);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let from = 0;
    let to = 1;
    for (const [p, q] of [[-dx, start.x - margin], [dx, width - margin - start.x], [-dy, start.y - margin], [dy, height - margin - start.y]]) {
        if (Math.abs(p) < 0.000001) { if (q < 0) return null; continue; }
        const ratio = q / p;
        if (p < 0) from = Math.max(from, ratio);
        else to = Math.min(to, ratio);
        if (from > to) return null;
    }
    return {start: {x: start.x + from * dx, y: start.y + from * dy}, end: {x: start.x + to * dx, y: start.y + to * dy}};
}

export class AirGroundGuidanceRenderer {
    draw(context: CanvasRenderingContext2D, camera: Camera, guidance: AirGroundGuidance, player: Point, width: number, height: number): void {
        const origin = camera.mapToScreen(player);
        // Draw the nearest route last, above the quieter secondary routes.
        for (let index = guidance.targets.length - 1; index >= 0; index--) {
            const target = guidance.targets[index];
            const endpoint = camera.mapToScreen(target.spawn.position);
            const segment = clipLine(origin, endpoint, width, height);
            if (!segment) continue;
            const angle = Math.atan2(endpoint.y - origin.y, endpoint.x - origin.x);
            const nearest = index === 0;
            const outside = endpoint.x < 18 || endpoint.x > width - 18 || endpoint.y < 18 || endpoint.y > height - 18;
            context.save();
            context.lineJoin = 'round';
            context.lineCap = 'round';
            if (!nearest) context.setLineDash([7, 7]);
            context.beginPath();
            context.moveTo(segment.start.x, segment.start.y);
            context.lineTo(segment.end.x, segment.end.y);
            context.strokeStyle = nearest ? 'rgba(12,23,31,0.85)' : 'rgba(12,23,31,0.5)';
            context.lineWidth = nearest ? 5 : 3;
            context.stroke();
            context.strokeStyle = nearest ? '#8ad5ff' : 'rgba(138,213,255,0.5)';
            context.lineWidth = nearest ? 2.5 : 1.3;
            context.stroke();
            context.setLineDash([]);
            if (outside) {
                const tip = segment.end;
                context.beginPath();
                context.moveTo(tip.x, tip.y);
                context.lineTo(tip.x - 12 * Math.cos(angle - 0.5), tip.y - 12 * Math.sin(angle - 0.5));
                context.lineTo(tip.x - 12 * Math.cos(angle + 0.5), tip.y - 12 * Math.sin(angle + 0.5));
                context.closePath();
                context.fillStyle = nearest ? '#8ad5ff' : '#7199b0';
                context.strokeStyle = '#13212c';
                context.lineWidth = 2;
                context.stroke();
                context.fill();
            }
            if (nearest) {
                const anchor = outside ? {
                    x: segment.end.x - 35 * Math.cos(angle), y: segment.end.y - 35 * Math.sin(angle)
                } : {x: segment.start.x + (segment.end.x - segment.start.x) * 0.6, y: segment.start.y + (segment.end.y - segment.start.y) * 0.6};
                this.label(context, [spawnDistance(target.distanceMeters), `${Math.round(target.bearingDegrees) % 360}°`].filter(Boolean).join(' · '), anchor, width, height);
            }
            context.restore();
        }
    }

    private label(context: CanvasRenderingContext2D, text: string, anchor: Point, width: number, height: number): void {
        context.font = '12px Tahoma, sans-serif';
        const boxWidth = context.measureText(text).width + 12;
        if (width < boxWidth + 12 || height < 36) return;
        const x = clamp(anchor.x - boxWidth / 2, 6, width - boxWidth - 6);
        const y = clamp(anchor.y - 26, 6, height - 28);
        context.fillStyle = 'rgba(19,29,38,0.92)';
        context.fillRect(x, y, boxWidth, 22);
        context.fillStyle = '#bcE8ff';
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        context.fillText(text, x + 6, y + 11);
    }
}
