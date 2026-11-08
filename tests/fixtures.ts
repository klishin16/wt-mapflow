import type {TacticalPosition} from '../src/domain/position.ts';

export function position(id: string): TacticalPosition {
    return {id, mapId: 'test', point: {x: 0.5, y: 0.5}, title: id, description: '', screenshots: []};
}

export function deferred<Value>(): {promise: Promise<Value>; resolve: (value: Value) => void} {
    let resolve!: (value: Value) => void;
    const promise = new Promise<Value>(done => { resolve = done; });
    return {promise, resolve};
}
