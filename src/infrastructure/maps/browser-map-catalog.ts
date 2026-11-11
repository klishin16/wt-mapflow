import type {EditableMapCatalogRepository} from '../../application/map-catalog.ts';
import type {MapCatalogEntry} from '../../domain/map-catalog.ts';
import type {BattleModeKind, BattleModeVariant} from '../../domain/battle-mode.ts';
import {finiteNumber, isRecord} from '../records.ts';
import catalogJson from './map-seed.json?raw';
import {validMapName} from './map-name.ts';

const normalize = (value: string): string => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const storageKey = 'wt-mapflow.map-catalog.v1';
const legacyKey = 'wt-rat.map-bindings.v1';

function text(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 160) throw new Error(`Некорректное поле каталога карт: ${field}`);
    return value;
}

function decodeEntry(raw: unknown): MapCatalogEntry {
    if (!isRecord(raw) || !Array.isArray(raw.aliases) || !Array.isArray(raw.hashes) || !isRecord(raw.variants)) throw new Error('Некорректная запись каталога карт');
    const id = text(raw.id, 'id');
    if (!normalize(id)) throw new Error(`Некорректный идентификатор карты: ${id}`);
    const aliases = raw.aliases.map((alias: unknown) => text(alias, `${id}/aliases`));
    const hashes = raw.hashes.map((hash: unknown) => {
        if (typeof hash !== 'string' || !/^[a-f0-9]{16}$/.test(hash)) throw new Error(`Некорректный aHash карты ${id}`);
        return hash;
    });
    const variants = Object.entries(raw.variants).map(([variantId, entry]): BattleModeVariant => {
        const match = /^(domination|conquest|battle)-[1-9]\d*$/.exec(variantId);
        if (!match || !isRecord(entry) || !finiteNumber(entry.size) || entry.size <= 0 || !finiteNumber(entry.tile_size) || entry.tile_size <= 0) {
            throw new Error(`Некорректный вариант ${id}/${variantId}`);
        }
        return {id: variantId, kind: match[1] as BattleModeKind, size: entry.size, tileSize: entry.tile_size};
    });
    return {id, name: text(raw.name, `${id}/name`), aliases, variants, hashes};
}

/** Map records and their hashes share one persistent browser catalog. */
export class BrowserMapCatalog implements EditableMapCatalogRepository {
    private entries: readonly MapCatalogEntry[] = [];
    private readonly names = new Map<string, MapCatalogEntry>();
    private readonly listeners = new Set<() => void>();
    private readonly onStorage = (event: StorageEvent): void => {
        if (event.key !== storageKey && event.key !== null) return;
        try {
            this.reload();
            this.listeners.forEach(listener => listener());
        } catch (error: unknown) { console.error('Не удалось обновить каталог карт', error); }
    };

    constructor() {
        let saved: string | null = null;
        try { saved = localStorage.getItem(storageKey); } catch { /* Reading remains available without persistence. */ }
        this.load(saved ?? catalogJson);
        // Version 2 imports the former catalog once, including into existing stores.
        // The version lives in the same document so removed hashes stay removed.
        if (saved === null || Array.isArray(JSON.parse(saved))) {
            try {
                if (saved === null) {
                    const legacy: unknown = JSON.parse(localStorage.getItem(legacyKey) ?? '{}');
                    if (isRecord(legacy)) for (const [hash, name] of Object.entries(legacy)) {
                        if (/^[a-f0-9]{16}$/.test(hash) && typeof name === 'string' && validMapName(name) && normalize(name)) this.assignHash(hash, name);
                    }
                }
                this.importSeedHashes();
                this.persist();
                localStorage.removeItem(legacyKey);
            } catch (error: unknown) { console.warn('Каталог доступен в памяти; сохранение недоступно', error); }
        }
        window.addEventListener('storage', this.onStorage);
    }

    private load(json: string): void {
        const document: unknown = JSON.parse(json);
        const raw: unknown = isRecord(document) && document.version === 2 ? document.maps : document;
        if (!Array.isArray(raw)) throw new Error('Некорректный каталог карт');
        const entries = raw.map(decodeEntry);
        const ids = new Set<string>();
        const hashes = new Set<string>();
        const names = new Map<string, MapCatalogEntry>();
        for (const entry of entries) {
            if (ids.has(entry.id)) throw new Error(`Повторяющаяся карта: ${entry.id}`);
            ids.add(entry.id);
            for (const name of [entry.id, entry.name, ...entry.aliases]) {
                const key = normalize(name);
                const previous = names.get(key);
                if (!key || (previous && previous.id !== entry.id)) throw new Error(`Неоднозначное имя карты: ${name}`);
                names.set(key, entry);
            }
            for (const hash of entry.hashes) {
                if (hashes.has(hash)) throw new Error(`Повторяющийся aHash: ${hash}`);
                hashes.add(hash);
            }
        }
        this.entries = entries;
        this.names.clear();
        names.forEach((entry, key) => this.names.set(key, entry));
    }

