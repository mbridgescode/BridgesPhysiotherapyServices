// src/components/Dashboard/TUICalendar.js

import React, { useContext, useMemo, useState } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../../styles/calendarOverrides.css';
import { Box, CircularProgress, Typography } from '@mui/material';
import { AppointmentsContext } from '../../context/AppointmentsContext';
import CustomPopup from './CustomPopup';

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
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [isPopupVisible, setPopupVisible] = useState(false);

  const events = useMemo(
    () => (Array.isArray(appointments) ? appointments : []).map(buildEvent),
    [appointments],
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
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: 1020 }}
        min={minTime}
        max={maxTime}
        views={[Views.DAY, Views.WEEK, Views.AGENDA]}
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
