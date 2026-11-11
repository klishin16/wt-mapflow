import type {Point} from '../domain/geometry.ts';
import {Camera} from './camera.ts';

export function drawPositionRoute(context: CanvasRenderingContext2D, camera: Camera, path: readonly Point[], editing: boolean, overview = false): void {
    if (path.length < 2) return;
    const points = path.map(point => camera.mapToScreen(point));
    context.save();
    if (overview) context.globalAlpha *= 0.55;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.strokeStyle = 'rgba(12,25,17,0.9)';
    context.lineWidth = overview ? 4 : 6;
    context.stroke();
    if (editing) context.setLineDash([9, 5]);
    context.strokeStyle = '#82e6a5';
    context.lineWidth = overview ? 2 : 3;
    context.stroke();
    context.setLineDash([]);
    // The arrows indicate travel order; the last point is the tactical position.
    for (let index = 1; index < points.length; index++) {
        const start = points[index - 1];
        const end = points[index];
        if (Math.hypot(end.x - start.x, end.y - start.y) < 35) continue;
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const middle = {x: (start.x + end.x) / 2, y: (start.y + end.y) / 2};
        context.beginPath();
        context.moveTo(middle.x - 8 * Math.cos(angle - 0.5), middle.y - 8 * Math.sin(angle - 0.5));
        context.lineTo(middle.x, middle.y);
        context.lineTo(middle.x - 8 * Math.cos(angle + 0.5), middle.y - 8 * Math.sin(angle + 0.5));
        context.stroke();
    }
    for (let index = 0; index < points.length - 1; index++) {
        if (overview && index > 0) continue;
        const point = points[index];
        context.beginPath();
        context.arc(point.x, point.y, index === 0 && !overview ? 6 : 4, 0, Math.PI * 2);
        context.fillStyle = '#c9f6d8';
        context.strokeStyle = '#163622';
        context.lineWidth = 2;
        context.fill();
        context.stroke();
        if (!overview && ((editing && points.length <= 60) || index === 0)) {
            const text = editing ? String(index + 1) : 'Старт';
            context.font = '12px Tahoma, sans-serif';
            context.textAlign = 'left';
            context.textBaseline = 'bottom';
            context.lineWidth = 3;
            context.strokeStyle = '#13251a';
            context.strokeText(text, point.x + 9, point.y - 6);
            context.fillStyle = '#c9f6d8';
            context.fillText(text, point.x + 9, point.y - 6);
        }
    }
    context.restore();
}
