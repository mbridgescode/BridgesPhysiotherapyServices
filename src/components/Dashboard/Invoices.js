import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SendIcon from '@mui/icons-material/Send';
import PaidIcon from '@mui/icons-material/Paid';
import apiClient from '../../utils/apiClient';
import DataTable from '../common/DataTable';

const defaultLineItem = () => ({
  description: '',
  quantity: 1,
  unit_price: 0,
  discount_amount: 0,
  service_date: '',
  appointment_id: undefined,
});

const defaultMarkPaidState = () => ({
  open: false,
  invoice: null,
  amount: '',
  method: 'card',
  reference: '',
  notes: '',
  submitting: false,
});

const PAYMENT_METHODS = [
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Bank Transfer' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'other', label: 'Other' },
];

const Invoices = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [patients, setPatients] = useState([]);
  const [formState, setFormState] = useState({
    patientId: '',
    appointmentIds: [],
    dueDate: '',
    sendEmail: false,
    lineItems: [defaultLineItem()],
  });
  const [submitting, setSubmitting] = useState(false);
  const [downloadingPdfFor, setDownloadingPdfFor] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [markPaidState, setMarkPaidState] = useState(() => defaultMarkPaidState());

  const showToast = useCallback((message, severity = 'success') => {
    setToast({ open: true, message, severity });
  }, []);

  const closeToast = useCallback(() => {
    setToast((prev) => ({ ...prev, open: false }));
  }, []);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/invoices', { params: { include: 'payments' } });
      const data = Array.isArray(response.data.invoices) ? response.data.invoices : [];
      setInvoices(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load invoices', err);
      setError('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const openCreateDialog = async () => {
    if (patients.length === 0) {
      try {
        const response = await apiClient.get('/api/patients', { params: { limit: 200 } });
        setPatients(response.data.patients || []);
      } catch (err) {
        console.error('Failed to load patients list', err);
      }
    }
    setCreateOpen(true);
  };

  const closeCreateDialog = () => {
    setCreateOpen(false);
    setFormState({
      patientId: '',
      appointmentIds: [],
      dueDate: '',
      sendEmail: false,
      lineItems: [defaultLineItem()],
    });
  };

  const updateLineItem = (index, field, value) => {
    setFormState((prev) => {
      const updated = [...prev.lineItems];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, lineItems: updated };
    });
  };

  const addLineItem = () => {
    setFormState((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, defaultLineItem()],
    }));
  };

  const removeLineItem = (index) => {
    setFormState((prev) => {
      const target = prev.lineItems[index];
      const remaining = prev.lineItems.filter((_, i) => i !== index);
      const sanitized = remaining.length > 0 ? remaining : [defaultLineItem()];
      const nextAppointmentIds = target?.appointment_id
        ? prev.appointmentIds.filter(
          (id) => String(id) !== String(target.appointment_id),
        )
        : prev.appointmentIds;
      return {
        ...prev,
        appointmentIds: nextAppointmentIds,
        lineItems: sanitized,
      };
    });
  };

  const submitInvoice = async () => {
    if (!formState.patientId) {
      return;
    }

    const mappedLineItems = formState.lineItems.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      service_date: item.service_date || undefined,
      discount_amount: Number(item.discount_amount || 0),
      appointment_id: typeof item.appointment_id === 'number'
        ? item.appointment_id
        : item.appointment_id
          ? Number(item.appointment_id)
          : undefined,
    }));

    const sanitizedLineItems = mappedLineItems.filter(
      (item) => item.description && item.description.trim().length > 0,
    );

    if (sanitizedLineItems.length === 0) {
      setError('Please add at least one service line item.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        patient_id: Number(formState.patientId),
        appointment_id: formState.appointmentIds?.[0]
          ? Number(formState.appointmentIds[0])
          : undefined,
        appointment_ids: (formState.appointmentIds || [])
          .map((value) => Number(value))
          .filter((value) => !Number.isNaN(value)),
        due_date: formState.dueDate || undefined,
        sendEmail: formState.sendEmail,
        line_items: sanitizedLineItems,
      };

      const response = await apiClient.post('/api/invoices', payload);
      setInvoices((prev) => [response.data.invoice, ...prev]);
      setPatients((prevPatients) => prevPatients.map((patient) => {
        if (String(patient.patient_id) !== String(formState.patientId)) {
          return patient;
        }
        return {
          ...patient,
          invoices: [response.data.invoice, ...(patient.invoices || [])],
        };
      }));
      closeCreateDialog();
    } catch (err) {
      console.error('Failed to create invoice', err);
      setError('Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const sendInvoiceEmail = async (invoiceNumber) => {
    try {
      const response = await apiClient.post(`/api/invoices/${invoiceNumber}/send`);
      if (response.data?.success) {
        showToast(response.data?.message || 'Invoice emailed successfully');
      } else {
        showToast(response.data?.message || 'Unable to send invoice email', 'error');
      }
      loadInvoices();
    } catch (err) {
      console.error('Failed to send invoice', err);
      setError('Failed to send invoice email');
      showToast('Failed to send invoice email', 'error');
    }
  };

  const voidInvoice = async (invoiceNumber) => {
    try {
      await apiClient.patch(`/api/invoices/${invoiceNumber}/void`);
      loadInvoices();
    } catch (err) {
      console.error('Failed to void invoice', err);
      setError('Unable to void invoice');
    }
  };

  const openMarkPaidDialog = (invoice) => {
    const balance = Number(invoice?.totals?.balance ?? invoice?.balance_due ?? invoice?.total_due ?? 0);
    const fallbackAmount = Number(invoice?.total_due || 0);
    const effectiveAmount = balance > 0 ? balance : fallbackAmount;

    setMarkPaidState({
      open: true,
      invoice,
      amount: effectiveAmount.toFixed(2),
      method: 'card',
      reference: '',
      notes: '',
      submitting: false,
    });
  };

  const closeMarkPaidDialog = () => {
    setMarkPaidState(defaultMarkPaidState());
  };

  const submitMarkPaid = async () => {
    if (!markPaidState.invoice) {
      return;
    }
    const amountValue = Number(markPaidState.amount);
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      showToast('Enter a valid payment amount', 'error');
      return;
    }
    setMarkPaidState((prev) => ({ ...prev, submitting: true }));
    try {
      const response = await apiClient.post(
        `/api/invoices/${markPaidState.invoice.invoice_number}/pay`,
        {
          amount: amountValue,
          method: markPaidState.method,
          reference: markPaidState.reference || undefined,
          notes: markPaidState.notes || undefined,
        },
      );
      if (response.data?.success) {
        showToast(response.data?.message || 'Invoice marked as paid');
      } else {
        showToast(response.data?.message || 'Unable to mark invoice as paid', 'error');
      }
      closeMarkPaidDialog();
      loadInvoices();
    } catch (err) {
      console.error('Failed to mark invoice as paid', err);
      showToast(err?.response?.data?.message || 'Failed to mark invoice as paid', 'error');
      setMarkPaidState((prev) => ({ ...prev, submitting: false }));
    }
  };

  const downloadInvoicePdf = async (invoice) => {
    if (!invoice?.invoice_number) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }

    const endpoint = invoice.pdf_url || `/api/invoices/${invoice.invoice_number}/pdf`;
    setDownloadingPdfFor(invoice.invoice_number);

    try {
      const response = await apiClient.get(endpoint, {
        responseType: 'arraybuffer',
      });
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
        let errorMessage = 'Unable to download invoice PDF';
        if (decoded) {
          try {
            const parsed = JSON.parse(decoded);
            errorMessage = parsed?.message || parsed?.error || errorMessage;
          } catch (parseErr) {
            errorMessage = decoded;
          }
        }
        console.error('Invoice PDF download returned non-PDF payload', { errorMessage, endpoint });
        showToast(errorMessage, 'error');
        return;
      }
      const contentType = response.headers?.['content-type'] || 'application/pdf';
      const disposition = response.headers?.['content-disposition'] || '';
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
      const decodeFileName = (value) => {
        try {
          return decodeURIComponent(value);
        } catch (error) {
          return value;
        }
      };
      const filename = (utf8Match && decodeFileName(utf8Match[1]))
        || (asciiMatch && asciiMatch[1])
        || `${invoice.invoice_number}.pdf`;
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
        // Delay revocation slightly so Safari/iOS finish downloading the blob.
        window.URL.revokeObjectURL(url);
      }, 500);
    } catch (err) {
      console.error('Failed to download invoice PDF', err);
      setError('Failed to download invoice PDF');
    } finally {
      setDownloadingPdfFor(null);
    }
  };

  const selectedPatient = useMemo(
    () => patients.find(
      (patient) => String(patient.patient_id) === String(formState.patientId),
    ),
    [patients, formState.patientId],
  );

  const invoiceLinkedAppointments = useMemo(() => {
    if (!selectedPatient?.invoices?.length) {
      return new Set();
    }
    const linked = [];
    selectedPatient.invoices.forEach((invoice) => {
      if (invoice.appointment_id !== undefined && invoice.appointment_id !== null) {
        linked.push(String(invoice.appointment_id));
      }
      if (Array.isArray(invoice.appointment_ids)) {
        invoice.appointment_ids.forEach((id) => {
          if (id !== undefined && id !== null) {
            linked.push(String(id));
          }
        });
      }
    });
    return new Set(linked);
  }, [selectedPatient?.invoices]);

  const isOutstandingAppointment = useCallback((appointment) => {
    if (!appointment) {
      return false;
    }
    const paymentStatus = (appointment.paymentStatus || '').toLowerCase();
    const status = (appointment.status || '').toLowerCase();
    const qualifiesForBilling = status === 'completed' || status === 'cancelled_same_day';
    if (!qualifiesForBilling) {
      return false;
    }
    return paymentStatus !== 'paid'
      && paymentStatus !== 'void'
      && paymentStatus !== 'cancelled';
  }, []);

  const billablePatients = useMemo(() => patients.filter(
    (patient) => Array.isArray(patient.appointments)
      && patient.appointments.some((appointment) => isOutstandingAppointment(appointment)),
  ), [patients, isOutstandingAppointment]);

  const sortedAppointmentOptions = useMemo(() => {
    if (!selectedPatient?.appointments?.length) {
      return [];
    }
    return [...selectedPatient.appointments]
      .filter(
        (appointment) => !invoiceLinkedAppointments.has(String(appointment.appointment_id))
          && isOutstandingAppointment(appointment),
      )
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
  }, [selectedPatient, invoiceLinkedAppointments, isOutstandingAppointment]);

  const selectedAppointmentOptions = useMemo(() => {
    if (!formState.appointmentIds?.length) {
      return [];
    }
    const lookup = new Map(
      sortedAppointmentOptions.map((appointment) => [String(appointment.appointment_id), appointment]),
    );
    return formState.appointmentIds
      .map((id) => lookup.get(String(id)))
      .filter(Boolean);
  }, [formState.appointmentIds, sortedAppointmentOptions]);

  const outstandingAppointmentOptions = useMemo(
    () => sortedAppointmentOptions.filter((appointment) => isOutstandingAppointment(appointment)),
    [sortedAppointmentOptions, isOutstandingAppointment],
  );

  const selectedBillablePatient = useMemo(() => {
    if (!selectedPatient) {
      return null;
    }
    return billablePatients.find(
      (patient) => String(patient.patient_id) === String(selectedPatient.patient_id),
    ) || null;
  }, [selectedPatient, billablePatients]);

  useEffect(() => {
    if (!formState.patientId) {
      return;
    }
    const eligible = billablePatients.some(
      (patient) => String(patient.patient_id) === String(formState.patientId),
    );
    if (!eligible) {
      setFormState((prev) => ({
        ...prev,
        patientId: '',
        appointmentIds: [],
        lineItems: [defaultLineItem()],
      }));
    }
  }, [formState.patientId, billablePatients]);

  const formatAppointmentLabel = (appointment) => {
    const dateLabel = appointment?.date
      ? new Date(appointment.date).toLocaleString()
      : 'Date TBC';
    const treatmentLabel = appointment?.treatment_description || 'Appointment';
    return `#${appointment.appointment_id} - ${dateLabel} - ${treatmentLabel}`;
  };

  const resolveAppointmentBalance = (appointment) => {
    if (!appointment) {
      return 0;
    }
    const basePrice = Number(appointment.price || 0);
    if (typeof appointment.balance_due !== 'undefined') {
      return Math.max(Number(appointment.balance_due), 0);
    }
    if (Array.isArray(appointment.payments) && appointment.payments.length > 0) {
      const totalPaid = appointment.payments.reduce(
        (sum, payment) => sum + Number(payment.amount_paid || 0),
        0,
      );
      return Math.max(basePrice - totalPaid, 0);
    }
    return basePrice;
  };

  const formatDateForInput = (value) => {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const buildLineItemFromAppointment = (appointment) => ({
    line_id: `appt-${appointment.appointment_id}`,
    description: appointment.treatment_description
      || `Appointment ${appointment.appointment_id}`,
    quantity: 1,
    unit_price: resolveAppointmentBalance(appointment),
    discount_amount: 0,
    appointment_id: appointment.appointment_id,
    service_date: formatDateForInput(appointment.date),
  });

  const syncLineItemsWithAppointments = useCallback(
    (nextAppointmentIds, currentLineItems) => {
      if (!selectedPatient?.appointments?.length) {
        return currentLineItems.length > 0 ? currentLineItems : [defaultLineItem()];
      }

      const appointmentLookup = new Map(
        selectedPatient.appointments.map((appointment) => [
          String(appointment.appointment_id),
          appointment,
        ]),
      );

      const appointmentItems = nextAppointmentIds
        .map((id) => {
          const key = String(id);
          const appointment = appointmentLookup.get(key);
          if (!appointment) {
            return null;
          }
          const existing = currentLineItems.find(
            (item) => item.appointment_id && String(item.appointment_id) === key,
          );
          if (existing) {
            return {
              ...existing,
              service_date: existing.service_date || formatDateForInput(appointment.date),
            };
          }
          return buildLineItemFromAppointment(appointment);
        })
        .filter(Boolean);

      const manualItems = currentLineItems.filter(
        (item) => !item.appointment_id && (item.description?.trim()?.length),
      );
      const combined = [...appointmentItems, ...manualItems];
      return combined.length > 0 ? combined : [defaultLineItem()];
    },
    [selectedPatient],
  );

  const handleAppointmentSelectionChange = useCallback(
    (event, newValue) => {
      const nextIds = newValue.map((option) => String(option.appointment_id));
      setFormState((prev) => ({
        ...prev,
        appointmentIds: nextIds,
        lineItems: syncLineItemsWithAppointments(nextIds, prev.lineItems),
      }));
    },
    [syncLineItemsWithAppointments],
  );

  const handleSelectOutstandingAppointments = useCallback(() => {
    if (outstandingAppointmentOptions.length === 0) {
      return;
    }
    const nextIds = outstandingAppointmentOptions.map(
      (appointment) => String(appointment.appointment_id),
    );
    setFormState((prev) => ({
      ...prev,
      appointmentIds: nextIds,
      lineItems: syncLineItemsWithAppointments(nextIds, prev.lineItems),
    }));
  }, [outstandingAppointmentOptions, syncLineItemsWithAppointments]);


  const formatCurrency = (value, currency) => {
    const amount = Number(value || 0);
    try {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: currency || 'GBP',
      }).format(amount);
    } catch (err) {
      console.error('Failed to format currency', err);
      return `${currency || 'GBP'} ${amount.toFixed(2)}`;
    }
  };

  const invoiceStatusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (invoices || [])
            .map((invoice) => invoice.status)
            .filter(Boolean),
        ),
      ).map((status) => ({
        value: status,
        label: status.charAt(0).toUpperCase() + status.slice(1),
      })),
    [invoices],
  );

  const tableRows = useMemo(
    () => (invoices || []).map((invoice) => {
      const identifier = invoice.patient_id || invoice.client_id;
      const fallbackName = identifier ? `Patient #${identifier}` : 'Patient';
      const patientDisplayName = invoice.patient_name || fallbackName;
      const billingContactDisplay = invoice.billing_contact_name
        && invoice.billing_contact_name !== patientDisplayName
        ? invoice.billing_contact_name
        : '';

      return {
        ...invoice,
        patientDisplayName,
        billingContactDisplay,
      };
    }),
    [invoices],
  );

  const tableRowId = useCallback((row) => row._id || row.invoice_number, []);

  const invoiceColumns = [
    {
      id: 'invoice_number',
      label: 'Invoice',
      minWidth: 170,
      render: (row) => (
        <Box display="flex" flexDirection="column">
          <Typography variant="body2" fontWeight={600}>
            {row.invoice_number}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {row.issue_date
              ? `Issued ${new Date(row.issue_date).toLocaleDateString('en-GB')}`
              : 'Issued -'}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'patientDisplayName',
      label: 'Patient',
      minWidth: 220,
      valueGetter: (row) => row.patientDisplayName,
      render: (row) => (
        <Box display="flex" flexDirection="column">
          <Typography variant="body2">{row.patientDisplayName}</Typography>
          <Typography variant="caption" color="text.secondary">
            ID {row.patient_id || row.client_id || '-'}
          </Typography>
          {row.billingContactDisplay && (
            <Typography variant="caption" color="text.secondary">
              Billing contact: {row.billingContactDisplay}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      options: invoiceStatusOptions,
      minWidth: 130,
    },
    {
      id: 'netTotal',
      label: 'Net',
      type: 'number',
      minWidth: 120,
      valueGetter: (row) => row.totals?.net ?? row.subtotal,
      render: (row) => formatCurrency(row.totals?.net ?? row.subtotal, row.currency),
      filterable: false,
    },
    {
      id: 'grossTotal',
      label: 'Gross',
      type: 'number',
      minWidth: 120,
      valueGetter: (row) => row.totals?.gross ?? row.total_due,
      render: (row) => formatCurrency(row.totals?.gross ?? row.total_due, row.currency),
      filterable: false,
    },
    {
      id: 'balance_due',
      label: 'Balance',
      type: 'number',
      minWidth: 120,
      render: (row) => formatCurrency(row.totals?.balance ?? row.balance_due, row.currency),
    },
    {
      id: 'due_date',
      label: 'Due Date',
      type: 'date',
      minWidth: 150,
      valueGetter: (row) => row.due_date || '',
      render: (row) =>
        row.due_date ? new Date(row.due_date).toLocaleDateString('en-GB') : '-',
    },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      sortable: false,
      filterable: false,
      minWidth: 190,
      render: (row) => (
        <Box display="flex" justifyContent="flex-end" gap={1}>
          <Tooltip title="Download PDF">
            <span>
              <IconButton
                size="small"
                onClick={() => downloadInvoicePdf(row)}
                disabled={downloadingPdfFor === row.invoice_number}
                aria-busy={downloadingPdfFor === row.invoice_number}
              >
                {downloadingPdfFor === row.invoice_number ? (
                  <CircularProgress size={16} />
                ) : (
                  <PictureAsPdfIcon fontSize="inherit" />
                )}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip
            title={
              row.totals?.balance > 0
                ? 'Mark as paid'
                : 'Invoice already paid'
            }
          >
            <span>
              <IconButton
                size="small"
                onClick={() => openMarkPaidDialog(row)}
                disabled={(row.totals?.balance ?? row.balance_due ?? 0) <= 0}
              >
                <PaidIcon fontSize="inherit" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Send via email">
            <span>
              <IconButton
                size="small"
                onClick={() => sendInvoiceEmail(row.invoice_number)}
              >
                <SendIcon fontSize="inherit" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Void invoice">
            <span>
              <IconButton
                size="small"
                onClick={() => voidInvoice(row.invoice_number)}
              >
                <DeleteIcon fontSize="inherit" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ),
    },
  ];


  if (loading) {
    return <CircularProgress />;
  }

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5">Invoices</Typography>
          <Button variant="contained" onClick={openCreateDialog}>
            New Invoice
          </Button>
        </Box>
        <DataTable
          columns={invoiceColumns}
          rows={tableRows}
          getRowId={tableRowId}
          maxHeight="100%"
          containerSx={{ height: '100%' }}
          emptyMessage="No invoices to display."
        />
      </CardContent>

      <Dialog open={createOpen} onClose={closeCreateDialog} maxWidth="lg" fullWidth>
        <DialogTitle>Create Invoice</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Autocomplete
                options={billablePatients}
                value={selectedBillablePatient}
                onChange={(event, newValue) => {
                  const nextPatientId = newValue?.patient_id ? String(newValue.patient_id) : '';
                  setFormState((prev) => ({
                    ...prev,
                    patientId: nextPatientId,
                    appointmentIds: [],
                    lineItems: [defaultLineItem()],
                  }));
                }}
                getOptionLabel={(option) => {
                  if (!option) {
                    return '';
                  }
                  const displayName = `${option.first_name || ''} ${option.surname || ''}`.trim();
                  return displayName
                    ? `${displayName} (${option.patient_id})`
                    : `Patient ${option.patient_id}`;
                }}
                isOptionEqualToValue={(option, value) =>
                  String(option.patient_id) === String(value?.patient_id)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Patient"
                    placeholder="Search or select patient"
                  />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                multiple
                disabled={!selectedPatient}
                options={sortedAppointmentOptions}
                value={selectedAppointmentOptions}
                onChange={handleAppointmentSelectionChange}
                getOptionLabel={formatAppointmentLabel}
                isOptionEqualToValue={(option, value) =>
                  String(option.appointment_id) === String(value.appointment_id)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Treatments to include"
                    placeholder={
                      selectedPatient
                        ? 'Select outstanding treatments'
                        : 'Select a patient first'
                    }
                    helperText={
                      selectedPatient
                        ? 'Only appointments without invoices are listed'
                        : 'Select a patient to see appointments'
                    }
                  />
                )}
              />
              <Box mt={1} display="flex" justifyContent="flex-end">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleSelectOutstandingAppointments}
                  disabled={
                    !selectedPatient
                    || outstandingAppointmentOptions.length === 0
                  }
                  sx={{ color: '#fff', borderColor: '#fff' }}
                >
                  Add Outstanding Treatments
                </Button>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Due Date"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={formState.dueDate}
                onChange={(event) => setFormState((prev) => ({ ...prev, dueDate: event.target.value }))}
              />
            </Grid>
          </Grid>

          <Box mt={3}>
            <Typography variant="subtitle1" gutterBottom>
              Line Items
            </Typography>
            {formState.lineItems.map((item, index) => {
              const serviceDateValue = typeof item.service_date === 'string'
                ? item.service_date
                : formatDateForInput(item.service_date);

              return (
                <Grid container spacing={2} key={`line-${index}`} alignItems="center">
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="Description"
                      fullWidth
                      value={item.description}
                      onChange={(event) => updateLineItem(index, 'description', event.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <TextField
                      label="Treatment Date"
                      type="date"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      value={serviceDateValue || ''}
                      onChange={(event) => updateLineItem(index, 'service_date', event.target.value)}
                    />
                  </Grid>
                  <Grid item xs={6} md={1}>
                    <TextField
                      label="Quantity"
                      type="number"
                      fullWidth
                      value={item.quantity}
                      onChange={(event) => updateLineItem(index, 'quantity', event.target.value)}
                    />
                  </Grid>
                  <Grid item xs={6} md={2}>
                    <TextField
                      label="Unit Price"
                      type="number"
                      fullWidth
                      value={item.unit_price}
                      onChange={(event) => updateLineItem(index, 'unit_price', event.target.value)}
                    />
                  </Grid>
                <Grid item xs={6} md={3}>
                  <TextField
                    label="Discount"
                    type="number"
                    fullWidth
                    value={item.discount_amount ?? 0}
                    onChange={(event) => updateLineItem(index, 'discount_amount', event.target.value)}
                    inputProps={{ min: 0, step: 0.01 }}
                  />
                </Grid>
                  <Grid item xs={12} md={1} display="flex" justifyContent="flex-end">
                    <IconButton onClick={() => removeLineItem(index)} disabled={formState.lineItems.length === 1}>
                      <DeleteIcon />
                    </IconButton>
                  </Grid>
                </Grid>
              );
            })}
            <Button
              startIcon={<AddIcon />}
              onClick={addLineItem}
              sx={{ mt: 1, color: '#fff' }}
            >
              Add Line Item
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreateDialog} disabled={submitting} sx={{ color: '#fff' }}>
            Cancel
          </Button>
      <Button onClick={submitInvoice} variant="contained" disabled={submitting}>
        {submitting ? 'Creating...' : 'Create Invoice'}
      </Button>
    </DialogActions>
  </Dialog>
      <Dialog
        open={markPaidState.open}
        onClose={markPaidState.submitting ? undefined : closeMarkPaidDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Mark Invoice as Paid</DialogTitle>
        <DialogContent dividers>
          <Box mb={2}>
            <Typography variant="subtitle2" color="text.secondary">
              Invoice
            </Typography>
            <Typography variant="h6">
              {markPaidState.invoice?.invoice_number || '--'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Outstanding:{' '}
              {formatCurrency(
                markPaidState.invoice?.totals?.balance
                  ?? markPaidState.invoice?.balance_due
                  ?? 0,
                markPaidState.invoice?.currency,
              )}
            </Typography>
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                label="Amount"
                type="number"
                fullWidth
                value={markPaidState.amount}
                onChange={(event) => setMarkPaidState((prev) => ({
                  ...prev,
                  amount: event.target.value,
                }))}
                disabled={markPaidState.submitting}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Payment Method"
                select
                fullWidth
                value={markPaidState.method}
                onChange={(event) => setMarkPaidState((prev) => ({
                  ...prev,
                  method: event.target.value,
                }))}
                disabled={markPaidState.submitting}
              >
                {PAYMENT_METHODS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Reference"
                fullWidth
                value={markPaidState.reference}
                onChange={(event) => setMarkPaidState((prev) => ({
                  ...prev,
                  reference: event.target.value,
                }))}
                disabled={markPaidState.submitting}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                fullWidth
                multiline
                minRows={2}
                value={markPaidState.notes}
                onChange={(event) => setMarkPaidState((prev) => ({
                  ...prev,
                  notes: event.target.value,
                }))}
                disabled={markPaidState.submitting}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={closeMarkPaidDialog}
            disabled={markPaidState.submitting}
            sx={{ color: '#fff' }}
          >
            Cancel
          </Button>
          <Button
            onClick={submitMarkPaid}
            variant="contained"
            disabled={markPaidState.submitting}
          >
            {markPaidState.submitting ? 'Saving...' : 'Mark as Paid'}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={closeToast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} onClose={closeToast} sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Card>
  );
};

export default Invoices;
