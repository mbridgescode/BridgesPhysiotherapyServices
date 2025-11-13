// src/components/common/DataTable.js
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Box,
  CircularProgress,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
  Card,
  CardContent,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

const defaultGetValue = (row, column) => {
  if (column?.valueGetter) {
    return column.valueGetter(row);
  }
  if (!column?.id) {
    return undefined;
  }
  return row?.[column.id];
};

const formatCellValue = (value, column) => {
  if (column?.format) {
    return column.format(value, column);
  }

  if (value === null || value === undefined || value === '') {
    return column?.emptyDisplay ?? '--';
  }

  if (column?.type === 'date') {
    const asDate = new Date(value);
    if (!Number.isNaN(asDate.getTime())) {
      return asDate.toLocaleString();
    }
  }

  if (column?.type === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  return value;
};

const defaultSortComparator = (valueA, valueB, column) => {
  const type = column?.type || 'text';

  if (valueA === valueB) {
    return 0;
  }

  if (valueA === undefined || valueA === null || valueA === '') {
    return -1;
  }
  if (valueB === undefined || valueB === null || valueB === '') {
    return 1;
  }

  if (type === 'number') {
    return Number(valueA) - Number(valueB);
  }

  if (type === 'date') {
    return new Date(valueA).getTime() - new Date(valueB).getTime();
  }

  const stringA = String(valueA).toLowerCase();
  const stringB = String(valueB).toLowerCase();
  return stringA.localeCompare(stringB);
};

const stableSort = (array, comparator) => {
  const stabilized = array.map((el, index) => [el, index]);
  stabilized.sort((a, b) => {
    const order = comparator(a[0], b[0]);
    if (order !== 0) {
      return order;
    }
    return a[1] - b[1];
  });
  return stabilized.map((el) => el[0]);
};

const responsiveMinWidth = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'number') {
    return { xs: 0, lg: value };
  }
  return { xs: 0, lg: value };
};

const booleanOptions = [
  { label: 'All', value: '' },
  { label: 'Yes', value: 'true' },
  { label: 'No', value: 'false' },
];

