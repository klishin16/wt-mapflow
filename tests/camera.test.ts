import test from 'node:test';
import assert from 'node:assert/strict';
import {Camera} from '../src/presentation/camera.ts';

test('zoom keeps the map point beneath the pointer stationary', () => {
    const camera = new Camera();
    camera.resize(800, 600);
    const anchor = {x: 300, y: 250};
    const before = camera.screenToMap(anchor);
    camera.zoomAt(anchor, 3);
    assert.deepEqual(camera.screenToMap(anchor), before);
    assert.deepEqual(camera.mapToScreen(before), anchor);
});

test('panning and zooming cannot expose space outside the map', () => {
    const camera = new Camera();
    camera.resize(800, 600);
    camera.zoomAt({x: 400, y: 300}, 2);
    camera.panBy({x: 10000, y: 10000});
    assert.deepEqual(camera.screenToMap({x: 0, y: 0}), {x: 0, y: 0});
    camera.panBy({x: -10000, y: -10000});
    assert.deepEqual(camera.screenToMap({x: 800, y: 600}), {x: 1, y: 1});
    camera.zoomAt({x: 400, y: 300}, 0.01);
    assert.equal(camera.scale, 1);
    assert.deepEqual(camera.mapToScreen({x: 0, y: 0}), {x: 0, y: 0});
});

test('resizing preserves the viewed map area', () => {
    const camera = new Camera();
    camera.resize(800, 800);
    camera.zoomAt({x: 400, y: 400}, 2);
    camera.panBy({x: -70, y: -30});
    const before = camera.screenToMap({x: 400, y: 400});
    camera.resize(400, 400);
    assert.deepEqual(camera.screenToMap({x: 200, y: 200}), before);
});