    private serialize(): string {
        return JSON.stringify({version: 2, maps: this.entries.map(entry => ({
            ...entry,
            variants: Object.fromEntries(entry.variants.map(variant => [variant.id, {size: variant.size, tile_size: variant.tileSize}]))
        }))});
    }

    private importSeedHashes(): void {
        const seed = (JSON.parse(catalogJson) as unknown[]).map(decodeEntry);
        const known = new Set(this.entries.flatMap(entry => entry.hashes));
        for (const entry of seed) {
            for (const hash of entry.hashes) {
                if (known.has(hash)) continue;
                this.assignHash(hash, entry.id);
                known.add(hash);
            }
        }
    }

    private persist(): void { localStorage.setItem(storageKey, this.serialize()); }

    private reload(): void {
        const saved = localStorage.getItem(storageKey);
        this.load(saved ?? catalogJson);
    }

    private assignHash(hash: string, mapId: string | null): void {
        let target = this.find(mapId);
        if (mapId && !target) {
            target = {id: mapId, name: mapId, aliases: [], variants: [], hashes: []};
            this.entries = [...this.entries, target];
        }
        const id = target?.id;
        const entries = this.entries.map(entry => ({...entry, hashes: [
            ...entry.hashes.filter(value => value !== hash), ...(entry.id === id ? [hash] : [])
        ]}));
        this.entries = entries;
        this.load(this.serialize());
    }

    bindHash(hash: string, mapId: string | null): void {
        if (!/^[a-f0-9]{16}$/.test(hash) || (mapId !== null && (!validMapName(mapId) || !normalize(mapId)))) throw new Error('Некорректное название карты или хеш');
        this.change(() => this.assignHash(hash, mapId));
    }

    private change(update: () => void): void {
        // Read the latest snapshot before writing, so sequential edits from different tabs survive.
        this.reload();
        const previous = this.serialize();
        try {
            update();
            this.load(this.serialize());
            this.persist();
        } catch (error: unknown) {
            this.load(previous);
            throw new Error(`Изменения не сохранены: ${error instanceof Error ? error.message : String(error)}`);
        }
        this.listeners.forEach(listener => listener());
    }

    private checkName(name: string, id?: string): void {
        if (!validMapName(name) || !normalize(name)) throw new Error('Название должно содержать буквы или цифры, не более 128 символов');
        const existing = this.find(name);
        if (existing && existing.id !== id) throw new Error('Карта с таким названием или идентификатором уже существует');
    }

    createMap(name: string): MapCatalogEntry {
        this.change(() => {
            this.checkName(name);
            this.entries = [...this.entries, {id: name, name, aliases: [], variants: [], hashes: []}];
        });
        return this.find(name)!;
    }

    renameMap(id: string, name: string): void {
        this.change(() => {
            const map = this.find(id);
            if (!map) throw new Error('Карта уже удалена');
            this.checkName(name, map.id);
            this.entries = this.entries.map(entry => entry.id !== map.id ? entry : {
                ...entry, name,
                aliases: [...new Set([...entry.aliases, ...(entry.name !== name && entry.name !== entry.id ? [entry.name] : [])])]
            });
        });
    }

    deleteMap(id: string): void {
        this.change(() => {
            const map = this.find(id);
            if (!map) throw new Error('Карта уже удалена');
            this.entries = this.entries.filter(entry => entry.id !== map.id);
        });
    }

    deleteHash(id: string, hash: string): void {
        this.change(() => {
            const map = this.find(id);
            if (!map || !map.hashes.includes(hash)) throw new Error('Хеш уже удалён или относится к другой карте');
            this.entries = this.entries.map(entry => entry.id !== map.id ? entry : {...entry, hashes: entry.hashes.filter(value => value !== hash)});
        });
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    destroy(): void { window.removeEventListener('storage', this.onStorage); this.listeners.clear(); }

    list(): readonly MapCatalogEntry[] { return this.entries; }
    find(mapId: string | null): MapCatalogEntry | undefined { return mapId ? this.names.get(normalize(mapId)) : undefined; }
    variants(mapId: string | null): readonly BattleModeVariant[] { return this.find(mapId)?.variants ?? []; }
}
