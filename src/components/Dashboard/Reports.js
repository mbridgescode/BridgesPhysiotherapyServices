import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { format, endOfYear, startOfYear, subDays, subMonths } from 'date-fns';
import ReactApexChart from 'react-apexcharts';
import apiClient from '../../utils/apiClient';

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

const RANGE_OPTIONS = [
  {
    key: '30d',
    label: '30 Days',
    getRange: () => ({ from: subDays(new Date(), 30), to: new Date() }),
  },
  {
    key: '60d',
    label: '60 Days',
    getRange: () => ({ from: subDays(new Date(), 60), to: new Date() }),
  },
  {
    key: '90d',
    label: '90 Days',
    getRange: () => ({ from: subDays(new Date(), 90), to: new Date() }),
  },
  {
    key: '1y',
    label: '1 Year',
    getRange: () => ({ from: subMonths(new Date(), 12), to: new Date() }),
  },
  {
    key: 'ytd',
    label: 'Year to Date',
    getRange: () => ({ from: startOfYear(new Date()), to: new Date() }),
  },
  {
    key: 'all',
    label: 'All Time',
    getRange: () => ({ from: new Date(2010, 0, 1), to: new Date() }),
  },
];

const formatMonthLabel = (key) => {
  if (!key) {
    return 'Unknown';
  }
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) {
    return key;
  }
  return format(new Date(year, month - 1, 1), 'MMM yyyy');
};

const buildRange = (key) => {
  const preset = RANGE_OPTIONS.find((option) => option.key === key) || RANGE_OPTIONS[1];
  return preset.getRange();
};

const buildYearRange = (year) => ({
  from: startOfYear(new Date(year, 0, 1)),
  to: endOfYear(new Date(year, 0, 1)),
});

const cloneRange = (range) => ({
  from: range?.from ? new Date(range.from) : null,
  to: range?.to ? new Date(range.to) : null,
});

const formatInputDate = (value) => (value ? format(value, 'yyyy-MM-dd') : '');

const REPORTS_PALETTE = {
  background: '#050b1e',
  panel: 'rgba(10, 16, 33, 0.9)',
  panelAlt: 'rgba(11, 21, 45, 0.9)',
  border: 'rgba(148, 163, 184, 0.2)',
  textPrimary: '#f8fafc',
  textSecondary: 'rgba(241, 245, 249, 0.68)',
  accent: '#8b5cf6',
  accentMuted: 'rgba(139, 92, 246, 0.2)',
};

const deriveYearsFromRevenue = (revenue = []) => {
  const yearSet = new Set();
  revenue.forEach((entry) => {
    const year = Number(String(entry?._id || '').split('-')[0]);
    if (Number.isFinite(year)) {
      yearSet.add(year);
    }
  });
  return Array.from(yearSet).sort((a, b) => b - a);
};

