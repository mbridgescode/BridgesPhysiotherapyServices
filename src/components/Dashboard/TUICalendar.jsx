// src/components/Dashboard/TUICalendar.js

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import formatDate from 'date-fns/format';
import getDay from 'date-fns/getDay';
import isSameDay from 'date-fns/isSameDay';
import parse from 'date-fns/parse';
import startOfDay from 'date-fns/startOfDay';
import endOfDay from 'date-fns/endOfDay';
import endOfMonth from 'date-fns/endOfMonth';
import endOfWeek from 'date-fns/endOfWeek';
import startOfMonth from 'date-fns/startOfMonth';
import startOfWeek from 'date-fns/startOfWeek';
import enGB from 'date-fns/locale/en-GB';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../../styles/calendarOverrides.css';
import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Typography,
  TextField,
  MenuItem,
  Tooltip,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import apiClient from '../../utils/apiClient';
import CustomPopup from './CustomPopup';
import { AppointmentsContext } from '../../context/AppointmentsContext';
import { UserContext } from '../../context/UserContext';
import useTherapists from '../../hooks/useTherapists';

const localizer = dateFnsLocalizer({
  format: formatDate,
  parse,
  startOfWeek,
  getDay,
  locales: { 'en-GB': enGB },
});

const STATUS_COLORS = {
  scheduled: '#60a5fa',
  completed: '#34d399',
  cancelled: '#fb7185',
  cancelled_by_patient: '#fbbf24',
  cancelled_by_therapist: '#f97316',
  cancelled_same_day: '#f87171',
};

const VIEW_LABELS = {
  [Views.DAY]: 'Day',
  [Views.WEEK]: 'Week',
  [Views.MONTH]: 'Month',
};

const getPatientName = (appointment) => (
  [appointment?.first_name, appointment?.surname].filter(Boolean).join(' ') || 'Patient'
);

const getStatusLabel = (status = 'scheduled') => status.replaceAll('_', ' ');

const buildEvent = (appointment) => {
  const start = new Date(appointment.date);
  const durationMinutes = appointment.duration_minutes || 60;
  const end = new Date(start.getTime() + durationMinutes * 60000);

  return {
    id: appointment.appointment_id,
    title: `${appointment.treatment_description || 'Appointment'} - ${getPatientName(appointment)}`,
    start,
    end,
    patientName: getPatientName(appointment),
    treatment: appointment.treatment_description || 'Appointment',
    location: appointment.location || 'Clinic room',
    phone: appointment.contact || 'N/A',
    email: appointment.email || appointment.patient_email || 'Not provided',
    body: appointment.treatment_notes || 'No additional notes recorded.',
    status: appointment.status || 'scheduled',
    resource: appointment,
  };
};

const CalendarEvent = ({ event }) => (
  <Box className="calendar-event">
    <span className="calendar-event__time">{formatDate(event.start, 'HH:mm')}</span>
    <strong className="calendar-event__patient">{event.patientName}</strong>
    <span className="calendar-event__treatment">{event.treatment}</span>
  </Box>
);

const CalendarToolbar = ({ label, onNavigate, onView, view, views }) => {
  const availableViews = (Array.isArray(views) ? views : Object.keys(views || {}))
    .filter((option) => VIEW_LABELS[option]);

  return (
    <Box className="calendar-toolbar">
      <Box className="calendar-toolbar__date">
        <Box className="calendar-toolbar__title-row">
          <CalendarMonthIcon fontSize="small" aria-hidden="true" />
          <Typography component="span" className="calendar-toolbar__label">
            {label}
          </Typography>
        </Box>
        <Typography component="span" className="calendar-toolbar__hint">
          Select an appointment to view its details
        </Typography>
      </Box>
      <Stack className="calendar-toolbar__actions" direction="row" spacing={1} alignItems="center">
        <ButtonGroup size="small" variant="outlined" aria-label="Calendar navigation">
          <Tooltip title="Previous period">
            <IconButton onClick={() => onNavigate('PREV')} aria-label="Previous period" size="small">
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button onClick={() => onNavigate('TODAY')} startIcon={<TodayIcon fontSize="small" />}>
            Today
          </Button>
          <Tooltip title="Next period">
            <IconButton onClick={() => onNavigate('NEXT')} aria-label="Next period" size="small">
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </ButtonGroup>
        <ButtonGroup size="small" variant="outlined" aria-label="Calendar view">
          {availableViews.map((option) => (
            <Button
              key={option}
              onClick={() => onView(option)}
              variant={view === option ? 'contained' : 'outlined'}
              aria-pressed={view === option}
            >
              {VIEW_LABELS[option]}
            </Button>
          ))}
        </ButtonGroup>
      </Stack>
    </Box>
  );
};

