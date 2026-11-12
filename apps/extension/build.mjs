import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const vendorDir = path.join(__dirname, 'vendor');

// 1. Ensure directories exist
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}
if (!fs.existsSync(vendorDir)) {
  fs.mkdirSync(vendorDir, { recursive: true });
}

// 2. Ensure vendor/Readability.js exists
const srcReadability = path.resolve(__dirname, '../../node_modules/@mozilla/readability/Readability.js');
const destReadability = path.join(vendorDir, 'Readability.js');
if (fs.existsSync(srcReadability)) {
  fs.copyFileSync(srcReadability, destReadability);
}

// 3. Bundle extension scripts with esbuild as self-contained browser IIFEs
const entryPoints = [
  { in: path.join(__dirname, 'src/popup.ts'), out: 'popup' },
  { in: path.join(__dirname, 'src/highlighter.ts'), out: 'highlighter' },
  { in: path.join(__dirname, 'src/kindle-sync.ts'), out: 'kindle-sync' },
  { in: path.join(__dirname, 'src/x-sync.ts'), out: 'x-sync' },
];

for (const entry of entryPoints) {
  await esbuild.build({
    entryPoints: [entry.in],
    outfile: path.join(distDir, `${entry.out}.js`),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome100', 'es2022'],
    minify: false,
    sourcemap: false,
  });
}

console.log('✅ Extension build completed successfully.');
