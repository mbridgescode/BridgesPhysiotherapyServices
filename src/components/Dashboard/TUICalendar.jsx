import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import timeGridPlugin from '@fullcalendar/timegrid';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import CloseIcon from '@mui/icons-material/Close';
import apiClient from '../../utils/apiClient';
import { AppointmentsContext } from '../../context/AppointmentsContext';
import { UserContext } from '../../context/UserContext';
import useTherapists from '../../hooks/useTherapists';
import CustomPopup from './CustomPopup';
import '../../styles/calendarOverrides.css';

const STATUS_COLORS = {
  scheduled: '#60a5fa',
  completed: '#34d399',
  cancelled: '#fb7185',
  cancelled_by_patient: '#fbbf24',
  cancelled_by_therapist: '#f97316',
  cancelled_same_day: '#f87171',
};

const STATUS_LABELS = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  cancelled_by_patient: 'Cancelled by patient',
  cancelled_by_therapist: 'Cancelled by clinician',
  cancelled_same_day: 'Cancelled same day',
};

const VIEW_OPTIONS = [
  { value: 'dayGridMonth', label: 'Month' },
  { value: 'timeGridWeek', label: 'Week' },
  { value: 'timeGridDay', label: 'Day' },
  { value: 'listWeek', label: 'Agenda' },
];

const getPatientName = (appointment) => (
  [appointment?.first_name, appointment?.surname].filter(Boolean).join(' ') || 'Patient'
);

const getStatusLabel = (status = 'scheduled') => (
  STATUS_LABELS[status] || status.replaceAll('_', ' ')
);

const getStatusClass = (status = 'scheduled') => status.replaceAll('_', '-');

