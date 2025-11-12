const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const { invoiceStoragePath, pdfTempPath } = require('../config/env');
const { renderInvoiceTemplate } = require('../templates/invoiceTemplate');

const COLORS = {
  background: '#f7f8fb',
  primary: '#2f3d8a',
  accent: '#4f63d1',
  muted: '#6d748c',
  border: '#e5e7ef',
  tableHeader: '#f0f1f7',
  paymentBackground: '#f0f2fb',
};

const DEFAULT_LOGO_PATH = path.resolve(__dirname, '../logo/BPS Logo.png');

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

const toDataUriBuffer = (value) => {
  const match = /^data:(.+);base64,(.*)$/i.exec(value || '');
  if (!match) {
    return null;
  }
  return Buffer.from(match[2], 'base64');
};

const loadLogoBuffer = async (branding = {}) => {
  if (branding.logo_url) {
    try {
      if (branding.logo_url.startsWith('data:')) {
        return toDataUriBuffer(branding.logo_url);
      }
      if (/^https?:\/\//i.test(branding.logo_url)) {
        const response = await axios.get(branding.logo_url, { responseType: 'arraybuffer', timeout: 5000 });
        return Buffer.from(response.data);
      }
      const resolved = path.isAbsolute(branding.logo_url)
        ? branding.logo_url
        : path.resolve(process.cwd(), branding.logo_url);
      return fs.readFileSync(resolved);
    } catch (error) {
      console.warn(`[pdfService] Unable to load custom logo: ${error.message}`);
    }
  }
  try {
    return fs.readFileSync(DEFAULT_LOGO_PATH);
  } catch (error) {
    return null;
  }
};

const formatCurrency = (value = 0, currency = 'GBP') =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) {
    return '';
  }
  const asDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return '';
  }
  return asDate.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const buildTotals = (invoice) => {
  const baseTotals = {
    net: invoice?.subtotal ?? 0,
    tax: invoice?.tax_total ?? 0,
    discount: invoice?.discount?.amount ?? 0,
    gross: invoice?.total_due ?? 0,
    paid: invoice?.total_paid ?? 0,
    balance: invoice?.balance_due ?? 0,
  };

  return {
    ...baseTotals,
    ...(invoice?.totals || {}),
  };
};

const appendMetaLines = (item) => {
  const lines = [];
  const serviceDate = formatDate(item.service_date || item.treatment_date);
  if (serviceDate) {
    lines.push(`Treatment date: ${serviceDate}`);
  }
  if (item.patient_appointment_number) {
    lines.push(`Appointment #${item.patient_appointment_number}`);
  } else if (item.appointment_id) {
    lines.push(`Appointment #${item.appointment_id}`);
  }
  if (item.meta) {
    lines.push(item.meta);
  }
  if (item.notes) {
    lines.push(item.notes);
  }
  return lines;
};

const buildLineItemRows = (invoice, currency) => {
  const sourceLineItems = Array.isArray(invoice?.line_items) ? invoice.line_items : [];
  if (sourceLineItems.length === 0) {
    const fallbackTotal = invoice?.totals?.gross ?? invoice?.total_due ?? 0;
    return [{
      index: '1.',
      description: 'Consultation',
      descriptionMeta: [],
      unitPrice: formatCurrency(fallbackTotal, currency),
      quantity: '1',
      taxRate: '0%',
      amount: formatCurrency(fallbackTotal, currency),
    }];
  }

  return sourceLineItems.map((item, index) => {
    const quantity = Number(item.quantity) || 1;
    const unitPrice = Number(item.unit_price) || 0;
    const baseAmount = quantity * unitPrice;
    const discountAmountRaw = Number(item.discount_amount || 0);
    const discountAmount = Number.isNaN(discountAmountRaw)
      ? 0
      : Math.min(Math.max(discountAmountRaw, 0), baseAmount);
    const total = Number(item.total ?? (baseAmount - discountAmount));
    const resolvedTotal = Number.isNaN(total) ? baseAmount - discountAmount : total;
    const taxRate = Number(item.tax_rate) || 0;

    return {
      index: `${index + 1}.`,
      description: item.description || 'Line item',
      descriptionMeta: appendMetaLines(item),
      unitPrice: formatCurrency(unitPrice, currency),
      quantity: quantity.toString(),
      taxRate: `${taxRate}%`,
      amount: formatCurrency(resolvedTotal, currency),
    };
  });
};

const buildPaymentLines = (clinicSettings) => {
  const paymentInstructions = clinicSettings?.payment_instructions;
  if (paymentInstructions?.lines?.length) {
    return paymentInstructions.lines;
  }
  if (paymentInstructions?.text) {
    return paymentInstructions.text.split('\n').map((line) => line.trim()).filter(Boolean);
  }
  return [
    'Please make all payments to:',
    'Megan Bridges',
    'Account Number: 80856460',
    'Sort Code: 30-92-16',
  ];
};

