const {
  heidiApiBaseUrl,
  heidiApiKey,
} = require('../config/env');

const HEIDI_REQUEST_TIMEOUT_MS = 10000;

const createHeidiError = (message, { code, status } = {}) => {
  const error = new Error(message);
  if (code) {
    error.code = code;
  }
  if (status) {
    error.status = status;
  }
  return error;
};

const getJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEIDI_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const responseText = await response.text();
    let payload = {};

    if (responseText) {
      try {
        payload = JSON.parse(responseText);
      } catch (parseError) {
        payload = {};
      }
    }

    if (!response.ok) {
      throw createHeidiError(`Heidi returned HTTP ${response.status}`, {
        status: response.status,
      });
    }

    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw createHeidiError('Heidi authentication timed out', {
        code: 'HEIDI_TIMEOUT',
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const getHeidiJwt = async ({ email, thirdPartyInternalId }) => {
  if (!heidiApiKey) {
    throw createHeidiError('Heidi API key is not configured', {
      code: 'HEIDI_NOT_CONFIGURED',
    });
  }

  const url = new URL(`${heidiApiBaseUrl}/jwt`);
  url.searchParams.set('email', email);
  url.searchParams.set('third_party_internal_id', thirdPartyInternalId);

  const payload = await getJson(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Heidi-Api-Key': heidiApiKey,
    },
  });

  if (!payload?.token) {
    throw createHeidiError('Heidi did not return an authentication token', {
      code: 'HEIDI_INVALID_RESPONSE',
    });
  }

  return {
    token: payload.token,
    expirationTime: payload.expiration_time || null,
  };
};

module.exports = {
  getHeidiJwt,
};
