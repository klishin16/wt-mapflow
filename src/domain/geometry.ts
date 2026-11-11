export interface Point {
    readonly x: number;
    readonly y: number;
}

export interface ImageDimensions {
    readonly width: number;
    readonly height: number;
}

export interface MapGeometry {
    readonly min: Point;
    readonly max: Point;
    readonly gridStep: Point;
    /** World-space top-left origin of the named grid (grid_zero). */
    readonly gridOrigin?: Point;
    /** World-space width and height covered by the named grid (grid_size). */
    readonly gridSize?: Point;
}

export function normalizedPoint(x: number, y: number): Point | null {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
    return {x, y};
}

export function normalizePixels(point: Point, dimensions: ImageDimensions): Point | null {
    if (!Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) ||
        dimensions.width <= 0 || dimensions.height <= 0) {
        throw new Error('Неизвестны размеры исходной карты для пиксельных позиций');
    }
    return normalizedPoint(point.x / dimensions.width, point.y / dimensions.height);
}
