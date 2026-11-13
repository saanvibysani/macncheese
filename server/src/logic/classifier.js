const cfg = require('../config');
const { regexCode } = require('./validators');

/**
 * Part A, Q3/Q4: exactly five categories: Home, Vehicle, Personal, Education, Invalid.
 * Deterministic priority rule when several patterns match:
 *   1. The code's type letter always wins.
 *   2. Keywords in the description are only hints; they never override the code.
 * If keywords disagree with the code, the report is flagged conflict=true and the
 * hints are recorded, but the category stays the one from the code.
 */
function classify(code, description = '') {
  if (!regexCode(code)) {
    return { category: 'Invalid', conflict: false, hints: [] };
  }
  const category = cfg.LOAN_TYPES[code[4]];
  const hints = cfg.KEYWORD_PATTERNS.filter((p) => p.re.test(description || '')).map((p) => p.category);
  const conflict = hints.length > 0 && !hints.includes(category);
  return { category, conflict, hints };
}

module.exports = { classify, CATEGORIES: ['Home', 'Vehicle', 'Personal', 'Education', 'Invalid'] };
