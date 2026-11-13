const cfg = require('../config');
const { runCodeDfa, runNumberDfa } = require('./dfa');

// Regex-based checks (Part A, Q1/Q2)
const fullMatch = (pattern, value) => {
  if (typeof value !== 'string') return false;
  const match = pattern.exec(value);
  return !!match && match[0] === value;
};
const regexCode = (s) => fullMatch(cfg.CODE_REGEX, s);
const regexNumber = (s) => fullMatch(cfg.NUMBER_REGEX, s);

// Run both engines and report whether they agree
function checkCode(code) {
  const dfa = runCodeDfa(code);
  const regex = regexCode(code);
  return { dfa: dfa.accepted, regex, agree: dfa.accepted === regex, trace: dfa.trace };
}

function checkNumber(value) {
  const s = value === undefined || value === null ? '' : String(value);
  const dfa = runNumberDfa(s);
  const regex = regexNumber(s);
  return { dfa: dfa.accepted, regex, agree: dfa.accepted === regex };
}

// Meaningful rejection reason for a bad code (Q4)
function explainCodeFailure(code) {
  const s = typeof code === 'string' ? code.trim() : '';
  if (s.length === 0 || s.length < 4) return 'ERR_INCOMPLETE';
  if (/^LOAN[A-Z][0-9]{6}$/.test(s) && !/^LOAN[HVPE]/.test(s)) return 'ERR_UNSUPPORTED_TYPE';
  if (/^LOAN[HVPE][0-9]{0,5}$/.test(s)) return 'ERR_INCOMPLETE';
  return 'ERR_CODE_MALFORMED';
}

/**
 * Full structured-field validation.
 * Returns { valid, reasonCode, reasonMessage, checks }
 */
function validateReport({ loanCode, income, amount }) {
  const code = typeof loanCode === 'string' ? loanCode : '';
  const checks = {
    code: checkCode(code),
    income: checkNumber(income),
    amount: checkNumber(amount),
  };
  let reasonCode = null;
  if (!(checks.code.dfa && checks.code.regex)) reasonCode = explainCodeFailure(code);
  else if (!(checks.income.dfa && checks.income.regex)) reasonCode = 'ERR_INCOME_INVALID';
  else if (!(checks.amount.dfa && checks.amount.regex)) reasonCode = 'ERR_AMOUNT_INVALID';

  return {
    valid: reasonCode === null,
    reasonCode,
    reasonMessage: reasonCode ? cfg.REASONS[reasonCode] : null,
    checks,
  };
}

module.exports = { regexCode, regexNumber, checkCode, checkNumber, validateReport };
