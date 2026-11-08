import type {PositionDraft, TacticalPosition} from '../domain/position.ts';
import {validatePositionDraft} from '../domain/position.ts';
import type {PersonalPositionStore, PositionAttachment, PositionBackupCodec, ScreenshotInput, ScreenshotProcessor} from './ports.ts';
import type {RatlineImporter, RatlineImportOptions, RatlineImportPreview} from './ports.ts';

export interface PositionContext {
    readonly mapId: string;
    readonly variantId: string;
}

interface PositionServiceOptions {
    readonly store: PersonalPositionStore;
    readonly screenshots: ScreenshotProcessor;
    readonly backup: PositionBackupCodec;
    readonly createId: () => string;
    readonly now: () => string;
    readonly ratline?: RatlineImporter;
}

export interface DeletedPosition {
    readonly position: TacticalPosition;
    readonly attachments: readonly PositionAttachment[];
}

export class PositionService {
    private readonly options: PositionServiceOptions;

    constructor(options: PositionServiceOptions) { this.options = options; }

    async save(context: PositionContext, draft: PositionDraft, files: readonly ScreenshotInput[], existing?: TacticalPosition): Promise<TacticalPosition> {
        validatePositionDraft(draft);
        if (existing && existing.mapId !== context.mapId) throw new Error('Позиция относится к другой карте');
        if (draft.screenshots.length + files.length > 6) throw new Error('Можно прикрепить не более 6 скриншотов');
        const attachments: PositionAttachment[] = [];
        for (const file of files) attachments.push(await this.options.screenshots.prepare(file, `local:${this.options.createId()}`));
        const now = this.options.now();
        const position: TacticalPosition = {
            ...draft, title: draft.title.trim(), id: existing?.id ?? this.options.createId(),
            mapId: context.mapId, variantId: context.variantId,
            screenshots: [...draft.screenshots, ...attachments.map(item => item.id)],
            createdAt: existing?.createdAt ?? now, updatedAt: now,
            source: existing?.source
        };
        await this.options.store.put({mapId: position.mapId, id: position.id, position}, attachments);
        return position;
    }

    async remove(position: TacticalPosition): Promise<DeletedPosition> {
        const attachments: PositionAttachment[] = [];
        for (const reference of position.screenshots) {
            if (!reference.startsWith('local:')) continue;
            const attachment = await this.options.store.getAttachment(reference);
            if (attachment) attachments.push(attachment);
        }
        await this.options.store.put({mapId: position.mapId, id: position.id, position: null});
        return {position, attachments};
    }

    async undo(deleted: DeletedPosition): Promise<void> {
        const {position, attachments} = deleted;
        await this.options.store.put({mapId: position.mapId, id: position.id, position}, attachments);
    }

    async screenshot(reference: string): Promise<Blob | null> {
        return (await this.options.store.getAttachment(reference))?.blob ?? null;
    }

    async export(): Promise<Blob> { return this.options.backup.encode(await this.options.store.snapshot()); }

    async import(file: Blob): Promise<void> { await this.options.store.restore(await this.options.backup.decode(file)); }

    async previewRatline(file: Blob, options: RatlineImportOptions): Promise<RatlineImportPreview> {
        if (!this.options.ratline) throw new Error('Импорт Ratline не подключён');
        return this.options.ratline.preview(file, options);
    }

    async importRatline(preview: RatlineImportPreview): Promise<{saved: number; protected: number}> {
        const existing = new Map((await this.options.store.list(preview.mapId)).map(change => [change.id, change]));
        const changes = preview.backup.changes.filter(change => {
            const current = existing.get(change.id);
            // Explicitly hidden records and personally edited copies keep priority.
            return !current || (current.position !== null && current.position.source?.provider === 'ratline' && !current.position.createdAt);
        });
        await this.options.store.restore({...preview.backup, changes});
        return {saved: changes.length, protected: preview.backup.changes.length - changes.length};
    }
}
