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

export const AppointmentsProvider = ({ children, enabled = true }) => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(() => getAuthToken());
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
      const response = await apiClient.get('/api/appointments', {
        params: { summary: true },
      });
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
    fetchAppointments(token);
  }, [token, fetchAppointments]);

  const refreshAppointments = useCallback(() => {
    fetchAppointments(getAuthToken(), true);
  }, [fetchAppointments]);

  return (
    <AppointmentsContext.Provider
      value={{
        appointments,
        setAppointments,
        refreshAppointments,
        loading,
        error,
      }}
    >
      {children}
    </AppointmentsContext.Provider>
  );
};

export default AppointmentsProvider;
