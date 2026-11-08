import type {MapGeometry, Point} from './geometry.ts';
import {normalizedPoint} from './geometry.ts';

export interface TacticalPosition {
    readonly id: string;
    readonly mapId: string;
    readonly point: Point;
    readonly title: string;
    readonly description: string;
    readonly screenshots: readonly string[];
    readonly aimPoint?: Point;
    readonly approachPath?: readonly Point[];
    readonly spawnPoint?: Point;
    readonly triggerRadiusMeters?: number;
    readonly variantId?: string;
    readonly createdAt?: string;
    readonly updatedAt?: string;
    readonly source?: {readonly provider: 'ratline'; readonly url: string; readonly externalId?: string};
}

export interface PositionDraft {
    readonly point: Point;
    readonly title: string;
    readonly description: string;
    readonly screenshots: readonly string[];
    readonly aimPoint?: Point;
    readonly approachPath?: readonly Point[];
    readonly spawnPoint?: Point;
    readonly triggerRadiusMeters: number;
}

export function validatePositionDraft(draft: PositionDraft): void {
    if (!draft.title.trim() || draft.title.trim().length > 120) throw new Error('Название: от 1 до 120 символов');
    if (draft.description.length > 10000) throw new Error('Описание: не более 10 000 символов');
    if (!normalizedPoint(draft.point.x, draft.point.y)) throw new Error('Позиция должна находиться внутри карты');
    if (draft.aimPoint && !normalizedPoint(draft.aimPoint.x, draft.aimPoint.y)) throw new Error('Направление должно указывать внутрь карты');
    if (draft.spawnPoint && !normalizedPoint(draft.spawnPoint.x, draft.spawnPoint.y)) throw new Error('Некорректная привязка к спавну');
    if (draft.approachPath) {
        const path = draft.approachPath;
        if (path.length < 2 || path.length > 256) throw new Error('Путь должен содержать от 2 до 256 точек');
        if (path.some(point => !normalizedPoint(point.x, point.y))) throw new Error('Путь должен находиться внутри карты');
        const end = path[path.length - 1];
        if (Math.hypot(end.x - draft.point.x, end.y - draft.point.y) > 0.000001) throw new Error('Путь должен заканчиваться на позиции');
        if (path.every(point => Math.hypot(point.x - end.x, point.y - end.y) < 0.000001)) throw new Error('Укажи начало пути отдельно от позиции');
    }
    if (draft.screenshots.length > 6) throw new Error('Можно прикрепить не более 6 скриншотов');
    if (!Number.isFinite(draft.triggerRadiusMeters) || draft.triggerRadiusMeters < 20 || draft.triggerRadiusMeters > 2000) {
        throw new Error('Радиус подсказки: от 20 до 2000 метров');
    }
}

export function approachPathLength(position: TacticalPosition, geometry: MapGeometry): number {
    const path = position.approachPath ?? [];
    return path.slice(1).reduce((sum, point, index) => sum + mapDistanceMeters(path[index], point, geometry), 0);
}

export function mapDistanceMeters(a: Point, b: Point, geometry: MapGeometry): number {
    return Math.hypot((a.x - b.x) * (geometry.max.x - geometry.min.x), (a.y - b.y) * (geometry.max.y - geometry.min.y));
}

export function appliesToSpawn(position: TacticalPosition, spawn: Point | null, geometry: MapGeometry | null): boolean {
    if (!position.spawnPoint || !spawn) return true;
    return geometry ? mapDistanceMeters(position.spawnPoint, spawn, geometry) <= 300 :
        Math.hypot(position.spawnPoint.x - spawn.x, position.spawnPoint.y - spawn.y) <= 0.035;
}
