import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import apiClient from '../utils/apiClient';

const USE_ROLES_ENABLED = true;

const useGpLetterTemplates = ({ enabled = USE_ROLES_ENABLED } = {}) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState('');

  const fetchTemplates = useCallback(async () => {
    if (!enabled) {
      setTemplates([]);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.get('/api/gp-letter-templates');
      setTemplates(response.data.templates || []);
      setError('');
    } catch (err) {
      console.error('Failed to load GP letter templates', err);
      setError(err?.response?.data?.message || 'Unable to load templates.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const createTemplate = useCallback(async (payload) => {
    const response = await apiClient.post('/api/gp-letter-templates', payload);
    const template = response.data?.template;
    if (template) {
      setTemplates((prev) => [template, ...prev]);
    }
    return template;
  }, []);

  const updateTemplate = useCallback(async (templateId, payload) => {
    const response = await apiClient.put(`/api/gp-letter-templates/${templateId}`, payload);
    const template = response.data?.template;
    if (template) {
      setTemplates((prev) => prev.map((item) => (item.id === template.id ? template : item)));
    }
    return template;
  }, []);

  const deleteTemplate = useCallback(async (templateId) => {
    await apiClient.delete(`/api/gp-letter-templates/${templateId}`);
    setTemplates((prev) => prev.filter((item) => item.id !== templateId));
  }, []);

  return useMemo(() => ({
    templates,
    loading,
    error,
    refresh: fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  }), [templates, loading, error, fetchTemplates, createTemplate, updateTemplate, deleteTemplate]);
};

export default useGpLetterTemplates;
