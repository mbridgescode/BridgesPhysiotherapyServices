const Payment = require('../models/payments');

const calculateTotals = ({ lineItems = [], discount }) => {
  let subtotal = 0;
  let taxTotal = 0;
  let lineDiscountTotal = 0;

  lineItems.forEach((item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unit_price || 0);
    const baseAmount = quantity * unitPrice;
    const discountAmountRaw = Number(item.discount_amount || 0);
    const lineDiscount = Number.isNaN(discountAmountRaw)
      ? 0
      : Math.min(Math.max(discountAmountRaw, 0), baseAmount);
    const lineNet = Math.max(baseAmount - lineDiscount, 0);
    lineDiscountTotal += lineDiscount;
    subtotal += lineNet;
    const lineTax = lineNet * (Number(item.tax_rate || 0) / 100);
    taxTotal += lineTax;
  });

  const invoiceDiscountAmount = Math.max(Number(discount?.amount || 0), 0);
  const discountAmount = lineDiscountTotal + invoiceDiscountAmount;
  const totalDue = Math.max(0, subtotal + taxTotal - invoiceDiscountAmount);

  return {
    subtotal,
    taxTotal,
    discountAmount,
    lineDiscountTotal,
    invoiceDiscountAmount,
    totalDue,
    balanceDue: totalDue,
    totals: {
      net: subtotal,
      tax: taxTotal,
      discount: discountAmount,
      gross: totalDue,
      paid: 0,
      balance: totalDue,
    },
  };
};

const refreshInvoiceWithPayments = async (invoice) => {
  const payments = await Payment.find({
    $or: [
      { invoice_number: invoice.invoice_number },
      { invoice_id: invoice.invoice_id },
    ],
  }).lean({ getters: true, virtuals: true });

  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount_paid, 0);
  invoice.total_paid = totalPaid;
  invoice.balance_due = Math.max(0, invoice.total_due - totalPaid);
  invoice.totals = {
    net: invoice.subtotal ?? invoice.totals?.net ?? 0,
    tax: invoice.tax_total ?? invoice.totals?.tax ?? 0,
    discount: invoice.discount?.amount ?? invoice.totals?.discount ?? 0,
    gross: invoice.total_due ?? invoice.totals?.gross ?? 0,
    paid: totalPaid,
    balance: invoice.balance_due,
  };

  if (invoice.status !== 'void') {
    if (invoice.balance_due <= 0) {
      invoice.status = 'paid';
      invoice.paid_at = invoice.paid_at || new Date();
    } else if (totalPaid > 0) {
      invoice.status = 'partially_paid';
      invoice.paid_at = undefined;
    } else if (invoice.status === 'draft') {
      invoice.status = 'draft';
    } else {
      invoice.status = 'sent';
    }
  }

  return { invoice, payments, totalPaid };
};

module.exports = {
  calculateTotals,
  refreshInvoiceWithPayments,
};
