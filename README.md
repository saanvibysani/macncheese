# Loan Application Pre-Validator (MERN)

Validates loan application codes with a DFA and an equivalent regex, classifies each report into five categories, routes it through an explicit dispatch table, assigns handlers (with backup, waiting queue and escalation), and tracks status in MongoDB.

## Run it

You need Node 18+ and MongoDB running locally (or a MongoDB Atlas URI).

```bash
# terminal 1: API
cd server
npm install
npm start                 # http://localhost:5000  (set MONGO_URI to use Atlas)

# terminal 2: frontend (development)
cd client
npm install
npm run dev               # http://localhost:5173, proxies /api to port 5000
```

One-port mode (what you would deploy): run `npm run build` in `client/`, then `npm start` in `server/`. Express serves the React build at http://localhost:5000.

Tests: `cd server && npm test` (logic and API validation tests do not need a database).

Python DFA/regex comparison: `cd server && python scripts/compare_dfa_regex.py`. It exercises valid and invalid codes, including a trailing newline, and exits unsuccessfully if the DFA and regex disagree.

Sample output:

```text
Input                Expected  DFA   Regex  Agree
----------------------------------------------------
'LOANH123456'        True      True  True   True
'LOANV123456'        True      True  True   True
'LOANP123456'        True      True  True   True
'LOANE123456'        True      True  True   True
'LOANX123456'        False     False False  True
'LOANH12345'         False     False False  True
'LOANH1234567'       False     False False  True
''                   False     False False  True
'loanh123456'        False     False False  True
'LOANH123456\n'      False     False False  True

All 10 cases agree with the expected result.
```

## Structure

```
server/src/config.js            every assumption in one place (threshold, handlers, backups, priorities, reason codes)
server/src/logic/dfa.js         Part A  DFA construction and simulation (code DFA q0..q10 + dead state, number DFA)
server/src/logic/validators.js  Part A  regex checks, DFA-vs-regex agreement, rejection reason codes
server/scripts/compare_dfa_regex.py  Part A  standalone Python DFA-vs-regex comparison
server/src/logic/classifier.js  Part A  five categories, deterministic conflict rule
server/src/logic/dispatcher.js  Part B  routing key, table lookup, dispatch plan, queue ordering
server/src/services/workflow.js Part B  atomic handler claim, waiting queue, escalation, status transitions
server/src/models/index.js      Report, Handler, Assignment collections
server/src/app.js               REST API
client/src/pages/*              Part C  Submit, My Reports, Handler, Routing, Analytics
```

## Correction queue

Reports in the Correction queue can be found on **My Reports** by report ID and resubmitted with corrected application code, income, amount, zone, urgency, or description. The server validates the updated fields again and sends the report through the normal routing flow; it remains in the appropriate queue if the corrected details are still invalid or cannot be routed.

## Deployment preparation

The server serves the built React app from `client/dist`. For a Render Web Service, use:

- Build command: `cd client && npm install --include=dev && npm run build && cd ../server && npm install`
- Start command: `cd server && npm start`
- Environment variable: `MONGO_URI` with your MongoDB connection string (never commit it)

The MERN app remains the selected implementation; no Flask/SQLite port is included.

## Rules implemented

| Situation | Result |
| --- | --- |
| Malformed or incomplete code, bad income or amount | Correction queue with a reason code, stored with the original report |
| Unknown zone or routing key | Fallback queue |
| Amount above 10 × annual income | Rejection queue |
| Primary handler unavailable or full | Backup handler (H1↔H2, V1↔V2, P1↔E1) |
| No backup room | Waiting queue, ordered by priority then first in first out |
| Critical with no room anywhere | Escalated to S1 (priority override) |
| Description keywords disagree with the code letter | Code letter wins, conflict is flagged and logged |
| Handler resolves a report or capacity changes | Waiting queue drains in priority order |
| Duplicate assignment | Impossible: unique report ID and a unique index on assignments, plus an atomic capacity claim |

Statuses: Pending → Assigned → In Progress → Resolved (skipping a step is rejected).

## Assumptions to confirm against your original question

- Stack is MERN (React, Express, MongoDB) as requested. Flask and SQLite remain out of scope unless the required stack changes later.
- 10 lakh threshold, handler codes H1/H2/V1/V2/P1/E1, escalation handler S1, capacity 5 each, backup pairs.
- A **zone** field (North, South, East, West, Central) was added so "unknown zone" and zone-wise analytics have something to work on.
- The 10× income rule for the Rejection Queue.
- No login: the Handler page just lets you pick a handler.

## Part D: test cases

All in `server/tests/`. Run `npm test`.

| No. | Test | Expected |
| --- | --- | --- |
| 1 to 4 | LOANH / LOANV / LOANP / LOANE + 123456 | Valid in DFA and regex |
| 5 | LOANX123456 | Invalid, ERR_UNSUPPORTED_TYPE |
| 6 | LOANH12345 | Invalid, ERR_INCOMPLETE |
| 7 | LOANH1234567 | Invalid, ERR_CODE_MALFORMED |
| 8 | Empty code | Invalid, ERR_INCOMPLETE |
| 9 | Invalid income (blank, 0, leading zero, decimal, text, 9 digits) | Rejected, ERR_INCOME_INVALID |
| 10 | Invalid amount | Rejected, ERR_AMOUNT_INVALID |
| 11 | Home code | Home |
| 12 | Vehicle code | Vehicle |
| 13 | Unknown routing key | Fallback queue |
| 14 | Primary unavailable | Backup handler |
| 15 | Primary and backup full | Waiting queue |
| 16 | Critical, no room | Escalation to S1; non-critical gets none |
| 17 | Mixed priorities and times | Priority, then FIFO, then report ID |
| 18 | Amount over 10× income | Detected as ineligible |
| extra | DFA and regex agree on 12 tricky inputs | Always agree |
| extra | All five categories appear, conflict rule | Code letter wins |
| extra | 10 lakh boundary routing | ≤ 10L low branch, above goes high branch |
| extra | `/api/validate` end to end over HTTP | Category, key and branch returned |
| extra | Routing table zone and priority metadata | All supported zones and priority override documented |
| extra | Correction resubmission | Corrected details are revalidated and routed or remain queued |
| extra | Trailing newline | DFA and regex both reject it |

## Demo script (Q13)

1. Submit `LOANH123456`, income `900000`, amount `800000`, zone South → Assigned to H1.
2. Mark In Progress, then Resolved on the Handler page.
3. On the Handler page set H1 unavailable, submit another Home loan → backup H2. Set H2 capacity to 0 as well, submit Medium → Waiting queue; submit Critical → Escalated to S1.
4. Turn H1 back on → the waiting report is assigned automatically.
5. Submit `LOANX123456` → Correction queue. Submit with zone left blank → Fallback queue. Submit amount 9000000 with income 100000 → Rejection queue.
6. Check Routing and Analytics pages.
