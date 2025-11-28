// src/components/Dashboard/Appointments.js

import React, {
  useState,
  useContext,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Checkbox,
  Radio,
  RadioGroup,
  FormControlLabel,
  TextField,
  Divider,
  CircularProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  MenuItem,
  Alert,
  Snackbar,
  useMediaQuery,
} from '@mui/material';
import { makeStyles } from '@mui/styles';
import { useTheme } from '@mui/material/styles';
import apiClient from '../../utils/apiClient';
import { AppointmentsContext } from '../../context/AppointmentsContext';
import Autocomplete from '@mui/material/Autocomplete';
import useTherapists from '../../hooks/useTherapists';
import DataTable from '../common/DataTable';
import InvoiceBuilderDialog from '../invoices/InvoiceBuilderDialog';

const useStyles = makeStyles((theme) => ({
  card: {
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[3],
    backgroundColor: theme.palette.background.paper,
    color: theme.palette.text.primary,
    width: '100%',
  },
  cardContent: {
    padding: theme.spacing(3),
  },
  table: {
    minWidth: 650,
  },
  searchField: {
    marginBottom: theme.spacing(2),
    width: '100%',
  },
}));

const buildPatientLabel = (patient) => {
  if (!patient) {
    return '';
  }

  const nameParts = [patient.first_name, patient.surname].filter(Boolean);
  const preferred = patient.preferred_name;
  const baseName = nameParts.join(' ').trim() || preferred || 'Patient';
  if (patient.patient_id) {
    return `${baseName} (#${patient.patient_id})`;
  }
  return baseName;
};

const COMPLETION_OUTCOME_OPTIONS = [
  { value: 'completed', label: 'Completed (auto invoice)' },
  { value: 'completed_manual', label: 'Completed (adjust invoice)' },
  { value: 'cancelled_same_day', label: 'Cancelled on the day (50% fee)' },
  { value: 'cancelled_by_patient', label: 'Cancelled by patient' },
  { value: 'cancelled_by_therapist', label: 'Cancelled by therapist' },
  { value: 'other', label: 'Other (add note)' },
];

const DEFAULT_VISIBLE_STATUS = 'scheduled';

const getTherapistInfo = (appointment, lookup = {}) => {
  if (!appointment) {
    return { name: '', employeeId: null };
  }
  const therapistRecord = typeof appointment.therapist === 'object' ? appointment.therapist : {};
  const therapistIdCandidate = therapistRecord?._id || therapistRecord?.id || appointment.therapist || appointment.therapistId;
  const name = (
    appointment.therapistName
    || appointment.therapist_name
    || therapistRecord?.name
    || therapistRecord?.username
    || appointment.therapistUsername
  ) || '';
  const employeeId = appointment.employeeID ?? therapistRecord?.employeeID ?? null;

  let resolvedName = name;
  let resolvedEmployeeId = employeeId;

  const normalizedTherapistId = therapistIdCandidate ? String(therapistIdCandidate) : null;
  if (lookup.byId && normalizedTherapistId && lookup.byId.has(normalizedTherapistId)) {
    const match = lookup.byId.get(normalizedTherapistId);
    resolvedName = resolvedName || match.name;
    if (resolvedEmployeeId === null || resolvedEmployeeId === undefined) {
      resolvedEmployeeId = match.employeeID ?? resolvedEmployeeId;
    }
  }

  if (
    lookup.byEmployeeId
    && (resolvedName === '' || resolvedName === 'Unassigned')
    && appointment.employeeID !== undefined
    && appointment.employeeID !== null
  ) {
    const employeeKey = Number(appointment.employeeID);
    const match = Number.isNaN(employeeKey) ? null : lookup.byEmployeeId.get(employeeKey);
    if (match) {
      resolvedName = match.name;
      if (resolvedEmployeeId === null || resolvedEmployeeId === undefined) {
        resolvedEmployeeId = match.employeeID ?? resolvedEmployeeId;
      }
    }
  }

  return { name: resolvedName, employeeId: resolvedEmployeeId };
};

