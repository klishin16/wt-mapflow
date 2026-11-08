declare module 'pica' {
    export default class Pica {
        constructor(options?: {features?: string[]; concurrency?: number});
        resize(source: HTMLCanvasElement, target: HTMLCanvasElement): Promise<HTMLCanvasElement>;
    }
}
