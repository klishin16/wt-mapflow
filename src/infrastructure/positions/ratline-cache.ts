import type {TacticalPosition} from '../../domain/position.ts';
import {decodePosition} from './position-codec.ts';
import {isRecord} from '../records.ts';

export interface RatlineSnapshot {
    readonly mapId: string;
    readonly fetchedAt: number;
    readonly positions: readonly TacticalPosition[];
}

export class RatlineCache {
    private database: Promise<IDBDatabase> | null = null;

    private open(): Promise<IDBDatabase> {
        if (!this.database) {
            this.database = new Promise<IDBDatabase>((resolve, reject) => {
                const operation = indexedDB.open('wt-rat-ratline', 1);
                operation.onupgradeneeded = () => operation.result.createObjectStore('maps', {keyPath: 'mapId'});
                let blocked = false;
                operation.onblocked = () => { blocked = true; reject(new Error('Хранилище Ratline заблокировано другой вкладкой')); };
                operation.onerror = () => reject(operation.error ?? new Error('Кэш Ratline недоступен'));
                operation.onsuccess = () => {
                    const database = operation.result;
                    if (blocked) { database.close(); return; }
                    database.onversionchange = () => { database.close(); this.database = null; };
                    resolve(database);
                };
            }).catch((error: unknown) => { this.database = null; throw error; });
        }
        return this.database;
    }

    async read(mapId: string): Promise<RatlineSnapshot | null> {
        const database = await this.open();
        const raw: unknown = await new Promise((resolve, reject) => {
            const operation = database.transaction('maps').objectStore('maps').get(mapId);
            operation.onsuccess = () => resolve(operation.result);
            operation.onerror = () => reject(operation.error);
        });
        if (raw === undefined) return null;
        if (!isRecord(raw) || raw.mapId !== mapId || typeof raw.fetchedAt !== 'number' || !Number.isFinite(raw.fetchedAt) || !Array.isArray(raw.positions)) {
            throw new Error('Повреждён кэш Ratline');
        }
        const positions = raw.positions.map(decodePosition);
        if (positions.some(position => position.mapId !== mapId || position.source?.provider !== 'ratline')) throw new Error('Некорректная карта в кэше Ratline');
        return {mapId, fetchedAt: raw.fetchedAt, positions};
    }

    async write(snapshot: RatlineSnapshot): Promise<void> {
        const database = await this.open();
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction('maps', 'readwrite');
            transaction.oncomplete = () => resolve();
            transaction.onabort = () => reject(transaction.error ?? new Error('Кэш Ratline не сохранён'));
            transaction.onerror = () => reject(transaction.error ?? new Error('Кэш Ratline не сохранён'));
            transaction.objectStore('maps').put(snapshot);
        });
    }
}
