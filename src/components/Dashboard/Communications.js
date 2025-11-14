import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Pagination,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import DataTable from '../common/DataTable';
import { UserContext } from '../../context/UserContext';
import apiClient from '../../utils/apiClient';
import useGpLetterTemplates from '../../hooks/useGpLetterTemplates';

const EMAIL_DIALOG_INITIAL = {
  open: false,
  index: null,
  values: {
    template_name: '',
    subject: '',
    body: '',
  },
  error: '',
};

const GP_DIALOG_INITIAL = {
  open: false,
  templateId: null,
  values: {
    name: '',
    category: '',
    body: '',
  },
  error: '',
};

const COMMUNICATION_TYPES = [
  { value: '', label: 'All channels' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'phone', label: 'Phone' },
  { value: 'in_person', label: 'In person' },
  { value: 'note', label: 'Internal note' },
];

const COMMUNICATION_STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Failed' },
  { value: 'suppressed', label: 'Suppressed' },
];

const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return `${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const trimPreview = (value, limit = 120) => {
  if (!value) {
    return '';
  }
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit)}…`;
};

const Communications = () => {
  const { userData } = useContext(UserContext);
  const isAdmin = userData?.role === 'admin';
  const canManageEmailTemplates = isAdmin;
  const canManageGpTemplates = ['admin', 'therapist'].includes(userData?.role);
  const canEditContactDetails = isAdmin;

  const [emailTemplates, setEmailTemplates] = useState([]);
  const [emailDialog, setEmailDialog] = useState(EMAIL_DIALOG_INITIAL);
  const [emailTemplatesLoading, setEmailTemplatesLoading] = useState(true);
  const [emailTemplatesError, setEmailTemplatesError] = useState('');
  const [savingEmailTemplates, setSavingEmailTemplates] = useState(false);
  const [emailSnack, setEmailSnack] = useState('');
  const [defaultEmailTemplates, setDefaultEmailTemplates] = useState([]);
  const [defaultTemplatesLoading, setDefaultTemplatesLoading] = useState(true);
  const [defaultTemplatesError, setDefaultTemplatesError] = useState('');
  const [previewDialog, setPreviewDialog] = useState({ open: false, template: null });
  const [contactForm, setContactForm] = useState({
    clinic_name: '',
    phone: '',
    email: '',
    website: '',
    address: '',
    privacy_policy_url: '',
    cancellation_policy_url: '',
  });
  const [contactSaving, setContactSaving] = useState(false);
  const [contactSnack, setContactSnack] = useState('');
  const [contactError, setContactError] = useState('');

  const [communicationsFilters, setCommunicationsFilters] = useState({
    search: '',
    type: '',
    status: '',
    from: '',
    to: '',
  });
  const [communicationsPage, setCommunicationsPage] = useState(1);
  const [communicationsState, setCommunicationsState] = useState({
    loading: false,
    error: '',
    rows: [],
    total: 0,
  });
  const [logRefreshToken, setLogRefreshToken] = useState(0);
  const rowsPerPage = 25;

  const {
    templates: gpTemplates,
    loading: gpTemplatesLoading,
    error: gpTemplatesError,
    refresh: refreshGpTemplates,
    createTemplate: createGpTemplate,
    updateTemplate: updateGpTemplate,
    deleteTemplate: deleteGpTemplate,
  } = useGpLetterTemplates({ enabled: canManageGpTemplates });

  const [gpDialog, setGpDialog] = useState(GP_DIALOG_INITIAL);
  const [gpDialogSaving, setGpDialogSaving] = useState(false);
  const [gpSnack, setGpSnack] = useState('');
  const [draftTemplateId, setDraftTemplateId] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftHelper, setDraftHelper] = useState('');

  const selectedDraftTemplate = useMemo(
    () => gpTemplates.find((template) => template.id === draftTemplateId) || null,
    [gpTemplates, draftTemplateId],
  );

  useEffect(() => {
    if (selectedDraftTemplate) {
      setDraftBody(selectedDraftTemplate.body || '');
    }
  }, [selectedDraftTemplate]);

  const loadEmailTemplates = useCallback(async () => {
    setEmailTemplatesLoading(true);
    try {
      const response = await apiClient.get('/api/settings/clinic');
      const settings = response.data.settings || {};
      const templates = settings.email_templates || [];
      setEmailTemplates(templates);
      setEmailTemplatesError('');
      const branding = settings.branding || {};
      setContactForm({
        clinic_name: branding.clinic_name || '',
        phone: branding.phone || '',
        email: branding.email || '',
        website: branding.website || '',
        address: branding.address || '',
        privacy_policy_url: branding.privacy_policy_url || '',
        cancellation_policy_url: branding.cancellation_policy_url || '',
      });
    } catch (err) {
      console.error('Failed to load email templates', err);
      setEmailTemplatesError(err?.response?.data?.message || 'Unable to load email templates.');
    } finally {
      setEmailTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmailTemplates();
  }, [loadEmailTemplates]);

  const loadDefaultEmailTemplates = useCallback(async () => {
    setDefaultTemplatesLoading(true);
    try {
      const response = await apiClient.get('/api/settings/email-templates/preview');
      setDefaultEmailTemplates(response.data.templates || []);
      setDefaultTemplatesError('');
    } catch (err) {
      console.error('Failed to load system email templates', err);
      setDefaultTemplatesError(err?.response?.data?.message || 'Unable to load system templates.');
    } finally {
      setDefaultTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDefaultEmailTemplates();
  }, [loadDefaultEmailTemplates]);

  const closeEmailDialog = () => {
    setEmailDialog(EMAIL_DIALOG_INITIAL);
  };

  const openEmailDialog = (template, index = null) => {
    if (!canManageEmailTemplates) {
      return;
    }
    setEmailDialog({
      open: true,
      index,
      values: template || { template_name: '', subject: '', body: '' },
      error: '',
    });
  };

  const saveEmailTemplates = async (nextTemplates) => {
    if (!canManageEmailTemplates) {
      return;
    }
    setSavingEmailTemplates(true);
    try {
    const sanitized = nextTemplates.map((template) => ({
      template_name: template.template_name?.trim() || 'Untitled template',
      subject: template.subject?.trim() || 'Subject',
      body: template.body || '',
    }));
      await apiClient.put('/api/settings/clinic', { email_templates: sanitized });
      await loadEmailTemplates();
      setEmailSnack('Email templates saved.');
      setEmailDialog(EMAIL_DIALOG_INITIAL);
    } catch (err) {
      console.error('Failed to save email templates', err);
      setEmailDialog((prev) => ({
        ...prev,
        error: err?.response?.data?.message || 'Unable to save templates.',
      }));
    } finally {
      setSavingEmailTemplates(false);
    }
  };

  const handleEmailDialogSave = () => {
    const { values, index } = emailDialog;
    if (!values.template_name?.trim() || !values.body?.trim()) {
      setEmailDialog((prev) => ({
        ...prev,
        error: 'Template name and body are required.',
      }));
      return;
    }
    const nextTemplates = [...emailTemplates];
    const payload = {
      template_name: values.template_name.trim(),
      subject: values.subject?.trim() || '',
      body: values.body,
    };
    if (index === null || index === undefined || index < 0) {
      nextTemplates.unshift(payload);
    } else {
      nextTemplates[index] = payload;
    }
    saveEmailTemplates(nextTemplates);
  };

  const handleDeleteEmailTemplate = (index) => {
    if (!canManageEmailTemplates) {
      return;
    }
    const nextTemplates = emailTemplates.filter((_, idx) => idx !== index);
    saveEmailTemplates(nextTemplates);
  };

  const openGpDialog = (template) => {
    if (!canManageGpTemplates) {
      return;
    }
    setGpDialog({
      open: true,
      templateId: template?.id || null,
      values: {
        name: template?.name || '',
        category: template?.category || '',
        body: template?.body || '',
      },
      error: '',
    });
  };

  const closeGpDialog = () => {
    setGpDialog(GP_DIALOG_INITIAL);
  };

  const handleSaveGpTemplate = async () => {
    if (!gpDialog.values.name?.trim() || !gpDialog.values.body?.trim()) {
      setGpDialog((prev) => ({
        ...prev,
        error: 'Template name and letter body are required.',
      }));
      return;
    }
    setGpDialogSaving(true);
    try {
      const payload = {
        name: gpDialog.values.name.trim(),
        category: gpDialog.values.category?.trim() || '',
        body: gpDialog.values.body,
      };
      if (gpDialog.templateId) {
        await updateGpTemplate(gpDialog.templateId, payload);
      } else {
        await createGpTemplate(payload);
      }
      setGpSnack('GP letter template saved.');
      closeGpDialog();
    } catch (err) {
      console.error('Failed to save GP letter template', err);
      setGpDialog((prev) => ({
        ...prev,
        error: err?.response?.data?.message || 'Unable to save template.',
      }));
    } finally {
      setGpDialogSaving(false);
    }
  };

  const deleteTemplateWithConfirm = async (templateId) => {
    await deleteGpTemplate(templateId);
    setGpSnack('Template deleted.');
  };

  const handleDeleteGpTemplate = async (templateId) => {
    if (!canManageGpTemplates) {
      return;
    }
    try {
      await deleteTemplateWithConfirm(templateId);
    } catch (error) {
      console.error(error);
    }
  };

  const handleCopyDraft = async () => {
    if (!draftBody.trim()) {
      setDraftHelper('Add some content before copying.');
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(draftBody);
        setDraftHelper('Copied to clipboard');
      } else {
        setDraftHelper('Clipboard access is not available in this browser.');
      }
    } catch (err) {
      console.error('Failed to copy draft', err);
      setDraftHelper('Unable to copy to clipboard.');
    }
  };

  const handleCommunicationsFilterChange = (field) => (event) => {
    setCommunicationsFilters((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
    setCommunicationsPage(1);
  };

  const fetchCommunications = useCallback(async () => {
    setCommunicationsState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const params = {
        ...communicationsFilters,
        limit: rowsPerPage,
        offset: (communicationsPage - 1) * rowsPerPage,
      };
      const response = await apiClient.get('/api/communications', { params });
      setCommunicationsState({
        loading: false,
        error: '',
        rows: response.data?.communications || [],
        total: response.data?.total ?? 0,
      });
    } catch (err) {
      console.error('Failed to load communications log', err);
      setCommunicationsState((prev) => ({
        ...prev,
        loading: false,
        error: err?.response?.data?.message || 'Unable to load communications log.',
      }));
    }
  }, [communicationsFilters, communicationsPage]);

  useEffect(() => {
    fetchCommunications();
  }, [fetchCommunications, logRefreshToken]);

  const handleRefreshCommunications = () => {
    setLogRefreshToken((prev) => prev + 1);
  };

  const emailTemplateColumns = useMemo(() => {
    const columns = [
      {
        id: 'template_name',
        label: 'Template',
        minWidth: 160,
      },
      {
        id: 'subject',
        label: 'Subject',
        minWidth: 200,
      },
      {
        id: 'body',
        label: 'Preview',
        minWidth: 240,
        render: (row) => (
          <Typography variant="body2" color="text.secondary">
            {trimPreview(row.body)}
          </Typography>
        ),
      },
    ];
    if (canManageEmailTemplates) {
      columns.push({
        id: 'actions',
        label: 'Actions',
        minWidth: 140,
        align: 'right',
        sortable: false,
        filterable: false,
        render: (row) => {
          const rowIndex = emailTemplates.findIndex((template) => template === row);
          return (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Tooltip title="Edit template">
                <span>
                  <IconButton size="small" onClick={() => openEmailDialog(row, rowIndex)}>
                    <EditIcon fontSize="inherit" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Delete template">
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDeleteEmailTemplate(rowIndex)}
                  >
                    <DeleteIcon fontSize="inherit" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          );
        },
      });
    }
    return columns;
  }, [canManageEmailTemplates, emailTemplates]);

  const gpTemplateColumns = useMemo(() => {
    const columns = [
      {
        id: 'name',
        label: 'Template',
        minWidth: 160,
      },
      {
        id: 'category',
        label: 'Category',
        minWidth: 160,
        render: (row) => row.category || 'General',
      },
      {
        id: 'body',
        label: 'Preview',
        minWidth: 260,
        render: (row) => (
          <Typography variant="body2" color="text.secondary">
            {trimPreview(row.body)}
          </Typography>
        ),
      },
    ];
    if (canManageGpTemplates) {
      columns.push({
        id: 'actions',
        label: 'Actions',
        align: 'right',
        minWidth: 140,
        sortable: false,
        filterable: false,
        render: (row) => (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Tooltip title="Edit template">
              <span>
                <IconButton size="small" onClick={() => openGpDialog(row)}>
                  <EditIcon fontSize="inherit" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Delete template">
              <span>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleDeleteGpTemplate(row.id)}
                >
                  <DeleteIcon fontSize="inherit" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        ),
      });
    }
    return columns;
  }, [canManageGpTemplates]);

  const communicationsColumns = useMemo(() => [
    {
      id: 'date',
      label: 'Sent',
      minWidth: 160,
      valueGetter: (row) => row.date,
      render: (row) => formatDateTime(row.date),
    },
    {
      id: 'type',
      label: 'Channel',
      minWidth: 120,
      render: (row) => (
        <Chip
          size="small"
          label={row.type ? row.type.replace('_', ' ') : 'n/a'}
          sx={{ textTransform: 'capitalize' }}
        />
      ),
    },
    {
      id: 'subject',
      label: 'Subject / Summary',
      minWidth: 220,
      render: (row) => (
        <Box>
          <Typography variant="body2">{row.subject || '—'}</Typography>
          <Typography variant="caption" color="text.secondary">
            {trimPreview(row.content, 100)}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'patient',
      label: 'Patient',
      minWidth: 180,
      render: (row) => {
        const patient = row.patient || {};
        const nameParts = [patient.first_name, patient.surname].filter(Boolean).join(' ').trim();
        return (
          <Typography variant="body2">
            {nameParts || patient.preferred_name || `#${patient.patient_id || row.patient_id}`}
          </Typography>
        );
      },
    },
    {
      id: 'delivery_status',
      label: 'Status',
      minWidth: 140,
      render: (row) => (
        <Chip
          size="small"
          color={row.delivery_status === 'failed' ? 'error' : (row.delivery_status === 'delivered' ? 'success' : 'default')}
          label={row.delivery_status ? row.delivery_status.replace('_', ' ') : 'Unknown'}
          sx={{ textTransform: 'capitalize' }}
        />
      ),
    },
  ], []);

  const totalPages = Math.max(1, Math.ceil((communicationsState.total || 0) / rowsPerPage));

  const defaultTemplateColumns = useMemo(() => [
    {
      id: 'label',
      label: 'Template',
      minWidth: 220,
      render: (row) => (
        <Box>
          <Typography variant="body2" fontWeight={600}>{row.label}</Typography>
          <Typography variant="caption" color="text.secondary">{row.description}</Typography>
        </Box>
      ),
    },
    {
      id: 'subject',
      label: 'Subject',
      minWidth: 220,
    },
    {
      id: 'actions',
      label: 'Actions',
      minWidth: 120,
      align: 'right',
      sortable: false,
      filterable: false,
      render: (row) => (
        <Button
          size="small"
          variant="outlined"
          onClick={() => setPreviewDialog({ open: true, template: row })}
        >
          View
        </Button>
      ),
    },
  ], []);

  const handleContactFieldChange = (field) => (event) => {
    const { value } = event.target;
    setContactForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    setContactError('');
  };

  const handleSaveContact = async () => {
    if (!canEditContactDetails) {
      return;
    }
    setContactSaving(true);
    try {
      await apiClient.put('/api/settings/clinic', { branding: contactForm });
      setContactSnack('Contact details updated.');
      await loadEmailTemplates();
    } catch (err) {
      console.error('Failed to update contact details', err);
      setContactError(err?.response?.data?.message || 'Unable to save contact details.');
    } finally {
      setContactSaving(false);
    }
  };

  return (
    <Box display="flex" flexDirection="column" gap={3}>
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
            <Typography variant="h5">Email Templates</Typography>
            {canManageEmailTemplates && (
              <Button startIcon={<AddIcon />} variant="contained" onClick={() => openEmailDialog(null)}>
                New template
              </Button>
            )}
          </Box>
          {emailTemplatesError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {emailTemplatesError}
            </Alert>
          )}
          {emailTemplatesLoading ? (
            <CircularProgress size={24} />
          ) : (
            <DataTable
              columns={emailTemplateColumns}
              rows={emailTemplates}
              getRowId={(row, index) => `${row.template_name}-${index}`}
              maxHeight={360}
              emptyMessage="No templates configured."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Standard patient communications
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            These templates power booking confirmations, invoices, and cancellation emails.
          </Typography>
          {defaultTemplatesError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {defaultTemplatesError}
            </Alert>
          )}
          {defaultTemplatesLoading ? (
            <CircularProgress size={24} />
          ) : (
            <DataTable
              columns={defaultTemplateColumns}
              rows={defaultEmailTemplates}
              getRowId={(row) => row.id}
              maxHeight={360}
              emptyMessage="No templates available."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Contact details & policy links
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Update the contact lines and helpful links that appear across your patient emails.
          </Typography>
          {contactError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {contactError}
            </Alert>
          )}
          <Grid container spacing={2} mt={1}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Clinic name"
                value={contactForm.clinic_name}
                onChange={handleContactFieldChange('clinic_name')}
                fullWidth
                InputProps={{ readOnly: !canEditContactDetails }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Phone number"
                value={contactForm.phone}
                onChange={handleContactFieldChange('phone')}
                fullWidth
                InputProps={{ readOnly: !canEditContactDetails }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Contact email"
                value={contactForm.email}
                onChange={handleContactFieldChange('email')}
                fullWidth
                InputProps={{ readOnly: !canEditContactDetails }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Website"
                value={contactForm.website}
                onChange={handleContactFieldChange('website')}
                fullWidth
                InputProps={{ readOnly: !canEditContactDetails }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Address"
                value={contactForm.address}
                onChange={handleContactFieldChange('address')}
                fullWidth
                multiline
                minRows={2}
                InputProps={{ readOnly: !canEditContactDetails }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Privacy policy URL"
                value={contactForm.privacy_policy_url}
                onChange={handleContactFieldChange('privacy_policy_url')}
                fullWidth
                InputProps={{ readOnly: !canEditContactDetails }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Cancellation policy URL"
                value={contactForm.cancellation_policy_url}
                onChange={handleContactFieldChange('cancellation_policy_url')}
                fullWidth
                InputProps={{ readOnly: !canEditContactDetails }}
              />
            </Grid>
          </Grid>
          {canEditContactDetails && (
            <Box display="flex" justifyContent="flex-end" mt={2}>
              <Button variant="contained" onClick={handleSaveContact} disabled={contactSaving}>
                {contactSaving ? 'Saving...' : 'Save contact details'}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
            <Typography variant="h5">GP Letter Templates</Typography>
            {canManageGpTemplates && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => openGpDialog(null)}>
                New letter template
              </Button>
            )}
          </Box>
          {gpTemplatesError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {gpTemplatesError}
            </Alert>
          )}
          {gpTemplatesLoading ? (
            <CircularProgress size={24} />
          ) : (
            <DataTable
              columns={gpTemplateColumns}
              rows={gpTemplates}
              getRowId={(row) => row.id}
              maxHeight={360}
              emptyMessage="No GP letter templates saved yet."
            />
          )}
          <Divider sx={{ my: 3 }} />
          <Typography variant="h6" gutterBottom>
            Draft a GP letter
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Autocomplete
                options={gpTemplates}
                getOptionLabel={(option) => option?.name || ''}
                value={selectedDraftTemplate}
                onChange={(event, value) => setDraftTemplateId(value?.id || '')}
                renderInput={(params) => (
                  <TextField {...params} label="Start from template" placeholder="Choose template" />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Letter body"
                multiline
                minRows={6}
                value={draftBody}
                onChange={(event) => {
                  setDraftBody(event.target.value);
                  setDraftHelper('');
                }}
                fullWidth
                placeholder="Write your GP letter here..."
              />
              <Box display="flex" justifyContent="space-between" alignItems="center" mt={1} flexWrap="wrap" gap={1}>
                <Typography variant="body2" color="text.secondary">
                  Use the selected template as a starting point, then personalise before copying into your preferred document editor.
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={<ContentCopyIcon fontSize="small" />}
                  onClick={handleCopyDraft}
                >
                  Copy to clipboard
                </Button>
              </Box>
              {draftHelper && (
                <Typography variant="caption" color="text.secondary">
                  {draftHelper}
                </Typography>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
            <Typography variant="h5">Communications Log</Typography>
            <Button
              startIcon={<RefreshIcon />}
              variant="outlined"
              onClick={handleRefreshCommunications}
            >
              Refresh
            </Button>
          </Box>
          <Grid container spacing={2} mb={2}>
            <Grid item xs={12} md={4}>
              <TextField
                label="Search"
                placeholder="Patient ID, subject, or keyword"
                value={communicationsFilters.search}
                onChange={handleCommunicationsFilterChange('search')}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                select
                label="Channel"
                value={communicationsFilters.type}
                onChange={handleCommunicationsFilterChange('type')}
                fullWidth
              >
                {COMMUNICATION_TYPES.map((option) => (
                  <MenuItem key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                select
                label="Status"
                value={communicationsFilters.status}
                onChange={handleCommunicationsFilterChange('status')}
                fullWidth
              >
                {COMMUNICATION_STATUSES.map((option) => (
                  <MenuItem key={option.value || 'all-status'} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                type="date"
                label="From"
                InputLabelProps={{ shrink: true }}
                value={communicationsFilters.from}
                onChange={handleCommunicationsFilterChange('from')}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                type="date"
                label="To"
                InputLabelProps={{ shrink: true }}
                value={communicationsFilters.to}
                onChange={handleCommunicationsFilterChange('to')}
                fullWidth
              />
            </Grid>
          </Grid>
          {communicationsState.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {communicationsState.error}
            </Alert>
          )}
          <DataTable
            columns={communicationsColumns}
            rows={communicationsState.rows}
            getRowId={(row) => row.communication_id || row._id}
            loading={communicationsState.loading}
            maxHeight={420}
            emptyMessage="No communications found for your filters."
            defaultOrderBy="date"
            defaultOrder="desc"
          />
          <Box display="flex" justifyContent="flex-end" mt={2}>
            <Pagination
              count={totalPages}
              color="primary"
              page={communicationsPage}
              onChange={(event, value) => setCommunicationsPage(value)}
              shape="rounded"
              showFirstButton
              showLastButton
            />
          </Box>
        </CardContent>
      </Card>

      <Dialog
        open={emailDialog.open}
        onClose={closeEmailDialog}
        fullWidth
        maxWidth="sm"
      >
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6">
            {emailDialog.index === null ? 'Create email template' : 'Edit email template'}
          </Typography>
          <TextField
            label="Template name"
            value={emailDialog.values.template_name}
            onChange={(event) => setEmailDialog((prev) => ({
              ...prev,
              values: {
                ...prev.values,
                template_name: event.target.value,
              },
              error: '',
            }))}
            fullWidth
          />
          <TextField
            label="Subject line"
            value={emailDialog.values.subject}
            onChange={(event) => setEmailDialog((prev) => ({
              ...prev,
              values: {
                ...prev.values,
                subject: event.target.value,
              },
            }))}
            fullWidth
          />
          <TextField
            label="Email body"
            value={emailDialog.values.body}
            onChange={(event) => setEmailDialog((prev) => ({
              ...prev,
              values: {
                ...prev.values,
                body: event.target.value,
              },
              error: '',
            }))}
            multiline
            minRows={6}
            fullWidth
          />
          {emailDialog.error && (
            <Alert severity="error">{emailDialog.error}</Alert>
          )}
          <Box display="flex" justifyContent="flex-end" gap={1}>
            <Button onClick={closeEmailDialog}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleEmailDialogSave}
              disabled={savingEmailTemplates}
            >
              {savingEmailTemplates ? 'Saving...' : 'Save template'}
            </Button>
          </Box>
        </CardContent>
      </Dialog>

      <Dialog
        open={gpDialog.open}
        onClose={closeGpDialog}
        fullWidth
        maxWidth="sm"
      >
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6">
            {gpDialog.templateId ? 'Edit GP letter template' : 'Create GP letter template'}
          </Typography>
          <TextField
            label="Template name"
            value={gpDialog.values.name}
            onChange={(event) => setGpDialog((prev) => ({
              ...prev,
              values: { ...prev.values, name: event.target.value },
              error: '',
            }))}
            fullWidth
          />
          <TextField
            label="Category"
            value={gpDialog.values.category}
            onChange={(event) => setGpDialog((prev) => ({
              ...prev,
              values: { ...prev.values, category: event.target.value },
            }))}
            fullWidth
          />
          <TextField
            label="Letter template"
            value={gpDialog.values.body}
            onChange={(event) => setGpDialog((prev) => ({
              ...prev,
              values: { ...prev.values, body: event.target.value },
              error: '',
            }))}
            fullWidth
            multiline
            minRows={6}
          />
          {gpDialog.error && (
            <Alert severity="error">{gpDialog.error}</Alert>
          )}
          <Box display="flex" justifyContent="flex-end" gap={1}>
            <Button onClick={closeGpDialog}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleSaveGpTemplate}
              disabled={gpDialogSaving}
            >
              {gpDialogSaving ? 'Saving...' : 'Save template'}
            </Button>
          </Box>
        </CardContent>
      </Dialog>

      <Snackbar
        open={Boolean(emailSnack)}
        autoHideDuration={4000}
        onClose={() => setEmailSnack('')}
      >
        <Alert severity="success" onClose={() => setEmailSnack('')}>
          {emailSnack}
        </Alert>
      </Snackbar>
      <Snackbar
        open={Boolean(gpSnack)}
        autoHideDuration={4000}
        onClose={() => setGpSnack('')}
      >
        <Alert severity="success" onClose={() => setGpSnack('')}>
          {gpSnack}
        </Alert>
      </Snackbar>
      <Snackbar
        open={Boolean(contactSnack)}
        autoHideDuration={4000}
        onClose={() => setContactSnack('')}
      >
        <Alert severity="success" onClose={() => setContactSnack('')}>
          {contactSnack}
        </Alert>
      </Snackbar>

      <Dialog
        open={previewDialog.open}
        onClose={() => setPreviewDialog({ open: false, template: null })}
        fullWidth
        maxWidth="md"
      >
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6">{previewDialog.template?.label || 'Template preview'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {previewDialog.template?.description}
          </Typography>
          <TextField
            label="Subject"
            value={previewDialog.template?.subject || ''}
            InputProps={{ readOnly: true }}
            fullWidth
          />
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              p: 2,
              maxHeight: 400,
              overflowY: 'auto',
              backgroundColor: 'background.paper',
            }}
          >
            <div
              dangerouslySetInnerHTML={{ __html: previewDialog.template?.html || '<p>No preview available.</p>' }}
            />
          </Box>
          <Box display="flex" justifyContent="flex-end">
            <Button onClick={() => setPreviewDialog({ open: false, template: null })}>
              Close
            </Button>
          </Box>
        </CardContent>
      </Dialog>
    </Box>
  );
};

export default Communications;
