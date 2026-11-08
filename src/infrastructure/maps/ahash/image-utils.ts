import Pica from 'pica';

interface CropOptions {
    sx?: number;
    sy?: number;
    sw?: number;
    sh?: number;
    grayscaleFirst?: boolean;
}

class CanvasUtil {
    async resizeImageAndGetData(image: HTMLImageElement, width: number, height: number, options: CropOptions = {}): Promise<Uint8ClampedArray> {
        const canvas = await this.resizeImage(image, width, height, options);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D недоступен');
        return context.getImageData(0, 0, width, height).data;
    }

    async resizeImage(image: HTMLImageElement, width: number, height: number, {sx, sy, sw, sh, grayscaleFirst}: CropOptions = {}): Promise<HTMLCanvasElement> {
        const source = document.createElement('canvas');
        source.width = sw ?? (image.naturalWidth || image.width);
        source.height = sh ?? (image.naturalHeight || image.height);
        const context = source.getContext('2d');
        if (!context) throw new Error('Canvas 2D недоступен');
        if (sx !== undefined && sy !== undefined && sw !== undefined && sh !== undefined) {
            context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
        } else {
            context.drawImage(image, 0, 0);
        }

        if (grayscaleFirst) {
            const data = context.getImageData(0, 0, source.width, source.height);
            const gray = grayScaleConverter.convert(data.data);
            for (let index = 0; index < gray.length; index++) {
                data.data[index * 4] = gray[index];
                data.data[index * 4 + 1] = gray[index];
                data.data[index * 4 + 2] = gray[index];
            }
            context.putImageData(data, 0, 0);
        }
        const target = document.createElement('canvas');
        target.width = width;
        target.height = height;
        // Keep the original resize pipeline alongside the grayscale-first compatibility variant.
        const pica = new Pica({features: ['js', 'wasm'], concurrency: 1});
        await pica.resize(source, target);
        return target;
    }
}

export const canvasUtil = new CanvasUtil();

class GrayScaleConverter {

    /**
     *
     * RGBA -> L (ITU-R 601-2 luma transform)
     *
     * @param imgData {Uint8ClampedArray}
     */
    convert(imgData: Uint8ClampedArray): Uint8ClampedArray {
        const arr = new Uint8ClampedArray(imgData.length / 4);

        for (let i = 0; i < imgData.length; i += 4) {
            arr[i>>2] = Math.round((imgData[i] * 299 / 1000 + imgData[i + 1] * 587 / 1000 + imgData[i + 2] * 114 / 1000))
        }

        return arr;
    }
}

export const grayScaleConverter = new GrayScaleConverter()
