import React, { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  CssBaseline,
  Grid,
  Link,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../utils/apiClient';

const MIN_PASSWORD_LENGTH = 8;

const ResetPassword = () => {
  const textFieldSx = {
    '& .MuiInputBase-input': { color: 'text.primary' },
    '& .MuiOutlinedInput-root': { backgroundColor: 'rgba(255,255,255,0.95)' },
    '& .MuiInputLabel-root': { color: 'text.secondary' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'primary.main' },
  };

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetEmail = useMemo(() => searchParams.get('email') || '', [searchParams]);
  const presetToken = useMemo(() => searchParams.get('token') || '', [searchParams]);

  const [email, setEmail] = useState(presetEmail);
  const [token, setToken] = useState(presetToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const toggleShowPassword = () => setShowPassword((prev) => !prev);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');

    if (!email || !token) {
      setError('Reset token and email are required.');
      return;
    }
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/auth/reset-password', { email, token, newPassword });
      setMessage('Your password has been reset. You can now sign in with your new password.');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to reset password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Grid container component="main" sx={{ height: '100vh' }}>
      <CssBaseline />
      <Grid
        item
        xs={12}
        sm={12}
        md={12}
        sx={{
          backgroundImage: 'url(https://images.pexels.com/photos/114979/pexels-photo-114979.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940)',
          backgroundRepeat: 'no-repeat',
          backgroundColor: (t) => (t.palette.mode === 'light' ? t.palette.grey[50] : t.palette.grey[900]),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        <Paper
          elevation={6}
          sx={{
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            maxWidth: '420px',
            width: '100%',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(10px)',
            borderRadius: 2,
            color: 'text.primary',
          }}
        >
          <Avatar sx={{ m: 1, bgcolor: 'secondary.main' }}>
            <LockResetIcon />
          </Avatar>
          <Typography component="h1" variant="h5">
            Reset password
          </Typography>
          {message && (
            <Typography color="primary" sx={{ mt: 1 }}>
              {message}
            </Typography>
          )}
          {error && (
            <Typography color="error" sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1, width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email address"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={textFieldSx}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              id="token"
              label="Reset token"
              name="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              helperText="Copy the token from your email link if it did not auto-fill."
              sx={textFieldSx}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="newPassword"
              label="New password"
              type={showPassword ? 'text' : 'password'}
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              sx={textFieldSx}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={toggleShowPassword}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="confirmPassword"
              label="Confirm password"
              type={showPassword ? 'text' : 'password'}
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              sx={textFieldSx}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={submitting}
              sx={{ mt: 3, mb: 2 }}
            >
              {submitting ? 'Saving...' : 'Reset password'}
            </Button>
            <Grid container justifyContent="space-between">
              <Grid item>
                <Link component={RouterLink} to="/login" variant="body2">
                  Back to sign in
                </Link>
              </Grid>
              <Grid item>
                <Link component={RouterLink} to="/forgot-password" variant="body2">
                  Request a new link
                </Link>
              </Grid>
            </Grid>
          </Box>
        </Paper>
      </Grid>
    </Grid>
  );
};

export default ResetPassword;
