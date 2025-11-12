const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { invoiceStoragePath, pdfTempPath } = require('../config/env');
const { renderInvoiceTemplate } = require('../templates/invoiceTemplate');

const DEFAULT_MARGIN = {
  top: '20mm',
  right: '16mm',
  bottom: '20mm',
  left: '16mm',
};

const ensureDirectory = (dirPath) => {
  if (!dirPath) {
    return null;
  }
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.accessSync(dirPath, fs.constants.W_OK);
    return dirPath;
  } catch (error) {
    console.warn(`[pdfService] Unable to use directory "${dirPath}": ${error.message}`);
    return null;
  }
};

let resolvedPersistDirectory = null;
let persistDirectoryResolved = false;

const resolvePersistDirectory = () => {
  if (persistDirectoryResolved) {
    return resolvedPersistDirectory;
  }

  const candidates = Array.from(new Set([
    invoiceStoragePath,
    pdfTempPath,
    path.join(os.tmpdir(), 'bridges-physio-invoices'),
  ].filter(Boolean)));

  for (const candidate of candidates) {
    const resolved = ensureDirectory(candidate);
    if (resolved) {
      resolvedPersistDirectory = resolved;
      persistDirectoryResolved = true;
      return resolvedPersistDirectory;
    }
  }

  persistDirectoryResolved = true;
  resolvedPersistDirectory = null;
  console.warn('[pdfService] Warning: no writable directory available for invoice PDFs; falling back to in-memory buffers only.');
  return null;
};

const resolveExecutablePath = () => (
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  || process.env.CHROME_EXECUTABLE_PATH
  || null
);

const buildLaunchOptions = () => {
  const options = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };
  const executablePath = resolveExecutablePath();
  if (executablePath) {
    options.executablePath = executablePath;
  }
  return options;
};

let browserPromise = null;

const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = chromium.launch(buildLaunchOptions())
      .catch((error) => {
        browserPromise = null;
        throw error;
      });
  }
  return browserPromise;
};

const waitForFonts = async (page) => {
  try {
    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    });
  } catch (error) {
    console.warn('[pdfService] Unable to confirm font readiness before PDF render', error.message);
  }
};

const waitForContent = async (page) => {
  try {
    await page.waitForFunction(
      () => document.body && document.body.innerText.trim().length > 0,
      { timeout: 5000 },
    );
  } catch (error) {
    console.warn('[pdfService] Timed out waiting for invoice content to render', error.message);
  }
};

const generateInvoicePdf = async ({ invoice, clinicSettings }) => {
  const persistDirectory = resolvePersistDirectory();
  const filename = `${invoice.invoice_number}.pdf`;
  const targetPath = persistDirectory ? path.join(persistDirectory, filename) : null;
  const html = renderInvoiceTemplate({ invoice, clinicSettings });

  const browser = await getBrowser();
  const page = await browser.newPage();

  let pdfBuffer;
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    await waitForFonts(page);
    await waitForContent(page);
    await page.emulateMedia({ media: 'screen' });
    pdfBuffer = await page.pdf({
      path: targetPath || undefined,
      format: 'A4',
      printBackground: true,
      margin: DEFAULT_MARGIN,
    });
  } finally {
    await page.close().catch(() => {});
  }

  return {
    pdfPath: targetPath,
    pdfBuffer,
    html,
  };
};

module.exports = {
  generateInvoicePdf,
};
