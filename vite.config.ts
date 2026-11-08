import {defineConfig} from 'vite';

const proxy = {
    '/telemetry': {
        target: 'http://127.0.0.1:8111',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/telemetry/, '')
    }
};

export default defineConfig({server: {proxy}, preview: {proxy}});
