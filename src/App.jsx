// src/App.js

import React, { lazy, Suspense } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { UserProvider } from './context/UserContext';
import PrivateRoute from './routes/PrivateRoute';
import theme from './theme';

const Login = lazy(() => import('./components/Login'));
const ForgotPassword = lazy(() => import('./components/ForgotPassword'));
const ResetPassword = lazy(() => import('./components/ResetPassword'));
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'));

const AppLoading = () => (
  <div className="app-loading" aria-label="Loading application">
    <div className="app-spinner" />
  </div>
);

const App = () => {
  return (
    <ThemeProvider theme={theme}>
      <UserProvider>
        <Router>
          <Suspense fallback={<AppLoading />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/dashboard/*" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </Router>
      </UserProvider>
    </ThemeProvider>
  );
};

export default App;
