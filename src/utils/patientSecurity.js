const { generateSearchTokensFromValues } = require('./encryption');

const PATIENT_SEARCH_FIELDS = [
  'first_name',
  'surname',
  'preferred_name',
  'email',
  'phone',
  'primary_contact_name',
  'primary_contact_email',
  'primary_contact_phone',
  'secondary_phone',
];

const pickValue = (source, field) => {
  if (!source) {
    return null;
  }

  if (typeof source.get === 'function') {
    return source.get(field);
  }

  return source[field];
};

const buildPatientSearchTokens = (patient) => {
  const values = PATIENT_SEARCH_FIELDS
    .map((field) => pickValue(patient, field))
    .filter(Boolean);

  return generateSearchTokensFromValues(values);
};

const buildTokensFromSearchQuery = (search) => generateSearchTokensFromValues([search]);

module.exports = {
  buildPatientSearchTokens,
  buildTokensFromSearchQuery,
};
