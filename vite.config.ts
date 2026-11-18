import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig, loadEnv, type Plugin} from 'vite';

function cblsServiceWorkerPrecachePlugin(): Plugin {
  return {
    name: 'cbls-sw-precache',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir ? path.resolve(options.dir) : path.resolve('dist');
      const swPath = path.join(outDir, 'sw.js');
      if (!fs.existsSync(swPath)) return;

      const discoveredUrls: string[] = ['/'];
      const allowedExt = new Set([
        '.html',
        '.js',
        '.css',
        '.png',
        '.jpg',
        '.jpeg',
        '.svg',
        '.webp',
        '.woff',
        '.woff2',
        '.json',
      ]);

      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
            continue;
          }
          const rel = '/' + path.relative(outDir, full).replace(/\\/g, '/');
          if (rel === '/sw.js') continue;
          // Exclude conversation screenshot attachments that are not UI assets
          if (/^\/assets\/aistudio\/image_[^/]+\.png$/i.test(rel)) continue;
          const ext = path.extname(entry.name).toLowerCase();
          if (allowedExt.has(ext)) {
            discoveredUrls.push(rel);
          }
        }
      };

      walk(outDir);
      const uniqueUrls = Array.from(new Set(discoveredUrls)).sort();
      const buildHash = `v${Date.now().toString(36)}`;

      let swContent = fs.readFileSync(swPath, 'utf8');
      swContent = swContent
        .replace(
          /\/\* __CBLS_BUILD_HASH__ \*\/ '[^']*'/,
          `/* __CBLS_BUILD_HASH__ */ '${buildHash}'`,
        )
        .replace(
          /\/\* __CBLS_PRECACHE_MANIFEST__ \*\/ \[\]/,
          `/* __CBLS_PRECACHE_MANIFEST__ */ ${JSON.stringify(uniqueUrls, null, 2)}`,
        );

      fs.writeFileSync(swPath, swContent, 'utf8');
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const mapsApiKey =
    env.VITE_GOOGLE_MAPS_API_KEY ||
    env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    '';

  return {
    plugins: [react(), tailwindcss(), cblsServiceWorkerPrecachePlugin()],
    define: {
      __GOOGLE_MAPS_API_KEY__: JSON.stringify(mapsApiKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
