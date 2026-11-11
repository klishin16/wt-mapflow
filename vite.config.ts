import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';

const proxy = {
    '/telemetry': {
        target: 'http://127.0.0.1:8111',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/telemetry/, '')
    }
};

export default defineConfig({
    server: {proxy}, preview: {proxy},
    build: {rolldownOptions: {input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url))
    }}}
});
