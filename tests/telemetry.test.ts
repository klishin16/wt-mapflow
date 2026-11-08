import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveBattle} from '../src/application/live-battle.ts';
import {HttpTelemetryGateway} from '../src/infrastructure/telemetry/http-telemetry-gateway.ts';
import type {Fetcher, JsonResponse} from '../src/infrastructure/telemetry/http-telemetry-gateway.ts';
import type {BattleMap} from '../src/domain/battle.ts';
import {deferred} from './fixtures.ts';

const signal = (): AbortSignal => new AbortController().signal;
const json = (value: unknown): JsonResponse => ({ok: true, json: async () => value});

test('default browser fetch keeps its Window receiver', async t => {
    t.mock.method(globalThis, 'fetch', async function (this: unknown, url: RequestInfo | URL, options?: RequestInit) {
        if (this !== globalThis) throw new TypeError('Illegal invocation');
        assert.equal(url, '/telemetry/map_info.json');
        assert.equal(options?.cache, 'no-store');
        return new Response('{"valid":false}', {headers: {'content-type': 'application/json'}});
    });
    const gateway = new HttpTelemetryGateway();
    assert.deepEqual(await gateway.readMap(signal()), {kind: 'waiting'});
});

test('missing Vite proxy is reported as an HTML response, not an offline game', async () => {
    const gateway = new HttpTelemetryGateway({
        fetcher: async () => ({ok: true, headers: new Headers({'content-type': 'text/html'}), json: () => assert.fail('HTML must not be parsed as JSON')})
    });
    await assert.rejects(gateway.readMap(signal()), /HTML.*перезапусти Vite/);
});

test('proxy and network failures identify the failing endpoint', async () => {
    const failedProxy = new HttpTelemetryGateway({fetcher: async () => ({ok: false, status: 502, json: async () => null})});
    await assert.rejects(failedProxy.readMap(signal()), /\/telemetry\/map_info.json: HTTP 502/);
    const failedNetwork = new HttpTelemetryGateway({fetcher: async () => { throw new TypeError('Failed to fetch'); }});
    await assert.rejects(failedNetwork.readObjects(signal()), /\/telemetry\/map_obj.json: Failed to fetch/);
});

test('stopping a pending request prevents stale callbacks', async () => {
    const pending = deferred<BattleMap>();
    const live = new LiveBattle({
        gateway: {readMap: () => pending.promise, readObjects: async () => []},
        onInfo: () => assert.fail('stopped'), onObjects: () => assert.fail('stopped'),
        onConnection: () => assert.fail('stopped'), onWaiting: () => assert.fail('stopped')
    });
    live.start();
    live.stop();
    pending.resolve({kind: 'active', info: {generation: 1, geometry: null}});
    await new Promise(resolve => setImmediate(resolve));
});

test('failed telemetry recovers without concurrent polling cycles', {timeout: 2000}, async () => {
    let reads = 0;
    let active = 0;
    let maxActive = 0;
    const connections: boolean[] = [];
    const done = deferred<void>();
    const fetcher: Fetcher = async url => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active--;
        if (++reads === 1) throw new Error('offline');
        return json(url.endsWith('map_info.json') ? {map_generation: 1} : []);
    };
    const live = new LiveBattle({
        interval: 1, gateway: new HttpTelemetryGateway({fetcher}),
        onInfo: () => {}, onObjects: () => {}, onWaiting: () => {},
        onConnection: connected => {
            connections.push(connected);
            if (connected) { live.stop(); done.resolve(); }
        }
    });
    live.start();
    try {
        await done.promise;
        assert.deepEqual(connections, [false, true]);
        assert.equal(maxActive, 1);
    } finally { live.stop(); }
});

test('objects spanning a battle change are discarded', {timeout: 2000}, async () => {
    const infos: number[] = [];
    const responses: unknown[] = [{map_generation: 1}, [{icon: 'Player', x: 0.5, y: 0.5}], {map_generation: 2}];
    const done = deferred<void>();
    const live = new LiveBattle({
        gateway: new HttpTelemetryGateway({fetcher: async () => json(responses.shift())}),
        onInfo: info => {
            infos.push(info.generation);
            if (info.generation === 2) { live.stop(); done.resolve(); }
        },
        onObjects: () => assert.fail('Objects from a changing battle must be discarded'),
        onConnection: () => {}, onWaiting: () => {}
    });
    live.start();
    try {
        await done.promise;
        assert.deepEqual(infos, [1, 2]);
    } finally { live.stop(); }
});

test('valid:false waits for a map and resumes polling when a battle appears', {timeout: 2000}, async () => {
    const responses: unknown[] = [{valid: false}, {map_generation: 7}, [], {map_generation: 7}];
    const events: string[] = [];
    const done = deferred<void>();
    const live = new LiveBattle({
        interval: 1,
        gateway: new HttpTelemetryGateway({fetcher: async () => json(responses.shift())}),
        onInfo: info => events.push(`map:${info.generation}`),
        onObjects: () => events.push('objects'),
        onWaiting: () => events.push('waiting'),
        onConnection: connected => {
            assert.equal(connected, true);
            if (events.includes('objects')) { live.stop(); done.resolve(); }
        }
    });
    live.start();
    try {
        await done.promise;
        assert.deepEqual(events, ['waiting', 'map:7', 'objects']);
        assert.equal(responses.length, 0);
    } finally { live.stop(); }
});

test('leaving a battle while reading objects switches to waiting without publishing them', {timeout: 2000}, async () => {
    const responses: unknown[] = [{map_generation: 7}, [{icon: 'Player', x: 0.5, y: 0.5}], {valid: false}];
    const done = deferred<void>();
    const live = new LiveBattle({
        gateway: new HttpTelemetryGateway({fetcher: async () => json(responses.shift())}),
        onInfo: () => {}, onObjects: () => assert.fail('Stale battle objects must not be published'),
        onConnection: connected => assert.equal(connected, true),
        onWaiting: () => { live.stop(); done.resolve(); }
    });
    live.start();
    try { await done.promise; } finally { live.stop(); }
});

test('a request from a stopped run cannot publish after restarting', {timeout: 2000}, async () => {
    const stale = deferred<BattleMap>();
    let reads = 0;
    const done = deferred<void>();
    const generations: number[] = [];
    const live = new LiveBattle({
        gateway: {
            readMap: () => ++reads === 1 ? stale.promise : Promise.resolve({kind: 'active', info: {generation: 2, geometry: null}}),
            readObjects: async () => []
        },
        onInfo: info => generations.push(info.generation), onObjects: () => {}, onWaiting: () => {},
        onConnection: () => { live.stop(); done.resolve(); }
    });
    live.start();
    live.stop();
    live.start();
    try {
        await done.promise;
        stale.resolve({kind: 'active', info: {generation: 1, geometry: null}});
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(generations, [2]);
    } finally { live.stop(); }
});
