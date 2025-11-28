const Invoice = require('../models/invoices');
const Payment = require('../models/payments');
const { toPlainObject } = require('./mongoose');

const fetchPaymentStatus = async (appointmentId, amountOwed) => {
  try {
    const normalizedId = Number.isNaN(Number(appointmentId))
      ? appointmentId
      : Number(appointmentId);

    const [invoiceDoc, paymentDocs] = await Promise.all([
      Invoice.findOne({
        $or: [
          { appointment_id: normalizedId },
          { appointment_ids: normalizedId },
        ],
      }),
      Payment.find({ appointment_id: normalizedId }),
    ]);

    const invoice = toPlainObject(invoiceDoc);
    const payments = toPlainObject(paymentDocs);

    const totalPaidFromPayments = payments
      .filter((payment) => (payment.status || 'applied') === 'applied')
      .reduce((sum, payment) => sum + payment.amount_paid, 0);

    if (invoice) {
      if (invoice.status === 'paid') {
        return 'Paid';
      }
      if (invoice.status === 'partially_paid') {
        return 'Part-Paid';
      }
      if (invoice.status === 'void') {
        return 'Voided';
      }
      if (invoice.due_date && invoice.balance_due > 0
        && new Date(invoice.due_date) < new Date()) {
        return 'Overdue';
      }
    }

    if (totalPaidFromPayments >= amountOwed) {
      return 'Paid';
    }
    if (totalPaidFromPayments > 0) {
      return 'Part-Paid';
    }
    return 'Pending';
  } catch (error) {
    console.error('Error fetching payment status:', error);
    return 'Pending';
  }
};

module.exports = {
  fetchPaymentStatus,
};
