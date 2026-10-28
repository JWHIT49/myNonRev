#!/usr/bin/env node
// Copies the runtime web files into www/, the folder the native (Capacitor) shell bundles. The service worker is left out: inside the
// native app the files ship in the app itself.
import { cp, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'www');

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const item of ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons']) {
  await cp(path.join(ROOT, item), path.join(OUT, item), { recursive: true });
}
console.log(`staged web files in ${path.relative(ROOT, OUT)}/`);
