import type {LoadOptions, PersonalPositionStore, PositionRepository, PositionSet} from './ports.ts';
import {asError, throwIfAborted} from './errors.ts';

export class MergedPositionRepository implements PositionRepository {
    private readonly base: PositionRepository;
    private readonly personal: PersonalPositionStore;

    constructor(base: PositionRepository, personal: PersonalPositionStore) {
        this.base = base;
        this.personal = personal;
    }

    async list(mapId: string, options: LoadOptions = {}): Promise<PositionSet> {
        const [base, changes] = await Promise.all([
            this.base.list(mapId, options).catch((error: unknown): PositionSet => {
                throwIfAborted(options.signal);
                return {positions: [], missing: true, warning: `Встроенные позиции недоступны: ${asError(error).message}`};
            }),
            this.personal.list(mapId)
        ]);
        throwIfAborted(options.signal);
        const positions = new Map(base.positions.map(position => [position.id, position]));
        for (const change of changes) {
            if (change.position) positions.set(change.id, change.position);
            else positions.delete(change.id);
        }
        return {positions: [...positions.values()], missing: base.missing && positions.size === 0, warning: base.warning};
    }
}
