// src/components/Sidebar.js

import React, { useContext } from 'react';
import {
  Drawer,
  List,
  Divider,
  CssBaseline,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
} from '@mui/material';
import {
  Home as HomeIcon,
  Person as PersonIcon,
  Settings as SettingsIcon,
  BarChart as BarChartIcon,
  EventNote as AppointmentIcon,
  ReceiptLong as InvoiceIcon,
  AdminPanelSettings as AdminIcon,
  Security as AuditIcon,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { styled } from '@mui/material/styles';
import { UserContext } from '../context/UserContext';

export const SIDEBAR_WIDTH = 212;
const drawerWidth = SIDEBAR_WIDTH;

// Use styled components to manage drawer state
const DrawerStyled = styled(Drawer)(({ theme }) => ({
  width: drawerWidth,
  flexShrink: 0,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  overflowX: 'hidden',
  '& .MuiDrawer-paper': {
    width: drawerWidth,
    overflowX: 'hidden',
    backgroundColor: '#090D16',
    borderRight: '1px solid rgba(148, 163, 184, 0.08)',
    paddingTop: theme.spacing(3),
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
  },
}));

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userData } = useContext(UserContext);
  const role = userData?.role;

  const navItems = [
    {
      label: 'Home',
      icon: <HomeIcon />,
      path: '/dashboard',
      roles: ['admin', 'therapist', 'receptionist'],
    },
    {
      label: 'Appointments',
      icon: <AppointmentIcon />,
      path: '/dashboard/appointments',
      roles: ['admin', 'therapist', 'receptionist'],
    },
    {
      label: 'Patients',
      icon: <PersonIcon />,
      path: '/dashboard/patients',
      roles: ['admin', 'therapist', 'receptionist'],
    },
    {
      label: 'Invoices',
      icon: <InvoiceIcon />,
      path: '/dashboard/invoices',
      roles: ['admin', 'receptionist'],
    },
    {
      label: 'Reports',
      icon: <BarChartIcon />,
      path: '/dashboard/reports',
      roles: ['admin', 'therapist'],
    },
    {
      label: 'Settings',
      icon: <SettingsIcon />,
      path: '/dashboard/settings',
      roles: ['admin'],
    },
    {
      label: 'Admin',
      icon: <AdminIcon />,
      path: '/dashboard/admin',
      roles: ['admin'],
    },
    {
      label: 'Audit Log',
      icon: <AuditIcon />,
      path: '/dashboard/audit',
      roles: ['admin'],
    },
  ];

  return (
    <>
      <CssBaseline />
      <DrawerStyled variant="permanent" PaperProps={{ elevation: 0 }}>
        <Box
          sx={{
            width: '100%',
            px: 2,
            pb: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 1,
          }}
        >
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2,
              backgroundImage: 'linear-gradient(135deg, #5EEAD4, #3B82F6)',
            }}
          />
          <Typography variant="subtitle2" sx={{ color: 'rgba(248,250,252,0.6)', letterSpacing: '0.3em' }}>
            BPS
          </Typography>
        </Box>
        <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.12)', width: '100%', mx: 'auto' }} />
        <List sx={{ mt: 2, width: '100%' }}>
          {navItems
            .filter((item) => !item.roles || item.roles.includes(role))
            .map((item) => {
              const slug = item.label.toLowerCase().replace(/\s+/g, '-');
              const isActive = location.pathname.startsWith(item.path);
              return (
                <ListItemButton
                  key={item.label}
                  selected={isActive}
                  onClick={() => navigate(item.path)}
                  data-testid={`sidebar-nav-${slug}`}
                  aria-label={item.label}
                  sx={{
                    mb: 1,
                    borderRadius: 2.5,
                    color: isActive ? '#5EEAD4' : 'rgba(248,250,252,0.85)',
                    justifyContent: 'flex-start',
                    minHeight: 54,
                    gap: 1.5,
                    pl: 1,
                    position: 'relative',
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(94, 234, 212, 0.08)',
                    },
                    '&:hover': {
                      backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    },
                  }}
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      width: 6,
                      height: 26,
                      borderRadius: 999,
                      backgroundColor: isActive ? '#5EEAD4' : 'transparent',
                      transition: 'all 0.2s ease',
                    }}
                  />
                  <ListItemIcon
                    sx={{
                      minWidth: 36,
                      color: 'inherit',
                      justifyContent: 'flex-start',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    sx={{
                      '& .MuiTypography-root': {
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        letterSpacing: '0.02em',
                      },
                    }}
                  />
                </ListItemButton>
              );
            })}
        </List>
      </DrawerStyled>
    </>
  );
};

export default Sidebar;
