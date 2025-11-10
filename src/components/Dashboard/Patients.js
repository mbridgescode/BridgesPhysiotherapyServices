// src/components/Dashboard/Patients.js

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Divider,
  CircularProgress,
  IconButton,
  Tooltip,
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
import { useNavigate } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import apiClient from '../../utils/apiClient';
import {
  getAuthToken,
  subscribeToAuthToken,
} from '../../utils/authEvents';
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
  searchIcon: {
    position: 'absolute',
    right: theme.spacing(2),
    top: 'calc(50% - 12px)',
  },
  patientDetails: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.default,
    borderRadius: theme.shape.borderRadius,
  },
}));

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const normalizedStatus = (value) => {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (normalized === 'archived') {
    return 'archived';
  }
  if (normalized === 'inactive') {
    return 'archived';
  }
  return 'active';
};

const createEmptyFormState = () => ({
  first_name: '',
  surname: '',
  email: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  address_city: '',
  address_state: '',
  address_postcode: '',
  primary_contact_name: '',
  primary_contact_email: '',
  primary_contact_phone: '',
  status: 'active',
  preferred_name: '',
  date_of_birth: '',
  primaryTherapistId: '',
});

const Patients = ({ userData }) => {
  const classes = useStyles();
  const [searchTerm, setSearchTerm] = useState('');
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(() => getAuthToken());
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [editingPatient, setEditingPatient] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deletingPatient, setDeletingPatient] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const { therapists, loading: therapistsLoading, error: therapistsError } = useTherapists();
  const [formState, setFormState] = useState(() => createEmptyFormState());
  const navigate = useNavigate();
  const therapistOptions = useMemo(() => therapists, [therapists]);
  const therapistNameByEmployeeOrId = useMemo(() => {
    const map = new Map();
    therapistOptions.forEach((therapist) => {
      if (therapist.id) {
        map.set(String(therapist.id), therapist.name);
      }
      if (therapist.employeeID !== null && therapist.employeeID !== undefined) {
        map.set(Number(therapist.employeeID), therapist.name);
      }
    });
    return map;
  }, [therapistOptions]);
  const primaryTherapistSelection = useMemo(
    () => therapistOptions.find((therapist) => therapist.id === formState.primaryTherapistId) || null,
    [therapistOptions, formState.primaryTherapistId],
  );

  useEffect(() => {
    const unsubscribe = subscribeToAuthToken(() => {
      setToken(getAuthToken());
    });

    const handleStorage = () => setToken(getAuthToken());

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorage);
    }

    return () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorage);
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchPatients = async () => {
      if (!token) {
        setPatients([]);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      try {
        const response = await apiClient.get('/api/patients');
        if (isMounted) {
          setPatients(response.data.patients || []);
          setError(null);
        }
      } catch (err) {
        console.error('Error fetching patients:', err);
        if (isMounted) {
          setError('Failed to load patients');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchPatients();

    return () => {
      isMounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (!formOpen) {
      setFormErrors({});
      setSubmitError(null);
      setFormState(createEmptyFormState());
      setEditingPatient(null);
      setFormMode('create');
    }
  }, [formOpen]);

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

    const primaryContactName = formState.primary_contact_name.trim();
    const primaryContactEmail = formState.primary_contact_email.trim();
    const primaryContactPhone = formState.primary_contact_phone.trim();
    const hasPrimaryContact = Boolean(primaryContactName || primaryContactEmail || primaryContactPhone);
    if (hasPrimaryContact) {
      if (!primaryContactName) {
        errors.primary_contact_name = 'Primary contact name is required when adding a contact';
      }
      if (!primaryContactEmail) {
        errors.primary_contact_email = 'Primary contact email is required when adding a contact';
      }
      if (!primaryContactPhone) {
        errors.primary_contact_phone = 'Primary contact phone is required when adding a contact';
      }
    }

    return errors;
  }, [formState]);

  const formatPatientAddress = useCallback((address) => {
    if (!address) {
      return '';
    }
    const parts = [
      address.line1,
      address.line2,
      address.city,
      address.state,
      address.postcode,
      address.country,
    ]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean);
    return parts.join(', ');
  }, []);

  const filteredPatients = useMemo(
    () =>
      patients.filter((patient) => {
        const searchValue = searchTerm.toLowerCase();
        const matchesCore = [
          patient.first_name,
          patient.surname,
          patient.email,
          patient.phone,
          patient.primary_contact_name,
          patient.primary_contact_email,
          patient.primary_contact_phone,
          patient.status,
          patient.primaryTherapist?.username,
          formatPatientAddress(patient.address),
        ].some((field) => field?.toLowerCase().includes(searchValue));

        const matchesAppointment = patient.appointments?.some(
          (appointment) =>
            appointment.treatment_description?.toLowerCase().includes(searchValue),
        );

        return matchesCore || matchesAppointment;
      }),
    [patients, searchTerm, formatPatientAddress],
  );

  const patientStatusOptions = STATUS_OPTIONS;

  const handleViewDetails = useCallback((patientId) => {
    navigate(`/dashboard/patients/${patientId}`);
  }, [navigate]);

  const canManagePatients = ['admin', 'receptionist'].includes(userData?.role);
  const canDeletePatients = userData?.role === 'admin';

  const formatPrimaryTherapist = useCallback((row) => {
    if (row.primaryTherapist?.username) {
      const suffix = row.primaryTherapist.employeeID ? ` (#${row.primaryTherapist.employeeID})` : '';
      return `${row.primaryTherapist.username}${suffix}`;
    }

    if (row.primary_therapist_id !== undefined && row.primary_therapist_id !== null) {
      const therapistName =
        therapistNameByEmployeeOrId.get(Number(row.primary_therapist_id))
        || therapistNameByEmployeeOrId.get(String(row.primary_therapist_id));
      if (therapistName) {
        return `${therapistName} (#${row.primary_therapist_id})`;
      }
      return `#${row.primary_therapist_id}`;
    }

    if (row.primaryTherapist?.name) {
      return row.primaryTherapist.name;
    }

    return 'Unassigned';
  }, [therapistNameByEmployeeOrId]);

  const handleCloseForm = () => {
    if (submitting) {
      return;
    }
    setFormOpen(false);
  };

  const handleStartCreate = () => {
    setFormMode('create');
    setEditingPatient(null);
    setFormErrors({});
    setSubmitError(null);
    setFormState(createEmptyFormState());
    setFormOpen(true);
  };

  const handleStartEdit = (patient) => {
    setFormMode('edit');
    setEditingPatient(patient);
    setFormErrors({});
    setSubmitError(null);
    setFormState({
      first_name: patient.first_name || '',
      surname: patient.surname || '',
      email: patient.email || '',
      phone: patient.phone || '',
      address_line1: patient.address?.line1 || '',
      address_line2: patient.address?.line2 || '',
      address_city: patient.address?.city || '',
      address_state: patient.address?.state || '',
      address_postcode: patient.address?.postcode || '',
      primary_contact_name: patient.primary_contact_name || '',
      primary_contact_email: patient.primary_contact_email || '',
      primary_contact_phone: patient.primary_contact_phone || '',
      status: normalizedStatus(patient.status),
      preferred_name: patient.preferred_name || '',
      date_of_birth: patient.date_of_birth
        ? new Date(patient.date_of_birth).toISOString().split('T')[0]
        : '',
      primaryTherapistId: (() => {
        const therapistId = patient.primaryTherapist?._id || patient.primaryTherapist?.id;
        return therapistId ? String(therapistId) : '';
      })(),
    });
    setFormOpen(true);
  };

  if (loading) {
    return <CircularProgress />;
  }

  if (error) {
    return <Typography variant="h6">Error loading data</Typography>;
  }

  const patientColumns = [
    {
      id: 'first_name',
      label: 'First Name',
      minWidth: 140,
    },
    {
      id: 'surname',
      label: 'Surname',
      minWidth: 140,
    },
    {
      id: 'email',
      label: 'Email',
      minWidth: 210,
    },
    {
      id: 'phone',
      label: 'Phone',
      minWidth: 150,
    },
    {
      id: 'address',
      label: 'Address',
      minWidth: 240,
      valueGetter: (row) => formatPatientAddress(row.address),
      render: (row) => formatPatientAddress(row.address) || '--',
    },
    {
      id: 'primary_contact_name',
      label: 'Primary Contact Name',
      minWidth: 200,
      render: (row) => row.primary_contact_name || '--',
    },
    {
      id: 'primary_contact_email',
      label: 'Primary Contact Email',
      minWidth: 220,
    },
    {
      id: 'primary_contact_phone',
      label: 'Primary Contact Phone',
      minWidth: 180,
    },
    {
      id: 'status',
      label: 'Status (Active / Archived)',
      type: 'select',
      options: patientStatusOptions,
      minWidth: 140,
      valueGetter: (row) => normalizedStatus(row.status),
      render: (row) => {
        const status = normalizedStatus(row.status);
        return status === 'archived' ? 'Archived' : 'Active';
      },
    },
    {
      id: 'primaryTherapist',
      label: 'Primary Therapist',
      minWidth: 220,
      valueGetter: (row) => formatPrimaryTherapist(row),
      render: (row) => formatPrimaryTherapist(row),
    },
    {
      id: 'upcomingAppointment',
      label: 'Next Appointment',
      type: 'date',
      minWidth: 190,
      valueGetter: (row) => row.upcomingAppointment?.date || '',
      render: (row) =>
        row.upcomingAppointment
          ? new Date(row.upcomingAppointment.date).toLocaleString()
          : 'None',
    },
    {
      id: 'details',
      label: 'View Details',
      sortable: false,
      filterable: false,
      align: 'center',
      minWidth: 120,
      render: (row) => (
        <Button
          size="small"
          onClick={() => handleViewDetails(row.patient_id)}
          sx={{ color: '#fff' }}
        >
          View Details
        </Button>
      ),
    },
  ];

  if (canManagePatients || canDeletePatients) {
    patientColumns.push({
      id: 'actions',
      label: 'Actions',
      sortable: false,
      filterable: false,
      align: 'center',
      minWidth: 140,
      render: (row) => (
        <Box display="flex" justifyContent="center" gap={1}>
          {canManagePatients && (
            <Tooltip title="Edit patient">
              <span>
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => handleStartEdit(row)}
                >
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}
          {canDeletePatients && (
            <Tooltip
              title={row.status === 'archived' ? 'Patient already archived' : 'Delete patient'}
            >
              <span>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => {
                    if (row.status === 'archived') {
                      return;
                    }
                    setDeleteCandidate(row);
                    setDeleteError('');
                  }}
                  disabled={row.status === 'archived'}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>
      ),
    });
  }

  const handleSubmitPatient = async () => {
    const validationErrors = validatePatientForm();
    if (Object.keys(validationErrors).length) {
      setFormErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
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
      const addressPayload = {
        line1: formState.address_line1.trim(),
        line2: formState.address_line2.trim(),
        city: formState.address_city.trim(),
        state: formState.address_state.trim(),
        postcode: formState.address_postcode.trim(),
      };
      const hasAddress = Object.values(addressPayload).some(Boolean);
      const shouldClearAddress = formMode === 'edit'
        && Boolean(editingPatient?.address)
        && !hasAddress;

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
      let response;
      if (formMode === 'edit' && editingPatient) {
        response = await apiClient.put(`/api/patients/${editingPatient.patient_id}`, payload);
        if (response?.data?.patient) {
          setPatients((prev) =>
            prev.map((patient) =>
              patient.patient_id === editingPatient.patient_id ? response.data.patient : patient,
            ),
          );
        }
        setSubmitSuccess('Patient updated successfully');
      } else {
        response = await apiClient.post('/api/patients', payload);
        if (response?.data?.patient) {
          setPatients((prev) => [response.data.patient, ...prev]);
        }
        setSubmitSuccess('Patient added successfully');
      }
      setFormOpen(false);
      setFormErrors({});
      setFormState(createEmptyFormState());
      setEditingPatient(null);
    } catch (err) {
      const message = err?.response?.data?.message
        || `Failed to ${formMode === 'edit' ? 'update' : 'create'} patient`;
      console.error('Failed to save patient', err);
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseDeleteDialog = () => {
    if (deletingPatient) {
      return;
    }
    setDeleteCandidate(null);
    setDeleteError('');
  };

  const handleDeletePatient = async () => {
    if (!deleteCandidate) {
      return;
    }
    setDeletingPatient(true);
    setDeleteError('');
    try {
      const response = await apiClient.delete(`/api/patients/${deleteCandidate.patient_id}`);
      const updatedPatient = response.data?.patient;
      if (updatedPatient) {
        setPatients((prev) =>
          prev.map((patient) =>
            patient.patient_id === updatedPatient.patient_id ? updatedPatient : patient,
          ),
        );
      } else {
        setPatients((prev) => prev.filter((patient) => patient.patient_id !== deleteCandidate.patient_id));
      }
      setSubmitSuccess('Patient archived successfully');
      setDeleteCandidate(null);
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to delete patient';
      setDeleteError(message);
    } finally {
      setDeletingPatient(false);
    }
  };

  return (
    <Box
      sx={{
        flex: 1,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 'calc(100vh - 160px)',
      }}
    >
      <Card className={classes.card} sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <CardContent
          className={classes.cardContent}
          sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        >
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h5" gutterBottom>
              Patients
            </Typography>
            {canManagePatients && (
            <Button
              variant="contained"
              onClick={handleStartCreate}
            >
              Add Patient
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
          InputProps={{
            endAdornment: (
              <Tooltip title="Search">
                <IconButton>
                  <SearchIcon className={classes.searchIcon} />
                </IconButton>
              </Tooltip>
            ),
          }}
        />
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <DataTable
            columns={patientColumns}
            rows={filteredPatients}
            getRowId={(row) => row.patient_id}
            maxHeight="100%"
            containerSx={{ height: '100%' }}
            emptyMessage="No patients match your filters."
          />
        </Box>
      </CardContent>

      <Dialog open={formOpen} onClose={handleCloseForm} maxWidth="sm" fullWidth>
        <DialogTitle>{formMode === 'edit' ? 'Edit Patient' : 'Add Patient'}</DialogTitle>
        <DialogContent dividers>
          {(therapistsError || submitError) && (
            <Box mb={2}>
              {therapistsError && (
                <Alert severity="warning">
                  {therapistsError}. Therapist assignment will be optional until the list loads.
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
              <Grid item xs={12} sm={6}>
                <TextField
                  label="First Name"
                  fullWidth
                value={formState.first_name}
                required
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, first_name: value }));
                  setFormErrors((prev) => ({ ...prev, first_name: undefined }));
                }}
                error={Boolean(formErrors.first_name)}
                helperText={formErrors.first_name}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Surname"
                fullWidth
                value={formState.surname}
                required
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, surname: value }));
                  setFormErrors((prev) => ({ ...prev, surname: undefined }));
                }}
                error={Boolean(formErrors.surname)}
                helperText={formErrors.surname}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Email"
                type="email"
                fullWidth
                value={formState.email}
                required
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, email: value }));
                  setFormErrors((prev) => ({ ...prev, email: undefined }));
                }}
                error={Boolean(formErrors.email)}
                helperText={formErrors.email}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Phone"
                fullWidth
                value={formState.phone}
                required
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, phone: value }));
                  setFormErrors((prev) => ({ ...prev, phone: undefined }));
                }}
                error={Boolean(formErrors.phone)}
                helperText={formErrors.phone}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Address Line 1"
                fullWidth
                value={formState.address_line1}
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, address_line1: value }));
                }}
                helperText="Street address"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Address Line 2"
                fullWidth
                value={formState.address_line2}
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, address_line2: value }));
                }}
                helperText="Apartment, suite, etc. (optional)"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="City"
                fullWidth
                value={formState.address_city}
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, address_city: value }));
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="State / County"
                fullWidth
                value={formState.address_state}
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, address_state: value }));
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Postcode"
                fullWidth
                value={formState.address_postcode}
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, address_postcode: value }));
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Primary Contact Name"
                fullWidth
                value={formState.primary_contact_name}
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, primary_contact_name: value }));
                  setFormErrors((prev) => ({ ...prev, primary_contact_name: undefined }));
                }}
                error={Boolean(formErrors.primary_contact_name)}
                helperText={formErrors.primary_contact_name || 'Optional'}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Primary Contact Email"
                type="email"
                fullWidth
                value={formState.primary_contact_email}
                required
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, primary_contact_email: value }));
                  setFormErrors((prev) => ({ ...prev, primary_contact_email: undefined }));
                }}
                error={Boolean(formErrors.primary_contact_email)}
                helperText={formErrors.primary_contact_email || 'Optional'}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Primary Contact Phone"
                fullWidth
                value={formState.primary_contact_phone}
                required
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, primary_contact_phone: value }));
                  setFormErrors((prev) => ({ ...prev, primary_contact_phone: undefined }));
                }}
                error={Boolean(formErrors.primary_contact_phone)}
                helperText={formErrors.primary_contact_phone || 'Optional'}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Preferred Name"
                fullWidth
                value={formState.preferred_name}
                onChange={(event) => setFormState((prev) => ({ ...prev, preferred_name: event.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Date of Birth"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={formState.date_of_birth}
                onChange={(event) => setFormState((prev) => ({ ...prev, date_of_birth: event.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                options={therapistOptions}
                value={primaryTherapistSelection}
                onChange={(event, newValue) => {
                  setFormState((prev) => ({
                    ...prev,
                    primaryTherapistId: newValue?.id || '',
                  }));
                  setFormErrors((prev) => ({ ...prev, primaryTherapistId: undefined }));
                }}
                loading={therapistsLoading}
                disabled={!therapistOptions.length && therapistsLoading}
                getOptionLabel={(option) => {
                  if (!option) {
                    return '';
                  }
                  return option.employeeID ? `${option.name} (#${option.employeeID})` : option.name;
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Primary Therapist"
                    placeholder="Select therapist"
                    helperText={formErrors.primaryTherapistId || 'Optional'}
                    error={Boolean(formErrors.primaryTherapistId)}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Status (Active / Archived)"
                select
                fullWidth
                value={formState.status}
                required
                onChange={(event) => {
                  const { value } = event.target;
                  setFormState((prev) => ({ ...prev, status: value }));
                  setFormErrors((prev) => ({ ...prev, status: undefined }));
                }}
                error={Boolean(formErrors.status)}
                helperText={formErrors.status}
              >
                {STATUS_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseForm} disabled={submitting} sx={{ color: '#fff' }}>
            Cancel
          </Button>
          <Button onClick={handleSubmitPatient} variant="contained" disabled={submitting}>
            {submitting
              ? 'Saving...'
              : formMode === 'edit'
                ? 'Save Changes'
                : 'Save Patient'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(deleteCandidate)}
        onClose={handleCloseDeleteDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Patient</DialogTitle>
        <DialogContent dividers>
          <Typography>
            Are you sure you want to delete{' '}
            <strong>
              {deleteCandidate?.first_name} {deleteCandidate?.surname}
            </strong>
            ? This will archive the patient and hide them from active lists.
          </Typography>
          {deleteError && (
            <Box mt={2}>
              <Alert severity="error">{deleteError}</Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseDeleteDialog}
            disabled={deletingPatient}
            sx={{ color: '#fff' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeletePatient}
            color="error"
            variant="contained"
            disabled={deletingPatient}
          >
            {deletingPatient ? 'Deleting...' : 'Delete'}
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
    </Box>
  );
};

export default Patients;
