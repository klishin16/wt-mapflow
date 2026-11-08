import type {MapImageSource, PositionChange, RatlineImporter, RatlineImportOptions, RatlineImportPreview} from '../../application/ports.ts';
import type {ImageDimensions, Point} from '../../domain/geometry.ts';
import type {TacticalPosition} from '../../domain/position.ts';
import {normalizedPoint, normalizePixels} from '../../domain/geometry.ts';
import {decodePosition} from './position-codec.ts';
import {maps} from '../maps/catalog.ts';
import {finiteNumber, isRecord} from '../records.ts';
import {decodeLegacyMap} from './legacy-import.ts';

interface ParsedRoute {
    readonly record: Record<string, unknown>;
    readonly points: readonly Point[];
    readonly field: string;
}

function point(value: unknown, order: 'xy' | 'yx'): Point | null {
    if (isRecord(value)) {
        if (finiteNumber(value.x) && finiteNumber(value.y)) return {x: value.x, y: value.y};
        if (finiteNumber(value.lat) && finiteNumber(value.lng)) return {x: value.lng, y: value.lat};
    }
    if (Array.isArray(value) && value.length === 2 && finiteNumber(value[0]) && finiteNumber(value[1])) {
        return order === 'xy' ? {x: value[0], y: value[1]} : {x: value[1], y: value[0]};
    }
    return null;
}

function pointArray(value: unknown, order: 'xy' | 'yx', allowFlat: boolean): readonly Point[] | null {
    if (!Array.isArray(value) || value.length < 2) return null;
    if (allowFlat && value.length >= 4 && value.length % 2 === 0 && value.every(finiteNumber)) {
        const result: Point[] = [];
        for (let index = 0; index < value.length; index += 2) {
            result.push(order === 'xy' ? {x: value[index], y: value[index + 1]} : {x: value[index + 1], y: value[index]});
        }
        return result;
    }
    const points = value.map(item => point(item, order));
    return points.every((value): value is Point => value !== null) ? points : null;
}

function fieldValue(record: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((value, key) => isRecord(value) && Object.hasOwn(value, key) ? value[key] : undefined, record);
}

function routeGeometry(value: unknown, index: number, options: RatlineImportOptions): ParsedRoute {
    const direct = pointArray(value, options.pairOrder, true);
    if (direct) return {record: {}, points: direct, field: '(сам массив маршрута)'};
    if (!isRecord(value)) throw new Error(`Маршрут ${index + 1}: ожидается объект или массив точек`);
    if (!options.routeField?.trim() && Array.isArray(value.segments)) {
        if (!value.segments.length) throw new Error(`Маршрут ${index + 1}: пустой список segments`);
        const joined: Point[] = [];
        for (const segment of value.segments) {
            const points = isRecord(segment) ? pointArray(segment.points, options.pairOrder, false) : null;
            if (!points) throw new Error(`Маршрут ${index + 1}: некорректный segments[].points`);
            const previous = joined.at(-1);
            const first = points[0];
            if (previous && Math.hypot(previous.x - first.x, previous.y - first.y) > 0.000001) {
                throw new Error(`Маршрут ${index + 1}: сегменты не соединены`);
            }
            joined.push(...(previous ? points.slice(1) : points));
        }
        return {record: value, points: joined, field: 'segments[].points'};
    }
    if (options.routeField?.trim()) {
        const points = pointArray(fieldValue(value, options.routeField.trim()), options.pairOrder, true);
        if (!points) throw new Error(`Маршрут ${index + 1}: поле «${options.routeField}» не содержит путь из точек`);
        return {record: value, points, field: options.routeField.trim()};
    }
    const candidates: {points: readonly Point[]; field: string}[] = [];
    const visit = (record: Record<string, unknown>, prefix: string, depth: number): void => {
        for (const [key, item] of Object.entries(record)) {
            if (/^(color|rgba?|tags|images|screenshots|bounds|bbox|size|dimensions)$/i.test(key)) continue;
            const field = prefix ? `${prefix}.${key}` : key;
            const points = pointArray(item, options.pairOrder, false);
            if (points) candidates.push({points, field});
            else if (depth < 2 && isRecord(item)) visit(item, field, depth + 1);
        }
    };
    visit(value, '', 0);
    if (candidates.length !== 1) {
        throw new Error(candidates.length ?
            `Маршрут ${index + 1}: несколько массивов координат (${candidates.map(item => item.field).join(', ')}). Укажи поле пути в настройках.` :
            `Маршрут ${index + 1}: не найден массив точек. Поля: ${Object.keys(value).join(', ')}. Нужен JSON с геометрией, а не только описанием.`);
    }
    return {record: value, ...candidates[0]};
}

function stableId(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(16);
}

function approved(value: unknown): boolean {
    return !isRecord(value) || (value.isPrivate !== true && (value.status === undefined || value.status === 'approved'));
}

function canonicalMapId(name: string): string {
    const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    return Object.values(maps).find(map => map && normalize(map.name) === normalize(name))?.name ?? name;
}

export class RatlineMapImporter implements RatlineImporter {
    private readonly images: MapImageSource<HTMLImageElement>;

    constructor(images: MapImageSource<HTMLImageElement>) { this.images = images; }

