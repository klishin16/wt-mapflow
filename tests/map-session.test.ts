import test from 'node:test';
import assert from 'node:assert/strict';
import {MapSession} from '../src/application/map-session.ts';
import type {MapSessionState} from '../src/application/map-session.ts';
import type {PositionSet} from '../src/application/ports.ts';
import {deferred, position} from './fixtures.ts';

test('positions from the previous map cannot overwrite the new map', async () => {
    const stale = deferred<PositionSet>();
    const states: MapSessionState<string>[] = [];
    const session = new MapSession<string>({
        imageSource: {load: async url => url},
        identify: async image => image,
        positions: {list: map => map === 'old' ? stale.promise : Promise.resolve({positions: [position('new')], missing: false})},
        onChange: state => states.push(state)
    });
    const old = session.open(1, 'old');
    await new Promise(resolve => setImmediate(resolve));
    await session.open(2, 'new');
    stale.resolve({positions: [position('old')], missing: false});
    await old;
    assert.equal(states.at(-1)?.mapId, 'new');
    assert.deepEqual(states.at(-1)?.positions, [position('new')]);
    const newStart = states.findIndex(state => state.generation === 2);
    assert.ok(states.slice(newStart).every(state => state.generation === 2));
});

test('late image loads are discarded and old positions are cleared immediately', async () => {
    const stale = deferred<string>();
    const states: MapSessionState<string>[] = [];
    const session = new MapSession<string>({
        imageSource: {load: url => url === 'old' ? stale.promise : Promise.resolve(url)},
        identify: async image => image,
        positions: {list: async map => ({positions: [position(map)], missing: false})},
        onChange: state => states.push(state)
    });
    const old = session.open(1, 'old');
    await session.open(2, 'new');
    stale.resolve('old');
    await old;
    assert.equal(states.at(-1)?.mapId, 'new');
    assert.deepEqual(states.find(state => state.generation === 2)?.positions, []);
});

test('unknown maps still display the loaded game image', async () => {
    const states: MapSessionState<string>[] = [];
    const session = new MapSession<string>({
        imageSource: {load: async () => 'game-image'},
        identify: async () => null,
        positions: {list: () => assert.fail('Unknown map must not request positions')},
        onChange: state => states.push(state)
    });
    await session.open(1, 'url');
    assert.equal(states.at(-1)?.status, 'unknown');
    assert.equal(states.at(-1)?.image, 'game-image');
    assert.deepEqual(states.at(-1)?.positions, []);
});

test('annotation failures preserve the game image and can be retried', async () => {
    const states: MapSessionState<string>[] = [];
    let attempts = 0;
    const session = new MapSession<string>({
        imageSource: {load: async () => 'image'},
        identify: async () => 'Finland',
        positions: {list: async () => {
            if (++attempts === 1) throw new Error('offline');
            return {positions: [], missing: true};
        }},
        onChange: state => states.push(state)
    });
    await session.open(1, 'url');
    assert.equal(states.at(-1)?.status, 'error');
    assert.equal(states.at(-1)?.image, 'image');
    await session.open(1, 'url');
    assert.equal(states.at(-1)?.status, 'no-positions');
});

test('closing a session prevents pending work from publishing', async () => {
    const pending = deferred<string>();
    const states: MapSessionState<string>[] = [];
    const session = new MapSession<string>({
        imageSource: {load: () => pending.promise},
        identify: async () => 'Finland',
        positions: {list: async () => ({positions: [], missing: false})},
        onChange: state => states.push(state)
    });
    const task = session.open(1, 'url');
    session.close();
    pending.resolve('late');
    await task;
    assert.equal(states.length, 1);
});
