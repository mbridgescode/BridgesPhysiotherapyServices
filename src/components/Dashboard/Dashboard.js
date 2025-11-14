// src/components/Dashboard/Dashboard.js

import React, { useEffect, useState } from 'react';
import {
  Routes,
  Route,
  useNavigate,
  Navigate,
} from 'react-router-dom';
import {
  Box,
  CssBaseline,
  CircularProgress,
  IconButton,
  Typography,
  useMediaQuery,
} from '@mui/material';
import Sidebar, { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from '../Sidebar';
import Home from './Home';
import Settings from './Settings';
import Reports from './Reports';
import ProfitLoss from './ProfitLoss';
import Appointments from './Appointments';
import Patients from './Patients';
import PatientDetails from './PatientDetails';
import Invoices from './Invoices';
import Payments from './Payments';
import AuditLog from './AuditLog';
import Admin from './Admin';
import Communications from './Communications';
import { styled, useTheme } from '@mui/material/styles';
import apiClient from '../../utils/apiClient';
import { emitAuthTokenChanged } from '../../utils/authEvents';
import MenuIcon from '@mui/icons-material/Menu';

const Main = styled('main', {
  shouldForwardProp: (prop) => prop !== 'drawerWidth' && prop !== 'isMobile',
})(({ theme, drawerWidth, isMobile }) => ({
  flexGrow: 1,
  paddingTop: theme.spacing(isMobile ? 1.5 : 2.5),
  paddingBottom: theme.spacing(isMobile ? 1.5 : 2.5),
  paddingLeft: theme.spacing(isMobile ? 1 : 0),
  paddingRight: theme.spacing(isMobile ? 1 : 0),
  marginLeft: isMobile ? 0 : `${drawerWidth}px`,
  minHeight: '100vh',
  background: 'transparent',
  display: 'flex',
  justifyContent: 'flex-start',
  alignItems: 'stretch',
  width: isMobile ? '100%' : `calc(100% - ${drawerWidth}px)`,
  boxSizing: 'border-box',
  overflow: 'hidden',
  transition: 'margin-left 0.2s ease',
}));

const Dashboard = () => {
  const [userData, setUserData] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
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

  useEffect(() => {
    if (!isMobile) {
      setMobileDrawerOpen(false);
    }
  }, [isMobile]);

  if (!userData) {
    return <CircularProgress />;
  }

  const drawerWidth = isMobile ? 0 : (sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH);

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
        variant={isMobile ? 'temporary' : 'permanent'}
        mobileOpen={mobileDrawerOpen}
        onMobileClose={() => setMobileDrawerOpen(false)}
      />
      <Main drawerWidth={drawerWidth} isMobile={isMobile}>
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
          {isMobile && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 2,
              }}
            >
              <IconButton
                color="inherit"
                onClick={() => setMobileDrawerOpen(true)}
                aria-label="Open navigation"
              >
                <MenuIcon />
              </IconButton>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {userData?.name || userData?.username
                  ? `Hi, ${userData.name || userData.username}`
                  : 'Dashboard'}
              </Typography>
              <Box sx={{ width: 40 }} />
            </Box>
          )}
          <Routes>
            <Route index element={<Home userData={userData} />} />
            <Route path="appointments" element={<Appointments userData={userData} />} />
            <Route path="patients" element={<Patients userData={userData} />} />
            <Route path="patients/:id" element={<PatientDetails />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="payments" element={<Payments userData={userData} />} />
            <Route path="reports" element={<Reports />} />
            <Route path="profit-loss" element={<ProfitLoss />} />
            <Route path="settings" element={<Settings />} />
            <Route path="communications" element={<Communications />} />
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
