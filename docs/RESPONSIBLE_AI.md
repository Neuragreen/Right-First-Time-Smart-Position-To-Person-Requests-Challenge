# Responsible AI and security

Only generated synthetic records are included. The prototype neither connects to live HR systems nor makes personnel decisions. Human reviewers explicitly approve, return and process each workflow stage. Rules check submissions; statistical models and the assistant provide decision support.

## Evidence and model limitations

Two local logistic baselines estimate delay and correction returns. Forecasts expose model version, contributing features and event references. Observed late/returned/completed facts are distinguished from future forecasts. The model card discloses generated training data, chronological separation, maturity purging, weak return recall and extrapolation limits. Synthetic probabilities are not validated Emirates likelihoods. Recommendation reduction rates are assumptions; elapsed wait is not HR handling effort or financial savings.

The assistant uses local intent matching and permitted demo-record lookup, cites records and abstains when unsupported. It does not call an external language model. Browser-selected CSV files remain in browser memory and are not posted to the server.

## Local demonstration controls

The standalone judge runner listens only on 127.0.0.1 and uses one fictional local identity. Actor selection demonstrates role responsibilities; it is not enterprise access control. Local SQLite persists state and the application action journal under ignored `.local-data/`. Same-origin writes, server-side validation, version checks and atomic journal insertion protect workflow actions. The journal survives in-app resets; it is not a certified tamper-proof enterprise audit system. Do not expose this demo server publicly or enter real employee information.

## Deployment inside Emirates

Deploy the UI, API, rules, database and inference inside the approved environment. Replace demo identity with approved organisational sign-on and server-side role/request permissions. Configure encryption, retention, backup, monitoring, secret management and independent audit controls under Emirates policy. Validate official workflows, calendars, rules and dependency semantics before a controlled pilot. Evaluate accuracy, calibration, process outcomes and actual handling effort; keep all employee decisions with authorised humans. Any future language model requires an approved private deployment and data-handling review.
