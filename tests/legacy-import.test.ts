import test from 'node:test';
import assert from 'node:assert/strict';
import {importLegacyPins} from '../src/infrastructure/positions/legacy-import.ts';

test('mixed coordinate exports become a consistent normalized layer', () => {
    const data = {map: {mapName: 'Finland', pins: [
        {_id: 'pixel', x: 512, y: 256, description: 'Cover', imageUrl: 'screenshot.png'},
        {_id: 'normalized', x: 0.5, y: 0.75}
    ]}};
    const original = structuredClone(data);
    const pins = importLegacyPins(data, {width: 1024, height: 512});
    assert.deepEqual(pins.map(({point}) => [point.x, point.y]), [[0.5, 0.5], [0.5, 0.75]]);
    assert.equal(pins[0].description, 'Cover');
    assert.deepEqual(pins[0].screenshots, ['screenshot.png']);
    assert.deepEqual(data, original);
});

test('explicit pixel coordinates override the legacy range heuristic', () => {
    const pins = importLegacyPins({map: {pins: [{x: 1, y: 1, coordinateSpace: 'pixels'}]}}, {width: 100, height: 200});
    assert.deepEqual(pins[0].point, {x: 0.01, y: 0.005});
});

test('pixel exports require known dimensions rather than guessing image size', () => {
    assert.throws(() => importLegacyPins({map: {pins: [{x: 100, y: 200}]}}), /размеры/);
});

test('invalid points do not reach the renderer', () => {
    const pins = importLegacyPins({map: {pins: [
        null, {x: NaN, y: 1}, {x: -1, y: 0}, {x: 1025, y: 0}, {x: 0, y: 0}
    ]}}, {width: 1024, height: 1024});
    assert.equal(pins.length, 1);
    assert.equal(pins[0].point.x, 0);
});

test('malformed JSON structures and unknown coordinate systems are rejected at the boundary', () => {
    assert.throws(() => importLegacyPins(null), /набор позиций/);
    assert.throws(() => importLegacyPins({map: {pins: {}}}), /список позиций/);
    assert.throws(() => importLegacyPins({map: {pins: [{x: 0.5, y: 0.5, coordinateSpace: 'geo'}]}}), /система координат/);
});
