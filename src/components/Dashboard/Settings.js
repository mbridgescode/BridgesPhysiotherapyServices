import React, {
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Switch,
  TextField,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import apiClient from '../../utils/apiClient';
import { UserContext } from '../../context/UserContext';
import DataTable from '../common/DataTable';
import useTreatmentNoteTemplates from '../../hooks/useTreatmentNoteTemplates';

const REQUEST_TYPES = [
  { value: 'access', label: 'Access' },
  { value: 'rectification', label: 'Rectification' },
  { value: 'erasure', label: 'Erasure' },
  { value: 'restriction', label: 'Restriction' },
  { value: 'portability', label: 'Portability' },
];

const REQUEST_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'rejected', label: 'Rejected' },
];

const Settings = () => {
  const { userData } = useContext(UserContext);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [serviceError, setServiceError] = useState(null);
  const [serviceForm, setServiceForm] = useState({
    treatment_description: '',
    price: '',
    duration_minutes: '',
  });
  const [creatingService, setCreatingService] = useState(false);
  const [serviceSavingId, setServiceSavingId] = useState(null);
  const [twoFactorState, setTwoFactorState] = useState({
    enabled: Boolean(userData?.twoFactorEnabled),
    secret: '',
    otpauthUrl: '',
    code: '',
    loading: false,
    error: '',
    success: '',
  });
  const [dataRequests, setDataRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestError, setRequestError] = useState('');
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestForm, setRequestForm] = useState({
    patient_id: '',
    type: REQUEST_TYPES[0].value,
    requesterName: '',
    requesterEmail: '',
    notes: '',
  });
  const [retentionRows, setRetentionRows] = useState([]);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [retentionError, setRetentionError] = useState('');
  const [anonymizingPatientId, setAnonymizingPatientId] = useState(null);
  const [templateDialog, setTemplateDialog] = useState({
    open: false,
    id: null,
    name: '',
    body: '',
  });
  const [templateDialogError, setTemplateDialogError] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);

  const isAdmin = userData?.role === 'admin';
  const canManageTemplates = ['admin', 'therapist'].includes(userData?.role);
  const {
    templates: treatmentNoteTemplates,
    loading: templatesLoading,
    error: templatesError,
    refreshTemplates,
  } = useTreatmentNoteTemplates({ enabled: canManageTemplates });

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/settings/clinic');
      setSettings(response.data.settings || {
        branding: {},
        tax: { default_rate: 0 },
        notification_preferences: {},
      });
      setError(null);
    } catch (err) {
      console.error('Failed to load settings', err);
      setError('Unable to load clinic settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const loadDataRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const response = await apiClient.get('/api/data-requests');
      setDataRequests(response.data.requests || []);
      setRequestError('');
    } catch (err) {
      console.error('Failed to load data subject requests', err);
      setRequestError('Unable to load data subject requests.');
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    setTwoFactorState((prev) => ({
      ...prev,
      enabled: Boolean(userData?.twoFactorEnabled),
    }));
  }, [userData?.twoFactorEnabled]);

  const openNewTemplateDialog = () => {
    setTemplateDialog({
      open: true,
      id: null,
      name: '',
      body: '',
    });
    setTemplateDialogError('');
  };

  const openEditTemplateDialog = (template) => {
    setTemplateDialog({
      open: true,
      id: template.id,
      name: template.name,
      body: template.body,
    });
    setTemplateDialogError('');
  };

  const closeTemplateDialog = () => {
    if (templateSaving) {
      return;
    }
    setTemplateDialog({
      open: false,
      id: null,
      name: '',
      body: '',
    });
    setTemplateDialogError('');
  };

  const handleTemplateFieldChange = (field) => (event) => {
    const { value } = event.target;
    setTemplateDialog((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveTemplate = async () => {
    if (!templateDialog.name.trim()) {
      setTemplateDialogError('Template name is required');
      return;
    }
    if (!templateDialog.body.trim()) {
      setTemplateDialogError('Template body is required');
      return;
    }
    setTemplateSaving(true);
    setTemplateDialogError('');
    try {
      if (templateDialog.id) {
        await apiClient.put(`/api/treatment-note-templates/${templateDialog.id}`, {
          name: templateDialog.name.trim(),
          body: templateDialog.body.trim(),
        });
      } else {
        await apiClient.post('/api/treatment-note-templates', {
          name: templateDialog.name.trim(),
          body: templateDialog.body.trim(),
        });
      }
      await refreshTemplates();
      closeTemplateDialog();
    } catch (err) {
      console.error('Failed to save template', err);
      setTemplateDialogError(err?.response?.data?.message || 'Unable to save template');
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async (template) => {
    if (!window.confirm(`Delete template "${template.name}"? This cannot be undone.`)) {
      return;
    }
    try {
      await apiClient.delete(`/api/treatment-note-templates/${template.id}`);
      await refreshTemplates();
    } catch (err) {
      console.error('Failed to delete treatment template', err);
      setTemplateDialogError(err?.response?.data?.message || 'Unable to delete template');
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    loadServices();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    loadDataRequests();
  }, [isAdmin, loadDataRequests]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    loadRetentionReport();
  }, [isAdmin]);

  const describeAge = (dob) => {
    if (!dob) {
      return 'Unknown';
    }
    const date = new Date(dob);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown';
    }
    const diff = Date.now() - date.getTime();
    const age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
    return `${date.toLocaleDateString()} (${age})`;
  };

  const normalizeServices = (items = []) => items.map((service) => ({
    ...service,
    price: service.price ?? 0,
    duration_minutes: service.duration_minutes ?? '',
  }));

  const loadServices = async () => {
    setServicesLoading(true);
    try {
      const response = await apiClient.get('/api/services', { params: { includeInactive: true } });
      setServices(normalizeServices(response.data.services || []));
      setServiceError(null);
    } catch (err) {
      console.error('Failed to load services', err);
      setServiceError('Unable to load services catalog.');
    } finally {
      setServicesLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    loadServices();
  }, [isAdmin]);

  const updateField = (path, value) => {
    setSettings((prev) => {
      const clone = { ...(prev || {}) };
      let pointer = clone;
      const parts = path.split('.');
      parts.slice(0, -1).forEach((part) => {
        pointer[part] = pointer[part] || {};
        pointer = pointer[part];
      });
      pointer[parts[parts.length - 1]] = value;
      return clone;
    });
  };

  const handleServiceFormChange = (field) => (event) => {
    const { value } = event.target;
    setServiceForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateService = async (event) => {
    event.preventDefault();
    if (!serviceForm.treatment_description.trim() || serviceForm.price === '') {
      setServiceError('Service name and price are required.');
      return;
    }
    const priceValue = Number(serviceForm.price);
    if (Number.isNaN(priceValue) || priceValue < 0) {
      setServiceError('Price must be a non-negative number.');
      return;
    }
    const durationValue = serviceForm.duration_minutes === ''
      ? undefined
      : Number(serviceForm.duration_minutes);
    if (durationValue !== undefined && (Number.isNaN(durationValue) || durationValue < 0)) {
      setServiceError('Duration must be a positive number of minutes.');
      return;
    }

    setCreatingService(true);
    setServiceError(null);
    try {
      await apiClient.post('/api/services', {
        treatment_description: serviceForm.treatment_description.trim(),
        price: priceValue,
        duration_minutes: durationValue,
      });
      setServiceForm({
        treatment_description: '',
        price: '',
        duration_minutes: '',
      });
      await loadServices();
    } catch (err) {
      console.error('Failed to create service', err);
      setServiceError(err?.response?.data?.message || 'Unable to create service.');
    } finally {
      setCreatingService(false);
    }
  };

  const persistUserProfile = (nextUser) => {
    if (nextUser) {
      localStorage.setItem('user', JSON.stringify(nextUser));
    }
  };

  const handleGenerateTwoFactorSecret = async () => {
    setTwoFactorState((prev) => ({
      ...prev,
      loading: true,
      error: '',
      success: '',
    }));
    try {
      const response = await apiClient.post('/auth/2fa/setup');
      setTwoFactorState((prev) => ({
        ...prev,
        loading: false,
        secret: response.data.secret,
        otpauthUrl: response.data.otpauthUrl,
      }));
    } catch (err) {
      setTwoFactorState((prev) => ({
        ...prev,
        loading: false,
        error: err.response?.data?.message || 'Unable to generate setup code.',
      }));
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (!twoFactorState.code.trim()) {
      setTwoFactorState((prev) => ({ ...prev, error: 'Enter the authenticator code to continue.' }));
      return;
    }

    setTwoFactorState((prev) => ({
      ...prev,
      loading: true,
      error: '',
      success: '',
    }));
    try {
      const response = await apiClient.post('/auth/2fa/verify', { token: twoFactorState.code });
      persistUserProfile(response.data.user);
      setTwoFactorState((prev) => ({
        ...prev,
        loading: false,
        enabled: true,
        secret: '',
        otpauthUrl: '',
        code: '',
        success: 'Two-factor authentication is now enabled.',
      }));
    } catch (err) {
      setTwoFactorState((prev) => ({
        ...prev,
        loading: false,
        error: err.response?.data?.message || 'Verification failed. Please try again.',
      }));
    }
  };

  const handleDisableTwoFactor = async () => {
    if (!twoFactorState.code.trim()) {
      setTwoFactorState((prev) => ({ ...prev, error: 'Enter an authentication code to disable 2FA.' }));
      return;
    }

    setTwoFactorState((prev) => ({
      ...prev,
      loading: true,
      error: '',
      success: '',
    }));
    try {
      const response = await apiClient.post('/auth/2fa/disable', { token: twoFactorState.code });
      persistUserProfile(response.data.user);
      setTwoFactorState((prev) => ({
        ...prev,
        loading: false,
        enabled: false,
        secret: '',
        otpauthUrl: '',
        code: '',
        success: 'Two-factor authentication disabled.',
      }));
    } catch (err) {
      setTwoFactorState((prev) => ({
        ...prev,
        loading: false,
        error: err.response?.data?.message || 'Unable to disable two-factor authentication.',
      }));
    }
  };

  const updateServiceLocal = (serviceId, field, value) => {
    setServices((prev) => prev.map(
      (service) => (service.id === serviceId ? { ...service, [field]: value } : service),
    ));
  };

  const handleServiceSave = async (serviceId, overrides = {}) => {
    const service = services.find((item) => item.id === serviceId);
    if (!service) {
      return;
    }
    const pending = { ...service, ...overrides };
    const payload = {
      treatment_description: pending.treatment_description,
      price: Number(pending.price),
      duration_minutes: pending.duration_minutes === '' || pending.duration_minutes === undefined
        ? undefined
        : Number(pending.duration_minutes),
      active: pending.active,
    };

    if (Number.isNaN(payload.price) || payload.price < 0) {
      setServiceError('Price must be a non-negative number.');
      return;
    }
    if (
      payload.duration_minutes !== undefined
      && (Number.isNaN(payload.duration_minutes) || payload.duration_minutes < 0)
    ) {
      setServiceError('Duration must be a positive number of minutes.');
      return;
    }

    setServiceSavingId(serviceId);
    setServiceError(null);
    try {
      await apiClient.put(`/api/services/${serviceId}`, payload);
      await loadServices();
    } catch (err) {
      console.error('Failed to update service', err);
      setServiceError(err?.response?.data?.message || 'Unable to update service.');
    } finally {
      setServiceSavingId(null);
    }
  };

  const handleServiceToggle = (serviceId, current) => {
    updateServiceLocal(serviceId, 'active', !current);
    handleServiceSave(serviceId, { active: !current });
  };

  const handleRequestFormChange = (field) => (event) => {
    const { value } = event.target;
    setRequestForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateDataRequest = async (event) => {
    event.preventDefault();
    if (!requestForm.patient_id.trim() || Number.isNaN(Number(requestForm.patient_id))) {
      setRequestError('A valid numeric Patient ID is required.');
      return;
    }
    if (!requestForm.requesterName.trim()) {
      setRequestError('Requester name is required.');
      return;
    }

    setRequestSaving(true);
    setRequestError('');
    try {
      await apiClient.post('/api/data-requests', {
        patient_id: Number(requestForm.patient_id),
        type: requestForm.type,
        requesterName: requestForm.requesterName,
        requesterEmail: requestForm.requesterEmail,
        notes: requestForm.notes,
      });
      setRequestForm({
        patient_id: '',
        type: REQUEST_TYPES[0].value,
        requesterName: '',
        requesterEmail: '',
        notes: '',
      });
      await loadDataRequests();
    } catch (err) {
      console.error('Failed to log data subject request', err);
      setRequestError(err?.response?.data?.message || 'Unable to log the request.');
    } finally {
      setRequestSaving(false);
    }
  };

  const handleRequestStatusChange = async (requestId, status) => {
    try {
      await apiClient.patch(`/api/data-requests/${requestId}`, { status });
      await loadDataRequests();
    } catch (err) {
      console.error('Failed to update request status', err);
      setRequestError(err?.response?.data?.message || 'Unable to update request status.');
    }
  };

  const loadRetentionReport = async () => {
    setRetentionLoading(true);
    try {
      const response = await apiClient.get('/api/patients/retention/report');
      setRetentionRows(response.data.eligible || []);
      setRetentionError('');
    } catch (err) {
      console.error('Failed to load retention report', err);
      setRetentionError(err?.response?.data?.message || 'Unable to load retention report.');
    } finally {
      setRetentionLoading(false);
    }
  };

  const handleAnonymizePatient = async (patientId) => {
    setAnonymizingPatientId(patientId);
    try {
      await apiClient.post(`/api/patients/${patientId}/anonymize`);
      await loadRetentionReport();
    } catch (err) {
      console.error('Failed to anonymize patient', err);
      setRetentionError(err?.response?.data?.message || 'Unable to anonymize patient record.');
    } finally {
      setAnonymizingPatientId(null);
    }
  };

  const serviceColumns = [
    {
      id: 'treatment_description',
      label: 'Service',
      minWidth: 240,
      valueGetter: (row) => row.treatment_description,
      render: (row) => (
        <TextField
          value={row.treatment_description}
          onChange={(event) => updateServiceLocal(row.id, 'treatment_description', event.target.value)}
          fullWidth
        />
      ),
    },
    {
      id: 'price',
      label: 'Price',
      type: 'number',
      minWidth: 140,
      valueGetter: (row) => row.price,
      render: (row) => (
        <TextField
          type="number"
          value={row.price}
          onChange={(event) => updateServiceLocal(row.id, 'price', event.target.value)}
          fullWidth
          inputProps={{ min: 0, step: 1 }}
        />
      ),
    },
    {
      id: 'duration_minutes',
      label: 'Duration (min)',
      type: 'number',
      minWidth: 160,
      valueGetter: (row) => row.duration_minutes,
      render: (row) => (
        <TextField
          type="number"
          value={row.duration_minutes}
          onChange={(event) => updateServiceLocal(row.id, 'duration_minutes', event.target.value)}
          fullWidth
          inputProps={{ min: 0, step: 5 }}
        />
      ),
    },
    {
      id: 'active',
      label: 'Active',
      type: 'boolean',
      minWidth: 120,
      valueGetter: (row) => row.active,
      render: (row) => (
        <Switch
          checked={row.active}
          onChange={() => handleServiceToggle(row.id, row.active)}
          color="primary"
        />
      ),
    },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      sortable: false,
      filterable: false,
      minWidth: 140,
      render: (row) => (
        <Tooltip title="Save changes">
          <span>
            <IconButton
              color="primary"
              onClick={() => handleServiceSave(row.id)}
              disabled={serviceSavingId === row.id}
            >
              <SaveIcon fontSize="inherit" />
            </IconButton>
          </span>
        </Tooltip>
      ),
    },
  ];

  const templateColumns = [
    {
      id: 'name',
      label: 'Template Name',
      minWidth: 220,
    },
    {
      id: 'preview',
      label: 'Preview',
      minWidth: 320,
      sortable: false,
      filterable: false,
      render: (row) => {
        if (!row.body) {
          return '—';
        }
        const preview = row.body.length > 180 ? `${row.body.slice(0, 180)}...` : row.body;
        return (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
            {preview}
          </Typography>
        );
      },
    },
    {
      id: 'updatedAt',
      label: 'Updated',
      type: 'date',
      minWidth: 160,
      valueGetter: (row) => row.updatedAt,
      render: (row) => (row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '--'),
    },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      sortable: false,
      filterable: false,
      minWidth: 140,
      render: (row) => (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Tooltip title="Edit template">
            <IconButton size="small" onClick={() => openEditTemplateDialog(row)}>
              <EditIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete template">
            <span>
              <IconButton size="small" onClick={() => handleDeleteTemplate(row)}>
                <DeleteOutlineIcon fontSize="inherit" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ),
    },
  ];

  const requestColumns = [
    {
      id: 'request_id',
      label: 'Request #',
      minWidth: 100,
      valueGetter: (row) => row.request_id,
    },
    {
      id: 'patient_id',
      label: 'Patient ID',
      minWidth: 120,
      valueGetter: (row) => row.patient_id,
    },
    {
      id: 'type',
      label: 'Type',
      minWidth: 140,
      render: (row) => {
        const match = REQUEST_TYPES.find((item) => item.value === row.type);
        return match ? match.label : row.type;
      },
    },
    {
      id: 'requester',
      label: 'Requester',
      minWidth: 220,
      render: (row) => (
        <Box>
          <Typography variant="body2">{row.requesterName || 'N/A'}</Typography>
          {row.requesterEmail && (
            <Typography variant="caption" color="text.secondary">
              {row.requesterEmail}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'dueAt',
      label: 'Due',
      minWidth: 150,
      render: (row) => (row.dueAt ? new Date(row.dueAt).toLocaleDateString() : 'N/A'),
    },
    {
      id: 'status',
      label: 'Status',
      minWidth: 180,
      render: (row) => (
        <TextField
          select
          size="small"
          value={row.status}
          onChange={(event) => handleRequestStatusChange(row.request_id, event.target.value)}
        >
          {REQUEST_STATUSES.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      ),
    },
  ];

  const retentionColumns = [
    {
      id: 'patient_id',
      label: 'Patient ID',
      minWidth: 120,
      valueGetter: (row) => row.patient_id,
    },
    {
      id: 'name',
      label: 'Name',
      minWidth: 220,
      render: (row) => `${row.first_name || ''} ${row.surname || ''}`.trim() || 'Unknown',
    },
    {
      id: 'updatedAt',
      label: 'Last Updated',
      minWidth: 160,
      render: (row) => (row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : 'Unknown'),
    },
    {
      id: 'date_of_birth',
      label: 'DOB / Age',
      minWidth: 180,
      render: (row) => describeAge(row.date_of_birth),
    },
    {
      id: 'actions',
      label: 'Actions',
      minWidth: 160,
      render: (row) => (
        <Button
          size="small"
          variant="outlined"
          color="warning"
          onClick={() => handleAnonymizePatient(row.patient_id)}
          disabled={anonymizingPatientId === row.patient_id}
        >
          {anonymizingPatientId === row.patient_id ? 'Anonymising...' : 'Anonymise'}
        </Button>
      ),
    },
  ];

const handleSave = async () => {
    if (!isAdmin) {
      return;
    }
    setSaving(true);
    setSuccess(false);
    try {
      await apiClient.put('/api/settings/clinic', settings);
      setSuccess(true);
    } catch (err) {
      console.error('Failed to save settings', err);
      setError('Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const renderTwoFactorCard = () => (
    <Card>
      <CardContent>
        <Typography variant="h5" gutterBottom>
          Two-Factor Authentication
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Secure your account with an authenticator app before accessing patient or financial data.
        </Typography>
        <Typography variant="body1" sx={{ mt: 2 }}>
          Status:{' '}
          <strong>{twoFactorState.enabled ? 'Enabled' : 'Disabled'}</strong>
        </Typography>
        {twoFactorState.error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {twoFactorState.error}
          </Alert>
        )}
        {twoFactorState.success && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {twoFactorState.success}
          </Alert>
        )}
        {!twoFactorState.enabled ? (
          <Box mt={3} display="flex" flexDirection="column" gap={2}>
            <Button
              variant="contained"
              onClick={handleGenerateTwoFactorSecret}
              disabled={twoFactorState.loading}
            >
              {twoFactorState.secret ? 'Regenerate Setup Code' : 'Generate Setup Code'}
            </Button>
            {twoFactorState.secret && (
              <>
                <Typography variant="body2">
                  Secret Key:{' '}
                  <strong>{twoFactorState.secret}</strong>
                </Typography>
                {twoFactorState.otpauthUrl && (
                  <Typography variant="caption" color="text.secondary">
                    otpauth:// URI: {twoFactorState.otpauthUrl}
                  </Typography>
                )}
                <TextField
                  label="Authenticator Code"
                  value={twoFactorState.code}
                  onChange={(event) => setTwoFactorState((prev) => ({
                    ...prev,
                    code: event.target.value,
                  }))}
                  helperText="Enter the 6-digit code from your authenticator app to enable two-factor authentication."
                  fullWidth
                />
                <Button
                  variant="outlined"
                  onClick={handleVerifyTwoFactor}
                  disabled={twoFactorState.loading || !twoFactorState.code.trim()}
                >
                  Enable Two-Factor Authentication
                </Button>
              </>
            )}
          </Box>
        ) : (
          <Box mt={3} display="flex" flexDirection="column" gap={2}>
            <TextField
              label="Authenticator Code"
              value={twoFactorState.code}
              onChange={(event) => setTwoFactorState((prev) => ({
                ...prev,
                code: event.target.value,
              }))}
              helperText="Enter a current authenticator code to confirm disabling two-factor authentication."
              fullWidth
            />
            <Button
              variant="outlined"
              color="warning"
              onClick={handleDisableTwoFactor}
              disabled={twoFactorState.loading || !twoFactorState.code.trim()}
            >
              Disable Two-Factor Authentication
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  if (!isAdmin) {
    return (
      <Box display="flex" flexDirection="column" gap={3}>
        {renderTwoFactorCard()}
        <Alert severity="info">
          Clinic settings and templates can only be edited by administrators.
        </Alert>
      </Box>
    );
  }

  if (loading) {
    return <CircularProgress />;
  }

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }

  const branding = settings?.branding || {};
  const tax = settings?.tax || {};
  const notifications = settings?.notification_preferences || {};

  return (
    <Box display="flex" flexDirection="column" gap={3}>
      <Card>
        <CardContent>
        <Typography variant="h5" gutterBottom>
          Clinic Settings
        </Typography>
        <Divider sx={{ my: 2 }} />
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TextField
              label='Clinic Name'
              value={branding.clinic_name || ''}
              onChange={(event) => updateField('branding.clinic_name', event.target.value)}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label='Invoice Prefix'
              value={settings.invoice_prefix || ''}
              onChange={(event) => updateField('invoice_prefix', event.target.value)}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label='Clinic Email'
              value={branding.email || ''}
              onChange={(event) => updateField('branding.email', event.target.value)}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label='Clinic Phone'
              value={branding.phone || ''}
              onChange={(event) => updateField('branding.phone', event.target.value)}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label='Website'
              value={branding.website || ''}
              onChange={(event) => updateField('branding.website', event.target.value)}
              fullWidth
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label='Address'
              value={branding.address || ''}
              onChange={(event) => updateField('branding.address', event.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />
        <Typography variant="h6" gutterBottom>
          Tax & Finance
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <TextField
              label='Default Tax Rate (%)'
              type='number'
              value={tax.default_rate || 0}
              onChange={(event) => updateField('tax.default_rate', Number(event.target.value))}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label='Tax Registration Number'
              value={tax.registration_number || ''}
              onChange={(event) => updateField('tax.registration_number', event.target.value)}
              fullWidth
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />
        <Typography variant="h6" gutterBottom>
          Notifications
        </Typography>
        <FormControlLabel
          control={(
            <Switch
              checked={notifications.send_invoice_emails ?? true}
              onChange={(event) => updateField('notification_preferences.send_invoice_emails', event.target.checked)}
            />
          )}
          label="Send invoice emails automatically"
        />
        <FormControlLabel
          control={(
            <Switch
              checked={notifications.send_payment_reminders ?? true}
              onChange={(event) => updateField('notification_preferences.send_payment_reminders', event.target.checked)}
            />
          )}
          label="Send payment reminders"
        />
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TextField
              label='Reminder days before due'
              type='number'
              value={notifications.reminder_days_before_due ?? 3}
              onChange={(event) =>
                updateField('notification_preferences.reminder_days_before_due', Number(event.target.value))
              }
              fullWidth
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label='Reminder days after due'
              type='number'
              value={notifications.reminder_days_after_due ?? 5}
              onChange={(event) =>
                updateField('notification_preferences.reminder_days_after_due', Number(event.target.value))
              }
              fullWidth
            />
          </Grid>
        </Grid>

          <Box mt={3}>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
            {success && (
              <Typography variant="body2" color="success.main" sx={{ ml: 2, display: 'inline-block' }}>
                Settings saved
              </Typography>
            )}
          </Box>
      </CardContent>
    </Card>

      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Data Subject Requests
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Log and track GDPR data subject requests so that every access, rectification, or erasure request is fulfilled within one month.
          </Typography>
          <Box component="form" onSubmit={handleCreateDataRequest} mb={3} mt={2}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={2}>
                <TextField
                  label="Patient ID"
                  value={requestForm.patient_id}
                  onChange={handleRequestFormChange('patient_id')}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  select
                  label="Request Type"
                  value={requestForm.type}
                  onChange={handleRequestFormChange('type')}
                  fullWidth
                  required
                >
                  {REQUEST_TYPES.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Requester Name"
                  value={requestForm.requesterName}
                  onChange={handleRequestFormChange('requesterName')}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Requester Email"
                  type="email"
                  value={requestForm.requesterEmail}
                  onChange={handleRequestFormChange('requesterEmail')}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={9}>
                <TextField
                  label="Notes"
                  value={requestForm.notes}
                  onChange={handleRequestFormChange('notes')}
                  fullWidth
                  multiline
                  minRows={1}
                />
              </Grid>
              <Grid item xs={12} md={3} display="flex" alignItems="flex-end">
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={requestSaving}
                >
                  {requestSaving ? 'Logging...' : 'Log Request'}
                </Button>
              </Grid>
            </Grid>
          </Box>
          {requestError && (
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>
              {requestError}
            </Typography>
          )}
          {requestsLoading ? (
            <CircularProgress size={24} />
          ) : (
            <DataTable
              columns={requestColumns}
              rows={dataRequests}
              getRowId={(row) => row.request_id}
              maxHeight={360}
              emptyMessage="No data subject requests logged yet."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Retention Review
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Archived records that have reached the retention window and can be safely anonymised.
          </Typography>
          <Box display="flex" justifyContent="flex-end" mt={2} mb={2}>
            <Button
              size="small"
              variant="outlined"
              onClick={loadRetentionReport}
              disabled={retentionLoading}
            >
              {retentionLoading ? 'Refreshing...' : 'Refresh report'}
            </Button>
          </Box>
          {retentionError && (
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>
              {retentionError}
            </Typography>
          )}
          <DataTable
            columns={retentionColumns}
            rows={retentionRows}
            getRowId={(row) => row.patient_id}
            maxHeight={320}
            emptyMessage="No archived records are currently eligible for anonymisation."
          />
        </CardContent>
      </Card>
      {renderTwoFactorCard()}

      {canManageTemplates && (
        <Card id="treatment-note-templates">
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Box>
                <Typography variant="h5" gutterBottom>
                  Treatment Note Templates
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Create reusable note structures to speed up clinical documentation.
                </Typography>
              </Box>
              <Button variant="contained" onClick={openNewTemplateDialog}>
                New Template
              </Button>
            </Box>
            {templatesError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {templatesError}
              </Alert>
            )}
            {templatesLoading ? (
              <CircularProgress size={24} />
            ) : (
              <DataTable
                columns={templateColumns}
                rows={treatmentNoteTemplates}
                getRowId={(row) => row.id}
                maxHeight={400}
                emptyMessage="No templates yet."
              />
            )}
          </CardContent>
        </Card>
      )}

    <Card>
      <CardContent>
        <Typography variant="h5" gutterBottom>
            Services Catalogue
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Administrators can define default treatments/services and their baseline pricing.
          </Typography>
          <Box component="form" onSubmit={handleCreateService} mb={3}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={5}>
                <TextField
                  label="Service name"
                  value={serviceForm.treatment_description}
                  onChange={handleServiceFormChange('treatment_description')}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={6} md={3}>
                <TextField
                  label="Price"
                  type="number"
                  value={serviceForm.price}
                  onChange={handleServiceFormChange('price')}
                  fullWidth
                  required
                  inputProps={{ min: 0, step: 1 }}
                />
              </Grid>
              <Grid item xs={6} md={3}>
                <TextField
                  label="Duration (min)"
                  type="number"
                  value={serviceForm.duration_minutes}
                  onChange={handleServiceFormChange('duration_minutes')}
                  fullWidth
                  inputProps={{ min: 0, step: 5 }}
                />
              </Grid>
              <Grid item xs={12} md={1} display="flex" alignItems="center">
                <Button
                  type="submit"
                  variant="contained"
                  disabled={creatingService}
                  fullWidth
                >
                  {creatingService ? 'Adding...' : 'Add'}
                </Button>
              </Grid>
            </Grid>
          </Box>
          {serviceError && (
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>
              {serviceError}
            </Typography>
          )}
          {servicesLoading ? (
            <CircularProgress size={24} />
          ) : (
            <DataTable
              columns={serviceColumns}
              rows={services}
              getRowId={(row) => row.id}
              maxHeight={480}
              emptyMessage="No services configured."
            />
          )}
      </CardContent>
    </Card>
      {canManageTemplates && (
        <Dialog open={templateDialog.open} onClose={closeTemplateDialog} maxWidth="sm" fullWidth>
          <DialogTitle>{templateDialog.id ? 'Edit Template' : 'New Template'}</DialogTitle>
          <DialogContent dividers>
            <Box display="flex" flexDirection="column" gap={2}>
              <TextField
                label="Template Name"
                value={templateDialog.name}
                onChange={handleTemplateFieldChange('name')}
                required
              />
              <TextField
                label="Template Body"
                value={templateDialog.body}
                onChange={handleTemplateFieldChange('body')}
                multiline
                minRows={6}
                required
              />
              {templateDialogError && (
                <Alert severity="error">
                  {templateDialogError}
                </Alert>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeTemplateDialog} disabled={templateSaving} sx={{ color: '#fff' }}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={templateSaving} variant="contained">
              {templateSaving ? 'Saving...' : 'Save Template'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

export default Settings;
