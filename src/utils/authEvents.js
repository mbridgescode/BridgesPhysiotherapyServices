const TOKEN_EVENT = 'auth-token-updated';

export const emitAuthTokenChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TOKEN_EVENT));
  }
};

export const subscribeToAuthToken = (handler) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(TOKEN_EVENT, handler);
  return () => {
    window.removeEventListener(TOKEN_EVENT, handler);
  };
};

export const getAuthToken = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem('token');
};

export const TOKEN_EVENT_NAME = TOKEN_EVENT;

