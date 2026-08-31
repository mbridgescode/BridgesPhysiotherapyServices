import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import AuthLayout from '../ui/AuthLayout';
import { Button, StatusMessage, TextInput } from '../ui';

const MIN_PASSWORD_LENGTH = 8;

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetEmail = useMemo(() => searchParams.get('email') || '', [searchParams]);
  const presetToken = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const hasPresetToken = Boolean(presetToken);
  const [email, setEmail] = useState(presetEmail);
  const [token, setToken] = useState(presetToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Unable to reset password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset password"
      description="Choose a new password with at least eight characters."
      icon={<LockKeyhole size={18} strokeWidth={1.8} />}
      links={[
        { to: '/login', label: 'Back to sign in' },
        { to: '/forgot-password', label: 'Request a new link' },
      ]}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        {message && <StatusMessage type="success">{message}</StatusMessage>}
        {error && <StatusMessage>{error}</StatusMessage>}
        <TextInput
          id="email"
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {hasPresetToken ? (
          <input type="hidden" name="token" value={token} readOnly />
        ) : (
          <TextInput
            id="token"
            label="Reset token"
            name="token"
            required
            helperText="Copy the token from your email link if it did not auto-fill."
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        )}
        <TextInput
          id="newPassword"
          label="New password"
          name="newPassword"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
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
        <TextInput
          id="confirmPassword"
          label="Confirm password"
          name="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        <Button type="submit" disabled={submitting} size="lg">
          {submitting ? 'Saving…' : 'Reset password'}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default ResetPassword;
