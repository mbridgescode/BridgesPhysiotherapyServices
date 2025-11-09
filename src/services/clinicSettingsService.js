const ClinicSettings = require('../models/clinicSettings');

const getLatestClinicSettings = async () => {
  const settings = await ClinicSettings.findOne().sort({ updatedAt: -1 }).lean();
  return settings || {};
};

module.exports = {
  getLatestClinicSettings,
};
