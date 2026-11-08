import test from 'node:test';
import assert from 'node:assert/strict';
import {MapController} from '../src/application/map-controller.ts';
import type {MapViewState} from '../src/application/map-controller.ts';
import type {BattleMap} from '../src/domain/battle.ts';
import type {PositionSet} from '../src/application/ports.ts';
import {deferred, position} from './fixtures.ts';

test('waiting clears the previous battle and the same generation can load again', {timeout: 2000}, async () => {
    let map: BattleMap = {kind: 'active', info: {generation: 1, geometry: null}};
    let loads = 0;
    const states: MapViewState<string>[] = [];
    const done = deferred<void>();
    const controller = new MapController<string>({
        interval: 1,
        gateway: {readMap: async () => map, readObjects: async () => []},
        imageSource: {load: async () => `image-${++loads}`},
        identify: async () => 'Finland',
        positions: {list: async () => ({positions: [position(String(loads))], missing: false})},
        imageUrl: () => 'url',
        onChange: state => {
            states.push(state);
            if (state.mapStatus === 'ready' && loads === 1) map = {kind: 'waiting'};
            if (state.connection === 'waiting') map = {kind: 'active', info: {generation: 1, geometry: null}};
            if (state.mapStatus === 'ready' && loads === 2) { controller.stop(); done.resolve(); }
        }
    });
    controller.start();
    try {
        await done.promise;
        const waiting = states.find(state => state.connection === 'waiting');
        assert.ok(waiting);
        assert.equal(waiting.image, null);
        assert.equal(waiting.info, null);
        assert.deepEqual(waiting.objects, []);
        assert.deepEqual(waiting.positions, []);
        assert.equal(states.at(-1)?.image, 'image-2');
    } finally { controller.stop(); }
});

test('changing maps never publishes previous positions under the new generation', {timeout: 2000}, async () => {
    let generation = 1;
    const states: MapViewState<string>[] = [];
    const done = deferred<void>();
    const controller = new MapController<string>({
        interval: 1,
        gateway: {
            readMap: async () => ({kind: 'active', info: {generation, geometry: null}}),
            readObjects: async () => []
        },
        imageSource: {load: async url => url}, identify: async image => image,
        positions: {list: async mapId => ({positions: [position(mapId)], missing: false})},
        imageUrl: info => `map-${info.generation}`,
        onChange: state => {
            states.push(state);
            if (state.mapStatus === 'ready' && state.info?.generation === 1) generation = 2;
            if (state.mapStatus === 'ready' && state.info?.generation === 2) { controller.stop(); done.resolve(); }
        }
    });
    controller.start();
    try {
        await done.promise;
        const secondMap = states.filter(state => state.info?.generation === 2);
        assert.ok(secondMap.length > 0);
        assert.ok(secondMap.every(state => state.positions.every(pin => pin.id === 'map-2')));
    } finally { controller.stop(); }
});

test('restarting during annotation loading opens a fresh session', {timeout: 2000}, async () => {
    const pending = deferred<PositionSet>();
    const loading = deferred<void>();
    const done = deferred<void>();
    let attempts = 0;
    const states: MapViewState<string>[] = [];
    const controller = new MapController<string>({
        gateway: {
            readMap: async () => ({kind: 'active', info: {generation: 1, geometry: null}}),
            readObjects: async () => []
        },
        imageSource: {load: async () => 'image'}, identify: async () => 'Finland',
        positions: {list: () => ++attempts === 1 ? pending.promise : Promise.resolve({positions: [position('new')], missing: false})},
        imageUrl: () => 'url',
        onChange: state => {
            states.push(state);
            if (state.mapStatus === 'positions-loading') loading.resolve();
            if (state.mapStatus === 'ready') { controller.stop(); done.resolve(); }
        }
    });
    controller.start();
    try {
        await loading.promise;
        controller.stop();
        controller.start();
        await done.promise;
        pending.resolve({positions: [position('old')], missing: false});
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(states.at(-1)?.positions, [position('new')]);
    } finally { controller.stop(); }
});
