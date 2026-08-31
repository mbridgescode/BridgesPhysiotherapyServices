import React from 'react';
import { Button, Dialog } from '../../ui';

const formatDateTime = (dateTime) => {
  const date = new Date(dateTime);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const formatStatus = (status = 'scheduled') => status
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDuration = (minutes) => {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) {
    return '60 minutes';
  }
  if (value % 60 === 0) {
    return `${value / 60} hour${value === 60 ? '' : 's'}`;
  }
  return `${value} minutes`;
};

const CustomPopup = ({ appointment, onClose }) => {
  if (!appointment) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={appointment.title}
      description="Appointment details"
      actions={<Button variant="ghost" type="button" onClick={onClose}>Close</Button>}
    >
      <div><strong>Status:</strong> {formatStatus(appointment.status)}</div>
      <div><strong>Treatment:</strong> {appointment.treatment || 'Appointment'}</div>
      <div><strong>When:</strong> {formatDateTime(appointment.start)}</div>
      <div><strong>Duration:</strong> {formatDuration(appointment.durationMinutes)}</div>
      <div><strong>Where:</strong> {appointment.location}</div>
      <div><strong>Phone number:</strong> {appointment.phone}</div>
      <div><strong>Email:</strong> {appointment.email}</div>
      <div><strong>Notes:</strong> {appointment.body}</div>
    </Dialog>
  );
};

export default CustomPopup;
