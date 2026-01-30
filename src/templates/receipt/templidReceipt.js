const { renderReceiptTemplate, formatCurrency, formatLongDate } = require('../receiptTemplate');

const renderTemplidReceipt = (options = {}) => renderReceiptTemplate(options);

module.exports = {
  renderTemplidReceipt,
  formatCurrency,
  formatLongDate,
};
