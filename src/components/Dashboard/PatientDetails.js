import React, {
  useEffect,
  useState,
  useMemo,
  useContext,
} from 'react';
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Typography,
  Divider,
  TextField,
  Button,
  MenuItem,
  Alert,
  Snackbar,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { makeStyles } from '@mui/styles';
import { Link as RouterLink, useParams } from 'react-router-dom';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import apiClient from '../../utils/apiClient';
import { UserContext } from '../../context/UserContext';
import { AppointmentsContext } from '../../context/AppointmentsContext';
import DataTable from '../common/DataTable';
import useTreatmentNoteTemplates from '../../hooks/useTreatmentNoteTemplates';

const useStyles = makeStyles((theme) => ({
  section: {
    marginBottom: theme.spacing(3),
  },
  tableContainer: {
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[1],
  },
  formRow: {
    marginTop: theme.spacing(2),
  },
  fullWidth: {
    width: '100%',
  },
}));

const currencyDisplay = (value, currency = 'GBP') => `${currency} ${Number(value || 0).toFixed(2)}`;

const PatientDetails = () => {
  const classes = useStyles();
  const { id } = useParams();
  const { userData } = useContext(UserContext);
  const { refreshAppointments } = useContext(AppointmentsContext);
  const canEditNotes = ['admin', 'therapist'].includes(userData?.role);

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [selectedTreatmentId, setSelectedTreatmentId] = useState('');
  const [treatmentNote, setTreatmentNote] = useState('');
  const [savingTreatmentNote, setSavingTreatmentNote] = useState(false);
  const [treatmentNoteSuccess, setTreatmentNoteSuccess] = useState('');
  const [treatmentNoteError, setTreatmentNoteError] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [saveTemplateDialog, setSaveTemplateDialog] = useState({ open: false, name: '' });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveTemplateError, setSaveTemplateError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState('');
  const [exportError, setExportError] = useState('');

  const patient = details?.patient || null;
  const treatments = details?.treatments || [];
  const invoices = details?.invoices || [];
  const notes = details?.notes || [];
  const communications = details?.communications || [];
  const canExportPatient = userData?.role === 'admin';
  const {
    templates: noteTemplates,
    loading: templatesLoading,
    error: templatesFetchError,
    refreshTemplates: refreshNoteTemplates,
  } = useTreatmentNoteTemplates({ enabled: canEditNotes });

  const loadDetails = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/patients/${id}`);
      const payload = response.data || {};
      setDetails({
        patient: payload.patient,
        treatments: payload.treatments || [],
        invoices: payload.invoices || [],
        notes: payload.notes || [],
        communications: payload.communications || [],
      });
      setError(null);
    } catch (err) {
      console.error('Failed to load patient details', err);
      setError('Unable to load patient details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [id]);

  useEffect(() => {
    if (!selectedTreatmentId || treatments.length === 0) {
      setTreatmentNote('');
      return;
    }
    const treatment = treatments.find(
      (appt) => String(appt.appointment_id) === String(selectedTreatmentId),
    );
    if (treatment) {
      setTreatmentNote(treatment.treatment_notes || '');
    }
  }, [selectedTreatmentId, treatments]);

  const handleAddPatientNote = async () => {
    if (!newNote.trim() || !patient) {
      return;
    }
    setSavingNote(true);
    try {
      const response = await apiClient.post('/api/notes', {
        patient_id: patient.patient_id,
        note: newNote,
        date: new Date(),
      });
      const created = response.data?.note;
      if (created) {
        setDetails((prev) => ({
          ...prev,
          notes: [created, ...(prev?.notes || [])],
        }));
        setNewNote('');
      }
    } catch (err) {
      console.error('Failed to add patient note', err);
    } finally {
      setSavingNote(false);
    }
  };

  const handleExportPatient = async () => {
    if (!patient) {
      return;
    }
    setExporting(true);
    try {
      const response = await apiClient.get(`/api/patients/${patient.patient_id}/export`);
      const payload = response.data?.export || response.data;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `patient-${patient.patient_id}-export.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setExportSuccess('Patient export ready to download.');
    } catch (err) {
      console.error('Failed to export patient', err);
      setExportError(err?.response?.data?.message || 'Unable to export patient data.');
    } finally {
      setExporting(false);
    }
  };

  const handleSaveTreatmentNote = async () => {
    if (!selectedTreatmentId || !treatmentNote.trim()) {
      return;
    }
    setTreatmentNoteError('');
    setSavingTreatmentNote(true);
    try {
      const response = await apiClient.put(
        `/api/appointments/${selectedTreatmentId}/notes`,
        { treatment_notes: treatmentNote },
      );
      const updatedAppointment = response.data?.appointment;
      if (updatedAppointment) {
        setDetails((prev) => ({
          ...prev,
          treatments: prev.treatments.map((treatment) =>
            treatment.appointment_id === updatedAppointment.appointment_id
              ? { ...treatment, treatment_notes: updatedAppointment.treatment_notes }
              : treatment,
          ),
        }));
        setTreatmentNoteSuccess('Treatment note saved');
        if (typeof refreshAppointments === 'function') {
          refreshAppointments();
        }
      }
    } catch (err) {
      console.error('Failed to save treatment note', err);
      setTreatmentNoteError('Unable to save treatment note. Please try again.');
    } finally {
      setSavingTreatmentNote(false);
    }
  };

  const handleApplyTemplateToNote = () => {
    if (!selectedTemplate) {
      return;
    }
    setTreatmentNote(selectedTemplate.body);
    setTreatmentNoteError('');
  };

  const openSaveTemplateDialog = () => {
    if (!treatmentNote.trim()) {
      return;
    }
    const fallbackName = selectedTreatment?.treatment_description
      ? `${selectedTreatment.treatment_description} Note`
      : `Template ${new Date().toLocaleDateString('en-GB')}`;
    setSaveTemplateDialog({ open: true, name: fallbackName });
    setSaveTemplateError('');
  };

  const closeSaveTemplateDialog = () => {
    if (savingTemplate) {
      return;
    }
    setSaveTemplateDialog({ open: false, name: '' });
    setSaveTemplateError('');
  };

  const handleSaveTemplateFromNote = async () => {
    if (!treatmentNote.trim()) {
      setSaveTemplateError('Enter a treatment note first');
      return;
    }
    if (!saveTemplateDialog.name.trim()) {
      setSaveTemplateError('Template name is required');
      return;
    }
    setSavingTemplate(true);
    setSaveTemplateError('');
    try {
      await apiClient.post('/api/treatment-note-templates', {
        name: saveTemplateDialog.name.trim(),
        body: treatmentNote.trim(),
      });
      setTreatmentNoteSuccess('Template saved');
      setSaveTemplateDialog({ open: false, name: '' });
      refreshNoteTemplates();
    } catch (err) {
      console.error('Failed to save treatment note template', err);
      setSaveTemplateError(err?.response?.data?.message || 'Unable to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const treatmentOptions = useMemo(
    () => treatments.map((treatment) => ({
      value: treatment.appointment_id,
      label: `${new Date(treatment.date).toLocaleDateString('en-GB')} - ${treatment.treatment_description || 'Untitled'}`,
    })),
    [treatments],
  );

  const invoiceByAppointment = useMemo(() => {
    const lookup = new Map();
    invoices.forEach((invoice) => {
      if (invoice.appointment_id !== undefined && invoice.appointment_id !== null) {
        lookup.set(Number(invoice.appointment_id), invoice);
      }
      if (Array.isArray(invoice.appointment_ids)) {
        invoice.appointment_ids.forEach((id) => {
          if (id !== undefined && id !== null) {
            lookup.set(Number(id), invoice);
          }
        });
      }
    });
    return lookup;
  }, [invoices]);

  const selectedTreatment = useMemo(
    () => treatments.find(
      (treatment) => String(treatment.appointment_id) === String(selectedTreatmentId),
    ),
    [treatments, selectedTreatmentId],
  );

  const selectedTemplate = useMemo(
    () => noteTemplates.find((template) => String(template.id) === String(selectedTemplateId)),
    [noteTemplates, selectedTemplateId],
  );

  const invoiceStatusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          invoices
            .map((invoice) => invoice.status)
            .filter(Boolean),
        ),
      ).map((status) => ({
        value: status,
        label: status.charAt(0).toUpperCase() + status.slice(1),
      })),
    [invoices],
  );

  const communicationStatusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          communications
            .map((comm) => comm.delivery_status)
            .filter(Boolean),
        ),
      ).map((status) => ({
        value: status,
        label: status.charAt(0).toUpperCase() + status.slice(1),
      })),
    [communications],
  );

  if (loading) {
    return <CircularProgress />;
  }

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }

  if (!patient) {
    return <Typography>No patient data found.</Typography>;
  }

  const therapistLabel = patient.primaryTherapist?.username
    ? `${patient.primaryTherapist.username}${
      patient.primaryTherapist.employeeID ? ` (#${patient.primaryTherapist.employeeID})` : ''
    }`
    : patient.primary_therapist_id
      ? `#${patient.primary_therapist_id}`
      : null;

  const noteColumns = [
    {
      id: 'date',
      label: 'Date',
      type: 'date',
      minWidth: 180,
      valueGetter: (row) => row.date,
      render: (row) => new Date(row.date).toLocaleString(),
    },
    {
      id: 'note',
      label: 'Note',
      minWidth: 320,
      render: (row) => row.note || '--',
    },
  ];

  const treatmentColumns = [
    {
      id: 'date',
      label: 'Date',
      type: 'date',
      minWidth: 150,
      valueGetter: (row) => row.date,
      render: (row) => new Date(row.date).toLocaleDateString('en-GB'),
    },
    {
      id: 'treatment_description',
      label: 'Description',
      minWidth: 220,
      render: (row) => row.treatment_description || 'Not provided',
    },
    {
      id: 'treatment_notes',
      label: 'Treatment Note',
      minWidth: 260,
      sortable: false,
      render: (row) => {
        if (!row.treatment_notes) {
          return (
            <Typography variant="body2" color="text.secondary">
              No note
            </Typography>
          );
        }
        const preview = row.treatment_notes.length > 160
          ? `${row.treatment_notes.slice(0, 160)}...`
          : row.treatment_notes;
        return (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
            {preview}
          </Typography>
        );
      },
    },
    {
      id: 'price',
      label: 'Price',
      type: 'number',
      minWidth: 120,
      render: (row) => {
        const currency = invoiceByAppointment.get(row.appointment_id)?.currency || 'GBP';
        return currencyDisplay(row.price, currency);
      },
    },
    {
      id: 'status',
      label: 'Status',
      minWidth: 140,
      valueGetter: (row) => row.paymentStatus || row.status,
      render: (row) => row.paymentStatus || row.status || 'Pending',
    },
    {
      id: 'invoice',
      label: 'Invoice',
      minWidth: 210,
      sortable: false,
      render: (row) => {
        const invoice = invoiceByAppointment.get(row.appointment_id);
        if (!invoice) {
          return 'No invoice';
        }
        const currency = invoice.currency || 'GBP';
        return `${invoice.invoice_number} (${currencyDisplay(invoice.balance_due, currency)} due)`;
      },
    },
  ];

  const detailedInvoiceColumns = [
    {
      id: 'invoice_number',
      label: 'Invoice #',
      minWidth: 140,
    },
    {
      id: 'issue_date',
      label: 'Issued',
      type: 'date',
      minWidth: 150,
      valueGetter: (row) => row.issue_date,
      render: (row) => new Date(row.issue_date).toLocaleDateString('en-GB'),
    },
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      options: invoiceStatusOptions,
      minWidth: 130,
    },
    {
      id: 'total_due',
      label: 'Total',
      type: 'number',
      minWidth: 120,
      render: (row) => currencyDisplay(row.total_due, row.currency),
    },
    {
      id: 'total_paid',
      label: 'Paid',
      type: 'number',
      minWidth: 120,
      render: (row) => currencyDisplay(row.total_paid, row.currency),
    },
    {
      id: 'balance_due',
      label: 'Balance',
      type: 'number',
      minWidth: 120,
      render: (row) => currencyDisplay(row.balance_due, row.currency),
    },
  ];

  const communicationColumns = [
    {
      id: 'date',
      label: 'Date',
      type: 'date',
      minWidth: 180,
      valueGetter: (row) => row.date,
      render: (row) => new Date(row.date).toLocaleString(),
    },
    {
      id: 'type',
      label: 'Type',
      minWidth: 140,
    },
    {
      id: 'content',
      label: 'Content',
      minWidth: 260,
      render: (row) => row.content || '--',
    },
    {
      id: 'delivery_status',
      label: 'Status',
      type: 'select',
      options: communicationStatusOptions,
      minWidth: 140,
    },
  ];

  return (
    <Box>
      <Card className={classes.section}>
        <CardContent>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
            gap={2}
            mb={2}
          >
            <Typography variant="h5">
              {patient.first_name} {patient.surname}
            </Typography>
            {canExportPatient && (
              <Button
                variant="outlined"
                onClick={handleExportPatient}
                disabled={exporting}
              >
                {exporting ? 'Preparing export...' : 'Export JSON'}
              </Button>
            )}
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Typography variant="body2" color="textSecondary">
                Contact
              </Typography>
              <Typography>{patient.email}</Typography>
              <Typography>{patient.phone}</Typography>
            </Grid>
            {(patient.primary_contact_name
              || patient.primary_contact_email
              || patient.primary_contact_phone) && (
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="textSecondary">
                  Primary Contact
                </Typography>
                {patient.primary_contact_name && <Typography>{patient.primary_contact_name}</Typography>}
                {patient.primary_contact_email && <Typography>{patient.primary_contact_email}</Typography>}
                {patient.primary_contact_phone && <Typography>{patient.primary_contact_phone}</Typography>}
              </Grid>
            )}
            <Grid item xs={12} md={4}>
              <Typography variant="body2" color="textSecondary">
                Status
              </Typography>
              <Typography>{patient.status}</Typography>
              {therapistLabel && (
                <Typography>Primary Therapist: {therapistLabel}</Typography>
              )}
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="body2" color="textSecondary">
                Created
              </Typography>
              <Typography>{new Date(patient.createdAt).toLocaleDateString('en-GB')}</Typography>
            </Grid>
          </Grid>
          <Snackbar
            open={Boolean(exportSuccess)}
            autoHideDuration={3500}
            onClose={() => setExportSuccess('')}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          >
            <Alert severity="success" onClose={() => setExportSuccess('')} sx={{ width: '100%' }}>
              {exportSuccess}
            </Alert>
          </Snackbar>
          <Snackbar
            open={Boolean(exportError)}
            autoHideDuration={5000}
            onClose={() => setExportError('')}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          >
            <Alert severity="error" onClose={() => setExportError('')} sx={{ width: '100%' }}>
              {exportError}
            </Alert>
          </Snackbar>
        </CardContent>
      </Card>

      <Card className={classes.section}>
        <CardContent>
          <Typography variant="h6">Patient Notes</Typography>
          <Divider sx={{ my: 2 }} />
          {canEditNotes && (
            <>
              <TextField
                label="Add a note"
                multiline
                minRows={2}
                value={newNote}
                onChange={(event) => setNewNote(event.target.value)}
                className={classes.fullWidth}
              />
              <Box mt={2}>
                <Button
                  variant="contained"
                  onClick={handleAddPatientNote}
                  disabled={savingNote || !newNote.trim()}
                >
                  {savingNote ? 'Saving...' : 'Save Note'}
                </Button>
              </Box>
            </>
          )}
          <Box className={[classes.tableContainer, classes.formRow].join(' ')}>
            <DataTable
              columns={noteColumns}
              rows={notes}
              getRowId={(row, index) => row._id || index}
              maxHeight={320}
              emptyMessage="No notes yet."
              containerSx={{ border: 'none', backgroundColor: 'transparent' }}
            />
          </Box>
        </CardContent>
      </Card>

      <Card className={classes.section}>
        <CardContent>
          <Typography variant="h6">Treatment Notes</Typography>
          <Divider sx={{ my: 2 }} />
          {canEditNotes ? (
            <>
              <TextField
                select
                label="Select an appointment"
                value={selectedTreatmentId}
                onChange={(event) => setSelectedTreatmentId(event.target.value)}
                className={classes.fullWidth}
              >
                <MenuItem value="">-- Choose a treatment --</MenuItem>
                {treatmentOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              {canEditNotes && templatesFetchError && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {templatesFetchError}
                </Alert>
              )}
              {canEditNotes && (
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 1,
                    mt: 2,
                  }}
                >
                  <TextField
                    select
                    label="Template"
                    value={selectedTemplateId}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    sx={{ minWidth: 220 }}
                    disabled={templatesLoading || noteTemplates.length === 0}
                    helperText={templatesLoading ? 'Loading templates...' : 'Select to prefill a note'}
                  >
                    <MenuItem value="">-- No template --</MenuItem>
                    {noteTemplates.map((template) => (
                      <MenuItem key={template.id} value={template.id}>
                        {template.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Tooltip title="Apply template" placement="top">
                    <span>
                      <IconButton
                        color="primary"
                        onClick={handleApplyTemplateToNote}
                        disabled={!selectedTemplate}
                      >
                        <AutoAwesomeIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Save note as template" placement="top">
                    <span>
                      <IconButton
                        color="primary"
                        onClick={openSaveTemplateDialog}
                        disabled={!treatmentNote.trim()}
                      >
                        <SaveAltIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Manage templates" placement="top">
                    <IconButton
                      color="primary"
                      component={RouterLink}
                      to="/dashboard/settings#treatment-note-templates"
                    >
                      <LibraryBooksIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
              <TextField
                className={[classes.fullWidth, classes.formRow].join(' ')}
                label="Treatment Note"
                multiline
                minRows={3}
                value={treatmentNote}
                onChange={(event) => setTreatmentNote(event.target.value)}
              />
              <Button
                variant="contained"
                onClick={handleSaveTreatmentNote}
                disabled={!selectedTreatmentId || !treatmentNote.trim() || savingTreatmentNote}
              >
                {savingTreatmentNote ? 'Saving...' : 'Save Treatment Note'}
              </Button>
              <Snackbar
                open={Boolean(treatmentNoteSuccess)}
                autoHideDuration={3500}
                onClose={() => setTreatmentNoteSuccess('')}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
              >
                <Alert severity="success" onClose={() => setTreatmentNoteSuccess('')} sx={{ width: '100%' }}>
                  {treatmentNoteSuccess}
                </Alert>
              </Snackbar>
              <Snackbar
                open={Boolean(treatmentNoteError)}
                autoHideDuration={5000}
                onClose={() => setTreatmentNoteError('')}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
              >
                <Alert severity="error" onClose={() => setTreatmentNoteError('')} sx={{ width: '100%' }}>
                  {treatmentNoteError}
                </Alert>
              </Snackbar>
            </>
          ) : (
            <Typography variant="body2" color="textSecondary">
              Only therapists and administrators can edit treatment notes.
            </Typography>
          )}
          <Dialog open={saveTemplateDialog.open} onClose={closeSaveTemplateDialog} maxWidth="xs" fullWidth>
            <DialogTitle>Save Template</DialogTitle>
            <DialogContent dividers>
              <TextField
                label="Template name"
                fullWidth
                value={saveTemplateDialog.name}
                onChange={(event) => setSaveTemplateDialog((prev) => ({ ...prev, name: event.target.value }))}
                autoFocus
              />
              {saveTemplateError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {saveTemplateError}
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={closeSaveTemplateDialog} disabled={savingTemplate} sx={{ color: '#fff' }}>
                Cancel
              </Button>
              <Button onClick={handleSaveTemplateFromNote} disabled={savingTemplate} variant="contained">
                {savingTemplate ? 'Saving...' : 'Save Template'}
              </Button>
            </DialogActions>
          </Dialog>
        </CardContent>
      </Card>

      <Card className={classes.section}>
        <CardContent>
          <Typography variant="h6">Treatment History</Typography>
          <Divider sx={{ my: 2 }} />
          <Box className={classes.tableContainer}>
            <DataTable
              columns={treatmentColumns}
              rows={treatments}
              getRowId={(row) => row.appointment_id}
              maxHeight={360}
              emptyMessage="No treatments recorded."
              containerSx={{ border: 'none', backgroundColor: 'transparent' }}
            />
          </Box>
        </CardContent>
      </Card>

      <Card className={classes.section}>
        <CardContent>
          <Typography variant="h6">Invoices</Typography>
          <Divider sx={{ my: 2 }} />
          <Box className={classes.tableContainer}>
            <DataTable
              columns={detailedInvoiceColumns}
              rows={invoices}
              getRowId={(row) => row._id}
              maxHeight={360}
              emptyMessage="No invoices for this patient."
              containerSx={{ border: 'none', backgroundColor: 'transparent' }}
            />
          </Box>
        </CardContent>
      </Card>

      <Card className={classes.section}>
        <CardContent>
          <Typography variant="h6">Communications</Typography>
          <Divider sx={{ my: 2 }} />
          <Box className={classes.tableContainer}>
            <DataTable
              columns={communicationColumns}
              rows={communications}
              getRowId={(row) => row._id}
              maxHeight={360}
              emptyMessage="No communications recorded."
              containerSx={{ border: 'none', backgroundColor: 'transparent' }}
            />
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default PatientDetails;
