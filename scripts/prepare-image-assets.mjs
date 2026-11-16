import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = path.join(root, '.work', 'raster');
await mkdir(temp, { recursive: true });

const chase = 'https://www.chase.com/content/dam/';
const entries = [
  ['cardDebit', 'unified-assets/card-art/chase-debit/debit_core_RFID_V.png', true],
  ['cardDebitBusiness', 'unified-assets/digital-cards/aoa-retail/debit_biz_total_V.png', true],
  ['cardSapphirePreferred', 'unified-assets/card-art/chase-sapphire/sapphire-preferred/card_sapphirePref_chip_rfid_VS.png', true],
  ['cardSapphireReserve', 'unified-assets/card-art/chase-sapphire/sapphire-reserve/card_sapphireRes_VI.png', true],
  ['cardFreedomUnlimited', 'unified-assets/card-art/chase-freedom/freedom-unlimited/card_freedomUtld_V.png', true],
  ['cardFreedomFlex', 'unified-assets/card-art/chase-freedom/freedom-flex/card_freedomFlex_MC.png', true],
  ['cardInkUnlimited', 'unified-assets/card-art/chase-ink/unlimited/card_ink_biz_ultd_VSB.png', true],
  ['cardInkPreferred', 'unified-assets/card-art/chase-ink/preferred/card_ink_biz_pref_VSB.png', true],
  ['cardInkCash', 'unified-assets/card-art/chase-ink/cash/card_ink_biz_cash_VSB.png', true],
  ['logoZelle', 'unified-assets/logo/other-logos/zelle/logo_zelle_146x60.png', false],
  ['logoBusiness', 'unified-assets/logo/chase-brands/chase-for-business/additional-file-formats/CfB_UpdatedLogo_Stacked_2026.png', false],
  ['brandDoordash', 'https://creditcards.chase.com/content/dam/jpmc-marketplace/site-assets/logos/doordash_logo.png', false],
  ['brandLyft', 'https://creditcards.chase.com/content/dam/jpmc-marketplace/site-assets/logos/lyft_logo.png', false],
];

let output = '// Generated from official Chase artwork by scripts/prepare-image-assets.mjs.\n';
output += '// Text-embedded images survive single-file builds and source-only workspace restores.\n';

for (const [name, source, isCard] of entries) {
  const url = source.startsWith('https:') ? source : chase + source;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Image download failed (${response.status}): ${url}`);
  let image = Buffer.from(await response.arrayBuffer());
  if (!image.subarray(0, 4).equals(Buffer.from([137, 80, 78, 71]))) {
    throw new Error(`Expected a PNG image: ${url}`);
  }
  let mime = 'image/png';
  if (isCard) {
    const input = path.join(temp, `${name}.png`);
    const target = path.join(temp, `${name}.webp`);
    await writeFile(input, image);
    execFileSync('convert', [input, '-resize', '360x', '-strip', '-quality', '85', target]);
    image = await readFile(target);
    mime = 'image/webp';
  }
  output += `export const ${name} = 'data:${mime};base64,${image.toString('base64')}';\n`;
  console.log(`${name}: ${image.length} bytes`);
}

// Resize and compress the advisor photo so the inlined bundle stays small.
const advisorSource = path.join(root, 'public/images/advisor.jpg');
const advisorOptimized = path.join(temp, 'advisor-optimized.jpg');
execFileSync('convert', [advisorSource, '-resize', '900x', '-strip', '-quality', '72', advisorOptimized]);
const advisor = await readFile(advisorOptimized);
output += `export const advisorImg = 'data:image/jpeg;base64,${advisor.toString('base64')}';\n`;
await writeFile(path.join(root, 'src/assets/chase/rasterAssets.ts'), output);
console.log('All image artwork is embedded in src/assets/chase/rasterAssets.ts');