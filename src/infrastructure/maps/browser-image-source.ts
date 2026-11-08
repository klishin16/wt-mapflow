import type {LoadOptions, MapImageSource} from '../../application/ports.ts';

export class BrowserImageSource implements MapImageSource<HTMLImageElement> {
    private readonly crossOrigin: boolean;
    private readonly cacheBust: boolean;
    private requestSequence = 0;

    constructor({crossOrigin = true, cacheBust = false}: {crossOrigin?: boolean; cacheBust?: boolean} = {}) {
        this.crossOrigin = crossOrigin;
        this.cacheBust = cacheBust;
    }

    load(url: string, {signal}: LoadOptions = {}): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const image = new Image();
            const finish = (error?: Error): void => {
                clearTimeout(timeout);
                signal?.removeEventListener('abort', abort);
                image.onload = null;
                image.onerror = null;
                if (error) {
                    image.src = '';
                    reject(error);
                } else {
                    resolve(image);
                }
            };
            const abort = (): void => finish(new DOMException('Aborted', 'AbortError'));
            const timeout = setTimeout(() => finish(new Error('Истекло время загрузки изображения карты')), 10000);
            image.onload = () => finish();
            image.onerror = () => finish(new Error('Не удалось загрузить изображение карты'));
            if (this.crossOrigin) image.crossOrigin = 'anonymous';
            signal?.addEventListener('abort', abort, {once: true});
            if (signal?.aborted) abort();
            else {
                if (this.cacheBust) {
                    const freshUrl = new URL(url, window.location.href);
                    freshUrl.searchParams.set('_mapLoad', `${Date.now()}-${++this.requestSequence}`);
                    image.src = freshUrl.href;
                } else {
                    image.src = url;
                }
            }
        });
    }
}
