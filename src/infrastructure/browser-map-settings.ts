const guidanceKey = 'wt-rat.enemy-tank-spawn-guidance';

export class BrowserMapSettings {
    adaptiveAircraftZoom(): boolean {
        try { return localStorage.getItem('wt-mapflow.adaptive-aircraft-zoom') !== 'false'; }
        catch { return true; }
    }

    setAdaptiveAircraftZoom(enabled: boolean): void {
        try { localStorage.setItem('wt-mapflow.adaptive-aircraft-zoom', String(enabled)); } catch { /* Session choice still applies. */ }
    }

    onlyOwnSpawnPositions(): boolean {
        try { return localStorage.getItem('wt-mapflow.only-own-spawn-positions') !== 'false'; }
        catch { return true; }
    }

    setOnlyOwnSpawnPositions(enabled: boolean): void {
        try { localStorage.setItem('wt-mapflow.only-own-spawn-positions', String(enabled)); } catch { /* Session choice still applies. */ }
    }

    showPreparationRoutes(): boolean {
        try { return localStorage.getItem('wt-mapflow.show-preparation-routes') !== 'false'; }
        catch { return true; }
    }

    setShowPreparationRoutes(enabled: boolean): void {
        try { localStorage.setItem('wt-mapflow.show-preparation-routes', String(enabled)); } catch { /* Session choice still applies. */ }
    }

    showAirfieldAirDefence(): boolean {
        try { return localStorage.getItem('wt-rat.show-airfield-air-defence') === 'true'; }
        catch { return false; }
    }

    setShowAirfieldAirDefence(enabled: boolean): void {
        try { localStorage.setItem('wt-rat.show-airfield-air-defence', String(enabled)); } catch { /* Session choice still applies. */ }
    }

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