const renderFilterControl = (column, value, onChange) => {
  if (column.filterable === false) {
    return null;
  }

  if (column.renderFilter) {
    return column.renderFilter({
      value,
      onChange,
    });
  }

  switch (column.type) {
    case 'select': {
      const options = column.options || [];
      return (
        <TextField
          select
          size="small"
          fullWidth
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="All"
        >
          <MenuItem value="">All</MenuItem>
          {options.map((option) => {
            const optionValue = option?.value ?? option;
            const label = option?.label ?? optionValue;
            return (
              <MenuItem key={optionValue} value={optionValue}>
                {label}
              </MenuItem>
            );
          })}
        </TextField>
      );
    }
    case 'boolean':
      return (
        <TextField
          select
          size="small"
          fullWidth
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {booleanOptions.map((option) => (
            <MenuItem key={option.value || 'all'} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      );
    case 'date':
      return (
        <TextField
          type="date"
          size="small"
          fullWidth
          value={value}
          onChange={(event) => onChange(event.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      );
    case 'number':
      return (
        <TextField
          type="number"
          size="small"
          fullWidth
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    default:
      return (
        <TextField
          size="small"
          fullWidth
          value={value}
          placeholder="Filter..."
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
};

const defaultGetRowId = (row, index) => row?.id ?? row?._id ?? row?.appointment_id ?? row?.patient_id ?? index;

const matchesFilter = (value, filterValue, column) => {
  if (column?.filterable === false) {
    return true;
  }

  if (filterValue === undefined || filterValue === null || filterValue === '') {
    return true;
  }

  if (column?.filterPredicate) {
    return column.filterPredicate(value, filterValue, column);
  }

  const type = column?.type || 'text';

  if (type === 'select') {
    return String(value ?? '') === String(filterValue);
  }

  if (type === 'boolean') {
    const boolValue = value === true || value === 'true' || value === 1;
    if (filterValue === 'true') {
      return boolValue;
    }
    if (filterValue === 'false') {
      return !boolValue;
    }
    return true;
  }

  if (type === 'date') {
    if (!value) {
      return false;
    }
    const asDate = new Date(value);
    if (Number.isNaN(asDate.getTime())) {
      return false;
    }
    return asDate.toISOString().slice(0, 10) === filterValue;
  }

  if (type === 'number') {
    const numericFilter = Number(filterValue);
    if (Number.isNaN(numericFilter)) {
      return String(value ?? '').toLowerCase().includes(String(filterValue).toLowerCase());
    }
    return Number(value ?? 0) === numericFilter;
  }

  return String(value ?? '').toLowerCase().includes(String(filterValue).toLowerCase());
};

const DataTable = ({
  columns = [],
  rows = [],
  getRowId = defaultGetRowId,
  loading = false,
  emptyMessage = 'No records found.',
  maxHeight,
  minHeight = 640,
  dense = false,
  containerComponent = 'div',
  containerSx,
  tableSx,
  stickyHeader = true,
  defaultOrderBy,
  defaultOrder = 'asc',
  renderMobileCard,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isCondensedTable = useMediaQuery(theme.breakpoints.down('lg'));
  const columnCount = columns.length || 1;
  const condensedColumnWidth = `${(100 / columnCount).toFixed(3)}%`;
  const sortableFallback = useMemo(
    () => columns.find((column) => column.sortable !== false)?.id ?? columns[0]?.id ?? '',
    [columns],
  );
  const resolvedInitialOrderBy = useMemo(() => {
    if (defaultOrderBy && columns.some((column) => column.id === defaultOrderBy && column.sortable !== false)) {
      return defaultOrderBy;
    }
    return sortableFallback;
  }, [columns, defaultOrderBy, sortableFallback]);

  const [orderBy, setOrderBy] = useState(resolvedInitialOrderBy);
  const [order, setOrder] = useState(defaultOrder === 'desc' ? 'desc' : 'asc');
  const [filters, setFilters] = useState({});

  useEffect(() => {
    setOrderBy((prev) => {
      if (prev && columns.some((column) => column.id === prev && column.sortable !== false)) {
        return prev;
      }
      return resolvedInitialOrderBy;
    });
  }, [columns, resolvedInitialOrderBy]);

  useEffect(() => {
    setOrder(defaultOrder === 'desc' ? 'desc' : 'asc');
  }, [defaultOrder]);

  useEffect(() => {
    setFilters((prev) => {
      const next = {};
      columns.forEach((column) => {
        if (column.filterable === false) {
          return;
        }
        next[column.id] = prev[column.id] ?? '';
      });
      return next;
    });
  }, [columns]);

  const columnMap = useMemo(() => {
    const map = new Map();
    columns.forEach((column) => {
      map.set(column.id, column);
    });
    return map;
  }, [columns]);

  const filteredRows = useMemo(() => {
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.filter((row) =>
      columns.every((column) => {
        if (column.filterable === false) {
          return true;
        }
        const filterValue = filters[column.id];
        const value = defaultGetValue(row, column);
        return matchesFilter(value, filterValue, column);
      }),
    );
  }, [rows, columns, filters]);

  const sortedRows = useMemo(() => {
    if (!orderBy) {
      return filteredRows;
    }
    const column = columnMap.get(orderBy);
    if (!column || column.sortable === false) {
      return filteredRows;
    }

    return stableSort(filteredRows, (a, b) => {
      const valueA = defaultGetValue(a, column);
      const valueB = defaultGetValue(b, column);
      const comparator = column.sortComparator || defaultSortComparator;
      const comparison = comparator(valueA, valueB, column, a, b);
      return order === 'desc' ? -comparison : comparison;
    });
  }, [filteredRows, order, orderBy, columnMap]);

  const handleRequestSort = (columnId, sortable) => {
    if (sortable === false) {
      return;
    }
    if (orderBy === columnId) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrder('asc');
      setOrderBy(columnId);
    }
  };

  const handleFilterChange = (columnId, value) => {
    setFilters((prev) => ({
      ...prev,
      [columnId]: value,
    }));
  };

  const resolvedMinHeightValue =
    typeof minHeight === 'number' ? Math.max(minHeight, 420) : minHeight;
  const resolvedMinHeight =
    typeof resolvedMinHeightValue === 'number'
      ? `${resolvedMinHeightValue}px`
      : resolvedMinHeightValue;
  const resolvedMaxHeight = (() => {
    if (maxHeight === undefined || maxHeight === null) {
      return '82vh';
    }
    if (typeof maxHeight === 'number') {
      const minHeightNumber =
        typeof resolvedMinHeightValue === 'number' ? resolvedMinHeightValue : 560;
      return `${Math.max(maxHeight, minHeightNumber)}px`;
    }
    return maxHeight;
  })();

  const containerRef = useRef(null);
  const [autoHeight, setAutoHeight] = useState(null);
  const shouldAutoSize = maxHeight === undefined || maxHeight === null;
  const totalRowCount = Array.isArray(rows) ? rows.length : 0;

  const updateAutoHeight = useCallback(() => {
    if (!shouldAutoSize || !containerRef.current) {
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const verticalPadding = 32;
    const nextHeight = Math.max(viewportHeight - rect.top - verticalPadding, 360);
    setAutoHeight(nextHeight);
  }, [shouldAutoSize]);

  useLayoutEffect(() => {
    if (!shouldAutoSize) {
      return undefined;
    }
    updateAutoHeight();
    window.addEventListener('resize', updateAutoHeight);
    window.addEventListener('orientationchange', updateAutoHeight);
    return () => {
      window.removeEventListener('resize', updateAutoHeight);
      window.removeEventListener('orientationchange', updateAutoHeight);
    };
  }, [shouldAutoSize, updateAutoHeight]);

  useEffect(() => {
    if (!shouldAutoSize) {
      return;
    }
    updateAutoHeight();
  }, [totalRowCount, shouldAutoSize, updateAutoHeight]);

  const computedAutoHeight = shouldAutoSize && autoHeight ? `${autoHeight}px` : null;
  const minHeightNumber =
    typeof resolvedMinHeightValue === 'number' ? resolvedMinHeightValue : 420;
  const computedMinHeight = shouldAutoSize && autoHeight
    ? `${Math.min(autoHeight, minHeightNumber)}px`
    : resolvedMinHeight;
  const computedMaxHeight = shouldAutoSize && autoHeight
    ? computedAutoHeight
    : resolvedMaxHeight;
  const computedHeight = shouldAutoSize && autoHeight ? computedAutoHeight : undefined;

  if (isMobile) {
    if (loading) {
      return (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            py: 4,
            ...containerSx,
          }}
        >
          <CircularProgress size={24} />
        </Box>
      );
    }
    if (sortedRows.length === 0) {
      return (
        <Typography align="center" variant="body2" color="text.secondary" sx={{ py: 3 }}>
          {emptyMessage}
        </Typography>
      );
    }
    return (
      <Box display="flex" flexDirection="column" gap={2} sx={containerSx}>
        {sortedRows.map((row, index) => {
          const rowId = getRowId(row, index);
          if (typeof renderMobileCard === 'function') {
            return (
              <React.Fragment key={rowId}>
                {renderMobileCard(row, { columns, index, rowId })}
              </React.Fragment>
            );
          }
          return (
            <Card key={rowId} variant="outlined" sx={{ backgroundColor: 'rgba(15,17,30,0.55)' }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {columns
                  .filter((column) => column?.id && column.label && column.hideOnMobile !== true)
                  .map((column) => {
                    const value = defaultGetValue(row, column);
                    const cellContent = column.render
                      ? column.render(row, { value, column })
                      : formatCellValue(value, column);
                    return (
                      <Box key={`${rowId}-${column.id}`}>
                        <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.05em' }}>
                          {column.label}
                        </Typography>
                        <Box>{cellContent}</Box>
                      </Box>
                    );
                  })}
              </CardContent>
            </Card>
          );
        })}
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>
      <TableContainer
        ref={containerRef}
        component={containerComponent}
        sx={{
          width: '100%',
          maxWidth: '100%',
          flex: 1,
          height: computedHeight,
          maxHeight: computedMaxHeight,
          minHeight: computedMinHeight,
          overflowX: 'auto',
          overflowY: 'auto',
          borderRadius: 2,
          border: '1px solid rgba(148, 163, 184, 0.12)',
          backgroundColor: 'rgba(15,17,30,0.65)',
          ...containerSx,
        }}
      >
        <Table
          stickyHeader={stickyHeader}
          size={dense ? 'small' : 'medium'}
          sx={{
            width: '100%',
            minWidth: 0,
            tableLayout: isCondensedTable ? 'fixed' : 'auto',
            ...tableSx,
          }}
        >
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  align={column.align}
                  sx={{
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    minWidth: isCondensedTable ? 0 : responsiveMinWidth(column.minWidth),
                    width: isCondensedTable ? column.condensedWidth || condensedColumnWidth : column.width,
                    whiteSpace: column.wrap === false ? 'nowrap' : 'normal',
                    wordBreak: column.wrap === false ? 'normal' : 'break-word',
                    ...column.headerSx,
                  }}
                >
                  {column.sortable === false ? (
                    column.label
                  ) : (
                    <TableSortLabel
                      active={orderBy === column.id}
                      direction={orderBy === column.id ? order : 'asc'}
                      onClick={() => handleRequestSort(column.id, column.sortable)}
                    >
                      {column.label}
                    </TableSortLabel>
                  )}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={`${column.id}-filter`}
                  align={column.align}
                  sx={{
                    backgroundColor: 'rgba(11,15,25,0.8)',
                    minWidth: isCondensedTable ? 0 : responsiveMinWidth(column.minWidth),
                    width: isCondensedTable ? column.condensedWidth || condensedColumnWidth : column.width,
                  }}
                >
                  {renderFilterControl(column, filters[column.id] ?? '', (value) => handleFilterChange(column.id, value))}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <Typography align="center" variant="body2" color="text.secondary" sx={{ py: 3 }}>
                    {emptyMessage}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row, index) => {
                const rowId = getRowId(row, index);
                return (
                  <TableRow hover key={rowId}>
                    {columns.map((column) => {
                      const value = defaultGetValue(row, column);
                      return (
                        <TableCell
                          key={`${rowId}-${column.id}`}
                          align={column.align}
                          sx={{
                            verticalAlign: 'top',
                            minWidth: isCondensedTable ? 0 : responsiveMinWidth(column.minWidth),
                            width: isCondensedTable ? column.condensedWidth || condensedColumnWidth : column.width,
                            whiteSpace: column.wrap === false ? 'nowrap' : 'normal',
                            wordBreak: column.wrap === false ? 'normal' : 'break-word',
                            ...column.cellSx,
                          }}
                        >
                          {column.render ? column.render(row, { value, column }) : formatCellValue(value, column)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {loading && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(6, 8, 18, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 2,
          }}
        >
          <CircularProgress size={28} />
        </Box>
      )}
    </Box>
  );
};

export default DataTable;
