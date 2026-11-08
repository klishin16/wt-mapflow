import type {PositionAttachment, ScreenshotInput, ScreenshotProcessor} from '../../application/ports.ts';

export class BrowserScreenshots implements ScreenshotProcessor {
    async prepare(input: ScreenshotInput, id: string): Promise<PositionAttachment> {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(input.blob.type)) throw new Error('Скриншоты: PNG, JPEG или WebP');
        if (input.blob.size > 8 * 1024 * 1024) throw new Error('Скриншот должен быть не больше 8 МБ');
        const bitmap = await createImageBitmap(input.blob).catch(() => { throw new Error('Не удалось прочитать скриншот'); });
        try {
            const ratio = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
            canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas 2D недоступен');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
                value => value ? resolve(value) : reject(new Error('Не удалось обработать скриншот')), 'image/jpeg', 0.88
            ));
            return {id, name: input.name.slice(0, 256), blob};
        } finally { bitmap.close(); }
    }
}
