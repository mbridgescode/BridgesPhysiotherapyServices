// src/components/Dashboard/DashboardHome.js

import React, { useEffect, useState, useCallback } from 'react';
import { Grid, Button, Card, Typography, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import '../../styles/dashboard.css'; // Ensure this path is correct
import apiClient from '../../utils/apiClient';
import { emitAuthTokenChanged } from '../../utils/authEvents';
import DataTable from '../common/DataTable';

const DashboardHome = () => {
  const [userData, setUserData] = useState(null);
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientDetails, setPatientDetails] = useState(null);
  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Error during logout:', error);
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    emitAuthTokenChanged();
    navigate('/login');
  }, [navigate, emitAuthTokenChanged]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userResponse = await apiClient.get('/api/users/me');
        setUserData(userResponse.data.user);

        const patientsResponse = await apiClient.get('/api/patients');
        setPatients(patientsResponse.data);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []);

  const handlePatientClick = async (patient) => {
    setSelectedPatient(patient);
    try {
      const response = await apiClient.get(`/api/patients/${patient.patient_id}`);
      setPatientDetails(response.data);
    } catch (error) {
      console.error('Error fetching patient details:', error);
    }
  };

  const patientColumns = [
    {
      id: 'first_name',
      label: 'First Name',
      minWidth: 140,
    },
    {
      id: 'surname',
      label: 'Surname',
      minWidth: 140,
    },
    {
      id: 'email',
      label: 'Email',
      minWidth: 220,
    },
    {
      id: 'actions',
      label: 'Actions',
      sortable: false,
      filterable: false,
      minWidth: 120,
      render: (row) => (
        <Button size="small" onClick={() => handlePatientClick(row)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <div className="dashboard-container">
          {!userData ? (
            <CircularProgress />
          ) : (
            <>
              <Typography variant="h1">Welcome, {userData.username}</Typography>
              <Typography variant="body1">Email: {userData.email}</Typography>
              <Typography variant="body1">Administrator: {userData.administrator ? 'Yes' : 'No'}</Typography>
              <Typography variant="body1">Active: {userData.active ? 'Yes' : 'No'}</Typography>
              <Button variant="contained" color="primary" onClick={handleLogout}>Logout</Button>

              {!selectedPatient ? (
                <Card className="patient-list">
                  <Typography variant="h2">Patients</Typography>
                  <DataTable
                    columns={patientColumns}
                    rows={patients}
                    getRowId={(row) => row._id || row.patient_id}
                    maxHeight={420}
                    emptyMessage="No patients available."
                  />
                </Card>
              ) : (
                <Card className="patient-details">
                  <Button variant="outlined" onClick={() => setSelectedPatient(null)}>Back to Patients</Button>
                  <Typography variant="h2">{selectedPatient.first_name} {selectedPatient.surname}</Typography>
                  <Typography variant="body1">Email: {selectedPatient.email}</Typography>
                  <Typography variant="h3">Treatments</Typography>
                  <ul>
                    {patientDetails?.treatments.map((treatment) => (
                      <li key={treatment._id || treatment.appointment_id}>
                        {treatment.treatment_description} - ${treatment.price?.toFixed(2) ?? '0.00'}
                      </li>
                    ))}
                  </ul>
                  <Typography variant="h3">Notes</Typography>
                  <ul>
                    {patientDetails?.notes.map((note) => (
                      <li key={note._id}>
                        {new Date(note.date).toLocaleDateString()} - {note.note}
                      </li>
                    ))}
                  </ul>
                  <Typography variant="h3">Communications</Typography>
                  <ul>
                    {patientDetails?.communications.map((comm) => (
                      <li key={comm._id}>
                        {new Date(comm.date).toLocaleDateString()} - {comm.type}: {comm.content}
                      </li>
                    ))}
                  </ul>
                  <Typography variant="h3">Invoices</Typography>
                  <ul>
                    {patientDetails?.invoices.map((invoice) => (
                      <li key={invoice._id}>
                        {new Date(invoice.date).toLocaleDateString()} - {invoice.treatment_description} - ${invoice.price?.toFixed(2) ?? '0.00'}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      </Grid>
    </Grid>
  );
};

export default DashboardHome;
