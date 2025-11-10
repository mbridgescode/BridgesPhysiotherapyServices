const ClinicSettings = require('../models/clinicSettings');
const { toPlainObject } = require('../utils/mongoose');

const getLatestClinicSettings = async () => {
  const settingsDoc = await ClinicSettings.findOne().sort({ updatedAt: -1 });
  return toPlainObject(settingsDoc) || {};
};

module.exports = {
  getLatestClinicSettings,
};