const stripHtml = (value = '') =>
  value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();

const ensurePageSpace = (doc, branding, requiredHeight = 0) => {
  const usableBottom = doc.page.height - doc.page.margins.bottom - 40;
  if (doc.y + requiredHeight <= usableBottom) {
    return;
  }
  renderFooter(doc, branding);
  doc.addPage();
};

const renderFooter = (doc, branding) => {
  const footerY = doc.page.height - 60;
  const footerWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const fallbackName = branding?.clinic_name || 'Bridges Physiotherapy Services';
  const email = branding?.email || 'm.bridgespt@gmail.com';
  const phone = branding?.phone || '074 5528 5117';
  const footerText = [fallbackName, email, phone].filter(Boolean).join('  |  ');

  doc.save();
  doc.lineWidth(1).strokeColor(COLORS.border);
  doc.moveTo(doc.page.margins.left, footerY).lineTo(doc.page.width - doc.page.margins.right, footerY).stroke();
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
  doc.text(
    footerText,
    doc.page.margins.left,
    footerY + 10,
    { width: footerWidth, align: 'center' },
  );
  doc.restore();
};

const drawHeader = (doc, {
  branding,
  invoice,
  amountDue,
  logoBuffer,
}) => {
  const cardHeight = 150;
  const cardWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cardTop = doc.y;

  doc.save();
  doc.roundedRect(doc.page.margins.left, cardTop, cardWidth, cardHeight, 18)
    .fill('#ffffff')
    .strokeColor('#e1e4f2')
    .lineWidth(1)
    .stroke();
  doc.restore();

  const leftX = doc.page.margins.left + 24;
  const rightX = doc.page.margins.left + cardWidth - 220;

  if (logoBuffer) {
    doc.image(logoBuffer, leftX, cardTop + 18, { fit: [180, 60], align: 'left' });
  } else {
    doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.primary);
    doc.text(branding?.clinic_name || 'Bridges Physiotherapy Services', leftX, cardTop + 24);
  }

  doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.primary);
  doc.text((branding?.clinic_name || 'Bridges Physiotherapy Services').toUpperCase(), leftX, cardTop + 90);
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted);
  [branding?.email, branding?.website].filter(Boolean).forEach((line) => {
    doc.text(line, leftX, doc.y, { lineGap: 2 });
  });

  doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted);
  doc.text('ISSUE DATE', rightX, cardTop + 26);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.primary);
  doc.text(formatDate(invoice?.issue_date || new Date()) || '-', rightX, doc.y);

  doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted);
  doc.text('INVOICE NUMBER', rightX, doc.y + 12);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.primary);
  doc.text(invoice?.invoice_number || '-', rightX, doc.y);

  doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted);
  doc.text('DUE DATE', rightX, doc.y + 12);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.primary);
  doc.text(formatDate(invoice?.due_date) || 'Due on receipt', rightX, doc.y);

  doc.y = cardTop + cardHeight + 18;
};

const drawBillToSection = (doc, invoice) => {
  const sectionTop = doc.y + 10;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary);
  doc.text('BILL TO', doc.page.margins.left, sectionTop);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.primary);
  doc.text(invoice?.billing_contact_name || invoice?.patient_name || 'Valued Client', doc.page.margins.left, doc.y + 4);
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted);

  [
    invoice?.billing_contact_email || invoice?.patient_email,
    invoice?.billing_contact_phone || invoice?.patient_phone,
    invoice?.client_id ? `Client ID: ${invoice.client_id}` : null,
  ]
    .filter(Boolean)
    .forEach((line) => doc.text(line, doc.page.margins.left, doc.y + 2));

  doc.y += 6;
  doc.moveDown(1);
  doc.strokeColor(COLORS.border).lineWidth(1);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.6);
};

