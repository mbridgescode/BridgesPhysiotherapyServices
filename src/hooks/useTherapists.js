// src/hooks/useTherapists.js
import { useCallback, useEffect, useMemo, useState } from 'react';
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

export const useTherapists = () => {
  const [therapists, setTherapists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTherapists = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/users/providers');
      setTherapists(mapTherapists(response.data?.therapists));
      setError(null);
    } catch (err) {
      console.error('Failed to load therapists', err);
      setError('Unable to load therapists');
      setTherapists([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTherapists();
  }, [fetchTherapists]);

  return useMemo(() => ({
    therapists,
    loading,
    error,
    refreshTherapists: fetchTherapists,
  }), [therapists, loading, error, fetchTherapists]);
};

export default useTherapists;
