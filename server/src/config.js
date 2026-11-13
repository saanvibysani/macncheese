// Single place for every assumption. Change values here, nothing else needs editing.

const LAKH = 100000;

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/loan_prevalidator',

  // Part A: patterns
  CODE_REGEX: /^LOAN[HVPE][0-9]{6}$/,
  NUMBER_REGEX: /^[1-9][0-9]{0,7}$/, // income and amount, 1 to 99,999,999

  LOAN_TYPES: { H: 'Home', V: 'Vehicle', P: 'Personal', E: 'Education' },

  // Keyword hints used only to demonstrate conflicting-pattern resolution.
  // Documented priority: the code letter always wins over keywords.
  // Among keywords, fixed order: Home > Vehicle > Education > Personal.
  KEYWORD_PATTERNS: [
    { category: 'Home', re: /\b(house|home|flat|apartment|plot|property)\b/i },
    { category: 'Vehicle', re: /\b(car|bike|vehicle|scooter|truck|auto)\b/i },
    { category: 'Education', re: /\b(college|tuition|course|university|study|education)\b/i },
    { category: 'Personal', re: /\b(wedding|medical|travel|personal|debt)\b/i },
  ],

  // Part B: dispatch table
  AMOUNT_THRESHOLD: 10 * LAKH, // 10 lakhs, in rupees
  // Key = loanType letter + band. "A" = any amount.
  ROUTING_TABLE: {
    'H:LOW': 'H1',
    'H:HIGH': 'H2',
    'V:LOW': 'V1',
    'V:HIGH': 'V2',
    'P:ANY': 'P1',
    'E:ANY': 'E1',
  },

  // Backup handlers tried in order when the primary is unavailable or full
  BACKUPS: {
    H1: ['H2'],
    H2: ['H1'],
    V1: ['V2'],
    V2: ['V1'],
    P1: ['E1'],
    E1: ['P1'],
  },

  // Critical reports with no primary or backup capacity go here (priority override)
  ESCALATION_HANDLER: 'S1',

  // Seed data for handlers
  HANDLERS: [
    { code: 'H1', name: 'Home Loans (up to 10L)', team: 'Home', capacity: 5 },
    { code: 'H2', name: 'Home Loans (above 10L)', team: 'Home', capacity: 5 },
    { code: 'V1', name: 'Vehicle Loans (up to 10L)', team: 'Vehicle', capacity: 5 },
    { code: 'V2', name: 'Vehicle Loans (above 10L)', team: 'Vehicle', capacity: 5 },
    { code: 'P1', name: 'Personal Loans', team: 'Personal', capacity: 5 },
    { code: 'E1', name: 'Education Loans', team: 'Education', capacity: 5 },
    { code: 'S1', name: 'Senior Escalation Officer', team: 'Escalation', capacity: 3 },
  ],

  ZONES: ['North', 'South', 'East', 'West', 'Central'],

  PRIORITIES: { Critical: 1, High: 2, Medium: 3, Low: 4 },

  // Genuine ineligibility: requested amount above this multiple of annual income
  MAX_AMOUNT_TO_INCOME: 10,

  STATUSES: ['Pending', 'Assigned', 'In Progress', 'Resolved'],
  TRANSITIONS: {
    Pending: ['Assigned'],
    Assigned: ['In Progress'],
    'In Progress': ['Resolved'],
    Resolved: [],
  },

  REASONS: {
    ERR_INCOMPLETE: 'Application code is incomplete or empty',
    ERR_CODE_MALFORMED: 'Application code must look like LOAN + type letter + 6 digits',
    ERR_UNSUPPORTED_TYPE: 'Loan type letter is not supported (use H, V, P or E)',
    ERR_INCOME_INVALID: 'Income must be a whole number from 1 to 99999999 with no leading zero',
    ERR_AMOUNT_INVALID: 'Amount must be a whole number from 1 to 99999999 with no leading zero',
    ERR_ZONE_UNKNOWN: 'Zone is not recognised',
    ERR_NO_ROUTE: 'No routing-table entry for this key',
    INELIGIBLE_LTI: 'Requested amount is more than 10 times annual income',
  },
};
