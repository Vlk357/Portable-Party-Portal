/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import tailwindcss from '@tailwindcss/vite'; // Import the plugin
export default defineConfig({
    root: __dirname,
    cacheDir: '../../../node_modules/.vite/apps/frontend/auth',
    server: {
        port: 5173, // Specify the port
        host: '0.0.0.0', // Listen on all network interfaces within the container
        // hmr: {
        //   // Optional: configure HMR port if needed behind proxy
        //   clientPort: 8080, // Port the browser connects to (Nginx)
        // },
    },
    preview: {
        port: 4300,
        host: 'localhost',
    },
    // Add tailwindcss() to the plugins array
    plugins: [react(), tailwindcss(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
    // Uncomment this if you are using workers.
    // worker: {
    //  plugins: [ nxViteTsPaths() ],
    // },
    build: {
        outDir: '../../../dist/apps/frontend/auth',
        emptyOutDir: true,
        reportCompressedSize: true,
        commonjsOptions: {
            transformMixedEsModules: true,
        },
    },
    test: {
        watch: false,
        globals: true,
        environment: 'jsdom',
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        reporters: ['default'],
        coverage: {
            reportsDirectory: '../../../coverage/apps/frontend/auth',
            provider: 'v8',
        },
    },
});
