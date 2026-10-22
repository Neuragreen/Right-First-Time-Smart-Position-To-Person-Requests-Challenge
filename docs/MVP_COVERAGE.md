# “What to Build” — MVP acceptance record

| Requirement | Implemented behaviour | Verification |
| --- | --- | --- |
| Guide managers and check rules before sending | Four type-specific forms; field, position, employee relationship, date, dependency and route checks; corrections; saved rule/form snapshots | Workflow validation tests and browser invalid-to-valid submission |
| Track steps, live status and next owner | Persisted local SQLite state (optional hosted D1 adapter); named actors; configured routes; timelines; five-second polling; notifications; version conflicts | Backend session/concurrency tests; browser manager→HR→approver→completion |
| Predict delayed or returned requests, and why | Separate fitted logistic baselines; held-out metrics; probabilities, feature evidence, observed-outcome labels and out-of-support warnings | Prediction holdout, maturity, as-of leakage and explanation tests |
| Analyse stalls, loops and team variation | Step intervals; returns; paths; structured exceptions; like-type team comparisons; submission cohorts; type/team/date filters | Duration reconciliation/filter tests and browser team comparison |
| Recommend simplification/automation and time saved | Three evidence-driven scenarios; request/event references; conservative sensitivity ranges; assumptions; no invented labour savings | Recommendation interval/range tests and browser evidence panels |
| Optional manager assistant | Local grounded status/action/blocker/bottleneck questions; request/event citations; actor scope; abstention; no decisions | English/Arabic assistant tests and browser answers |
| Optional Arabic and English | Language switch; Arabic interface, right-to-left layout and Arabic assistant answers | Browser language switching and Arabic intent tests |

## Limits that remain explicit

The official data pack and held-out test set have not been supplied. Current policies, routes and all trained/evaluated outcomes are generated demonstration material. Replace configuration and train/evaluate against the approved pack before submitting accuracy claims or final predictions. Current probabilities are uncalibrated synthetic estimates.

“Live” means persisted demo actions become visible on the next poll in browser sessions of the local demo; optional hosted sessions share their authenticated owner workspace. There are no live HR integrations. Demo actor switching is not enterprise role security. Real pilot roles must be mapped server-side to Emirates identity.

The audit journal is append-only through application APIs and survives resets. It is a prototype control, not an independently certified tamper-proof audit system. Raw evidence names and configured policy text may remain in their source language.

The final submission includes the recorded 175-second video and a two-page solution note. Official test-set predictions are omitted because the organiser files had not been made available to our team at submission time. See [submission status](SUBMISSION_STATUS.md).
