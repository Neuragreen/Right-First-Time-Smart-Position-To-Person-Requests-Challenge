> **Final local submission:** `npm start` runs the same browser UI, domain rules and API handlers through a standalone Node HTTP server bound to 127.0.0.1. Node built-in SQLite stores state and the journal under ignored `.local-data/`. No cloud services, account, API key or installed packages are required. A single fictional local workspace is shared across browser sessions. Demo actor switching is not enterprise identity. The framework/hosted architecture below remains an optional deployment adapter.

# P2P Compass — implementation and pilot blueprint

## Current MVP

A Vinext application serves the HTML/JavaScript interface and authenticated APIs. Cloudflare D1 persists one synthetic workspace per authenticated preview owner and a separate append-only application action journal. Managers, HR specialists, approvers and the process owner are fictional selectable actors inside that workspace; this selector demonstrates responsibilities and is not production authorisation.

The four configured workflows have type-specific approval and processing stages. Managers submit or correct their own requests. Assigned people explicitly validate, approve, process or return requests. HR can assign eligible owners or record structured blockers and accountable resolution owners. Dependency existence, self-reference and cycles are checked; unresolved upstream transactions stop progression. No approval is automatic.

Submission stores a versioned form and validation snapshot. Corrections retain earlier versions and return reasons. API updates require the expected workspace version and same-origin writes. Atomic compare-and-swap plus journal insertion protects concurrent actions; resetting fixture state does not erase the journal. Sessions of one preview owner see changes through five-second polling. Different authenticated owners are isolated.

## Analytics and prediction

Event analysis separates completed intervals from current open waits. It provides returns, paths, exceptions, like-type team comparisons and cohort trends. Elapsed intervals do not identify hands-on work. Recommendations apply disclosed reductions to identified intervals and show sensitivity ranges; they are hypotheses for a pilot, not measured causal effects or labour savings.

Two regularised logistic models are fitted locally using generated historical cases. Whole-request chronological partitions, training-label maturity before the test period and training-only normalization protect evaluation. Inference ignores future events; known late/returned/completed states remain observed facts. Model cards expose metrics, scope and limitations. Data-support warnings identify extrapolation. No external inference service receives the pack.

The English/Arabic assistant uses local intent matching over scoped demo records, cites request/event evidence, abstains when unsupported and never performs approval actions.

## Adapting the official synthetic pack

Confirm request/event identifiers, initial versus revised forms, event timestamp semantics, terminal states, targets, working calendars, reporting relationships and dependencies. Preserve source versions and provenance; unresolved fields stay unknown. Replace illustrative rules/routes/targets, reconcile histories and profile data quality before model fitting.

Define delay and return labels separately. Use mature outcomes or explicit censoring; hold whole requests in chronological partitions and prevent future forms/events/outcomes entering features. Compare simple baselines, precision/recall and probability calibration on a later untouched cohort. Freeze the scoring pipeline before the judge test set. The generic trainModels interface accepts labelled as-of snapshots; current generated-model metrics are not Emirates evidence.

## Proposed deployment inside Emirates

1. Run the UI, API, versioned rule engine, database and analytics in an approved environment.
2. Replace demo actors with server-mapped Emirates identities and role/request-level permissions. Retain human approval at every decision step.
3. Validate forms on the server and retain form, rule, workflow and model versions, overrides and reasons in the approved audit store.
4. Use approved adapters for permitted event ingestion, preserving source identifiers, ingestion time and replay/idempotency controls. Live integrations remain outside the challenge prototype.
5. Apply the organisation's encryption, retention, access, backup and security monitoring controls. Evaluate an appropriate enterprise audit mechanism.
6. Run model fitting/inference inside the approved boundary, retain feature snapshots and monitor errors, drift and calibration. Any future language model must use an explicitly permitted deployment without retention/training on the pack.
7. Pilot with comparable request cohorts. Measure completed turnaround, return rate and actual HR handling effort separately; check recommendation overlap before combining benefits.
