const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

let localChromeExecutablePath = null;
try {
  // Prefer puppeteer's bundled Chromium for local development if available.
  // This dependency is optional in production builds.
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const localPuppeteer = require('puppeteer');
  if (typeof localPuppeteer.executablePath === 'function') {
    localChromeExecutablePath = localPuppeteer.executablePath();
  }
} catch (error) {
  localChromeExecutablePath = null;
}
const { invoiceStoragePath } = require('../config/env');
const { renderInvoiceTemplate } = require('../templates/invoiceTemplate');

const ensureDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const isServerlessEnvironment = Boolean(
  process.env.AWS_REGION
  || process.env.LAMBDA_TASK_ROOT
  || process.env.VERCEL,
);

const resolveExecutable = async () => {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return {
      path: process.env.PUPPETEER_EXECUTABLE_PATH,
      useChromiumConfig: false,
    };
  }

  if (process.env.CHROMIUM_PATH) {
    return {
      path: process.env.CHROMIUM_PATH,
      useChromiumConfig: true,
    };
  }

  if (isServerlessEnvironment || process.platform === 'linux') {
    return {
      path: await chromium.executablePath(),
      useChromiumConfig: true,
    };
  }

  if (localChromeExecutablePath) {
    return {
      path: localChromeExecutablePath,
      useChromiumConfig: false,
    };
  }

  // Fall back to the chromium binary even if it might not be compatible.
  return {
    path: await chromium.executablePath(),
    useChromiumConfig: true,
  };
};

const buildLaunchOptions = async () => {
  const { path: executablePath, useChromiumConfig } = await resolveExecutable();

  // If we have an executable path (serverless/default), prefer chromium config.
  const baseOptions = {
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: 'new',
  };

  if (useChromiumConfig) {
    baseOptions.args = chromium.args;
    baseOptions.defaultViewport = chromium.defaultViewport;
    baseOptions.headless = chromium.headless ?? 'new';
  }

  return baseOptions;
};

let browserPromise;

const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = (async () => {
      const launchOptions = await buildLaunchOptions();
      return puppeteer.launch(launchOptions);
    })();
  }
  return browserPromise;
};

const generateInvoicePdf = async ({ invoice, clinicSettings }) => {
  const persistDirectory = invoiceStoragePath;
  if (persistDirectory) {
    ensureDirectory(persistDirectory);
  }

  const filename = `${invoice.invoice_number}.pdf`;
  const targetPath = persistDirectory ? path.join(persistDirectory, filename) : null;
  const html = renderInvoiceTemplate({ invoice, clinicSettings });

  const browser = await getBrowser();
  const page = await browser.newPage();

  let pdfBuffer;

  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    pdfBuffer = await page.pdf({
      path: targetPath || undefined,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '16mm',
        bottom: '20mm',
        left: '16mm',
      },
    });
  } finally {
    await page.close();
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
