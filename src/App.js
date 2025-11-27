// src/App.js

import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { UserProvider } from './context/UserContext';
import { AppointmentsProvider } from './context/AppointmentsContext';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import Dashboard from './components/Dashboard/Dashboard';
import PrivateRoute from './routes/PrivateRoute';
import './styles/global.css';
import theme from './theme';

const App = () => {
  return (
    <ThemeProvider theme={theme}>
      <UserProvider>
        <AppointmentsProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/dashboard/*" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/" element={<Navigate to="/login" replace />} />
            </Routes>
          </Router>
        </AppointmentsProvider>
      </UserProvider>
    </ThemeProvider>
  );
};

export default App;
