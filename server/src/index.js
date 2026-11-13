const mongoose = require('mongoose');
const cfg = require('./config');
const { createApp } = require('./app');
const { seedHandlers, drainWaiting } = require('./services/workflow');

(async () => {
  try {
    await mongoose.connect(cfg.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    await seedHandlers();
    await drainWaiting();
    createApp().listen(cfg.PORT, () => console.log(`API running on http://localhost:${cfg.PORT}`));
  } catch (err) {
    console.error('Could not start. Is MongoDB running at', cfg.MONGO_URI, '?\n', err.message);
    process.exit(1);
  }
})();
