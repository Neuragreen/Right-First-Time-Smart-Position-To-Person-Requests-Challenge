# P2P Compass - solution note

Working synthetic-data MVP; policies and targets are illustrative.

## Problem and users

P2P Compass is designed to reduce avoidable rework by checking Position to Person requests at submission, exposing the next owner and connecting process delays to specific improvement actions. Line managers receive guided forms and clear status; HR specialists receive complete request details, exceptions and dependencies; process owners receive evidence-linked analysis of stalls, returns and variation.

## Workflow

Four configurable workflows cover employee transfers, position creation, end-of-service position actions and position deletion. Checks cover required fields, position references and occupancy, synthetic employee-position relationships, effective dates, dependency links and approval routes. Errors include corrections and rule references. Every submission stores its form and validation snapshot; returns retain reasons and earlier revisions.

Named fictional reviewers explicitly validate, approve and process requests. Dependency existence, self-reference and cycles are checked; unresolved upstream work prevents progression. Structured blockers record the cause and resolution owner. Status, next owner, event history and updates are persisted locally in SQLite and refreshed across browser sessions every five seconds. The optional hosted adapter uses D1.

Event analysis shows completed step intervals, current open waits, correction loops, process paths, exceptions and like-type team comparisons. Type, team and submission-date filters support investigation. Open waits are censored at the observation time; elapsed time is not measured handling effort. A grounded local assistant answers status and action questions with request/event citations. The interface and assistant support English and Arabic.

## Prediction

Two L2-regularised logistic baselines estimate delay beyond an illustrative calendar-hour target and a correction return. The model card uses 1,200 generated histories: 901 training cases, 240 chronological held-out cases and 59 purged cases whose labels had not matured before the test period. Normalisation uses training data only; inference excludes future events. Known overdue, returned and completed outcomes are labelled as observations, not forecasts.

At the 0.50 classification threshold, prospective evaluation includes 228 delay cases and 192 return cases. Return recall is only 11.1% (2 of 18 returns detected), so that baseline needs improvement. Probabilities are uncalibrated and extrapolation warnings are visible. These are generated-data results, not Emirates or judge-test accuracy.

## Recommendations

At 23 October 2026, 00:00 UTC: incomplete submissions 112 h (56-145.6); routing 51 h (25.5-61.2); dependencies 103 h (41.2-144.2). All are conditional elapsed-time scenarios, not measured benefits; do not aggregate without overlap checks.

## Responsible AI

The tool supports people and never approves, rejects or makes employee decisions automatically. Only generated synthetic records are included; no live HR system or real employee data is connected. Browser CSV scoring remains in memory and sends no selected files to an external model service. The assistant performs local intent matching, cites accessible records and abstains when unsupported. Predictions expose feature/event evidence and model version; recommendation assumptions are explicit.

The local judge runner binds to loopback and uses one fictional demo identity; actor switching demonstrates responsibilities rather than production HR permissions. The separate hosted adapter authenticates its owner. Server-side validation, same-origin writes, version checks and atomic journal insertion protect demo actions. The application journal retains actor, action, reason and relevant evidence and survives resets; it is not a certified tamper-proof enterprise audit control.

## Deployment inside Emirates

For an Emirates pilot, run the UI, API, versioned rules, approved database and model inference inside the permitted environment. Map organisational identity to server-side role and request-level permissions; apply approved encryption, retention, backup and monitoring controls. Use approved adapters for permitted event ingestion with source identifiers and retry controls. Keep approvals human and retain rule, form, workflow, feature and model versions. Any future language model requires an explicitly permitted private deployment.

## Validation and limits

The MVP passed 42 automated tests, including standalone local startup, persisted actions and origin checks. The framework adapter also passed type checking and a production build. Browser checks covered of submission, correction, explicit approval, cross-session status, analytics, bilingual answers and CSV export. The next stage is official-pack schema/rule mapping, chronological revalidation, probability calibration and a controlled pilot measuring returns, turnaround and actual HR effort.

At submission time, the organiser historical pack and held-out test set had not been made available to our team. We therefore submit synthetic demonstration data only and no official test-set predictions. Generating or relabelling synthetic rows as official predictions would be misleading. Live integrations, enterprise identity mapping and measured savings are outside the current prototype.
