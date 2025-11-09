// src/components/Dashboard/Home.js
import React, { useEffect, useState, useMemo } from 'react';
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
} from '@mui/material';
import TUICalendar from './TUICalendar';
import apiClient from '../../utils/apiClient';

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

  useEffect(() => {
    if (!userData?.employeeID) {
      setAppointments([]);
      return;
    }

    const fetchAppointments = async () => {
      try {
        const response = await apiClient.get('/api/appointments', {
          params: { employeeID: userData.employeeID },
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
      }
    };

    fetchAppointments();
  }, [userData?.employeeID]);

  useEffect(() => {
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
  }, []);

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
    },
    {
      label: 'This Month Revenue',
      value: `GBP ${Number(metrics?.paymentsProcessed || 0).toFixed(2)}`,
      helper: 'processed',
    },
    {
      label: 'Outstanding Balance',
      value: `GBP ${Number(metrics?.outstanding?.totalBalance || 0).toFixed(2)}`,
      helper: 'awaiting payment',
    },
    {
      label: 'Cancelled This Period',
      value: metrics?.appointments?.cancelled || 0,
      helper: 'appointments',
    },
  ];

  return (
    <Stack spacing={4} sx={{ width: '100%', py: 2 }}>
      <Grid container spacing={3}>
        {loadingMetrics ? (
          <Grid item>
            <CircularProgress size={24} />
          </Grid>
        ) : (
          metricCards.map((card) => (
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
          Next Appointments
        </Typography>
        <Divider sx={{ borderColor: 'rgba(148,163,184,0.08)', mb: 2 }} />
        <Box mt={1.5} sx={{ maxHeight: 260, overflowY: 'auto', pr: 1 }}>
          {appointments.length > 0 ? (
            appointments.map((appointment) => (
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
                  {new Date(appointment.date).toLocaleString()} - {appointment.location || 'Clinic'}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Contact: {appointment.contact}
                </Typography>
              </Box>
            ))
          ) : (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No upcoming appointments.
            </Typography>
          )}
        </Box>
      </Box>
    </Stack>
  );
};

export default Home;



