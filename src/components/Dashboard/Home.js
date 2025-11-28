// src/components/Dashboard/Home.js
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Divider,
  Typography,
  CircularProgress,
  Chip,
  Stack,
  TextField,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import TUICalendar from './TUICalendar';
import apiClient from '../../utils/apiClient';
import { useTherapists } from '../../hooks/useTherapists';

const surfaceCardStyles = {
  borderRadius: 10,
  backgroundColor: '#121828',
  border: '1px solid rgba(148, 163, 184, 0.08)',
  boxShadow: '0 24px 44px rgba(3, 6, 18, 0.55)',
};

const appointmentRowStyles = {
  position: 'relative',
  px: 3,
  py: 2.5,
  borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
  '&:last-of-type': {
    borderBottom: 'none',
  },
  '&::before': {
    content: "''",
    position: 'absolute',
    left: 0,
    top: '20%',
    bottom: '20%',
    width: '3px',
    borderRadius: 999,
    backgroundImage: 'linear-gradient(180deg, #a855f7, #6366f1)',
  },
};

const Home = ({ userData }) => {
  const [appointments, setAppointments] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [agendaView, setAgendaView] = useState('today');

  const isAdminOrReception = ['admin', 'receptionist'].includes(userData?.role);
  const canFetchMetrics = userData?.role === 'admin';
  const canViewFinancialMetrics = userData?.role === 'admin';
  const {
    therapists,
    loading: therapistsLoading,
  } = useTherapists();

  const selfProviderOption = useMemo(() => {
    if (!userData) {
      return null;
    }
    return {
      value: userData.id || 'me',
      label: `${userData.name || userData.username || 'My agenda'}`,
      employeeID: userData.employeeID ?? null,
    };
  }, [userData]);

  const adminProviderOptions = useMemo(() => {
    if (!isAdminOrReception) {
      return [];
    }
    return (therapists || [])
      .filter((therapist) => therapist.employeeID !== null && therapist.employeeID !== undefined)
      .map((therapist) => ({
        value: therapist.id || therapist.employeeID || therapist.name,
        label: therapist.employeeID
          ? `${therapist.name || therapist.username || 'Therapist'} (#${therapist.employeeID})`
          : therapist.name || therapist.username || 'Therapist',
        employeeID: therapist.employeeID,
      }));
  }, [isAdminOrReception, therapists]);

  useEffect(() => {
    if (isAdminOrReception) {
      if (!adminProviderOptions.length) {
        return;
      }
      setSelectedProvider((prev) => {
        if (prev && adminProviderOptions.some((option) => option.value === prev.value)) {
          return prev;
        }
        return adminProviderOptions[0];
      });
    } else if (selfProviderOption) {
      setSelectedProvider((prev) => {
        if (prev && prev.value === selfProviderOption.value) {
          return prev;
        }
        return selfProviderOption;
      });
    }
  }, [isAdminOrReception, adminProviderOptions, selfProviderOption]);

  const fetchAppointments = useCallback(async () => {
    if (!selectedProvider && !userData?.employeeID) {
      setAppointments([]);
      return;
    }
    setAppointmentsLoading(true);
    try {
      const params = {};
      const providerEmployeeId = selectedProvider?.employeeID ?? userData?.employeeID;
      if (providerEmployeeId) {
        params.employeeID = providerEmployeeId;
      }
      const response = await apiClient.get('/api/appointments', {
        params,
      });
      const payload = Array.isArray(response.data)
        ? response.data
        : response.data.appointments || [];
      const upcomingAppointments = payload.filter(
        (appointment) => !appointment.completed,
      );
      setAppointments(upcomingAppointments);
    } catch (error) {
      console.error('Error fetching appointments:', error);
      setAppointments([]);
    } finally {
      setAppointmentsLoading(false);
    }
  }, [selectedProvider, userData?.employeeID]);

  useEffect(() => {
    if (selectedProvider || userData?.employeeID) {
      fetchAppointments();
    }
  }, [fetchAppointments, selectedProvider, userData?.employeeID]);

  useEffect(() => {
    if (!canFetchMetrics) {
      setLoadingMetrics(false);
      return;
    }
    const fetchMetrics = async () => {
      setLoadingMetrics(true);
      try {
        const response = await apiClient.get('/api/reports/dashboard');
        setMetrics(response.data.metrics);
      } catch (error) {
        console.error('Error fetching dashboard metrics', error);
      } finally {
        setLoadingMetrics(false);
      }
    };
    fetchMetrics();
  }, [canFetchMetrics]);

  const todaysAppointments = useMemo(() => {
    const today = new Date().toDateString();
    return appointments.filter(
      (appointment) => new Date(appointment.date).toDateString() === today,
    );
  }, [appointments]);

  const metricCards = [
    {
      label: "Today's Appointments",
      value: todaysAppointments.length,
      helper: 'scheduled',
      sensitive: false,
    },
    {
      label: 'This Month Revenue',
      value: `GBP ${Number(metrics?.paymentsProcessed || 0).toFixed(2)}`,
      helper: 'processed',
      sensitive: true,
    },
    {
      label: 'Outstanding Balance',
      value: `GBP ${Number(metrics?.outstanding?.totalBalance || 0).toFixed(2)}`,
      helper: 'awaiting payment',
      sensitive: true,
    },
    {
      label: 'Cancelled This Period',
      value:
        (metrics?.appointments?.cancelled_by_patient || 0)
        + (metrics?.appointments?.cancelled_by_therapist || 0)
        + (metrics?.appointments?.cancelled_same_day || 0)
        + (metrics?.appointments?.cancelled_legacy || metrics?.appointments?.cancelled || 0),
      helper: 'appointments',
      sensitive: false,
    },
  ];
  const visibleMetricCards = metricCards.filter(
    (card) => canViewFinancialMetrics || !card.sensitive,
  );

  const agendaAppointments = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    switch (agendaView) {
      case 'today':
        end.setHours(23, 59, 59, 999);
        break;
      case 'week':
        end.setDate(end.getDate() + 7);
        break;
      case 'month':
        end.setMonth(end.getMonth() + 1);
        break;
      case 'year':
      default:
        end.setFullYear(end.getFullYear() + 1);
        break;
    }
    return appointments
      .filter((appointment) => {
        const date = new Date(appointment.date);
        if (Number.isNaN(date.getTime())) {
          return false;
        }
        return date >= start && date <= end;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [appointments, agendaView]);

  const agendaGroups = useMemo(() => {
    const groups = agendaAppointments.reduce((acc, appointment) => {
      const key = new Date(appointment.date).toDateString();
      if (!acc.has(key)) {
        acc.set(key, []);
      }
      acc.get(key).push(appointment);
      return acc;
    }, new Map());
    return Array.from(groups.entries()).sort(
      (a, b) => new Date(a[0]) - new Date(b[0]),
    );
  }, [agendaAppointments]);

  return (
    <Stack spacing={4} sx={{ width: '100%', py: 2 }}>
      {visibleMetricCards.length > 0 && (
        <Grid container spacing={3}>
          {loadingMetrics ? (
            <Grid item>
              <CircularProgress size={24} />
            </Grid>
          ) : (
            visibleMetricCards.map((card) => (
              <Grid item xs={12} sm={6} md={3} key={card.label}>
                <Card
                  sx={{
                    ...surfaceCardStyles,
                    px: 3,
                    py: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                    minHeight: 120,
                    justifyContent: 'center',
                  }}
                >
                  <Typography className="subtle-label">{card.label}</Typography>
                  <Typography variant="h4" sx={{ mt: 0.5, lineHeight: 1.2 }}>
                    {card.value}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {card.helper}
                  </Typography>
                </Card>
              </Grid>
            ))
          )}
        </Grid>
      )}

      <Card className="glass-card" sx={{ borderRadius: 4 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h5" className="page-heading" gutterBottom>
            Calendar
          </Typography>
          <Divider sx={{ borderColor: 'rgba(148,163,184,0.08)' }} />
          <Box mt={3} sx={{ width: '100%', minHeight: '1200px' }}>
            <TUICalendar />
          </Box>
        </CardContent>
      </Card>

      <Box sx={{ px: { xs: 1, md: 0 } }}>
        <Typography variant="h5" className="page-heading" gutterBottom>
          Agenda
        </Typography>
        <Divider sx={{ borderColor: 'rgba(148,163,184,0.08)', mb: 2 }} />
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            alignItems: 'center',
            mb: 2,
          }}
        >
          {isAdminOrReception && (
            <TextField
              select
              label="Clinician"
              value={selectedProvider?.value || ''}
              onChange={(event) => {
                const match = adminProviderOptions.find((option) => option.value === event.target.value);
                setSelectedProvider(match || null);
              }}
              sx={{ minWidth: 220 }}
              disabled={therapistsLoading}
            >
              {adminProviderOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          )}
          <ToggleButtonGroup
            size="small"
            value={agendaView}
            exclusive
            onChange={(_, value) => {
              if (value) {
                setAgendaView(value);
              }
            }}
            aria-label="Agenda range"
          >
            <ToggleButton value="today" aria-label="Today">
              Day
            </ToggleButton>
            <ToggleButton value="week" aria-label="Week">
              Week
            </ToggleButton>
            <ToggleButton value="month" aria-label="Month">
              Month
            </ToggleButton>
            <ToggleButton value="year" aria-label="Year">
              Year
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box mt={1.5} sx={{ maxHeight: 260, overflowY: 'auto', pr: 1 }}>
          {appointmentsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : agendaGroups.length > 0 ? (
            agendaGroups.map(([dateKey, dailyAppointments]) => (
              <Box key={dateKey} sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary' }}>
                  {dateKey}
                </Typography>
                {dailyAppointments.map((appointment) => (
                  <Box key={appointment.appointment_id} sx={appointmentRowStyles}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                      <Typography variant="subtitle2" sx={{ letterSpacing: '0.05em', textTransform: 'uppercase', color: 'text.secondary' }}>
                        #{appointment.appointment_id}
                      </Typography>
                      <Chip
                        size="small"
                        label={appointment.status || 'scheduled'}
                        className="pill-badge"
                        sx={{ backgroundColor: 'rgba(99,102,241,0.2)', color: '#c7d2fe' }}
                      />
                    </Box>
                    <Typography variant="body1" sx={{ mt: 1, color: 'text.primary', fontWeight: 600 }}>
                      {appointment.first_name} {appointment.surname}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {appointment.treatment_description || 'No Treatment'}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {new Date(appointment.date).toLocaleString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' · '}
                      {appointment.location || 'Clinic'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Contact: {appointment.contact}
                    </Typography>
                    {appointment.employeeID && isAdminOrReception && (
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                        Therapist #{appointment.employeeID}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            ))
          ) : (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No upcoming appointments in this range.
            </Typography>
          )}
        </Box>
      </Box>
    </Stack>
  );
};

export default Home;



