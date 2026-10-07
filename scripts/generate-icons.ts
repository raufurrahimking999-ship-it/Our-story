import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT_DIR = process.cwd();
const ICON_INPUT_DIR = path.join(ROOT_DIR, 'public', 'icon');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const ANDROID_RES_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'res');

// Candidate source icons in priority order
const SOURCE_CANDIDATES = [
  path.join(ICON_INPUT_DIR, 'app-icon.png'),
  path.join(ICON_INPUT_DIR, 'app-icon.jpg'),
  path.join(ICON_INPUT_DIR, 'app-icon.jpeg'),
  path.join(ICON_INPUT_DIR, 'app-icon.webp'),
  path.join(PUBLIC_DIR, 'icon-512.png'),
  path.join(PUBLIC_DIR, 'icon.png'),
];

async function findSourceIcon(): Promise<string | null> {
  for (const candidate of SOURCE_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      const stats = fs.statSync(candidate);
      if (stats.size > 0) {
        return candidate;
      }
    }
  }
  return null;
}

interface MipmapDensity {
  folder: string;
  legacySize: number;
  adaptiveSize: number;
}

const ANDROID_DENSITIES: MipmapDensity[] = [
  { folder: 'mipmap-mdpi', legacySize: 48, adaptiveSize: 108 },
  { folder: 'mipmap-hdpi', legacySize: 72, adaptiveSize: 162 },
  { folder: 'mipmap-xhdpi', legacySize: 96, adaptiveSize: 216 },
  { folder: 'mipmap-xxhdpi', legacySize: 144, adaptiveSize: 324 },
  { folder: 'mipmap-xxxhdpi', legacySize: 192, adaptiveSize: 432 },
];

const WEB_ICON_SIZES = [
  { file: 'favicon.png', size: 64 },
  { file: 'icon-48.png', size: 48 },
  { file: 'icon-72.png', size: 72 },
  { file: 'icon-96.png', size: 96 },
  { file: 'icon-144.png', size: 144 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon.png', size: 512 },
  { file: 'icon-foreground.png', size: 512 },
  { file: 'icon-background.png', size: 512 },
];

async function detectBackgroundColor(sourceBuffer: Buffer): Promise<string> {
  try {
    const { data, info } = await sharp(sourceBuffer)
      .resize(32, 32, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Check top-left corner alpha and rgb
    const r = data[0];
    const g = data[1];
    const b = data[2];
    const a = data[3];

    // If corner is transparent, use app's signature dark background #040711
    if (a < 50) {
      return '#040711';
    }

    const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch {
    return '#040711';
  }
}

async function generateAdaptiveForeground(
  sourceBuffer: Buffer,
  totalSize: number,
  outputPath: string
) {
  // Safe zone for adaptive icons is the central 70%
  const innerSize = Math.round(totalSize * 0.70);
  const offset = Math.round((totalSize - innerSize) / 2);

  const resizedInner = await sharp(sourceBuffer)
    .resize(innerSize, innerSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  await sharp({
    create: {
      width: totalSize,
      height: totalSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: resizedInner,
        top: offset,
        left: offset,
      },
    ])
    .png()
    .toFile(outputPath);
}

async function run() {
  console.log('🎨 Starting App Icon generation...');

  if (!fs.existsSync(ICON_INPUT_DIR)) {
    fs.mkdirSync(ICON_INPUT_DIR, { recursive: true });
  }

  const srcPath = await findSourceIcon();
  if (!srcPath) {
    console.error('❌ No valid source icon found in public/icon/ or public/');
    return;
  }

  console.log(`📁 Source icon located: ${srcPath}`);
  const sourceBuffer = fs.readFileSync(srcPath);
  const detectedBgColor = await detectBackgroundColor(sourceBuffer);
  console.log(`🎨 Detected launcher background color: ${detectedBgColor}`);

  // 1. Generate Android Mipmap Icons (if android directory exists)
  if (fs.existsSync(ANDROID_RES_DIR)) {
    console.log('📱 Generating Android launcher and adaptive icons...');

    for (const density of ANDROID_DENSITIES) {
      const targetDir = path.join(ANDROID_RES_DIR, density.folder);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Legacy launcher icon (e.g. for older Android / settings / file managers)
      const icLauncherPath = path.join(targetDir, 'ic_launcher.png');
      await sharp(sourceBuffer)
        .resize(density.legacySize, density.legacySize, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(icLauncherPath);

      // Round launcher icon
      const icLauncherRoundPath = path.join(targetDir, 'ic_launcher_round.png');
      await sharp(sourceBuffer)
        .resize(density.legacySize, density.legacySize, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(icLauncherRoundPath);

      // Adaptive icon foreground
      const icForegroundPath = path.join(targetDir, 'ic_launcher_foreground.png');
      await generateAdaptiveForeground(sourceBuffer, density.adaptiveSize, icForegroundPath);
    }

    // Update Android adaptive icon background color in values/ic_launcher_background.xml
    const valuesDir = path.join(ANDROID_RES_DIR, 'values');
    if (fs.existsSync(valuesDir)) {
      const bgXmlPath = path.join(valuesDir, 'ic_launcher_background.xml');
      const bgXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${detectedBgColor}</color>
</resources>
`;
      fs.writeFileSync(bgXmlPath, bgXmlContent, 'utf-8');
    }

    console.log('✓ Android launcher mipmaps and background color synced successfully.');
  }

  // 2. Generate Web & PWA Icons in public/
  console.log('🌐 Generating Web & PWA icons...');
  for (const item of WEB_ICON_SIZES) {
    const targetFile = path.join(PUBLIC_DIR, item.file);
    await sharp(sourceBuffer)
      .resize(item.size, item.size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(targetFile);
  }
  console.log('✓ Web and PWA icons generated successfully.');

  // If source was not in public/icon/app-icon.png, make sure public/icon/app-icon.png exists
  const standardAppIconPath = path.join(ICON_INPUT_DIR, 'app-icon.png');
  if (!fs.existsSync(standardAppIconPath)) {
    fs.copyFileSync(srcPath, standardAppIconPath);
  }

  console.log('🎉 All App Icons generated and synced successfully!');
}

run().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
