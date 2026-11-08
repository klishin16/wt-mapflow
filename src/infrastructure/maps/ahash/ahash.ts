import {canvasUtil, grayScaleConverter} from "./image-utils.ts";
import {ImageHash} from "./hash.ts";


/**
 * @param image {Image}
 * @param size {number}
 */
export async function ahash(image: HTMLImageElement, size = 8, grayscaleFirst = false): Promise<ImageHash> {
    const pixels = grayScaleConverter.convert(await canvasUtil.resizeImageAndGetData(image, size, size, {grayscaleFirst}));

    const hash = new Uint8ClampedArray(size * size);

    let sum = 0;
    for (let i = 0; i < pixels.length; i++) {
        sum += pixels[i];
    }
    const avg = sum / pixels.length;

    for (let i = 0; i < pixels.length; i++) {
        hash[i] = pixels[i] > avg ? 1 : 0;
    }

    return new ImageHash(hash);
}