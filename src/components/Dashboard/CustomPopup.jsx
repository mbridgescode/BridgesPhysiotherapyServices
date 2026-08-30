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
      <div><strong>When:</strong> {formatDateTime(appointment.start)}</div>
      <div><strong>Where:</strong> {appointment.location}</div>
      <div><strong>Phone number:</strong> {appointment.phone}</div>
      <div><strong>Email:</strong> {appointment.email}</div>
      <div><strong>Notes:</strong> {appointment.body}</div>
    </Dialog>
  );
};

export default CustomPopup;
