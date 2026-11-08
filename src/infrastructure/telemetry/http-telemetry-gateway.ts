import type {BattleMap, BattleObject} from '../../domain/battle.ts';
import type {TelemetryGateway} from '../../application/ports.ts';
import {asError} from '../../application/errors.ts';
import {decodeMap, decodeObjects} from './decode.ts';

export interface JsonResponse {
    readonly ok: boolean;
    readonly status?: number;
    readonly headers?: Pick<Headers, 'get'>;
    json(): Promise<unknown>;
}

export type Fetcher = (url: string, options: RequestInit) => Promise<JsonResponse>;

export class HttpTelemetryGateway implements TelemetryGateway {
    private readonly fetcher: Fetcher;
    private readonly baseUrl: string;

    constructor({baseUrl = '/telemetry', fetcher = globalThis.fetch.bind(globalThis)}: {baseUrl?: string; fetcher?: Fetcher} = {}) {
        this.baseUrl = baseUrl;
        this.fetcher = fetcher;
    }

    private async read(path: string, signal: AbortSignal): Promise<unknown> {
        const url = this.baseUrl + path;
        const controller = new AbortController();
        let timedOut = false;
        const abort = (): void => controller.abort();
        signal.addEventListener('abort', abort, {once: true});
        if (signal.aborted) abort();
        const timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, 5000);
        const requestError = (value: unknown): Error => {
            const error = asError(value);
            if (signal.aborted) return error;
            return new Error(`${url}: ${timedOut ? 'время ожидания истекло' : error.message}`);
        };
        try {
            let response: JsonResponse;
            try {
                response = await this.fetcher(url, {signal: controller.signal, cache: 'no-store'});
            } catch (value: unknown) {
                throw requestError(value);
            }
            if (!response.ok) {
                const hint = (response.status ?? 0) >= 500 ? ' · проверь доступ Vite к игровому серверу' : '';
                throw new Error(`${url}: HTTP ${response.status}${hint}`);
            }
            if (response.headers?.get('content-type')?.includes('text/html')) {
                throw new Error(`${url}: вместо JSON получена HTML-страница · перезапусти Vite для подключения прокси`);
            }
            try {
                return await response.json();
            } catch (value: unknown) {
                if (controller.signal.aborted) throw requestError(value);
                throw new Error(`${url}: сервер вернул некорректный JSON`);
            }
        } finally {
            clearTimeout(timeout);
            signal.removeEventListener('abort', abort);
        }
    }

    async readMap(signal: AbortSignal): Promise<BattleMap> {
        return decodeMap(await this.read('/map_info.json', signal));
    }

    async readObjects(signal: AbortSignal): Promise<readonly BattleObject[]> {
        return decodeObjects(await this.read('/map_obj.json', signal));
    }
}
