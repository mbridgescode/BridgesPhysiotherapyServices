#!/usr/bin/env node
/**
 * CLI helper to backfill legacy spreadsheet data.
 *
 * Usage:
 *   DATA_ENCRYPTION_KEY=... MONGODB_URI=... node scripts/backfillPastData.js ./Past\ Data.xlsx
 */

/* eslint-disable no-console */

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const { importPastDataRows } = require('../src/services/pastDataImportService');

const REQUIRED_ENV = ['MONGODB_URI', 'DATA_ENCRYPTION_KEY', 'ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET'];

const assertEnv = () => {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
};

const normalizeHeader = (header) => header
  .toString()
  .trim()
  .toLowerCase();

const HEADER_MAP = {
  date: 'date',
  'patient name': 'patientName',
  'appointment type': 'appointmentType',
  'invoice amount': 'invoiceAmount',
  discount: 'discount',
  payment: 'payment',
  'payment type': 'paymentType',
};

const extractRowsFromWorksheet = (worksheet) => {
  if (!worksheet) {
    return [];
  }
  const headerRow = worksheet.getRow(1);
  const headers = headerRow.values.slice(1).map((cell) => normalizeHeader(cell || ''));
  return worksheet.getSheetValues()
    .slice(2)
    .map((line, index) => {
      if (!line) {
        return null;
      }
      const values = Array.isArray(line) ? line.slice(1) : [];
      if (!values.some((value) => value !== null && value !== undefined && `${value}`.trim() !== '')) {
        return null;
      }
      const payload = { rowNumber: index + 2 };
      headers.forEach((header, headerIndex) => {
        const mapped = HEADER_MAP[header];
        if (mapped) {
          payload[mapped] = values[headerIndex];
        }
      });
      return payload;
    })
    .filter(Boolean);
};

const loadSpreadsheetRows = async (inputPath) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputPath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }
  return extractRowsFromWorksheet(worksheet);
};

const main = async () => {
  assertEnv();

  const spreadsheetPath = process.argv[2] || path.join(process.cwd(), 'Past Data.xlsx');
  if (!fs.existsSync(spreadsheetPath)) {
    throw new Error(`Spreadsheet not found at ${spreadsheetPath}`);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[backfill] Connected to MongoDB');

  const rows = await loadSpreadsheetRows(spreadsheetPath);
  console.log(`[backfill] Loaded ${rows.length} rows from spreadsheet`);

  const summary = await importPastDataRows({
    rows,
    actorId: null,
    sourceLabel: 'cli-import',
  });

  console.table({
    processed: summary.processed,
    appointmentsCreated: summary.appointmentsCreated,
    invoicesCreated: summary.invoicesCreated,
    paymentsCreated: summary.paymentsCreated,
    skipped: summary.skipped.length,
    errors: summary.errors.length,
  });

  if (summary.skipped.length) {
    console.log('\nSkipped rows:');
    summary.skipped.slice(0, 10).forEach((entry) => {
      console.log(` - Row ${entry.rowNumber}: ${entry.reason}`);
    });
    if (summary.skipped.length > 10) {
      console.log(` (+${summary.skipped.length - 10} more)`);
    }
  }

  if (summary.errors.length) {
    console.log('\nErrors:');
    summary.errors.forEach((entry) => {
      console.log(` - Row ${entry.rowNumber}: ${entry.reason}`);
    });
  }

  await mongoose.disconnect();
};

main().catch((error) => {
  console.error('[backfill] Failed:', error);
  process.exitCode = 1;
});

