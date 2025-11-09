const mongoose = require('mongoose');
const { mongoUri } = require('../src/config/env');

let cachedConnection = null;

const connectToDatabase = async () => {
  if (!cachedConnection) {
    cachedConnection = mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    }).then((connection) => {
      console.log('MongoDB connected');
      return connection;
    });
  }

  return cachedConnection;
};

module.exports = {
  connectToDatabase,
};
