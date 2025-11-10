import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import apiClient from '../../utils/apiClient';

const defaultLineItem = () => ({
  description: '',
  quantity: 1,
  unit_price: 0,
  tax_rate: 0,
  discount_amount: 0,
  service_date: '',
  appointment_id: undefined,
});

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

const buildLineItemFromAppointment = (appointment) => ({
  line_id: `appt-${appointment.appointment_id}`,
  description: appointment.treatment_description || `Appointment ${appointment.appointment_id}`,
  quantity: 1,
  unit_price: resolveAppointmentBalance(appointment),
  tax_rate: 0,
  discount_amount: 0,
  appointment_id: appointment.appointment_id,
  service_date: formatDateForInput(appointment.date),
});

const InvoiceBuilderDialog = ({
  open,
  onClose,
  onSuccess,
  initialPatientId = '',
  initialAppointmentIds = [],
  lockPatient = false,
  title = 'Create Invoice',
}) => {
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [formState, setFormState] = useState({
    patientId: '',
    appointmentIds: [],
    dueDate: '',
    sendEmail: false,
    lineItems: [defaultLineItem()],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const initialAppointmentIdStrings = useMemo(
    () => initialAppointmentIds.map((id) => String(id)),
    [initialAppointmentIds],
  );

  const resetForm = useCallback(
    () => setFormState({
      patientId: initialPatientId ? String(initialPatientId) : '',
      appointmentIds: initialAppointmentIds.map((id) => String(id)),
      dueDate: '',
      sendEmail: false,
      lineItems: [defaultLineItem()],
    }),
    [initialPatientId, initialAppointmentIds],
  );

  useEffect(() => {
    if (open) {
      resetForm();
      setError('');
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (patients.length > 0) {
      return;
    }
    const fetchPatients = async () => {
      setLoadingPatients(true);
      try {
        const response = await apiClient.get('/api/patients', { params: { limit: 200 } });
        setPatients(response.data.patients || []);
      } catch (err) {
        console.error('Failed to load patients', err);
      } finally {
        setLoadingPatients(false);
      }
    };
    fetchPatients();
  }, [open, patients.length]);

  useEffect(() => {
    if (!open || !initialPatientId) {
      return;
    }
    const exists = patients.some(
      (patient) => String(patient.patient_id) === String(initialPatientId),
    );
    if (exists || loadingPatients) {
      return;
    }
    const fetchPatient = async () => {
      try {
        const response = await apiClient.get(`/api/patients/${initialPatientId}`);
        if (response.data?.patient) {
          setPatients((prev) => {
            const already = prev.some(
              (patient) => String(patient.patient_id) === String(initialPatientId),
            );
            if (already) {
              return prev;
            }
            return [response.data.patient, ...prev];
          });
        }
      } catch (err) {
        console.error('Failed to load patient details', err);
      }
    };
    fetchPatient();
  }, [open, initialPatientId, patients, loadingPatients]);

  const selectedPatient = useMemo(() => {
    if (!formState.patientId) {
      return null;
    }
    return patients.find(
      (patient) => String(patient.patient_id) === String(formState.patientId),
    ) || null;
  }, [patients, formState.patientId]);

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

  const billablePatients = useMemo(
    () => patients.filter(
      (patient) => Array.isArray(patient.appointments)
        && patient.appointments.some((appointment) => isOutstandingAppointment(appointment)),
    ),
    [patients, isOutstandingAppointment],
  );

  const patientOptions = useMemo(() => {
    if (lockPatient) {
      return selectedPatient ? [selectedPatient] : [];
    }
    if (!billablePatients.length && selectedPatient) {
      return [selectedPatient];
    }
    return billablePatients;
  }, [billablePatients, lockPatient, selectedPatient]);

  const sortedAppointmentOptions = useMemo(() => {
    if (!selectedPatient?.appointments?.length) {
      return [];
    }
    const initialIds = new Set(initialAppointmentIdStrings);
    return [...selectedPatient.appointments]
      .filter(
        (appointment) => {
          const key = String(appointment.appointment_id);
          if (invoiceLinkedAppointments.has(key)) {
            return false;
          }
          if (initialIds.has(key)) {
            return true;
          }
          return isOutstandingAppointment(appointment);
        },
      )
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
  }, [initialAppointmentIdStrings, invoiceLinkedAppointments, isOutstandingAppointment, selectedPatient]);

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

  useEffect(() => {
    if (!selectedPatient) {
      return;
    }
    setFormState((prev) => ({
      ...prev,
      lineItems: syncLineItemsWithAppointments(prev.appointmentIds, prev.lineItems),
    }));
  }, [selectedPatient, syncLineItemsWithAppointments]);

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

  const handleSelectOutstandingAppointments = () => {
    if (!selectedPatient) {
      return;
    }
    const nextIds = outstandingAppointmentOptions.map((appointment) => String(appointment.appointment_id));
    setFormState((prev) => ({
      ...prev,
      appointmentIds: nextIds,
      lineItems: syncLineItemsWithAppointments(nextIds, prev.lineItems),
    }));
  };

  const updateLineItem = (index, field, value) => {
    setFormState((prev) => {
      const next = [...prev.lineItems];
      next[index] = {
        ...next[index],
        [field]: value,
      };
      return { ...prev, lineItems: next };
    });
  };

  const removeLineItem = (index) => {
    setFormState((prev) => {
      if (prev.lineItems.length === 1) {
        return prev;
      }
      const next = prev.lineItems.filter((_, idx) => idx !== index);
      return { ...prev, lineItems: next };
    });
  };

  const addLineItem = () => {
    setFormState((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, defaultLineItem()],
    }));
  };

  const formatAppointmentLabel = (appointment) => {
    const dateLabel = appointment?.date
      ? new Date(appointment.date).toLocaleString()
      : 'Date TBC';
    const treatmentLabel = appointment?.treatment_description || 'Appointment';
    return `#${appointment.appointment_id} - ${dateLabel} - ${treatmentLabel}`;
  };

  const handleSubmit = async () => {
    if (!formState.patientId) {
      setError('Select a patient to continue.');
      return;
    }
    const mappedLineItems = formState.lineItems.map((item) => ({
      ...item,
      appointment_id: item.appointment_id ? Number(item.appointment_id) : undefined,
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || 0,
      discount_amount: Number(item.discount_amount) || 0,
      tax_rate: Number(item.tax_rate) || 0,
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
      onSuccess?.(response.data.invoice);
      onClose?.();
    } catch (err) {
      console.error('Failed to create invoice', err);
      setError(err?.response?.data?.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Autocomplete
              options={patientOptions}
              value={selectedPatient}
              loading={loadingPatients}
              onChange={(event, newValue) => {
                if (lockPatient) {
                  return;
                }
                const nextPatientId = newValue?.patient_id ? String(newValue.patient_id) : '';
                setFormState({
                  patientId: nextPatientId,
                  appointmentIds: [],
                  dueDate: '',
                  sendEmail: false,
                  lineItems: [defaultLineItem()],
                });
                setError('');
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
              disabled={lockPatient}
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

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

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
                <Grid item xs={6} md={2}>
                  <TextField
                    label="Discount"
                    type="number"
                    fullWidth
                    value={item.discount_amount ?? 0}
                    onChange={(event) => updateLineItem(index, 'discount_amount', event.target.value)}
                    inputProps={{ min: 0, step: 0.01 }}
                  />
                </Grid>
                <Grid item xs={6} md={1}>
                  <TextField
                    label="Tax %"
                    type="number"
                    fullWidth
                    value={item.tax_rate}
                    onChange={(event) => updateLineItem(index, 'tax_rate', event.target.value)}
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
        <Button onClick={onClose} disabled={submitting} sx={{ color: '#fff' }}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Invoice'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default InvoiceBuilderDialog;
