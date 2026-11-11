import {MapCatalogService} from '../application/map-catalog.ts';
import type {MapCatalogQuery} from '../application/map-catalog.ts';
import type {BattleModeKind} from '../domain/battle-mode.ts';
import {element} from './dom.ts';

const modeNames: Readonly<Record<BattleModeKind, string>> = {domination: 'Превосходство', conquest: 'Захват', battle: 'Сражение'};

function textElement<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className = ''): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
}

export class AdminMaps {
    private readonly service: MapCatalogService;
    private readonly lifecycle = new AbortController();
    private readonly search = element('admin-search', HTMLInputElement);
    private readonly mode = element('admin-mode', HTMLSelectElement);
    private readonly hashes = element('admin-hashes', HTMLSelectElement);
    private readonly list = element('admin-map-list', HTMLTableSectionElement);
    private readonly dialog = element('admin-map-dialog', HTMLDialogElement);
    private selectedId: string | null = null;

    constructor(service: MapCatalogService) {
        this.service = service;
        const {signal} = this.lifecycle;
        this.search.addEventListener('input', () => this.render(), {signal});
        this.mode.addEventListener('change', () => this.render(), {signal});
        this.hashes.addEventListener('change', () => this.render(), {signal});
        this.list.addEventListener('click', event => {
            const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-map-id]') : null;
            if (button?.dataset.mapId) this.open(button.dataset.mapId);
        }, {signal});
        element('admin-detail-close', HTMLButtonElement).addEventListener('click', () => this.dialog.close(), {signal});
        element('admin-create-map', HTMLFormElement).addEventListener('submit', event => {
            event.preventDefault();
            this.run(() => {
                const input = element('admin-new-map-name', HTMLInputElement);
                const map = this.service.create(input.value);
                input.value = '';
                this.open(map.id);
                return 'Карта добавлена';
            });
        }, {signal});
        element('admin-rename-map', HTMLFormElement).addEventListener('submit', event => {
            event.preventDefault();
            if (!this.selectedId) return;
            this.run(() => {
                this.service.rename(this.selectedId!, element('admin-map-name', HTMLInputElement).value);
                return 'Название сохранено';
            });
        }, {signal});
        element('admin-delete-map', HTMLButtonElement).addEventListener('click', () => {
            const map = this.selectedId ? this.service.find(this.selectedId) : null;
            if (!map || !window.confirm(`Удалить карту «${map.name}» вместе с её вариантами и ${map.hashes.length} хешами?`)) return;
            this.run(() => {
                this.service.delete(map.id);
                this.dialog.close(); this.selectedId = null;
                return 'Карта удалена';
            });
        }, {signal});
        element('admin-detail-body', HTMLElement).addEventListener('click', event => {
            const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-delete-hash]') : null;
            const hash = button?.dataset.deleteHash;
            const id = this.selectedId;
            if (hash && id) this.run(() => { this.service.deleteHash(id, hash); return 'Хеш удалён'; });
        }, {signal});
        this.refresh();
    }

    private run(action: () => string): void {
        try {
            const message = action();
            this.refresh();
            this.message(message, false);
        } catch (error: unknown) {
            this.message(error instanceof Error ? error.message : String(error), true);
        }
    }

    private message(text: string, error: boolean): void {
        const status = element(this.dialog.open ? 'admin-detail-message' : 'admin-message', HTMLElement);
        status.textContent = text;
        status.classList.toggle('error', error);
        status.hidden = false;
    }

    refresh(): void {
        const totals = this.service.totals;
        element('admin-map-count', HTMLElement).textContent = String(totals.maps);
        element('admin-variant-count', HTMLElement).textContent = String(totals.variants);
        element('admin-hash-count', HTMLElement).textContent = String(totals.hashes);
        this.render();
        if (this.dialog.open && this.selectedId) this.open(this.selectedId);
    }

    private render(): void {
        const maps = this.service.list({search: this.search.value, mode: this.mode.value as MapCatalogQuery['mode'], hashes: this.hashes.value as MapCatalogQuery['hashes']});
        const rows = maps.map(map => {
            const row = document.createElement('tr');
            const name = document.createElement('td');
            const button = textElement('button', map.name, 'map-name');
            button.type = 'button'; button.dataset.mapId = map.id; button.setAttribute('aria-haspopup', 'dialog');
            name.append(button, textElement('code', map.id, 'map-id'));
            const modes = document.createElement('td');
            const badges = textElement('div', '', 'badges');
            for (const kind of Object.keys(modeNames) as BattleModeKind[]) {
                const count = map.variants.filter(variant => variant.kind === kind).length;
                if (count) badges.append(textElement('span', `${modeNames[kind]} · ${count}`, 'badge'));
            }
            if (!map.variants.length) badges.append(textElement('span', 'Нет данных о режимах', 'muted'));
            modes.append(badges);
            const hashes = document.createElement('td');
            hashes.append(textElement('span', map.hashes.length ? `Хешей: ${map.hashes.length}` : 'Нет хешей', map.hashes.length ? 'badge hash-badge' : 'muted'));
            row.append(name, modes, hashes); return row;
        });
        this.list.replaceChildren(...rows);
        element('admin-results', HTMLElement).textContent = `Показано карт: ${maps.length} из ${this.service.totals.maps}`;
        element('admin-empty', HTMLElement).hidden = maps.length > 0;
    }

    private open(id: string): void {
        const map = this.service.find(id);
        if (!map) { this.dialog.close(); this.selectedId = null; return; }
        this.selectedId = map.id;
        element('admin-detail-title', HTMLElement).textContent = map.name;
        element('admin-detail-id', HTMLElement).textContent = map.id;
        element('admin-map-name', HTMLInputElement).value = map.name;
        element('admin-detail-message', HTMLElement).hidden = true;
        const body = element('admin-detail-body', HTMLElement); body.replaceChildren();
        if (map.aliases.length) body.append(textElement('p', `Другие идентификаторы: ${map.aliases.join(', ')}`, 'muted'));
        body.append(textElement('h3', `Варианты сражений · ${map.variants.length}`));
        if (map.variants.length) {
            const wrapper = textElement('div', '', 'table-scroll');
            const table = document.createElement('table');
            const head = table.createTHead().insertRow();
            for (const title of ['Режим', 'Вариант', 'Размер, м', 'Клетка, м']) { const th = textElement('th', title); th.scope = 'col'; head.append(th); }
            const tbody = table.createTBody();
            for (const variant of map.variants) {
                const row = tbody.insertRow();
                for (const value of [modeNames[variant.kind], variant.id, String(variant.size), String(variant.tileSize)]) row.insertCell().textContent = value;
            }
            wrapper.append(table); body.append(wrapper);
        } else body.append(textElement('p', 'Для этой карты в каталоге нет вариантов сражений.', 'muted'));
        body.append(textElement('h3', `Сохранённые хеши · ${map.hashes.length}`));
        if (map.hashes.length) {
            const hashes = textElement('ul', '', 'hash-list');
            for (const hash of map.hashes) {
                const item = document.createElement('li');
                const remove = textElement('button', 'Удалить', 'danger');
                remove.type = 'button'; remove.dataset.deleteHash = hash;
                remove.setAttribute('aria-label', `Удалить хеш ${hash}`);
                item.append(textElement('code', hash), remove); hashes.append(item);
            }
            body.append(hashes);
        } else body.append(textElement('p', 'Хеши ещё не сохранены. Ручное определение на странице карты добавляет хеш в эту запись.', 'muted'));
        if (!this.dialog.open) this.dialog.showModal();
    }

    destroy(): void { this.lifecycle.abort(); this.dialog.close(); }
}
