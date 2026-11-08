import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeMap, decodeObjects} from '../src/infrastructure/telemetry/decode.ts';

test('game metadata becomes a domain model without transport field names', () => {
    const map = decodeMap({map_generation: 5, map_min: [-1000, -2000], map_max: [1000, 2000], grid_steps: [250, 500]});
    assert.deepEqual(map, {kind: 'active', info: {
        generation: 5,
        geometry: {min: {x: -1000, y: -2000}, max: {x: 1000, y: 2000}, gridStep: {x: 250, y: 500}}
    }});
});

test('missing or invalid grid geometry cannot produce an endless rendering loop', () => {
    const map = decodeMap({map_generation: 1, map_min: [0, 0], map_max: [0, 100], grid_steps: [0, 10]});
    assert.deepEqual(map, {kind: 'active', info: {generation: 1, geometry: null}});
    assert.deepEqual(decodeMap({valid: false}), {kind: 'waiting'});
    assert.throws(() => decodeMap({valid: true}), /данные карты/);
});

test('points, player directions and airfields are decoded independently', () => {
    const objects = decodeObjects([
        {icon: 'Player', x: 0.5, y: 0.25, dx: 1, dy: 0},
        {type: 'airfield', sx: 0.1, sy: 0.2, ex: 0.3, ey: 0.4, color: '#abc'},
        {type: 'respawn_base_fighter', icon: 'respawn_base_fighter', x: 0, y: 1},
        null, {icon: 'invalid', x: '0.5', y: 0.5}
    ]);
    assert.equal(objects.length, 3);
    const player = objects[0];
    assert.equal(player.kind, 'point');
    if (player.kind !== 'point') assert.fail('Expected a player point');
    assert.deepEqual(player.position, {x: 0.5, y: 0.25});
    assert.deepEqual(player.direction, {x: 1, y: 0});
    assert.equal(objects[1].kind, 'airfield');
    assert.equal(objects[2].kind === 'point' && objects[2].rotates, true);
});
