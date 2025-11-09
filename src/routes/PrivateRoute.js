// src/routes/PrivateRoute.js

import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { emitAuthTokenChanged } from '../utils/authEvents';

const PrivateRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      const existingToken = localStorage.getItem('token');
      if (existingToken) {
        setIsAuthenticated(true);
        return;
      }

      try {
        const response = await apiClient.post('/auth/refresh');
        const nextToken = response.data?.accessToken;
        if (!nextToken) {
          throw new Error('No access token returned');
        }
        localStorage.setItem('token', nextToken);
        if (response.data.user) {
          localStorage.setItem('user', JSON.stringify(response.data.user));
        }
        emitAuthTokenChanged();
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Error refreshing token:', error.message);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        emitAuthTokenChanged();
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, []);

  if (isAuthenticated === null) {
    return <div>Loading...</div>; // Add spinner or loading indicator if desired
  }

  return isAuthenticated ? children : <Navigate to="/login" />;
};

export default PrivateRoute;
