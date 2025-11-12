const fs = require('fs');
const os = require('os');
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

const {
  invoiceStoragePath,
  pdfTempPath,
  chromiumRemoteExecutable,
  chromiumLocalExecutable,
} = require('../config/env');
const { renderTemplidInvoice } = require('../templates/invoice/templidInvoice');

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

  const fallbackDirectories = Array.from(new Set(
    [
      invoiceStoragePath,
      pdfTempPath,
      path.join(os.tmpdir(), 'bridges-physio-invoices'),
    ].filter(Boolean),
  ));

  for (const candidate of fallbackDirectories) {
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

const isServerlessEnvironment = Boolean(
  process.env.AWS_REGION
  || process.env.LAMBDA_TASK_ROOT
  || process.env.VERCEL,
);

const DEFAULT_REMOTE_CHROMIUM_URL = 'https://github.com/Sparticuz/chromium/releases/download/v123.0.1/chromium-v123.0.1-pack.tar';

const tryResolveRemoteChromium = async (url, label) => {
  if (!url) {
    return null;
  }
  try {
    const executablePath = await chromium.executablePath(url);
    console.log(`[pdfService] Resolved Chromium via ${label}: ${url}`);
    return {
      path: executablePath,
      useChromiumConfig: true,
    };
  } catch (error) {
    console.warn(`[pdfService] Unable to download Chromium from ${url}: ${error.message}`);
    return null;
  }
};

const resolveExecutable = async () => {
  const localOverride = (chromiumLocalExecutable || '').trim();
  if (localOverride) {
    return {
      path: localOverride,
      useChromiumConfig: false,
    };
  }

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return {
      path: process.env.PUPPETEER_EXECUTABLE_PATH,
      useChromiumConfig: false,
    };
  }

  const remoteOverride = (chromiumRemoteExecutable || '').trim();
  const remoteFromEnv = await tryResolveRemoteChromium(remoteOverride, 'CHROMIUM_REMOTE_EXEC_PATH');
  if (remoteFromEnv) {
    return remoteFromEnv;
  }

  if (process.env.CHROMIUM_PATH) {
    return {
      path: process.env.CHROMIUM_PATH,
      useChromiumConfig: true,
    };
  }

  const resolveBundledChromium = async () => ({
    path: await chromium.executablePath(),
    useChromiumConfig: true,
  });

  const attemptBundled = async () => {
    try {
      return await resolveBundledChromium();
    } catch (error) {
      console.warn('[pdfService] Bundled Chromium unavailable', error.message);
      return null;
    }
  };

  if (isServerlessEnvironment || process.platform === 'linux') {
    const bundled = await attemptBundled();
    if (bundled) {
      return bundled;
    }
  } else if (localChromeExecutablePath) {
    return {
      path: localChromeExecutablePath,
      useChromiumConfig: false,
    };
  }

  const remoteFromFallback = await tryResolveRemoteChromium(
    DEFAULT_REMOTE_CHROMIUM_URL,
    'default remote',
  );
  if (remoteFromFallback) {
    return remoteFromFallback;
  }

  const finalBundledAttempt = await attemptBundled();
  if (finalBundledAttempt) {
    return finalBundledAttempt;
  }

  throw new Error('Unable to resolve a Chromium executable for PDF rendering');
};

const buildLaunchOptions = async () => {
  const { path: executablePath, useChromiumConfig } = await resolveExecutable();

  const baseOptions = {
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: 'new',
    ignoreHTTPSErrors: true,
  };

  if (useChromiumConfig) {
    baseOptions.args = chromium.args;
    baseOptions.defaultViewport = chromium.defaultViewport || null;
    baseOptions.headless = chromium.headless ?? 'new';
  } else if (!baseOptions.defaultViewport) {
    baseOptions.defaultViewport = { width: 1280, height: 720 };
  }

  return baseOptions;
};

let browserPromise;

const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = (async () => {
      const launchOptions = await buildLaunchOptions();
      return puppeteer.launch(launchOptions);
    })().catch((error) => {
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

const buildBillingContact = (invoice = {}) => ({
  name: invoice.billing_contact_name || invoice.billingContact?.name || '',
  email: invoice.billing_contact_email || invoice.billingContact?.email || '',
  phone: invoice.billing_contact_phone || invoice.billingContact?.phone || '',
});

const buildPatientSummary = (invoice = {}) => {
  const preferredName = invoice.patient_name
    || invoice.patient?.preferred_name
    || invoice.patient?.first_name;
  const email = invoice.patient_email || invoice.patient?.email;
  const phone = invoice.patient_phone || invoice.patient?.phone;
  const patientId = invoice.patient_id || invoice.patient?.patient_id;

  if (!preferredName && !email && !phone && !patientId) {
    return null;
  }

  return {
    preferred_name: preferredName,
    email,
    phone,
    patient_id: patientId,
  };
};

const buildNotesLines = (invoice = {}) => {
  if (!invoice.notes) {
    return undefined;
  }
  return String(invoice.notes)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const generateInvoicePdf = async ({ invoice, clinicSettings }) => {
  const persistDirectory = resolvePersistDirectory();

  const filename = `${invoice.invoice_number}.pdf`;
  const targetPath = persistDirectory ? path.join(persistDirectory, filename) : null;
  const billingContact = buildBillingContact(invoice);
  const patientSummary = buildPatientSummary(invoice);
  const notesLines = buildNotesLines(invoice);
  const html = renderTemplidInvoice({
    invoice,
    clinicSettings,
    billingContact,
    patient: patientSummary || undefined,
    notesHeading: notesLines?.length ? 'Notes' : undefined,
    notesLines,
    includeWrapper: true,
  });

  const browser = await getBrowser();
  const page = await browser.newPage();

  let pdfBuffer;

  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await waitForFonts(page);
    await waitForContent(page);
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
