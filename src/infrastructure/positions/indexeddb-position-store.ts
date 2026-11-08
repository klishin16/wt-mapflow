import type {PersonalPositionStore, PositionAttachment, PositionBackup, PositionChange} from '../../application/ports.ts';
import {decodePositionChange} from './position-codec.ts';
import {isRecord} from '../records.ts';

function request<Value>(operation: IDBRequest<Value>): Promise<Value> {
    return new Promise((resolve, reject) => {
        operation.onsuccess = () => resolve(operation.result);
        operation.onerror = () => reject(operation.error ?? new Error('Ошибка локального хранилища'));
    });
}

function complete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new Error('Изменения не сохранены'));
        transaction.onerror = () => reject(transaction.error ?? new Error('Ошибка локального хранилища'));
    });
}

function attachment(value: unknown): PositionAttachment {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !(value.blob instanceof Blob)) {
        throw new Error('Повреждён локальный скриншот');
    }
    return {id: value.id, name: value.name, blob: value.blob};
}

export class IndexedDbPositionStore implements PersonalPositionStore {
    private database: Promise<IDBDatabase> | null = null;

    private open(): Promise<IDBDatabase> {
        if (!this.database) {
            this.database = new Promise<IDBDatabase>((resolve, reject) => {
                const operation = indexedDB.open('wt-rat-personal', 1);
                let blocked = false;
                operation.onupgradeneeded = () => {
                    const db = operation.result;
                    const changes = db.createObjectStore('changes', {keyPath: ['mapId', 'id']});
                    changes.createIndex('mapId', 'mapId');
                    db.createObjectStore('attachments', {keyPath: 'id'});
                };
                operation.onsuccess = () => {
                    const db = operation.result;
                    if (blocked) { db.close(); return; }
                    db.onversionchange = () => { db.close(); this.database = null; };
                    resolve(db);
                };
                operation.onerror = () => reject(operation.error ?? new Error('Локальное хранилище недоступно'));
                operation.onblocked = () => { blocked = true; reject(new Error('Закрой другие вкладки карты и повтори сохранение')); };
            }).catch((error: unknown) => { this.database = null; throw error; });
        }
        return this.database;
    }

    async list(mapId: string): Promise<readonly PositionChange[]> {
        const db = await this.open();
        const values: unknown[] = await request(db.transaction('changes').objectStore('changes').index('mapId').getAll(mapId));
        return values.map(decodePositionChange);
    }

    async getAttachment(id: string): Promise<PositionAttachment | null> {
        const db = await this.open();
        const value: unknown = await request(db.transaction('attachments').objectStore('attachments').get(id));
        return value === undefined ? null : attachment(value);
    }

    async put(change: PositionChange, attachments: readonly PositionAttachment[] = []): Promise<void> {
        await this.write([decodePositionChange(change)], attachments);
    }

    private async write(changes: readonly PositionChange[], attachments: readonly PositionAttachment[]): Promise<void> {
        const db = await this.open();
        const transaction = db.transaction(['changes', 'attachments'], 'readwrite');
        const done = complete(transaction);
        // Attach a handler immediately, including when a synchronous put fails.
        void done.catch(() => {});
        try {
            const records = transaction.objectStore('changes');
            const images = transaction.objectStore('attachments');
            for (const change of changes) records.put(change);
            for (const image of attachments) images.put(image);
            const values: unknown[] = await request(records.getAll());
            const references = new Set(values.map(decodePositionChange).flatMap(change => change.position?.screenshots ?? []));
            const keys = await request(images.getAllKeys());
            for (const key of keys) if (typeof key === 'string' && !references.has(key)) images.delete(key);
            await done;
        } catch (error: unknown) {
            try { transaction.abort(); } catch { /* Already completed/aborted. */ }
            await done.catch(() => {});
            throw error;
        }
    }

    async snapshot(): Promise<PositionBackup> {
        const db = await this.open();
        const transaction = db.transaction(['changes', 'attachments']);
        const [records, images]: [unknown[], unknown[]] = await Promise.all([
            request(transaction.objectStore('changes').getAll()),
            request(transaction.objectStore('attachments').getAll())
        ]);
        return {version: 1, changes: records.map(decodePositionChange), attachments: images.map(attachment)};
    }

    async restore(backup: PositionBackup): Promise<void> {
        await this.write(backup.changes.map(decodePositionChange), backup.attachments);
    }
}
