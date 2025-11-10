import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Typography,
  TextField,
  Grid,
  Button,
  Divider,
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
import {
  format as formatDate,
  subDays,
  startOfMonth,
  startOfYear,
} from 'date-fns';
import DownloadIcon from '@mui/icons-material/Download';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
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
  section: {
    marginBottom: theme.spacing(3),
  },
}));

const buildDefaultRange = () => {
  const end = new Date();
  const start = subDays(end, 90);
  return {
    start: formatDate(start, 'yyyy-MM-dd'),
    end: formatDate(end, 'yyyy-MM-dd'),
  };
};

const PRESET_FILTERS = [
  { key: '30d', label: 'Last 30 days', compute: () => ({ start: subDays(new Date(), 30), end: new Date() }) },
  { key: '90d', label: 'Last 90 days', compute: () => ({ start: subDays(new Date(), 90), end: new Date() }) },
  { key: 'month', label: 'This month', compute: () => ({ start: startOfMonth(new Date()), end: new Date() }) },
  { key: 'ytd', label: 'Year to date', compute: () => ({ start: startOfYear(new Date()), end: new Date() }) },
];

const formatCurrency = (value = 0, currency = 'GBP') =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(value) || 0);

const summaryCards = (totals) => [
  {
    label: 'Income',
    value: formatCurrency(totals.income || 0),
    subtitle: 'Captured from invoices',
  },
  {
    label: 'Expenses',
    value: formatCurrency(totals.expense || 0),
    subtitle: 'Manual loss entries',
  },
  {
    label: 'Net',
    value: formatCurrency((totals.income || 0) - (totals.expense || 0)),
    subtitle: 'Income - Expenses',
  },
];

const createManualEntryState = () => ({
  date: formatDate(new Date(), 'yyyy-MM-dd'),
  category: '',
  description: '',
  amount: '',
});

