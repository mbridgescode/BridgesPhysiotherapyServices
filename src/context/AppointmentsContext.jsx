import React, {
  createContext,
  useRef,
  useState,
  useEffect,
  useCallback,
} from 'react';
import apiClient from '../utils/apiClient';
import {
  getAuthToken,
  subscribeToAuthToken,
} from '../utils/authEvents';

export const AppointmentsContext = createContext();

export const AppointmentsProvider = ({ children, enabled = true, deferInitialLoad = false }) => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(() => getAuthToken());
  const [refreshVersion, setRefreshVersion] = useState(0);
  const loadedTokenRef = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuthToken(() => {
      setToken(getAuthToken());
    });

    const handleStorage = () => {
      setToken(getAuthToken());
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorage);
    }

    return () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorage);
      }
    };
  }, []);

  const fetchAppointments = useCallback(async (activeToken, force = false) => {
    if (!activeToken) {
      loadedTokenRef.current = null;
      setAppointments([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (!enabled) {
      setError(null);
      setLoading(false);
      return;
    }

    if (!force && loadedTokenRef.current === activeToken) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.get('/api/schedule/table');
      const data = Array.isArray(response.data)
        ? response.data
        : response.data.appointments || [];
      setAppointments(data);
      loadedTokenRef.current = activeToken;
      setError(null);
    } catch (err) {
      setError('Failed to load appointments');
      console.error('Error fetching appointments:', err);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (loadedTokenRef.current !== null && loadedTokenRef.current !== token) {
      loadedTokenRef.current = null;
      setAppointments([]);
    }

    if (!deferInitialLoad || typeof window === 'undefined') {
      fetchAppointments(token);
      return undefined;
    }

    if (enabled && token) {
      setLoading(true);
    }

    let cancelled = false;
    const load = () => {
      if (!cancelled) {
        fetchAppointments(token);
      }
    };

    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(load, { timeout: 350 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = window.setTimeout(load, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [deferInitialLoad, fetchAppointments, token]);

  const refreshAppointments = useCallback(() => {
    setRefreshVersion((previous) => previous + 1);
    fetchAppointments(getAuthToken(), true);
  }, [fetchAppointments]);

  return (
    <AppointmentsContext.Provider
      value={{
        appointments,
        setAppointments,
        refreshAppointments,
        refreshVersion,
        loading,
        error,
      }}
    >
      {children}
    </AppointmentsContext.Provider>
  );
};

export default AppointmentsProvider;
