import type {BattleModeVariant} from './battle-mode.ts';

export interface MapCatalogEntry {
    readonly id: string;
    readonly name: string;
    readonly aliases: readonly string[];
    readonly variants: readonly BattleModeVariant[];
    readonly hashes: readonly string[];
}
