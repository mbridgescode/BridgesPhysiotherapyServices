const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { invoiceStoragePath } = require('../config/env');
const { renderInvoiceTemplate } = require('../templates/invoiceTemplate');

const ensureDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

let browserPromise;

const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
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