const ProfitLoss = () => {
  const classes = useStyles();
  const [range, setRange] = useState(buildDefaultRange());
  const [activePreset, setActivePreset] = useState('90d');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [totals, setTotals] = useState({ income: 0, expense: 0 });
  const [invoiceEntries, setInvoiceEntries] = useState([]);
  const [manualEntries, setManualEntries] = useState([]);
  const [newEntry, setNewEntry] = useState(createManualEntryState());
  const [savingEntry, setSavingEntry] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [editDialog, setEditDialog] = useState({ open: false, entry: null, error: '' });

  const fetchProfitLoss = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.get('/api/profit-loss', {
        params: { start: range.start, end: range.end },
      });
      setInvoiceEntries(response.data.invoiceEntries || []);
      setManualEntries(response.data.manualEntries || []);
      setTotals(response.data.totals || { income: 0, expense: 0 });
    } catch (err) {
      console.error('Failed to load profit & loss', err);
      setError(err?.response?.data?.message || 'Unable to load profit & loss data');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchProfitLoss();
  }, [fetchProfitLoss]);

  const combinedEntries = useMemo(() => {
    const mappedManual = manualEntries.map((entry) => ({
      ...entry,
      dateLabel: formatDate(new Date(entry.date), 'dd MMM yyyy'),
      amountDisplay: `-${formatCurrency(entry.amount)}`,
      signAdjustedAmount: -Math.abs(entry.amount),
    }));
    const mappedInvoices = invoiceEntries.map((entry) => ({
      ...entry,
      dateLabel: formatDate(new Date(entry.date), 'dd MMM yyyy'),
      amountDisplay: formatCurrency(entry.amount),
      signAdjustedAmount: entry.amount,
    }));
    return [...mappedManual, ...mappedInvoices].sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );
  }, [invoiceEntries, manualEntries]);

  const handleRangeChange = (field) => (event) => {
    setRange((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
    setActivePreset(null);
  };

  const handleNewEntryChange = (field) => (event) => {
    setNewEntry((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const applyPreset = (presetKey) => {
    const preset = PRESET_FILTERS.find((option) => option.key === presetKey);
    if (!preset) {
      return;
    }
    const { start, end } = preset.compute();
    setRange({
      start: formatDate(start, 'yyyy-MM-dd'),
      end: formatDate(end, 'yyyy-MM-dd'),
    });
    setActivePreset(presetKey);
  };

  const handleCreateEntry = async (event) => {
    event.preventDefault();
    setSavingEntry(true);
    try {
      await apiClient.post('/api/profit-loss/manual', {
        ...newEntry,
        amount: Number(newEntry.amount),
      });
      setToast({ open: true, message: 'Expense recorded', severity: 'success' });
      setNewEntry(createManualEntryState());
      fetchProfitLoss();
    } catch (err) {
      console.error('Failed to create manual entry', err);
      setToast({ open: true, message: err?.response?.data?.message || 'Unable to add entry', severity: 'error' });
    } finally {
      setSavingEntry(false);
    }
  };

  const openEditDialogFor = (entry) => {
    setEditDialog({
      open: true,
      entry: {
        ...entry,
        amount: entry.amount,
        date: formatDate(new Date(entry.date), 'yyyy-MM-dd'),
      },
      error: '',
    });
  };

  const closeEditDialog = () => {
    setEditDialog({ open: false, entry: null, error: '' });
  };

  const handleEditFieldChange = (field) => (event) => {
    setEditDialog((prev) => ({
      ...prev,
      entry: {
        ...prev.entry,
        [field]: event.target.value,
      },
    }));
  };

  const handleUpdateEntry = async () => {
    if (!editDialog.entry) {
      return;
    }
    const confirmed = window.confirm('Are you sure you want to apply these changes?');
    if (!confirmed) {
      return;
    }
    try {
      await apiClient.put(`/api/profit-loss/manual/${editDialog.entry.entry_id}`, {
        date: editDialog.entry.date,
        category: editDialog.entry.category,
        description: editDialog.entry.description,
        amount: editDialog.entry.amount,
      });
      setToast({ open: true, message: 'Entry updated', severity: 'success' });
      closeEditDialog();
      fetchProfitLoss();
    } catch (err) {
      console.error('Failed to update entry', err);
      setEditDialog((prev) => ({
        ...prev,
        error: err?.response?.data?.message || 'Unable to update entry',
      }));
    }
  };

  const handleDeleteEntry = async (entry) => {
    if (!window.confirm('Are you sure you want to delete this entry?')) {
      return;
    }
    try {
      await apiClient.delete(`/api/profit-loss/manual/${entry.entry_id}`);
      setToast({ open: true, message: 'Entry removed', severity: 'success' });
      fetchProfitLoss();
    } catch (err) {
      console.error('Failed to delete entry', err);
      setToast({ open: true, message: err?.response?.data?.message || 'Unable to delete entry', severity: 'error' });
    }
  };

  const handleExport = async (format) => {
    try {
      const response = await apiClient.get('/api/profit-loss/export', {
        params: { start: range.start, end: range.end, format },
        responseType: 'blob',
      });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const suffix = `${range.start}-${range.end}.${format === 'csv' ? 'csv' : 'xlsx'}`;
      link.setAttribute('download', `profit-loss-${suffix}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export profit & loss', err);
      setToast({ open: true, message: err?.response?.data?.message || 'Unable to export data', severity: 'error' });
    }
  };

  const columns = [
    {
      id: 'dateLabel',
      label: 'Date',
      minWidth: 120,
    },
    {
      id: 'category',
      label: 'Category',
      minWidth: 140,
      render: (row) => row.category || (row.type === 'income' ? 'Revenue' : 'Expense'),
    },
    {
      id: 'description',
      label: 'Description',
      minWidth: 200,
      render: (row) => row.description || (row.type === 'income' ? 'Invoice revenue' : 'Expense'),
    },
    {
      id: 'amountDisplay',
      label: 'Amount',
      minWidth: 120,
      align: 'right',
      render: (row) => (
        <Typography color={row.type === 'income' ? 'success.main' : 'error.main'} fontWeight={600}>
          {row.amountDisplay}
        </Typography>
      ),
    },
    {
      id: 'source',
      label: 'Source',
      minWidth: 110,
      render: (row) => (row.source === 'invoice' ? 'Invoice' : 'Manual'),
    },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      sortable: false,
      filterable: false,
      minWidth: 120,
      render: (row) => (row.source === 'manual' ? (
        <Box display="flex" justifyContent="flex-end">
          <Tooltip title="Edit entry">
            <IconButton size="small" onClick={() => openEditDialogFor(row)}>
              <EditIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete entry">
            <IconButton size="small" onClick={() => handleDeleteEntry(row)}>
              <DeleteOutlineIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        </Box>
      ) : (
        <Typography variant="caption" color="text.secondary">
          Auto
        </Typography>
      )),
    },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 3 }}>
      <Typography variant="h5" gutterBottom>
        Profit &amp; Loss
      </Typography>
      <Card className={classes.section}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField
                label="Start date"
                type="date"
                fullWidth
                value={range.start}
                onChange={handleRangeChange('start')}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="End date"
                type="date"
                fullWidth
                value={range.end}
                onChange={handleRangeChange('end')}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <Button variant="outlined" onClick={fetchProfitLoss} sx={{ mt: { xs: 2, md: 3.5 } }}>
                Refresh
              </Button>
            </Grid>
            <Grid item xs={12} md={3} display="flex" justifyContent="flex-end" alignItems="center" gap={1}>
              <Tooltip title="Export CSV">
                <span>
                  <IconButton onClick={() => handleExport('csv')}>
                    <DownloadIcon />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Export XLSX">
                <span>
                  <IconButton onClick={() => handleExport('xlsx')}>
                    <DownloadIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Grid>
          </Grid>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              mt: 2,
            }}
          >
            {PRESET_FILTERS.map((preset) => (
              <Button
                key={preset.key}
                size="small"
                variant={activePreset === preset.key ? 'contained' : 'outlined'}
                onClick={() => applyPreset(preset.key)}
              >
                {preset.label}
              </Button>
            ))}
          </Box>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        {summaryCards(totals).map((card) => (
          <Grid item xs={12} md={4} key={card.label}>
            <Card>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  {card.label}
                </Typography>
                <Typography variant="h5">{card.value}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {card.subtitle}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card className={classes.card}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Manual Loss Entries</Typography>
            <Button startIcon={<AddIcon />} variant="contained" onClick={handleCreateEntry} disabled={savingEntry}>
              {savingEntry ? 'Saving...' : 'Add Entry'}
            </Button>
          </Box>
          <Grid container spacing={2} component="form" onSubmit={handleCreateEntry}>
            <Grid item xs={12} md={3}>
              <TextField
                label="Date"
                type="date"
                value={newEntry.date}
                onChange={handleNewEntryChange('date')}
                fullWidth
                InputLabelProps={{ shrink: true }}
                required
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="Category"
                value={newEntry.category}
                onChange={handleNewEntryChange('category')}
                fullWidth
                placeholder="e.g. Equipment"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Description"
                value={newEntry.description}
                onChange={handleNewEntryChange('description')}
                fullWidth
                placeholder="What was this expense?"
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                label="Amount"
                type="number"
                value={newEntry.amount}
                onChange={handleNewEntryChange('amount')}
                fullWidth
                inputProps={{ min: 0, step: 0.01 }}
                required
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card className={classes.card}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Entries
          </Typography>
          <Divider sx={{ mb: 2 }} />
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {loading ? (
            <CircularProgress />
          ) : (
            <DataTable
              columns={columns}
              rows={combinedEntries}
              getRowId={(row, index) => row.entry_id || row._id || index}
              maxHeight="70vh"
              emptyMessage="No entries for this period."
            />
          )}
        </CardContent>
      </Card>

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          onClose={() => setToast((prev) => ({ ...prev, open: false }))}
          sx={{ width: '100%' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>

      <Dialog open={editDialog.open} onClose={closeEditDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Expense Entry</DialogTitle>
        <DialogContent dividers>
          {editDialog.entry && (
            <Box display="flex" flexDirection="column" gap={2}>
              <TextField
                label="Date"
                type="date"
                value={editDialog.entry.date}
                onChange={handleEditFieldChange('date')}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Category"
                value={editDialog.entry.category}
                onChange={handleEditFieldChange('category')}
              />
              <TextField
                label="Description"
                value={editDialog.entry.description}
                onChange={handleEditFieldChange('description')}
              />
              <TextField
                label="Amount"
                type="number"
                value={editDialog.entry.amount}
                onChange={handleEditFieldChange('amount')}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Box>
          )}
          {editDialog.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {editDialog.error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditDialog} sx={{ color: '#fff' }}>
            Cancel
          </Button>
          <Button onClick={handleUpdateEntry} variant="contained">
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProfitLoss;
