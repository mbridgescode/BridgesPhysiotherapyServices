// src/components/Dashboard/TUICalendar.js

import React, { useContext, useMemo, useState } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../../styles/calendarOverrides.css';
import {
  Box,
  CircularProgress,
  Typography,
  TextField,
  MenuItem,
} from '@mui/material';
import { AppointmentsContext } from '../../context/AppointmentsContext';
import CustomPopup from './CustomPopup';
import { UserContext } from '../../context/UserContext';
import useTherapists from '../../hooks/useTherapists';

const localizer = momentLocalizer(moment);

const buildEvent = (appointment) => {
  const start = new Date(appointment.date);
  const durationMinutes = appointment.duration_minutes || 60;
  const end = new Date(start.getTime() + durationMinutes * 60000);

  return {
    id: appointment.appointment_id,
    title: `${appointment.treatment_description || 'Appointment'} - ${appointment.first_name} ${appointment.surname}`,
    start,
    end,
    location: appointment.location || 'Clinic room',
    phone: appointment.contact || 'N/A',
    email: appointment.email || appointment.patient_email || 'Not provided',
    body: appointment.treatment_notes || 'No additional notes recorded.',
    status: appointment.status || 'scheduled',
    resource: appointment,
  };
};

const TUICalendar = () => {
  const { appointments, loading, error } = useContext(AppointmentsContext);
  const { userData } = useContext(UserContext);
  const { therapists } = useTherapists();
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [isPopupVisible, setPopupVisible] = useState(false);
  const [selectedClinician, setSelectedClinician] = useState('all');

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
    () => filteredAppointments.map(buildEvent),
    [filteredAppointments],
  );

  const minTime = useMemo(() => moment().startOf('day').hour(7).toDate(), []);
  const maxTime = useMemo(() => moment().startOf('day').hour(20).toDate(), []);

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
      {userData?.role === 'admin' && (
        <Box display="flex" justifyContent="flex-end" mb={2}>
          <TextField
            select
            label="Clinician"
            value={selectedClinician}
            onChange={(event) => setSelectedClinician(event.target.value)}
            size="small"
            sx={{ minWidth: 220 }}
          >
            {clinicianOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      )}
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: 1020 }}
        min={minTime}
        max={maxTime}
        views={[Views.DAY, Views.WEEK, Views.MONTH]}
        defaultView={Views.WEEK}
        eventPropGetter={(event) => {
          const colors = {
            scheduled: '#6366F1',
            completed: '#22c55e',
            cancelled: '#f87171',
          };
          return {
            style: {
              backgroundColor: colors[event.status] || '#a855f7',
              borderRadius: 12,
              border: 'none',
              color: '#fff',
              boxShadow: '0 8px 20px rgba(10,10,25,0.45)',
            },
          };
        }}
        onSelectEvent={handleSelectEvent}
        popup
        selectable={false}
      />
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
