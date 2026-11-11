import './admin.css';
import {MapCatalogService} from './application/map-catalog.ts';
import {BrowserMapCatalog} from './infrastructure/maps/browser-map-catalog.ts';
import {AdminMaps} from './presentation/admin-maps.ts';

// Separate composition root: no game telemetry or map polling on the admin page.
try {
    const catalog = new BrowserMapCatalog();
    const admin = new AdminMaps(new MapCatalogService(catalog));
    const unsubscribe = catalog.subscribe(() => admin.refresh());
    if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribe(); admin.destroy(); catalog.destroy(); });
} catch (error: unknown) {
    const status = document.getElementById('admin-results');
    if (status) { status.setAttribute('role', 'alert'); status.textContent = `Каталог недоступен: ${error instanceof Error ? error.message : String(error)}`; }
    console.error(error);
}
