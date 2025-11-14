const express = require('express');
const exceljs = require('exceljs');
const ProfitLossEntry = require('../models/profitLossEntry');
const Invoice = require('../models/invoices');
const Patient = require('../models/patients');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');
const { buildPatientScopeQuery } = require('../utils/accessControl');

const router = express.Router();

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
    date: issueDate,
    category: 'Clinical Revenue',
    description: `Invoice ${invoice.invoice_number}${invoice.patient_name ? ` - ${invoice.patient_name}` : ''}`,
    amount,
    type: 'income',
    source: 'invoice',
    invoice_number: invoice.invoice_number,
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
            .select('invoice_number issue_date totals total_due patient_name patient_id');
        }
      } else {
        invoices = await Invoice.find(invoiceQuery)
          .select('invoice_number issue_date totals total_due patient_name patient_id');
      }

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
      Date: new Date(entry.date).toISOString().slice(0, 10),
      Category: entry.category,
      Description: entry.description,
      Amount: -Math.abs(entry.amount),
      Type: 'Expense',
      Source: 'Manual',
      Reference: entry.entry_id,
    });
  });
  invoiceEntries.forEach((entry) => {
    rows.push({
      Date: new Date(entry.date).toISOString().slice(0, 10),
      Category: entry.category,
      Description: entry.description,
      Amount: entry.amount,
      Type: 'Income',
      Source: 'Invoice',
      Reference: entry.invoice_number,
    });
  });
  return rows.sort((a, b) => new Date(a.Date) - new Date(b.Date));
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
            .select('invoice_number issue_date totals total_due patient_name patient_id');
        }
      } else {
        invoices = await Invoice.find(invoiceQuery)
          .select('invoice_number issue_date totals total_due patient_name patient_id');
      }

      const manual = manualEntries.map(normalizeManualEntry);
      const invoiceEntries = buildInvoiceEntries(invoices);
      const rows = buildExportRows(manual, invoiceEntries);

      if (format === 'csv') {
        const header = 'Date,Category,Description,Amount,Type,Source,Reference';
        const csvLines = rows.map((row) => (
          [
            row.Date,
            `"${row.Category.replace(/"/g, '""')}"`,
            `"${row.Description.replace(/"/g, '""')}"`,
            row.Amount.toFixed(2),
            row.Type,
            row.Source,
            row.Reference || '',
          ].join(',')
        ));
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="profit-loss-${startDate.toISOString().slice(0, 10)}-${endDate.toISOString().slice(0, 10)}.csv"`,
        );
        return res.send([header, ...csvLines].join('\n'));
      }

      const workbook = new exceljs.Workbook();
      const sheet = workbook.addWorksheet('Profit & Loss');
      sheet.columns = [
        { header: 'Date', key: 'Date', width: 12 },
        { header: 'Category', key: 'Category', width: 20 },
        { header: 'Description', key: 'Description', width: 40 },
        { header: 'Amount', key: 'Amount', width: 14 },
        { header: 'Type', key: 'Type', width: 12 },
        { header: 'Source', key: 'Source', width: 12 },
        { header: 'Reference', key: 'Reference', width: 16 },
      ];
      rows.forEach((row) => sheet.addRow(row));
      sheet.getColumn('Amount').numFmt = '£#,##0.00;£-#,##0.00';

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="profit-loss-${startDate.toISOString().slice(0, 10)}-${endDate.toISOString().slice(0, 10)}.xlsx"`,
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
