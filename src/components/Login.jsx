import React, { useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { emitAuthTokenChanged } from '../utils/authEvents';
import AuthLayout from '../ui/AuthLayout';
import { Button, StatusMessage, TextInput } from '../ui';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = { username, password };
      if (twoFactorCode) payload.twoFactorCode = twoFactorCode;

      const response = await apiClient.post('/auth/login', payload);
      if (response.data.success) {
        localStorage.setItem('token', response.data.accessToken);
        if (response.data.user) localStorage.setItem('user', JSON.stringify(response.data.user));
        setTwoFactorRequired(false);
        setTwoFactorCode('');
        emitAuthTokenChanged();
        navigate('/dashboard');
      } else {
        setError('Invalid credentials');
      }
    } catch (requestError) {
      if (requestError.response?.data?.twoFactorRequired) {
        setTwoFactorRequired(true);
        setError(requestError.response.data.message || 'Two-factor authentication required');
      } else {
        setError(requestError.response?.data?.message || 'Login failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      description="Sign in to manage appointments, patients, and clinic operations."
      icon={<LockKeyhole size={18} strokeWidth={1.8} />}
      links={[{ to: '/forgot-password', label: 'Forgot password?' }]}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && <StatusMessage>{error}</StatusMessage>}
        <TextInput
          id="username"
          label="Username"
          name="username"
          autoComplete="username"
          autoFocus
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <TextInput
          id="password"
          label="Password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          trailing={(
            <button
              className="ui-input-action"
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          )}
        />
        {twoFactorRequired && (
          <TextInput
            id="twoFactorCode"
            label="Authentication code"
            name="twoFactorCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            helperText="Enter the 6-digit code from your authenticator app."
            value={twoFactorCode}
            onChange={(event) => setTwoFactorCode(event.target.value)}
          />
        )}
        <Button type="submit" disabled={submitting} size="lg">
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default Login;
