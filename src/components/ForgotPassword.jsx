import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import apiClient from '../utils/apiClient';
import AuthLayout from '../ui/AuthLayout';
import { Button, StatusMessage, TextInput } from '../ui';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');
    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/auth/forgot-password', { email });
      setMessage('If the account exists, a password reset link has been sent to your email.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Unable to send reset link. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Forgot password"
      description="Enter your email and we’ll send a secure link to reset your password."
      icon={<Mail size={18} strokeWidth={1.8} />}
      links={[
        { to: '/login', label: 'Back to sign in' },
        { to: '/reset-password', label: 'I already have a reset link' },
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
          autoFocus
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit" disabled={submitting} size="lg">
          {submitting ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default ForgotPassword;
