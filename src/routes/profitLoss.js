const express = require('express');
const ProfitLossEntry = require('../models/profitLossEntry');
const Invoice = require('../models/invoices');
const Payment = require('../models/payments');
const AuditLog = require('../models/auditLog');
const Patient = require('../models/patients');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');
const { buildPatientScopeQuery } = require('../utils/accessControl');

const router = express.Router();

// XLSX generation is only used by the export endpoint. Defer the relatively
// heavy spreadsheet library for the normal profit/loss data request.
const getExcelJs = () => require('exceljs');

const allowedRoles = ['admin'];

const parseDateRange = (start, end) => {
  const now = new Date();
  const defaultEnd = new Date(now);
  const defaultStart = new Date(now);
  defaultStart.setDate(defaultStart.getDate() - 90);

  const parsedStart = start ? new Date(start) : defaultStart;
  const parsedEnd = end ? new Date(end) : defaultEnd;

  if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
    return { startDate: defaultStart, endDate: defaultEnd };
  }

  parsedStart.setHours(0, 0, 0, 0);
  parsedEnd.setHours(23, 59, 59, 999);
  return { startDate: parsedStart, endDate: parsedEnd };
};

const buildInvoiceEntries = (invoices = []) => invoices.map((invoice) => {
  const amount = Number(invoice?.totals?.gross ?? invoice?.total_due ?? 0);
  const issueDate = invoice?.issue_date || invoice?.createdAt || new Date();
  return {
    _id: `invoice-${invoice.invoice_number}`,
    entry_id: `inv-${invoice.invoice_number}`,
    invoice_id: invoice.invoice_id || invoice._id,
    date: issueDate,
    category: 'Clinical Revenue',
    description: `Invoice ${invoice.invoice_number}`,
    amount,
    type: 'income',
    source: 'invoice',
    invoice_number: invoice.invoice_number,
    status: invoice.status || 'issued',
    total_paid: Number(invoice.total_paid || invoice.totals?.paid || 0),
    balance_due: Number(invoice.balance_due ?? invoice.totals?.balance ?? 0),
    currency: invoice.currency || 'GBP',
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
});

const normalizeManualEntry = (entry) => ({
  _id: entry._id,
  entry_id: entry.entry_id,
  date: entry.date,
  category: entry.category || 'Expense',
  description: entry.description || '',
  amount: Number(entry.amount) || 0,
  type: entry.type || 'expense',
  source: entry.source || 'manual',
  invoice_number: entry.invoice_number,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
});

const normalizePaymentEntry = (payment) => ({
  _id: payment._id,
  payment_id: payment.payment_id,
  invoice_id: payment.invoice_id,
  invoice_number: payment.invoice_number,
  amount_paid: Number(payment.amount_paid) || 0,
  currency: payment.currency || 'GBP',
  payment_date: payment.payment_date,
  method: payment.method || 'other',
  status: payment.status || 'applied',
  createdAt: payment.createdAt,
  updatedAt: payment.updatedAt,
});

const summarizeEntries = (entries) => entries.reduce((acc, entry) => {
  if (entry.type === 'income') {
    acc.income += entry.amount;
  } else {
    acc.expense += entry.amount;
  }
  return acc;
}, { income: 0, expense: 0, net: 0 });

router.get(
  '/',
  authenticate,
  authorize(...allowedRoles),
  async (req, res, next) => {
    try {
      const { startDate, endDate } = parseDateRange(req.query.start, req.query.end);
      let scopedPatientIdsSet = null;
      if (req.user.role !== 'admin') {
        const scopeQuery = buildPatientScopeQuery(req.user);
        if (scopeQuery) {
          const scopedPatients = await Patient.find(scopeQuery).select('patient_id');
          scopedPatientIdsSet = new Set(scopedPatients.map((doc) => doc.patient_id));
        } else {
          scopedPatientIdsSet = new Set();
        }
      }

      const manualQuery = {
        date: { $gte: startDate, $lte: endDate },
      };
      if (req.user.role !== 'admin') {
        manualQuery.createdBy = req.user.id;
      }

      const manualEntries = await ProfitLossEntry.find(manualQuery).sort({ date: -1 });

      let invoices = [];
      const invoiceQuery = {
        issue_date: { $gte: startDate, $lte: endDate },
      };
      if (scopedPatientIdsSet) {
        if (scopedPatientIdsSet.size > 0) {
          invoiceQuery.patient_id = { $in: Array.from(scopedPatientIdsSet) };
          invoices = await Invoice.find(invoiceQuery)
            .select('invoice_id invoice_number issue_date totals total_due total_paid balance_due status currency createdAt updatedAt');
        }
      } else {
        invoices = await Invoice.find(invoiceQuery)
          .select('invoice_id invoice_number issue_date totals total_due total_paid balance_due status currency createdAt updatedAt');
      }

      const payments = await Payment.find({
        payment_date: { $gte: startDate, $lte: endDate },
      })
        .sort({ payment_date: -1 })
        .select('payment_id invoice_id invoice_number amount_paid currency payment_date method status createdAt updatedAt');

      const manual = manualEntries.map(normalizeManualEntry);
      const invoiceEntries = buildInvoiceEntries(invoices);

      const combined = [...manual, ...invoiceEntries];
      const totals = summarizeEntries(combined);
      totals.net = totals.income - totals.expense;

      res.json({
        success: true,
        totals,
        manualEntries: manual,
        invoiceEntries,
        paymentEntries: payments.map(normalizePaymentEntry),
        range: {
          start: startDate,
          end: endDate,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/manual',
  authenticate,
  authorize(...allowedRoles),
  async (req, res, next) => {
    try {
      const {
        date,
        category,
        description,
        amount,
      } = req.body || {};

      const parsedDate = date ? new Date(date) : new Date();
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date' });
      }

      const numericAmount = Number(amount);
      if (Number.isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than zero' });
      }

      const entry = await ProfitLossEntry.create({
        date: parsedDate,
        type: 'expense',
        category: category?.trim() || 'Expense',
        description: description?.trim() || '',
        amount: numericAmount,
        source: 'manual',
        createdBy: req.user.id,
        updatedBy: req.user.id,
      });

      await recordAuditEvent({
        event: 'profit_loss.manual.create',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { entry_id: entry.entry_id?.toString() || entry.id },
      });

      res.status(201).json({ success: true, entry: normalizeManualEntry(entry) });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/manual/:entryId',
  authenticate,
  authorize(...allowedRoles),
  async (req, res, next) => {
    try {
      const { entryId } = req.params;
      const {
        date,
        category,
        description,
        amount,
      } = req.body || {};

      const update = {
        updatedBy: req.user.id,
      };

      if (date) {
        const parsedDate = new Date(date);
        if (Number.isNaN(parsedDate.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid date' });
        }
        update.date = parsedDate;
      }

      if (category !== undefined) {
        update.category = category?.trim() || '';
      }
      if (description !== undefined) {
        update.description = description?.trim() || '';
      }
      if (amount !== undefined) {
        const numericAmount = Number(amount);
        if (Number.isNaN(numericAmount) || numericAmount <= 0) {
          return res.status(400).json({ success: false, message: 'Amount must be greater than zero' });
        }
        update.amount = numericAmount;
      }

      const entry = await ProfitLossEntry.findOneAndUpdate(
        { entry_id: Number(entryId) },
        { $set: update },
        { new: true },
      );

      if (!entry) {
        return res.status(404).json({ success: false, message: 'Manual entry not found' });
      }

      await recordAuditEvent({
        event: 'profit_loss.manual.update',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { entry_id: entry.entry_id?.toString() || entry.id },
      });

      res.json({ success: true, entry: normalizeManualEntry(entry) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/manual/:entryId',
  authenticate,
  authorize(...allowedRoles),
  async (req, res, next) => {
    try {
      const entry = await ProfitLossEntry.findOneAndDelete({ entry_id: Number(req.params.entryId) });
      if (!entry) {
        return res.status(404).json({ success: false, message: 'Manual entry not found' });
      }

      await recordAuditEvent({
        event: 'profit_loss.manual.delete',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { entry_id: entry.entry_id?.toString() || entry.id },
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

const buildExportRows = (manualEntries, invoiceEntries) => {
  const rows = [];
  manualEntries.forEach((entry) => {
    rows.push({
      'Record Type': 'Transaction',
      'Entry Date': new Date(entry.date).toISOString().slice(0, 10),
      Account: entry.category || 'Expense',
      Description: entry.description || 'Expense',
      Debit: Math.abs(Number(entry.amount) || 0),
      Credit: 0,
      'Net Amount': -Math.abs(Number(entry.amount) || 0),
      'Entry Type': 'Expense',
      Source: 'Manual',
      Reference: entry.entry_id,
      Status: 'Recorded',
      'Source ID': entry.entry_id,
      'Source Created At': entry.createdAt || '',
      'Source Updated At': entry.updatedAt || '',
    });
  });
  invoiceEntries.forEach((entry) => {
    rows.push({
      'Record Type': 'Transaction',
      'Entry Date': new Date(entry.date).toISOString().slice(0, 10),
      Account: entry.category || 'Clinical Revenue',
      Description: entry.description,
      Debit: 0,
      Credit: Math.abs(Number(entry.amount) || 0),
      'Net Amount': Math.abs(Number(entry.amount) || 0),
      'Entry Type': 'Income',
      Source: 'Invoice',
      Reference: entry.invoice_number,
      Status: entry.status || 'issued',
      'Source ID': entry.invoice_id || entry.entry_id,
      'Source Created At': entry.createdAt || '',
      'Source Updated At': entry.updatedAt || '',
    });
  });
  return rows.sort((a, b) => new Date(a['Entry Date']) - new Date(b['Entry Date']));
};

const buildPaymentRows = (payments = []) => payments.map((payment) => ({
  'Payment Date': new Date(payment.payment_date).toISOString().slice(0, 10),
  'Payment ID': payment.payment_id,
  'Invoice Number': payment.invoice_number || '',
  Amount: Number(payment.amount_paid) || 0,
  Currency: payment.currency || 'GBP',
  Method: payment.method || 'other',
  Status: payment.status || 'applied',
  'Cash Movement': payment.status === 'refunded'
    ? -Math.abs(Number(payment.amount_paid) || 0)
    : payment.status === 'applied' ? Math.abs(Number(payment.amount_paid) || 0) : 0,
  'Source ID': payment._id || payment.payment_id,
  'Source Created At': payment.createdAt || '',
  'Source Updated At': payment.updatedAt || '',
})).sort((a, b) => new Date(a['Payment Date']) - new Date(b['Payment Date']));

const buildMonthlySummary = (rows, paymentRows) => {
  const monthMap = new Map();
  const getMonth = (date) => String(date).slice(0, 7);
  rows.forEach((row) => {
    const key = getMonth(row['Entry Date']);
    const month = monthMap.get(key) || { Month: key, Invoiced: 0, Expenses: 0, Collected: 0 };
    if (row['Entry Type'] === 'Income') {
      month.Invoiced += Number(row.Credit) || 0;
    } else {
      month.Expenses += Number(row.Debit) || 0;
    }
    monthMap.set(key, month);
  });
  paymentRows.forEach((row) => {
    const key = getMonth(row['Payment Date']);
    const month = monthMap.get(key) || { Month: key, Invoiced: 0, Expenses: 0, Collected: 0 };
    month.Collected += Number(row['Cash Movement']) || 0;
    monthMap.set(key, month);
  });
  return Array.from(monthMap.values()).sort((a, b) => a.Month.localeCompare(b.Month)).map((month, index, all) => ({
    ...month,
    'Net Profit': month.Invoiced - month.Expenses,
    'Collection Rate': month.Invoiced ? month.Collected / month.Invoiced : 0,
    'Delta vs Previous Month': index === 0 ? null : month.Invoiced - all[index - 1].Invoiced,
  }));
};

router.get(
  '/export',
  authenticate,
  authorize(...allowedRoles),
  async (req, res, next) => {
    try {
      const { startDate, endDate } = parseDateRange(req.query.start, req.query.end);
      const format = (req.query.format || 'xlsx').toLowerCase();

      let scopedPatientIdsSet = null;
      if (req.user.role !== 'admin') {
        const scopeQuery = buildPatientScopeQuery(req.user);
        if (scopeQuery) {
          const scopedPatients = await Patient.find(scopeQuery).select('patient_id');
          scopedPatientIdsSet = new Set(scopedPatients.map((doc) => doc.patient_id));
        } else {
          scopedPatientIdsSet = new Set();
        }
      }

      const manualQuery = {
        date: { $gte: startDate, $lte: endDate },
      };
      if (req.user.role !== 'admin') {
        manualQuery.createdBy = req.user.id;
      }

      const manualEntries = await ProfitLossEntry.find(manualQuery).sort({ date: 1 });

      let invoices = [];
      const invoiceQuery = {
        issue_date: { $gte: startDate, $lte: endDate },
      };
      if (scopedPatientIdsSet) {
        if (scopedPatientIdsSet.size > 0) {
          invoiceQuery.patient_id = { $in: Array.from(scopedPatientIdsSet) };
          invoices = await Invoice.find(invoiceQuery)
            .select('invoice_id invoice_number issue_date totals total_due total_paid balance_due status currency createdAt updatedAt');
        }
      } else {
        invoices = await Invoice.find(invoiceQuery)
          .select('invoice_id invoice_number issue_date totals total_due total_paid balance_due status currency createdAt updatedAt');
      }

      const payments = await Payment.find({
        payment_date: { $gte: startDate, $lte: endDate },
      })
        .sort({ payment_date: 1 })
        .select('payment_id invoice_id invoice_number amount_paid currency payment_date method status createdAt updatedAt');

      const manual = manualEntries.map(normalizeManualEntry);
      const invoiceEntries = buildInvoiceEntries(invoices);
      const rows = buildExportRows(manual, invoiceEntries);
      const paymentRows = buildPaymentRows(payments.map(normalizePaymentEntry));
      const monthlySummary = buildMonthlySummary(rows, paymentRows);
      const totals = {
        income: rows.reduce((sum, row) => sum + (Number(row.Credit) || 0), 0),
        expense: rows.reduce((sum, row) => sum + (Number(row.Debit) || 0), 0),
        collected: paymentRows.reduce((sum, row) => sum + (Number(row['Cash Movement']) || 0), 0),
      };
      totals.net = totals.income - totals.expense;

      await recordAuditEvent({
        event: 'financials.export',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: {
          format,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          transaction_count: rows.length,
          payment_count: paymentRows.length,
        },
      });

      const auditEvents = await AuditLog.find({
        event: {
          $in: [
            'profit_loss.manual.create',
            'profit_loss.manual.update',
            'profit_loss.manual.delete',
            'invoice.create',
            'invoice.update',
            'invoice.delete',
            'invoice.markPaid',
            'invoice.markUnpaid',
            'payment.create',
            'payment.update',
            'payment.delete',
            'financials.export',
          ],
        },
        createdAt: { $gte: startDate, $lte: endDate },
      })
        .sort({ createdAt: 1 })
        .select('createdAt event actor_role success metadata');

      if (format === 'csv') {
        const columns = Object.keys(rows[0] || {
          'Record Type': '',
          'Entry Date': '',
          Account: '',
          Description: '',
          Debit: '',
          Credit: '',
          'Net Amount': '',
          'Entry Type': '',
          Source: '',
          Reference: '',
          Status: '',
          'Source ID': '',
          'Source Created At': '',
          'Source Updated At': '',
        });
        const header = [
          'Report Generated At',
          'Period Start',
          'Period End',
          'Currency',
          ...columns,
        ].join(',');
        const generatedAt = new Date().toISOString();
        const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const csvLines = rows.map((row) => (
          [
            csvEscape(generatedAt),
            csvEscape(startDate.toISOString().slice(0, 10)),
            csvEscape(endDate.toISOString().slice(0, 10)),
            csvEscape('GBP'),
            ...columns.map((key) => csvEscape(row[key])),
          ].join(',')
        ));
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="financial-ledger-${startDate.toISOString().slice(0, 10)}-${endDate.toISOString().slice(0, 10)}.csv"`,
        );
        return res.send([header, ...csvLines].join('\n'));
      }

      const ExcelJS = getExcelJs();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Bridges Physiotherapy Services';
      workbook.created = new Date();
      workbook.modified = new Date();

      const styleSheet = (sheet) => {
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        sheet.getRow(1).alignment = { vertical: 'middle' };
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
        sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + Math.min(sheet.columnCount, 26))}1` };
      };
      const addRowsSheet = (name, data, columns) => {
        const sheet = workbook.addWorksheet(name);
        sheet.columns = columns;
        data.forEach((row) => sheet.addRow(row));
        styleSheet(sheet);
        return sheet;
      };

      const readme = workbook.addWorksheet('Read me');
      readme.columns = [
        { header: 'Field', key: 'field', width: 30 },
        { header: 'Value', key: 'value', width: 90 },
      ];
      [
        ['Report', 'Financial filing pack'],
        ['Period start', startDate.toISOString().slice(0, 10)],
        ['Period end', endDate.toISOString().slice(0, 10)],
        ['Generated at', new Date().toISOString()],
        ['Currency', 'GBP'],
        ['Accounting view', 'Invoice revenue and manual expenses are shown on an accrual-style ledger; payments are separated for cash reconciliation.'],
        ['Traceability', 'Every transaction includes a source reference and source ID. The Audit Trail sheet lists manual-entry changes recorded in the selected period.'],
        ['Privacy', 'Patient names and clinical details are excluded from this filing export.'],
        ['Use', 'Review with your accountant before filing. This export is a transparent source pack, not tax advice.'],
      ].forEach(([field, value]) => readme.addRow({ field, value }));
      styleSheet(readme);

      const summary = workbook.addWorksheet('Summary');
      summary.columns = [
        { header: 'Metric', key: 'metric', width: 32 },
        { header: 'Value', key: 'value', width: 18 },
        { header: 'How it reconciles', key: 'note', width: 74 },
      ];
      [
        ['Income / invoiced revenue', totals.income, 'Sum of Credit on Transactions'],
        ['Operating expenses', totals.expense, 'Sum of Debit on Transactions'],
        ['Net profit', totals.net, 'Income minus operating expenses'],
        ['Cash collected', totals.collected, 'Sum of Cash Movement on Payments'],
        ['Billed less collected', totals.income - totals.collected, 'Invoice revenue less applied/refunded cash movement; timing difference, not an error'],
        ['Transaction count', rows.length, 'Rows in Transactions'],
        ['Payment count', paymentRows.length, 'Rows in Payments'],
      ].forEach(([metric, value, note]) => summary.addRow({ metric, value, note }));
      styleSheet(summary);
      for (let rowNumber = 2; rowNumber <= 6; rowNumber += 1) {
        summary.getCell(rowNumber, 2).numFmt = '£#,##0.00;£-#,##0.00';
      }

      const transactionColumns = Object.keys(rows[0] || {
        'Record Type': '', 'Entry Date': '', Account: '', Description: '', Debit: 0, Credit: 0,
        'Net Amount': 0, 'Entry Type': '', Source: '', Reference: '', Status: '', 'Source ID': '',
        'Source Created At': '', 'Source Updated At': '',
      }).map((key) => ({ header: key, key, width: key === 'Description' ? 42 : 18 }));
      const transactionSheet = addRowsSheet('Transactions', rows, transactionColumns);
      ['Debit', 'Credit', 'Net Amount'].forEach((key) => { transactionSheet.getColumn(key).numFmt = '£#,##0.00;£-#,##0.00'; });

      const paymentColumns = Object.keys(paymentRows[0] || {
        'Payment Date': '', 'Payment ID': '', 'Invoice Number': '', Amount: 0, Currency: '', Method: '',
        Status: '', 'Cash Movement': 0, 'Source ID': '', 'Source Created At': '', 'Source Updated At': '',
      }).map((key) => ({ header: key, key, width: 20 }));
      const paymentSheet = addRowsSheet('Payments', paymentRows, paymentColumns);
      ['Amount', 'Cash Movement'].forEach((key) => { paymentSheet.getColumn(key).numFmt = '£#,##0.00;£-#,##0.00'; });

      const monthlySheet = addRowsSheet('Monthly Summary', monthlySummary, [
        { header: 'Month', key: 'Month', width: 14 },
        { header: 'Invoiced', key: 'Invoiced', width: 16 },
        { header: 'Collected', key: 'Collected', width: 16 },
        { header: 'Expenses', key: 'Expenses', width: 16 },
        { header: 'Net Profit', key: 'Net Profit', width: 16 },
        { header: 'Collection Rate', key: 'Collection Rate', width: 18 },
        { header: 'Delta vs Previous Month', key: 'Delta vs Previous Month', width: 24 },
      ]);
      ['Invoiced', 'Collected', 'Expenses', 'Net Profit', 'Delta vs Previous Month'].forEach((key) => { monthlySheet.getColumn(key).numFmt = '£#,##0.00;£-#,##0.00'; });
      monthlySheet.getColumn('Collection Rate').numFmt = '0.0%';

      addRowsSheet('Audit Trail', auditEvents.map((event) => ({
        Timestamp: event.createdAt,
        Event: event.event,
        'Actor Role': event.actor_role || 'system',
        Success: event.success ? 'Yes' : 'No',
        Reference: event.metadata?.entry_id || '',
        Metadata: JSON.stringify(event.metadata || {}),
      })), [
        { header: 'Timestamp', key: 'Timestamp', width: 24 },
        { header: 'Event', key: 'Event', width: 34 },
        { header: 'Actor Role', key: 'Actor Role', width: 16 },
        { header: 'Success', key: 'Success', width: 12 },
        { header: 'Reference', key: 'Reference', width: 18 },
        { header: 'Metadata', key: 'Metadata', width: 70 },
      ]);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="financial-filing-pack-${startDate.toISOString().slice(0, 10)}-${endDate.toISOString().slice(0, 10)}.xlsx"`,
      );

      await workbook.xlsx.write(res);
      res.end();
      return undefined;
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
