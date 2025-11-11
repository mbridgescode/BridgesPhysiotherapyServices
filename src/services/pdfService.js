const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const { invoiceStoragePath, pdfTempPath } = require('../config/env');
const { renderInvoiceTemplate } = require('../templates/invoiceTemplate');

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

const DEFAULT_LOGO_PATH = path.resolve(__dirname, '../logo/BPS Logo.png');
let cachedDefaultLogo = null;

const loadDefaultLogoBuffer = () => {
  if (cachedDefaultLogo !== null) {
    return cachedDefaultLogo;
  }
  try {
    cachedDefaultLogo = fs.readFileSync(DEFAULT_LOGO_PATH);
  } catch (error) {
    cachedDefaultLogo = null;
  }
  return cachedDefaultLogo;
};

const DATA_URI_REGEX = /^data:(.+);base64,(.*)$/;
const sanitizeFilename = (value = '') => value.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'invoice';

const toDataUriBuffer = (value) => {
  const match = value.match(DATA_URI_REGEX);
  if (!match) {
    return null;
  }
  return Buffer.from(match[2], 'base64');
};

const resolveLogoBuffer = async (branding = {}) => {
  const source = branding.logo_url;
  if (!source) {
    return loadDefaultLogoBuffer();
  }
  try {
    if (source.startsWith('data:')) {
      return toDataUriBuffer(source);
    }
    if (/^https?:\/\//i.test(source)) {
      const response = await axios.get(source, { responseType: 'arraybuffer', timeout: 5000 });
      return Buffer.from(response.data);
    }
    const resolvedPath = path.isAbsolute(source)
      ? source
      : path.resolve(process.cwd(), source);
    return fs.readFileSync(resolvedPath);
  } catch (error) {
    console.warn(`[pdfService] Unable to load logo from "${source}": ${error.message}`);
    return loadDefaultLogoBuffer();
  }
};

