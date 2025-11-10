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
  IconButton,
  Tooltip,
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
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  TrendingDown as ProfitLossIcon,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { styled } from '@mui/material/styles';
import { UserContext } from '../context/UserContext';

export const SIDEBAR_WIDTH = 212;
export const SIDEBAR_COLLAPSED_WIDTH = 72;

// Use styled components to manage drawer state
const DrawerStyled = styled(Drawer, {
  shouldForwardProp: (prop) => prop !== 'collapsed',
})(({ theme, collapsed }) => {
  const width = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
  return {
    width,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    overflowX: 'hidden',
    transition: 'width 0.2s ease',
    '& .MuiDrawer-paper': {
      width,
      overflowX: 'hidden',
      backgroundColor: '#090D16',
      borderRight: '1px solid rgba(148, 163, 184, 0.08)',
      paddingTop: theme.spacing(3),
      display: 'flex',
      flexDirection: 'column',
      alignItems: collapsed ? 'center' : 'flex-start',
      paddingLeft: collapsed ? theme.spacing(1) : theme.spacing(2),
      paddingRight: collapsed ? theme.spacing(1) : theme.spacing(2),
      transition: 'width 0.2s ease, padding 0.2s ease',
    },
  };
});

const Sidebar = ({ collapsed = false, onToggleCollapse = () => {} }) => {
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
      label: 'Patients',
      icon: <PersonIcon />,
      path: '/dashboard/patients',
      roles: ['admin', 'therapist', 'receptionist'],
    },
    {
      label: 'Appointments',
      icon: <AppointmentIcon />,
      path: '/dashboard/appointments',
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
      label: 'Profit & Loss',
      icon: <ProfitLossIcon />,
      path: '/dashboard/profit-loss',
      roles: ['admin', 'receptionist'],
    },
    {
      label: 'Admin',
      icon: <AdminIcon />,
      path: '/dashboard/admin',
      roles: ['admin'],
    },
    {
      label: 'Settings',
      icon: <SettingsIcon />,
      path: '/dashboard/settings',
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
      <DrawerStyled variant="permanent" PaperProps={{ elevation: 0 }} collapsed={collapsed}>
        <Box
          sx={{
            width: '100%',
            px: collapsed ? 0 : 2,
            pb: 2,
            display: 'flex',
            flexDirection: collapsed ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            gap: 1,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
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
            {!collapsed && (
              <Typography variant="subtitle2" sx={{ color: 'rgba(248,250,252,0.6)', letterSpacing: '0.3em' }}>
                BPS
              </Typography>
            )}
          </Box>
          <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
            <IconButton
              size="small"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              sx={{ color: 'rgba(248,250,252,0.7)' }}
            >
              {collapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
        <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.12)', width: '100%', mx: 'auto' }} />
        <List sx={{ mt: 2, width: '100%' }}>
          {navItems
            .filter((item) => !item.roles || item.roles.includes(role))
            .map((item) => {
              const slug = item.label.toLowerCase().replace(/\s+/g, '-');
              const isActive = location.pathname.startsWith(item.path);
              const button = (
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
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    minHeight: 54,
                    gap: collapsed ? 0 : 1.5,
                    pl: collapsed ? 0 : 1,
                    pr: collapsed ? 0 : 1.5,
                    position: 'relative',
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(94, 234, 212, 0.08)',
                    },
                    '&:hover': {
                      backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    },
                  }}
                >
                  {!collapsed && (
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
                  )}
                  <ListItemIcon
                    sx={{
                      minWidth: collapsed ? 0 : 36,
                      color: 'inherit',
                      justifyContent: 'center',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  {!collapsed && (
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
                  )}
                </ListItemButton>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.label} title={item.label} placement="right">
                    {button}
                  </Tooltip>
                );
              }
              return button;
            })}
        </List>
      </DrawerStyled>
    </>
  );
};

export default Sidebar;
