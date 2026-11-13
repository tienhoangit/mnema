import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const svgPath = path.join(rootDir, 'apps/web/public/favicon.svg');
const webPublicDir = path.join(rootDir, 'apps/web/public');
const extDir = path.join(rootDir, 'apps/extension');
const extIconsDir = path.join(extDir, 'icons');

function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += img.buffer.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((img) => img.buffer)]);
}

async function renderPng(width, height) {
  return sharp(svgPath)
    .resize(width, height, { fit: 'contain' })
    .png()
    .toBuffer();
}

async function renderPaddedPng(totalSize, logoSize, backgroundColor) {
  const logoBuffer = await renderPng(logoSize, logoSize);
  return sharp({
    create: {
      width: totalSize,
      height: totalSize,
      channels: 4,
      background: backgroundColor,
    },
  })
    .composite([
      {
        input: logoBuffer,
        gravity: 'center',
      },
    ])
    .png()
    .toBuffer();
}

async function packageExtensionZip() {
  const zip = new JSZip();
  const filesToInclude = ['manifest.json', 'popup.html'];
  for (const file of filesToInclude) {
    const fullPath = path.join(extDir, file);
    if (fs.existsSync(fullPath)) {
      zip.file(file, fs.readFileSync(fullPath));
    }
  }

  const dirsToInclude = ['dist', 'icons', 'vendor'];
  for (const dir of dirsToInclude) {
    const fullDirPath = path.join(extDir, dir);
    if (!fs.existsSync(fullDirPath)) continue;
    const addDirRecursive = (currentDir, relPrefix) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const itemPath = path.join(currentDir, entry.name);
        const relPath = path.posix.join(relPrefix, entry.name);
        if (entry.isDirectory()) {
          addDirRecursive(itemPath, relPath);
        } else if (entry.isFile()) {
          zip.file(relPath, fs.readFileSync(itemPath));
        }
      }
    };
    addDirRecursive(fullDirPath, dir);
  }

  const zipContent = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  const zipOutPath = path.join(webPublicDir, 'mnema-extension.zip');
  fs.writeFileSync(zipOutPath, zipContent);
  console.log(`📦 Extension package updated: ${zipOutPath} (${zipContent.length} bytes)`);
}

async function main() {
  console.log('Generating web & extension icons from favicon.svg...');

  if (!fs.existsSync(extIconsDir)) {
    fs.mkdirSync(extIconsDir, { recursive: true });
  }

  // 1. Web Favicons
  const b16 = await renderPng(16, 16);
  const b32 = await renderPng(32, 32);
  const b48 = await renderPng(48, 48);

  fs.writeFileSync(path.join(webPublicDir, 'favicon-16x16.png'), b16);
  fs.writeFileSync(path.join(webPublicDir, 'favicon-32x32.png'), b32);
  fs.writeFileSync(
    path.join(webPublicDir, 'favicon.ico'),
    createIco([
      { width: 16, height: 16, buffer: b16 },
      { width: 32, height: 32, buffer: b32 },
      { width: 48, height: 48, buffer: b48 },
    ])
  );

  // 2. Apple Touch Icon (180x180, solid #fcfbf9 background, safe logo)
  const appleTouch = await renderPaddedPng(180, 136, '#fcfbf9');
  fs.writeFileSync(path.join(webPublicDir, 'apple-touch-icon.png'), appleTouch);

  // 3. PWA Icons (192, 512, maskable)
  const b192 = await renderPng(192, 192);
  const b512 = await renderPng(512, 512);
  fs.writeFileSync(path.join(webPublicDir, 'icon-192.png'), b192);
  fs.writeFileSync(path.join(webPublicDir, 'icon-512.png'), b512);

  // Maskable PWA icons (with safe-zone ~72% of canvas, solid #fcfbf9 background)
  const maskable192 = await renderPaddedPng(192, 138, '#fcfbf9');
  const maskable512 = await renderPaddedPng(512, 368, '#fcfbf9');
  fs.writeFileSync(path.join(webPublicDir, 'icon-maskable-192.png'), maskable192);
  fs.writeFileSync(path.join(webPublicDir, 'icon-maskable-512.png'), maskable512);

  // 4. Chrome Extension Icons (16, 32, 48, 128)
  fs.writeFileSync(path.join(extIconsDir, 'icon16.png'), b16);
  fs.writeFileSync(path.join(extIconsDir, 'icon32.png'), b32);
  fs.writeFileSync(path.join(extIconsDir, 'icon48.png'), b48);
  const b128 = await renderPng(128, 128);
  fs.writeFileSync(path.join(extIconsDir, 'icon128.png'), b128);

  console.log('✅ All icons generated successfully.');

  // 5. Update extension package zip
  await packageExtensionZip();
}

main().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
