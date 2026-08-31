import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import TUICalendar from './TUICalendar';

const Appointments = lazy(() => import('./Appointments'));

const ScheduleTableLoading = () => (
  <Box className="schedule-table-loading" role="status" aria-live="polite">
    <span className="app-spinner" aria-hidden="true" />
    <Typography variant="body2" color="text.secondary">
      Loading appointment management…
    </Typography>
  </Box>
);

const Schedule = ({ userData }) => {
  const [tableReady, setTableReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const showTable = () => {
      if (!cancelled) {
        setTableReady(true);
      }
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(showTable, { timeout: 250 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = window.setTimeout(showTable, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
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
      {tableReady ? (
        <Suspense fallback={<ScheduleTableLoading />}>
          <Appointments userData={userData} />
        </Suspense>
      ) : <ScheduleTableLoading />}
    </Box>
  );
};

export default Schedule;
