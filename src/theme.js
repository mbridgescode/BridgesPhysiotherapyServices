// src/theme.js
import { createTheme } from '@mui/material/styles';

const baseColors = {
  background: '#0D111E',
  surface: '#1F2937',
  elevated: '#2B3648',
  primary: '#A855F7',
  primaryAlt: '#6366F1',
  secondary: '#5EEAD4',
  textPrimary: '#F8FAFC',
  textSecondary: '#9CA3AF',
};

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: baseColors.primary,
      contrastText: baseColors.textPrimary,
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
    divider: 'rgba(148, 163, 184, 0.18)',
  },
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontWeight: 600, letterSpacing: '-0.02em' },
    h2: { fontWeight: 600, letterSpacing: '-0.015em' },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 500 },
    h5: { fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' },
    button: { textTransform: 'none', fontWeight: 600 },
    body1: { fontSize: '1rem', color: baseColors.textPrimary },
    body2: { fontSize: '0.9375rem', color: baseColors.textSecondary },
  },
  shape: {
    borderRadius: 18,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: baseColors.background,
          backgroundImage: 'linear-gradient(135deg, #2D0F5C 0%, #0B1220 50%, #28124C 100%)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: baseColors.surface,
          backgroundImage: 'none',
          border: '1px solid rgba(255, 255, 255, 0.04)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 30px 50px rgba(9, 9, 16, 0.45)',
          borderRadius: 28,
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 999,
          padding: '10px 22px',
          backgroundImage: `linear-gradient(120deg, ${baseColors.primary}, ${baseColors.primaryAlt})`,
          boxShadow: '0 10px 30px rgba(168, 85, 247, 0.35)',
          transition: 'transform 200ms ease, box-shadow 200ms ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 16px 35px rgba(59, 130, 246, 0.35)',
            backgroundImage: `linear-gradient(120deg, ${baseColors.primaryAlt}, ${baseColors.primary})`,
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
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontSize: '0.75rem',
          color: baseColors.textSecondary,
        },
      },
    },
  },
});

export default theme;
