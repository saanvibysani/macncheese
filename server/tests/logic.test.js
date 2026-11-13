const test = require('node:test');
const assert = require('node:assert/strict');
const { runCodeDfa } = require('../src/logic/dfa');
const { regexCode, checkCode, checkNumber, validateReport } = require('../src/logic/validators');
const { classify, CATEGORIES } = require('../src/logic/classifier');
const { routingKey, lookupRoute, routingTableRows, planDispatch, compareQueue, isIneligible } = require('../src/logic/dispatcher');
const { applyApplicationDetails } = require('../src/services/workflow');

const handlers = (over = {}) =>
  ['H1', 'H2', 'V1', 'V2', 'P1', 'E1', 'S1'].map((code) => ({
    code, capacity: code === 'S1' ? 3 : 5, load: 0, available: true, ...(over[code] || {}),
  }));

// ---- Valid and invalid formats; DFA and regex agreement (tests 1-8) ----
for (const [n, code] of [[1, 'LOANH123456'], [2, 'LOANV123456'], [3, 'LOANP123456'], [4, 'LOANE123456']]) {
  test(`T${n}: ${code} is valid in DFA and regex`, () => {
    const c = checkCode(code);
    assert.equal(c.dfa, true);
    assert.equal(c.regex, true);
    assert.equal(c.agree, true);
  });
}

test('T5: unsupported type letter LOANX123456 is invalid with a specific reason', () => {
  assert.equal(checkCode('LOANX123456').dfa, false);
  assert.equal(validateReport({ loanCode: 'LOANX123456', income: '50000', amount: '100000' }).reasonCode, 'ERR_UNSUPPORTED_TYPE');
});

test('T6: too short LOANH12345 is invalid (incomplete)', () => {
  assert.equal(checkCode('LOANH12345').dfa, false);
  assert.equal(validateReport({ loanCode: 'LOANH12345', income: '1', amount: '1' }).reasonCode, 'ERR_INCOMPLETE');
});

test('T7: too long LOANH1234567 is invalid', () => {
  const c = checkCode('LOANH1234567');
  assert.equal(c.dfa, false);
  assert.equal(c.regex, false);
  assert.equal(validateReport({ loanCode: 'LOANH1234567', income: '1', amount: '1' }).reasonCode, 'ERR_CODE_MALFORMED');
});

test('T8: empty code is invalid', () => {
  assert.equal(checkCode('').dfa, false);
  assert.equal(validateReport({ loanCode: '', income: '1', amount: '1' }).reasonCode, 'ERR_INCOMPLETE');
});

test('DFA and regex agree on a mixed batch including lowercase, spaces and trailing newline', () => {
  const inputs = ['LOANH123456', 'loanh123456', 'LOANH 23456', 'LOANH123456\n', ' LOANH123456', 'LOANHABCDEF', 'LOAN', 'LOANH000000', 'LOANZ123456', undefined, null, 42];
  for (const i of inputs) {
    assert.equal(runCodeDfa(i).accepted, regexCode(i), `disagree on ${JSON.stringify(i)}`);
  }
  assert.equal(checkNumber('1\n').agree, true);
});

// ---- Income and amount rejection (tests 9-10) ----
test('T9: invalid income is rejected', () => {
  for (const bad of ['', '0', '012', '-5', '12.5', 'abc', '123456789']) {
    const v = validateReport({ loanCode: 'LOANH123456', income: bad, amount: '500000' });
    assert.equal(v.valid, false, `income ${bad}`);
    assert.equal(v.reasonCode, 'ERR_INCOME_INVALID');
    assert.equal(checkNumber(bad).agree, true);
  }
});

test('T10: invalid amount is rejected', () => {
  for (const bad of ['', '0', '007', '1e5', '1,000', '123456789']) {
    const v = validateReport({ loanCode: 'LOANH123456', income: '60000', amount: bad });
    assert.equal(v.valid, false, `amount ${bad}`);
    assert.equal(v.reasonCode, 'ERR_AMOUNT_INVALID');
  }
  assert.equal(validateReport({ loanCode: 'LOANH123456', income: '99999999', amount: '1' }).valid, true);
});

// ---- Classification (tests 11-12 and all five categories) ----
test('T11: home loan classified as Home', () => assert.equal(classify('LOANH123456').category, 'Home'));
test('T12: vehicle loan classified as Vehicle', () => assert.equal(classify('LOANV123456').category, 'Vehicle'));

test('All five categories are produced and nothing else', () => {
  const got = new Set(['LOANH123456', 'LOANV123456', 'LOANP123456', 'LOANE123456', 'BAD'].map((c) => classify(c).category));
  assert.deepEqual([...got].sort(), [...CATEGORIES].sort());
});

test('Conflicting patterns: code letter wins over description keywords, conflict flagged', () => {
  const r = classify('LOANH123456', 'need money to buy a car');
  assert.equal(r.category, 'Home');
  assert.equal(r.conflict, true);
  assert.deepEqual(r.hints, ['Vehicle']);
  assert.equal(classify('LOANH123456', 'buy a flat').conflict, false);
});

