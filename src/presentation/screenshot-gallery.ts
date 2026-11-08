import {button} from './dom.ts';

export interface GalleryImage {
    readonly key: string;
    readonly reference?: string;
    readonly blob?: Blob;
    readonly name: string;
}

export class ScreenshotGallery {
    private version = 0;
    private readonly urls = new Set<string>();
    private readonly resolve: (reference: string) => Promise<Blob | null>;

    constructor(resolve: (reference: string) => Promise<Blob | null>) { this.resolve = resolve; }

    clear(): void {
        this.version++;
        for (const url of this.urls) URL.revokeObjectURL(url);
        this.urls.clear();
    }

    render(container: HTMLElement, images: readonly GalleryImage[], remove?: (key: string) => void): void {
        this.clear();
        const version = this.version;
        container.replaceChildren();
        for (const item of images) {
            const tile = document.createElement('div');
            tile.className = 'screenshot-tile';
            const link = document.createElement('a');
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            const image = document.createElement('img');
            image.alt = item.name;
            image.loading = 'lazy';
            image.addEventListener('error', () => { image.alt = 'Скриншот недоступен'; });
            link.append(image);
            tile.append(link);
            if (remove) tile.append(button('Убрать', () => remove(item.key), 'small-button'));
            container.append(tile);
            const load = async (): Promise<void> => {
                if (item.reference && /^https?:\/\//i.test(item.reference)) {
                    image.src = item.reference; link.href = item.reference; return;
                }
                const blob = item.blob ?? (item.reference ? await this.resolve(item.reference) : null);
                if (version !== this.version) return;
                if (!blob) { image.alt = 'Скриншот не найден'; return; }
                const url = URL.createObjectURL(blob);
                this.urls.add(url);
                image.src = url; link.href = url;
            };
            void load().catch(() => { if (version === this.version) image.alt = 'Скриншот недоступен'; });
        }
    }
}
