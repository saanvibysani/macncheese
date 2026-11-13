const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const cfg = require('./config');
const { Handler, Report } = require('./models');
const wf = require('./services/workflow');
const { validateReport } = require('./logic/validators');
const { classify } = require('./logic/classifier');
const { routingKey, lookupRoute, routingTableRows } = require('./logic/dispatcher');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/meta', (req, res) =>
    res.json({ zones: cfg.ZONES, priorities: Object.keys(cfg.PRIORITIES), statuses: cfg.STATUSES, threshold: cfg.AMOUNT_THRESHOLD })
  );

  // Live inline validation: nothing is saved
  app.post('/api/validate', (req, res) => {
    const { loanCode = '', income = '', amount = '', description = '', urgency = 'Medium' } = req.body || {};
    const v = validateReport({ loanCode, income, amount });
    const c = classify(loanCode, description);
    let key = null;
    let branch = null;
    if (v.checks.code.regex && v.checks.amount.regex) {
      key = routingKey(loanCode, Number(amount));
      branch = lookupRoute(key);
    }
    res.json({
      valid: v.valid,
      reasonCode: v.reasonCode,
      reasonMessage: v.reasonMessage,
      checks: v.checks,
      category: c.category,
      conflict: c.conflict,
      hints: c.hints,
      priority: cfg.PRIORITIES[urgency] ? urgency : 'Medium',
      routingKey: key,
      branch,
    });
  });

  app.post('/api/reports', wrap(async (req, res) => {
    const report = await wf.submitReport(req.body);
    res.status(201).json(report);
  }));

  app.get('/api/reports', wrap(async (req, res) => {
    const q = {};
    if (req.query.status) q.status = String(req.query.status);
    if (req.query.handler) q.handlerCode = String(req.query.handler);
    if (req.query.queue) q.queue = String(req.query.queue);
    res.json(await Report.find(q).sort({ createdAt: -1 }).limit(200));
  }));

  app.get('/api/reports/:reportId', wrap(async (req, res) => {
    const r = await Report.findOne({ reportId: req.params.reportId.trim().toUpperCase() });
    if (!r) return res.status(404).json({ error: 'Report not found' });
    res.json(r);
  }));

  app.patch('/api/reports/:reportId/status', wrap(async (req, res) => {
    res.json(await wf.updateStatus(req.params.reportId, req.body && req.body.status));
  }));

  app.patch('/api/reports/:reportId/resubmit', wrap(async (req, res) => {
    res.json(await wf.resubmitReport(req.params.reportId, req.body || {}));
  }));

  app.get('/api/handlers', wrap(async (req, res) => res.json(await Handler.find().sort({ code: 1 }))));

  app.patch('/api/handlers/:code', wrap(async (req, res) => {
    res.json(await wf.updateHandler(req.params.code, req.body || {}));
  }));

  app.get('/api/handlers/:code/reports', wrap(async (req, res) => {
    const reports = await Report.find({ handlerCode: req.params.code, status: { $ne: 'Resolved' } }).sort({ priorityRank: 1, createdAt: 1 });
    res.json(reports);
  }));

  // User dashboard counts
  app.get('/api/stats', wrap(async (req, res) => {
    const [total, pending, assigned, inProgress, resolved] = await Promise.all([
      Report.countDocuments(),
      Report.countDocuments({ status: 'Pending' }),
      Report.countDocuments({ status: 'Assigned' }),
      Report.countDocuments({ status: 'In Progress' }),
      Report.countDocuments({ status: 'Resolved' }),
    ]);
    res.json({ total, pending, assigned, inProgress, resolved });
  }));

  // Routing management dashboard
  app.get('/api/routing', wrap(async (req, res) => {
    const handlers = await Handler.find().sort({ code: 1 });
    const table = routingTableRows();
    const brief = 'reportId applicantName category priority priorityRank routingKey queue queueReason handlerCode assignedVia createdAt status';
    const [waiting, correction, fallback, rejection] = await Promise.all(
      ['waiting', 'correction', 'fallback', 'rejection'].map((queue) =>
        Report.find({ queue }).select(brief).sort({ priorityRank: 1, createdAt: 1 }).limit(100)
      )
    );
    const recent = await Report.find({ 'decisions.event': { $in: ['BACKUP_ASSIGNED', 'ESCALATED', 'PRIORITY_OVERRIDE', 'QUEUED_WAITING'] } })
      .select('reportId priority decisions')
      .sort({ updatedAt: -1 })
      .limit(60);
    const wanted = new Set(['BACKUP_ASSIGNED', 'ESCALATED', 'PRIORITY_OVERRIDE', 'QUEUED_WAITING']);
    const decisions = recent
      .flatMap((r) => r.decisions.filter((d) => wanted.has(d.event)).map((d) => ({ reportId: r.reportId, priority: r.priority, at: d.at, event: d.event, detail: d.detail })))
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 50);
    res.json({ table, handlers, queues: { waiting, correction, fallback, rejection }, decisions, threshold: cfg.AMOUNT_THRESHOLD });
  }));

  app.get('/api/analytics', wrap(async (req, res) => {
    const group = (field) => Report.aggregate([{ $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
    const [byZone, byCategory, byStatus, byQueue, byHandler] = await Promise.all([
      group('zone'), group('category'), group('status'), group('queue'),
      Report.aggregate([{ $match: { handlerCode: { $ne: null } } }, { $group: { _id: '$handlerCode', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    ]);
    const fmt = (rows) => rows.map((r) => ({ name: r._id || 'Unspecified', count: r.count }));
    const total = await Report.countDocuments();
    const resolved = await Report.countDocuments({ status: 'Resolved' });
    res.json({
      total, resolved, unresolved: total - resolved,
      byZone: fmt(byZone), byCategory: fmt(byCategory), byStatus: fmt(byStatus), byQueue: fmt(byQueue), byHandler: fmt(byHandler),
    });
  }));

  // Serve the built React app when present (npm run build in client/), so one port runs everything
  const dist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
  });
  return app;
}

module.exports = { createApp };
