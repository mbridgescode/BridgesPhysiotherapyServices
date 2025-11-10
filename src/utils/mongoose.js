const { decryptValue, ENC_PREFIX } = require('./encryption');

const defaultToObjectOptions = {
  getters: true,
  virtuals: true,
};

const isPlainObject = (value) => (
  value !== null
  && typeof value === 'object'
  && Object.prototype.toString.call(value) === '[object Object]'
);

const safeDecrypt = (value) => {
  if (typeof value !== 'string' || !value.startsWith(ENC_PREFIX)) {
    return value;
  }

  try {
    return decryptValue(value);
  } catch (error) {
    console.error('Failed to decrypt value during serialization', { message: error?.message });
    return value;
  }
};

const deepNormalize = (input) => {
  if (Array.isArray(input)) {
    return input.map((item) => deepNormalize(item));
  }

  if (input instanceof Date || input instanceof RegExp || Buffer.isBuffer(input)) {
    return input;
  }

  if (isPlainObject(input)) {
    return Object.entries(input).reduce((acc, [key, value]) => {
      acc[key] = deepNormalize(value);
      return acc;
    }, {});
  }

  return safeDecrypt(input);
};

const toPlainObject = (input, options = defaultToObjectOptions) => {
  if (input === null || input === undefined) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => toPlainObject(item, options));
  }

  if (typeof input.toObject === 'function') {
    return deepNormalize(input.toObject(options));
  }

  return deepNormalize(input);
};

module.exports = {
  toPlainObject,
  defaultToObjectOptions,
};
