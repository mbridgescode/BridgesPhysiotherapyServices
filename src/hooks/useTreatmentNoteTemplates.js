import { useCallback, useEffect, useState } from 'react';
import apiClient from '../utils/apiClient';

const useTreatmentNoteTemplates = (options = {}) => {
  const { enabled = true } = options;
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const refreshTemplates = useCallback(async () => {
    if (!enabled) {
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.get('/api/treatment-note-templates');
      setTemplates(response.data?.templates || []);
      setError(null);
    } catch (err) {
      console.error('Failed to load treatment note templates', err);
      setError(err?.response?.data?.message || 'Unable to load templates');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      refreshTemplates();
    } else {
      setTemplates([]);
    }
  }, [enabled, refreshTemplates]);

  return {
    templates,
    loading,
    error,
    refreshTemplates,
    setTemplates,
  };
};

export default useTreatmentNoteTemplates;
