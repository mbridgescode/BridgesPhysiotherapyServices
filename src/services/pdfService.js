const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const { invoiceStoragePath, pdfTempPath } = require('../config/env');
const { renderInvoiceTemplate } = require('../templates/invoiceTemplate');

const COLORS = {
  primary: '#5c6ac4',
  primaryText: '#ffffff',
  slate: '#475569',
  text: '#1b2134',
  muted: '#94a3b8',
  border: '#e2e8f0',
  background: '#f1f5f9',
  footerBackground: '#e2e8f0',
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
      unitPriceDisplay: formatCurrency(fallbackTotal, currency),
      quantityDisplay: '1',
      taxRateDisplay: '0%',
      discountDisplay: '-',
      subtotalDisplay: formatCurrency(fallbackTotal, currency),
      totalDisplay: formatCurrency(fallbackTotal, currency),
      netAmount: fallbackTotal,
      taxAmount: 0,
      grossAmount: fallbackTotal,
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
    const netAmount = Math.max(baseAmount - discountAmount, 0);
    const taxAmount = netAmount * (taxRate / 100);
    const grossAmount = netAmount + taxAmount;
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
      unitPriceDisplay: formatCurrency(unitPrice, currency),
      quantityDisplay: quantity.toString(),
      taxRateDisplay: `${taxRate}%`,
      discountDisplay,
      subtotalDisplay: formatCurrency(netAmount, currency),
      totalDisplay: formatCurrency(grossAmount, currency),
      netAmount,
      taxAmount,
      grossAmount,
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
  const footerHeight = 36;
  const footerY = doc.page.height - footerHeight;

  doc.save();
  doc.rect(0, footerY, doc.page.width, footerHeight).fill(COLORS.footerBackground);
  doc.fillColor(COLORS.slate).font('Helvetica').fontSize(9);
  doc.text(
    footerText,
    doc.page.margins.left,
    footerY + 10,
    {
      width: doc.page.width - (doc.page.margins.left + doc.page.margins.right),
      align: 'center',
    },
  );
  doc.restore();
};

const drawHeader = (doc, {
  branding,
  invoice,
  currency,
  amountDue,
  logoBuffer,
}) => {
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const metaWidth = 220;
  const metaX = doc.page.margins.left + contentWidth - metaWidth;
  const topY = doc.y;

  if (logoBuffer) {
    doc.image(logoBuffer, doc.page.margins.left, topY, { fit: [180, 60], align: 'left' });
  } else {
    doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.primary);
    doc.text(branding?.clinic_name || 'Bridges Physiotherapy Services', doc.page.margins.left, topY);
  }

  doc.font('Helvetica-Bold').fontSize(24).fillColor(COLORS.primary);
  doc.text('Invoice', metaX, topY, { width: metaWidth, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.slate);
  doc.text(formatDate(invoice?.due_date) || 'Due on receipt', metaX, topY + 26, {
    width: metaWidth,
    align: 'right',
  });

  const cellGap = 12;
  const tableTop = topY + 42;
  const cellWidth = (metaWidth - cellGap) / 2;
  const dividerX = metaX + cellWidth + (cellGap / 2);

  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
  doc.text('Date', metaX, tableTop, { width: cellWidth, align: 'right' });
  doc.text('Invoice #', metaX + cellWidth + cellGap, tableTop, { width: cellWidth, align: 'right' });

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.primary);
  const issueDate = formatDate(invoice?.issue_date || new Date()) || 'N/A';
  doc.text(issueDate, metaX, tableTop + 12, { width: cellWidth, align: 'right' });
  doc.text(invoice?.invoice_number || 'N/A', metaX + cellWidth + cellGap, tableTop + 12, {
    width: cellWidth,
    align: 'right',
  });

  doc.save();
  doc.strokeColor(COLORS.border).lineWidth(1);
  doc.moveTo(dividerX, tableTop - 6).lineTo(dividerX, tableTop + 44).stroke();
  doc.restore();

  const badgeTop = tableTop + 48;
  doc.save();
  doc.roundedRect(metaX, badgeTop, metaWidth, 38, 8).fill(COLORS.primary);
  doc.fillColor('#ffffff').font('Helvetica').fontSize(9);
  doc.text('Amount Due', metaX + 12, badgeTop + 8, { width: metaWidth - 24, align: 'left' });
  doc.font('Helvetica-Bold').fontSize(14);
  doc.text(formatCurrency(amountDue, currency), metaX + 12, badgeTop + 18, {
    width: metaWidth - 24,
    align: 'left',
  });
  doc.restore();

  const headerBottom = badgeTop + 50;
  doc.y = Math.max(headerBottom, topY + 80);
  doc.strokeColor(COLORS.border).lineWidth(1);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.8);
};

