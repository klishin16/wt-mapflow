import type {BattleModeVariant} from '../domain/battle-mode.ts';
import type {BattleMap, BattleObject, MapInfo} from '../domain/battle.ts';
import type {TacticalPosition} from '../domain/position.ts';

export interface LoadOptions {
    readonly signal?: AbortSignal;
}

export interface PositionSet {
    readonly positions: readonly TacticalPosition[];
    readonly missing: boolean;
    readonly warning?: string;
}

export interface PositionRepository {
    list(mapId: string, options?: LoadOptions): Promise<PositionSet>;
}

export interface PositionChange {
    readonly mapId: string;
    readonly id: string;
    readonly position: TacticalPosition | null;
}

export interface PositionAttachment {
    readonly id: string;
    readonly name: string;
    readonly blob: Blob;
}

export interface PositionBackup {
    readonly version: 1;
    readonly changes: readonly PositionChange[];
    readonly attachments: readonly PositionAttachment[];
}

export interface PersonalPositionStore {
    list(mapId: string): Promise<readonly PositionChange[]>;
    put(change: PositionChange, attachments?: readonly PositionAttachment[]): Promise<void>;
    getAttachment(id: string): Promise<PositionAttachment | null>;
    snapshot(): Promise<PositionBackup>;
    restore(backup: PositionBackup): Promise<void>;
}

export interface ScreenshotInput {
    readonly name: string;
    readonly blob: Blob;
}

export interface ScreenshotProcessor {
    prepare(input: ScreenshotInput, id: string): Promise<PositionAttachment>;
}

export interface PositionBackupCodec {
    encode(backup: PositionBackup): Promise<Blob>;
    decode(file: Blob): Promise<PositionBackup>;
}

export interface RatlineImportOptions {
    readonly coordinates: 'auto' | 'normalized' | 'pixels';
    readonly pairOrder: 'xy' | 'yx';
    readonly flipY: boolean;
    readonly routeField?: string;
    readonly width?: number;
    readonly height?: number;
    readonly targetMapId?: string;
    readonly variantId?: string;
}

export interface RatlineImportPreview {
    readonly backup: PositionBackup;
    readonly sourceMapName: string;
    readonly mapId: string;
    readonly imageUrl?: string;
    readonly pinCount: number;
    readonly routeCount: number;
    readonly routeFields: readonly string[];
}

export interface RatlineImporter {
    preview(file: Blob, options: RatlineImportOptions): Promise<RatlineImportPreview>;
}

export interface MapImageSource<Image> {
    load(url: string, options?: LoadOptions): Promise<Image>;
}

export type MapRecognizer<Image> = (image: Image) => Promise<string | null>;

export interface TelemetryGateway {
    readMap(signal: AbortSignal): Promise<BattleMap>;
    readObjects(signal: AbortSignal): Promise<readonly BattleObject[]>;
}

export type MapImageUrl = (info: MapInfo) => string;

export interface BattleModeCatalog {
    variants(mapId: string | null): readonly BattleModeVariant[];
}
