import React, {
  useEffect,
  useState,
  useMemo,
  useContext,
  useCallback,
} from 'react';
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Typography,
  Divider,
  TextField,
  Button,
  MenuItem,
  FormControlLabel,
  Switch,
  Alert,
  Snackbar,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import { makeStyles } from '@mui/styles';
import { Link as RouterLink, useParams } from 'react-router-dom';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import apiClient from '../../utils/apiClient';
import { UserContext } from '../../context/UserContext';
import { AppointmentsContext } from '../../context/AppointmentsContext';
import DataTable from '../common/DataTable';
import useTreatmentNoteTemplates from '../../hooks/useTreatmentNoteTemplates';
import useTherapists from '../../hooks/useTherapists';

const useStyles = makeStyles((theme) => ({
  section: {
    marginBottom: theme.spacing(3),
  },
  tableContainer: {
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[1],
  },
  formRow: {
    marginTop: theme.spacing(2),
  },
  fullWidth: {
    width: '100%',
  },
}));

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const BILLING_MODE_OPTIONS = [
  { value: 'individual', label: 'Individual billing' },
  { value: 'monthly', label: 'Monthly billing' },
];

const normalizedStatus = (value) => {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (normalized === 'archived' || normalized === 'inactive') {
    return 'archived';
  }
  return 'active';
};

const createEmptyFormState = () => ({
  first_name: '',
  surname: '',
  preferred_name: '',
  email: '',
  phone: '',
  status: 'active',
  date_of_birth: '',
  primaryTherapistId: '',
  billing_mode: 'individual',
  email_active: true,
  address_line1: '',
  address_line2: '',
  address_city: '',
  address_state: '',
  address_postcode: '',
  primary_contact_name: '',
  primary_contact_email: '',
  primary_contact_phone: '',
});

const currencyDisplay = (value, currency = 'GBP') => `${currency} ${Number(value || 0).toFixed(2)}`;

