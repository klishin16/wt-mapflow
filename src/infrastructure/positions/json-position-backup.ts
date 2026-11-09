import type {PositionAttachment, PositionBackup, PositionBackupCodec, ScreenshotProcessor} from '../../application/ports.ts';
import {decodePositionChange} from './position-codec.ts';
import {isRecord} from '../records.ts';

export class JsonPositionBackup implements PositionBackupCodec {
    private readonly screenshots: ScreenshotProcessor;

    constructor(screenshots: ScreenshotProcessor) { this.screenshots = screenshots; }

    async encode(backup: PositionBackup): Promise<Blob> {
        const attachments = [];
        for (const image of backup.attachments) {
            const bytes = new Uint8Array(await image.blob.arrayBuffer());
            let binary = '';
            for (let start = 0; start < bytes.length; start += 32768) binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
            attachments.push({id: image.id, name: image.name, type: image.blob.type, data: btoa(binary)});
        }
        return new Blob([JSON.stringify({format: 'wt-rat-positions', version: 1, changes: backup.changes, attachments})], {type: 'application/json'});
    }

    async decode(file: Blob): Promise<PositionBackup> {
        if (file.size > 100 * 1024 * 1024) throw new Error('Файл импорта должен быть не больше 100 МБ');
        const data: unknown = JSON.parse(await file.text());
        if (!isRecord(data) || data.format !== 'wt-rat-positions' || data.version !== 1 || !Array.isArray(data.changes) || !Array.isArray(data.attachments)) {
            throw new Error('Нужен файл экспорта WT MapFlow версии 1');
        }
        const changes = data.changes.map(decodePositionChange);
        const attachments: PositionAttachment[] = [];
        const ids = new Set<string>();
        for (const raw of data.attachments as unknown[]) {
            if (!isRecord(raw) || typeof raw.id !== 'string' || !/^local:[\w-]+$/.test(raw.id) || ids.has(raw.id) ||
                typeof raw.data !== 'string' || raw.data.length > 12 * 1024 * 1024 || typeof raw.type !== 'string' || typeof raw.name !== 'string') {
                throw new Error('Некорректный скриншот в файле импорта');
            }
            ids.add(raw.id);
            const binary = atob(raw.data);
            const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
            attachments.push(await this.screenshots.prepare({name: raw.name, blob: new Blob([bytes], {type: raw.type})}, raw.id));
        }
        for (const change of changes) {
            for (const reference of change.position?.screenshots ?? []) {
                if (reference.startsWith('local:') && !ids.has(reference)) throw new Error('В файле отсутствует скриншот позиции');
            }
        }
        return {version: 1, changes, attachments};
    }
}
