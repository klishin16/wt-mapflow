const guidanceKey = 'wt-rat.enemy-tank-spawn-guidance';

export class BrowserMapSettings {
    showRatline(): boolean {
        try { return localStorage.getItem('wt-rat.show-ratline') !== 'false'; }
        catch { return true; }
    }

    setShowRatline(enabled: boolean): void {
        try { localStorage.setItem('wt-rat.show-ratline', String(enabled)); } catch { /* Session choice still applies. */ }
    }

    enemyTankSpawnGuidance(): boolean {
        try { return localStorage.getItem(guidanceKey) !== 'false'; }
        catch { return true; }
    }

    setEnemyTankSpawnGuidance(enabled: boolean): void {
        // The toggle still works for this session when browser storage is blocked.
        try { localStorage.setItem(guidanceKey, String(enabled)); } catch { /* Keep the in-memory choice. */ }
    }
}
