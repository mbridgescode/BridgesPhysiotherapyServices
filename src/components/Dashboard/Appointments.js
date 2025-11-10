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
} from '@mui/material';
import { makeStyles } from '@mui/styles';
import apiClient from '../../utils/apiClient';
import { AppointmentsContext } from '../../context/AppointmentsContext';
import Autocomplete from '@mui/material/Autocomplete';
import useTherapists from '../../hooks/useTherapists';
import DataTable from '../common/DataTable';

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

const Appointments = ({ userData }) => {
  const classes = useStyles();
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

  // Handle appointment completion toggle
  const handleCompleteToggle = async (appointment_id, isCompleted) => {
    try {
      const response = await apiClient.post(
        '/api/appointments/complete',
        { appointment_id, completed: !isCompleted },
      );

      if (response.status === 200) {
        // Update the local state
        setAppointments((prevAppointments) =>
          prevAppointments.map((appointment) =>
            appointment.appointment_id === appointment_id
              ? {
                ...appointment,
                completed: !isCompleted,
                status: !isCompleted ? 'completed' : 'scheduled',
              }
              : appointment
          )
        );
        refreshAppointments();
      }
    } catch (error) {
      console.error('Error toggling appointment complete status:', error.response ? error.response.data : error.message);
    }
  };

  const handleCancelAppointment = async (appointmentId) => {
    try {
      await apiClient.patch(`/api/appointments/${appointmentId}/cancel`, { reason: 'Cancelled via dashboard' });
      refreshAppointments();
    } catch (err) {
      console.error('Failed to cancel appointment', err);
    }
  };

  const filteredAppointments = appointments.filter(
    (appointment) =>
      appointment.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appointment.surname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (appointment.treatment_description && appointment.treatment_description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
        label: status.charAt(0).toUpperCase() + status.slice(1),
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
      id: 'completed',
      label: 'Complete',
      sortable: false,
      filterable: false,
      minWidth: 80,
      render: (row) => (
        <Checkbox
          checked={row.completed}
          onChange={() => handleCompleteToggle(row.appointment_id, row.completed)}
        />
      ),
    },
  ];

  const canManageAppointments = ['admin', 'receptionist'].includes(userData?.role);

  if (canManageAppointments) {
    appointmentColumns.push({
      id: 'actions',
      label: 'Actions',
      align: 'right',
      sortable: false,
      filterable: false,
      minWidth: 120,
      render: (row) => (
        <Button
          size="small"
          color="warning"
          onClick={() => handleCancelAppointment(row.appointment_id)}
          disabled={row.status === 'cancelled'}
          sx={{ color: '#fff' }}
        >
          Cancel
        </Button>
      ),
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
        sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center">
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
          />
        </Box>
      </CardContent>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
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
                  setFormState((prev) => ({ ...prev, patient_id: newValue?.patient_id ?? '' }));
                  setFormErrors((prev) => ({ ...prev, patient_id: undefined }));
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
