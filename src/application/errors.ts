export function asError(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value));
}

export function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}
