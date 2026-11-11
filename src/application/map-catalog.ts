import type {BattleModeCatalog} from './ports.ts';
import type {MapCatalogEntry} from '../domain/map-catalog.ts';
import type {BattleModeKind} from '../domain/battle-mode.ts';

export interface MapCatalogRepository extends BattleModeCatalog {
    list(): readonly MapCatalogEntry[];
    find(mapId: string | null): MapCatalogEntry | undefined;
}

export interface EditableMapCatalogRepository extends MapCatalogRepository {
    createMap(name: string): MapCatalogEntry;
    renameMap(id: string, name: string): void;
    deleteMap(id: string): void;
    deleteHash(id: string, hash: string): void;
}

export interface MapCatalogQuery {
    readonly search: string;
    readonly mode: BattleModeKind | 'all';
    readonly hashes: 'all' | 'with' | 'without';
}

export class MapCatalogService {
    private readonly repository: EditableMapCatalogRepository;

    constructor(repository: EditableMapCatalogRepository) {
        this.repository = repository;
    }

    private get maps(): readonly MapCatalogEntry[] {
        return [...this.repository.list()].sort((a, b) => a.name.localeCompare(b.name, 'en', {numeric: true}));
    }

    get totals(): {maps: number; variants: number; hashes: number} {
        return {maps: this.maps.length, variants: this.maps.reduce((sum, map) => sum + map.variants.length, 0), hashes: this.maps.reduce((sum, map) => sum + map.hashes.length, 0)};
    }

    find(id: string): MapCatalogEntry | undefined { return this.repository.find(id); }

    create(name: string): MapCatalogEntry { return this.repository.createMap(name.trim()); }
    rename(id: string, name: string): void { this.repository.renameMap(id, name.trim()); }
    delete(id: string): void { this.repository.deleteMap(id); }
    deleteHash(id: string, hash: string): void { this.repository.deleteHash(id, hash); }

    list(query: MapCatalogQuery): readonly MapCatalogEntry[] {
        const search = query.search.trim().toLocaleLowerCase();
        return this.maps.filter(map => {
            if (query.mode !== 'all' && !map.variants.some(variant => variant.kind === query.mode)) return false;
            if (query.hashes === 'with' && !map.hashes.length) return false;
            if (query.hashes === 'without' && map.hashes.length) return false;
            return !search || [map.id, map.name, ...map.aliases, ...map.hashes, ...map.variants.map(variant => variant.id)]
                .some(value => value.toLocaleLowerCase().includes(search));
        });
    }
}
