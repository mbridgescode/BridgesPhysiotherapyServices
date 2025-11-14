// src/hooks/useTherapists.js
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import apiClient from '../utils/apiClient';

const mapTherapists = (items) =>
  (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map((therapist) => {
      let employeeIdValue = null;
      if (typeof therapist.employeeID === 'number' || typeof therapist.employeeID === 'string') {
        const parsed = Number(therapist.employeeID);
        employeeIdValue = Number.isNaN(parsed) ? null : parsed;
      }
      return {
        id: therapist.id || therapist._id || therapist.userId || '',
        name: therapist.name || therapist.username || 'Unnamed therapist',
        employeeID: employeeIdValue,
        role: therapist.role || 'therapist',
      };
    })
    .filter((therapist) => therapist.id);

let cachedTherapists = null;
let cachedError = null;
let ongoingFetch = null;
const subscribers = new Set();

const notifySubscribers = () => {
  const snapshot = {
    therapists: cachedTherapists || [],
    error: cachedError,
  };
  subscribers.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('useTherapists subscriber error', error);
    }
  });
};

const fetchTherapistsShared = async (force = false) => {
  if (ongoingFetch && !force) {
    return ongoingFetch;
  }
  ongoingFetch = (async () => {
    try {
      const response = await apiClient.get('/api/users/providers');
      cachedTherapists = mapTherapists(response.data?.therapists);
      cachedError = null;
    } catch (err) {
      console.error('Failed to load therapists', err);
      cachedTherapists = [];
      cachedError = 'Unable to load therapists';
    } finally {
      notifySubscribers();
      ongoingFetch = null;
    }
  })();
  return ongoingFetch;
};

export const useTherapists = () => {
  const [therapists, setTherapists] = useState(cachedTherapists || []);
  const [loading, setLoading] = useState(!cachedTherapists);
  const [error, setError] = useState(cachedError);

  useEffect(() => {
    const listener = ({ therapists: nextTherapists, error: nextError }) => {
      setTherapists(nextTherapists || []);
      setError(nextError);
      setLoading(false);
    };
    subscribers.add(listener);
    if (cachedTherapists !== null) {
      listener({ therapists: cachedTherapists, error: cachedError });
    } else {
      fetchTherapistsShared();
    }
    return () => {
      subscribers.delete(listener);
    };
  }, []);

  const refreshTherapists = useCallback(async () => {
    setLoading(true);
    await fetchTherapistsShared(true);
  }, []);

  return useMemo(() => ({
    therapists,
    loading,
    error,
    refreshTherapists,
  }), [therapists, loading, error, refreshTherapists]);
};

export default useTherapists;