const formatCurrency = (value = 0, currency = 'GBP') => new Intl.NumberFormat('en-GB', {
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

const decodeHtmlEntities = (value = '') => value
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, '\'')
  .replace(/&#8209;/g, '-');

const stripHtml = (value = '') => decodeHtmlEntities(
  value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, ''),
);

const buildPaymentInstructionLines = (clinicSettings, invoice) => {
  const { branding = {}, payment_instructions: paymentInstructions } = clinicSettings || {};
  if (paymentInstructions?.text) {
    return stripHtml(paymentInstructions.text).split('\n').map((line) => line.trim()).filter(Boolean);
  }
  if (paymentInstructions?.lines?.length) {
    return paymentInstructions.lines
      .map((line) => stripHtml(line).trim())
      .filter(Boolean);
  }
  const namedRecipient = branding.payment_contact || 'Megan Bridges';
  return [
    'Please make all payments to:',
    namedRecipient,
    'Account Number: 80856460',
    'Sort Code: 30-92-16',
  ];
};

const appendMetaLines = (item) => {
  const metaLines = [];
  if (item.service_date || item.treatment_date) {
    metaLines.push(`Treatment date: ${formatDate(item.service_date || item.treatment_date)}`);
  }
  if (item.patient_appointment_number) {
    metaLines.push(`Appointment #${item.patient_appointment_number}`);
  } else if (item.appointment_id) {
    metaLines.push(`Appointment #${item.appointment_id}`);
  }
  if (item.meta) {
    metaLines.push(item.meta);
  }
  if (item.notes) {
    metaLines.push(item.notes);
  }
  return metaLines;
};

const buildLineItemRows = (invoice, currency) => {
  const sourceLineItems = Array.isArray(invoice?.line_items) ? invoice.line_items : [];
  if (sourceLineItems.length === 0) {
    const fallbackTotal = invoice?.totals?.gross ?? invoice?.total_due ?? 0;
    return [{
      index: '1.',
      description: 'Consultation',
      unitPrice: formatCurrency(fallbackTotal, currency),
      quantity: '1',
      taxRate: '0%',
      discount: '-',
      amount: formatCurrency(fallbackTotal, currency),
    }];
  }

  return sourceLineItems.map((item, index) => {
    const quantity = Number(item.quantity) || 1;
    const unitPrice = Number(item.unit_price) || 0;
    const taxRate = Number(item.tax_rate) || 0;
    const baseAmount = quantity * unitPrice;
    const discountAmountRaw = Number(item.discount_amount || 0);
    const discountAmount = Number.isNaN(discountAmountRaw)
      ? 0
      : Math.min(Math.max(discountAmountRaw, 0), baseAmount);
    const total = Number(item.total ?? (baseAmount - discountAmount));
    const resolvedTotal = Number.isNaN(total) ? baseAmount - discountAmount : total;
    const discountDisplay = discountAmount > 0
      ? `-${formatCurrency(discountAmount, currency)}`
      : '-';
    const metaLines = appendMetaLines(item);
    const descriptionParts = [
      item.description || 'Line item',
      ...metaLines,
    ].filter(Boolean);

    return {
      index: `${index + 1}.`,
      description: descriptionParts.join('\n'),
      unitPrice: formatCurrency(unitPrice, currency),
      quantity: quantity.toString(),
      taxRate: `${taxRate}%`,
      discount: discountDisplay,
      amount: formatCurrency(resolvedTotal, currency),
    };
  });
};

const ensurePageSpace = (doc, branding, requiredHeight = 0) => {
  const usableBottom = doc.page.height - doc.page.margins.bottom - 40;
  if (doc.y + requiredHeight <= usableBottom) {
    return false;
  }
  renderFooter(doc, branding);
  doc.addPage();
  return true;
};

const renderFooter = (doc, branding) => {
  const clinicName = branding?.clinic_name || 'Bridges Physiotherapy Services';
  const email = branding?.email || 'm.bridgespt@gmail.com';
  const phone = branding?.phone || '074 5528 5117';
  const footerText = [clinicName, email, phone].filter(Boolean).join(' | ');
  const footerWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const footerY = doc.page.height - doc.page.margins.bottom + 10;

  doc.save();
  doc.font('Helvetica').fontSize(9).fillColor('#94a3b8');
  doc.text(footerText, doc.page.margins.left, footerY - 20, { width: footerWidth, align: 'center' });
  doc.restore();
};

const drawHeader = (doc, {
  branding,
  invoice,
  currency,
  totals,
  amountDue,
  logoBuffer,
}) => {
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const leftColumnWidth = contentWidth * 0.5 - 10;
  const rightColumnWidth = contentWidth * 0.5 - 10;
  const rightColumnX = doc.page.margins.left + leftColumnWidth + 20;
  const topY = doc.y;

  if (logoBuffer) {
    doc.image(logoBuffer, doc.page.margins.left, topY, { fit: [leftColumnWidth, 80], align: 'left' });
  }

  doc.save();
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#1b2134');
  doc.text(branding?.clinic_name || 'Bridges Physiotherapy Services', doc.page.margins.left, topY + 85, {
    width: leftColumnWidth,
    align: 'left',
  });
  doc.font('Helvetica').fontSize(9).fillColor('#475569');
  [
    branding?.address,
    branding?.email,
    branding?.phone,
    branding?.website,
  ].filter(Boolean).forEach((line) => {
    doc.text(line, { width: leftColumnWidth, align: 'left' });
  });
  doc.restore();

  const metaPairs = [
    ['Invoice Number', invoice?.invoice_number || 'N/A'],
    ['Issue Date', formatDate(invoice?.issue_date || new Date()) || 'N/A'],
    ['Due Date', formatDate(invoice?.due_date) || 'Due on receipt'],
    ['Amount Due', formatCurrency(amountDue, currency)],
  ];

  doc.save();
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#1f3e82');
  doc.text('Invoice', rightColumnX, topY, { width: rightColumnWidth, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor('#1b2134');
  metaPairs.forEach(([label, value]) => {
    const lineY = doc.y + 8;
    doc.font('Helvetica').fontSize(9).fillColor('#475569');
    doc.text(label, rightColumnX, lineY, { width: rightColumnWidth * 0.55, align: 'left' });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1b2134');
    doc.text(value, rightColumnX + (rightColumnWidth * 0.55) + 8, lineY, {
      width: rightColumnWidth * 0.35,
      align: 'right',
    });
    doc.moveDown(0.2);
  });
  doc.restore();

  doc.moveDown(1.5);
  doc.strokeColor('#e2e8f0').lineWidth(1);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.8);
};

const drawBillToSection = (doc, invoice, branding) => {
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const leftColumnWidth = contentWidth * 0.5 - 10;
  const rightColumnX = doc.page.margins.left + leftColumnWidth + 20;
  const sectionTop = doc.y;

  const billingName = invoice?.billing_contact_name || invoice?.patient_name || 'Valued Client';
  const billingEmail = invoice?.billing_contact_email || invoice?.patient_email || '';
  const billingPhone = invoice?.billing_contact_phone || invoice?.patient_phone || '';

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1b2134');
  doc.text('Bill To', doc.page.margins.left, sectionTop);
  let leftCursor = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor('#334155');
  [billingName, billingEmail, billingPhone].filter(Boolean).forEach((line) => {
    doc.text(line, doc.page.margins.left, leftCursor, {
      width: leftColumnWidth,
      align: 'left',
    });
    leftCursor = doc.y;
  });

  const detailPairs = [
    ['Client ID', invoice?.client_id || invoice?.patient_id || 'N/A'],
    ['Invoice ID', invoice?.invoice_id || 'N/A'],
    ['Status', (invoice?.status || 'draft').replace(/_/g, ' ')],
  ];

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1b2134');
  doc.text('Details', rightColumnX, sectionTop);
  let rightCursor = doc.y;
  detailPairs.forEach(([label, value]) => {
    doc.font('Helvetica').fontSize(9).fillColor('#475569');
    doc.text(label, rightColumnX, rightCursor, { width: 90, align: 'left' });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1b2134');
    doc.text(value, rightColumnX + 95, rightCursor, {
      width: contentWidth - leftColumnWidth - 95,
      align: 'left',
    });
    rightCursor = Math.max(rightCursor + 14, doc.y);
  });

  doc.y = Math.max(leftCursor, rightCursor) + 8;

  if (invoice?.notes) {
    ensurePageSpace(doc, branding, 40);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1b2134');
    doc.text('Invoice Notes', doc.page.margins.left, doc.y);
    doc.font('Helvetica').fontSize(10).fillColor('#334155');
    doc.text(invoice.notes, {
      width: contentWidth,
      align: 'left',
    });
    doc.moveDown(0.6);
  }

  doc.strokeColor('#e2e8f0').lineWidth(1);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.8);
};

const drawTotalsSummary = (doc, totals, currency, branding) => {
  const entries = [
    ['Subtotal', totals.net ?? 0],
    ['Tax', totals.tax ?? 0],
    ['Discounts', totals.discount ?? 0],
    ['Total', totals.gross ?? 0],
    ['Paid', totals.paid ?? 0],
    ['Balance Due', totals.balance ?? 0],
  ];
  ensurePageSpace(doc, branding, (entries.length * 14) + 20);
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const startX = doc.page.margins.left + contentWidth - 220;
  const labelWidth = 110;
  const valueWidth = 100;

  entries.forEach(([label, value], index) => {
    const lineY = doc.y;
    const isEmphasis = index >= entries.length - 2;
    doc.font(isEmphasis ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#475569');
    doc.text(label, startX, lineY, { width: labelWidth, align: 'right' });
    doc.font(isEmphasis ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#1b2134');
    doc.text(formatCurrency(value, currency), startX + labelWidth + 10, lineY, {
      width: valueWidth,
      align: 'right',
    });
    doc.y = lineY + 14;
  });
  doc.moveDown(0.5);
};

const drawLineItemsTable = (doc, lineItems, currency, branding) => {
  const columns = [
    { key: 'index', label: '#', width: 25, align: 'left' },
    { key: 'description', label: 'Description', width: 210, align: 'left' },
    { key: 'unitPrice', label: 'Unit Price', width: 60, align: 'right' },
    { key: 'quantity', label: 'Qty', width: 35, align: 'center' },
    { key: 'taxRate', label: 'Tax', width: 45, align: 'right' },
    { key: 'discount', label: 'Discount', width: 55, align: 'right' },
    { key: 'amount', label: 'Amount', width: 65, align: 'right' },
  ];
  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0) + 20;
  const startX = doc.page.margins.left;

  const renderHeader = () => {
    const headerY = doc.y;
    doc.save();
    doc.roundedRect(startX, headerY, tableWidth, 24, 6).fill('#f8fafc');
    doc.fillColor('#1b2134').font('Helvetica-Bold').fontSize(9);
    let columnX = startX + 10;
    columns.forEach((col) => {
      doc.text(col.label, columnX, headerY + 7, { width: col.width, align: col.align });
      columnX += col.width;
    });
    doc.restore();
    doc.y = headerY + 26;
  };

  ensurePageSpace(doc, branding, 60);
  renderHeader();

  doc.font('Helvetica').fontSize(9).fillColor('#1b2134');

  lineItems.forEach((row, rowIndex) => {
    const heights = columns.map((col) => doc.heightOfString(row[col.key], {
      width: col.width,
      align: col.align,
    }));
    const rowHeight = Math.max(...heights, 12) + 6;
    const movedToNewPage = ensurePageSpace(doc, branding, rowHeight + 12);
    if (movedToNewPage) {
      renderHeader();
    }
    const rowTop = doc.y;
    doc.strokeColor('#e2e8f0').lineWidth(0.5);
    doc.moveTo(startX, rowTop).lineTo(startX + tableWidth, rowTop).stroke();
    let dataX = startX + 10;
    columns.forEach((col) => {
      doc.text(row[col.key], dataX, rowTop + 4, { width: col.width, align: col.align });
      dataX += col.width;
    });
    doc.y = rowTop + rowHeight;
    if (rowIndex === lineItems.length - 1) {
      doc.moveTo(startX, doc.y).lineTo(startX + tableWidth, doc.y).stroke();
    }
  });

  doc.moveDown(1.2);
};

const drawPaymentSection = (doc, clinicSettings, invoice, branding) => {
  const lines = buildPaymentInstructionLines(clinicSettings, invoice);
  if (!lines.length) {
    return;
  }
  ensurePageSpace(doc, branding, 80);
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const text = lines.join('\n');
  const textWidth = contentWidth - 24;
  const boxHeight = doc.heightOfString(text, { width: textWidth }) + 24;
  const boxTop = doc.y;
  doc.save();
  doc.roundedRect(doc.page.margins.left, boxTop, contentWidth, boxHeight, 10).fill('#eff6ff');
  doc.fillColor('#1b2134').font('Helvetica-Bold').fontSize(11);
  doc.text('Payment details', doc.page.margins.left + 12, boxTop + 12, {
    width: textWidth,
  });
  doc.font('Helvetica').fontSize(10).fillColor('#1b2134');
  doc.text(text, doc.page.margins.left + 12, boxTop + 32, { width: textWidth });
  doc.restore();
  doc.y = boxTop + boxHeight + 16;
};

const createInvoicePdfBuffer = async ({ invoice, clinicSettings }) => {
  const branding = clinicSettings?.branding || {};
  const currency = invoice?.currency || 'GBP';
  const totals = buildTotals(invoice);
  const amountDue = totals.balance || totals.gross || totals.net || 0;
  const lineItems = buildLineItemRows(invoice, currency);
  const logoBuffer = await resolveLogoBuffer(branding);

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks = [];
  const completion = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  drawHeader(doc, {
    branding,
    invoice,
    currency,
    totals,
    amountDue,
    logoBuffer,
  });
  drawBillToSection(doc, invoice, branding);
  drawLineItemsTable(doc, lineItems, currency, branding);
  drawTotalsSummary(doc, totals, currency, branding);
  drawPaymentSection(doc, clinicSettings, invoice, branding);
  renderFooter(doc, branding);
  doc.end();

  return completion;
};

const generateInvoicePdf = async ({ invoice, clinicSettings }) => {
  const persistDirectory = resolvePersistDirectory();
  const safeFilename = sanitizeFilename(invoice?.invoice_number);
  const filename = `${safeFilename}.pdf`;
  const targetPath = persistDirectory ? path.join(persistDirectory, filename) : null;
  const html = renderInvoiceTemplate({ invoice, clinicSettings });

  const pdfBuffer = await createInvoicePdfBuffer({ invoice, clinicSettings });
  if (targetPath) {
    try {
      await fs.promises.writeFile(targetPath, pdfBuffer);
    } catch (error) {
      console.warn(`[pdfService] Unable to write invoice PDF to disk (${targetPath}): ${error.message}`);
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
