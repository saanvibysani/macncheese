const cfg = require('../config');

// Part B: routing key and dispatch planning. These are pure functions so they can be tested without a database.

function amountBand(type, amount) {
  if (type === 'P' || type === 'E') return 'ANY';
  return Number(amount) <= cfg.AMOUNT_THRESHOLD ? 'LOW' : 'HIGH';
}

/** Routing key is extracted only from a validated report. */
function routingKey(code, amount) {
  const type = code[4];
  return `${type}:${amountBand(type, amount)}`;
}

/** Table lookup. Returns handler code or null (unknown key). */
function lookupRoute(key, table = cfg.ROUTING_TABLE) {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
}

function describeKey(key) {
  const [type, band] = key.split(':');
  const name = cfg.LOAN_TYPES[type];
  if (band === 'LOW') return `${name}, amount up to 10 lakhs`;
  if (band === 'HIGH') return `${name}, amount above 10 lakhs`;
  return `${name}, any amount`;
}

function routingTableRows() {
  const zones = cfg.ZONES.join(', ');
  const priorities = Object.keys(cfg.PRIORITIES).join(', ');
  const priorityRule = `Critical reports escalate to ${cfg.ESCALATION_HANDLER} only when primary and backup handlers have no room`;
  const routes = Object.entries(cfg.ROUTING_TABLE).map(([key, handler]) => ({
    key,
    description: describeKey(key),
    handler,
    backups: cfg.BACKUPS[handler] || [],
    zones,
    priorities,
    priorityRule,
  }));
  const queues = [
    { key: 'INVALID', description: 'Invalid identifier or fields', handler: 'Correction Queue', reason: 'Correction required before routing' },
    { key: 'UNKNOWN', description: 'Unknown zone or routing key', handler: 'Fallback Queue', reason: 'Zone must be one of the recognized zones' },
    { key: 'INELIGIBLE', description: 'Genuinely ineligible application', handler: 'Rejection Queue', reason: 'Amount is above 10 times annual income' },
  ].map((row) => ({
    ...row,
    backups: [],
    zones: row.key === 'UNKNOWN' ? `Unknown; valid zones: ${zones}` : 'Any',
    priorities,
    priorityRule,
  }));
  return [...routes, ...queues];
}

function hasRoom(h) {
  return !!h && h.available && h.load < h.capacity;
}

/**
 * Decide where a validated report should go, given a snapshot of handlers.
 * Returns:
 *  { outcome: 'ROUTED', candidates: [{code, via}], ... }  try these in order (atomic claim in the service)
 *  { outcome: 'FALLBACK_QUEUE' }                          unknown routing key
 * The service tries candidates in order. If all fail: Critical -> escalation, otherwise waiting queue.
 */
function planDispatch({ code, amount, priority }, handlers, table = cfg.ROUTING_TABLE) {
  const key = routingKey(code, amount);
  const primary = lookupRoute(key, table);
  if (!primary) {
    return { outcome: 'FALLBACK_QUEUE', routingKey: key, reasonCode: 'ERR_NO_ROUTE' };
  }
  const byCode = Object.fromEntries(handlers.map((h) => [h.code, h]));
  const candidates = [];
  if (hasRoom(byCode[primary])) candidates.push({ code: primary, via: 'primary' });
  for (const b of cfg.BACKUPS[primary] || []) {
    if (hasRoom(byCode[b])) candidates.push({ code: b, via: 'backup' });
  }
  const critical = priority === 'Critical';
  const escalation = critical && hasRoom(byCode[cfg.ESCALATION_HANDLER])
    ? { code: cfg.ESCALATION_HANDLER, via: 'escalation' }
    : null;
  return {
    outcome: 'ROUTED',
    routingKey: key,
    primary,
    candidates,
    escalation, // used only when candidates is empty and priority is Critical
    critical,
  };
}

/** Deterministic queue ordering: priority rank asc, then FIFO (createdAt asc), then reportId. */
function compareQueue(a, b) {
  const pa = cfg.PRIORITIES[a.priority] ?? 99;
  const pb = cfg.PRIORITIES[b.priority] ?? 99;
  if (pa !== pb) return pa - pb;
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  if (ta !== tb) return ta - tb;
  return String(a.reportId).localeCompare(String(b.reportId));
}

/** Genuine ineligibility check: goes to the Rejection Queue. */
function isIneligible(income, amount) {
  return Number(amount) > cfg.MAX_AMOUNT_TO_INCOME * Number(income);
}

module.exports = {
  amountBand,
  routingKey,
  lookupRoute,
  routingTableRows,
  planDispatch,
  compareQueue,
  isIneligible,
  hasRoom,
};
