const Invoice = require('../models/invoices');
const Payment = require('../models/payments');

const fetchPaymentStatus = async (appointmentId, amountOwed) => {
  try {
    const normalizedId = Number.isNaN(Number(appointmentId))
      ? appointmentId
      : Number(appointmentId);

    const [invoice, payments] = await Promise.all([
      Invoice.findOne({
        $or: [
          { appointment_id: normalizedId },
          { appointment_ids: normalizedId },
        ],
      }).lean({ getters: true, virtuals: true }),
      Payment.find({ appointment_id: normalizedId }).lean({ getters: true, virtuals: true }),
    ]);

    const totalPaidFromPayments = payments.reduce(
      (sum, payment) => sum + payment.amount_paid,
      0,
    );

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
