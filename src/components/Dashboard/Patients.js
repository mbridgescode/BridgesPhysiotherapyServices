// src/components/Dashboard/Patients.js

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  FormControlLabel,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { makeStyles } from '@mui/styles';
import { useNavigate } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
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

const PAGE_SIZE = 50;

const BILLING_MODE_OPTIONS = [
  { value: 'individual', label: 'Individual billing' },
  { value: 'monthly', label: 'Monthly billing' },
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
  billing_mode: 'individual',
  email_active: true,
});

const Patients = ({ userData }) => {
  const classes = useStyles();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(() => getAuthToken());
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [toast, setToast] = useState({ message: '', severity: 'success' });
  const { therapists, loading: therapistsLoading, error: therapistsError } = useTherapists();
  const [formState, setFormState] = useState(() => createEmptyFormState());
  const [patientScope, setPatientScope] = useState(userData?.role === 'therapist' ? 'mine' : 'all');
  const [emailToggleBusy, setEmailToggleBusy] = useState({});
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const navigate = useNavigate();
  const roleRef = useRef(userData?.role);
  const therapistOptions = useMemo(() => therapists, [therapists]);

  const showToast = useCallback((message, severity = 'success') => {
    if (!message) {
      setToast((prev) => ({ ...prev, message: '' }));
      return;
    }
    setToast({ message, severity });
  }, []);
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

  const handleLoadMore = useCallback(() => {
    if (!hasMore || fetchingMore || loading) {
      return;
    }
    setPage((prev) => prev + 1);
  }, [fetchingMore, hasMore, loading]);

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
    const handler = setTimeout(() => {
      setSearchQuery(searchTerm.trim());
    }, 350);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    setPatients([]);
    setPage(0);
    setHasMore(true);
  }, [patientScope, searchQuery, showArchived, token]);

  useEffect(() => {
    const previousRole = roleRef.current;
    const currentRole = userData?.role;
    if (currentRole === 'therapist' && previousRole !== 'therapist') {
      setPatientScope('mine');
    } else if (currentRole !== 'therapist' && patientScope !== 'all') {
      setPatientScope('all');
    }
    roleRef.current = currentRole;
  }, [userData?.role, patientScope]);

  useEffect(() => {
    let isMounted = true;

    const fetchPatients = async () => {
      if (!token) {
        if (isMounted) {
          setPatients([]);
          setHasMore(false);
          setLoading(false);
          setFetchingMore(false);
          setError(null);
        }
        return;
      }

      const isInitialPage = page === 0;
      if (isInitialPage) {
        setLoading(true);
      } else {
        setFetchingMore(true);
      }

      try {
        const params = {
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        };
        if (patientScope === 'all') {
          params.view = 'all';
        }
        if (showArchived) {
          params.status = 'archived';
        } else {
          params.status = 'active,inactive';
        }
        if (searchQuery) {
          params.search = searchQuery;
        }

        const response = await apiClient.get('/api/patients', { params });
        if (!isMounted) {
          return;
        }
        const incoming = response.data.patients || [];
        let snapshot = [];
        setPatients((prev) => {
          snapshot = isInitialPage ? incoming : [...prev, ...incoming];
          return snapshot;
        });
        const total = response.data.total;
        if (typeof total === 'number') {
          setHasMore(snapshot.length < total);
        } else {
          setHasMore(incoming.length === PAGE_SIZE);
        }
        setError(null);
      } catch (err) {
        console.error('Error fetching patients:', err);
        if (isMounted) {
          setError('Failed to load patients');
          if (page === 0) {
            setPatients([]);
          }
        }
      } finally {
        if (isMounted) {
          if (page === 0) {
            setLoading(false);
          }
          setFetchingMore(false);
        }
      }
    };

    fetchPatients();

    return () => {
      isMounted = false;
    };
  }, [token, patientScope, searchQuery, showArchived, page]);

  useEffect(() => {
    if (!formOpen) {
      setFormErrors({});
      setSubmitError(null);
      setFormState(createEmptyFormState());
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
      patients
        .filter((patient) => {
          const status = normalizedStatus(patient.status);
          return showArchived ? status === 'archived' : status !== 'archived';
        })
        .filter((patient) => {
          const searchValue = searchQuery.toLowerCase();
          if (!searchValue) {
            return true;
          }
          const matchesCore = [
            patient.first_name,
            patient.surname,
            patient.email,
            patient.phone,
            patient.primary_contact_name,
            patient.primary_contact_email,
            patient.primary_contact_phone,
            patient.status,
            patient.primaryTherapist?.name || patient.primaryTherapist?.username,
            formatPatientAddress(patient.address),
          ].some((field) => field?.toLowerCase().includes(searchValue));

          const matchesAppointment = patient.appointments?.some(
            (appointment) =>
              appointment.treatment_description?.toLowerCase().includes(searchValue),
          );

          return matchesCore || matchesAppointment;
        }),
    [patients, searchQuery, formatPatientAddress, showArchived],
  );

  const handleViewDetails = useCallback((patientId) => {
    navigate(`/dashboard/patients/${patientId}`);
  }, [navigate]);

  const canManagePatients = ['admin', 'receptionist'].includes(userData?.role);
  const canToggleEmailActive = ['admin', 'receptionist', 'therapist'].includes(userData?.role);

  const handleEmailActiveToggle = useCallback(async (patient, nextValue) => {
    if (!patient) {
      return;
    }
    setEmailToggleBusy((prev) => ({ ...prev, [patient.patient_id]: true }));
    try {
      const response = await apiClient.put(`/api/patients/${patient.patient_id}`, {
        email_active: nextValue,
      });
      const updatedPatient = response?.data?.patient;
      if (updatedPatient) {
        setPatients((prev) =>
          prev.map((existing) =>
            existing.patient_id === updatedPatient.patient_id ? updatedPatient : existing,
          ),
        );
      } else {
        setPatients((prev) =>
          prev.map((existing) =>
            existing.patient_id === patient.patient_id
              ? { ...existing, email_active: nextValue }
              : existing,
          ),
        );
      }
      showToast(`Email ${nextValue ? 'activated' : 'deactivated'} for ${patient.first_name || 'patient'}.`);
    } catch (err) {
      console.error('Failed to update email preference', err);
      showToast('Failed to update email preference', 'error');
    } finally {
      setEmailToggleBusy((prev) => {
        const nextState = { ...prev };
        delete nextState[patient.patient_id];
        return nextState;
      });
    }
  }, [setPatients, showToast]);

  const formatPatientName = useCallback((patient) => {
    if (!patient) {
      return 'Patient';
    }
    if (typeof patient.patient_name === 'string' && patient.patient_name.trim()) {
      return patient.patient_name.trim();
    }
    const composedName = [patient.first_name, patient.surname]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
      .join(' ');
    if (composedName) {
      return composedName;
    }
    if (typeof patient.preferred_name === 'string' && patient.preferred_name.trim()) {
      return patient.preferred_name.trim();
    }
    if (patient.email) {
      return patient.email;
    }
    return `Patient #${patient.patient_id || ''}`.trim();
  }, []);

  const formatPrimaryTherapist = useCallback((row) => {
    if (row.primaryTherapist?.name || row.primaryTherapist?.username) {
      const suffix = row.primaryTherapist.employeeID ? ` (#${row.primaryTherapist.employeeID})` : '';
      return `${row.primaryTherapist.name || row.primaryTherapist.username}${suffix}`;
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
    return 'Unassigned';
  }, [therapistNameByEmployeeOrId]);

  const handleCloseForm = () => {
    if (submitting) {
      return;
    }
    setFormOpen(false);
  };

  const handleStartCreate = () => {
    setFormErrors({});
    setSubmitError(null);
    setFormState(createEmptyFormState());
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
      id: 'patient_name',
      label: 'Patient Name',
      minWidth: 220,
      valueGetter: (row) => formatPatientName(row),
      render: (row) => (
        <Typography
          component="span"
          color="primary"
          sx={{ cursor: 'pointer', fontWeight: 600 }}
          onClick={() => handleViewDetails(row.patient_id)}
        >
          {formatPatientName(row)}
        </Typography>
      ),
    },
    {
      id: 'email_active',
      label: 'Email Active',
      minWidth: 150,
      sortable: false,
      filterable: false,
      render: (row) => (
        <Switch
          size="small"
          checked={row.email_active !== false}
          onChange={(event) => handleEmailActiveToggle(row, event.target.checked)}
          disabled={!canToggleEmailActive || Boolean(emailToggleBusy[row.patient_id])}
        />
      ),
    },
    {
      id: 'billing_mode',
      label: 'Billing Mode',
      minWidth: 140,
      render: (row) => (row.billing_mode === 'monthly' ? 'Monthly' : 'Individual'),
    },
    {
      id: 'primary_therapist',
      label: 'Primary Therapist',
      minWidth: 220,
      valueGetter: (row) => formatPrimaryTherapist(row),
      render: (row) => formatPrimaryTherapist(row),
    },
    {
      id: 'next_appointment',
      label: 'Next Appointment',
      type: 'date',
      minWidth: 190,
      valueGetter: (row) => row.upcomingAppointment?.date || '',
      render: (row) =>
        row.upcomingAppointment
          ? new Date(row.upcomingAppointment.date).toLocaleString()
          : 'None',
    },
  ];

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
      if (hasAddress) {
        payload.address = addressPayload;
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
      const response = await apiClient.post('/api/patients', payload);
      if (response?.data?.patient) {
        setPatients((prev) => [response.data.patient, ...prev]);
      }
      showToast('Patient added successfully');
      setFormOpen(false);
      setFormErrors({});
      setFormState(createEmptyFormState());
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to create patient';
      console.error('Failed to save patient', err);
      setSubmitError(message);
    } finally {
      setSubmitting(false);
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
          <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
            <Typography variant="h5" gutterBottom sx={{ mb: 0 }}>
              Patients
            </Typography>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <ToggleButtonGroup
                size="small"
                value={showArchived ? 'archived' : 'active'}
                exclusive
                onChange={(event, value) => {
                  if (value) {
                    setShowArchived(value === 'archived');
                  }
                }}
                aria-label="Patient status filter"
              >
                <ToggleButton value="active">Active</ToggleButton>
                <ToggleButton value="archived">Archived</ToggleButton>
              </ToggleButtonGroup>
              {canManagePatients && (
                <Button
                  variant="contained"
                  onClick={handleStartCreate}
                >
                  Add Patient
                </Button>
              )}
            </Box>
          </Box>
        <Divider />
        {userData?.role === 'therapist' && (
          <Box display="flex" justifyContent="flex-end" sx={{ mt: 2, mb: 1 }}>
            <ToggleButtonGroup
              size="small"
              value={patientScope}
              exclusive
              onChange={(event, value) => {
                if (value) {
                  setPatientScope(value);
                }
              }}
            >
              <ToggleButton value="mine">My patients</ToggleButton>
              <ToggleButton value="all">All patients</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}
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
        {hasMore && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Button
              variant="outlined"
              onClick={handleLoadMore}
              disabled={fetchingMore || loading}
            >
              {fetchingMore ? 'Loading...' : 'Load more patients'}
            </Button>
          </Box>
        )}
      </CardContent>

      <Dialog open={formOpen} onClose={handleCloseForm} maxWidth="sm" fullWidth>
        <DialogTitle>Add Patient</DialogTitle>
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
            <Grid item xs={12} sm={6}>
              <TextField
                label="Billing Mode"
                select
                fullWidth
                value={formState.billing_mode}
                onChange={(event) => setFormState((prev) => ({ ...prev, billing_mode: event.target.value }))}
              >
                {BILLING_MODE_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={(
                  <Switch
                    checked={formState.email_active !== false}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, email_active: event.target.checked }))
                    }
                  />
                )}
                label="Email Active"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseForm} disabled={submitting} sx={{ color: '#fff' }}>
            Cancel
          </Button>
          <Button onClick={handleSubmitPatient} variant="contained" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Patient'}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={Boolean(toast.message)}
        autoHideDuration={4000}
        onClose={() => setToast((prev) => ({ ...prev, message: '' }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          onClose={() => setToast((prev) => ({ ...prev, message: '' }))}
          sx={{ width: '100%' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
      </Card>
    </Box>
  );
};

export default Patients;
