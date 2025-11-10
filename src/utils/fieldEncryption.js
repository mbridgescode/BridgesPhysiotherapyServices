const {
  encryptValue,
  decryptValue,
  toISODateString,
} = require('./encryption');

const buildNormalizer = ({ normalize, lowercase, uppercase }) => {
  if (typeof normalize === 'function') {
    return normalize;
  }

  if (lowercase) {
    return (value) => (
      typeof value === 'string'
        ? value.toLowerCase()
        : value
    );
  }

  if (uppercase) {
    return (value) => (
      typeof value === 'string'
        ? value.toUpperCase()
        : value
    );
  }

  return null;
};

const returnIfFalsy = (value) => {
  if (value === undefined || value === null) {
    return value;
  }
  return value;
};

const passthroughIfEncrypted = (value) => {
  if (typeof value === 'string' && value.startsWith('enc::')) {
    return value;
  }
  return null;
};

const encryptedStringField = (options = {}) => {
  const {
    normalize,
    lowercase,
    uppercase,
    ...schemaOptions
  } = options;
  const normalizeFn = buildNormalizer({ normalize, lowercase, uppercase });
  return {
    ...schemaOptions,
    type: String,
    set(value) {
      if (value === undefined || value === null || value === '') {
        return value;
      }

      const encrypted = passthroughIfEncrypted(value);
      if (encrypted) {
        return encrypted;
      }

      const normalizedValue = normalizeFn ? normalizeFn(value) : value;
      return encryptValue(normalizedValue);
    },
    get(value) {
      const decrypted = decryptValue(value);
      return returnIfFalsy(decrypted);
    },
  };
};

const encryptedDateField = (options = {}) => {
  const { normalize, ...schemaOptions } = options;
  return {
    ...schemaOptions,
    type: String,
    set(value) {
      if (!value) {
        return value;
      }

      const encrypted = passthroughIfEncrypted(value);
      if (encrypted) {
        return encrypted;
      }

      const isoDate = toISODateString(value);
      const normalized = normalize ? normalize(isoDate) : isoDate;
      return encryptValue(normalized);
    },
    get(value) {
      const decrypted = decryptValue(value);
      if (!decrypted) {
        return decrypted;
      }

      const parsed = new Date(decrypted);
      if (Number.isNaN(parsed.getTime())) {
        return decrypted;
      }

      return parsed.toISOString();
    },
  };
};

const encryptedStringArrayField = (options = {}) => {
  const {
    normalize,
    lowercase,
    uppercase,
    ...schemaOptions
  } = options;
  const normalizeFn = buildNormalizer({ normalize, lowercase, uppercase });
  return {
    ...schemaOptions,
    type: [String],
    set(value) {
      if (!Array.isArray(value)) {
        return value;
      }

      return value.map((item) => {
        if (item === undefined || item === null || item === '') {
          return item;
        }
        const encrypted = passthroughIfEncrypted(item);
        if (encrypted) {
          return encrypted;
        }
        const normalized = normalizeFn ? normalizeFn(item) : item;
        return encryptValue(normalized);
      });
    },
    get(value) {
      if (!Array.isArray(value)) {
        return value;
      }
      return value.map((item) => decryptValue(item));
    },
  };
};

module.exports = {
  encryptedStringField,
  encryptedDateField,
  encryptedStringArrayField,
};
