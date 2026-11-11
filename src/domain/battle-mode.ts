import type {BattleObject} from './battle.ts';
import type {MapGeometry} from './geometry.ts';

export type BattleModeKind = 'domination' | 'conquest' | 'battle';

export interface BattleModeVariant {
    readonly id: string;
    readonly kind: BattleModeKind;
    readonly size: number;
    readonly tileSize: number;
}

export interface BattleModeDetection {
    readonly kind: BattleModeKind | 'unknown';
    readonly variantId?: string;
    readonly candidates: readonly string[];
}

export function determineBattleMode(objects: readonly BattleObject[], geometry: MapGeometry | null, variants: readonly BattleModeVariant[] = []): BattleModeDetection {
    // These rules describe standard ground missions, not air/naval objectives or PvE.
    if (!objects.some(object => object.kind === 'point' && object.spawnType === 'tank')) return {kind: 'unknown', candidates: []};
    const zones = new Set(objects.flatMap(object => object.kind === 'point' && object.icon === 'capture_zone'
        ? [object.captureLabel ?? `${object.position.x}:${object.position.y}`] : []));
    const kind: BattleModeKind | 'unknown' = zones.size === 3 ? 'domination' : zones.size === 1 ? 'conquest' : zones.size === 2 ? 'battle' : 'unknown';
    if (kind === 'unknown') return {kind, candidates: []};
    // A complete grid size and step are required to name a numbered map variant.
    const size = geometry?.gridSize;
    if (!geometry || !size) return {kind, candidates: []};
    const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1;
    const candidates = variants.filter(variant => variant.kind === kind &&
        near(variant.size, size.x) && near(variant.size, size.y) &&
        near(variant.tileSize, geometry.gridStep.x) && near(variant.tileSize, geometry.gridStep.y)).map(variant => variant.id);
    return {kind, candidates, ...(candidates.length === 1 ? {variantId: candidates[0]} : {})};
}
