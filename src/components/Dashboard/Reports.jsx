import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  AccountBalance,
  AccountBalanceWallet,
  CheckCircleOutline,
  Close,
  Download,
  OpenInNew,
  Payments,
  ReceiptLong,
  Refresh,
  Tune,
  VerifiedUser,
} from '@mui/icons-material';
import {
  addDays,
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns';
import ReactApexChart from 'react-apexcharts';
import apiClient from '../../utils/apiClient';
import DataTable from '../common/DataTable';

const currencyFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat('en-GB', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const formatCurrency = (value = 0) => currencyFormatter.format(Number(value) || 0);
const formatPercent = (value = 0) => percentFormatter.format(Number(value) || 0);
const safeNumber = (value) => Number(value) || 0;

const RANGE_OPTIONS = [
  { key: '30d', label: '30 days', getRange: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { key: '90d', label: '90 days', getRange: () => ({ from: subDays(new Date(), 90), to: new Date() }) },
  { key: '1y', label: '1 year', getRange: () => ({ from: subMonths(new Date(), 12), to: new Date() }) },
  { key: 'ytd', label: 'Year to date', getRange: () => ({ from: startOfYear(new Date()), to: new Date() }) },
  { key: 'all', label: 'All time', getRange: () => ({ from: new Date(2010, 0, 1), to: new Date() }) },
];

const REPORTS_PALETTE = {
  background: '#0B1220',
  panel: '#111B2D',
  panelAlt: '#18263A',
  border: 'rgba(148, 163, 184, 0.16)',
  textPrimary: '#F8FAFC',
  textSecondary: '#A7B3C5',
  accent: '#5EEAD4',
};

const metricOptions = [
  { value: 'billed', label: 'Billed revenue', color: '#60A5FA' },
  { value: 'collected', label: 'Cash collected', color: '#5EEAD4' },
  { value: 'expenses', label: 'Operating expenses', color: '#F59E0B' },
  { value: 'net', label: 'Net profit', color: '#A78BFA' },
];

const cloneRange = (range) => ({
  from: range?.from ? new Date(range.from) : null,
  to: range?.to ? new Date(range.to) : null,
});

const formatInputDate = (value) => (value ? format(value, 'yyyy-MM-dd') : '');

const parseInputDate = (value, end = false) => {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00`);
  if (end) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
};

const formatBucketLabel = (date, grouping) => (
  grouping === 'week' ? format(date, 'dd MMM') : format(date, 'MMM yyyy')
);

const bucketForDate = (dateValue, grouping) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const start = grouping === 'week'
    ? startOfWeek(date, { weekStartsOn: 1 })
    : startOfMonth(date);
  return {
    key: format(start, 'yyyy-MM-dd'),
    start,
    end: grouping === 'week' ? addDays(start, 6) : endOfMonth(start),
    label: formatBucketLabel(start, grouping),
  };
};

const cashMovement = (payment) => {
  const amount = Math.abs(safeNumber(payment?.amount_paid));
  if (payment?.status === 'refunded') {
    return -amount;
  }
  return payment?.status === 'applied' ? amount : 0;
};

const getFinancialValues = (data) => {
  const invoiceEntries = data?.invoiceEntries || [];
  const manualEntries = data?.manualEntries || [];
  const paymentEntries = data?.paymentEntries || [];
  const billed = invoiceEntries.reduce((sum, entry) => sum + safeNumber(entry.amount), 0);
  const expenses = manualEntries
    .filter((entry) => entry.type !== 'income')
    .reduce((sum, entry) => sum + safeNumber(entry.amount), 0);
  const collected = paymentEntries.reduce((sum, payment) => sum + cashMovement(payment), 0);
  return { billed, expenses, collected, net: billed - expenses };
};

const getDelta = (current, previous) => (
  previous === null || previous === undefined ? null : current - previous
);

const deltaLabel = (delta) => {
  if (delta === null || delta === undefined) {
    return 'No comparison';
  }
  return `${delta >= 0 ? '+' : '-'}${formatCurrency(Math.abs(delta))} vs prior period`;
};

const buildTrendRows = (data, grouping) => {
  const buckets = new Map();
  const ensureBucket = (date) => {
    const bucket = bucketForDate(date, grouping);
    if (!bucket) {
      return null;
    }
    const current = buckets.get(bucket.key) || {
      ...bucket,
      billed: 0,
      collected: 0,
      expenses: 0,
    };
    buckets.set(bucket.key, current);
    return current;
  };

  (data?.invoiceEntries || []).forEach((entry) => {
    const bucket = ensureBucket(entry.date);
    if (bucket) {
      bucket.billed += safeNumber(entry.amount);
    }
  });
  (data?.manualEntries || []).forEach((entry) => {
    if (entry.type === 'income') {
      return;
    }
    const bucket = ensureBucket(entry.date);
    if (bucket) {
      bucket.expenses += safeNumber(entry.amount);
    }
  });
  (data?.paymentEntries || []).forEach((payment) => {
    const bucket = ensureBucket(payment.payment_date);
    if (bucket) {
      bucket.collected += cashMovement(payment);
    }
  });

  return Array.from(buckets.values())
    .sort((a, b) => a.start - b.start)
    .map((bucket) => ({ ...bucket, net: bucket.billed - bucket.expenses }));
};

const Reports = () => {
  const palette = REPORTS_PALETTE;
  const initialRange = useMemo(() => cloneRange(RANGE_OPTIONS[1].getRange()), []);
  const [rangeKey, setRangeKey] = useState('90d');
  const [dateRange, setDateRange] = useState(initialRange);
  const [customRange, setCustomRange] = useState(initialRange);
  const [grouping, setGrouping] = useState('month');
  const [trendMetric, setTrendMetric] = useState('billed');
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [metrics, setMetrics] = useState(null);
  const [profitLossData, setProfitLossData] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profitLossError, setProfitLossError] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState('');
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [drilldown, setDrilldown] = useState({ open: false, title: '', subtitle: '', rows: [] });

  const previousRange = useMemo(() => {
    if (!dateRange.from || !dateRange.to) {
      return { from: null, to: null };
    }
    const duration = Math.max(1, Math.ceil((dateRange.to - dateRange.from) / 86400000));
    return {
      from: subDays(dateRange.from, duration + 1),
      to: subDays(dateRange.from, 1),
    };
  }, [dateRange]);

  const fetchDashboard = useCallback(async (range) => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/reports/dashboard', {
        params: { from: range.from?.toISOString(), to: range.to?.toISOString() },
      });
      setMetrics(response.data.metrics || {});
      setError('');
    } catch (err) {
      console.error('Failed to load reports', err);
      setError('Unable to load reporting data');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProfitLoss = useCallback(async (range, setter = setProfitLossData) => {
    try {
      const response = await apiClient.get('/api/profit-loss', {
        params: { start: range.from?.toISOString(), end: range.to?.toISOString() },
      });
      setter(response.data || {});
      if (setter === setProfitLossData) {
        setProfitLossError('');
      }
    } catch (err) {
      console.error('Failed to load financial detail', err);
      if (setter === setProfitLossData) {
        setProfitLossError('Financial detail is temporarily unavailable');
      }
    }
  }, []);

  useEffect(() => {
    fetchDashboard(dateRange);
    fetchProfitLoss(dateRange);
  }, [dateRange, fetchDashboard, fetchProfitLoss]);

  useEffect(() => {
    if (!compareEnabled) {
      setComparisonData(null);
      return undefined;
    }
    fetchProfitLoss(previousRange, setComparisonData);
    return undefined;
  }, [compareEnabled, fetchProfitLoss, previousRange]);

  const currentTotals = useMemo(() => getFinancialValues(profitLossData), [profitLossData]);
  const previousTotals = useMemo(() => getFinancialValues(comparisonData), [comparisonData]);
  const trendRows = useMemo(() => buildTrendRows(profitLossData, grouping), [grouping, profitLossData]);
  const previousTrendRows = useMemo(() => buildTrendRows(comparisonData, grouping), [comparisonData, grouping]);
  const selectedMetric = metricOptions.find((metric) => metric.value === trendMetric) || metricOptions[0];

  const expenseCategories = useMemo(() => {
    const categoryMap = new Map();
    (profitLossData?.manualEntries || []).forEach((entry) => {
      if (entry.type === 'income') {
        return;
      }
      const category = entry.category || 'Uncategorised';
      const current = categoryMap.get(category) || { category, amount: 0, count: 0 };
      current.amount += safeNumber(entry.amount);
      current.count += 1;
      categoryMap.set(category, current);
    });
    return Array.from(categoryMap.values()).sort((a, b) => b.amount - a.amount);
  }, [profitLossData]);

  const ledgerRows = useMemo(() => [
    ...(profitLossData?.invoiceEntries || []).map((entry) => ({
      ...entry,
      id: entry.entry_id || entry._id,
      recordType: 'Income',
      signedAmount: safeNumber(entry.amount),
      sourceLabel: 'Invoice',
      reference: entry.invoice_number || entry.entry_id,
      status: entry.status || 'issued',
    })),
    ...(profitLossData?.manualEntries || []).map((entry) => ({
      ...entry,
      id: entry.entry_id || entry._id,
      recordType: 'Expense',
      signedAmount: -Math.abs(safeNumber(entry.amount)),
      sourceLabel: 'Manual',
      reference: entry.entry_id,
      status: 'Recorded',
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)), [profitLossData]);

  const kpis = useMemo(() => [
    {
      label: 'Billed revenue',
      value: formatCurrency(currentTotals.billed),
      helper: 'Invoice value issued in the period',
      delta: deltaLabel(getDelta(currentTotals.billed, compareEnabled ? previousTotals.billed : null)),
      icon: <ReceiptLong />,
      color: '#60A5FA',
    },
    {
      label: 'Cash collected',
      value: formatCurrency(currentTotals.collected),
      helper: `${formatPercent(currentTotals.billed ? currentTotals.collected / currentTotals.billed : 0)} cash conversion`,
      delta: deltaLabel(getDelta(currentTotals.collected, compareEnabled ? previousTotals.collected : null)),
      icon: <Payments />,
      color: '#5EEAD4',
    },
    {
      label: 'Net profit',
      value: formatCurrency(currentTotals.net),
      helper: `${formatPercent(currentTotals.billed ? currentTotals.net / currentTotals.billed : 0)} net margin`,
      delta: deltaLabel(getDelta(currentTotals.net, compareEnabled ? previousTotals.net : null)),
      icon: <AccountBalanceWallet />,
      color: '#A78BFA',
    },
    {
      label: 'Open balance',
      value: formatCurrency(metrics?.outstanding?.totalBalance || 0),
      helper: `${metrics?.outstanding?.invoiceCount || 0} current open invoices`,
      delta: 'Live balance, not period revenue',
      icon: <AccountBalance />,
      color: '#F59E0B',
    },
  ], [compareEnabled, currentTotals, metrics, previousTotals]);

  const handleRangeChange = (key) => {
    const option = RANGE_OPTIONS.find((item) => item.key === key);
    if (!option) {
      return;
    }
    const nextRange = cloneRange(option.getRange());
    setRangeKey(key);
    setDateRange(nextRange);
    setCustomRange(nextRange);
  };

  const applyCustomRange = () => {
    if (!customRange.from || !customRange.to || customRange.from > customRange.to) {
      return;
    }
    setRangeKey('custom');
    setDateRange(cloneRange(customRange));
  };

  const openRowsDrilldown = (title, subtitle, rows) => {
    setDrilldown({ open: true, title, subtitle, rows });
  };

  const buildRowsForBucket = (row) => {
    const inBucket = (value) => {
      const date = new Date(value);
      return date >= row.start && date <= row.end;
    };
    return [
      ...(profitLossData?.invoiceEntries || [])
        .filter((entry) => inBucket(entry.date))
        .map((entry) => ({
          ...entry,
          id: entry.entry_id,
          displayDate: entry.date,
          displayType: 'Income',
          displayAmount: safeNumber(entry.amount),
          displaySource: 'Invoice',
          displayReference: entry.invoice_number,
          displayStatus: entry.status || 'issued',
        })),
      ...(profitLossData?.manualEntries || [])
        .filter((entry) => inBucket(entry.date))
        .map((entry) => ({
          ...entry,
          id: entry.entry_id,
          displayDate: entry.date,
          displayType: 'Expense',
          displayAmount: -Math.abs(safeNumber(entry.amount)),
          displaySource: 'Manual',
          displayReference: entry.entry_id,
          displayStatus: 'Recorded',
        })),
      ...(profitLossData?.paymentEntries || [])
        .filter((payment) => inBucket(payment.payment_date))
        .map((payment) => ({
          ...payment,
          id: `payment-${payment.payment_id}`,
          displayDate: payment.payment_date,
          description: `Payment ${payment.invoice_number || payment.payment_id}`,
          category: 'Cash collection',
          displayType: 'Cash',
          displayAmount: cashMovement(payment),
          displaySource: 'Payment',
          displayReference: payment.payment_id,
          displayStatus: payment.status,
        })),
    ].sort((a, b) => new Date(b.displayDate) - new Date(a.displayDate));
  };

  const openTrendDrilldown = (row) => {
    if (!row) {
      return;
    }
    openRowsDrilldown(`${selectedMetric.label}: ${row.label}`, `Source records for ${row.label}.`, buildRowsForBucket(row));
  };

  const openCategoryDrilldown = (category) => {
    const rows = (profitLossData?.manualEntries || [])
      .filter((entry) => (entry.category || 'Uncategorised') === category)
      .map((entry) => ({
        ...entry,
        id: entry.entry_id,
        displayDate: entry.date,
        displayType: 'Expense',
        displayAmount: -Math.abs(safeNumber(entry.amount)),
        displaySource: 'Manual',
        displayReference: entry.entry_id,
        displayStatus: 'Recorded',
      }));
    openRowsDrilldown(`${category} expenses`, `${rows.length} source record${rows.length === 1 ? '' : 's'} in the selected period.`, rows);
  };

  const openLedgerDrilldown = (entry) => {
    openRowsDrilldown(`${entry.recordType}: ${entry.reference || entry.id}`, 'Source and timing details for this ledger line.', [{
      ...entry,
      displayDate: entry.date,
      displayType: entry.recordType,
      displayAmount: entry.signedAmount,
      displaySource: entry.sourceLabel,
      displayReference: entry.reference,
      displayStatus: entry.status,
    }]);
  };

  const downloadExport = async (exportFormat) => {
    setExporting(exportFormat);
    try {
      const response = await apiClient.get('/api/profit-loss/export', {
        params: { start: formatInputDate(dateRange.from), end: formatInputDate(dateRange.to), format: exportFormat },
        responseType: 'blob',
      });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `financial-${exportFormat}-${formatInputDate(dateRange.from)}-${formatInputDate(dateRange.to)}.${exportFormat === 'csv' ? 'csv' : 'xlsx'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setToast({ open: true, message: `${exportFormat.toUpperCase()} filing export downloaded`, severity: 'success' });
      setExportDialogOpen(false);
    } catch (err) {
      console.error('Failed to export financials', err);
      setToast({ open: true, message: 'Unable to export financials', severity: 'error' });
    } finally {
      setExporting('');
    }
  };

  const chartOptions = useMemo(() => ({
    chart: {
      type: 'area',
      toolbar: { show: false },
      animations: { easing: 'easeInOut', speed: 450 },
      foreColor: palette.textSecondary,
      events: { dataPointSelection: (_event, _chart, config) => openTrendDrilldown(trendRows[config.dataPointIndex]) },
    },
    colors: [selectedMetric.color, '#64748B'],
    stroke: { curve: 'smooth', width: compareEnabled ? [3, 2] : [3], dashArray: compareEnabled ? [0, 6] : [0] },
    dataLabels: { enabled: false },
    fill: { type: 'gradient', gradient: { shadeIntensity: 0.55, opacityFrom: 0.28, opacityTo: 0.03 } },
    grid: { borderColor: palette.border },
    xaxis: {
      categories: trendRows.map((row) => row.label),
      labels: { rotate: -35, style: { colors: palette.textSecondary } },
      axisBorder: { color: palette.border },
      axisTicks: { color: palette.border },
    },
    yaxis: { labels: { formatter: (value) => formatCurrency(value), style: { colors: palette.textSecondary } } },
    tooltip: { theme: 'dark', shared: true, y: { formatter: (value) => formatCurrency(value) } },
    legend: { position: 'top', labels: { colors: palette.textSecondary } },
  }), [compareEnabled, openTrendDrilldown, palette.border, palette.textSecondary, selectedMetric.color, trendRows]);

  const chartSeries = useMemo(() => {
    const currentSeries = { name: selectedMetric.label, data: trendRows.map((row) => safeNumber(row[trendMetric])) };
    if (!compareEnabled || !previousTrendRows.length) {
      return [currentSeries];
    }
    return [currentSeries, { name: 'Prior period', data: trendRows.map((_row, index) => safeNumber(previousTrendRows[index]?.[trendMetric])) }];
  }, [compareEnabled, previousTrendRows, selectedMetric.label, trendMetric, trendRows]);

  const rangeLabel = dateRange.from && dateRange.to
    ? `${format(dateRange.from, 'dd MMM yyyy')} – ${format(dateRange.to, 'dd MMM yyyy')}`
    : 'Select a date range';

  const ledgerColumns = [
    { id: 'date', label: 'Date', type: 'date', minWidth: 130, valueGetter: (row) => row.date, render: (row) => format(new Date(row.date), 'dd MMM yyyy') },
    { id: 'category', label: 'Account', minWidth: 170, render: (row) => row.category || 'Uncategorised' },
    { id: 'description', label: 'Description', minWidth: 250 },
    { id: 'signedAmount', label: 'Net amount', type: 'number', align: 'right', minWidth: 140, render: (row) => <Typography fontWeight={700} color={row.signedAmount >= 0 ? 'success.main' : 'error.main'}>{row.signedAmount >= 0 ? '+' : ''}{formatCurrency(row.signedAmount)}</Typography> },
    { id: 'sourceLabel', label: 'Source', type: 'select', options: ['Invoice', 'Manual'], minWidth: 120 },
    { id: 'reference', label: 'Reference', minWidth: 150 },
    { id: 'status', label: 'Status', minWidth: 120 },
  ];

  if (loading && !metrics) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight={320}><CircularProgress /></Box>;
  }

  if (error && !metrics) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box sx={{ background: `radial-gradient(circle at top, rgba(15,23,42,0.9), ${palette.background})`, borderRadius: 4, p: { xs: 2, md: 3 }, color: palette.textPrimary, minHeight: '100%', '& .reports-muted': { color: palette.textSecondary }, '& .MuiTable-root th': { borderBottomColor: palette.border, color: palette.textSecondary }, '& .MuiTable-root td': { borderBottomColor: palette.border, color: palette.textPrimary } }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} gap={2} mb={3}>
        <Box>
          <Typography variant="overline" sx={{ color: palette.accent, letterSpacing: '0.16em' }}>Insights / Finance</Typography>
          <Typography variant="h4" fontWeight={700}>Financial reporting</Typography>
          <Typography variant="body2" className="reports-muted">A live view of revenue, cash, costs and the source records behind them.</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="contained" startIcon={<Download />} onClick={() => setExportDialogOpen(true)} sx={{ bgcolor: palette.accent, color: '#06211F', '&:hover': { bgcolor: '#99F6E4' } }}>Export filing pack</Button>
          <Button variant="outlined" startIcon={<Refresh />} onClick={() => { fetchDashboard(dateRange); fetchProfitLoss(dateRange); }} sx={{ color: palette.textPrimary, borderColor: palette.border }}>Refresh</Button>
        </Stack>
      </Stack>

      <Card sx={{ mb: 3, background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 3 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', xl: 'row' }} spacing={2} alignItems={{ xs: 'stretch', xl: 'center' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 130 }}><Tune sx={{ color: palette.accent }} /><Box><Typography variant="subtitle2">Report controls</Typography><Typography variant="caption" className="reports-muted">{rangeLabel}</Typography></Box></Stack>
            <Box sx={{ maxWidth: '100%', overflowX: 'auto' }}><ButtonGroup variant="outlined" size="small" aria-label="Report date range">{RANGE_OPTIONS.map((option) => <Button key={option.key} onClick={() => handleRangeChange(option.key)} variant={rangeKey === option.key ? 'contained' : 'outlined'} sx={{ flex: '0 0 auto', textTransform: 'none', borderColor: palette.border, color: palette.textPrimary, bgcolor: rangeKey === option.key ? 'rgba(94,234,212,0.14)' : 'transparent' }}>{option.label}</Button>)}</ButtonGroup></Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}><TextField type="date" size="small" label="From" value={formatInputDate(customRange.from)} onChange={(event) => { setRangeKey('custom'); setCustomRange((prev) => ({ ...prev, from: parseInputDate(event.target.value) })); }} InputLabelProps={{ shrink: true }} /><TextField type="date" size="small" label="To" value={formatInputDate(customRange.to)} onChange={(event) => { setRangeKey('custom'); setCustomRange((prev) => ({ ...prev, to: parseInputDate(event.target.value, true) })); }} InputLabelProps={{ shrink: true }} /><Button size="small" variant="contained" onClick={applyCustomRange} disabled={!customRange.from || !customRange.to || customRange.from > customRange.to}>Apply</Button></Stack>
            <FormControl size="small" sx={{ minWidth: 150 }}><InputLabel>Group by</InputLabel><Select value={grouping} label="Group by" onChange={(event) => setGrouping(event.target.value)}><MenuItem value="month">Month</MenuItem><MenuItem value="week">Week</MenuItem></Select></FormControl>
            <FormControlLabel control={<Checkbox checked={compareEnabled} onChange={(event) => setCompareEnabled(event.target.checked)} />} label="Compare prior period" />
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2} mb={3}>{kpis.map((kpi) => <Grid item xs={12} sm={6} xl={3} key={kpi.label}><Card sx={{ height: '100%', background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 3 }}><CardContent><Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}><Box><Typography variant="overline" className="reports-muted">{kpi.label}</Typography><Typography variant="h5" fontWeight={700}>{kpi.value}</Typography></Box><Box sx={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 2, color: kpi.color, bgcolor: `${kpi.color}1F` }}>{kpi.icon}</Box></Stack><Typography variant="body2" className="reports-muted" mt={1}>{kpi.helper}</Typography><Typography variant="caption" sx={{ color: kpi.delta.startsWith('-') ? '#FDA4AF' : palette.accent }}>{kpi.delta}</Typography></CardContent></Card></Grid>)}</Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}><Card sx={{ height: '100%', background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 3 }}><CardHeader title="Trend explorer" subheader="Choose a metric, change the grouping, then click a point to inspect its source records." action={<FormControl size="small" sx={{ minWidth: 170 }}><InputLabel>Metric</InputLabel><Select value={trendMetric} label="Metric" onChange={(event) => setTrendMetric(event.target.value)}>{metricOptions.map((metric) => <MenuItem key={metric.value} value={metric.value}>{metric.label}</MenuItem>)}</Select></FormControl>} subheaderTypographyProps={{ sx: { color: palette.textSecondary } }} /><CardContent sx={{ pt: 0, minWidth: 0 }}>{trendRows.length ? <ReactApexChart type="area" options={chartOptions} series={chartSeries} height={340} /> : <Box className="ui-empty-state"><strong>No trend data in this range</strong><p>Once invoices, payments or expenses are recorded, the selected metric will appear here.</p></Box>}{profitLossError && <Typography variant="caption" color="warning.main">{profitLossError}; the chart may be incomplete.</Typography>}</CardContent></Card></Grid>
        <Grid item xs={12} lg={4}><Card sx={{ height: '100%', background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 3 }}><CardHeader title="What changed" subheader={compareEnabled ? 'Compared with the preceding period of the same length.' : 'Turn on comparison to see movement.'} subheaderTypographyProps={{ sx: { color: palette.textSecondary } }} /><CardContent sx={{ pt: 0 }}><Stack spacing={1.5}><Box sx={{ p: 1.5, borderRadius: 2, background: palette.panelAlt }}><Typography variant="caption" className="reports-muted">Revenue movement</Typography><Typography variant="h6">{deltaLabel(getDelta(currentTotals.billed, compareEnabled ? previousTotals.billed : null))}</Typography><Typography variant="body2" className="reports-muted">Billed revenue in the selected period.</Typography></Box><Box sx={{ p: 1.5, borderRadius: 2, background: palette.panelAlt }}><Typography variant="caption" className="reports-muted">Cash conversion</Typography><Typography variant="h6">{formatPercent(currentTotals.billed ? currentTotals.collected / currentTotals.billed : 0)}</Typography><Typography variant="body2" className="reports-muted">Collected cash divided by invoices issued.</Typography></Box><Box sx={{ p: 1.5, borderRadius: 2, background: palette.panelAlt }}><Typography variant="caption" className="reports-muted">Largest expense category</Typography><Typography variant="h6">{expenseCategories[0]?.category || 'Not recorded'}</Typography><Typography variant="body2" className="reports-muted">{expenseCategories[0] ? `${formatCurrency(expenseCategories[0].amount)} across ${expenseCategories[0].count} entries` : 'Add a manual expense to start categorising costs.'}</Typography></Box></Stack></CardContent></Card></Grid>
        <Grid item xs={12} md={5}><Card sx={{ height: '100%', background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 3 }}><CardHeader title="Expense mix" subheader="Click a category to trace every underlying entry." subheaderTypographyProps={{ sx: { color: palette.textSecondary } }} /><CardContent sx={{ pt: 0 }}>{expenseCategories.length ? <List disablePadding>{expenseCategories.slice(0, 6).map((category) => <ListItem key={category.category} disableGutters secondaryAction={<IconButton edge="end" aria-label={`Open ${category.category} expense details`} onClick={() => openCategoryDrilldown(category.category)}><OpenInNew fontSize="small" /></IconButton>} sx={{ borderBottom: `1px solid ${palette.border}`, py: 1 }}><ListItemText primary={category.category} secondary={`${category.count} entries`} /><Typography fontWeight={700} sx={{ mr: 4 }}>{formatCurrency(category.amount)}</Typography></ListItem>)}</List> : <Typography variant="body2" className="reports-muted">No manual expenses recorded in this period.</Typography>}<Divider sx={{ my: 2, borderColor: palette.border }} /><Typography variant="subtitle2">Clinic activity</Typography><Typography variant="body2" className="reports-muted" mb={1}>Operational context for the same reporting period.</Typography><Stack direction="row" spacing={2}><Box><Typography variant="h6">{metrics?.appointments?.completed || 0}</Typography><Typography variant="caption" className="reports-muted">Completed</Typography></Box><Box><Typography variant="h6">{metrics?.appointments?.scheduled || 0}</Typography><Typography variant="caption" className="reports-muted">Scheduled</Typography></Box><Box><Typography variant="h6">{metrics?.appointments?.cancelled || 0}</Typography><Typography variant="caption" className="reports-muted">Cancelled</Typography></Box></Stack></CardContent></Card></Grid>
        <Grid item xs={12} md={7}><Card sx={{ height: '100%', background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 3 }}><CardHeader title="Cash reconciliation" subheader="Invoice timing and payment timing are shown separately so the movement is explainable." subheaderTypographyProps={{ sx: { color: palette.textSecondary } }} /><CardContent sx={{ pt: 0 }}><Stack direction={{ xs: 'column', sm: 'row' }} divider={<Divider orientation="vertical" flexItem />} spacing={2}><Box flex={1}><Typography variant="caption" className="reports-muted">Invoices issued</Typography><Typography variant="h5">{formatCurrency(currentTotals.billed)}</Typography><Typography variant="body2" className="reports-muted">Accrual-style revenue</Typography></Box><Box flex={1}><Typography variant="caption" className="reports-muted">Applied/refunded payments</Typography><Typography variant="h5">{formatCurrency(currentTotals.collected)}</Typography><Typography variant="body2" className="reports-muted">Cash movement</Typography></Box><Box flex={1}><Typography variant="caption" className="reports-muted">Timing difference</Typography><Typography variant="h5">{formatCurrency(currentTotals.billed - currentTotals.collected)}</Typography><Typography variant="body2" className="reports-muted">Billed less collected</Typography></Box></Stack></CardContent></Card></Grid>
        <Grid item xs={12}><Card sx={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 3 }}><CardHeader title="Financial ledger" subheader={`${ledgerRows.length} source transaction${ledgerRows.length === 1 ? '' : 's'} · sortable and filterable · click a row for trace details`} subheaderTypographyProps={{ sx: { color: palette.textSecondary } }} /><CardContent sx={{ pt: 0 }}><DataTable columns={ledgerColumns} rows={ledgerRows} getRowId={(row) => row.id} maxHeight={600} minHeight={420} defaultOrderBy="date" defaultOrder="desc" onRowClick={openLedgerDrilldown} emptyMessage="No ledger transactions recorded for this period." /></CardContent></Card></Grid>
      </Grid>

      <Dialog open={exportDialogOpen} onClose={() => !exporting && setExportDialogOpen(false)} maxWidth="sm" fullWidth><DialogTitle>Export financial filing pack</DialogTitle><DialogContent dividers><Alert severity="info" icon={<VerifiedUser />} sx={{ mb: 2 }}>This export is generated from the selected period ({rangeLabel}) and records the period, generation time, source references and export action.</Alert><Typography variant="subtitle2" gutterBottom>Included in the XLSX filing pack</Typography><List dense disablePadding>{['Read me: scope, accounting view and privacy notes', 'Summary: income, expenses, net profit, cash collected and timing difference', 'Transactions: debit, credit, net amount, status and source IDs', 'Payments: payment method, status and cash movement', 'Monthly Summary: billed, collected, expenses, profit and collection rate', 'Audit Trail: manual-entry changes recorded in the selected period'].map((item) => <ListItem key={item} disableGutters><CheckCircleOutline sx={{ color: palette.accent, mr: 1, fontSize: 18 }} /><ListItemText primary={item} /></ListItem>)}</List><Typography variant="body2" className="reports-muted" mt={2}>Patient names and clinical details are excluded. Review the pack with your accountant before filing.</Typography></DialogContent><DialogActions sx={{ p: 2, gap: 1, flexWrap: 'wrap' }}><Button onClick={() => downloadExport('csv')} variant="outlined" startIcon={<Download />} disabled={Boolean(exporting)} sx={{ color: palette.textPrimary, borderColor: palette.border }}>{exporting === 'csv' ? 'Preparing…' : 'Download CSV ledger'}</Button><Button onClick={() => downloadExport('xlsx')} variant="contained" startIcon={<Download />} disabled={Boolean(exporting)}>{exporting === 'xlsx' ? 'Preparing…' : 'Download XLSX filing pack'}</Button></DialogActions></Dialog>

      <Dialog open={drilldown.open} onClose={() => setDrilldown((prev) => ({ ...prev, open: false }))} maxWidth="md" fullWidth><DialogTitle sx={{ pr: 6 }}>{drilldown.title}<IconButton aria-label="Close details" onClick={() => setDrilldown((prev) => ({ ...prev, open: false }))} sx={{ position: 'absolute', right: 8, top: 8 }}><Close /></IconButton></DialogTitle><DialogContent dividers><Typography variant="body2" className="reports-muted" mb={2}>{drilldown.subtitle}</Typography>{drilldown.rows.length ? <TableContainer sx={{ maxHeight: 440 }}><Table stickyHeader size="small"><TableHead><TableRow><TableCell>Date</TableCell><TableCell>Type</TableCell><TableCell>Description</TableCell><TableCell>Source / reference</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead><TableBody>{drilldown.rows.map((row) => <TableRow key={row.id} hover><TableCell>{format(new Date(row.displayDate), 'dd MMM yyyy')}</TableCell><TableCell>{row.displayType}</TableCell><TableCell>{row.description || '—'}</TableCell><TableCell>{row.displaySource} · {row.displayReference || '—'}<Typography variant="caption" display="block" className="reports-muted">{row.displayStatus}</Typography></TableCell><TableCell align="right" sx={{ color: row.displayAmount >= 0 ? 'success.main' : 'error.main', fontWeight: 700 }}>{row.displayAmount >= 0 ? '+' : ''}{formatCurrency(row.displayAmount)}</TableCell></TableRow>)}</TableBody></Table></TableContainer> : <Box className="ui-empty-state"><strong>No source records found</strong><p>The selected period or category has no underlying records.</p></Box>}{drilldown.rows.length === 1 && <Box mt={2} p={1.5} sx={{ borderRadius: 2, background: palette.panelAlt }}><Typography variant="caption" className="reports-muted">Traceability</Typography><Typography variant="body2">Source ID: {drilldown.rows[0].entry_id || drilldown.rows[0].payment_id || drilldown.rows[0].invoice_id || '—'}</Typography><Typography variant="body2">Created: {drilldown.rows[0].createdAt ? new Date(drilldown.rows[0].createdAt).toLocaleString() : '—'}</Typography><Typography variant="body2">Updated: {drilldown.rows[0].updatedAt ? new Date(drilldown.rows[0].updatedAt).toLocaleString() : '—'}</Typography></Box>}</DialogContent><DialogActions><Button onClick={() => setDrilldown((prev) => ({ ...prev, open: false }))}>Close</Button></DialogActions></Dialog>

      <Snackbar open={toast.open} autoHideDuration={4500} onClose={() => setToast((prev) => ({ ...prev, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity={toast.severity} onClose={() => setToast((prev) => ({ ...prev, open: false }))}>{toast.message}</Alert></Snackbar>
    </Box>
  );
};

export default Reports;
