import React from 'react';
import { Box, Typography } from '@mui/material';
import TUICalendar from './TUICalendar';
import Appointments from './Appointments';

const Schedule = ({ userData }) => (
  <Box className="schedule-workspace" sx={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
    <Box className="page-intro" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Typography variant="h4" sx={{ mt: 0.5, lineHeight: 1.2 }}>
        Schedule
      </Typography>
      <Typography variant="body2" color="text.secondary">
        View the calendar and manage every appointment from one place.
      </Typography>
    </Box>
    <TUICalendar />
    <Appointments userData={userData} />
  </Box>
);

export default Schedule;
