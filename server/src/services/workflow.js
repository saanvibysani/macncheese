const crypto = require('crypto');
const cfg = require('../config');
const { Handler, Report, Assignment } = require('../models');
const { validateReport } = require('../logic/validators');
const { classify } = require('../logic/classifier');
const { planDispatch, routingKey, compareQueue, isIneligible } = require('../logic/dispatcher');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function newReportId() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `LAP-${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

const note = (event, detail) => ({ at: new Date(), event, detail });

/** Atomically take one slot on a handler. Returns true if claimed. */
async function claimSlot(code) {
  const res = await Handler.findOneAndUpdate(
    { code, available: true, $expr: { $lt: ['$load', '$capacity'] } },
    { $inc: { load: 1 } },
    { new: true }
  );
  return !!res;
}

async function releaseSlot(code) {
  await Handler.updateOne({ code, load: { $gt: 0 } }, { $inc: { load: -1 } });
}

/** Try to assign a report; returns true if assigned. Mutates and saves the report doc. */
async function tryAssign(report) {
  const handlers = await Handler.find().lean();
  const plan = planDispatch(
    { code: report.loanCode, amount: report.amountValue, priority: report.priority },
    handlers
  );
  if (plan.outcome !== 'ROUTED') return false;

  const order = [...plan.candidates];
  if (plan.critical && plan.escalation) order.push(plan.escalation);

  for (const c of order) {
    if (!(await claimSlot(c.code))) continue; // lost a race or state changed: try next
    try {
      await Assignment.create({
        reportId: report.reportId,
        handlerCode: c.code,
        via: c.via,
        priority: report.priority,
      });
    } catch (err) {
      await releaseSlot(c.code); // duplicate assignment prevented
      if (err.code === 11000) return true; // already assigned elsewhere
      throw err;
    }
    const wasWaiting = report.queue === 'waiting';
    report.handlerCode = c.code;
    report.assignedVia = c.via;
    report.assignedAt = new Date();
    report.status = 'Assigned';
    report.queue = 'none';
    report.queueReason = null;
    report.statusHistory.push({ status: 'Assigned' });
    const label = { primary: 'PRIMARY_ASSIGNED', backup: 'BACKUP_ASSIGNED', escalation: 'ESCALATED' }[c.via];
    report.decisions.push(
      note(label, `Routing key ${plan.routingKey} -> ${plan.primary}; assigned to ${c.code} (${c.via})${wasWaiting ? ' from waiting queue' : ''}`)
    );
    if (report.priority === 'Critical') {
      report.decisions.push(note('PRIORITY_OVERRIDE', `Critical report dispatched ahead of lower priorities${c.via === 'escalation' ? ' via escalation path' : ''}`));
    }
    await report.save();
    return true;
  }
  return false;
}

/** Serialise queue draining so ordering stays deterministic. */
let drainChain = Promise.resolve();
function drainWaiting() {
  drainChain = drainChain.then(async () => {
    const waiting = await Report.find({ queue: 'waiting' });
    waiting.sort(compareQueue); // priority rank, then FIFO
    for (const r of waiting) {
      await tryAssign(r);
    }
  }).catch((e) => console.error('drain error', e));
  return drainChain;
}

function setQueue(report, queue, reasonCode, event) {
  report.queue = queue;
  report.queueReason = reasonCode;
  report.decisions.push(note(event, `${cfg.REASONS[reasonCode] || reasonCode}`));
}

function applyApplicationDetails(report, body) {
  const b = body || {};
  const read = (key, fallback = '') => Object.prototype.hasOwnProperty.call(b, key) ? b[key] : fallback;
  const loanCodeValue = read('loanCode', report.loanCode);
  const incomeValue = read('income', report.income);
  const amountValue = read('amount', report.amount);
  const zoneValue = read('zone', report.zone);
  const descriptionValue = read('description', report.description);
  const urgency = read('urgency', report.urgency || 'Medium') || 'Medium';
  if (!Object.prototype.hasOwnProperty.call(cfg.PRIORITIES, urgency)) {
    throw new HttpError(400, 'Urgency must be Critical, High, Medium or Low');
  }

  const loanCode = typeof loanCodeValue === 'string' ? loanCodeValue.trim() : '';
  const income = incomeValue === undefined || incomeValue === null ? '' : String(incomeValue).trim();
  const amount = amountValue === undefined || amountValue === null ? '' : String(amountValue).trim();
  const zone = String(zoneValue || '').trim();
  const description = descriptionValue === undefined || descriptionValue === null ? '' : String(descriptionValue);
  const validation = validateReport({ loanCode, income, amount });
  const cls = classify(loanCode, description);

  report.loanCode = loanCode;
  report.income = income;
  report.amount = amount;
  report.amountValue = validation.valid ? Number(amount) : undefined;
  report.zone = zone;
  report.description = description;
  report.urgency = urgency;
  report.priority = urgency;
  report.priorityRank = cfg.PRIORITIES[urgency];
  report.validation = {
    valid: validation.valid,
    reasonCode: validation.reasonCode,
    reasonMessage: validation.reasonMessage,
    dfaCode: validation.checks.code.dfa,
    regexCode: validation.checks.code.regex,
    enginesAgree: validation.checks.code.agree && validation.checks.income.agree && validation.checks.amount.agree,
  };
  report.category = cls.category;
  report.classificationConflict = cls.conflict;
  report.classificationHints = cls.hints;
  report.routingKey = undefined;
  report.queue = 'none';
  report.queueReason = null;

  if (cls.conflict) {
    report.decisions.push(note('CLASSIFICATION_CONFLICT', `Keywords suggest ${cls.hints.join('/')}; code letter wins -> ${cls.category}`));
  }
  if (urgency === 'Critical') {
    report.decisions.push(note('PRIORITY_OVERRIDE_REQUESTED', 'Critical urgency: emergency routing rule applies'));
  }

  if (!validation.valid) {
    // Malformed identifier or bad fields: stop before dispatch
    setQueue(report, 'correction', validation.reasonCode, 'CORRECTION_QUEUE');
  } else if (!cfg.ZONES.includes(zone)) {
    setQueue(report, 'fallback', 'ERR_ZONE_UNKNOWN', 'FALLBACK_QUEUE');
  } else if (isIneligible(income, amount)) {
    setQueue(report, 'rejection', 'INELIGIBLE_LTI', 'REJECTION_QUEUE');
  } else {
    report.routingKey = routingKey(loanCode, report.amountValue);
    const plan = planDispatch({ code: loanCode, amount: report.amountValue, priority: urgency }, []);
    if (plan.outcome === 'FALLBACK_QUEUE') {
      setQueue(report, 'fallback', 'ERR_NO_ROUTE', 'FALLBACK_QUEUE');
    }
  }

  return validation;
}

async function dispatchReport(report) {
  await report.save();
  if (report.queue === 'none') {
    const assigned = await tryAssign(report);
    if (!assigned) {
      report.queue = 'waiting';
      report.queueReason = 'CAPACITY';
      report.decisions.push(note('QUEUED_WAITING', 'Primary and backup handlers unavailable or at capacity; waiting for a free slot'));
      await report.save();
    }
  }
  return report;
}

async function submitReport(body) {
  const b = body || {};
  const applicantName = String(b.applicantName || '').trim();
  if (!applicantName) throw new HttpError(400, 'Applicant name is required');
  const report = new Report({
    reportId: newReportId(),
    applicantName,
    contact: b.contact,
    status: 'Pending',
    statusHistory: [{ status: 'Pending' }],
  });
  applyApplicationDetails(report, b);
  return dispatchReport(report);
}

async function resubmitReport(reportId, body) {
  const report = await Report.findOne({ reportId: String(reportId).trim().toUpperCase() });
  if (!report) throw new HttpError(404, 'Report not found');
  if (report.queue !== 'correction') {
    throw new HttpError(409, 'Only reports in the correction queue can be resubmitted');
  }
  report.decisions.push(note('CORRECTION_RESUBMITTED', 'Applicant resubmitted corrected application details'));
  applyApplicationDetails(report, body);
  return dispatchReport(report);
}

const ALLOWED = cfg.TRANSITIONS;

async function updateStatus(reportId, nextStatus) {
  const report = await Report.findOne({ reportId });
  if (!report) throw new HttpError(404, 'Report not found');
  if (!cfg.STATUSES.includes(nextStatus)) throw new HttpError(400, 'Unknown status');
  if (report.queue !== 'none' || !report.handlerCode) {
    throw new HttpError(409, 'Report is not assigned to a handler yet');
  }
  if (!ALLOWED[report.status].includes(nextStatus)) {
    throw new HttpError(409, `Cannot move from ${report.status} to ${nextStatus}`);
  }
  report.status = nextStatus;
  report.statusHistory.push({ status: nextStatus });
  report.decisions.push(note('STATUS_UPDATE', `${nextStatus} by ${report.handlerCode}`));
  if (nextStatus === 'Resolved') report.resolvedAt = new Date();
  await report.save();
  if (nextStatus === 'Resolved') {
    await releaseSlot(report.handlerCode);
    await drainWaiting();
  }
  return report;
}

async function updateHandler(code, patch) {
  const update = {};
  if (patch.available !== undefined) {
    if (typeof patch.available !== 'boolean') throw new HttpError(400, 'available must be true or false');
    update.available = patch.available;
  }
  if (patch.capacity !== undefined) {
    if (!Number.isInteger(patch.capacity) || patch.capacity < 0 || patch.capacity > 100) {
      throw new HttpError(400, 'capacity must be a whole number from 0 to 100');
    }
    update.capacity = patch.capacity;
  }
  const h = await Handler.findOneAndUpdate({ code }, { $set: update }, { new: true });
  if (!h) throw new HttpError(404, 'Handler not found');
  await drainWaiting();
  return h;
}

async function seedHandlers() {
  for (const h of cfg.HANDLERS) {
    await Handler.updateOne({ code: h.code }, { $setOnInsert: { ...h, available: true, load: 0 } }, { upsert: true });
  }
}

module.exports = {
  HttpError,
  applyApplicationDetails,
  submitReport,
  resubmitReport,
  updateStatus,
  updateHandler,
  drainWaiting,
  seedHandlers,
};
