const defaultToObjectOptions = {
  getters: true,
  virtuals: true,
};

const toPlainObject = (input, options = defaultToObjectOptions) => {
  if (input === null || input === undefined) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => toPlainObject(item, options));
  }

  if (typeof input.toObject === 'function') {
    return input.toObject(options);
  }

  return input;
};

module.exports = {
  toPlainObject,
  defaultToObjectOptions,
};
