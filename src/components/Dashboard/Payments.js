// src/components/Dashboard/Payments.js

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Divider,
  TextField,
  MenuItem,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Alert,
  Snackbar,
} from '@mui/material';
import { makeStyles } from '@mui/styles';
import apiClient from '../../utils/apiClient';
import DataTable from '../common/DataTable';

const useStyles = makeStyles((theme) => ({
  card: {
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[3],
    backgroundColor: theme.palette.background.paper,
    color: theme.palette.text.primary,
    width: '100%',
  },
  cardContent: {
    padding: theme.spacing(3),
  },
}));

const PAYMENT_METHODS = [
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'other', label: 'Other' },
];

const formatCurrency = (amount, currency = 'GBP') => {
  const parsed = Number(amount);
  if (Number.isNaN(parsed)) {
    return `${currency} 0.00`;
  }
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(parsed);
};

const defaultFormState = () => ({
  invoice_number: '',
  invoice_id: '',
  patient_id: '',
  appointment_id: '',
  amount_paid: '',
  method: 'card',
  payment_date: new Date().toISOString().split('T')[0],
  reference: '',
  notes: '',
});

const Payments = ({ userData }) => {
  const classes = useStyles();
  const canManagePayments = ['admin', 'receptionist'].includes(userData?.role);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formState, setFormState] = useState(defaultFormState);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [toast, setToast] = useState({ message: '', severity: 'success' });

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/payments');
      setPayments(response.data?.payments || []);
      setError(null);
    } catch (err) {
      console.error('Failed to load payments', err);
      setError('Unable to load payments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManagePayments) {
      setLoading(false);
      return;
    }
    fetchPayments();
  }, [fetchPayments, canManagePayments]);

  const filteredPayments = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return payments
      .filter((payment) => {
        if (!methodFilter) {
          return true;
        }
        return payment.method === methodFilter;
      })
      .filter((payment) => {
        if (!query) {
          return true;
        }
        const haystack = [
          payment.invoice_number,
          payment.invoice_id,
          payment.patient_id,
          payment.appointment_id,
          payment.method,
          payment.reference,
          payment.notes,
          payment.recordedBy?.username,
        ]
          .map((value) => (value === null || value === undefined ? '' : String(value).toLowerCase()));
        return haystack.some((entry) => entry.includes(query));
      });
  }, [payments, searchTerm, methodFilter]);

  const resetForm = useCallback(() => {
    setFormState(defaultFormState());
    setFormErrors({});
    setSubmitError('');
  }, []);

  const handleOpenDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    if (submitting) {
      return;
    }
    setDialogOpen(false);
    setSubmitError('');
  };

  const validateForm = () => {
    const errors = {};
    if (!formState.invoice_number.trim() && !formState.invoice_id.trim()) {
      errors.invoice_number = 'Invoice number or ID is required';
    }
    if (!formState.amount_paid || Number(formState.amount_paid) <= 0) {
      errors.amount_paid = 'Amount must be greater than zero';
    }
    if (!formState.method) {
      errors.method = 'Method is required';
    }
    if (!formState.payment_date) {
      errors.payment_date = 'Payment date is required';
    }
    return errors;
  };

  const handleCreatePayment = async () => {
    const errors = validateForm();
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        invoice_number: formState.invoice_number.trim() || undefined,
        invoice_id: formState.invoice_id ? Number(formState.invoice_id) : undefined,
        patient_id: formState.patient_id ? Number(formState.patient_id) : undefined,
        appointment_id: formState.appointment_id ? Number(formState.appointment_id) : undefined,
        amount_paid: Number(formState.amount_paid),
        method: formState.method,
        payment_date: formState.payment_date,
        reference: formState.reference.trim() || undefined,
        notes: formState.notes.trim() || undefined,
      };

      const response = await apiClient.post('/api/payments', payload);
      const createdPayment = response.data?.payment;
      if (createdPayment) {
        setPayments((prev) => [createdPayment, ...prev]);
      }
      setToast({ message: 'Payment recorded successfully', severity: 'success' });
      setDialogOpen(false);
      resetForm();
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to record payment';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const paymentColumns = [
    {
      id: 'payment_date',
      label: 'Date',
      type: 'date',
      minWidth: 160,
      valueGetter: (row) => row.payment_date,
      render: (row) => {
        const value = row.payment_date ? new Date(row.payment_date) : null;
        if (!value || Number.isNaN(value.getTime())) {
          return '--';
        }
        return (
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {value.toLocaleDateString('en-GB')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Typography>
          </Box>
        );
      },
    },
    {
      id: 'invoice_number',
      label: 'Invoice',
      minWidth: 160,
      render: (row) => (
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {row.invoice_number || 'N/A'}
          </Typography>
          {row.invoice_id && (
            <Typography variant="caption" color="text.secondary">
              #{row.invoice_id}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'patient_id',
      label: 'Patient',
      minWidth: 140,
      render: (row) => (row.patient_id ? `#${row.patient_id}` : '--'),
    },
    {
      id: 'amount_paid',
      label: 'Amount',
      minWidth: 140,
      type: 'number',
      render: (row) => formatCurrency(row.amount_paid, row.currency),
    },
    {
      id: 'method',
      label: 'Method',
      minWidth: 140,
      type: 'select',
      options: PAYMENT_METHODS,
      render: (row) => {
        const method = PAYMENT_METHODS.find((option) => option.value === row.method);
        return method ? method.label : row.method || '--';
      },
    },
    {
      id: 'reference',
      label: 'Reference',
      minWidth: 180,
      render: (row) => row.reference || '--',
    },
    {
      id: 'notes',
      label: 'Notes',
      minWidth: 220,
      sortable: false,
      render: (row) => row.notes || '--',
    },
  ];

  const renderMobileCard = (row) => {
    const dateValue = row.payment_date ? new Date(row.payment_date) : null;
    return (
      <Card variant="outlined" sx={{ backgroundColor: 'rgba(15,23,42,0.6)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {formatCurrency(row.amount_paid, row.currency)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {dateValue
              ? dateValue.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
              : 'Date TBC'}
          </Typography>
          <Typography variant="body2">
            Invoice: {row.invoice_number || 'N/A'}
          </Typography>
          {row.patient_id && (
            <Typography variant="body2" color="text.secondary">
              Patient #{row.patient_id}
            </Typography>
          )}
          {row.reference && (
            <Typography variant="body2">Ref: {row.reference}</Typography>
          )}
          {row.notes && (
            <Typography variant="caption" color="text.secondary">
              {row.notes}
            </Typography>
          )}
        </CardContent>
      </Card>
    );
  };

  if (!canManagePayments) {
    return (
      <Card className={classes.card}>
        <CardContent>
          <Typography variant="h6">Payments</Typography>
          <Divider sx={{ my: 2 }} />
          <Alert severity="info">
            You do not have permission to manage payments.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return <CircularProgress />;
  }

  if (error) {
    return <Typography variant="h6">{error}</Typography>;
  }

  return (
    <Box
      sx={{
        flex: 1,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 'calc(100vh - 160px)',
      }}
    >
      <Card className={classes.card} sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <CardContent
          className={classes.cardContent}
          sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
            <Typography variant="h5" gutterBottom sx={{ mb: 0 }}>
              Payments
            </Typography>
            <Box display="flex" gap={1} flexWrap="wrap">
              <TextField
                select
                size="small"
                label="Method"
                value={methodFilter}
                onChange={(event) => setMethodFilter(event.target.value)}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="">All methods</MenuItem>
                {PAYMENT_METHODS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              <Button variant="contained" onClick={handleOpenDialog}>
                Record Payment
              </Button>
            </Box>
          </Box>
          <Divider />
          <TextField
            label="Search"
            variant="outlined"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by invoice, patient, reference or method"
          />
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <DataTable
              columns={paymentColumns}
              rows={filteredPayments}
              getRowId={(row) => row.payment_id}
              maxHeight="100%"
              containerSx={{ height: '100%' }}
              emptyMessage="No payments recorded yet."
              defaultOrderBy="payment_date"
              defaultOrder="desc"
              renderMobileCard={renderMobileCard}
            />
          </Box>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Record Payment</DialogTitle>
        <DialogContent dividers>
          {submitError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {submitError}
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Invoice Number"
                fullWidth
                value={formState.invoice_number}
                onChange={(event) => {
                  setFormState((prev) => ({ ...prev, invoice_number: event.target.value }));
                  setFormErrors((prev) => ({ ...prev, invoice_number: undefined }));
                }}
                error={Boolean(formErrors.invoice_number)}
                helperText={formErrors.invoice_number || 'Required if invoice ID is empty'}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Invoice ID"
                fullWidth
                value={formState.invoice_id}
                onChange={(event) => setFormState((prev) => ({ ...prev, invoice_id: event.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Patient ID"
                fullWidth
                value={formState.patient_id}
                onChange={(event) => setFormState((prev) => ({ ...prev, patient_id: event.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Appointment ID"
                fullWidth
                value={formState.appointment_id}
                onChange={(event) => setFormState((prev) => ({ ...prev, appointment_id: event.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Amount Paid"
                type="number"
                fullWidth
                value={formState.amount_paid}
                onChange={(event) => {
                  setFormState((prev) => ({ ...prev, amount_paid: event.target.value }));
                  setFormErrors((prev) => ({ ...prev, amount_paid: undefined }));
                }}
                error={Boolean(formErrors.amount_paid)}
                helperText={formErrors.amount_paid}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Payment Method"
                select
                fullWidth
                value={formState.method}
                onChange={(event) => {
                  setFormState((prev) => ({ ...prev, method: event.target.value }));
                  setFormErrors((prev) => ({ ...prev, method: undefined }));
                }}
                error={Boolean(formErrors.method)}
                helperText={formErrors.method}
              >
                {PAYMENT_METHODS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Payment Date"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={formState.payment_date}
                onChange={(event) => {
                  setFormState((prev) => ({ ...prev, payment_date: event.target.value }));
                  setFormErrors((prev) => ({ ...prev, payment_date: undefined }));
                }}
                error={Boolean(formErrors.payment_date)}
                helperText={formErrors.payment_date}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Reference"
                fullWidth
                value={formState.reference}
                onChange={(event) => setFormState((prev) => ({ ...prev, reference: event.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                fullWidth
                multiline
                minRows={2}
                value={formState.notes}
                onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={submitting} sx={{ color: '#fff' }}>
            Cancel
          </Button>
          <Button onClick={handleCreatePayment} variant="contained" disabled={submitting}>
            {submitting ? 'Saving...' : 'Record Payment'}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={Boolean(toast.message)}
        autoHideDuration={4000}
        onClose={() => setToast((prev) => ({ ...prev, message: '' }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          onClose={() => setToast((prev) => ({ ...prev, message: '' }))}
          sx={{ width: '100%' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Payments;