const drawLineItemsTable = (doc, lineItems, currency, branding) => {
  const columns = [
    { key: 'index', label: '#', width: 30, align: 'left' },
    { key: 'description', label: 'PRODUCT DETAILS', width: 220, align: 'left' },
    { key: 'unitPrice', label: 'PRICE', width: 70, align: 'right' },
    { key: 'quantity', label: 'QTY.', width: 40, align: 'center' },
    { key: 'taxRate', label: 'TAX', width: 50, align: 'right' },
    { key: 'amount', label: 'AMOUNT', width: 80, align: 'right' },
  ];
  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0) + 20;
  const startX = doc.page.margins.left;

  ensurePageSpace(doc, branding, 80);

  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary);
  doc.text('SERVICES', doc.page.margins.left, doc.y);
  doc.moveDown(0.4);

  const headerY = doc.y;
  doc.save();
  doc.roundedRect(startX, headerY, tableWidth, 26, 10).fill(COLORS.tableHeader);
  doc.restore();

  let columnX = startX + 10;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.primary);
  columns.forEach((col) => {
    doc.text(col.label, columnX, headerY + 8, { width: col.width, align: col.align });
    columnX += col.width;
  });
  doc.y = headerY + 28;

  doc.font('Helvetica').fontSize(9).fillColor(COLORS.primary);
  lineItems.forEach((row) => {
    ensurePageSpace(doc, branding, 50);
    const rowTop = doc.y;
    doc.lineWidth(0.5).strokeColor(COLORS.border);
    doc.moveTo(startX, rowTop).lineTo(startX + tableWidth, rowTop).stroke();
    let dataX = startX + 10;
    columns.forEach((col) => {
      doc.text(row[col.key], dataX, rowTop + 6, { width: col.width, align: col.align });
      dataX += col.width;
    });

    if (row.descriptionMeta?.length) {
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
      doc.text(
        row.descriptionMeta.join('\n'),
        startX + 40,
        rowTop + 18,
        { width: 210, align: 'left' },
      );
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.primary);
      doc.y = rowTop + 36;
    } else {
      doc.y = rowTop + 24;
    }
  });

  doc.lineWidth(0.5).strokeColor(COLORS.border);
  doc.moveTo(startX, doc.y).lineTo(startX + tableWidth, doc.y).stroke();
  doc.moveDown(0.8);
};

const drawAmountDueBanner = (doc, totals, currency) => {
  const bannerWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bannerTop = doc.y;
  doc.save();
  doc.roundedRect(doc.page.margins.left, bannerTop, bannerWidth, 40, 12).fill(COLORS.tableHeader);
  doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(10);
  doc.text(`AMOUNT DUE  ${formatDate(totals?.dueDate) || ''}`, doc.page.margins.left + 16, bannerTop + 12);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.primary);
  doc.text(
    formatCurrency(totals.balance || totals.gross || 0, currency),
    doc.page.margins.left,
    bannerTop + 10,
    { width: bannerWidth - 20, align: 'right' },
  );
  doc.restore();
  doc.moveDown(1.2);
};

const drawPaymentSection = (doc, clinicSettings, invoice, branding) => {
  const lines = buildPaymentLines(clinicSettings);
  if (invoice?.invoice_number) {
    lines.push(`Payment Reference: ${invoice.invoice_number}`);
  }
  ensurePageSpace(doc, branding, 110);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary);
  doc.text('PAYMENT DETAILS', doc.page.margins.left, doc.y);
  doc.moveDown(0.4);

  const boxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const boxTop = doc.y;
  doc.save();
  doc.roundedRect(doc.page.margins.left, boxTop, boxWidth, lines.length * 16 + 24, 12).fill(COLORS.paymentBackground);
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.primary);
  lines.forEach((line, index) => {
    doc.text(line, doc.page.margins.left + 16, boxTop + 12 + index * 14);
  });
  doc.restore();
  doc.moveDown(2);
};

const drawNotesSection = (doc, invoice, clinicSettings, branding) => {
  const notes = stripHtml(invoice?.notes || clinicSettings?.branding?.notes || '');
  if (!notes) {
    return;
  }
  ensurePageSpace(doc, branding, 80);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary);
  doc.text('NOTES', doc.page.margins.left, doc.y);
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted);
  doc.text(notes, {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
  });
  doc.moveDown(1);
};

const createInvoicePdfBuffer = async ({ invoice, clinicSettings }) => {
  const branding = clinicSettings?.branding || {};
  const currency = invoice?.currency || 'GBP';
  const totals = {
    ...buildTotals(invoice),
    dueDate: invoice?.due_date,
  };
  const amountDue = totals.balance || totals.gross || totals.net || 0;
  const lineItems = buildLineItemRows(invoice, currency);
  const logoBuffer = await loadLogoBuffer(branding);

  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: {
      Title: `Invoice ${invoice?.invoice_number || ''}`,
    },
  });

  const chunks = [];
  const completion = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  drawHeader(doc, { branding, invoice, amountDue, logoBuffer });
  drawBillToSection(doc, invoice);
  drawLineItemsTable(doc, lineItems, currency, branding);
  drawAmountDueBanner(doc, totals, currency);
  drawPaymentSection(doc, clinicSettings, invoice, branding);
  drawNotesSection(doc, invoice, clinicSettings, branding);
  renderFooter(doc, branding);
  doc.end();

  return completion;
};

const generateInvoicePdf = async ({ invoice, clinicSettings }) => {
  const persistDirectory = resolvePersistDirectory();
  const filename = `${invoice.invoice_number}.pdf`;
  const targetPath = persistDirectory ? path.join(persistDirectory, filename) : null;
  const html = renderInvoiceTemplate({ invoice, clinicSettings });

  const pdfBuffer = await createInvoicePdfBuffer({ invoice, clinicSettings });
  if (targetPath) {
    try {
      await fs.promises.writeFile(targetPath, pdfBuffer);
    } catch (error) {
      console.warn(`[pdfService] Unable to write invoice PDF to ${targetPath}: ${error.message}`);
    }
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
