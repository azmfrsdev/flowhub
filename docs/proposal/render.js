// Renders proposal.html to PDF. Needs Playwright: npm i -D playwright && npx playwright install chromium
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.join(__dirname, 'proposal.html'), { waitUntil: 'networkidle' });
  await p.pdf({
    path: path.join(__dirname, 'FlowHub-AI-Builder-Cup-2026-Proposal.pdf'),
    format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:8px;color:#5b6070;width:100%;text-align:center;font-family:Segoe UI,Arial">FlowHub · AI Builder Cup 2026 · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'
  });
  await b.close();
  console.log('done');
})();
