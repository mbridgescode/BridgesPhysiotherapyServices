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
  { value: 'cancelled_reschedule', label: 'Cancelled (delete or reschedule)' },
  { value: 'other', label: 'Other (add note)' },
];

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

  useEffect(() => {
    let isMounted = true;
    const loadPatients = async () => {
      setPatientsLoading(true);
      try {
        const response = await apiClient.get('/api/patients', { params: { limit: 200 } });
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
  }, []);

  const therapistOptions = useMemo(() => {
    if (therapists.length) {
      return therapists;
    }
    if (userData) {
      return [{
        id: userData.id || 'current-user',
        name: userData.username,
        employeeID: userData.employeeID ?? null,
        role: userData.role,
      }];
    }
    return [];
  }, [therapists, userData]);

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

  const handleCancelAppointment = async (appointmentId) => {
    try {
      await apiClient.patch(`/api/appointments/${appointmentId}/cancel`, { reason: 'Cancelled via dashboard' });
      refreshAppointments();
    } catch (err) {
      console.error('Failed to cancel appointment', err);
    }
  };

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

  const openCompletionDialog = (appointment) => {
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
  };

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
      closeCompletionDialog();
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
    if (!normalizedSearch) {
      return appointments;
    }
    return appointments.filter((appointment) => {
      const name = `${appointment.first_name || ''} ${appointment.surname || ''}`.toLowerCase().trim();
      const treatment = (appointment.treatment_description || '').toLowerCase();
      return name.includes(normalizedSearch) || treatment.includes(normalizedSearch);
    });
  }, [appointments, searchTerm]);

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

  const appointmentColumns = [
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
      id: 'treatment_description',
      label: 'Treatment',
      minWidth: 200,
      valueGetter: (row) => row.treatment_description || '',
      render: (row) => row.treatment_description || 'No Treatment',
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

  const canManageAppointments = ['admin', 'receptionist'].includes(userData?.role);
  const canUpdateOutcome = ['admin', 'therapist'].includes(userData?.role);

  const renderRowActions = (row) => (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isMobile ? 'stretch' : 'flex-end',
        alignItems: 'stretch',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 1,
      }}
    >
      {canUpdateOutcome && (
        <Button
          size="small"
          variant="outlined"
          onClick={() => openCompletionDialog(row)}
          sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
          fullWidth={isMobile}
        >
          Update outcome
        </Button>
      )}
      {canManageAppointments && (
        <Button
          size="small"
          color="warning"
          onClick={() => handleCancelAppointment(row.appointment_id)}
          disabled={row.status === 'cancelled'}
          sx={{ color: '#fff', whiteSpace: 'nowrap' }}
          fullWidth={isMobile}
        >
          Cancel
        </Button>
      )}
    </Box>
  );

  const renderAppointmentCard = (row) => {
    const eventDate = row.date ? new Date(row.date) : null;
    return (
      <Card variant="outlined" sx={{ backgroundColor: 'rgba(15,23,42,0.6)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
          {row.completion_note && (
            <Typography variant="caption" color="text.secondary">
              Note: {row.completion_note}
            </Typography>
          )}
          {renderRowActions(row)}
        </CardContent>
      </Card>
    );
  };

  if (canManageAppointments || canUpdateOutcome) {
    appointmentColumns.push({
      id: 'actions',
      label: 'Actions',
      align: 'right',
      sortable: false,
      filterable: false,
      minWidth: 120,
      render: renderRowActions,
    });
  }

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
          p: { xs: 2, md: 3 },
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
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
