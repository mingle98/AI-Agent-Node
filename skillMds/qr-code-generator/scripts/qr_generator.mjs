import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import sharp from 'sharp';

function parseArgs(argv) {
  const args = {
    data: '',
    output: 'qr-code.png',
    format: '',
    size: 1024,
    border: 4,
    errorCorrection: 'H',
    foreground: '#000000',
    background: '#ffffff',
    transparent: false,
    logo: '',
    logoScale: 0.2,
    moduleRadius: 0,
    label: '',
    labelFontSize: 42,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    switch (key) {
      case '--data': args.data = next || ''; i += 1; break;
      case '--output': args.output = next || args.output; i += 1; break;
      case '--format': args.format = next || ''; i += 1; break;
      case '--size': args.size = Number(next || args.size); i += 1; break;
      case '--border': args.border = Number(next || args.border); i += 1; break;
      case '--error-correction': args.errorCorrection = String(next || args.errorCorrection).toUpperCase(); i += 1; break;
      case '--foreground': args.foreground = next || args.foreground; i += 1; break;
      case '--background': args.background = next || args.background; i += 1; break;
      case '--transparent': args.transparent = true; break;
      case '--logo': args.logo = next || ''; i += 1; break;
      case '--logo-scale': args.logoScale = Number(next || args.logoScale); i += 1; break;
      case '--module-radius': args.moduleRadius = Number(next || args.moduleRadius); i += 1; break;
      case '--label': args.label = next || ''; i += 1; break;
      case '--label-font-size': args.labelFontSize = Number(next || args.labelFontSize); i += 1; break;
      default: break;
    }
  }

  return args;
}

function ensureParent(outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
}

function inferFormat(outputPath, explicitFormat = '') {
  return (explicitFormat || path.extname(outputPath).slice(1) || 'png').toLowerCase();
}

async function generateSvg(args, outputPath) {
  const svg = await QRCode.toString(args.data, {
    type: 'svg',
    errorCorrectionLevel: args.errorCorrection,
    margin: args.border,
    color: {
      dark: args.foreground,
      light: args.transparent ? '#0000' : args.background,
    },
    width: args.size,
  });
  fs.writeFileSync(outputPath, svg, 'utf8');
}

async function createBasePng(args) {
  const buffer = await QRCode.toBuffer(args.data, {
    type: 'png',
    errorCorrectionLevel: args.errorCorrection,
    margin: args.border,
    width: args.size,
    color: {
      dark: args.foreground,
      light: args.transparent ? '#0000' : args.background,
    },
  });
  return sharp(buffer).png();
}

async function compositeLogo(baseImage, args) {
  if (!args.logo) return baseImage;
  const logoPath = path.resolve(args.logo);
  if (!fs.existsSync(logoPath)) {
    throw new Error(`Logo 文件不存在: ${logoPath}`);
  }

  const metadata = await baseImage.metadata();
  const qrSize = metadata.width || args.size;
  const logoSize = Math.max(48, Math.round(qrSize * Math.min(Math.max(args.logoScale, 0.05), 0.35)));
  const plateSize = logoSize + Math.max(20, Math.round(logoSize * 0.24));

  const plate = await sharp({
    create: {
      width: plateSize,
      height: plateSize,
      channels: 4,
      background: args.transparent ? { r: 255, g: 255, b: 255, alpha: 0.96 } : args.background,
    },
  })
    .png()
    .composite([
      {
        input: await sharp(logoPath).resize(logoSize, logoSize, { fit: 'contain' }).png().toBuffer(),
        gravity: 'center',
      },
    ])
    .toBuffer();

  return baseImage.composite([{ input: plate, gravity: 'center' }]);
}

function escapeXml(text = '') {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function addLabel(baseImage, args) {
  if (!args.label) return baseImage;
  const metadata = await baseImage.metadata();
  const width = metadata.width || args.size;
  const height = metadata.height || args.size;
  const fontSize = args.labelFontSize;
  const labelArea = fontSize + 40;
  const textColor = args.foreground;
  const bgFill = args.transparent ? 'rgba(255,255,255,0)' : args.background;

  const svg = `
    <svg width="${width}" height="${labelArea}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${bgFill}" />
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="${fontSize}" fill="${textColor}" font-family="Arial, PingFang SC, Helvetica, sans-serif">${escapeXml(args.label)}</text>
    </svg>
  `;

  return sharp({
    create: {
      width,
      height: height + labelArea,
      channels: 4,
      background: args.transparent ? { r: 255, g: 255, b: 255, alpha: 0 } : args.background,
    },
  }).composite([
    { input: await baseImage.png().toBuffer(), left: 0, top: 0 },
    { input: Buffer.from(svg), left: 0, top: height },
  ]);
}

async function maybeRoundCorners(baseImage, args) {
  if (!args.moduleRadius) return baseImage;
  const metadata = await baseImage.metadata();
  const width = metadata.width || args.size;
  const radius = Math.max(0, Math.min(Number(args.moduleRadius) || 0, Math.round(width * 0.08)));
  if (!radius) return baseImage;
  const mask = Buffer.from(`<svg width="${width}" height="${metadata.height || width}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
  return baseImage.composite([{ input: mask, blend: 'dest-in' }]);
}

async function generatePng(args, outputPath) {
  let image = await createBasePng(args);
  image = await compositeLogo(image, args);
  image = await addLabel(image, args);
  image = await maybeRoundCorners(image, args);
  await image.png().toFile(outputPath);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.data) {
    throw new Error('缺少 --data 参数');
  }

  const outputPath = path.resolve(args.output);
  ensureParent(outputPath);
  const format = inferFormat(outputPath, args.format);

  if (format === 'svg') {
    await generateSvg(args, outputPath);
    console.log(`✓ SVG 二维码已生成: ${outputPath}`);
    return;
  }

  if (format !== 'png') {
    throw new Error('format 仅支持 png 或 svg');
  }

  await generatePng(args, outputPath);
  console.log(`✓ PNG 二维码已生成: ${outputPath}`);
}

main().catch((error) => {
  console.error(`错误: ${error.message}`);
  process.exit(1);
});
