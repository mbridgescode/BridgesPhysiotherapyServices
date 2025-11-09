const { host, port } = require('./src/config/env');
const app = require('./server/app');
const { connectToDatabase } = require('./server/database');

const startServer = async () => {
  try {
    await connectToDatabase();
    app.listen(port, host, () => {
      console.log(`Server listening on http://${host}:${port}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

startServer();
