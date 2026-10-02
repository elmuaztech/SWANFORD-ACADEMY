import sharp from 'sharp';
import fs from 'fs';

async function makeIcons() {
  const logoPath = 'public/images/swanford-logo.jpg';
  if (!fs.existsSync(logoPath)) {
    console.error('Logo not found at', logoPath);
    return;
  }

  // 1. Generate 32x32 png favicon
  await sharp(logoPath).resize(32, 32).png().toFile('public/favicon.png');
  // 2. Generate 32x32 for public/favicon.ico
  await sharp(logoPath).resize(32, 32).png().toFile('public/favicon.ico');
  // 3. Generate Next.js app/icon.png (64x64)
  await sharp(logoPath).resize(64, 64).png().toFile('src/app/icon.png');
  // 4. Generate Next.js app/apple-icon.png (180x180)
  await sharp(logoPath).resize(180, 180).png().toFile('src/app/apple-icon.png');

  console.log('Icons generated successfully from school logo!');
}

makeIcons().catch(console.error);