const TUICalendar = () => {
  const { refreshVersion } = useContext(AppointmentsContext);
  const { userData } = useContext(UserContext);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const rangeCacheRef = useRef(new Map());
  const { therapists } = useTherapists();
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [isPopupVisible, setPopupVisible] = useState(false);
  const [selectedClinician, setSelectedClinician] = useState('all');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 720);
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [calendarView, setCalendarView] = useState(() => (
    typeof window !== 'undefined' && window.innerWidth < 720 ? Views.DAY : Views.WEEK
  ));

  useEffect(() => {
    rangeCacheRef.current.clear();
  }, [refreshVersion]);

  useEffect(() => {
    const updateViewport = () => setIsMobile(window.innerWidth < 720);
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const calendarViews = useMemo(
    () => (isMobile ? [Views.DAY, Views.MONTH] : [Views.DAY, Views.WEEK, Views.MONTH]),
    [isMobile],
  );

  useEffect(() => {
    if (!calendarViews.includes(calendarView)) {
      setCalendarView(calendarViews[0]);
    }
  }, [calendarView, calendarViews]);

  const calendarRange = useMemo(() => {
    if (calendarView === Views.DAY) {
      return {
        from: startOfDay(calendarDate).toISOString(),
        to: endOfDay(calendarDate).toISOString(),
      };
    }

    if (calendarView === Views.MONTH) {
      return {
        from: startOfWeek(startOfMonth(calendarDate), { weekStartsOn: 1 }).toISOString(),
        to: endOfWeek(endOfMonth(calendarDate), { weekStartsOn: 1 }).toISOString(),
      };
    }

    return {
      from: startOfWeek(calendarDate, { weekStartsOn: 1 }).toISOString(),
      to: endOfWeek(calendarDate, { weekStartsOn: 1 }).toISOString(),
    };
  }, [calendarDate, calendarView]);

  useEffect(() => {
    const cacheKey = `${calendarRange.from}|${calendarRange.to}`;
    const cachedAppointments = rangeCacheRef.current.get(cacheKey);
    if (cachedAppointments) {
      setAppointments(cachedAppointments);
      setLoading(false);
      setError(null);
      return undefined;
    }

    let isMounted = true;
    const loadCalendar = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get('/api/schedule/calendar', {
          params: calendarRange,
        });
        if (!isMounted) {
          return;
        }
        const nextAppointments = response.data?.appointments || [];
        rangeCacheRef.current.set(cacheKey, nextAppointments);
        setAppointments(nextAppointments);
        setError(null);
      } catch (err) {
        if (isMounted) {
          setError('Failed to load calendar');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadCalendar();
    return () => {
      isMounted = false;
    };
  }, [calendarRange, refreshVersion]);

  const clinicianOptions = useMemo(() => {
    const base = therapists.map((therapist) => ({
      value: therapist.employeeID ? `employee:${therapist.employeeID}` : `user:${therapist.id}`,
      label: therapist.name,
      employeeID: therapist.employeeID,
      userId: therapist.id,
    }));
    return [{ value: 'all', label: 'All clinicians' }, ...base];
  }, [therapists]);

  const matchAppointmentToUser = (appointment, user) => {
    if (!user) {
      return false;
    }
    if (user.role === 'admin') {
      return true;
    }
    const employeeMatches = user.employeeID !== null && user.employeeID !== undefined
      && Number(appointment.employeeID) === Number(user.employeeID);
    const therapistMatches = appointment.therapist === user.id
      || (appointment.therapistId && appointment.therapistId === user.id)
      || (appointment.therapist && appointment.therapist.toString && appointment.therapist.toString() === user.id);
    return employeeMatches || therapistMatches;
  };

  const matchAppointmentToSelection = (appointment) => {
    if (selectedClinician === 'all') {
      return true;
    }
    if (selectedClinician.startsWith('employee:')) {
      const id = Number(selectedClinician.split(':')[1]);
      return Number(appointment.employeeID) === id;
    }
    if (selectedClinician.startsWith('user:')) {
      const userId = selectedClinician.split(':')[1];
      return (
        appointment.therapist === userId
        || appointment.therapistId === userId
        || (appointment.therapist && appointment.therapist.toString && appointment.therapist.toString() === userId)
      );
    }
    return true;
  };

  const filteredAppointments = useMemo(() => {
    const base = Array.isArray(appointments) ? appointments : [];
    if (userData?.role === 'admin') {
      return base.filter((appointment) => matchAppointmentToSelection(appointment));
    }
    return base.filter((appointment) => matchAppointmentToUser(appointment, userData));
  }, [appointments, userData, selectedClinician]);

  const events = useMemo(
    () => filteredAppointments.map(buildEvent).sort((a, b) => a.start - b.start),
    [filteredAppointments],
  );

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const upcoming = events.filter((event) => event.end >= now);
    return (upcoming.length ? upcoming : events).slice(0, 6);
  }, [events]);

  const minTime = useMemo(() => {
    const value = startOfDay(new Date());
    value.setHours(7, 0, 0, 0);
    return value;
  }, []);
  const maxTime = useMemo(() => {
    const value = startOfDay(new Date());
    value.setHours(20, 0, 0, 0);
    return value;
  }, []);

  if (loading) {
    return <CircularProgress />;
  }

  if (error) {
    return <Typography variant="h6">Error loading calendar</Typography>;
  }

  const handleSelectEvent = (event) => {
    setSelectedAppointment(event);
    setPopupVisible(true);
  };

  return (
    <Box className="calendar-shell">
      <Box className="calendar-shell__header">
        <Box className="calendar-shell__intro">
          <Typography variant="h5" className="calendar-shell__title">
            Clinic schedule
          </Typography>
          <Typography variant="body2" className="calendar-shell__subtitle">
            {events.length} {events.length === 1 ? 'appointment' : 'appointments'} in this schedule
          </Typography>
        </Box>
        <Stack className="calendar-shell__filters" direction="row" spacing={1.5} alignItems="center">
          <Box className="calendar-legend" aria-label="Appointment status legend">
            {['scheduled', 'completed', 'cancelled'].map((status) => (
              <Box className="calendar-legend__item" key={status}>
                <span className="calendar-legend__dot" style={{ backgroundColor: STATUS_COLORS[status] }} />
                <span>{status}</span>
              </Box>
            ))}
          </Box>
          {userData?.role === 'admin' && (
            <TextField
              select
              label="Clinician"
              value={selectedClinician}
              onChange={(event) => setSelectedClinician(event.target.value)}
              size="small"
              sx={{ minWidth: { xs: 0, sm: 200 }, width: { xs: '100%', sm: 'auto' } }}
            >
              {clinicianOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
      </Box>
      <Divider className="calendar-shell__divider" />
      <Box className="calendar-shell__layout">
        <Box className="calendar-shell__calendar-panel">
          <Calendar
            localizer={localizer}
            culture="en-GB"
            events={events}
            startAccessor="start"
            endAccessor="end"
            date={calendarDate}
            onNavigate={setCalendarDate}
            view={calendarView}
            onView={setCalendarView}
            style={{ height: isMobile ? 'clamp(520px, calc(100vh - 300px), 720px)' : 'clamp(620px, calc(100vh - 270px), 820px)' }}
            min={minTime}
            max={maxTime}
            views={calendarViews}
            components={{
              toolbar: (toolbarProps) => <CalendarToolbar {...toolbarProps} />,
              event: CalendarEvent,
            }}
            eventPropGetter={(event) => {
              const color = STATUS_COLORS[event.status] || STATUS_COLORS.scheduled;
              return {
                style: {
                  backgroundColor: color,
                  borderRadius: 8,
                  border: 'none',
                  borderLeft: `3px solid ${color}`,
                  color: '#06211f',
                  boxShadow: '0 6px 15px rgba(0,0,0,0.18)',
                },
              };
            }}
            dayPropGetter={(date) => ({
              className: isSameDay(date, new Date()) ? 'calendar-day--today' : undefined,
            })}
            onSelectEvent={handleSelectEvent}
            popup
            selectable={false}
          />
        </Box>
        <Box component="aside" className="calendar-shell__agenda" aria-label="Upcoming appointments">
          <Box className="calendar-agenda__heading">
            <Box>
              <Typography variant="h6">Next up</Typography>
              <Typography variant="caption">Your next appointments at a glance</Typography>
            </Box>
            <Chip size="small" label={events.length} />
          </Box>
          <Box className="calendar-agenda__list">
            {upcomingEvents.length ? upcomingEvents.map((event) => (
              <Box
                component="button"
                type="button"
                className="calendar-agenda__item"
                key={event.id}
                onClick={() => handleSelectEvent(event)}
              >
                <Box className="calendar-agenda__item-time">
                  <strong>{formatDate(event.start, 'EEE')}</strong>
                  <span>{formatDate(event.start, 'd MMM')}</span>
                </Box>
                <Box className="calendar-agenda__item-copy">
                  <strong>{event.patientName}</strong>
                  <span>{formatDate(event.start, 'HH:mm')} · {event.treatment}</span>
                  <span>{event.location}</span>
                </Box>
                <span
                  className="calendar-agenda__status"
                  style={{ backgroundColor: STATUS_COLORS[event.status] || STATUS_COLORS.scheduled }}
                  title={getStatusLabel(event.status)}
                />
              </Box>
            )) : (
              <Typography variant="body2" className="calendar-agenda__empty">
                No appointments match this filter.
              </Typography>
            )}
          </Box>
          <Typography variant="caption" className="calendar-agenda__hint">
            Choose an appointment in the calendar or this list to view its details.
          </Typography>
        </Box>
      </Box>
      {isPopupVisible && (
        <CustomPopup
          appointment={selectedAppointment}
          onClose={() => setPopupVisible(false)}
        />
      )}
    </Box>
  );
};

export default TUICalendar;