const buildTreatmentNotePreview = (note, limit = 120) => {
  if (!note || typeof note !== 'string') {
    return 'No treatment notes recorded.';
  }
  const trimmed = note.trim();
  if (!trimmed) {
    return 'No treatment notes recorded.';
  }
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit)}...`;
};

const extractDateParts = (value) => {
  if (!value) {
    return { date: '', time: '' };
  }
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return { date: '', time: '' };
  }
  const pad = (input) => String(input).padStart(2, '0');
  return {
    date: `${dateValue.getFullYear()}-${pad(dateValue.getMonth() + 1)}-${pad(dateValue.getDate())}`,
    time: `${pad(dateValue.getHours())}:${pad(dateValue.getMinutes())}`,
  };
};

const createEmptyEditValues = () => ({
  date: '',
  time: '',
  location: '',
  room: '',
  treatment_description: '',
  treatment_count: 1,
  price: '',
  therapistId: '',
  employeeID: '',
});

const formatStatusLabel = (status) => {
  if (!status) {
    return 'Scheduled';
  }
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'completed_manual':
      return 'Completed (adjusted invoice)';
    case 'cancelled_same_day':
      return 'Cancelled on the day';
    case 'cancelled_reschedule':
      return 'Cancelled (reschedule)';
    case 'cancelled_by_patient':
      return 'Cancelled by patient';
    case 'cancelled_by_therapist':
      return 'Cancelled by therapist';
    case 'other':
      return 'Other';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
};

const Appointments = ({ userData }) => {
  const classes = useStyles();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchTerm, setSearchTerm] = useState('');
  const { appointments, loading, error, setAppointments, refreshAppointments } = useContext(AppointmentsContext);
  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientInputValue, setPatientInputValue] = useState('');
  const { therapists, loading: therapistsLoading, error: therapistsError } = useTherapists();
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [treatmentOptions, setTreatmentOptions] = useState([]);
  const [selectedTreatment, setSelectedTreatment] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [formState, setFormState] = useState({
    patient_id: '',
    date: '',
    time: '',
    location: '',
    room: '',
    treatment_description: '',
    treatment_id: '',
    treatment_count: 1,
    price: 0,
    employeeID: userData?.employeeID || '',
    therapistName: '',
    therapistId: userData?.id || '',
    sendConfirmationEmail: true,
  });
  const [therapistManuallySelected, setTherapistManuallySelected] = useState(false);
  const [completionDialog, setCompletionDialog] = useState({
    open: false,
    appointment: null,
    outcome: 'completed',
    note: '',
    submitting: false,
    error: '',
  });
  const [manualInvoiceDialog, setManualInvoiceDialog] = useState({
    open: false,
    appointment: null,
  });
  const [editDialog, setEditDialog] = useState({
    open: false,
    appointment: null,
    values: createEmptyEditValues(),
    errors: {},
    submitError: '',
    submitting: false,
  });
  const [showAllAppointments, setShowAllAppointments] = useState(false);
  const [noteDialog, setNoteDialog] = useState({
    open: false,
    appointment: null,
    value: '',
    saving: false,
    error: '',
  });

  useEffect(() => {
    if (!userData) {
      return undefined;
    }
    let isMounted = true;
    const loadPatients = async () => {
      setPatientsLoading(true);
      try {
        const params = { limit: 200 };
        if (userData.role === 'therapist') {
          params.view = 'all';
        }
        const response = await apiClient.get('/api/patients', { params });
        if (isMounted) {
          setPatients(response.data.patients || []);
        }
      } catch (err) {
        console.error('Failed to load patients', err);
      } finally {
        if (isMounted) {
          setPatientsLoading(false);
        }
      }
    };
    loadPatients();
    return () => {
      isMounted = false;
    };
  }, [userData]);

  const therapistOptions = useMemo(() => {
    const therapistOnly = therapists.filter((therapist) => therapist.role === 'therapist');
    if (therapistOnly.length) {
      return therapistOnly;
    }
    if (userData?.role === 'therapist') {
      return [{
        id: userData.id || 'current-user',
        name: userData.name || userData.username || 'Current user',
        employeeID: userData.employeeID ?? null,
        role: userData.role,
      }];
    }
    return [];
  }, [therapists, userData]);

  const therapistLookupById = useMemo(() => {
    const map = new Map();
    therapistOptions.forEach((therapist) => {
      if (!therapist.id) {
        return;
      }
      map.set(String(therapist.id), therapist);
    });
    return map;
  }, [therapistOptions]);

  const therapistLookupByEmployeeId = useMemo(() => {
    const map = new Map();
    therapistOptions.forEach((therapist) => {
      if (therapist.employeeID === null || therapist.employeeID === undefined) {
        return;
      }
      const numericEmployeeId = Number(therapist.employeeID);
      if (!Number.isNaN(numericEmployeeId)) {
        map.set(numericEmployeeId, therapist);
      }
    });
    return map;
  }, [therapistOptions]);

  useEffect(() => {
    if (!therapistOptions.length) {
      return;
    }

    setFormState((prev) => {
      if (prev.therapistId) {
        return prev;
      }

      const defaultTherapist = therapistOptions.find(
        (therapist) => Number(therapist.employeeID) === Number(userData?.employeeID),
      ) || therapistOptions[0];

      return {
        ...prev,
        therapistId: defaultTherapist?.id || '',
        employeeID: defaultTherapist?.employeeID ?? '',
        therapistName: defaultTherapist?.name || '',
      };
    });
  }, [therapistOptions, userData?.employeeID]);

  useEffect(() => {
    const loadTreatments = async () => {
      try {
        const response = await apiClient.get('/api/services');
        const options = (response.data.services || response.data.treatments || []).map((service) => ({
          ...service,
          treatment_id: service?.treatment_id ?? '',
          description: service?.treatment_description || service?.description || '',
          price: service?.price,
        }));
    setTreatmentOptions(options);
      } catch (err) {
        console.error('Failed to load treatment catalogue', err);
      }
    };
    loadTreatments();
  }, []);

  const handleDeleteAppointment = useCallback(async (appointmentId) => {
    if (!appointmentId) {
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Delete this appointment? This cannot be undone.');
      if (!confirmed) {
        return;
      }
    }

    setSubmitError(null);

    try {
      await apiClient.delete(`/api/appointments/${appointmentId}`);
      setAppointments((prev) =>
        prev.filter((appointment) => appointment.appointment_id !== appointmentId),
      );
      setSubmitSuccess('Appointment deleted');
      refreshAppointments();
    } catch (err) {
      console.error('Failed to delete appointment', err);
      const message = err?.response?.data?.message || 'Failed to delete appointment';
      setSubmitError(message);
    }
  }, [refreshAppointments, setAppointments]);

  const performCompletionUpdate = useCallback(
    async ({ appointmentId, outcome, note = '' }) => {
      const response = await apiClient.post('/api/appointments/complete', {
        appointment_id: appointmentId,
        outcome,
        note,
      });
      const updated = response.data?.appointment;
      if (updated) {
        setAppointments((prevAppointments) =>
          prevAppointments.map((appointment) =>
            appointment.appointment_id === updated.appointment_id
              ? { ...appointment, ...updated }
              : appointment,
          ),
        );
      }
      setSubmitSuccess('Appointment updated');
      refreshAppointments();
      return response.data;
    },
    [refreshAppointments, setAppointments],
  );

  const closeManualInvoiceDialog = useCallback(() => {
    setManualInvoiceDialog({ open: false, appointment: null });
  }, []);

  const handleManualInvoiceCreated = useCallback(async () => {
    const appointment = manualInvoiceDialog.appointment;
    if (!appointment) {
      closeManualInvoiceDialog();
      return;
    }
    try {
      await performCompletionUpdate({
        appointmentId: appointment.appointment_id,
        outcome: 'completed_manual',
      });
    } catch (err) {
      console.error('Failed to finalize manual invoice completion', err);
    } finally {
      closeManualInvoiceDialog();
    }
  }, [closeManualInvoiceDialog, manualInvoiceDialog.appointment, performCompletionUpdate]);

  const closeNoteDialog = useCallback(() => {
    setNoteDialog({
      open: false,
      appointment: null,
      value: '',
      saving: false,
      error: '',
    });
  }, []);

  const openTreatmentNoteDialog = useCallback((appointment) => {
    if (!appointment) {
      return;
    }
    setNoteDialog({
      open: true,
      appointment,
      value: appointment.treatment_notes || '',
      saving: false,
      error: '',
    });
  }, []);

  const handleSaveTreatmentNotes = useCallback(async () => {
    if (!noteDialog.appointment) {
      return;
    }
    const currentAppointmentId = noteDialog.appointment.appointment_id;
    const updatedValue = noteDialog.value;
    setNoteDialog((prev) => ({ ...prev, saving: true, error: '' }));
    try {
      const response = await apiClient.put(
        `/api/appointments/${currentAppointmentId}/notes`,
        { treatment_notes: updatedValue },
      );
      const updatedAppointment = response.data?.appointment;
      if (updatedAppointment) {
        setAppointments((prevAppointments) => {
          if (!Array.isArray(prevAppointments)) {
            return prevAppointments;
          }
          return prevAppointments.map((appointment) => (
            appointment.appointment_id === updatedAppointment.appointment_id
              ? { ...appointment, ...updatedAppointment }
              : appointment
          ));
        });
      } else {
        setAppointments((prevAppointments) => {
          if (!Array.isArray(prevAppointments)) {
            return prevAppointments;
          }
          return prevAppointments.map((appointment) => (
            appointment.appointment_id === currentAppointmentId
              ? { ...appointment, treatment_notes: updatedValue }
              : appointment
          ));
        });
      }
      setSubmitSuccess('Treatment notes updated.');
      closeNoteDialog();
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to save treatment notes.';
      setNoteDialog((prev) => ({ ...prev, saving: false, error: message }));
    }
  }, [closeNoteDialog, noteDialog.appointment, noteDialog.value, setAppointments]);

  const closeEditDialog = useCallback(() => {
    setEditDialog({
      open: false,
      appointment: null,
      values: createEmptyEditValues(),
      errors: {},
      submitError: '',
      submitting: false,
    });
  }, []);

  const openEditDialog = useCallback((appointment) => {
    if (!appointment) {
      return;
    }
    const { date, time } = extractDateParts(appointment.date);
    const therapistIdValue = appointment.therapist?._id
      || appointment.therapist
      || appointment.therapistId
      || '';
    setEditDialog({
      open: true,
      appointment,
      submitting: false,
      submitError: '',
      errors: {},
      values: {
        ...createEmptyEditValues(),
        date,
        time,
        location: appointment.location || '',
        room: appointment.room || '',
        treatment_description: appointment.treatment_description || '',
        treatment_count: appointment.treatment_count ?? 1,
        price: appointment.price ?? '',
        therapistId: therapistIdValue ? String(therapistIdValue) : '',
        employeeID: appointment.employeeID ?? '',
      },
    });
  }, []);

  const handleEditFieldChange = useCallback((field, value) => {
    setEditDialog((prev) => ({
      ...prev,
      values: {
        ...prev.values,
        [field]: value,
      },
      errors: {
        ...prev.errors,
        [field]: undefined,
      },
      submitError: '',
    }));
  }, []);

  const validateEditForm = useCallback((values) => {
    const errors = {};
    if (!values.date) {
      errors.date = 'Choose a date';
    }
    if (!values.time) {
      errors.time = 'Choose a time';
    }
    if (!values.location) {
      errors.location = 'Location is required';
    }
    if (!values.treatment_description) {
      errors.treatment_description = 'Treatment is required';
    }
    const treatmentCountValue = Number(values.treatment_count || 1);
    if (Number.isNaN(treatmentCountValue) || treatmentCountValue <= 0) {
      errors.treatment_count = 'Sessions must be at least 1';
    }
    const priceValue = Number(values.price);
    if (values.price === '' || Number.isNaN(priceValue) || priceValue < 0) {
      errors.price = 'Enter a valid price';
    }
    if (!values.therapistId) {
      errors.therapistId = 'Select a therapist';
    }
    return errors;
  }, []);

  const handleEditAppointment = async () => {
    if (!editDialog.appointment) {
      return;
    }
    const validationErrors = validateEditForm(editDialog.values);
    if (Object.keys(validationErrors).length) {
      setEditDialog((prev) => ({
        ...prev,
        errors: validationErrors,
      }));
      return;
    }

    const scheduledDate = new Date(`${editDialog.values.date}T${editDialog.values.time}`);
    if (Number.isNaN(scheduledDate.getTime())) {
      setEditDialog((prev) => ({
        ...prev,
        errors: { ...prev.errors, date: 'Enter a valid date/time' },
      }));
      return;
    }

    const therapist = editTherapistSelection;
    if (!therapist) {
      setEditDialog((prev) => ({
        ...prev,
        errors: { ...prev.errors, therapistId: 'Select a therapist' },
      }));
      return;
    }

    const treatmentCountValue = Number(editDialog.values.treatment_count || 1);
    const priceValue = Number(editDialog.values.price);

    let employeeIdValue;
    if (editDialog.values.employeeID === '' || editDialog.values.employeeID === null || editDialog.values.employeeID === undefined) {
      employeeIdValue = therapist.employeeID;
    } else {
      employeeIdValue = Number(editDialog.values.employeeID);
    }

    if (employeeIdValue === undefined || employeeIdValue === null || Number.isNaN(employeeIdValue)) {
      setEditDialog((prev) => ({
        ...prev,
        submitError: 'The selected therapist does not have an employee ID configured.',
      }));
      return;
    }

    setEditDialog((prev) => ({
      ...prev,
      submitting: true,
      submitError: '',
      errors: {},
    }));

    const payload = {
      date: scheduledDate.toISOString(),
      location: editDialog.values.location,
      room: editDialog.values.room,
      treatment_description: editDialog.values.treatment_description,
      treatment_count: treatmentCountValue,
      price: priceValue,
      therapist: therapist.id,
      employeeID: employeeIdValue,
    };

    try {
      const response = await apiClient.put(
        `/api/appointments/${editDialog.appointment.appointment_id}`,
        payload,
      );
      const updated = response.data?.appointment;
      if (updated) {
        setAppointments((prevAppointments) =>
          prevAppointments.map((appointment) =>
            appointment.appointment_id === updated.appointment_id
              ? { ...appointment, ...updated }
              : appointment,
          ),
        );
      }
      setSubmitSuccess('Appointment updated');
      closeEditDialog();
      refreshAppointments();
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to update appointment';
      console.error('Failed to update appointment', err);
      setEditDialog((prev) => ({
        ...prev,
        submitError: message,
      }));
    } finally {
      setEditDialog((prev) => ({
        ...prev,
        submitting: false,
      }));
    }
  };

  const openCompletionDialog = useCallback((appointment) => {
    const allowedValues = COMPLETION_OUTCOME_OPTIONS.map((option) => option.value);
    const nextOutcome = allowedValues.includes(appointment.completion_status)
      ? appointment.completion_status
      : 'completed';
    setCompletionDialog({
      open: true,
      appointment,
      outcome: nextOutcome,
      note: appointment.completion_note || '',
      submitting: false,
      error: '',
    });
  }, []);

  const closeCompletionDialog = () => {
    setCompletionDialog((prev) => {
      if (prev.submitting) {
        return prev;
      }
      return {
        open: false,
        appointment: null,
        outcome: 'completed',
        note: '',
        submitting: false,
        error: '',
      };
    });
  };

  const submitCompletionOutcome = async () => {
    if (!completionDialog.appointment) {
      return;
    }
    if (completionDialog.outcome === 'other' && !completionDialog.note.trim()) {
      setCompletionDialog((prev) => ({ ...prev, error: 'Please provide a note for this outcome.' }));
      return;
    }
    if (completionDialog.outcome === 'completed_manual') {
      closeCompletionDialog();
      setManualInvoiceDialog({
        open: true,
        appointment: completionDialog.appointment,
      });
      return;
    }
    setCompletionDialog((prev) => ({ ...prev, submitting: true, error: '' }));
    try {
      await performCompletionUpdate({
        appointmentId: completionDialog.appointment.appointment_id,
        outcome: completionDialog.outcome,
        note: completionDialog.note,
      });
      setCompletionDialog({
        open: false,
        appointment: null,
        outcome: 'completed',
        note: '',
        submitting: false,
        error: '',
      });
    } catch (err) {
      const message = err?.response?.data?.message || 'Unable to update appointment outcome';
      setCompletionDialog((prev) => ({ ...prev, error: message }));
    } finally {
      setCompletionDialog((prev) => ({ ...prev, submitting: false }));
    }
  };

  const filteredAppointments = useMemo(() => {
    if (!Array.isArray(appointments)) {
      return [];
    }
    const normalizedSearch = searchTerm.trim().toLowerCase();
    let base = appointments;
    if (normalizedSearch) {
      base = appointments.filter((appointment) => {
        const name = `${appointment.first_name || ''} ${appointment.surname || ''}`.toLowerCase().trim();
        const treatment = (appointment.treatment_description || '').toLowerCase();
        return name.includes(normalizedSearch) || treatment.includes(normalizedSearch);
      });
    }
    if (!showAllAppointments) {
      base = base.filter((appointment) => {
        const normalizedStatus = String(
          appointment.completion_status || appointment.status || DEFAULT_VISIBLE_STATUS,
        ).toLowerCase();
        if (normalizedStatus === DEFAULT_VISIBLE_STATUS) {
          return true;
        }
        return (
          normalizedStatus === ''
          && DEFAULT_VISIBLE_STATUS === 'scheduled'
        );
      });
    }
    return base;
  }, [appointments, searchTerm, showAllAppointments]);

  const appointmentStatusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (appointments || [])
            .map((appointment) => appointment.status)
            .filter(Boolean),
        ),
      ).map((status) => ({
        value: status,
        label: formatStatusLabel(status),
      })),
    [appointments],
  );

  const paymentStatusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (appointments || [])
            .map((appointment) => appointment.paymentStatus)
            .filter(Boolean),
        ),
      ).map((status) => ({
        value: status,
        label: status.charAt(0).toUpperCase() + status.slice(1),
      })),
    [appointments],
  );

  const outcomeFilterOptions = useMemo(
    () => {
      const values = Array.from(
        new Set(
          (appointments || [])
            .map((appointment) => appointment.completion_status || appointment.status)
            .filter(Boolean),
        ),
      );
      if (!values.length) {
        return COMPLETION_OUTCOME_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }));
      }
      return values.map((value) => ({
        value,
        label: formatStatusLabel(value),
      }));
    },
    [appointments],
  );

  const canManageAppointments = ['admin', 'therapist', 'receptionist'].includes(userData?.role);
  const canUpdateOutcome = ['admin', 'therapist'].includes(userData?.role);
  const canEditTreatmentNotes = ['admin', 'therapist'].includes(userData?.role);

  const actionButtonSx = {
    px: 2.5,
    minWidth: 120,
    borderRadius: 999,
    textTransform: 'none',
    whiteSpace: 'nowrap',
    fontWeight: 600,
  };

  const handleActionClick = useCallback((action) => (event) => {
    event.stopPropagation();
    action();
  }, []);

  const renderRowActions = useCallback((row) => (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 1 : 1.5,
        width: '100%',
      }}
    >
      {canManageAppointments && (
        <Button
          size="small"
          variant="outlined"
          onClick={handleActionClick(() => openEditDialog(row))}
          sx={{ ...actionButtonSx, color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
          fullWidth={isMobile}
        >
          Edit
        </Button>
      )}
      {canUpdateOutcome && (
        <Button
          size="small"
          variant="contained"
          color="secondary"
          onClick={handleActionClick(() => openCompletionDialog(row))}
          sx={{ ...actionButtonSx }}
          fullWidth={isMobile}
        >
          Update outcome
        </Button>
      )}
      {canManageAppointments && (
        <Button
          size="small"
          color="error"
          variant="contained"
          onClick={handleActionClick(() => handleDeleteAppointment(row.appointment_id))}
          sx={{ ...actionButtonSx }}
          fullWidth={isMobile}
        >
          Delete
        </Button>
      )}
    </Box>
  ), [canManageAppointments, canUpdateOutcome, handleActionClick, handleDeleteAppointment, isMobile, openCompletionDialog, openEditDialog]);

  const appointmentColumns = useMemo(() => {
    const columns = [
    {
      id: 'date',
      label: 'Date',
      type: 'date',
      minWidth: 170,
      valueGetter: (row) => row.date,
      render: (row) => {
        const dateValue = row.date ? new Date(row.date) : null;
        if (!dateValue || Number.isNaN(dateValue.getTime())) {
          return '--';
        }
        return (
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {dateValue.toLocaleDateString('en-GB')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {dateValue.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Typography>
          </Box>
        );
      },
    },
    {
      id: 'patient',
      label: 'Patient',
      minWidth: 180,
      valueGetter: (row) => `${row.first_name || ''} ${row.surname || ''}`.trim(),
      render: (row) => (
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {row.first_name} {row.surname}
          </Typography>
          {row.patient_id && (
            <Typography variant="caption" color="text.secondary">
              #{row.patient_id}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'therapist',
      label: 'Therapist',
      minWidth: 180,
      valueGetter: (row) => getTherapistInfo(row, {
        byId: therapistLookupById,
        byEmployeeId: therapistLookupByEmployeeId,
      }).name,
      render: (row) => {
        const therapist = getTherapistInfo(row, {
          byId: therapistLookupById,
          byEmployeeId: therapistLookupByEmployeeId,
        });
        if (!therapist.name && !therapist.employeeId) {
          return (
            <Typography variant="body2" color="text.secondary">
              Unassigned
            </Typography>
          );
        }
        return (
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {therapist.name || 'Unassigned'}
            </Typography>
            {therapist.employeeId && (
              <Typography variant="caption" color="text.secondary">
                #{therapist.employeeId}
              </Typography>
            )}
          </Box>
        );
      },
    },
    {
      id: 'treatment_description',
      label: 'Treatment',
      minWidth: 200,
      valueGetter: (row) => row.treatment_description || '',
      render: (row) => row.treatment_description || 'No Treatment',
    },
    {
      id: 'treatment_notes',
      label: 'Treatment Notes',
      minWidth: 240,
      sortable: false,
      filterable: false,
      render: (row) => (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
            {buildTreatmentNotePreview(row.treatment_notes)}
          </Typography>
          <Button
            size="small"
            variant="text"
            sx={{ mt: 1, px: 0, minWidth: 0 }}
            onClick={(event) => {
              event.stopPropagation();
              openTreatmentNoteDialog(row);
            }}
          >
            View notes
          </Button>
        </Box>
      ),
    },
    {
      id: 'location',
      label: 'Location',
      minWidth: 140,
    },
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      options: appointmentStatusOptions,
      minWidth: 140,
      render: (row) => formatStatusLabel(row.status),
    },
    {
      id: 'contact',
      label: 'Contact',
      minWidth: 160,
    },
    {
      id: 'paymentStatus',
      label: 'Payment Status',
      type: 'select',
      options: paymentStatusOptions,
      minWidth: 160,
      render: (row) => row.paymentStatus || 'Pending',
    },
    {
      id: 'completion_status',
      label: 'Outcome',
      type: 'select',
      options: outcomeFilterOptions,
      sortable: false,
      minWidth: 200,
      valueGetter: (row) => row.completion_status || row.status || '',
      render: (row) => {
        const outcomeValue = row.completion_status || row.status;
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body2" fontWeight={600}>
              {formatStatusLabel(outcomeValue)}
            </Typography>
            {row.completion_note && (
              <Typography variant="caption" color="text.secondary">
                {row.completion_note}
              </Typography>
            )}
          </Box>
        );
      },
    },
  ];

    if (canManageAppointments || canUpdateOutcome) {
      columns.push({
        id: 'actions',
        label: 'Actions',
        align: 'right',
        sortable: false,
        filterable: false,
        minWidth: isMobile ? 160 : 260,
        render: renderRowActions,
      });
    }

    return columns;
  }, [
    appointmentStatusOptions,
    canManageAppointments,
    canUpdateOutcome,
    formatCurrency,
    isMobile,
    openTreatmentNoteDialog,
    outcomeFilterOptions,
    paymentStatusOptions,
    renderRowActions,
    therapistLookupByEmployeeId,
    therapistLookupById,
  ]);

  const renderAppointmentCard = (row) => {
    const eventDate = row.date ? new Date(row.date) : null;
    const therapist = getTherapistInfo(row, {
      byId: therapistLookupById,
      byEmployeeId: therapistLookupByEmployeeId,
    });
    return (
      <Card variant="outlined" sx={{ backgroundColor: 'rgba(15,23,42,0.6)' }}>
        <CardActionArea onClick={() => openTreatmentNoteDialog(row)} sx={{ textAlign: 'left' }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle1" fontWeight={600}>
                {row.first_name} {row.surname}
              </Typography>
              {row.patient_id && (
                <Typography variant="caption" color="text.secondary">
                  #{row.patient_id}
                </Typography>
              )}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {eventDate
                ? `${eventDate.toLocaleDateString()} · ${eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Date TBC'}
            </Typography>
            <Typography variant="body2">
              {row.treatment_description || 'No Treatment'} · {formatStatusLabel(row.status || row.completion_status)}
            </Typography>
            {row.location && (
              <Typography variant="body2" color="text.secondary">
                {row.location}
              </Typography>
            )}
            {therapist.name && (
              <Typography variant="body2" color="text.secondary">
                Therapist: {therapist.name}
                {therapist.employeeId ? ` (#${therapist.employeeId})` : ''}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
              {buildTreatmentNotePreview(row.treatment_notes, 140)}
            </Typography>
            <Typography variant="caption" color="primary.main" fontWeight={600}>
              Tap to view or edit treatment notes
            </Typography>
          </CardContent>
        </CardActionArea>
        <Box px={2} pb={2}>
          {renderRowActions(row)}
        </Box>
      </Card>
    );
  };

  const selectedPatient = useMemo(() => {
    const selectedId = Number(formState.patient_id);
    if (!selectedId) {
      return undefined;
    }
    return patients.find((patient) => Number(patient.patient_id) === selectedId);
  }, [formState.patient_id, patients]);

  useEffect(() => {
    if (selectedPatient) {
      setPatientInputValue(buildPatientLabel(selectedPatient));
    }
  }, [selectedPatient]);

  const findPreferredTherapistForPatient = useCallback((patient) => {
    if (!patient || !therapistOptions.length) {
      return null;
    }

    const candidateIds = [];
    const primaryTherapist = patient.primaryTherapist;
    if (primaryTherapist) {
      if (typeof primaryTherapist === 'object') {
        candidateIds.push(primaryTherapist.id, primaryTherapist._id, primaryTherapist.userId);
        if (primaryTherapist.employeeID !== undefined && primaryTherapist.employeeID !== null) {
          const numericEmployee = Number(primaryTherapist.employeeID);
          if (!Number.isNaN(numericEmployee)) {
            const match = therapistOptions.find((therapist) => Number(therapist.employeeID) === numericEmployee);
            if (match) {
              return match;
            }
          }
        }
      } else {
        candidateIds.push(primaryTherapist);
      }
    }

    const normalizedIds = candidateIds.filter(Boolean).map(String);
    if (normalizedIds.length) {
      const matchById = therapistOptions.find((therapist) => normalizedIds.includes(String(therapist.id)));
      if (matchById) {
        return matchById;
      }
    }

    const numericPrimaryId = Number(patient.primary_therapist_id);
    if (!Number.isNaN(numericPrimaryId)) {
      const matchByEmployeeId = therapistOptions.find(
        (therapist) => Number(therapist.employeeID) === numericPrimaryId,
      );
      if (matchByEmployeeId) {
        return matchByEmployeeId;
      }
    }

    return null;
  }, [therapistOptions]);

  useEffect(() => {
    if (!selectedPatient || therapistManuallySelected) {
      return;
    }
    const preferred = findPreferredTherapistForPatient(selectedPatient);
    if (preferred) {
      setFormState((prev) => {
        if (prev.therapistId === preferred.id) {
          return prev;
        }
        return {
          ...prev,
          therapistId: preferred.id,
          therapistName: preferred.name || '',
          employeeID: preferred.employeeID ?? '',
        };
      });
    }
  }, [selectedPatient, therapistManuallySelected, findPreferredTherapistForPatient]);

  const therapistSelection = useMemo(() => {
    if (!formState.therapistId) {
      return null;
    }
    return therapistOptions.find((therapist) => therapist.id === formState.therapistId) || null;
  }, [therapistOptions, formState.therapistId]);
  const editTherapistSelection = useMemo(() => {
    if (!editDialog.values.therapistId) {
      return null;
    }
    const match = therapistOptions.find(
      (therapist) => String(therapist.id) === String(editDialog.values.therapistId),
    );
    if (match) {
      return match;
    }
    if (editDialog.appointment) {
      const fallbackName = editDialog.appointment.therapistName
        || editDialog.appointment.therapist_name
        || `Employee #${editDialog.appointment.employeeID || 'assigned'}`;
      return {
        id: editDialog.values.therapistId,
        name: fallbackName,
        employeeID: editDialog.values.employeeID ? Number(editDialog.values.employeeID) : null,
      };
    }
    return null;
  }, [editDialog.appointment, editDialog.values.employeeID, editDialog.values.therapistId, therapistOptions]);

  const formatPatientAddress = useCallback((patient) => {
    if (!patient?.address) {
      return '';
    }

    const { line1, line2, city, state, postcode, country } = patient.address;
    const parts = [line1, line2, city, state, postcode, country].filter(Boolean);
    return parts.join(', ');
  }, []);

  const locationOptions = useMemo(() => {
    const options = [];
    const patientAddress = formatPatientAddress(selectedPatient);
    if (patientAddress) {
      options.push(`Patient Address: ${patientAddress}`);
    }

    options.push('Physio Office');
    return [...new Set(options)];
  }, [selectedPatient, formatPatientAddress]);

  useEffect(() => {
    if (!createOpen) {
      return;
    }
    setFormState((prev) => {
      if (prev.location || !locationOptions.length) {
        return prev;
      }
      return {
        ...prev,
        location: locationOptions[0] || '',
      };
    });
  }, [locationOptions, createOpen]);

  useEffect(() => {
    if (!createOpen) {
      setFormErrors({});
      setSubmitError(null);
    }
  }, [createOpen]);

  useEffect(() => {
    if (!formState.treatment_id || !treatmentOptions.length) {
      setSelectedTreatment(null);
      return;
    }
    const numericId = Number(formState.treatment_id);
    const matched = treatmentOptions.find((option) => Number(option.treatment_id) === numericId);
    if (matched) {
      setSelectedTreatment(matched);
    }
  }, [formState.treatment_id, treatmentOptions]);

  const validateAppointmentForm = useCallback(() => {
    const errors = {};
    if (!formState.patient_id) {
      errors.patient_id = 'Select a patient';
    }
    if (!formState.therapistId) {
      errors.therapistId = 'Select a therapist';
    }
    if (!formState.date) {
      errors.date = 'Choose a date';
    }
    if (!formState.time) {
      errors.time = 'Choose a time';
    }
    if (!formState.location) {
      errors.location = 'Location is required';
    }
    if (!formState.treatment_description) {
      errors.treatment_description = 'Treatment is required';
    }
    const treatmentCount = Number(formState.treatment_count || 1);
    if (Number.isNaN(treatmentCount) || treatmentCount <= 0) {
      errors.treatment_count = 'Sessions must be at least 1';
    }
    const priceValue = Number(formState.price);
    if (formState.price === '' || Number.isNaN(priceValue) || priceValue < 0) {
      errors.price = 'Enter a valid price';
    }
    return errors;
  }, [formState]);

  const handleCreateAppointment = async () => {
    const validationErrors = validateAppointmentForm();
    if (Object.keys(validationErrors).length) {
      setFormErrors(validationErrors);
      return;
    }

    const therapist = therapistSelection;
    if (!therapist) {
      setFormErrors((prev) => ({ ...prev, therapistId: 'Select a therapist' }));
      return;
    }

    const scheduledDate = new Date(`${formState.date}T${formState.time}`);
    if (Number.isNaN(scheduledDate.getTime())) {
      setFormErrors((prev) => ({ ...prev, date: 'Enter a valid date/time' }));
      return;
    }

    let employeeIdValue = null;
    if (formState.employeeID !== '' && formState.employeeID !== null && formState.employeeID !== undefined) {
      const numericEmployeeId = Number(formState.employeeID);
      if (Number.isNaN(numericEmployeeId)) {
        setFormErrors((prev) => ({ ...prev, therapistId: 'Therapist employee ID must be numeric' }));
        return;
      }
      employeeIdValue = numericEmployeeId;
    } else if (typeof therapist.employeeID === 'number') {
      employeeIdValue = therapist.employeeID;
    }

    if (employeeIdValue === null) {
      setSubmitError('The selected therapist does not have an employee ID configured. Update their profile before scheduling.');
      return;
    }

    const priceValue = Number(formState.price);
    const treatmentCountValue = Number(formState.treatment_count || 1);
    const treatmentIdValue = formState.treatment_id ? Number(formState.treatment_id) : Date.now();

    setSubmitting(true);
    setFormErrors({});
    setSubmitError(null);
    try {
      const payload = {
        ...formState,
        appointment_id: undefined,
        patient_id: Number(formState.patient_id),
        employeeID: employeeIdValue,
        therapistId: therapist.id,
        date: scheduledDate.toISOString(),
        treatment_id: Number.isNaN(treatmentIdValue) ? Date.now() : treatmentIdValue,
        price: priceValue,
        treatment_count: treatmentCountValue,
        sendConfirmationEmail: formState.sendConfirmationEmail !== false,
      };

      await apiClient.post('/api/appointments', payload);
      setCreateOpen(false);
      setSubmitSuccess('Appointment scheduled successfully');
      setFormState((prev) => ({
        patient_id: '',
        date: '',
        time: '',
        location: '',
        room: '',
        treatment_description: '',
        treatment_id: '',
        treatment_count: 1,
        price: 0,
        employeeID: prev.employeeID,
        therapistName: prev.therapistName,
        therapistId: prev.therapistId,
        sendConfirmationEmail: true,
      }));
      setPatientInputValue('');
      setSelectedTreatment(null);
      setTherapistManuallySelected(false);
      refreshAppointments();
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to create appointment';
      setSubmitError(message);
      console.error('Failed to create appointment', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <CircularProgress />;
  }

  if (error) {
    return <Typography variant="h6">Error loading appointments</Typography>;
  }

  return (
    <Card
      className={classes.card}
      sx={{
        flex: 1,
        minHeight: 'calc(100vh - 220px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CardContent
        className={classes.cardContent}
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: isMobile ? 2 : 3,
          py: { xs: 2, md: 3 },
          px: { xs: 1.5, md: 2 },
        }}
      >
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems={isMobile ? 'stretch' : 'center'}
          flexDirection={isMobile ? 'column' : 'row'}
          gap={2}
        >
          <Typography variant="h5" gutterBottom>
            Appointments
          </Typography>
          {canManageAppointments && (
            <Button
              variant="contained"
              onClick={() => {
                setFormErrors({});
                setSubmitError(null);
                setCreateOpen(true);
              }}
              fullWidth={isMobile}
            >
              Schedule Appointment
            </Button>
          )}
        </Box>
        <Divider />
        <TextField
          label="Search"
          variant="outlined"
          className={classes.searchField}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by patient name or treatment"
        />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
            mt: -1,
            mb: 1,
          }}
        >
          <FormControlLabel
            control={(
              <Checkbox
                size="small"
                checked={showAllAppointments}
                onChange={(event) => setShowAllAppointments(event.target.checked)}
              />
            )}
            label="Show all appointments"
            sx={{ marginRight: 0 }}
          />
          {!showAllAppointments && (
            <Typography variant="caption" color="text.secondary">
              Showing scheduled appointments
            </Typography>
          )}
        </Box>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <DataTable
            columns={appointmentColumns}
            rows={filteredAppointments}
            getRowId={(row) => row.appointment_id}
            maxHeight="100%"
            containerSx={{ height: '100%' }}
            emptyMessage="No appointments match your filters."
            defaultOrderBy="date"
            defaultOrder="desc"
            renderMobileCard={renderAppointmentCard}
            onRowClick={openTreatmentNoteDialog}
          />
        </Box>
      </CardContent>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Schedule Appointment</DialogTitle>
        <DialogContent dividers>
          {(therapistsError || submitError) && (
            <Box mb={2}>
              {therapistsError && (
                <Alert severity="warning">
                  {therapistsError}. Showing any cached or fallback therapist options.
                </Alert>
              )}
              {submitError && (
                <Box mt={therapistsError ? 2 : 0}>
                  <Alert severity="error">{submitError}</Alert>
                </Box>
              )}
            </Box>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Autocomplete
                options={patients}
                value={selectedPatient || null}
                inputValue={patientInputValue}
                onInputChange={(event, newInputValue, reason) => {
                  setPatientInputValue(newInputValue);
                  if ((reason === 'clear' || newInputValue === '') && formState.patient_id) {
                    setFormState((prev) => ({ ...prev, patient_id: '' }));
                  }
                }}
                onChange={(event, newValue) => {
                  setFormState((prev) => {
                    const preferred = findPreferredTherapistForPatient(newValue);
                    return {
                      ...prev,
                      patient_id: newValue?.patient_id ?? '',
                      therapistId: preferred?.id ?? prev.therapistId,
                      therapistName: preferred?.name ?? prev.therapistName,
                      employeeID: preferred?.employeeID ?? prev.employeeID,
                    };
                  });
                  setFormErrors((prev) => ({ ...prev, patient_id: undefined }));
                  setTherapistManuallySelected(false);
                  if (newValue) {
                    setPatientInputValue(buildPatientLabel(newValue));
                  }
                }}
                getOptionLabel={buildPatientLabel}
                isOptionEqualToValue={(option, value) =>
                  Number(option?.patient_id) === Number(value?.patient_id)
                }
                loading={patientsLoading}
                loadingText="Loading patients..."
                noOptionsText={patientInputValue ? 'No matching patients' : 'No patients available'}
                renderOption={(props, option) => (
                  <li {...props}>
                    <Box display="flex" flexDirection="column">
                      <Typography variant="body2">{buildPatientLabel(option)}</Typography>
                      {option.email && (
                        <Typography variant="caption" color="text.secondary">
                          {option.email}
                        </Typography>
                      )}
                    </Box>
                  </li>
                )}
                sx={{ width: '100%' }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Patient"
                    required
                    error={Boolean(formErrors.patient_id)}
                    helperText={formErrors.patient_id || 'Start typing to search patients'}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                options={therapistOptions}
                value={therapistSelection}
                onChange={(event, newValue) => {
                  setFormState((prev) => ({
                    ...prev,
                    therapistId: newValue?.id || '',
                    employeeID: newValue?.employeeID ?? '',
                    therapistName: newValue?.name || '',
                  }));
                  setFormErrors((prev) => ({ ...prev, therapistId: undefined }));
                  setTherapistManuallySelected(Boolean(newValue));
                }}
                loading={therapistsLoading}
                disabled={!therapistOptions.length}
                getOptionLabel={(option) => {
                  if (!option) {
                    return '';
                  }
                  if (option.employeeID) {
                    return `${option.name} (${option.employeeID})`;
                  }
                  return option.name || '';
                }}
                isOptionEqualToValue={(option, value) => option?.id === value?.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Therapist"
                    placeholder="Select therapist"
                    required
                    error={Boolean(formErrors.therapistId)}
                    helperText={formErrors.therapistId}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Date"
                type="date"
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                value={formState.date}
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, date: value }));
                  setFormErrors((prev) => ({ ...prev, date: undefined }));
                }}
                error={Boolean(formErrors.date)}
                helperText={formErrors.date}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Time"
                type="time"
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                value={formState.time}
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, time: value }));
                  setFormErrors((prev) => ({ ...prev, time: undefined }));
                }}
                error={Boolean(formErrors.time)}
                helperText={formErrors.time}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                freeSolo
                options={locationOptions}
                value={formState.location || ''}
                onChange={(event, newValue) => {
                  if (typeof newValue === 'string') {
                    setFormState((prev) => ({ ...prev, location: newValue }));
                  } else {
                    setFormState((prev) => ({ ...prev, location: newValue || '' }));
                  }
                  setFormErrors((prev) => ({ ...prev, location: undefined }));
                }}
                onInputChange={(event, newInput) => {
                  setFormState((prev) => ({ ...prev, location: newInput }));
                  if (event?.type === 'change' || event?.type === 'input') {
                    setFormErrors((prev) => ({ ...prev, location: undefined }));
                  }
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Location"
                    fullWidth
                    placeholder="Enter or choose a location"
                    required
                    error={Boolean(formErrors.location)}
                    helperText={formErrors.location}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Room"
                fullWidth
                value={formState.room}
                onChange={(event) => setFormState((prev) => ({ ...prev, room: event.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                freeSolo
                options={treatmentOptions}
                value={selectedTreatment || formState.treatment_description || ''}
                getOptionLabel={(option) => {
                  if (typeof option === 'string') {
                    return option;
                  }
                  return option?.description || '';
                }}
                isOptionEqualToValue={(option, value) => {
                  if (typeof value === 'string') {
                    return option.description === value;
                  }
                  return option.treatment_id === value.treatment_id;
                }}
                onChange={(event, newValue) => {
                  if (typeof newValue === 'string') {
                    setSelectedTreatment(null);
                    setFormState((prev) => ({
                      ...prev,
                      treatment_description: newValue,
                      treatment_id: '',
                    }));
                  } else if (newValue && newValue.description) {
                    setSelectedTreatment(newValue);
                    setFormState((prev) => ({
                      ...prev,
                      treatment_description: newValue.description,
                      treatment_id: newValue.treatment_id || '',
                      price: newValue.price !== undefined ? Number(newValue.price) : prev.price,
                    }));
                  } else {
                    setSelectedTreatment(null);
                    setFormState((prev) => ({
                      ...prev,
                      treatment_description: '',
                      treatment_id: '',
                    }));
                  }
                  setFormErrors((prev) => ({ ...prev, treatment_description: undefined }));
                }}
                onInputChange={(event, newInputValue) => {
                  if (event?.type === 'change' || event?.type === 'input') {
                    setFormState((prev) => ({
                      ...prev,
                      treatment_description: newInputValue,
                    }));
                    setFormErrors((prev) => ({ ...prev, treatment_description: undefined }));
                  }
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Treatment"
                    fullWidth
                    placeholder="Select or type a treatment"
                    required
                    error={Boolean(formErrors.treatment_description)}
                    helperText={formErrors.treatment_description}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Treatment Code"
                fullWidth
                value={formState.treatment_id}
                onChange={(event) => setFormState((prev) => ({ ...prev, treatment_id: event.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                label="Sessions"
                type="number"
                fullWidth
                required
                inputProps={{ min: 1 }}
                value={formState.treatment_count}
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, treatment_count: value }));
                  setFormErrors((prev) => ({ ...prev, treatment_count: undefined }));
                }}
                error={Boolean(formErrors.treatment_count)}
                helperText={formErrors.treatment_count}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                label="Price"
                type="number"
                fullWidth
                required
                inputProps={{ min: 0, step: 0.01 }}
                value={formState.price}
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, price: value }));
                  setFormErrors((prev) => ({ ...prev, price: undefined }));
                }}
                error={Boolean(formErrors.price)}
                helperText={formErrors.price}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={formState.sendConfirmationEmail}
                    onChange={(event) => setFormState((prev) => ({
                      ...prev,
                      sendConfirmationEmail: event.target.checked,
                    }))}
                  />
                )}
                label="Send confirmation email"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={submitting} sx={{ color: '#fff' }}>
            Cancel
          </Button>
          <Button onClick={handleCreateAppointment} variant="contained" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Appointment'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={editDialog.open} onClose={closeEditDialog} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Edit Appointment</DialogTitle>
        <DialogContent dividers>
          {editDialog.submitError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editDialog.submitError}
            </Alert>
          )}
          {editDialog.appointment && (
            <Box mb={2}>
              <Typography variant="subtitle1" fontWeight={600}>
                {editDialog.appointment.first_name} {editDialog.appointment.surname}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Appointment #{editDialog.appointment.appointment_id}
              </Typography>
            </Box>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Autocomplete
                options={therapistOptions}
                value={editTherapistSelection}
                onChange={(event, newValue) => {
                  setEditDialog((prev) => ({
                    ...prev,
                    values: {
                      ...prev.values,
                      therapistId: newValue?.id || '',
                      employeeID: newValue?.employeeID ?? '',
                    },
                    errors: {
                      ...prev.errors,
                      therapistId: undefined,
                    },
                    submitError: '',
                  }));
                }}
                loading={therapistsLoading}
                disabled={!therapistOptions.length}
                getOptionLabel={(option) => {
                  if (!option) {
                    return '';
                  }
                  if (option.employeeID) {
                    return `${option.name} (${option.employeeID})`;
                  }
                  return option.name || '';
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Therapist"
                    required
                    error={Boolean(editDialog.errors.therapistId)}
                    helperText={editDialog.errors.therapistId}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Date"
                type="date"
                fullWidth
                value={editDialog.values.date}
                onChange={(event) => handleEditFieldChange('date', event.target.value)}
                InputLabelProps={{ shrink: true }}
                error={Boolean(editDialog.errors.date)}
                helperText={editDialog.errors.date}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Time"
                type="time"
                fullWidth
                value={editDialog.values.time}
                onChange={(event) => handleEditFieldChange('time', event.target.value)}
                InputLabelProps={{ shrink: true }}
                error={Boolean(editDialog.errors.time)}
                helperText={editDialog.errors.time}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Location"
                fullWidth
                value={editDialog.values.location}
                onChange={(event) => handleEditFieldChange('location', event.target.value)}
                error={Boolean(editDialog.errors.location)}
                helperText={editDialog.errors.location}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Room"
                fullWidth
                value={editDialog.values.room}
                onChange={(event) => handleEditFieldChange('room', event.target.value)}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Treatment"
                fullWidth
                value={editDialog.values.treatment_description}
                onChange={(event) => handleEditFieldChange('treatment_description', event.target.value)}
                error={Boolean(editDialog.errors.treatment_description)}
                helperText={editDialog.errors.treatment_description}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Sessions"
                type="number"
                fullWidth
                inputProps={{ min: 1 }}
                value={editDialog.values.treatment_count}
                onChange={(event) => handleEditFieldChange('treatment_count', event.target.value)}
                error={Boolean(editDialog.errors.treatment_count)}
                helperText={editDialog.errors.treatment_count}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Price"
                type="number"
                fullWidth
                inputProps={{ min: 0, step: 0.01 }}
                value={editDialog.values.price}
                onChange={(event) => handleEditFieldChange('price', event.target.value)}
                error={Boolean(editDialog.errors.price)}
                helperText={editDialog.errors.price}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditDialog} disabled={editDialog.submitting} sx={{ color: '#fff' }}>
            Cancel
          </Button>
          <Button onClick={handleEditAppointment} variant="contained" disabled={editDialog.submitting}>
            {editDialog.submitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={completionDialog.open} onClose={closeCompletionDialog} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Update appointment outcome</DialogTitle>
        <DialogContent dividers>
          <RadioGroup
            value={completionDialog.outcome}
            onChange={(event) => setCompletionDialog((prev) => ({ ...prev, outcome: event.target.value }))}
          >
            {COMPLETION_OUTCOME_OPTIONS.map((option) => (
              <FormControlLabel key={option.value} value={option.value} control={<Radio />} label={option.label} />
            ))}
          </RadioGroup>
          {completionDialog.outcome === 'other' && (
            <TextField
              label="Outcome note"
              value={completionDialog.note}
              onChange={(event) => setCompletionDialog((prev) => ({ ...prev, note: event.target.value }))}
              fullWidth
              multiline
              minRows={3}
              sx={{ mt: 2 }}
            />
          )}
          {completionDialog.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {completionDialog.error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCompletionDialog} disabled={completionDialog.submitting} sx={{ color: '#fff' }}>
            Cancel
          </Button>
          <Button onClick={submitCompletionOutcome} variant="contained" disabled={completionDialog.submitting}>
            {completionDialog.submitting ? 'Saving...' : 'Save Outcome'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={noteDialog.open} onClose={closeNoteDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Treatment notes</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {noteDialog.appointment && (
            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                {buildPatientLabel(noteDialog.appointment)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {(noteDialog.appointment.date && !Number.isNaN(new Date(noteDialog.appointment.date).getTime()))
                  ? new Date(noteDialog.appointment.date).toLocaleString()
                  : 'Date TBC'}
                {' · '}
                {getTherapistInfo(noteDialog.appointment, {
                  byId: therapistLookupById,
                  byEmployeeId: therapistLookupByEmployeeId,
                }).name || 'Unassigned therapist'}
              </Typography>
            </Box>
          )}
          <TextField
            label="Treatment notes"
            multiline
            minRows={4}
            value={noteDialog.value}
            onChange={(event) => {
              if (!canEditTreatmentNotes) {
                return;
              }
              const { value } = event.target;
              setNoteDialog((prev) => ({ ...prev, value }));
            }}
            fullWidth
            InputProps={{ readOnly: !canEditTreatmentNotes }}
            placeholder="Add treatment notes"
            helperText={
              canEditTreatmentNotes ? 'Notes are shared with the patient record.' : 'View-only access.'
            }
          />
          {noteDialog.error && (
            <Alert severity="error">
              {noteDialog.error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeNoteDialog} disabled={noteDialog.saving} sx={{ color: '#fff' }}>
            Close
          </Button>
          {canEditTreatmentNotes && (
            <Button onClick={handleSaveTreatmentNotes} variant="contained" disabled={noteDialog.saving}>
              {noteDialog.saving ? 'Saving...' : 'Save Notes'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
      <InvoiceBuilderDialog
        open={manualInvoiceDialog.open}
        onClose={closeManualInvoiceDialog}
        onSuccess={handleManualInvoiceCreated}
        initialPatientId={manualInvoiceDialog.appointment?.patient_id}
        initialAppointmentIds={
          manualInvoiceDialog.appointment
            ? [manualInvoiceDialog.appointment.appointment_id]
            : []
        }
        lockPatient
        title="Adjust Invoice"
        defaultSendEmail
      />
      <Snackbar
        open={Boolean(submitSuccess)}
        autoHideDuration={4000}
        onClose={() => setSubmitSuccess('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSubmitSuccess('')} sx={{ width: '100%' }}>
          {submitSuccess}
        </Alert>
      </Snackbar>
    </Card>
  );
};

export default Appointments;

