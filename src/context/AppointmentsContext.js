import React, {
  createContext,
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

export const AppointmentsProvider = ({ children }) => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(() => getAuthToken());

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

  const fetchAppointments = useCallback(async (activeToken) => {
    if (!activeToken) {
      setAppointments([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.get('/api/appointments');
      const data = Array.isArray(response.data)
        ? response.data
        : response.data.appointments || [];
      setAppointments(data);
      setError(null);
    } catch (err) {
      setError('Failed to load appointments');
      console.error('Error fetching appointments:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAppointments(token);
  }, [token, fetchAppointments]);

  const refreshAppointments = useCallback(() => {
    fetchAppointments(getAuthToken());
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