const formatCalendarDateTime = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date to be confirmed';
  }
  return `${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} at ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

const formatDuration = (minutes) => {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) {
    return '60 minutes';
  }
  if (value % 60 === 0) {
    return `${value / 60} hour${value === 60 ? '' : 's'}`;
  }
  return `${value} minutes`;
};

const buildEvent = (appointment) => {
  const start = new Date(appointment.date);
  if (Number.isNaN(start.getTime())) {
    return null;
  }
  const durationMinutes = Number(appointment.duration_minutes) || 60;
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const status = appointment.status || 'scheduled';
  const color = STATUS_COLORS[status] || STATUS_COLORS.scheduled;

  return {
    id: String(appointment.appointment_id),
    title: `${appointment.treatment_description || 'Appointment'} - ${getPatientName(appointment)}`,
    start,
    end,
    backgroundColor: `${color}26`,
    borderColor: `${color}99`,
    textColor: '#f8fafc',
    extendedProps: {
      patientName: getPatientName(appointment),
      treatment: appointment.treatment_description || 'Appointment',
      location: appointment.location || appointment.room || 'Clinic room',
      phone: appointment.contact || 'N/A',
      email: appointment.email || appointment.patient_email || 'Not provided',
      body: appointment.treatment_notes || 'No additional notes recorded.',
      status,
      durationMinutes,
      resource: appointment,
    },
  };
};

const CalendarEvent = ({ eventInfo }) => {
  const { event, timeText } = eventInfo;
  const {
    patientName,
    treatment,
    status = 'scheduled',
  } = event.extendedProps || {};
  const statusClass = getStatusClass(status);

  return (
    <Box component="span" className={`calendar-event calendar-event--${statusClass}`}>
      <Box component="span" className="calendar-event__meta">
        <span className="calendar-event__time">{timeText || 'All day'}</span>
        <span className="calendar-event__status">{getStatusLabel(status)}</span>
      </Box>
      <strong className="calendar-event__patient">{patientName}</strong>
      <span className="calendar-event__treatment">{treatment}</span>
    </Box>
  );
};

const getInitialView = () => (
  typeof window !== 'undefined' && window.innerWidth < 720 ? 'timeGridDay' : 'timeGridWeek'
);

const TUICalendar = () => {
  const { refreshVersion, refreshAppointments } = useContext(AppointmentsContext);
  const { userData } = useContext(UserContext);
  const { therapists } = useTherapists();
  const calendarRef = useRef(null);
  const rangeCacheRef = useRef(new Map());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 720);
  const [calendarView, setCalendarView] = useState(getInitialView);
  const [calendarTitle, setCalendarTitle] = useState('Clinic schedule');
  const [calendarRange, setCalendarRange] = useState(null);
  const [selectedClinician, setSelectedClinician] = useState('all');
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [isPopupVisible, setPopupVisible] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingMutation, setPendingMutation] = useState(null);
  const [sendRescheduleEmail, setSendRescheduleEmail] = useState(true);
  const [savingMutation, setSavingMutation] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [toast, setToast] = useState({ open: false, severity: 'success', message: '' });

  const canManageSchedule = ['admin', 'therapist', 'receptionist'].includes(userData?.role);

  useEffect(() => {
    const updateViewport = () => setIsMobile(window.innerWidth < 720);
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    rangeCacheRef.current.clear();
  }, [refreshVersion, refreshKey]);

  const clinicianOptions = useMemo(() => {
    const base = therapists.map((therapist) => ({
      value: therapist.employeeID ? `employee:${therapist.employeeID}` : `user:${therapist.id}`,
      label: therapist.name,
      employeeID: therapist.employeeID,
      userId: therapist.id,
    }));
    return [{ value: 'all', label: 'All clinicians' }, ...base];
  }, [therapists]);

  const handleDatesSet = useCallback((info) => {
    const nextFrom = info.start.toISOString();
    const nextTo = new Date(info.end.getTime() - 1).toISOString();
    setCalendarTitle(info.view.title);
    setCalendarView((previous) => (previous === info.view.type ? previous : info.view.type));
    setCalendarRange((previous) => {
      if (previous?.from === nextFrom && previous?.to === nextTo) {
        return previous;
      }
      return { from: nextFrom, to: nextTo };
    });
  }, []);

  useEffect(() => {
    if (!calendarRange) {
      return undefined;
    }

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
          params: {
            ...calendarRange,
            includeCancelled: false,
          },
        });
        if (!isMounted) {
          return;
        }
        const nextAppointments = response.data?.appointments || [];
        rangeCacheRef.current.set(cacheKey, nextAppointments);
        setAppointments(nextAppointments);
        setError(null);
      } catch (requestError) {
        if (isMounted) {
          setError('Failed to load the calendar. Try refreshing the schedule.');
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
  }, [calendarRange, refreshVersion, refreshKey]);

  const matchAppointmentToUser = useCallback((appointment, user) => {
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
  }, []);

  const matchAppointmentToSelection = useCallback((appointment) => {
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
  }, [selectedClinician]);

  const filteredAppointments = useMemo(() => {
    const base = Array.isArray(appointments) ? appointments : [];
    if (userData?.role === 'admin') {
      return base.filter((appointment) => matchAppointmentToSelection(appointment));
    }
    return base.filter((appointment) => matchAppointmentToUser(appointment, userData));
  }, [appointments, matchAppointmentToSelection, matchAppointmentToUser, userData]);

  const events = useMemo(
    () => filteredAppointments.map(buildEvent).filter(Boolean).sort((a, b) => a.start - b.start),
    [filteredAppointments],
  );

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const upcoming = events.filter((event) => event.end >= now);
    return (upcoming.length ? upcoming : events).slice(0, 6);
  }, [events]);

  useEffect(() => {
    if (!isMobile || !calendarRef.current) {
      return;
    }
    const api = calendarRef.current.getApi();
    if (calendarView === 'timeGridWeek') {
      api.changeView('timeGridDay');
      return;
    }
    if (calendarView === 'timeGridDay' || calendarView === 'dayGridMonth' || calendarView === 'listWeek') {
      return;
    }
    api.changeView('timeGridDay');
  }, [isMobile, calendarView]);

  const navigateCalendar = (action) => {
    const api = calendarRef.current?.getApi();
    if (!api) {
      return;
    }
    if (action === 'today') {
      api.today();
    } else if (action === 'previous') {
      api.prev();
    } else {
      api.next();
    }
  };

  const changeCalendarView = (_event, nextView) => {
    if (!nextView) {
      return;
    }
    calendarRef.current?.getApi().changeView(nextView);
  };

  const handleSelectEvent = useCallback((info) => {
    info.jsEvent?.preventDefault();
    const { event } = info;
    const props = event.extendedProps || {};
    setSelectedAppointment({
      title: event.title,
      start: event.start,
      patientName: props.patientName,
      treatment: props.treatment,
      location: props.location,
      phone: props.phone,
      email: props.email,
      body: props.body,
      status: props.status,
      durationMinutes: props.durationMinutes,
    });
    setPopupVisible(true);
  }, []);

  const handleCalendarMutation = useCallback((changeInfo) => {
    const { event } = changeInfo;
    const appointment = event.extendedProps?.resource;
    if (!appointment || !event.start) {
      changeInfo.revert();
      return;
    }
    const end = event.end || new Date(event.start.getTime() + (Number(appointment.duration_minutes) || 60) * 60000);
    const durationMinutes = Math.max(15, Math.round((end.getTime() - event.start.getTime()) / 60000));
    changeInfo.revert();
    setMutationError('');
    setSendRescheduleEmail(true);
    setPendingMutation({
      appointment,
      appointmentId: appointment.appointment_id,
      nextDate: event.start.toISOString(),
      nextDuration: durationMinutes,
    });
  }, []);

  const cancelPendingMutation = () => {
    if (!savingMutation) {
      setPendingMutation(null);
      setMutationError('');
    }
  };

  const savePendingMutation = async () => {
    if (!pendingMutation) {
      return;
    }
    setSavingMutation(true);
    setMutationError('');
    try {
      const response = await apiClient.put(`/api/appointments/${pendingMutation.appointmentId}`, {
        date: pendingMutation.nextDate,
        duration_minutes: pendingMutation.nextDuration,
        sendRescheduleEmail,
      });
      const updated = response.data?.appointment;
      if (updated) {
        setAppointments((previous) => previous.map((appointment) => (
          appointment.appointment_id === updated.appointment_id
            ? { ...appointment, ...updated }
            : appointment
        )));
      }
      rangeCacheRef.current.clear();
      setRefreshKey((previous) => previous + 1);
      refreshAppointments?.();
      setPendingMutation(null);
      setToast({
        open: true,
        severity: 'success',
        message: sendRescheduleEmail ? 'Appointment moved and confirmation email queued.' : 'Appointment moved successfully.',
      });
    } catch (requestError) {
      setMutationError(requestError?.response?.data?.message || 'Unable to save this schedule change.');
    } finally {
      setSavingMutation(false);
    }
  };

  const renderEventContent = useCallback((eventInfo) => <CalendarEvent eventInfo={eventInfo} />, []);

  const eventClassNames = useCallback((arg) => {
    const status = arg.event.extendedProps?.status || 'scheduled';
    return [`calendar-event-status--${getStatusClass(status)}`];
  }, []);

  const eventDidMount = useCallback((info) => {
    const props = info.event.extendedProps || {};
    info.el.setAttribute('title', `${props.patientName || 'Patient'} · ${props.treatment || 'Appointment'} · ${getStatusLabel(props.status)}`);
  }, []);

  const calendarHeight = calendarView === 'dayGridMonth'
    ? 'auto'
    : (isMobile ? 650 : 760);

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
        <Stack className="calendar-shell__filters" direction="row" spacing={1.25} alignItems="center">
          <Box className="calendar-legend" aria-label="Appointment status legend">
            {['scheduled', 'completed', 'cancelled'].map((status) => (
              <Box className="calendar-legend__item" key={status}>
                <span className="calendar-legend__dot" style={{ backgroundColor: STATUS_COLORS[status] }} />
                <span>{getStatusLabel(status)}</span>
              </Box>
            ))}
          </Box>
          {userData?.role === 'admin' && (
            <FormControl size="small" className="calendar-clinician-filter">
              <InputLabel>Clinician</InputLabel>
              <Select
                label="Clinician"
                value={selectedClinician}
                onChange={(event) => setSelectedClinician(event.target.value)}
              >
                {clinicianOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Stack>
      </Box>

      <Divider className="calendar-shell__divider" />

      <Box className="calendar-toolbar" aria-label="Calendar controls">
        <Stack className="calendar-toolbar__navigation" direction="row" spacing={0.75} alignItems="center">
          <Tooltip title="Previous period">
            <IconButton onClick={() => navigateCalendar('previous')} aria-label="Previous period" size="small">
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button onClick={() => navigateCalendar('today')} startIcon={<TodayIcon fontSize="small" />}>
            Today
          </Button>
          <Tooltip title="Next period">
            <IconButton onClick={() => navigateCalendar('next')} aria-label="Next period" size="small">
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        <Box className="calendar-toolbar__date">
          <Box className="calendar-toolbar__title-row">
            <CalendarMonthIcon fontSize="small" aria-hidden="true" />
            <Typography component="span" className="calendar-toolbar__label">
              {calendarTitle}
            </Typography>
          </Box>
          <Typography component="span" className="calendar-toolbar__hint">
            Select an appointment for details · drag or resize to propose a change
          </Typography>
        </Box>
        <ToggleButtonGroup
          className="calendar-toolbar__views"
          size="small"
          value={calendarView}
          exclusive
          onChange={changeCalendarView}
          aria-label="Calendar view"
        >
          {VIEW_OPTIONS.map((option) => (
            <ToggleButton key={option.value} value={option.value} aria-label={`${option.label} view`}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box className="calendar-shell__layout">
        <Box className="calendar-shell__calendar-panel">
          {loading && (
            <Box className="calendar-panel__loading" role="status" aria-live="polite">
              <CircularProgress size={22} />
              <Typography variant="body2">Refreshing schedule…</Typography>
            </Box>
          )}
          {!loading && !events.length && (
            <Box className="calendar-empty-banner">
              <strong>No appointments in this view</strong>
              <span>Use the appointment manager below to create or edit bookings.</span>
            </Box>
          )}
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={getInitialView()}
            initialDate={new Date()}
            headerToolbar={false}
            events={events}
            height={calendarHeight}
            expandRows={false}
            firstDay={1}
            weekends
            nowIndicator
            stickyHeaderDates
            dayMaxEvents={4}
            moreLinkClick="popover"
            eventDisplay="block"
            eventOrder="start,-duration,title"
            slotMinTime="07:00:00"
            slotMaxTime="20:00:00"
            scrollTime="08:00:00"
            slotDuration="00:30:00"
            slotLabelInterval="01:00:00"
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            dayHeaderFormat={{ weekday: 'short', day: 'numeric', month: 'short', omitCommas: true }}
            businessHours={{ daysOfWeek: [1, 2, 3, 4, 5], startTime: '07:00', endTime: '20:00' }}
            locale="en-gb"
            editable={canManageSchedule}
            eventStartEditable={canManageSchedule}
            eventDurationEditable={canManageSchedule}
            eventResizableFromStart={false}
            eventContent={renderEventContent}
            eventClassNames={eventClassNames}
            eventDidMount={eventDidMount}
            eventClick={handleSelectEvent}
            eventDrop={handleCalendarMutation}
            eventResize={handleCalendarMutation}
            datesSet={handleDatesSet}
            noEventsContent="No appointments in this view"
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
            {upcomingEvents.length ? upcomingEvents.map((event) => {
              const props = event.extendedProps || {};
              return (
                <Box
                  component="button"
                  type="button"
                  className="calendar-agenda__item"
                  key={event.id}
                  onClick={() => handleSelectEvent({ event, jsEvent: { preventDefault: () => {} } })}
                >
                  <Box className="calendar-agenda__item-time">
                    <strong>{event.start.toLocaleDateString('en-GB', { weekday: 'short' })}</strong>
                    <span>{event.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  </Box>
                  <Box className="calendar-agenda__item-copy">
                    <strong>{props.patientName}</strong>
                    <span>{event.start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {props.treatment}</span>
                    <span>{props.location}</span>
                  </Box>
                  <span
                    className="calendar-agenda__status"
                    style={{ backgroundColor: STATUS_COLORS[props.status] || STATUS_COLORS.scheduled }}
                    title={getStatusLabel(props.status)}
                  />
                </Box>
              );
            }) : (
              <Typography variant="body2" className="calendar-agenda__empty">
                No appointments match this filter.
              </Typography>
            )}
          </Box>
          <Typography variant="caption" className="calendar-agenda__hint">
            Click an appointment for details. Moving or resizing one will ask you to confirm the change.
          </Typography>
        </Box>
      </Box>

      {isPopupVisible && (
        <CustomPopup
          appointment={selectedAppointment}
          onClose={() => setPopupVisible(false)}
        />
      )}

      <Dialog
        open={Boolean(pendingMutation)}
        onClose={cancelPendingMutation}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pr: 6 }}>
          Save schedule change?
          <IconButton aria-label="Close" onClick={cancelPendingMutation} disabled={savingMutation} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {pendingMutation && (
            <Stack spacing={2}>
              <Typography variant="body1">
                Move <strong>{getPatientName(pendingMutation.appointment)}</strong> to <strong>{formatCalendarDateTime(pendingMutation.nextDate)}</strong>.
              </Typography>
              <Box className="calendar-change-summary">
                <Typography variant="caption">New appointment length</Typography>
                <Typography variant="h6">{formatDuration(pendingMutation.nextDuration)}</Typography>
                <Typography variant="body2">{pendingMutation.appointment.treatment_description || 'Appointment'}</Typography>
              </Box>
              <FormControlLabel
                control={<Checkbox checked={sendRescheduleEmail} onChange={(event) => setSendRescheduleEmail(event.target.checked)} />}
                label="Send a reschedule confirmation email to the patient"
              />
              {mutationError && <Alert severity="error">{mutationError}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={cancelPendingMutation} disabled={savingMutation}>Cancel</Button>
          <Button onClick={savePendingMutation} variant="contained" disabled={savingMutation}>
            {savingMutation ? 'Saving…' : 'Save change'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={4500}
        onClose={() => setToast((previous) => ({ ...previous, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} onClose={() => setToast((previous) => ({ ...previous, open: false }))}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TUICalendar;