// ---- Routing table (tests 13, and thresholds) ----
test('Routing table matches the dispatch table including the 10 lakh boundary', () => {
  assert.equal(lookupRoute(routingKey('LOANH123456', 1000000)), 'H1');
  assert.equal(lookupRoute(routingKey('LOANH123456', 1000001)), 'H2');
  assert.equal(lookupRoute(routingKey('LOANV123456', 1000000)), 'V1');
  assert.equal(lookupRoute(routingKey('LOANV123456', 1000001)), 'V2');
  assert.equal(lookupRoute(routingKey('LOANP123456', 99999999)), 'P1');
  assert.equal(lookupRoute(routingKey('LOANE123456', 5)), 'E1');
});

test('T13: unknown routing key goes to the fallback queue', () => {
  assert.equal(lookupRoute('X:ANY'), null);
  const plan = planDispatch({ code: 'LOANH123456', amount: 500000, priority: 'Medium' }, handlers(), {});
  assert.equal(plan.outcome, 'FALLBACK_QUEUE');
});

test('Routing table rows include recognized zones and all priority behavior', () => {
  const rows = routingTableRows();
  const home = rows.find((row) => row.key === 'H:LOW');
  const unknown = rows.find((row) => row.key === 'UNKNOWN');
  assert.equal(home.zones, 'North, South, East, West, Central');
  assert.equal(home.priorities, 'Critical, High, Medium, Low');
  assert.match(home.priorityRule, /Critical reports escalate to S1/);
  assert.match(unknown.zones, /valid zones:/);
});

test('Correction resubmission reevaluates fields and routes corrected reports', () => {
  const report = {
    loanCode: 'LOANX123456',
    income: '900000',
    amount: '800000',
    zone: 'South',
    description: 'buy a car',
    urgency: 'Medium',
    decisions: [],
  };
  applyApplicationDetails(report, {
    loanCode: 'LOANH123456',
    income: '900000',
    amount: '800000',
    zone: 'South',
    urgency: 'Critical',
  });
  assert.equal(report.validation.valid, true);
  assert.equal(report.category, 'Home');
  assert.equal(report.classificationConflict, true);
  assert.equal(report.priority, 'Critical');
  assert.equal(report.routingKey, 'H:LOW');
  assert.equal(report.queue, 'none');
});

test('Invalid corrected details remain in the correction queue with a new reason', () => {
  const report = {
    loanCode: 'LOANX123456',
    income: '900000',
    amount: '800000',
    zone: 'South',
    description: '',
    urgency: 'Medium',
    decisions: [],
  };
  applyApplicationDetails(report, { loanCode: 'LOANH12345' });
  assert.equal(report.queue, 'correction');
  assert.equal(report.validation.reasonCode, 'ERR_INCOMPLETE');
  assert.equal(report.queueReason, 'ERR_INCOMPLETE');
});

// ---- Handler availability, capacity, fallback (tests 14-15) ----
test('Primary handler with room is chosen first', () => {
  const plan = planDispatch({ code: 'LOANH123456', amount: 500000, priority: 'Medium' }, handlers());
  assert.equal(plan.candidates[0].code, 'H1');
  assert.equal(plan.candidates[0].via, 'primary');
});

test('T14: unavailable handler -> backup assignment', () => {
  const plan = planDispatch({ code: 'LOANH123456', amount: 500000, priority: 'Medium' }, handlers({ H1: { available: false } }));
  assert.equal(plan.candidates[0].code, 'H2');
  assert.equal(plan.candidates[0].via, 'backup');
});

test('T15: capacity exceeded on primary and backup -> no candidates (waiting queue)', () => {
  const plan = planDispatch(
    { code: 'LOANV123456', amount: 500000, priority: 'Medium' },
    handlers({ V1: { load: 5 }, V2: { load: 5 } })
  );
  assert.equal(plan.candidates.length, 0);
  assert.equal(plan.escalation, null); // not critical
});

test('T16: Critical with no capacity gets the escalation path, others do not', () => {
  const full = handlers({ H1: { load: 5 }, H2: { available: false } });
  const crit = planDispatch({ code: 'LOANH123456', amount: 500000, priority: 'Critical' }, full);
  assert.equal(crit.escalation.code, 'S1');
  const high = planDispatch({ code: 'LOANH123456', amount: 500000, priority: 'High' }, full);
  assert.equal(high.escalation, null);
});

// ---- Priority override, ordering (test 17) ----
test('T17: queue ordering is priority first, then FIFO, then report id', () => {
  const t = (s) => new Date(`2026-01-01T00:00:${s}Z`);
  const q = [
    { reportId: 'C', priority: 'Low', createdAt: t('01') },
    { reportId: 'B', priority: 'Critical', createdAt: t('05') },
    { reportId: 'A', priority: 'Critical', createdAt: t('02') },
    { reportId: 'D', priority: 'High', createdAt: t('00') },
    { reportId: 'E', priority: 'High', createdAt: t('00') },
  ];
  assert.deepEqual(q.sort(compareQueue).map((r) => r.reportId), ['A', 'B', 'D', 'E', 'C']);
});

test('T18: genuinely ineligible applications are detected', () => {
  assert.equal(isIneligible('100000', '1000001'), true);
  assert.equal(isIneligible('100000', '1000000'), false);
});
