// MapLibre GL 6 runs its tile work in a Web Worker loaded from a separate
// file. Bundlers cannot follow how it finds that file, so the app serves it
// from /maplibre/ and points MapLibre at it with setWorkerUrl().
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
const to = join(root, 'public/maplibre/maplibre-gl-worker.mjs');
mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
