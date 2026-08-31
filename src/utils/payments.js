const Invoice = require('../models/invoices');
const Payment = require('../models/payments');
const { toPlainObject } = require('./mongoose');

const normalizeAppointmentId = (value) => (
  Number.isNaN(Number(value)) ? value : Number(value)
);

const appointmentKey = (value) => String(normalizeAppointmentId(value));

const resolvePaymentStatus = ({ appointment, invoice, payments = [], now = new Date() }) => {
  const amountOwed = appointment?.price;
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
      && new Date(invoice.due_date) < now) {
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
};

const fetchPaymentStatuses = async (appointments = []) => {
  const appointmentList = Array.isArray(appointments) ? appointments : [];
  const appointmentIds = [
    ...new Set(
      appointmentList
        .map((appointment) => appointment?.appointment_id)
        .filter((value) => value !== undefined && value !== null)
        .map(normalizeAppointmentId),
    ),
  ];

  if (!appointmentIds.length) {
    return new Map();
  }

  try {
    const [invoiceDocs, paymentDocs] = await Promise.all([
      Invoice.find({
        $or: [
          { appointment_id: { $in: appointmentIds } },
          { appointment_ids: { $in: appointmentIds } },
        ],
      }).select('appointment_id appointment_ids status due_date balance_due'),
      Payment.find({ appointment_id: { $in: appointmentIds } })
        .select('appointment_id amount_paid status'),
    ]);

    const invoicesByAppointment = new Map();
    toPlainObject(invoiceDocs).forEach((invoice) => {
      const relatedIds = [
        invoice.appointment_id,
        ...(Array.isArray(invoice.appointment_ids) ? invoice.appointment_ids : []),
      ];
      relatedIds
        .filter((value) => value !== undefined && value !== null)
        .forEach((id) => {
          const key = appointmentKey(id);
          if (!invoicesByAppointment.has(key)) {
            invoicesByAppointment.set(key, invoice);
          }
        });
    });

    const paymentsByAppointment = new Map();
    toPlainObject(paymentDocs).forEach((payment) => {
      const key = appointmentKey(payment.appointment_id);
      const current = paymentsByAppointment.get(key) || [];
      current.push(payment);
      paymentsByAppointment.set(key, current);
    });

    const now = new Date();
    return new Map(
      appointmentList.map((appointment) => {
        const key = appointmentKey(appointment.appointment_id);
        return [
          key,
          resolvePaymentStatus({
            appointment,
            invoice: invoicesByAppointment.get(key),
            payments: paymentsByAppointment.get(key) || [],
            now,
          }),
        ];
      }),
    );
  } catch (error) {
    console.error('Error fetching payment status:', error);
    return new Map(
      appointmentList.map((appointment) => [appointmentKey(appointment.appointment_id), 'Pending']),
    );
  }
};

const fetchPaymentStatus = async (appointmentId, amountOwed) => {
  const statuses = await fetchPaymentStatuses([
    { appointment_id: appointmentId, price: amountOwed },
  ]);
  return statuses.get(appointmentKey(appointmentId)) || 'Pending';
};

module.exports = {
  fetchPaymentStatus,
  fetchPaymentStatuses,
};
