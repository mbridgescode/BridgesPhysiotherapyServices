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

  const resolvePlainValue = () => {
    if (typeof source.get === 'function') {
      return source.get(field);
    }
    return source[field];
  };

  try {
    return resolvePlainValue();
  } catch (error) {
    const patientId = (() => {
      try {
        if (typeof source.get === 'function') {
          return source.get('patient_id') ?? source.patient_id;
        }
        return source.patient_id;
      } catch (idError) {
        return source.patient_id;
      }
    })();

    console.error(
      `Failed to read field "${field}" while building patient search tokens`,
      {
        patientId,
        error: error?.message,
      },
    );
    return null;
  }
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
