const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { authenticate, authorize } = require('../middleware/auth');
const { importPastDataRows } = require('../services/pastDataImportService');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

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
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    const data = row.values.slice(1);
    if (!data.some((value) => value !== null && value !== undefined && `${value}`.trim() !== '')) {
      return;
    }
    const payload = { rowNumber };
    headers.forEach((header, headerIndex) => {
      const mapped = HEADER_MAP[header];
      if (mapped) {
        payload[mapped] = data[headerIndex];
      }
    });
    rows.push(payload);
  });
  return rows;
};

const parseSpreadsheetBuffer = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  return extractRowsFromWorksheet(worksheet);
};

router.post(
  '/past-data',
  authenticate,
  authorize('admin'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      let rows = [];

      if (req.file) {
        try {
          rows = rows.concat(await parseSpreadsheetBuffer(req.file.buffer));
        } catch (fileError) {
          return res.status(400).json({
            success: false,
            message: 'Unable to read spreadsheet. Please upload a valid .xlsx file.',
          });
        }
      }

      if (req.body.entries) {
        try {
          const parsedEntries = JSON.parse(req.body.entries);
          if (Array.isArray(parsedEntries)) {
            rows = rows.concat(parsedEntries);
          }
        } catch (jsonError) {
          return res.status(400).json({
            success: false,
            message: 'entries payload must be valid JSON',
          });
        }
      }

      if (rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No import rows provided. Upload a spreadsheet or include entries.',
        });
      }

      const summary = await importPastDataRows({
        rows,
        actorId: req.user.id,
        sourceLabel: req.body.source || 'admin-upload',
      });

      return res.json({
        success: true,
        summary,
      });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;

