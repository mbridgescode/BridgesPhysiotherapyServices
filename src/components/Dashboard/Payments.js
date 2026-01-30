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
  DialogContentText,
  Grid,
  Alert,
  Snackbar,
  IconButton,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import Tooltip from '@mui/material/Tooltip';
import Autocomplete from '@mui/material/Autocomplete';
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
  amount_paid: '',
  method: 'card',
  payment_date: new Date().toISOString().split('T')[0],
  reference: '',
  notes: '',
});

const buildInvoiceLabel = (invoice) => {
  if (!invoice) {
    return '';
  }
  const patientLabel = invoice.patient_name
    || (invoice.patient_id ? `Patient #${invoice.patient_id}` : '');
  const balance = invoice.balance_due ?? invoice.totals?.balance ?? invoice.total_due;
  const parts = [
    invoice.invoice_number,
    patientLabel,
    balance !== undefined ? `Balance ${formatCurrency(balance, invoice.currency || 'GBP')}` : null,
  ].filter(Boolean);
  return parts.join(' • ');
};

const resolveInvoiceBalance = (invoice) => {
  if (!invoice) {
    return 0;
  }
  const balance = invoice.balance_due ?? invoice.totals?.balance ?? invoice.total_due ?? 0;
  const parsed = Number(balance);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const resolveInvoiceForPayment = (payment, invoiceOptions) => {
  if (!payment) {
    return null;
  }
  const match = invoiceOptions.find(
    (invoice) => invoice.invoice_id === payment.invoice_id
      || invoice.invoice_number === payment.invoice_number,
  );
  if (match) {
    return match;
  }
  const summary = payment.invoice_summary || {};
  return {
    invoice_id: payment.invoice_id,
    invoice_number: payment.invoice_number,
    patient_id: payment.patient_id,
    patient_name: summary.patient_name,
    balance_due: summary.balance_due,
    total_due: summary.total_due,
    currency: summary.currency || 'GBP',
    status: summary.status,
  };
};

const Payments = ({ userData }) => {
  const classes = useStyles();
  const canManagePayments = ['admin', 'receptionist'].includes(userData?.role);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('create');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [formState, setFormState] = useState(defaultFormState);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [toast, setToast] = useState({ message: '', severity: 'success' });
  const [invoiceOptions, setInvoiceOptions] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoiceError, setInvoiceError] = useState('');
  const [editingPayment, setEditingPayment] = useState(null);
  const [sendingReceiptFor, setSendingReceiptFor] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    payment: null,
    submitting: false,
    error: '',
  });

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

  const fetchInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const response = await apiClient.get('/api/invoices', { params: { include: 'payments' } });
      const invoices = response.data?.invoices || [];
      const outstanding = invoices.filter((invoice) => resolveInvoiceBalance(invoice) > 0);
      setInvoiceOptions(outstanding);
      setInvoiceError('');
    } catch (err) {
      console.error('Failed to load invoices', err);
      setInvoiceError('Unable to load invoice list');
      setInvoiceOptions([]);
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManagePayments) {
      setLoading(false);
      return;
    }
    fetchPayments();
    fetchInvoices();
  }, [canManagePayments, fetchPayments, fetchInvoices]);

  useEffect(() => {
    if (
      dialogOpen
      && dialogMode === 'create'
      && selectedInvoice
      && !formState.amount_paid
    ) {
      const outstanding = selectedInvoice.balance_due
        ?? selectedInvoice.totals?.balance
        ?? selectedInvoice.total_due;
      if (outstanding) {
        setFormState((prev) => ({ ...prev, amount_paid: outstanding.toString() }));
      }
    }
  }, [dialogOpen, dialogMode, selectedInvoice, formState.amount_paid]);

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
          String(payment.invoice_id || ''),
          payment.invoice_summary?.patient_name,
          payment.method,
          payment.reference,
          payment.notes,
        ]
          .filter(Boolean)
          .map((value) => value.toString().toLowerCase());
        return haystack.some((entry) => entry.includes(query));
      });
  }, [payments, searchTerm, methodFilter]);

  const invoiceAutocompleteOptions = useMemo(() => {
    if (dialogMode === 'edit' && selectedInvoice) {
      const exists = invoiceOptions.some(
        (invoice) => invoice.invoice_id === selectedInvoice.invoice_id
          || invoice.invoice_number === selectedInvoice.invoice_number,
      );
      if (!exists) {
        return [selectedInvoice, ...invoiceOptions];
      }
    }
    return invoiceOptions;
  }, [dialogMode, selectedInvoice, invoiceOptions]);

  const resetForm = useCallback(() => {
    setFormState(defaultFormState());
    setFormErrors({});
    setSubmitError('');
    setSelectedInvoice(null);
    setEditingPayment(null);
  }, []);

  const handleOpenDialog = () => {
    setDialogMode('create');
    resetForm();
    setDialogOpen(true);
  };

  const handleEditPayment = (payment) => {
    setDialogMode('edit');
    setEditingPayment(payment);
    setDialogOpen(true);
    setFormState({
      amount_paid: payment.amount_paid?.toString() || '',
      method: payment.method || 'card',
      payment_date: payment.payment_date
        ? new Date(payment.payment_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      reference: payment.reference || '',
      notes: payment.notes || '',
    });
    setSelectedInvoice(resolveInvoiceForPayment(payment, invoiceOptions));
    setFormErrors({});
    setSubmitError('');
  };

  const handleCloseDialog = () => {
    if (submitting) {
      return;
    }
    setDialogOpen(false);
  };

  const validateForm = () => {
    const errors = {};
    if (!selectedInvoice) {
      errors.invoice = 'Please select an invoice';
    }
    if (!formState.amount_paid || Number(formState.amount_paid) <= 0) {
      errors.amount_paid = 'Amount must be greater than zero';
    }
    if (!formState.payment_date) {
      errors.payment_date = 'Payment date is required';
    }
    if (!formState.method) {
      errors.method = 'Method is required';
    }
    return errors;
  };

  const handleSubmitPayment = async () => {
    const errors = validateForm();
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        invoice_number: selectedInvoice?.invoice_number,
        invoice_id: selectedInvoice?.invoice_id,
        amount_paid: Number(formState.amount_paid),
        method: formState.method,
        payment_date: formState.payment_date,
        reference: formState.reference.trim() || undefined,
        notes: formState.notes.trim() || undefined,
      };

      if (dialogMode === 'edit' && editingPayment) {
        await apiClient.put(`/api/payments/${editingPayment.payment_id}`, payload);
        setToast({ message: 'Payment updated', severity: 'success' });
      } else {
        await apiClient.post('/api/payments', payload);
        setToast({ message: 'Payment recorded', severity: 'success' });
      }

      setDialogOpen(false);
      await Promise.all([fetchPayments(), fetchInvoices()]);
      resetForm();
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to save payment';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDeleteDialog = (payment) => {
    setDeleteDialog({
      open: true,
      payment,
      submitting: false,
      error: '',
    });
  };

  const handleCloseDeleteDialog = () => {
    if (deleteDialog.submitting) {
      return;
    }
    setDeleteDialog({ open: false, payment: null, submitting: false, error: '' });
  };

  const handleDeletePayment = async () => {
    if (!deleteDialog.payment) {
      return;
    }
    setDeleteDialog((prev) => ({ ...prev, submitting: true, error: '' }));
    try {
      await apiClient.delete(`/api/payments/${deleteDialog.payment.payment_id}`);
      await Promise.all([fetchPayments(), fetchInvoices()]);
      setToast({ message: 'Payment deleted', severity: 'success' });
      setDeleteDialog({ open: false, payment: null, submitting: false, error: '' });
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to delete payment';
      setDeleteDialog((prev) => ({ ...prev, submitting: false, error: message }));
    }
  };

  const handleSendReceipt = async (payment) => {
    if (!payment?.payment_id) {
      return;
    }
    setSendingReceiptFor(payment.payment_id);
    try {
      const response = await apiClient.post(`/api/receipts/by-payment/${payment.payment_id}/send`);
      if (response.data?.success) {
        setToast({ message: response.data?.message || 'Receipt emailed successfully', severity: 'success' });
      } else {
        setToast({ message: response.data?.message || 'Unable to send receipt email', severity: 'error' });
      }
      await fetchPayments();
    } catch (err) {
      console.error('Failed to send receipt', err);
      setToast({ message: err?.response?.data?.message || 'Failed to send receipt', severity: 'error' });
    } finally {
      setSendingReceiptFor(null);
    }
  };

  const downloadReceiptPdf = async (payment) => {
    if (!payment?.receipt_summary?.receipt_number) {
      setToast({ message: 'Receipt not available yet', severity: 'error' });
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }

    const receiptNumber = payment.receipt_summary.receipt_number;
    const endpoint = payment.receipt_summary.pdf_url || `/api/receipts/${receiptNumber}/pdf`;

    try {
      const response = await apiClient.get(endpoint, { responseType: 'arraybuffer' });
      const byteView = new Uint8Array(response.data || []);
      const isPdfSignature = byteView.length >= 4
        && byteView[0] === 0x25
        && byteView[1] === 0x50
        && byteView[2] === 0x44
        && byteView[3] === 0x46;
      if (!isPdfSignature) {
        let decoded;
        try {
          decoded = new TextDecoder('utf-8').decode(byteView);
        } catch (error) {
          decoded = '';
        }
        let errorMessage = 'Unable to download receipt PDF';
        if (decoded) {
          try {
            const parsed = JSON.parse(decoded);
            errorMessage = parsed?.message || parsed?.error || errorMessage;
          } catch (parseErr) {
            errorMessage = decoded;
          }
        }
        console.error('Receipt PDF download returned non-PDF payload', { errorMessage, endpoint });
        setToast({ message: errorMessage, severity: 'error' });
        return;
      }
      const contentType = response.headers?.['content-type'] || 'application/pdf';
      const disposition = response.headers?.['content-disposition'] || '';
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const asciiMatch = disposition.match(/filename="?([^\";]+)\"?/i);
      const decodeFileName = (value) => {
        try {
          return decodeURIComponent(value);
        } catch (error) {
          return value;
        }
      };
      const filename = (utf8Match && decodeFileName(utf8Match[1]))
        || (asciiMatch && asciiMatch[1])
        || `${receiptNumber}.pdf`;
      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 500);
    } catch (err) {
      console.error('Failed to download receipt PDF', err);
      setToast({ message: 'Failed to download receipt PDF', severity: 'error' });
    }
  };

  const renderRowActions = (row) => (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
      <Tooltip title="View receipt">
        <span>
          <IconButton
            size="small"
            onClick={() => downloadReceiptPdf(row)}
            disabled={!row.receipt_summary?.receipt_number}
          >
            <PictureAsPdfIcon fontSize="inherit" />
          </IconButton>
        </span>
      </Tooltip>
      <Button
        size="small"
        variant="outlined"
        startIcon={sendingReceiptFor === row.payment_id ? <CircularProgress size={14} /> : <SendIcon />}
        onClick={() => handleSendReceipt(row)}
        disabled={sendingReceiptFor === row.payment_id}
        sx={{ minWidth: 0 }}
      >
        {sendingReceiptFor === row.payment_id ? 'Sending...' : 'Send Receipt'}
      </Button>
      <Button size="small" variant="outlined" onClick={() => handleEditPayment(row)} sx={{ minWidth: 0 }}>
        Edit
      </Button>
      <Button
        size="small"
        variant="outlined"
        color="error"
        onClick={() => handleOpenDeleteDialog(row)}
        sx={{ minWidth: 0 }}
      >
        Delete
      </Button>
    </Box>
  );

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
      id: 'invoice',
      label: 'Invoice',
      minWidth: 220,
      render: (row) => {
        const summary = row.invoice_summary || {};
        return (
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {row.invoice_number || 'N/A'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {summary.patient_name || (row.patient_id ? `Patient #${row.patient_id}` : '--')}
            </Typography>
            {summary.balance_due !== undefined && (
              <Typography variant="caption" color="text.secondary">
                Balance: {formatCurrency(summary.balance_due, summary.currency)}
              </Typography>
            )}
          </Box>
        );
      },
    },
    {
      id: 'amount_paid',
      label: 'Amount',
      minWidth: 140,
      type: 'number',
      render: (row) => {
        const currency = row.invoice_summary?.currency || row.currency;
        return formatCurrency(row.amount_paid, currency);
      },
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
    {
      id: 'actions',
      label: 'Actions',
      minWidth: 180,
      sortable: false,
      filterable: false,
      align: 'right',
      render: renderRowActions,
    },
  ];

  const renderMobileCard = (row) => {
    const dateValue = row.payment_date ? new Date(row.payment_date) : null;
    const summary = row.invoice_summary || {};
    return (
      <Card variant="outlined" sx={{ backgroundColor: 'rgba(15,23,42,0.6)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {formatCurrency(row.amount_paid, summary.currency || row.currency)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {dateValue
              ? dateValue.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
              : 'Date TBC'}
          </Typography>
          <Typography variant="body2">
            Invoice {row.invoice_number || 'N/A'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {summary.patient_name || (row.patient_id ? `Patient #${row.patient_id}` : '--')}
          </Typography>
          {row.reference && (
            <Typography variant="body2">Ref: {row.reference}</Typography>
          )}
          {row.notes && (
            <Typography variant="caption" color="text.secondary">
              {row.notes}
            </Typography>
          )}
          {renderRowActions(row)}
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

  const selectedInvoiceBalance = selectedInvoice ? resolveInvoiceBalance(selectedInvoice) : null;

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
            <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
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
        <DialogTitle>{dialogMode === 'edit' ? 'Edit Payment' : 'Record Payment'}</DialogTitle>
        <DialogContent dividers>
          {submitError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {submitError}
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Autocomplete
                options={invoiceAutocompleteOptions}
                loading={invoicesLoading}
                value={selectedInvoice}
                onChange={(event, newValue) => {
                  setSelectedInvoice(newValue);
                  setFormErrors((prev) => ({ ...prev, invoice: undefined }));
                }}
                getOptionLabel={buildInvoiceLabel}
                isOptionEqualToValue={(option, value) =>
                  option.invoice_id === value.invoice_id
                  || option.invoice_number === value.invoice_number
                }
                loadingText="Loading invoices..."
                noOptionsText={invoiceError || 'No invoices match your search'}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Invoice"
                    placeholder="Search by invoice number or patient"
                    error={Boolean(formErrors.invoice)}
                    helperText={formErrors.invoice || invoiceError}
                  />
                )}
              />
            </Grid>
            {selectedInvoice && (
              <Grid item xs={12}>
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    backgroundColor: 'rgba(99,102,241,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                  }}
                >
                  <Typography variant="subtitle2">{selectedInvoice.invoice_number}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedInvoice.patient_name
                      || (selectedInvoice.patient_id ? `Patient #${selectedInvoice.patient_id}` : 'Unknown patient')}
                  </Typography>
                  {selectedInvoiceBalance !== null && (
                    <Typography variant="body2">
                      Outstanding: {formatCurrency(selectedInvoiceBalance, selectedInvoice.currency || 'GBP')}
                    </Typography>
                  )}
                </Box>
              </Grid>
            )}
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
          <Button onClick={handleSubmitPayment} variant="contained" disabled={submitting}>
            {submitting ? 'Saving...' : dialogMode === 'edit' ? 'Save Changes' : 'Record Payment'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteDialog.open}
        onClose={handleCloseDeleteDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Payment</DialogTitle>
        <DialogContent dividers>
          <DialogContentText>
            Are you sure you want to delete the payment of{' '}
            {deleteDialog.payment ? formatCurrency(deleteDialog.payment.amount_paid) : '--'} for invoice{' '}
            {deleteDialog.payment?.invoice_number || 'N/A'}?
          </DialogContentText>
          {deleteDialog.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteDialog.error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} disabled={deleteDialog.submitting} sx={{ color: '#fff' }}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDeletePayment}
            disabled={deleteDialog.submitting}
          >
            {deleteDialog.submitting ? 'Deleting...' : 'Delete'}
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