const PatientDetails = () => {
  const classes = useStyles();
  const { id } = useParams();
  const { userData } = useContext(UserContext);
  const { refreshAppointments } = useContext(AppointmentsContext);
  const canEditNotes = ['admin', 'therapist'].includes(userData?.role);
  const canEditPatient = ['admin', 'receptionist'].includes(userData?.role);
  const canArchivePatient = userData?.role === 'admin';

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [selectedTreatmentId, setSelectedTreatmentId] = useState('');
  const [treatmentNote, setTreatmentNote] = useState('');
  const [savingTreatmentNote, setSavingTreatmentNote] = useState(false);
  const [treatmentNoteSuccess, setTreatmentNoteSuccess] = useState('');
  const [treatmentNoteError, setTreatmentNoteError] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [saveTemplateDialog, setSaveTemplateDialog] = useState({ open: false, name: '' });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveTemplateError, setSaveTemplateError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState('');
  const [exportError, setExportError] = useState('');
  const [formState, setFormState] = useState(() => createEmptyFormState());
  const [formErrors, setFormErrors] = useState({});
  const [savingPatient, setSavingPatient] = useState(false);
  const [patientToast, setPatientToast] = useState({ message: '', severity: 'success' });
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingPatient, setArchivingPatient] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const { therapists, loading: therapistsLoading, error: therapistsError } = useTherapists();

  const patient = details?.patient || null;
  const treatments = details?.treatments || [];
  const invoices = details?.invoices || [];
  const notes = details?.notes || [];
  const communications = details?.communications || [];
  const canExportPatient = userData?.role === 'admin';
  const {
    templates: noteTemplates,
    loading: templatesLoading,
    error: templatesFetchError,
    refreshTemplates: refreshNoteTemplates,
  } = useTreatmentNoteTemplates({ enabled: canEditNotes });
  const therapistOptions = useMemo(() => therapists, [therapists]);

  const mapPatientToFormState = useCallback((patientData) => {
    if (!patientData) {
      return createEmptyFormState();
    }
    const rawTherapistId = patientData.primaryTherapist?._id || patientData.primaryTherapist?.id;
    const therapistId = rawTherapistId && rawTherapistId.toString ? rawTherapistId.toString() : rawTherapistId;
    return {
      ...createEmptyFormState(),
      first_name: patientData.first_name || '',
      surname: patientData.surname || '',
      preferred_name: patientData.preferred_name || '',
      email: patientData.email || '',
      phone: patientData.phone || '',
      status: normalizedStatus(patientData.status),
      date_of_birth: patientData.date_of_birth
        ? new Date(patientData.date_of_birth).toISOString().split('T')[0]
        : '',
      primaryTherapistId: therapistId ? String(therapistId) : '',
      billing_mode: patientData.billing_mode || 'individual',
      email_active: patientData.email_active !== false,
      address_line1: patientData.address?.line1 || '',
      address_line2: patientData.address?.line2 || '',
      address_city: patientData.address?.city || '',
      address_state: patientData.address?.state || '',
      address_postcode: patientData.address?.postcode || '',
      primary_contact_name: patientData.primary_contact_name || '',
      primary_contact_email: patientData.primary_contact_email || '',
      primary_contact_phone: patientData.primary_contact_phone || '',
    };
  }, []);

  useEffect(() => {
    if (patient) {
      setFormState(mapPatientToFormState(patient));
      setFormErrors({});
    }
  }, [patient, mapPatientToFormState]);

  const primaryTherapistSelection = useMemo(
    () => therapistOptions.find((therapist) => therapist.id === formState.primaryTherapistId) || null,
    [therapistOptions, formState.primaryTherapistId],
  );

  const patientDisplayName = useMemo(() => {
    const nameParts = [formState.first_name, formState.surname]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean);
    if (nameParts.length) {
      return nameParts.join(' ');
    }
    if (typeof formState.preferred_name === 'string' && formState.preferred_name.trim()) {
      return formState.preferred_name.trim();
    }
    if (patient?.patient_id) {
      return `Patient #${patient.patient_id}`;
    }
    return 'Patient';
  }, [formState, patient]);

  const nextAppointment = useMemo(() => {
    if (!treatments.length) {
      return null;
    }
    return (
      [...treatments]
        .filter((appt) => appt.status === 'scheduled')
        .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null
    );
  }, [treatments]);

  const validatePatientForm = useCallback(() => {
    const errors = {};
    if (!formState.first_name.trim()) {
      errors.first_name = 'First name is required';
    }
    if (!formState.surname.trim()) {
      errors.surname = 'Surname is required';
    }
    if (!formState.email.trim()) {
      errors.email = 'Email is required';
    }
    if (!formState.phone.trim()) {
      errors.phone = 'Phone is required';
    }
    if (!formState.status) {
      errors.status = 'Status is required';
    } else if (!STATUS_OPTIONS.some((option) => option.value === formState.status)) {
      errors.status = 'Status must be Active or Archived';
    }
    return errors;
  }, [formState]);

  const handleFormFieldChange = (field, value) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const loadDetails = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/patients/${id}`);
      const payload = response.data || {};
      setDetails({
        patient: payload.patient,
        treatments: payload.treatments || [],
        invoices: payload.invoices || [],
        notes: payload.notes || [],
        communications: payload.communications || [],
      });
      setError(null);
    } catch (err) {
      console.error('Failed to load patient details', err);
      setError('Unable to load patient details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [id]);

  useEffect(() => {
    if (!selectedTreatmentId || treatments.length === 0) {
      setTreatmentNote('');
      return;
    }
    const treatment = treatments.find(
      (appt) => String(appt.appointment_id) === String(selectedTreatmentId),
    );
    if (treatment) {
      setTreatmentNote(treatment.treatment_notes || '');
    }
  }, [selectedTreatmentId, treatments]);

  const handleAddPatientNote = async () => {
    if (!newNote.trim() || !patient) {
      return;
    }
    setSavingNote(true);
    try {
      const response = await apiClient.post('/api/notes', {
        patient_id: patient.patient_id,
        note: newNote,
        date: new Date(),
      });
      const created = response.data?.note;
      if (created) {
        setDetails((prev) => ({
          ...prev,
          notes: [created, ...(prev?.notes || [])],
        }));
        setNewNote('');
      }
    } catch (err) {
      console.error('Failed to add patient note', err);
    } finally {
      setSavingNote(false);
    }
  };

  const handleExportPatient = async () => {
    if (!patient) {
      return;
    }
    setExporting(true);
    try {
      const response = await apiClient.get(`/api/patients/${patient.patient_id}/export`);
      const payload = response.data?.export || response.data;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `patient-${patient.patient_id}-export.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setExportSuccess('Patient export ready to download.');
    } catch (err) {
      console.error('Failed to export patient', err);
      setExportError(err?.response?.data?.message || 'Unable to export patient data.');
    } finally {
      setExporting(false);
    }
  };

  const handleSavePatientRecord = async () => {
    if (!patient || !canEditPatient) {
      return;
    }
    const validationErrors = validatePatientForm();
    if (Object.keys(validationErrors).length) {
      setFormErrors(validationErrors);
      return;
    }
    setSavingPatient(true);
    setPatientToast((prev) => ({ ...prev, message: '' }));
    try {
      const payload = {
        ...formState,
        status: normalizedStatus(formState.status),
        primaryTherapistId: formState.primaryTherapistId || undefined,
        date_of_birth: formState.date_of_birth || undefined,
        primary_contact_name: formState.primary_contact_name.trim() || undefined,
        primary_contact_email: formState.primary_contact_email.trim() || undefined,
        primary_contact_phone: formState.primary_contact_phone.trim() || undefined,
      };
      payload.billing_mode = formState.billing_mode || 'individual';
      payload.email_active = formState.email_active !== false;
      const addressPayload = {
        line1: formState.address_line1.trim(),
        line2: formState.address_line2.trim(),
        city: formState.address_city.trim(),
        state: formState.address_state.trim(),
        postcode: formState.address_postcode.trim(),
      };
      const hasAddress = Object.values(addressPayload).some(Boolean);
      const shouldClearAddress = Boolean(patient.address) && !hasAddress;
      if (hasAddress) {
        payload.address = addressPayload;
      } else if (shouldClearAddress) {
        payload.address = null;
      }
      [
        'address_line1',
        'address_line2',
        'address_city',
        'address_state',
        'address_postcode',
      ].forEach((field) => {
        delete payload[field];
      });
      const response = await apiClient.put(`/api/patients/${patient.patient_id}`, payload);
      const updatedPatient = response?.data?.patient;
      if (updatedPatient) {
        setDetails((prev) => ({
          ...prev,
          patient: updatedPatient,
        }));
        setFormState(mapPatientToFormState(updatedPatient));
      }
      setPatientToast({ message: 'Patient updated successfully', severity: 'success' });
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to update patient';
      setPatientToast({ message, severity: 'error' });
    } finally {
      setSavingPatient(false);
    }
  };

  const handleResetPatientForm = () => {
    if (!patient) {
      setFormState(createEmptyFormState());
      setFormErrors({});
      return;
    }
    setFormErrors({});
    setFormState(mapPatientToFormState(patient));
  };

  const closeArchiveDialog = () => {
    if (archivingPatient) {
      return;
    }
    setArchiveDialogOpen(false);
    setArchiveError('');
  };

  const handleArchivePatient = async () => {
    if (!patient || !canArchivePatient) {
      return;
    }
    setArchivingPatient(true);
    setArchiveError('');
    try {
      const response = await apiClient.delete(`/api/patients/${patient.patient_id}`);
      const updatedPatient = response?.data?.patient;
      if (updatedPatient) {
        setDetails((prev) => ({
          ...prev,
          patient: updatedPatient,
        }));
        setFormState(mapPatientToFormState(updatedPatient));
      }
      setArchiveDialogOpen(false);
      setPatientToast({ message: 'Patient archived successfully', severity: 'success' });
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to archive patient';
      setArchiveError(message);
    } finally {
      setArchivingPatient(false);
    }
  };

  const handleSaveTreatmentNote = async () => {
    if (!selectedTreatmentId || !treatmentNote.trim()) {
      return;
    }
    setTreatmentNoteError('');
    setSavingTreatmentNote(true);
    try {
      const response = await apiClient.put(
        `/api/appointments/${selectedTreatmentId}/notes`,
        { treatment_notes: treatmentNote },
      );
      const updatedAppointment = response.data?.appointment;
      if (updatedAppointment) {
        setDetails((prev) => ({
          ...prev,
          treatments: prev.treatments.map((treatment) =>
            treatment.appointment_id === updatedAppointment.appointment_id
              ? { ...treatment, treatment_notes: updatedAppointment.treatment_notes }
              : treatment,
          ),
        }));
        setTreatmentNoteSuccess('Treatment note saved');
        if (typeof refreshAppointments === 'function') {
          refreshAppointments();
        }
      }
    } catch (err) {
      console.error('Failed to save treatment note', err);
      setTreatmentNoteError('Unable to save treatment note. Please try again.');
    } finally {
      setSavingTreatmentNote(false);
    }
  };

  const handleApplyTemplateToNote = () => {
    if (!selectedTemplate) {
      return;
    }
    setTreatmentNote(selectedTemplate.body);
    setTreatmentNoteError('');
  };

  const openSaveTemplateDialog = () => {
    if (!treatmentNote.trim()) {
      return;
    }
    const fallbackName = selectedTreatment?.treatment_description
      ? `${selectedTreatment.treatment_description} Note`
      : `Template ${new Date().toLocaleDateString('en-GB')}`;
    setSaveTemplateDialog({ open: true, name: fallbackName });
    setSaveTemplateError('');
  };

  const closeSaveTemplateDialog = () => {
    if (savingTemplate) {
      return;
    }
    setSaveTemplateDialog({ open: false, name: '' });
    setSaveTemplateError('');
  };

  const handleSaveTemplateFromNote = async () => {
    if (!treatmentNote.trim()) {
      setSaveTemplateError('Enter a treatment note first');
      return;
    }
    if (!saveTemplateDialog.name.trim()) {
      setSaveTemplateError('Template name is required');
      return;
    }
    setSavingTemplate(true);
    setSaveTemplateError('');
    try {
      await apiClient.post('/api/treatment-note-templates', {
        name: saveTemplateDialog.name.trim(),
        body: treatmentNote.trim(),
      });
      setTreatmentNoteSuccess('Template saved');
      setSaveTemplateDialog({ open: false, name: '' });
      refreshNoteTemplates();
    } catch (err) {
      console.error('Failed to save treatment note template', err);
      setSaveTemplateError(err?.response?.data?.message || 'Unable to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const treatmentOptions = useMemo(
    () => treatments.map((treatment) => ({
      value: treatment.appointment_id,
      label: `${new Date(treatment.date).toLocaleDateString('en-GB')} - ${treatment.treatment_description || 'Untitled'}`,
    })),
    [treatments],
  );

  const invoiceByAppointment = useMemo(() => {
    const lookup = new Map();
    invoices.forEach((invoice) => {
      if (invoice.appointment_id !== undefined && invoice.appointment_id !== null) {
        lookup.set(Number(invoice.appointment_id), invoice);
      }
      if (Array.isArray(invoice.appointment_ids)) {
        invoice.appointment_ids.forEach((id) => {
          if (id !== undefined && id !== null) {
            lookup.set(Number(id), invoice);
          }
        });
      }
    });
    return lookup;
  }, [invoices]);

  const selectedTreatment = useMemo(
    () => treatments.find(
      (treatment) => String(treatment.appointment_id) === String(selectedTreatmentId),
    ),
    [treatments, selectedTreatmentId],
  );

  const selectedTemplate = useMemo(
    () => noteTemplates.find((template) => String(template.id) === String(selectedTemplateId)),
    [noteTemplates, selectedTemplateId],
  );

  const invoiceStatusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          invoices
            .map((invoice) => invoice.status)
            .filter(Boolean),
        ),
      ).map((status) => ({
        value: status,
        label: status.charAt(0).toUpperCase() + status.slice(1),
      })),
    [invoices],
  );

  const communicationStatusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          communications
            .map((comm) => comm.delivery_status)
            .filter(Boolean),
        ),
      ).map((status) => ({
        value: status,
        label: status.charAt(0).toUpperCase() + status.slice(1),
      })),
    [communications],
  );

  if (loading) {
    return <CircularProgress />;
  }

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }

  if (!patient) {
    return <Typography>No patient data found.</Typography>;
  }

  const therapistLabel = patient.primaryTherapist?.username
    ? `${patient.primaryTherapist.username}${
      patient.primaryTherapist.employeeID ? ` (#${patient.primaryTherapist.employeeID})` : ''
    }`
    : patient.primary_therapist_id
      ? `#${patient.primary_therapist_id}`
      : null;

  const noteColumns = [
    {
      id: 'date',
      label: 'Date',
      type: 'date',
      minWidth: 180,
      valueGetter: (row) => row.date,
      render: (row) => new Date(row.date).toLocaleString(),
    },
    {
      id: 'note',
      label: 'Note',
      minWidth: 320,
      render: (row) => row.note || '--',
    },
  ];

  const treatmentColumns = [
    {
      id: 'date',
      label: 'Date',
      type: 'date',
      minWidth: 150,
      valueGetter: (row) => row.date,
      render: (row) => new Date(row.date).toLocaleDateString('en-GB'),
    },
    {
      id: 'treatment_description',
      label: 'Description',
      minWidth: 220,
      render: (row) => row.treatment_description || 'Not provided',
    },
    {
      id: 'treatment_notes',
      label: 'Treatment Note',
      minWidth: 260,
      sortable: false,
      render: (row) => {
        if (!row.treatment_notes) {
          return (
            <Typography variant="body2" color="text.secondary">
              No note
            </Typography>
          );
        }
        const preview = row.treatment_notes.length > 160
          ? `${row.treatment_notes.slice(0, 160)}...`
          : row.treatment_notes;
        return (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
            {preview}
          </Typography>
        );
      },
    },
    {
      id: 'price',
      label: 'Price',
      type: 'number',
      minWidth: 120,
      render: (row) => {
        const currency = invoiceByAppointment.get(row.appointment_id)?.currency || 'GBP';
        return currencyDisplay(row.price, currency);
      },
    },
    {
      id: 'status',
      label: 'Status',
      minWidth: 140,
      valueGetter: (row) => row.paymentStatus || row.status,
      render: (row) => row.paymentStatus || row.status || 'Pending',
    },
    {
      id: 'invoice',
      label: 'Invoice',
      minWidth: 210,
      sortable: false,
      render: (row) => {
        const invoice = invoiceByAppointment.get(row.appointment_id);
        if (!invoice) {
          return 'No invoice';
        }
        const currency = invoice.currency || 'GBP';
        return `${invoice.invoice_number} (${currencyDisplay(invoice.balance_due, currency)} due)`;
      },
    },
  ];

  const detailedInvoiceColumns = [
    {
      id: 'invoice_number',
      label: 'Invoice #',
      minWidth: 140,
    },
    {
      id: 'issue_date',
      label: 'Issued',
      type: 'date',
      minWidth: 150,
      valueGetter: (row) => row.issue_date,
      render: (row) => new Date(row.issue_date).toLocaleDateString('en-GB'),
    },
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      options: invoiceStatusOptions,
      minWidth: 130,
    },
    {
      id: 'total_due',
      label: 'Total',
      type: 'number',
      minWidth: 120,
      render: (row) => currencyDisplay(row.total_due, row.currency),
    },
    {
      id: 'total_paid',
      label: 'Paid',
      type: 'number',
      minWidth: 120,
      render: (row) => currencyDisplay(row.total_paid, row.currency),
    },
    {
      id: 'balance_due',
      label: 'Balance',
      type: 'number',
      minWidth: 120,
      render: (row) => currencyDisplay(row.balance_due, row.currency),
    },
  ];

  const communicationColumns = [
    {
      id: 'date',
      label: 'Date',
      type: 'date',
      minWidth: 180,
      valueGetter: (row) => row.date,
      render: (row) => new Date(row.date).toLocaleString(),
    },
    {
      id: 'type',
      label: 'Type',
      minWidth: 140,
    },
    {
      id: 'content',
      label: 'Content',
      minWidth: 260,
      render: (row) => row.content || '--',
    },
    {
      id: 'delivery_status',
      label: 'Status',
      type: 'select',
      options: communicationStatusOptions,
      minWidth: 140,
    },
  ];

  return (
    <Box>
      <Card className={classes.section}>
        <CardContent>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
            flexWrap="wrap"
            gap={2}
            mb={2}
          >
            <Box>
              <Typography variant="h5">{patientDisplayName}</Typography>
              <Typography variant="body2" color="text.secondary">
                Patient ID: #{patient.patient_id}
              </Typography>
              {nextAppointment && (
                <Typography variant="body2" color="text.secondary">
                  Next appointment:{' '}
                  {new Date(nextAppointment.date).toLocaleString('en-GB')}
                  {nextAppointment.treatment_description
                    ? ` - ${nextAppointment.treatment_description}`
                    : ''}
                </Typography>
              )}
              {therapistLabel && (
                <Typography variant="body2" color="text.secondary">
                  Primary Therapist: {therapistLabel}
                </Typography>
              )}
            </Box>
            <Box display="flex" flexWrap="wrap" gap={1} justifyContent="flex-end">
              {canExportPatient && (
                <Button
                  variant="outlined"
                  onClick={handleExportPatient}
                  disabled={exporting}
                >
                  {exporting ? 'Preparing export...' : 'Export JSON'}
                </Button>
              )}
              {canEditPatient && (
                <>
                  <Button
                    variant="outlined"
                    onClick={handleResetPatientForm}
                    disabled={savingPatient}
                  >
                    Reset
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleSavePatientRecord}
                    disabled={savingPatient}
                  >
                    {savingPatient ? 'Saving...' : 'Save Changes'}
                  </Button>
                </>
              )}
              {canArchivePatient && (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => {
                    setArchiveError('');
                    setArchiveDialogOpen(true);
                  }}
                  disabled={archivingPatient || patient.status === 'archived'}
                >
                  {patient.status === 'archived' ? 'Archived' : 'Archive Patient'}
                </Button>
              )}
            </Box>
          </Box>
          {patient.status === 'archived' && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              This patient is archived. Update the status to Active to restore them to active lists.
            </Alert>
          )}
          {therapistsError && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {therapistsError}. Therapist assignment will remain optional until the list loads.
            </Alert>
          )}
          {!canEditPatient && (
            <Alert severity="info" sx={{ mb: 2 }}>
              You have read-only access to this patient. Contact an administrator if you need to make
              changes.
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="First Name"
                fullWidth
                required
                value={formState.first_name}
                onChange={(event) => handleFormFieldChange('first_name', event.target.value)}
                error={Boolean(formErrors.first_name)}
                helperText={formErrors.first_name}
                disabled={!canEditPatient}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Surname"
                fullWidth
                required
                value={formState.surname}
                onChange={(event) => handleFormFieldChange('surname', event.target.value)}
                error={Boolean(formErrors.surname)}
                helperText={formErrors.surname}
                disabled={!canEditPatient}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Preferred Name"
                fullWidth
                value={formState.preferred_name}
                onChange={(event) => handleFormFieldChange('preferred_name', event.target.value)}
                disabled={!canEditPatient}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Date of Birth"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={formState.date_of_birth}
                onChange={(event) => handleFormFieldChange('date_of_birth', event.target.value)}
                disabled={!canEditPatient}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Email"
                type="email"
                fullWidth
                required
                value={formState.email}
                onChange={(event) => handleFormFieldChange('email', event.target.value)}
                error={Boolean(formErrors.email)}
                helperText={formErrors.email}
                disabled={!canEditPatient}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Phone"
                fullWidth
                required
                value={formState.phone}
                onChange={(event) => handleFormFieldChange('phone', event.target.value)}
                error={Boolean(formErrors.phone)}
                helperText={formErrors.phone}
                disabled={!canEditPatient}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Status"
                select
                fullWidth
                required
                value={formState.status}
                onChange={(event) => handleFormFieldChange('status', event.target.value)}
                error={Boolean(formErrors.status)}
                helperText={formErrors.status}
                disabled={!canEditPatient}
              >
                {STATUS_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Billing Mode"
                select
                fullWidth
                value={formState.billing_mode}
                onChange={(event) => handleFormFieldChange('billing_mode', event.target.value)}
                disabled={!canEditPatient}
              >
                {BILLING_MODE_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                options={therapistOptions}
                value={primaryTherapistSelection}
                onChange={(event, newValue) => {
                  handleFormFieldChange('primaryTherapistId', newValue?.id || '');
                }}
                getOptionLabel={(option) => {
                  if (!option) {
                    return '';
                  }
                  return option.employeeID ? `${option.name} (#${option.employeeID})` : option.name;
                }}
                loading={therapistsLoading}
                disabled={!canEditPatient}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Primary Therapist"
                    placeholder="Select therapist"
                    helperText={therapistsLoading ? 'Loading therapists...' : 'Optional'}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={(
                  <Switch
                    checked={formState.email_active !== false}
                    onChange={(event) => handleFormFieldChange('email_active', event.target.checked)}
                    disabled={!canEditPatient}
                  />
                )}
                label="Email Active"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Address Line 1"
                fullWidth
                value={formState.address_line1}
                onChange={(event) => handleFormFieldChange('address_line1', event.target.value)}
                helperText="Street address"
                disabled={!canEditPatient}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Address Line 2"
                fullWidth
                value={formState.address_line2}
                onChange={(event) => handleFormFieldChange('address_line2', event.target.value)}
                helperText="Apartment, suite, etc. (optional)"
                disabled={!canEditPatient}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="City"
                fullWidth
                value={formState.address_city}
                onChange={(event) => handleFormFieldChange('address_city', event.target.value)}
                disabled={!canEditPatient}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="State / County"
                fullWidth
                value={formState.address_state}
                onChange={(event) => handleFormFieldChange('address_state', event.target.value)}
                disabled={!canEditPatient}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Postcode"
                fullWidth
                value={formState.address_postcode}
                onChange={(event) => handleFormFieldChange('address_postcode', event.target.value)}
                disabled={!canEditPatient}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Primary Contact Name"
                fullWidth
                value={formState.primary_contact_name}
                onChange={(event) => handleFormFieldChange('primary_contact_name', event.target.value)}
                helperText="Optional"
                disabled={!canEditPatient}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Primary Contact Email"
                type="email"
                fullWidth
                value={formState.primary_contact_email}
                onChange={(event) => handleFormFieldChange('primary_contact_email', event.target.value)}
                helperText="Optional"
                disabled={!canEditPatient}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Primary Contact Phone"
                fullWidth
                value={formState.primary_contact_phone}
                onChange={(event) => handleFormFieldChange('primary_contact_phone', event.target.value)}
                helperText="Optional"
                disabled={!canEditPatient}
              />
            </Grid>
          </Grid>
          <Snackbar
            open={Boolean(patientToast.message)}
            autoHideDuration={4000}
            onClose={() => setPatientToast((prev) => ({ ...prev, message: '' }))}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          >
            <Alert
              severity={patientToast.severity}
              onClose={() => setPatientToast((prev) => ({ ...prev, message: '' }))}
              sx={{ width: '100%' }}
            >
              {patientToast.message}
            </Alert>
          </Snackbar>
          <Snackbar
            open={Boolean(exportSuccess)}
            autoHideDuration={3500}
            onClose={() => setExportSuccess('')}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          >
            <Alert severity="success" onClose={() => setExportSuccess('')} sx={{ width: '100%' }}>
              {exportSuccess}
            </Alert>
          </Snackbar>
          <Snackbar
            open={Boolean(exportError)}
            autoHideDuration={5000}
            onClose={() => setExportError('')}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          >
            <Alert severity="error" onClose={() => setExportError('')} sx={{ width: '100%' }}>
              {exportError}
            </Alert>
          </Snackbar>
      </CardContent>
      </Card>

      {canArchivePatient && (
        <Dialog
          open={archiveDialogOpen}
          onClose={closeArchiveDialog}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Archive Patient</DialogTitle>
          <DialogContent dividers>
            <Typography gutterBottom>
              Are you sure you want to archive <strong>{patientDisplayName}</strong>? This will hide
              the patient from active lists.
            </Typography>
            {archiveError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {archiveError}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeArchiveDialog} disabled={archivingPatient} sx={{ color: '#fff' }}>
              Cancel
            </Button>
            <Button
              onClick={handleArchivePatient}
              color="error"
              variant="contained"
              disabled={archivingPatient}
            >
              {archivingPatient ? 'Archiving...' : 'Archive'}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <Card className={classes.section}>
        <CardContent>
          <Typography variant="h6">Patient Notes</Typography>
          <Divider sx={{ my: 2 }} />
          {canEditNotes && (
            <>
              <TextField
                label="Add a note"
                multiline
                minRows={2}
                value={newNote}
                onChange={(event) => setNewNote(event.target.value)}
                className={classes.fullWidth}
              />
              <Box mt={2}>
                <Button
                  variant="contained"
                  onClick={handleAddPatientNote}
                  disabled={savingNote || !newNote.trim()}
                >
                  {savingNote ? 'Saving...' : 'Save Note'}
                </Button>
              </Box>
            </>
          )}
          <Box className={[classes.tableContainer, classes.formRow].join(' ')}>
            <DataTable
              columns={noteColumns}
              rows={notes}
              getRowId={(row, index) => row._id || index}
              maxHeight={320}
              emptyMessage="No notes yet."
              containerSx={{ border: 'none', backgroundColor: 'transparent' }}
            />
          </Box>
        </CardContent>
      </Card>

      <Card className={classes.section}>
        <CardContent>
          <Typography variant="h6">Treatment Notes</Typography>
          <Divider sx={{ my: 2 }} />
          {canEditNotes ? (
            <>
              <TextField
                select
                label="Select an appointment"
                value={selectedTreatmentId}
                onChange={(event) => setSelectedTreatmentId(event.target.value)}
                className={classes.fullWidth}
              >
                <MenuItem value="">-- Choose a treatment --</MenuItem>
                {treatmentOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              {canEditNotes && templatesFetchError && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {templatesFetchError}
                </Alert>
              )}
              {canEditNotes && (
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 1,
                    mt: 2,
                  }}
                >
                  <TextField
                    select
                    label="Template"
                    value={selectedTemplateId}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    sx={{ minWidth: 220 }}
                    disabled={templatesLoading || noteTemplates.length === 0}
                    helperText={templatesLoading ? 'Loading templates...' : 'Select to prefill a note'}
                  >
                    <MenuItem value="">-- No template --</MenuItem>
                    {noteTemplates.map((template) => (
                      <MenuItem key={template.id} value={template.id}>
                        {template.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Tooltip title="Apply template" placement="top">
                    <span>
                      <IconButton
                        color="primary"
                        onClick={handleApplyTemplateToNote}
                        disabled={!selectedTemplate}
                      >
                        <AutoAwesomeIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Save note as template" placement="top">
                    <span>
                      <IconButton
                        color="primary"
                        onClick={openSaveTemplateDialog}
                        disabled={!treatmentNote.trim()}
                      >
                        <SaveAltIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Manage templates" placement="top">
                    <IconButton
                      color="primary"
                      component={RouterLink}
                      to="/dashboard/settings#treatment-note-templates"
                    >
                      <LibraryBooksIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
              <TextField
                className={[classes.fullWidth, classes.formRow].join(' ')}
                label="Treatment Note"
                multiline
                minRows={3}
                value={treatmentNote}
                onChange={(event) => setTreatmentNote(event.target.value)}
              />
              <Button
                variant="contained"
                onClick={handleSaveTreatmentNote}
                disabled={!selectedTreatmentId || !treatmentNote.trim() || savingTreatmentNote}
              >
                {savingTreatmentNote ? 'Saving...' : 'Save Treatment Note'}
              </Button>
              <Snackbar
                open={Boolean(treatmentNoteSuccess)}
                autoHideDuration={3500}
                onClose={() => setTreatmentNoteSuccess('')}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
              >
                <Alert severity="success" onClose={() => setTreatmentNoteSuccess('')} sx={{ width: '100%' }}>
                  {treatmentNoteSuccess}
                </Alert>
              </Snackbar>
              <Snackbar
                open={Boolean(treatmentNoteError)}
                autoHideDuration={5000}
                onClose={() => setTreatmentNoteError('')}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
              >
                <Alert severity="error" onClose={() => setTreatmentNoteError('')} sx={{ width: '100%' }}>
                  {treatmentNoteError}
                </Alert>
              </Snackbar>
            </>
          ) : (
            <Typography variant="body2" color="textSecondary">
              Only therapists and administrators can edit treatment notes.
            </Typography>
          )}
          <Dialog open={saveTemplateDialog.open} onClose={closeSaveTemplateDialog} maxWidth="xs" fullWidth>
            <DialogTitle>Save Template</DialogTitle>
            <DialogContent dividers>
              <TextField
                label="Template name"
                fullWidth
                value={saveTemplateDialog.name}
                onChange={(event) => setSaveTemplateDialog((prev) => ({ ...prev, name: event.target.value }))}
                autoFocus
              />
              {saveTemplateError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {saveTemplateError}
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={closeSaveTemplateDialog} disabled={savingTemplate} sx={{ color: '#fff' }}>
                Cancel
              </Button>
              <Button onClick={handleSaveTemplateFromNote} disabled={savingTemplate} variant="contained">
                {savingTemplate ? 'Saving...' : 'Save Template'}
              </Button>
            </DialogActions>
          </Dialog>
        </CardContent>
      </Card>

      <Card className={classes.section}>
        <CardContent>
          <Typography variant="h6">Treatment History</Typography>
          <Divider sx={{ my: 2 }} />
          <Box className={classes.tableContainer}>
            <DataTable
              columns={treatmentColumns}
              rows={treatments}
              getRowId={(row) => row.appointment_id}
              maxHeight={360}
              emptyMessage="No treatments recorded."
              containerSx={{ border: 'none', backgroundColor: 'transparent' }}
            />
          </Box>
        </CardContent>
      </Card>

      <Card className={classes.section}>
        <CardContent>
          <Typography variant="h6">Invoices</Typography>
          <Divider sx={{ my: 2 }} />
          <Box className={classes.tableContainer}>
            <DataTable
              columns={detailedInvoiceColumns}
              rows={invoices}
              getRowId={(row) => row._id}
              maxHeight={360}
              emptyMessage="No invoices for this patient."
              containerSx={{ border: 'none', backgroundColor: 'transparent' }}
            />
          </Box>
        </CardContent>
      </Card>

      <Card className={classes.section}>
        <CardContent>
          <Typography variant="h6">Communications</Typography>
          <Divider sx={{ my: 2 }} />
          <Box className={classes.tableContainer}>
            <DataTable
              columns={communicationColumns}
              rows={communications}
              getRowId={(row) => row._id}
              maxHeight={360}
              emptyMessage="No communications recorded."
              containerSx={{ border: 'none', backgroundColor: 'transparent' }}
            />
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default PatientDetails;
