import React from 'react';
import { Box, Typography, Button, Modal } from '@mui/material';
import { makeStyles } from '@mui/styles';

const useStyles = makeStyles((theme) => ({
  modal: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paper: {
    backgroundColor: theme.palette.background.paper,
    border: '2px solid #000',
    boxShadow: theme.shadows[5],
    padding: theme.spacing(2, 4, 3),
  },
}));

const formatDateTime = (dateTime) => {
  const date = new Date(dateTime);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-indexed
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const CustomPopup = ({ appointment, onClose }) => {
  const classes = useStyles();

  if (!appointment) {
    return null;
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      className={classes.modal}
    >
      <Box className={classes.paper}>
        <Typography variant="h6" component="h2">
          {appointment.title}
        </Typography>
        <Typography sx={{ mt: 2 }}>
          <strong>When:</strong> {formatDateTime(appointment.start)}
        </Typography>
        <Typography sx={{ mt: 2 }}>
          <strong>Where:</strong> {appointment.location}
        </Typography>
        <Typography sx={{ mt: 2 }}>
          <strong>Phone Number:</strong> {appointment.phone}
        </Typography>
        <Typography sx={{ mt: 2 }}>
          <strong>Email:</strong> {appointment.email}
        </Typography>
        <Typography sx={{ mt: 2 }}>
          <strong>Notes:</strong> {appointment.body}
        </Typography>
        <Button onClick={onClose} sx={{ mt: 2 }}>
          Close
        </Button>
      </Box>
    </Modal>
  );
};

export default CustomPopup;