const buildClinicDetails = (branding = {}) => {
  const lines = [];
  if (branding.clinic_name) {
    lines.push(branding.clinic_name);
  }
  if (branding.address) {
    lines.push(branding.address);
  }
  if (branding.phone) {
    lines.push(`Phone: ${branding.phone}`);
  }
  if (branding.email) {
    lines.push(`Email: ${branding.email}`);
  }
  if (branding.website) {
    lines.push(branding.website);
  }
  return lines.filter(Boolean);
};

const buildBillingDetails = (invoice) => {
  const lines = [];
  const billingName = invoice?.billing_contact_name || invoice?.patient_name || 'Valued Client';
  const billingEmail = invoice?.billing_contact_email || invoice?.patient_email;
  const billingPhone = invoice?.billing_contact_phone || invoice?.patient_phone;
  const clientId = invoice?.client_id || invoice?.patient_id;

  lines.push(billingName);
  if (clientId) {
    lines.push(`Client ID: ${clientId}`);
  }
  if (billingEmail) {
    lines.push(billingEmail);
  }
  if (billingPhone) {
    lines.push(billingPhone);
  }
  return lines.filter(Boolean);
};

const drawPartiesSection = (doc, invoice, branding) => {
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const blockTop = doc.y + 8;
  const blockHeight = 110;
  ensurePageSpace(doc, branding, blockHeight + 20);

  doc.save();
  doc.roundedRect(doc.page.margins.left, blockTop, contentWidth, blockHeight, 12).fill(COLORS.background);
  doc.restore();

  const columnWidth = (contentWidth / 2) - 20;
  const leftX = doc.page.margins.left + 16;
  const rightX = doc.page.margins.left + contentWidth / 2 + 16;
  let leftY = blockTop + 16;
  let rightY = blockTop + 16;

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.primary);
  doc.text('From', leftX, leftY);
  leftY = doc.y + 2;
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.slate);
  buildClinicDetails(branding).forEach((line) => {
    doc.text(line, leftX, leftY, { width: columnWidth, align: 'left' });
    leftY = doc.y + 2;
  });

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.primary);
  doc.text('Bill To', rightX, rightY);
  rightY = doc.y + 2;
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.slate);
  buildBillingDetails(invoice).forEach((line) => {
    doc.text(line, rightX, rightY, { width: columnWidth, align: 'left' });
    rightY = doc.y + 2;
  });

  doc.y = blockTop + blockHeight + 16;
};

const drawLineItemsTable = (doc, lineItems, currency, branding) => {
  const columns = [
    { key: 'index', label: '#', width: 25, align: 'left' },
    { key: 'description', label: 'Product details', width: 170, align: 'left' },
    { key: 'unitPriceDisplay', label: 'Price', width: 55, align: 'right' },
    { key: 'quantityDisplay', label: 'Qty.', width: 35, align: 'center' },
    { key: 'taxRateDisplay', label: 'VAT', width: 40, align: 'right' },
    { key: 'discountDisplay', label: 'Discount', width: 55, align: 'right' },
    { key: 'subtotalDisplay', label: 'Subtotal', width: 60, align: 'right' },
    { key: 'totalDisplay', label: 'Subtotal + VAT', width: 70, align: 'right' },
  ];
  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0) + 20;
  const startX = doc.page.margins.left;

  const renderHeader = () => {
    const headerY = doc.y;
    doc.save();
    doc.roundedRect(startX, headerY, tableWidth, 26, 8).fill('#f8fafc');
    doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9);
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

  doc.font('Helvetica').fontSize(9).fillColor(COLORS.text);

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
    doc.strokeColor(COLORS.border).lineWidth(0.5);
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

