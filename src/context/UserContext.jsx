// src/context/UserContext.js

import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import apiClient from '../utils/apiClient';
import {
  getAuthToken,
  subscribeToAuthToken,
} from '../utils/authEvents';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(() => getAuthToken());

  useEffect(() => {
    const unsubscribe = subscribeToAuthToken(() => {
      setToken(getAuthToken());
    });

    const handleStorage = () => {
      setToken(getAuthToken());
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorage);
    }

    return () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorage);
      }
    };
  }, []);

  const fetchUserData = useCallback(async (activeToken) => {
    if (!activeToken) {
      setUserData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.get('/api/users/me');
      setUserData(response.data.user);
      setError(null);
    } catch (err) {
      console.error('Error fetching user data:', err);
      setError('Failed to fetch user data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserData(token);
  }, [token, fetchUserData]);

  return (
    <UserContext.Provider value={{ userData, loading, error }}>
      {children}
    </UserContext.Provider>
  );
};

export default UserProvider;