const Reports = () => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const defaultRange = useMemo(() => buildRange('90d'), []);
  const [rangeKey, setRangeKey] = useState('90d');
  const [dateRange, setDateRange] = useState(() => cloneRange(defaultRange));
  const [customRangeDraft, setCustomRangeDraft] = useState(() => cloneRange(defaultRange));
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [availableYears, setAvailableYears] = useState([currentYear]);
  const [yearSelection, setYearSelection] = useState(currentYear);

  const fetchMetrics = useCallback(
    async (range) => {
      setLoading(true);
      try {
        const params = {};
        if (range.from) {
          params.from = range.from.toISOString();
        }
        if (range.to) {
          params.to = range.to.toISOString();
        }
        const response = await apiClient.get('/api/reports/dashboard', {
          params,
        });
        setMetrics(response.data.metrics);
        setError(null);
      } catch (err) {
        console.error('Failed to load reports', err);
        setError('Unable to load reporting data');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchMetrics(dateRange);
  }, [dateRange, fetchMetrics]);

  useEffect(() => {
    const years = deriveYearsFromRevenue(metrics?.revenueByMonth);
    if (years.length > 0) {
      setAvailableYears(years);
      setYearSelection((prev) => {
        if (years.includes(prev)) {
          return prev;
        }
        const nextYear = years[0];
        if (rangeKey.startsWith('year-')) {
          setRangeKey(`year-${nextYear}`);
          setDateRange(cloneRange(buildYearRange(nextYear)));
        }
        return nextYear;
      });
    } else {
      setAvailableYears([currentYear]);
      setYearSelection((prev) => {
        if (prev === currentYear) {
          return prev;
        }
        if (rangeKey.startsWith('year-')) {
          setRangeKey(`year-${currentYear}`);
          setDateRange(cloneRange(buildYearRange(currentYear)));
        }
        return currentYear;
      });
    }
  }, [metrics, currentYear, rangeKey]);

  useEffect(() => {
    if (rangeKey !== 'custom') {
      setCustomRangeDraft(cloneRange(dateRange));
    }
  }, [dateRange, rangeKey]);

  const handleRangeChange = (key) => {
    setRangeKey(key);
    setDateRange(cloneRange(buildRange(key)));
  };

  const handleYearSelect = (event) => {
    const year = Number(event.target.value);
    setYearSelection(year);
    setRangeKey(`year-${year}`);
    setDateRange(cloneRange(buildYearRange(year)));
  };

  const handleCustomRangeDraftChange = (field, value) => {
    setCustomRangeDraft((prev) => ({
      ...prev,
      [field]: value ? new Date(value) : null,
    }));
  };

  const applyCustomRange = () => {
    if (!customRangeDraft.from || !customRangeDraft.to) {
      return;
    }
    setRangeKey('custom');
    setDateRange(cloneRange(customRangeDraft));
  };

  const customRangeValid =
    Boolean(customRangeDraft.from && customRangeDraft.to) &&
    customRangeDraft.from <= customRangeDraft.to;

  const palette = REPORTS_PALETTE;
  const cardBaseSx = useMemo(
    () => ({
      height: '100%',
      background: palette.panel,
      borderRadius: 3,
      border: `1px solid ${palette.border}`,
      boxShadow: '0 25px 45px rgba(5, 8, 25, 0.45)',
      color: palette.textPrimary,
    }),
    [palette.border, palette.panel, palette.textPrimary],
  );

  const appointments = metrics?.appointments || {};
  const paymentsProcessed = metrics?.paymentsProcessed || 0;
  const revenueByMonth = metrics?.revenueByMonth || [];
  const outstanding = metrics?.outstanding || {};

  const appointmentTotals = useMemo(() => {
    const scheduled = appointments.scheduled ?? 0;
    const completed = appointments.completed ?? 0;
    const cancelledByPatient = appointments.cancelled_by_patient ?? 0;
    const cancelledByTherapist = appointments.cancelled_by_therapist ?? 0;
    const cancelledSameDay = appointments.cancelled_same_day ?? 0;
    const cancelledLegacy = appointments.cancelled_legacy ?? 0;
    const cancelled = appointments.cancelled ?? (
      cancelledByPatient + cancelledByTherapist + cancelledSameDay + cancelledLegacy
    );
    const totalCancelled = cancelledByPatient + cancelledByTherapist + cancelledSameDay + cancelledLegacy || cancelled;
    const total = scheduled + completed + totalCancelled;
    return {
      scheduled,
      completed,
      cancelled: totalCancelled,
      cancelledByPatient,
      cancelledByTherapist,
      cancelledSameDay,
      cancelledLegacy,
      total,
    };
  }, [appointments]);

  const revenueSeries = useMemo(() => {
    if (!revenueByMonth?.length) {
      return [];
    }
    return [
      {
        name: 'Billed',
        data: revenueByMonth.map((entry) => Number(entry.totalDue || 0)),
      },
      {
        name: 'Collected',
        data: revenueByMonth.map((entry) => Number(entry.totalPaid || 0)),
      },
    ];
  }, [revenueByMonth]);

  const revenueCategories = useMemo(
    () => revenueByMonth.map((entry) => formatMonthLabel(entry._id)),
    [revenueByMonth],
  );

  const revenueChartOptions = useMemo(
    () => ({
      chart: {
        type: 'area',
        toolbar: { show: false },
        animations: { easing: 'easeInOut', speed: 600 },
        foreColor: palette.textSecondary,
      },
      stroke: { curve: 'smooth', width: 3 },
      dataLabels: { enabled: false },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 0.7,
          opacityFrom: 0.4,
          opacityTo: 0.05,
        },
      },
      colors: ['#67e8f9', palette.accent],
      grid: { borderColor: palette.border },
      xaxis: {
        type: 'category',
        categories: revenueCategories,
        labels: {
          rotate: -45,
          style: { colors: palette.textSecondary },
        },
        axisBorder: { color: palette.border },
        axisTicks: { color: palette.border },
      },
      yaxis: {
        labels: {
          formatter: (val) => `£${(val || 0).toLocaleString('en-GB')}`,
          style: { colors: palette.textSecondary },
        },
      },
      tooltip: {
        theme: 'dark',
        y: {
          formatter: (value) => formatCurrency(value),
        },
      },
      legend: { position: 'top', labels: { colors: palette.textSecondary } },
    }),
    [palette.accent, palette.border, palette.textSecondary, revenueCategories],
  );

  const appointmentDonut = useMemo(
    () => ({
      options: {
        labels: [
          'Scheduled',
          'Completed',
          'Cancelled by patient',
          'Cancelled by therapist',
          'Cancelled same day',
          'Cancelled (legacy)',
        ],
        colors: ['#94a3b8', '#10b981', '#f59e0b', '#f97316', '#ef4444', '#c084fc'],
        legend: { position: 'bottom' },
        dataLabels: { enabled: false },
        stroke: { width: 2 },
      },
      series: [
        appointmentTotals.scheduled,
        appointmentTotals.completed,
        appointmentTotals.cancelledByPatient,
        appointmentTotals.cancelledByTherapist,
        appointmentTotals.cancelledSameDay,
        appointmentTotals.cancelledLegacy,
      ],
    }),
    [appointmentTotals],
  );

  const revenueTableRows = useMemo(() => {
    if (!revenueByMonth?.length) {
      return [];
    }
    let previousPaid = null;
    return revenueByMonth.map((entry) => {
      const paid = Number(entry.totalPaid || 0);
      const billed = Number(entry.totalDue || 0);
      const collectionRate = billed ? paid / billed : 0;
      const growth = previousPaid !== null ? paid - previousPaid : null;
      previousPaid = paid;
      return {
        id: entry._id,
        label: formatMonthLabel(entry._id),
        billed,
        paid,
        collectionRate,
        growth,
      };
    });
  }, [revenueByMonth]);

  const insightCards = useMemo(() => {
    const totalAppointments = appointmentTotals.total || 0;
    const completionRate = totalAppointments
      ? appointmentTotals.completed / totalAppointments
      : 0;
    const cancellationRate = totalAppointments
      ? appointmentTotals.cancelled / totalAppointments
      : 0;
    const bestMonth = revenueByMonth.reduce(
      (best, entry) => (entry.totalPaid > (best?.totalPaid || 0) ? entry : best),
      null,
    );
    const avgOutstanding = outstanding.invoiceCount
      ? (outstanding.totalBalance || 0) / outstanding.invoiceCount
      : 0;

    return [
      {
        title: 'Completion Rate',
        value: formatPercent(completionRate),
        helper: `${appointmentTotals.completed} of ${totalAppointments} appointments`,
      },
      {
        title: 'Cancellation Rate',
        value: formatPercent(cancellationRate),
        helper: `${appointmentTotals.cancelled} cancellations`,
      },
      {
        title: 'Best Month',
        value: bestMonth ? formatMonthLabel(bestMonth._id) : 'Not available',
        helper: bestMonth ? `${formatCurrency(bestMonth.totalPaid)} collected` : 'Need more data',
      },
      {
        title: 'Avg. Outstanding Invoice',
        value: formatCurrency(avgOutstanding),
        helper: `${outstanding.invoiceCount || 0} open invoices`,
      },
    ];
  }, [appointmentTotals, outstanding, revenueByMonth]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={320}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }

  const rangeLabel = `${format(dateRange.from, 'dd MMM yyyy')} - ${format(
    dateRange.to,
    'dd MMM yyyy',
  )}`;

  return (
    <Box
      sx={{
        background: `radial-gradient(circle at top, rgba(15,23,42,0.9), ${palette.background})`,
        borderRadius: 4,
        p: { xs: 2, md: 3 },
        color: palette.textPrimary,
        minHeight: '100%',
        '& .reports-card': {
          ...cardBaseSx,
        },
        '& .reports-muted': {
          color: palette.textSecondary,
        },
        '& .MuiTable-root th': {
          borderBottomColor: palette.border,
          color: palette.textSecondary,
        },
        '& .MuiTable-root td': {
          borderBottomColor: palette.border,
          color: palette.textPrimary,
        },
      }}
    >
      <Box
        mb={3}
        display="flex"
        flexWrap="wrap"
        alignItems="center"
        justifyContent="space-between"
        gap={2}
      >
        <div>
          <Typography variant="h5" fontWeight={600}>
            Reports & Insights
          </Typography>
          <Typography variant="body2" className="reports-muted">
            Showing activity from {rangeLabel}
          </Typography>
        </div>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="center">
          <ButtonGroup variant="outlined" size="small">
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option.key}
                onClick={() => handleRangeChange(option.key)}
                variant={rangeKey === option.key ? 'contained' : 'outlined'}
                sx={{
                  textTransform: 'none',
                  borderColor: palette.border,
                  color: palette.textPrimary,
                  bgcolor:
                    rangeKey === option.key ? palette.accentMuted : 'transparent',
                  '&:hover': {
                    bgcolor: palette.accentMuted,
                  },
                }}
              >
                {option.label}
              </Button>
            ))}
          </ButtonGroup>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel sx={{ color: palette.textSecondary }}>Select Year</InputLabel>
            <Select
              label="Select Year"
              value={yearSelection}
              onChange={handleYearSelect}
              sx={{
                color: palette.textPrimary,
                '.MuiOutlinedInput-notchedOutline': { borderColor: palette.border },
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    bgcolor: palette.panel,
                    color: palette.textPrimary,
                  },
                },
              }}
              displayEmpty
            >
              {availableYears.map((year) => (
                <MenuItem key={year} value={year}>
                  {year}
                </MenuItem>
              ))}
              {!availableYears.length && (
                <MenuItem value={currentYear} disabled>
                  No data yet
                </MenuItem>
              )}
            </Select>
          </FormControl>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
            <TextField
              type="date"
              size="small"
              label="From"
              value={formatInputDate(customRangeDraft.from)}
              onChange={(event) => handleCustomRangeDraftChange('from', event.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{
                minWidth: 150,
                '& .MuiInputBase-root': {
                  color: palette.textPrimary,
                },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: palette.border },
                label: { color: palette.textSecondary },
              }}
            />
            <TextField
              type="date"
              size="small"
              label="To"
              value={formatInputDate(customRangeDraft.to)}
              onChange={(event) => handleCustomRangeDraftChange('to', event.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{
                minWidth: 150,
                '& .MuiInputBase-root': {
                  color: palette.textPrimary,
                },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: palette.border },
                label: { color: palette.textSecondary },
              }}
            />
            <Button
              size="small"
              variant="contained"
              onClick={applyCustomRange}
              disabled={!customRangeValid}
              sx={{
                textTransform: 'none',
                bgcolor: palette.accent,
                '&:disabled': { bgcolor: 'rgba(255,255,255,0.1)' },
              }}
            >
              Apply
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card className="reports-card">
            <CardContent>
              <Typography variant="overline" className="reports-muted">
                Scheduled
              </Typography>
              <Typography variant="h4">{appointmentTotals.scheduled}</Typography>
              <Typography variant="body2" className="reports-muted">
                Upcoming appointments
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card className="reports-card">
            <CardContent>
              <Typography variant="overline" className="reports-muted">
                Completed
              </Typography>
              <Typography variant="h4" color="success.main">
                {appointmentTotals.completed}
              </Typography>
              <Typography variant="body2" className="reports-muted">
                {formatPercent(
                  appointmentTotals.total
                    ? appointmentTotals.completed / appointmentTotals.total
                    : 0,
                )}{' '}
                completion rate
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card className="reports-card">
            <CardContent>
              <Typography variant="overline" className="reports-muted">
                Cancelled
              </Typography>
              <Typography variant="h4" color="warning.main">
                {appointmentTotals.cancelled}
              </Typography>
              <Typography variant="body2" className="reports-muted">
                {formatPercent(
                  appointmentTotals.total
                    ? appointmentTotals.cancelled / appointmentTotals.total
                    : 0,
                )}{' '}
                cancellation rate
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card className="reports-card">
            <CardContent>
              <Typography variant="overline" className="reports-muted">
                Payments Processed
              </Typography>
              <Typography variant="h4">{formatCurrency(paymentsProcessed)}</Typography>
              <Typography variant="body2" className="reports-muted">
                Across the selected period
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card className="reports-card">
            <CardHeader title="Revenue Trends" sx={{ color: palette.textPrimary }} />
            <CardContent>
              {revenueSeries.length ? (
                <ReactApexChart
                  type="area"
                  options={revenueChartOptions}
                  series={revenueSeries}
                  height={320}
                />
              ) : (
                <Typography variant="body2" className="reports-muted">
                  Not enough revenue data for this date range.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card className="reports-card">
            <CardHeader title="Appointment Mix" sx={{ color: palette.textPrimary }} />
            <CardContent>
              {appointmentTotals.total ? (
                <ReactApexChart
                  type="donut"
                  options={appointmentDonut.options}
                  series={appointmentDonut.series}
                  height={280}
                />
              ) : (
                <Typography variant="body2" className="reports-muted">
                  No appointments recorded for this range.
                </Typography>
              )}
              <Divider sx={{ my: 2, borderColor: palette.border }} />
              <Stack spacing={1}>
                <Typography variant="body2">
                  Completion rate: <strong>{formatPercent(appointmentTotals.completed / (appointmentTotals.total || 1))}</strong>
                </Typography>
                <Typography variant="body2">
                  Cancellation rate: <strong>{formatPercent(appointmentTotals.cancelled / (appointmentTotals.total || 1))}</strong>
                </Typography>
                <Typography variant="body2" className="reports-muted">
                  Patient: {appointmentTotals.cancelledByPatient} · Therapist: {appointmentTotals.cancelledByTherapist} · Same day: {appointmentTotals.cancelledSameDay}
                </Typography>
                <Typography variant="body2">
                  Open invoices: <strong>{outstanding.invoiceCount || 0}</strong> ({formatCurrency(outstanding.totalBalance || 0)})
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={7}>
          <Card className="reports-card" sx={{ height: '100%' }}>
            <CardHeader title="Monthly Revenue Breakdown" sx={{ color: palette.textPrimary }} />
            <CardContent sx={{ pt: 0 }}>
              {revenueTableRows.length ? (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Month</TableCell>
                      <TableCell align="right">Billed</TableCell>
                      <TableCell align="right">Collected</TableCell>
                      <TableCell align="right">Collection Rate</TableCell>
                      <TableCell align="right">Delta vs Prev</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {revenueTableRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell align="right">{formatCurrency(row.billed)}</TableCell>
                        <TableCell align="right">{formatCurrency(row.paid)}</TableCell>
                        <TableCell align="right">{formatPercent(row.collectionRate)}</TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            color:
                              row.growth === null || row.growth >= 0
                                ? 'success.main'
                                : 'error.main',
                            fontWeight: 600,
                          }}
                        >
                          {row.growth === null
                            ? '--'
                            : `${row.growth >= 0 ? '+' : '-'}${formatCurrency(
                                Math.abs(row.growth),
                              )}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Typography variant="body2" className="reports-muted" sx={{ p: 2 }}>
                  No revenue history to display.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Card className="reports-card" sx={{ height: '100%' }}>
            <CardHeader title="Insight Highlights" sx={{ color: palette.textPrimary }} />
            <CardContent>
              <Stack spacing={2}>
                {insightCards.map((insight) => (
                  <Box
                    key={insight.title}
                    sx={{
                      border: '1px solid',
                      borderColor: palette.border,
                      borderRadius: 2,
                      p: 2,
                      background: palette.panelAlt,
                    }}
                  >
                    <Typography variant="overline" className="reports-muted">
                      {insight.title}
                    </Typography>
                    <Typography variant="h5" fontWeight={600}>
                      {insight.value}
                    </Typography>
                    <Typography variant="body2" className="reports-muted">
                      {insight.helper}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Reports;
