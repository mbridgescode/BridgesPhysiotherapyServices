const {
  renderInvoiceTemplate,
  normalizePaymentInstructionLines,
  formatCurrency,
  formatLongDate,
} = require('../invoiceTemplate');

const renderTemplidInvoice = (options = {}) => renderInvoiceTemplate(options);

module.exports = {
  renderTemplidInvoice,
  normalizePaymentInstructionLines,
  formatCurrency,
  formatLongDate,
};
