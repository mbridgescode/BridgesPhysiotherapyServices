import React, { useEffect, useState, useContext } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
} from '@mui/material';
import apiClient from '../../utils/apiClient';
import { UserContext } from '../../context/UserContext';
import DataTable from '../common/DataTable';

const AuditLog = () => {
  const { userData } = useContext(UserContext);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get('/api/audit');
        setLogs(response.data.logs || []);
        setError(null);
      } catch (err) {
        console.error('Failed to load audit logs', err);
        setError('Unable to load audit logs');
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const logColumns = [
    {
      id: 'createdAt',
      label: 'Timestamp',
      type: 'date',
      minWidth: 200,
      valueGetter: (row) => row.createdAt,
      render: (row) => new Date(row.createdAt).toLocaleString(),
    },
    {
      id: 'event',
      label: 'Event',
      minWidth: 160,
    },
    {
      id: 'actor_role',
      label: 'Actor',
      minWidth: 140,
      render: (row) => row.actor_role || 'system',
    },
    {
      id: 'user_role',
      label: 'Target',
      minWidth: 140,
      render: (row) => row.user_role || '-',
    },
    {
      id: 'success',
      label: 'Success',
      type: 'boolean',
      minWidth: 120,
      valueGetter: (row) => row.success,
      render: (row) => (row.success ? 'Yes' : 'No'),
    },
    {
      id: 'metadata',
      label: 'Metadata',
      minWidth: 260,
      sortable: false,
      render: (row) => {
        const entries = Object.entries(row.metadata || {});
        if (!entries.length) {
          return '--';
        }
        return (
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {entries.map(([key, value]) => (
              <li key={key}>
                <Typography variant="caption" color="text.secondary">
                  {key}: {String(value)}
                </Typography>
              </li>
            ))}
          </Box>
        );
      },
    },
  ];

  if (userData?.role !== 'admin') {
    return <Typography>You need administrator access to view the audit log.</Typography>;
  }

  if (loading) {
    return <CircularProgress />;
  }

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" gutterBottom>
          Audit Log
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Tracking authentication events and privileged actions.
        </Typography>
        <DataTable
          columns={logColumns}
          rows={logs}
          getRowId={(row) => row._id}
          maxHeight={520}
          emptyMessage="No audit activity recorded."
        />
      </CardContent>
    </Card>
  );
};

export default AuditLog;
