import type {MapInfo, VehicleClass} from '../domain/battle.ts';
import {isAircraftClass} from '../domain/air-ground-guidance.ts';
import {isSameMap} from '../domain/map-identity.ts';

function extent(info: MapInfo): number {
    const geometry = info.geometry;
    return geometry ? Math.max(geometry.gridSize?.x ?? geometry.max.x - geometry.min.x,
        geometry.gridSize?.y ?? geometry.max.y - geometry.min.y) : 0;
}

/** Remember the aircraft map while the pilot temporarily opens its ground counterpart. */
export class AircraftMapOverview {
    private aircraftMap: MapInfo | null = null;

    update(info: MapInfo | null, vehicleClass?: VehicleClass): boolean {
        if (!info || (this.aircraftMap && info.generation !== this.aircraftMap.generation) ||
            (vehicleClass !== undefined && !isAircraftClass(vehicleClass))) this.aircraftMap = null;
        if (!info) return false;
        if (!this.aircraftMap) {
            if (isAircraftClass(vehicleClass)) this.aircraftMap = info;
            return false;
        }
        if (isSameMap(info, this.aircraftMap)) return false;
        const size = extent(info);
        const aircraftSize = extent(this.aircraftMap);
        if (size > aircraftSize) {
            this.aircraftMap = info;
            return false;
        }
        return size < aircraftSize || info.hudType !== this.aircraftMap.hudType;
    }
}
