const app = require('../server/app');
const { connectToDatabase } = require('../server/database');

const stripApiPrefix = (url = '') => url.replace(/^\/api(\/|$)/, '/');

module.exports = async (req, res) => {
  try {
    await connectToDatabase();
    req.url = stripApiPrefix(req.url) || '/';
    return app(req, res);
  } catch (error) {
    console.error('API handler error', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
