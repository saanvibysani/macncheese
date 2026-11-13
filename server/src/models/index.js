const mongoose = require('mongoose');
const cfg = require('../config');

const handlerSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    name: String,
    team: String,
    capacity: { type: Number, default: 5, min: 0 },
    available: { type: Boolean, default: true },
    load: { type: Number, default: 0, min: 0 }, // active reports: Assigned + In Progress
  },
  { timestamps: true }
);

const decisionSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    event: String, // e.g. PRIMARY_ASSIGNED, BACKUP_ASSIGNED, ESCALATED, QUEUED_WAITING ...
    detail: String,
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    reportId: { type: String, required: true, unique: true },
    applicantName: { type: String, required: true },
    contact: String,
    // original values exactly as submitted
    loanCode: String,
    income: String,
    amount: String,
    amountValue: Number,
    zone: String,
    description: String,
    urgency: { type: String, enum: Object.keys(cfg.PRIORITIES), default: 'Medium' },
    priority: { type: String, enum: Object.keys(cfg.PRIORITIES), default: 'Medium' },
    priorityRank: Number,

    // validation + classification (Part A)
    validation: {
      valid: Boolean,
      reasonCode: String,
      reasonMessage: String,
      dfaCode: Boolean,
      regexCode: Boolean,
      enginesAgree: Boolean,
    },
    category: { type: String, enum: ['Home', 'Vehicle', 'Personal', 'Education', 'Invalid'] },
    classificationConflict: Boolean,
    classificationHints: [String],

    // routing (Part B)
    routingKey: String,
    queue: {
      type: String,
      enum: ['none', 'correction', 'fallback', 'rejection', 'waiting'],
      default: 'none',
    },
    queueReason: String,
    status: { type: String, enum: cfg.STATUSES, default: 'Pending' },
    handlerCode: String,
    assignedVia: { type: String, enum: ['primary', 'backup', 'escalation', null], default: null },
    assignedAt: Date,
    resolvedAt: Date,
    statusHistory: [{ _id: false, status: String, at: { type: Date, default: Date.now } }],
    decisions: [decisionSchema],
  },
  { timestamps: true }
);
reportSchema.index({ queue: 1, priorityRank: 1, createdAt: 1 });

// One assignment per report, enforced by the database, so duplicates are impossible.
const assignmentSchema = new mongoose.Schema(
  {
    reportId: { type: String, required: true, unique: true },
    handlerCode: String,
    via: String,
    priority: String,
    assignedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = {
  Handler: mongoose.model('Handler', handlerSchema),
  Report: mongoose.model('Report', reportSchema),
  Assignment: mongoose.model('Assignment', assignmentSchema),
};
