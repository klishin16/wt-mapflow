export interface MapHashSample {
    readonly format: string;
    readonly hash: string;
}

export interface MapCandidate {
    readonly mapId: string;
    readonly distance: number;
    readonly format: string;
    readonly reference: string;
}

export interface MapRecognition {
    readonly imageHash: string;
    readonly mapId: string;
    readonly method: 'manual' | 'exact' | 'similar' | 'ambiguous' | 'unknown';
    readonly samples: readonly MapHashSample[];
    readonly candidates: readonly MapCandidate[];
}

export const mapMatchThreshold = 3;
export const mapMatchMargin = 2;

export function bitDistance(left: string, right: string): number {
    if (!/^[a-f0-9]{16}$/i.test(left) || !/^[a-f0-9]{16}$/i.test(right)) throw new Error('Ожидается 64-битный хеш');
    let distance = 0;
    for (let index = 0; index < left.length; index++) {
        let bits = parseInt(left[index], 16) ^ parseInt(right[index], 16);
        while (bits) { distance++; bits &= bits - 1; }
    }
    return distance;
}

export function rankMapHashes(samples: readonly MapHashSample[], references: readonly {hash: string; mapId: string}[]): readonly MapCandidate[] {
    const byMap = new Map<string, MapCandidate>();
    for (const sample of samples) {
        for (const reference of references) {
            const distance = bitDistance(sample.hash, reference.hash);
            const previous = byMap.get(reference.mapId);
            if (!previous || distance < previous.distance) {
                byMap.set(reference.mapId, {mapId: reference.mapId, distance, format: sample.format, reference: reference.hash});
            }
        }
    }
    return [...byMap.values()].sort((a, b) => a.distance - b.distance || a.mapId.localeCompare(b.mapId));
}

export function recognizeMapHashes(imageHash: string, samples: readonly MapHashSample[], references: readonly {hash: string; mapId: string}[], manual?: string): MapRecognition {
    const candidates = rankMapHashes(samples, references);
    const first = candidates[0];
    const second = candidates[1];
    // Flat images must never match automatically, even if the catalog has a nearby hash.
    const flat = samples.every(sample => /^(0{16}|f{16})$/i.test(sample.hash));
    let method: MapRecognition['method'] = 'unknown';
    if (manual) method = 'manual';
    else if (!flat && first && first.distance <= mapMatchThreshold) {
        method = second && second.distance - first.distance < mapMatchMargin ? 'ambiguous' : first.distance === 0 ? 'exact' : 'similar';
    }
    return {
        imageHash, samples, candidates: candidates.slice(0, 5), method,
        mapId: manual ?? ((method === 'exact' || method === 'similar') ? first.mapId : `custom-${imageHash}`)
    };
}
