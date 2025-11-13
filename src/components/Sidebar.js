// src/components/Sidebar.js

import React, { useContext, useState } from 'react';
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
  Logout as LogoutIcon,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { styled } from '@mui/material/styles';
import { UserContext } from '../context/UserContext';
import apiClient from '../utils/apiClient';
import { emitAuthTokenChanged } from '../utils/authEvents';

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

const Sidebar = ({
  collapsed = false,
  onToggleCollapse = () => {},
  variant = 'permanent',
  mobileOpen = false,
  onMobileClose = () => {},
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userData } = useContext(UserContext);
  const role = userData?.role;
  const [loggingOut, setLoggingOut] = useState(false);

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
      roles: ['admin', 'receptionist', 'therapist'],
    },
    {
      label: 'Users',
      icon: <AdminIcon />,
      path: '/dashboard/admin',
      roles: ['admin'],
    },
    {
      label: 'Settings',
      icon: <SettingsIcon />,
      path: '/dashboard/settings',
      roles: ['admin', 'therapist'],
    },
    {
      label: 'Audit Log',
      icon: <AuditIcon />,
      path: '/dashboard/audit',
      roles: ['admin'],
    },
  ];

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }
    setLoggingOut(true);
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Failed to logout', error);
    } finally {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('token');
        window.localStorage.removeItem('user');
      }
      emitAuthTokenChanged();
      navigate('/login');
      setLoggingOut(false);
    }
  };

  const effectiveCollapsed = variant === 'temporary' ? false : collapsed;

  return (
    <>
      <CssBaseline />
      <DrawerStyled
        variant={variant}
        PaperProps={{ elevation: 0 }}
        collapsed={effectiveCollapsed}
        open={variant === 'temporary' ? mobileOpen : true}
        onClose={variant === 'temporary' ? onMobileClose : undefined}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: {
            xs: variant === 'temporary' ? 'block' : 'none',
            md: 'block',
          },
        }}
      >
        <Box
          sx={{
            width: '100%',
            px: effectiveCollapsed ? 0 : 2,
            pb: 2,
            display: 'flex',
            flexDirection: effectiveCollapsed ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: effectiveCollapsed ? 'center' : 'space-between',
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
            {!effectiveCollapsed && (
              <Typography variant="subtitle2" sx={{ color: 'rgba(248,250,252,0.6)', letterSpacing: '0.3em' }}>
                BPS
              </Typography>
            )}
          </Box>
          {variant !== 'temporary' && (
            <Tooltip title={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
              <IconButton
                size="small"
                onClick={onToggleCollapse}
                aria-label={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                sx={{ color: 'rgba(248,250,252,0.7)' }}
              >
                {effectiveCollapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
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
                    justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
                    minHeight: 54,
                    gap: effectiveCollapsed ? 0 : 1.5,
                    pl: effectiveCollapsed ? 0 : 1,
                    pr: effectiveCollapsed ? 0 : 1.5,
                    position: 'relative',
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(94, 234, 212, 0.08)',
                    },
                    '&:hover': {
                      backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    },
                  }}
                >
                  {!effectiveCollapsed && (
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
                      minWidth: effectiveCollapsed ? 0 : 36,
                      color: 'inherit',
                      justifyContent: 'center',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  {!effectiveCollapsed && (
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

              if (effectiveCollapsed) {
                return (
                  <Tooltip key={item.label} title={item.label} placement="right">
                    {button}
                  </Tooltip>
                );
              }
              return button;
          })}
          <Divider sx={{ my: 2, borderColor: 'rgba(148, 163, 184, 0.12)' }} />
          <ListItemButton
            onClick={handleLogout}
            disabled={loggingOut}
            sx={{
              borderRadius: 2.5,
              color: 'rgba(248,250,252,0.85)',
              justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
              minHeight: 50,
              gap: effectiveCollapsed ? 0 : 1.5,
              pl: effectiveCollapsed ? 0 : 1,
              pr: effectiveCollapsed ? 0 : 1.5,
              '&:hover': {
                backgroundColor: 'rgba(248,113,113,0.12)',
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: effectiveCollapsed ? 0 : 36,
                color: 'inherit',
                justifyContent: 'center',
              }}
            >
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            {!effectiveCollapsed && (
              <ListItemText
                primary={loggingOut ? 'Logging out...' : 'Log Out'}
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
        </List>
      </DrawerStyled>
    </>
  );
};

export default Sidebar;
