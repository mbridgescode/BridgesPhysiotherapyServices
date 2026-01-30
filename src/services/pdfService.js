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
  receiptStoragePath,
  pdfTempPath,
  chromiumRemoteExecutable,
  chromiumLocalExecutable,
} = require('../config/env');
const { renderTemplidInvoice } = require('../templates/invoice/templidInvoice');
const { renderTemplidReceipt } = require('../templates/receipt/templidReceipt');

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
let resolvedReceiptDirectory = null;
let receiptDirectoryResolved = false;

const normalizeToBuffer = (value, label = 'pdfService') => {
  if (!value) {
    return null;
  }
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  console.warn(`[pdfService] Unable to normalize buffer from ${label}; received type ${typeof value}`);
  return null;
};

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

const resolveReceiptPersistDirectory = () => {
  if (receiptDirectoryResolved) {
    return resolvedReceiptDirectory;
  }

  const fallbackDirectories = Array.from(new Set(
    [
      receiptStoragePath,
      pdfTempPath,
      path.join(os.tmpdir(), 'bridges-physio-receipts'),
    ].filter(Boolean),
  ));

  for (const candidate of fallbackDirectories) {
    const resolved = ensureDirectory(candidate);
    if (resolved) {
      resolvedReceiptDirectory = resolved;
      receiptDirectoryResolved = true;
      return resolvedReceiptDirectory;
    }
  }

  receiptDirectoryResolved = true;
  resolvedReceiptDirectory = null;
  console.warn('[pdfService] Warning: no writable directory available for receipt PDFs; falling back to in-memory buffers only.');
  return null;
};

const isServerlessEnvironment = Boolean(
  process.env.AWS_REGION
  || process.env.LAMBDA_TASK_ROOT
  || process.env.VERCEL,
);

const DEFAULT_REMOTE_CHROMIUM_URL = 'https://github.com/Sparticuz/chromium/releases/download/v123.0.1/chromium-v123.0.1-pack.tar';

const normalizeArchiveLocation = (value) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('file://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `file://${trimmed}`;
  }
  return `file://${path.resolve(process.cwd(), trimmed)}`;
};

const tryResolveChromiumArchive = async (location, label) => {
  const normalizedLocation = normalizeArchiveLocation(location);
  if (!normalizedLocation) {
    return null;
  }
  try {
    const executablePath = await chromium.executablePath(normalizedLocation);
    console.log(`[pdfService] Resolved Chromium via ${label}: ${normalizedLocation}`);
    return {
      path: executablePath,
      useChromiumConfig: true,
    };
  } catch (error) {
    console.warn(`[pdfService] Unable to load Chromium from ${label}: ${error.message}`);
    return null;
  }
};

const resolveHostedChromiumArchive = () => {
  const envUrl = normalizeArchiveLocation(process.env.CHROMIUM_PACK_URL || '');
  if (envUrl) {
    return envUrl;
  }

  if (process.env.VERCEL_URL) {
    const baseHost = process.env.VERCEL_URL.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    return `https://${baseHost}/chromium-pack.tar`;
  }

  const localPackPath = path.join(process.cwd(), 'public', 'chromium-pack.tar');
  if (fs.existsSync(localPackPath)) {
    return localPackPath;
  }

  return null;
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
  const remoteFromEnv = await tryResolveChromiumArchive(remoteOverride, 'CHROMIUM_REMOTE_EXEC_PATH');
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

  const hostedArchive = resolveHostedChromiumArchive();
  const hostedLabel = process.env.VERCEL_URL ? 'hosted chromium pack' : 'local chromium pack';
  const hostedExecutable = await tryResolveChromiumArchive(hostedArchive, hostedLabel);
  if (hostedExecutable) {
    return hostedExecutable;
  }

  const remoteFromFallback = await tryResolveChromiumArchive(
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
    pdfBuffer = normalizeToBuffer(pdfBuffer, 'page.pdf()');
    if (pdfBuffer?.length) {
      const firstBytes = pdfBuffer.subarray(0, 8).toString('hex');
      console.log('[pdfService] pdf-bytes', {
        invoice: invoice?.invoice_number,
        bytes: firstBytes,
        size: pdfBuffer.length,
      });
    } else {
      console.warn('[pdfService] pdf-buffer-empty', {
        invoice: invoice?.invoice_number,
      });
    }
  } finally {
    await page.close().catch(() => {});
  }

  return {
    pdfPath: targetPath,
    pdfBuffer,
    html,
  };
};

const generateReceiptPdf = async ({ receipt, clinicSettings }) => {
  const persistDirectory = resolveReceiptPersistDirectory();

  const filename = `${receipt.receipt_number}.pdf`;
  const targetPath = persistDirectory ? path.join(persistDirectory, filename) : null;
  const billingContact = buildBillingContact(receipt);
  const patientSummary = buildPatientSummary(receipt);
  const notesLines = buildNotesLines(receipt);
  const html = renderTemplidReceipt({
    receipt,
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
    pdfBuffer = normalizeToBuffer(pdfBuffer, 'page.pdf()');
    if (pdfBuffer?.length) {
      const firstBytes = pdfBuffer.subarray(0, 8).toString('hex');
      console.log('[pdfService] pdf-bytes', {
        receipt: receipt?.receipt_number,
        bytes: firstBytes,
        size: pdfBuffer.length,
      });
    } else {
      console.warn('[pdfService] pdf-buffer-empty', {
        receipt: receipt?.receipt_number,
      });
    }
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
  generateReceiptPdf,
};
