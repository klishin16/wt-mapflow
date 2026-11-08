import type {PositionChange} from '../../application/ports.ts';
import type {Point} from '../../domain/geometry.ts';
import type {TacticalPosition} from '../../domain/position.ts';
import {validatePositionDraft} from '../../domain/position.ts';
import {finiteNumber, isRecord} from '../records.ts';

function text(value: unknown, name: string, limit: number): string {
    if (typeof value !== 'string' || value.length > limit) throw new Error(`Некорректное поле: ${name}`);
    return value;
}

function point(value: unknown): Point {
    if (!isRecord(value) || !finiteNumber(value.x) || !finiteNumber(value.y)) throw new Error('Некорректные координаты позиции');
    return {x: value.x, y: value.y};
}

export function decodePosition(value: unknown): TacticalPosition {
    if (!isRecord(value) || !Array.isArray(value.screenshots)) throw new Error('Некорректная позиция');
    const screenshots = value.screenshots.map((reference: unknown) => {
        const result = text(reference, 'скриншот', 4096);
        if (!/^local:[\w-]+$/.test(result) && !/^https?:\/\//i.test(result)) throw new Error('Некорректная ссылка на скриншот');
        return result;
    });
    if (value.approachPath !== undefined && (!Array.isArray(value.approachPath) || value.approachPath.length > 256)) {
        throw new Error('Некорректный путь до позиции');
    }
    let source: TacticalPosition['source'];
    if (value.source !== undefined) {
        if (!isRecord(value.source) || value.source.provider !== 'ratline' || typeof value.source.url !== 'string') throw new Error('Некорректный источник позиции');
        const url = new URL(value.source.url);
        if (url.protocol !== 'https:' || url.hostname !== 'ratline.site') throw new Error('Некорректная ссылка Ratline');
        source = {provider: 'ratline', url: url.href,
            externalId: typeof value.source.externalId === 'string' ? value.source.externalId.slice(0, 200) : undefined};
    }
    const position: TacticalPosition = {
        id: text(value.id, 'id', 256), mapId: text(value.mapId, 'карта', 256),
        point: point(value.point), title: text(value.title, 'название', 120),
        description: text(value.description, 'описание', 10000), screenshots,
        aimPoint: value.aimPoint === undefined ? undefined : point(value.aimPoint),
        approachPath: value.approachPath === undefined ? undefined : (value.approachPath as unknown[]).map(point),
        spawnPoint: value.spawnPoint === undefined ? undefined : point(value.spawnPoint),
        triggerRadiusMeters: finiteNumber(value.triggerRadiusMeters) ? value.triggerRadiusMeters : 100,
        variantId: value.variantId === undefined ? undefined : text(value.variantId, 'вариант карты', 512),
        createdAt: value.createdAt === undefined ? undefined : text(value.createdAt, 'дата', 64),
        updatedAt: value.updatedAt === undefined ? undefined : text(value.updatedAt, 'дата', 64),
        source
    };
    if (!position.id || !position.mapId) throw new Error('Не задан идентификатор позиции или карты');
    validatePositionDraft({...position, triggerRadiusMeters: position.triggerRadiusMeters ?? 100});
    return position;
}

export function decodePositionChange(value: unknown): PositionChange {
    if (!isRecord(value)) throw new Error('Некорректная запись позиции');
    const id = text(value.id, 'id', 256);
    const mapId = text(value.mapId, 'карта', 256);
    const position = value.position === null ? null : decodePosition(value.position);
    if (!id || !mapId || (position && (position.id !== id || position.mapId !== mapId))) throw new Error('Идентификаторы позиции не совпадают');
    return {id, mapId, position};
}
