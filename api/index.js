const app = require('../server/app');
const { connectToDatabase } = require('../server/database');

module.exports = async (req, res) => {
  try {
    await connectToDatabase();
    return app(req, res);
  } catch (error) {
    console.error('API handler error', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