const drawTotalsSummary = (doc, totals, currency, branding) => {
  const entries = [
    { label: 'Net total', value: totals.net ?? 0 },
    { label: 'VAT total', value: totals.tax ?? 0 },
    { label: 'Discounts', value: totals.discount ?? 0 },
    { label: 'Total', value: totals.gross ?? 0, emphasis: 'primary' },
    { label: 'Paid', value: totals.paid ?? 0 },
    { label: 'Balance Due', value: totals.balance ?? 0, emphasis: 'outline' },
  ];

  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const boxWidth = 240;
  const startX = doc.page.margins.left + contentWidth - boxWidth;
  const rowHeight = 28;
  ensurePageSpace(doc, branding, entries.length * rowHeight + 16);

  entries.forEach((entry) => {
    const rowY = doc.y;
    doc.save();
    if (entry.emphasis === 'primary') {
      doc.roundedRect(startX, rowY, boxWidth, rowHeight, 6).fill(COLORS.primary);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10);
    } else if (entry.emphasis === 'outline') {
      doc.roundedRect(startX, rowY, boxWidth, rowHeight, 6).strokeColor(COLORS.primary).lineWidth(1).stroke();
      doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(10);
    } else {
      doc.roundedRect(startX, rowY, boxWidth, rowHeight, 6).fill('#ffffff').strokeColor(COLORS.border).lineWidth(0.5).stroke();
      doc.fillColor(COLORS.slate).font('Helvetica').fontSize(10);
    }
    doc.text(entry.label, startX + 12, rowY + 8, { width: boxWidth - 120, align: 'left' });
    doc.text(formatCurrency(entry.value, currency), startX + 120, rowY + 8, {
      width: boxWidth - 132,
      align: 'right',
    });
    doc.restore();
    doc.y = rowY + rowHeight + 6;
  });
};

const drawPaymentSection = (doc, clinicSettings, invoice, branding) => {
  const lines = buildPaymentInstructionLines(clinicSettings, invoice);
  const reference = invoice?.invoice_number ? `Payment Reference: ${invoice.invoice_number}` : null;
  if (reference) {
    lines.push(reference);
  }
  if (!lines.length) {
    return;
  }
  ensurePageSpace(doc, branding, 80);
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.primary);
  doc.text('PAYMENT DETAILS', doc.page.margins.left, doc.y);
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.slate);
  doc.text(lines.join('\n'), {
    width: contentWidth,
    align: 'left',
  });
  doc.moveDown(0.8);
};

const drawNotesSection = (doc, invoice, branding) => {
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const rawNotes = invoice?.notes ? stripHtml(invoice.notes) : '';
  const notesText = rawNotes || 'Thank you for choosing Bridges Physiotherapy Services.';
  ensurePageSpace(doc, branding, 80);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.primary);
  doc.text('Notes', doc.page.margins.left, doc.y);
  doc.moveDown(0.3);
  doc.font('Helvetica-Oblique').fontSize(10).fillColor(COLORS.slate);
  doc.text(notesText, {
    width: contentWidth,
    align: 'left',
  });
  doc.moveDown(0.5);
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
    amountDue,
    logoBuffer,
  });
  drawPartiesSection(doc, invoice, branding);
  drawLineItemsTable(doc, lineItems, currency, branding);
  drawTotalsSummary(doc, totals, currency, branding);
  drawPaymentSection(doc, clinicSettings, invoice, branding);
  drawNotesSection(doc, invoice, branding);
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
