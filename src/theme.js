// src/theme.js
import { createTheme } from '@mui/material/styles';

const baseColors = {
  background: '#0B1220',
  surface: '#111B2D',
  elevated: '#18263A',
  primary: '#5EEAD4',
  primaryAlt: '#8B5CF6',
  secondary: '#8B5CF6',
  textPrimary: '#F8FAFC',
  textSecondary: '#A7B3C5',
};

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: baseColors.primary,
      contrastText: '#06211F',
    },
    secondary: {
      main: baseColors.secondary,
      contrastText: baseColors.textPrimary,
    },
    background: {
      default: baseColors.background,
      paper: baseColors.surface,
    },
    text: {
      primary: baseColors.textPrimary,
      secondary: baseColors.textSecondary,
    },
    success: { main: '#34D399' },
    warning: { main: '#FBBF24' },
    error: { main: '#FB7185' },
    info: { main: '#60A5FA' },
    divider: 'rgba(148, 163, 184, 0.16)',
  },
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontWeight: 600, letterSpacing: '-0.02em' },
    h2: { fontWeight: 600, letterSpacing: '-0.015em' },
    h3: { fontWeight: 600, letterSpacing: '-0.01em' },
    h4: { fontWeight: 500 },
    h5: { fontWeight: 600, letterSpacing: '-0.01em' },
    button: { textTransform: 'none', fontWeight: 600 },
    body1: { fontSize: '1rem', color: baseColors.textPrimary },
    body2: { fontSize: '0.9375rem', color: baseColors.textSecondary },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: baseColors.background,
          backgroundImage: 'radial-gradient(circle at 88% -12%, rgba(94, 234, 212, 0.10), transparent 28rem), radial-gradient(circle at 8% 0%, rgba(139, 92, 246, 0.12), transparent 32rem)',
          color: baseColors.textPrimary,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: baseColors.surface,
          backgroundImage: 'none',
          border: '1px solid rgba(148, 163, 184, 0.16)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 18px 45px rgba(0, 0, 0, 0.20)',
          borderRadius: 16,
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '10px 17px',
          backgroundColor: baseColors.primary,
          color: '#06211F',
          transition: 'transform 150ms ease, box-shadow 150ms ease, background-color 150ms ease',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 10px 24px rgba(94, 234, 212, 0.18)',
            backgroundColor: '#99F6E4',
          },
        },
        containedSecondary: {
          backgroundImage: 'none',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          textTransform: 'none',
          letterSpacing: '0.02em',
          fontSize: '0.75rem',
          color: baseColors.textSecondary,
        },
      },
    },
  },
});

export default theme;
