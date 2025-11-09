const express = require('express');
const Appointment = require('../models/appointments');
const Invoice = require('../models/invoices');
const Payment = require('../models/payments');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get(
  '/dashboard',
  authenticate,
  authorize('admin', 'therapist', 'receptionist'),
  async (req, res, next) => {
    try {
      const now = new Date();
      const from = req.query.from ? new Date(req.query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
      const to = req.query.to ? new Date(req.query.to) : now;

      const [
        appointmentsCounts,
        revenueByMonth,
        payments,
        outstandingInvoices,
      ] = await Promise.all([
        Appointment.aggregate([
          {
            $match: {
              date: { $gte: from, $lte: to },
            },
          },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
        ]),
        Invoice.aggregate([
          {
            $match: {
              issue_date: { $gte: from, $lte: to },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$issue_date' } },
              totalDue: { $sum: '$total_due' },
              totalPaid: { $sum: '$total_paid' },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        Payment.aggregate([
          {
            $match: {
              payment_date: { $gte: from, $lte: to },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount_paid' },
            },
          },
        ]),
        Invoice.aggregate([
          { $match: { balance_due: { $gt: 0 } } },
          {
            $group: {
              _id: '$status',
              balance: { $sum: '$balance_due' },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      const appointmentSummary = appointmentsCounts.reduce((acc, cur) => ({
        ...acc,
        [cur._id || 'unknown']: cur.count,
      }), {});

      const outstandingSummary = outstandingInvoices.reduce((acc, cur) => ({
        totalBalance: (acc.totalBalance || 0) + cur.balance,
        invoiceCount: (acc.invoiceCount || 0) + cur.count,
      }), {});

      res.json({
        success: true,
        metrics: {
          appointments: {
            scheduled: appointmentSummary.scheduled || 0,
            completed: appointmentSummary.completed || 0,
            cancelled: appointmentSummary.cancelled || 0,
          },
          paymentsProcessed: payments[0]?.total || 0,
          revenueByMonth,
          outstanding: outstandingSummary,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
