import type {MapGeometry, Point} from './geometry.ts';

export interface MapGrid {
    /** Origin, extent and spacing in normalized image coordinates (Y down). */
    readonly origin: Point;
    readonly size: Point;
    readonly step: Point;
    readonly columns: number;
    readonly rows: number;
}

export function mapGrid(geometry: MapGeometry): MapGrid | null {
    const width = geometry.max.x - geometry.min.x;
    const height = geometry.max.y - geometry.min.y;
    const size = geometry.gridSize ?? {x: width, y: height};
    if (![width, height, size.x, size.y, geometry.gridStep.x, geometry.gridStep.y].every(value => Number.isFinite(value) && value > 0)) return null;
    // grid_zero is a world-space top-left corner: world Y increases upwards,
    // while the map image and telemetry markers use Y downwards.
    const zero = geometry.gridOrigin ?? {x: geometry.min.x, y: geometry.max.y};
    if (!Number.isFinite(zero.x) || !Number.isFinite(zero.y)) return null;
    const columns = Math.ceil(size.x / geometry.gridStep.x);
    const rows = Math.ceil(size.y / geometry.gridStep.y);
    if (!Number.isSafeInteger(columns) || !Number.isSafeInteger(rows)) return null;
    return {
        origin: {x: (zero.x - geometry.min.x) / width, y: (geometry.max.y - zero.y) / height},
        size: {x: size.x / width, y: size.y / height},
        step: {x: geometry.gridStep.x / width, y: geometry.gridStep.y / height},
        columns, rows
    };
}

export function gridRowLabel(index: number): string {
    let label = '';
    for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) label = String.fromCharCode(65 + (value - 1) % 26) + label;
    return label;
}

export function mapGridLabel(point: Point, geometry: MapGeometry): string | null {
    const grid = mapGrid(geometry);
    if (!grid || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return null;
    const x = point.x - grid.origin.x;
    const y = point.y - grid.origin.y;
    // The final row/column can be partial when grid_size is not a multiple of grid_steps.
    if (x < 0 || y < 0 || x >= grid.size.x || y >= grid.size.y) return null;
    const column = Math.floor(x / grid.step.x);
    const row = Math.floor(y / grid.step.y);
    return `${gridRowLabel(row)}${column + 1}`;
}