    async preview(file: Blob, options: RatlineImportOptions): Promise<RatlineImportPreview> {
        if (file.size > 20 * 1024 * 1024) throw new Error('JSON Ratline должен быть не больше 20 МБ');
        const payload: unknown = JSON.parse(await file.text());
        const raw = isRecord(payload) && isRecord(payload.map) ? payload.map : payload;
        if (!isRecord(raw) || typeof raw.mapName !== 'string' || !raw.mapName.trim()) throw new Error('Нужен JSON одной карты Ratline с mapName, pins и routes');
        if (raw.mapName.length > 128) throw new Error('Слишком длинное название карты');
        if (!Array.isArray(raw.routes)) throw new Error('В JSON отсутствует массив routes');
        if (raw.pins !== undefined && !Array.isArray(raw.pins)) throw new Error('Некорректный массив pins');
        if (raw.routes.length > 1000) throw new Error('В одной карте поддерживается до 1000 маршрутов');
        const routes = raw.routes.filter(approved).map((route, index) => routeGeometry(route, index, options));
        for (let index = 0; index < routes.length; index++) {
            if (routes[index].points.length > 256) throw new Error(`Маршрут ${index + 1}: ${routes[index].points.length} точек, поддерживается до 256. Путь не был обрезан.`);
        }
        const rawPins = Array.isArray(raw.pins) ? raw.pins.filter(approved) : [];
        if (rawPins.length > 5000) throw new Error('В одной карте поддерживается до 5000 позиций');
        if (rawPins.some(pin => !isRecord(pin) || !finiteNumber(pin.x) || !finiteNumber(pin.y))) {
            throw new Error('В pins есть позиция без числовых координат x и y');
        }
        const map = decodeLegacyMap({map: {...raw, pins: rawPins}});
        const mapId = options.targetMapId || canonicalMapId(raw.mapName.trim());
        let imageUrl: string | undefined;
        if (map.imageUrl) {
            const url = new URL(map.imageUrl);
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Некорректный адрес изображения карты');
            imageUrl = url.href;
        }
        const normalized = (points: readonly Point[], explicit?: string): boolean => {
            const mode = options.coordinates === 'auto' ? explicit : options.coordinates;
            return mode === 'normalized' || (mode !== 'pixels' && points.every(point => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
        };
        const needsDimensions = map.pins.some(pin => !normalized([pin], pin.coordinateSpace)) ||
            routes.some(route => !normalized(route.points, typeof route.record.coordinateSpace === 'string' ? route.record.coordinateSpace : undefined));
        let dimensions: ImageDimensions | undefined;
        if (options.width !== undefined || options.height !== undefined) {
            if (!options.width || !options.height || !Number.isFinite(options.width) || !Number.isFinite(options.height) || options.width < 1 || options.height < 1) {
                throw new Error('Укажи обе положительные величины: ширину и высоту исходной карты');
            }
            dimensions = {width: options.width, height: options.height};
        } else if (needsDimensions) {
            if (!imageUrl) throw new Error('Для пиксельных координат нужны размеры карты или imageUrl');
            const image = await this.images.load(imageUrl);
            dimensions = {width: image.naturalWidth, height: image.naturalHeight};
        }
        const convert = (points: readonly Point[], explicit?: string): readonly Point[] => {
            const useNormalized = normalized(points, explicit);
            return points.map(point => {
                const result = useNormalized ? normalizedPoint(point.x, point.y) : dimensions ? normalizePixels(point, dimensions) : null;
                if (!result) throw new Error('Координаты выходят за карту. Проверь единицы, размеры изображения и порядок X/Y');
                return options.flipY ? {x: result.x, y: 1 - result.y} : result;
            });
        };
        const source = (id?: string): NonNullable<TacticalPosition['source']> => ({provider: 'ratline', url: 'https://ratline.site/maps', externalId: id});
        const positions: TacticalPosition[] = map.pins.map((pin, index) => ({
            id: pin.id ?? `ratline-pin:${stableId(JSON.stringify([mapId, pin.x, pin.y, pin.description]))}`,
            mapId, variantId: options.variantId, point: convert([pin], pin.coordinateSpace)[0], title: pin.title === 'Тактическая позиция' ? `Позиция Ratline · ${index + 1}` : pin.title,
            description: pin.description, screenshots: pin.imageUrl ? [pin.imageUrl] : [], source: source(pin.id), triggerRadiusMeters: 100
        }));
        for (const [index, route] of routes.entries()) {
            const path = convert(route.points, typeof route.record.coordinateSpace === 'string' ? route.record.coordinateSpace : undefined);
            const id = typeof route.record._id === 'string' ? route.record._id : typeof route.record.id === 'string' ? route.record.id : stableId(JSON.stringify([mapId, route.points]));
            const name = typeof route.record.title === 'string' ? route.record.title : typeof route.record.name === 'string' ? route.record.name : String(index + 1);
            positions.push({
                id: `ratline-route:${id}`, mapId, variantId: options.variantId,
                point: path[path.length - 1], approachPath: path,
                title: `Маршрут Ratline · ${name}`.slice(0, 120),
                description: typeof route.record.description === 'string' ? route.record.description : '',
                screenshots: typeof route.record.imageUrl === 'string' ? [route.record.imageUrl] : [],
                source: source(id), triggerRadiusMeters: 100
            });
        }
        const ids = new Set<string>();
        const changes: PositionChange[] = positions.map(position => {
            if (ids.has(position.id)) throw new Error(`Повторяющийся id позиции: ${position.id}`);
            ids.add(position.id);
            const decoded = decodePosition(position);
            return {id: decoded.id, mapId, position: decoded};
        });
        return {
            backup: {version: 1, changes, attachments: []}, mapId, sourceMapName: raw.mapName,
            imageUrl, pinCount: map.pins.length, routeCount: routes.length,
            routeFields: [...new Set(routes.map(route => route.field))]
        };
    }
}
