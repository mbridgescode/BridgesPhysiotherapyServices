// src/components/Dashboard/Dashboard.js

import React, { useEffect, useState } from 'react';
import {
  Routes,
  Route,
  useNavigate,
  Navigate,
} from 'react-router-dom';
import { Box, CssBaseline, CircularProgress } from '@mui/material';
import Sidebar, { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from '../Sidebar';
import Home from './Home';
import Settings from './Settings';
import Reports from './Reports';
import ProfitLoss from './ProfitLoss';
import Appointments from './Appointments';
import Patients from './Patients';
import PatientDetails from './PatientDetails';
import Invoices from './Invoices';
import AuditLog from './AuditLog';
import Admin from './Admin';
import { styled } from '@mui/material/styles';
import apiClient from '../../utils/apiClient';
import { emitAuthTokenChanged } from '../../utils/authEvents';

const Main = styled('main', {
  shouldForwardProp: (prop) => prop !== 'drawerWidth',
})(({ theme, drawerWidth }) => ({
  flexGrow: 1,
  padding: theme.spacing(3),
  marginLeft: `${drawerWidth}px`,
  minHeight: '100vh',
  background: 'transparent',
  display: 'flex',
  justifyContent: 'flex-start',
  alignItems: 'stretch',
  width: `calc(100% - ${drawerWidth}px)`,
  boxSizing: 'border-box',
  overflow: 'hidden',
  transition: 'margin-left 0.2s ease',
}));

const Dashboard = () => {
  const [userData, setUserData] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userResponse = await apiClient.get('/api/users/me');
        setUserData(userResponse.data.user);
      } catch (error) {
        console.error('Error fetching user data:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        emitAuthTokenChanged();
        navigate('/login');
      }
    };

    fetchData();
  }, [navigate, emitAuthTokenChanged]);

  if (!userData) {
    return <CircularProgress />;
  }

  const drawerWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: 'transparent',
      }}
    >
      <CssBaseline />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />
      <Main drawerWidth={drawerWidth}>
        <Box
          sx={{
            width: '100%',
            maxWidth: '100%',
            px: 0,
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            gap: 4,
            overflow: 'hidden',
          }}
        >
          <Routes>
            <Route index element={<Home userData={userData} />} />
            <Route path="appointments" element={<Appointments userData={userData} />} />
            <Route path="patients" element={<Patients userData={userData} />} />
            <Route path="patients/:id" element={<PatientDetails />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="reports" element={<Reports />} />
            <Route path="profit-loss" element={<ProfitLoss />} />
            <Route path="settings" element={<Settings />} />
            <Route path="audit" element={<AuditLog />} />
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<Navigate to="." replace />} />
          </Routes>
        </Box>
      </Main>
    </Box>
  );
};

export default Dashboard;
