// Génère les PDF de ../ à partir des pages HTML de ce dossier, avec Microsoft Edge.
// Usage : npm install (dans docs/source), puis node build-pdf.cjs
const puppeteer = require('puppeteer-core');
const path = require('path');
const { pathToFileURL } = require('url');

const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DOCS = [
  ['guide-utilisateur.html', 'Guide-utilisateur-Serveur-MCP.pdf'],
  ['documentation-technique.html', 'Documentation-technique-Serveur-MCP.pdf'],
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage();
  for (const [source, target] of DOCS) {
    await page.goto(pathToFileURL(path.join(__dirname, source)).href, { waitUntil: 'networkidle0' });
    await page.pdf({ path: path.join(__dirname, '..', target), format: 'A4', printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
    console.log('PDF :', target);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
