import type {Point} from '../domain/geometry.ts';
import {Camera} from './camera.ts';

interface InputCallbacks {
    readonly onPan: () => void;
    readonly onZoom: () => void;
    readonly onClick: (point: Point) => void;
    readonly onLongPress: (point: Point) => void;
}

export function attachMapInput(canvas: HTMLCanvasElement, camera: Camera, callbacks: InputCallbacks): () => void {
    const controller = new AbortController();
    const {signal} = controller;
    const pointers = new Map<number, Point>();
    let dragDistance = 0;
    let manualGesture = false;
    let longPressed = false;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    const cancelHold = (): void => { clearTimeout(holdTimer); holdTimer = undefined; };
    const beginPan = (): void => {
        if (!manualGesture) callbacks.onPan();
        manualGesture = true;
    };
    const local = (event: MouseEvent): Point => {
        const bounds = canvas.getBoundingClientRect();
        return {x: event.clientX - bounds.left, y: event.clientY - bounds.top};
    };
    const gesture = (): {center: Point; distance: number} | null => {
        const [first, second] = [...pointers.values()];
        if (!first || !second) return null;
        return {
            center: {x: (first.x + second.x) / 2, y: (first.y + second.y) / 2},
            distance: Math.hypot(first.x - second.x, first.y - second.y)
        };
    };
    canvas.addEventListener('wheel', event => {
        event.preventDefault();
        cancelHold();
        const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
        camera.zoomAt(local(event), Math.exp(-pixels * 0.001));
        callbacks.onZoom();
    }, {passive: false, signal});
    canvas.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) { longPressed = false; return; }
        if (pointers.size === 0) {
            dragDistance = 0;
            manualGesture = false;
            longPressed = false;
        }
        pointers.set(event.pointerId, local(event));
        cancelHold();
        if (pointers.size === 1) {
            const point = local(event);
            holdTimer = setTimeout(() => {
                longPressed = true;
                callbacks.onLongPress(point);
            }, 600);
        }
        canvas.setPointerCapture(event.pointerId);
        canvas.classList.add('is-dragging');
    }, {signal});
    canvas.addEventListener('pointermove', event => {
        const previous = pointers.get(event.pointerId);
        if (!previous) return;
        const before = gesture();
        const current = local(event);
        pointers.set(event.pointerId, current);
        const after = gesture();
        if (before && after) {
            cancelHold();
            beginPan();
            if (before.distance > 0) camera.zoomAt(before.center, after.distance / before.distance);
            callbacks.onZoom();
            camera.panBy({x: after.center.x - before.center.x, y: after.center.y - before.center.y});
        } else {
            const delta = {x: current.x - previous.x, y: current.y - previous.y};
            dragDistance += Math.hypot(delta.x, delta.y);
            if (dragDistance >= 4) {
                cancelHold();
                beginPan();
                camera.panBy(delta);
            }
        }
    }, {signal});
    const release = (event: PointerEvent): void => {
        cancelHold();
        const click = event.type === 'pointerup' && pointers.has(event.pointerId) && pointers.size === 1 && !manualGesture && !longPressed;
        pointers.delete(event.pointerId);
        if (pointers.size === 0) canvas.classList.remove('is-dragging');
        if (click) callbacks.onClick(local(event));
    };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
        canvas.addEventListener(name, release, {signal});
    }
    window.addEventListener('blur', () => {
        cancelHold();
        pointers.clear();
        canvas.classList.remove('is-dragging');
    }, {signal});
    canvas.addEventListener('contextmenu', event => {
        event.preventDefault();
        cancelHold();
        if (!longPressed) callbacks.onLongPress(local(event));
    }, {signal});
    return () => { cancelHold(); controller.abort(); };
}
