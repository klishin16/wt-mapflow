import {element} from './dom.ts';

export class SettingsMenu {
    private readonly lifecycle = new AbortController();
    private readonly menu = element('map-settings', HTMLDetailsElement);

    constructor() {
        const {signal} = this.lifecycle;
        document.addEventListener('pointerdown', event => {
            if (this.menu.open && event.target instanceof Node && !this.menu.contains(event.target)) this.menu.open = false;
        }, {signal});
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !this.menu.open || document.querySelector('dialog[open]')) return;
            event.preventDefault();
            event.stopPropagation();
            this.menu.open = false;
            this.menu.querySelector('summary')?.focus();
        }, {capture: true, signal});
    }

    destroy(): void { this.lifecycle.abort(); }
}
