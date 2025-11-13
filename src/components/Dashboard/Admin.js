// src/components/Dashboard/Admin.js
import React, { useEffect, useState, useContext, useMemo } from 'react';
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
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
  Tooltip,
  IconButton,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import apiClient from '../../utils/apiClient';
import { UserContext } from '../../context/UserContext';
import DataTable from '../common/DataTable';

const roles = [
  { value: 'admin', label: 'Administrator' },
  { value: 'therapist', label: 'Therapist' },
  { value: 'receptionist', label: 'Reception' },
];

const defaultForm = {
  username: '',
  email: '',
  password: '',
  role: 'therapist',
  administrator: false,
};

const createEmptyEditValues = () => ({
  username: '',
  email: '',
  role: 'therapist',
  administrator: false,
  active: true,
  employeeID: '',
});

const createInitialEditDialogState = () => ({
  open: false,
  userId: null,
  values: createEmptyEditValues(),
  lastNonAdminRole: 'therapist',
  error: '',
});

const MIN_PASSWORD_LENGTH = 8;

const Admin = () => {
  const { userData } = useContext(UserContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formState, setFormState] = useState(defaultForm);
  const [creating, setCreating] = useState(false);
  const [savingUserId, setSavingUserId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [lastNonAdminRole, setLastNonAdminRole] = useState(defaultForm.role);
  const [editDialog, setEditDialog] = useState(createInitialEditDialogState());

  const isAdmin = userData?.role === 'admin';

  const maskedUsers = useMemo(
    () =>
      users.map((user) => ({
        ...user,
        password: undefined,
      })),
    [users],
  );

  const loadUsers = async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.get('/api/users');
      setUsers(response.data.users || []);
      setError(null);
    } catch (err) {
      console.error('Failed to load users', err);
      setError('Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin === undefined) {
      return;
    }
    loadUsers();
  }, [isAdmin]);

  const handleFormChange = (field) => (event) => {
    if (field === 'administrator') {
      const checked = event.target.checked;
      setFormState((prev) => ({
        ...prev,
        administrator: checked,
        role: checked
          ? 'admin'
          : prev.role === 'admin'
            ? lastNonAdminRole
            : prev.role,
      }));
      return;
    }

    if (field === 'role') {
      const value = event.target.value;
      if (value !== 'admin') {
        setLastNonAdminRole(value);
      }
      setFormState((prev) => ({
        ...prev,
        role: value,
        administrator: value === 'admin',
      }));
      return;
    }

    const value = event.target.value;
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    const trimmedUsername = formState.username?.trim();
    const trimmedEmail = formState.email?.trim();
    if (!trimmedUsername || !formState.password) {
      setError('Username and password are required.');
      return;
    }
    if (!trimmedEmail) {
      setError('Email is required.');
      return;
    }
    if (formState.password.length < MIN_PASSWORD_LENGTH) {
      setError(`Temporary password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await apiClient.post('/auth/register', {
        username: trimmedUsername,
        email: trimmedEmail,
        password: formState.password,
        role: formState.role,
        administrator: formState.administrator,
      });
      setFormState(defaultForm);
      setLastNonAdminRole(defaultForm.role);
      await loadUsers();
    } catch (err) {
      console.error('Failed to create user', err);
      setError(err?.response?.data?.message || 'Unable to create user.');
    } finally {
      setCreating(false);
    }
  };

  const handleUserUpdate = async (userId, payload) => {
    setError(null);
    setSavingUserId(userId);
    try {
      const response = await apiClient.patch(`/api/users/${userId}`, payload);
      await loadUsers();
      return { success: true, user: response.data?.user };
    } catch (err) {
      console.error('Failed to update user', err);
      const message = err?.response?.data?.message || 'Unable to update user.';
      setError(message);
      return { success: false, message };
    } finally {
      setSavingUserId(null);
    }
  };

  const handleRoleChange = (userId, value) => {
    handleUserUpdate(userId, { role: value, administrator: value === 'admin' });
  };

  const handleActiveToggle = (userId, current) => {
    handleUserUpdate(userId, { active: !current });
  };

  const handleDeleteUser = async (userId, username) => {
    if (userId === userData?.id) {
      setError('You cannot delete your own account.');
      return;
    }
    const confirmed = window.confirm(`Delete user "${username}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setDeletingUserId(userId);
    setError(null);
    try {
      await apiClient.delete(`/api/users/${userId}`);
      await loadUsers();
    } catch (err) {
      console.error('Failed to delete user', err);
      setError(err?.response?.data?.message || 'Unable to delete user.');
    } finally {
      setDeletingUserId(null);
    }
  };

  const closeEditDialog = () => {
    setEditDialog(createInitialEditDialogState());
  };

  const openEditUserDialog = (user) => {
    if (!user) {
      return;
    }
    setEditDialog({
      open: true,
      userId: user.id,
      values: {
        username: user.username || '',
        email: user.email || '',
        role: user.role || 'therapist',
        administrator: user.role === 'admin' || Boolean(user.administrator),
        active: user.active !== false,
        employeeID: user.employeeID ?? '',
      },
      lastNonAdminRole: user.role && user.role !== 'admin' ? user.role : 'therapist',
      error: '',
    });
  };

  const handleEditInputChange = (field) => (event) => {
    const value = event.target.value;
    setEditDialog((prev) => ({
      ...prev,
      values: {
        ...prev.values,
        [field]: value,
      },
      error: '',
    }));
  };

  const handleEditRoleChange = (event) => {
    const value = event.target.value;
    setEditDialog((prev) => ({
      ...prev,
      values: {
        ...prev.values,
        role: value,
        administrator: value === 'admin',
      },
      lastNonAdminRole: value !== 'admin' ? value : prev.lastNonAdminRole,
      error: '',
    }));
  };

  const handleEditAdministratorToggle = (event) => {
    const checked = event.target.checked;
    setEditDialog((prev) => {
      const fallbackRole = prev.lastNonAdminRole || 'therapist';
      return {
        ...prev,
        values: {
          ...prev.values,
          administrator: checked,
          role: checked
            ? 'admin'
            : prev.values.role === 'admin'
              ? fallbackRole
              : prev.values.role,
        },
        error: '',
      };
    });
  };

  const handleEditActiveToggle = (event) => {
    const checked = event.target.checked;
    setEditDialog((prev) => ({
      ...prev,
      values: {
        ...prev.values,
        active: checked,
      },
      error: '',
    }));
  };

  const handleSaveEditedUser = async () => {
    if (!editDialog.userId) {
      return;
    }
    const trimmedUsername = editDialog.values.username.trim();
    if (!trimmedUsername) {
      setEditDialog((prev) => ({ ...prev, error: 'Username is required.' }));
      return;
    }
    const trimmedEmail = editDialog.values.email?.trim() || '';

    const employeeIdInput = editDialog.values.employeeID;
    let normalizedEmployeeId = null;
    if (employeeIdInput !== '' && employeeIdInput !== null && employeeIdInput !== undefined) {
      const parsed = Number(employeeIdInput);
      if (Number.isNaN(parsed)) {
        setEditDialog((prev) => ({ ...prev, error: 'Employee ID must be numeric.' }));
        return;
      }
      normalizedEmployeeId = parsed;
    }

    const payload = {
      username: trimmedUsername,
      email: trimmedEmail,
      employeeID: normalizedEmployeeId,
      role: editDialog.values.role,
      administrator: editDialog.values.administrator,
      active: editDialog.values.active,
    };

    const result = await handleUserUpdate(editDialog.userId, payload);
    if (result?.success) {
      closeEditDialog();
    } else {
      setEditDialog((prev) => ({
        ...prev,
        error: result?.message || 'Unable to update user.',
      }));
    }
  };

  const userColumns = [
    {
      id: 'username',
      label: 'Name',
      minWidth: 160,
    },
    {
      id: 'email',
      label: 'Email',
      minWidth: 210,
      render: (row) => row.email || 'N/A',
    },
    {
      id: 'role',
      label: 'Role',
      type: 'select',
      options: roles,
      minWidth: 140,
      valueGetter: (row) => row.role,
      render: (row) => (
        <Select
          size="small"
          value={row.role}
          onChange={(event) => handleRoleChange(row.id, event.target.value)}
          disabled={savingUserId === row.id}
        >
          {roles.map((role) => (
            <MenuItem key={role.value} value={role.value}>
              {role.label}
            </MenuItem>
          ))}
        </Select>
      ),
    },
    {
      id: 'employeeID',
      label: 'Employee ID',
      minWidth: 130,
      render: (row) => row.employeeID || 'N/A',
    },
    {
      id: 'administrator',
      label: 'Administrator',
      type: 'boolean',
      minWidth: 150,
      valueGetter: (row) => row.administrator,
      render: (row) => (row.administrator ? 'Yes' : 'No'),
    },
    {
      id: 'active',
      label: 'Active',
      type: 'boolean',
      minWidth: 110,
      valueGetter: (row) => row.active,
      render: (row) => (
        <Switch
          checked={row.active}
          onChange={() => handleActiveToggle(row.id, row.active)}
          color="primary"
          disabled={savingUserId === row.id}
        />
      ),
    },
    {
      id: 'lastLoginAt',
      label: 'Last Login',
      type: 'date',
      minWidth: 180,
      valueGetter: (row) => row.lastLoginAt || '',
      render: (row) =>
        row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : 'Never',
    },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      sortable: false,
      filterable: false,
      minWidth: 120,
      render: (row) => (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Tooltip title="Edit user">
            <span>
              <IconButton
                size="small"
                onClick={() => openEditUserDialog(row)}
                disabled={savingUserId === row.id}
              >
                <EditIcon fontSize="inherit" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Delete user">
            <span>
              <IconButton
                size="small"
                color="error"
                disabled={
                  deletingUserId === row.id
                  || savingUserId === row.id
                  || row.id === userData?.id
                }
                onClick={() => handleDeleteUser(row.id, row.username)}
              >
                <DeleteIcon fontSize="inherit" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ),
    },
  ];

  if (!isAdmin) {
    return (
      <Typography>
        You need administrator privileges to manage users.
      </Typography>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap={3}>
      <Card>
        <CardContent>
          <Box
            component="form"
            onSubmit={handleCreateUser}
            display="flex"
            flexDirection="column"
            gap={2}
            autoComplete="off"
          >
            <Typography variant="h5">Invite User</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Username"
                  name="inviteUsername"
                  value={formState.username}
                  onChange={handleFormChange('username')}
                  fullWidth
                  required
                  autoComplete="off"
                  inputProps={{ autoComplete: 'off' }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Email"
                  type="email"
                  name="inviteEmail"
                  value={formState.email}
                  onChange={handleFormChange('email')}
                  fullWidth
                  required
                  autoComplete="off"
                  inputProps={{ autoComplete: 'off' }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Temporary Password"
                  type="password"
                  name="inviteTemporaryPassword"
                  value={formState.password}
                  onChange={handleFormChange('password')}
                  fullWidth
                  required
                  helperText={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
                  autoComplete="new-password"
                  inputProps={{
                    minLength: MIN_PASSWORD_LENGTH,
                    autoComplete: 'new-password',
                  }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Employee ID"
                  value="Auto-assigned"
                  fullWidth
                  disabled
                  helperText="New users receive the next available ID automatically"
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel id="role-label">Role</InputLabel>
                  <Select
                    labelId="role-label"
                    label="Role"
                    value={formState.role}
                    onChange={handleFormChange('role')}
                  >
                    {roles.map((role) => (
                      <MenuItem key={role.value} value={role.value}>
                        {role.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3} display="flex" alignItems="center">
                <FormControlLabel
                  control={(
                    <Switch
                      checked={formState.administrator}
                      onChange={handleFormChange('administrator')}
                    />
                  )}
                  label="Full Administrator"
                />
              </Grid>
            </Grid>
            <Box display="flex" gap={2} alignItems="center">
              <Button
                type="submit"
                variant="contained"
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Create User'}
              </Button>
              {error && (
                <Typography color="error" variant="body2">
                  {error}
                </Typography>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h5">User Directory</Typography>
            <Tooltip title="Refresh">
              <IconButton onClick={loadUsers} disabled={loading}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
          {loading ? (
            <CircularProgress />
          ) : (
            <DataTable
              columns={userColumns}
              rows={maskedUsers}
              getRowId={(row) => row.id}
              maxHeight={520}
              emptyMessage="No users found."
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialog.open} onClose={closeEditDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Username"
                value={editDialog.values.username}
                onChange={handleEditInputChange('username')}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Email"
                type="email"
                value={editDialog.values.email}
                onChange={handleEditInputChange('email')}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel id="edit-role-label">Role</InputLabel>
                <Select
                  labelId="edit-role-label"
                  label="Role"
                  value={editDialog.values.role}
                  onChange={handleEditRoleChange}
                >
                  {roles.map((role) => (
                    <MenuItem key={role.value} value={role.value}>
                      {role.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Employee ID"
                value={editDialog.values.employeeID}
                onChange={handleEditInputChange('employeeID')}
                fullWidth
                helperText="Optional"
              />
            </Grid>
            <Grid item xs={12} md={6} display="flex" alignItems="center">
              <FormControlLabel
                control={(
                  <Switch
                    checked={editDialog.values.active}
                    onChange={handleEditActiveToggle}
                  />
                )}
                label="Active"
              />
            </Grid>
            <Grid item xs={12} md={6} display="flex" alignItems="center">
              <FormControlLabel
                control={(
                  <Switch
                    checked={editDialog.values.administrator}
                    onChange={handleEditAdministratorToggle}
                  />
                )}
                label="Full Administrator"
              />
            </Grid>
          </Grid>
          {editDialog.error && (
            <Typography color="error" variant="body2" sx={{ mt: 2 }}>
              {editDialog.error}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={closeEditDialog}
            disabled={savingUserId === editDialog.userId}
            sx={{ color: '#fff' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveEditedUser}
            variant="contained"
            disabled={savingUserId === editDialog.userId}
          >
            {savingUserId === editDialog.userId ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Admin;

