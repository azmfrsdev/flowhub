// Renders deck.html to FlowHub-AI-Builder-Cup-2026-Deck.pdf, one 1280 x 720 page per slide.
// Uses the Playwright already in web/: node docs/pitch-deck/render.js
// Add --png <dir> to also write one PNG per slide (for checking the layout).
const path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [path.join(__dirname, '../../web')] }));

(async () => {
  const pngDir = process.argv.includes('--png') ? process.argv[process.argv.indexOf('--png') + 1] : null;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: pngDir ? 1.5 : 1 });
  await page.goto('file://' + path.join(__dirname, 'deck.html'), { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-ready="1"]');
  await page.waitForTimeout(300);

  if (pngDir) {
    const slides = await page.$$('section.slide');
    for (let i = 0; i < slides.length; i++) {
      await slides[i].screenshot({ path: path.join(pngDir, `slide-${String(i + 1).padStart(2, '0')}.png`) });
    }
  }

  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: path.join(__dirname, 'FlowHub-AI-Builder-Cup-2026-Deck.pdf'),
    width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true,
  });
  await browser.close();
  console.log('done');
})();
