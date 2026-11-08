import type {VehicleClass} from '../domain/battle.ts';

// Class silhouettes follow the game's visual vocabulary: bar, bridge, turret,
// angled gun and twin AA barrels. Coordinates share a 24-unit-wide view box.
export const vehicleSymbols: Readonly<Record<VehicleClass, string>> = {
    'light-tank': 'M-12-3H12V3H-12Z',
    'medium-tank': 'M-12-5H12V7H6V1H-6V7H-12Z',
    'heavy-tank': 'M-4-10H4V-5H12V7H6V1H-6V7H-12V-5H-4Z',
    'tank-destroyer': 'M-12 2H-3L-11-7L-7-10L3 2H12V8H-12Z',
    'anti-air': 'M-9-10H-4V2H4V-10H9V2H12V8H-12V2H-9Z',
    'ground-vehicle': 'M-4-9H4V-4H10L12 1L8 6H-8L-12 1L-10-4H-4ZM4-7H12V-4H4Z',
    fighter: 'M0-12L10 0L0 12L-10 0Z',
    bomber: 'M-12-9H12L0 12Z',
    attacker: 'M-13 0L0-8L13 0L0 8Z',
    helicopter: 'M-2-12H2V-5H12V-1H2V8H6V11H-6V8H-2V-1H-12V-5H-2Z',
    aircraft: 'M-2-12H2L4-2L12 3V6L3 3L2 9L6 11V13L0 11L-6 13V11L-2 9L-3 3L-12 6V3L-4-2Z',
    ship: 'M0-13L7-4L6 10L0 13L-6 10L-7-4ZM-2-7H2V7H-2Z',
    boat: 'M0-12L6-2L4 10H-4L-6-2Z'
};
