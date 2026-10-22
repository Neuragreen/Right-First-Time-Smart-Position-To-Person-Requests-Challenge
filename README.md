# P2P Compass
<img width="2281" height="1654" alt="image" src="https://github.com/user-attachments/assets/c5da21ad-eb9a-4f99-bb4c-4966933175d0" />


**Right-first-time Position to Person requests, visible ownership and evidence-led process improvement.**

A working prototype for the Right-First-Time Smart Position To Person Requests Challenge. It supports managers, HR operations specialists and HR process owners across transfers, position creation, end-of-service position actions and position deletion.

> **Submission data statement:** The organiser historical data pack and held-out test set had not been made available to our team at submission time. This submission therefore uses clearly labelled synthetic demonstration data only. **No official test-set predictions are submitted.** Synthetic model scores and improvement scenarios are demonstrations, not Emirates results. See [submission status](docs/SUBMISSION_STATUS.md).

## Run the website locally

Install **Node.js 22.13 or newer** (a current LTS version is recommended). From this repository folder:

```sh
npm start
```

Open **http://127.0.0.1:4173**. No dependency installation, build, sign-in, API key or cloud database setup is required for this local judge version. It uses Node's built-in SQLite; some Node versions print an experimental SQLite warning, which does not prevent startup.

Stop with **Ctrl+C**. Request changes persist in `.local-data/p2p.sqlite`, which is excluded from Git. Browser tabs share this fictional demo workspace; updates refresh every five seconds. Keep this demonstration bound to your own computer. Actor switching simulates roles and is not production authentication.

If port 4173 is occupied, use `PORT=4174 npm start` on macOS/Linux, or `$env:PORT=4174; npm start` in PowerShell, and open the matching address. For a pristine demonstration, stop the server and rename `.local-data`, then restart. The in-app reset restores fixtures while preserving the action journal.

## Submission materials

| Deliverable | Location |
| --- | --- |
| Working local website and source | This repository; `npm start` |
| Solution note, including responsible AI and Emirates deployment; **2 pages** | [Solution note PDF](submission/output/pdf/P2P_Compass_Solution_Note.pdf) |
| Top process recommendations and estimated time saved | [Recommendation report PDF](submission/output/pdf/P2P_Compass_Process_Recommendations.pdf) |
| Recorded demonstration; **2 minutes 55 seconds** | [demo.mp4](demo-video/demo.mp4) |
| Why official test predictions are absent | [Submission status](docs/SUBMISSION_STATUS.md) |
| Supporting generated data, model report and scenario evidence | [Synthetic evidence](submission/evidence/) |

## Explore the prototype

1. Select an Airport Operations manager, open **Submit a request**, and choose **Try an example**. Inspect field-level checks and correct the form before submitting.
2. Open a request to see its status, next owner, validation evidence, dependency links and event timeline.
3. Switch to the named fictional HR owner or approver. Review the form and explicitly advance or return the request with a reason. Correct and resubmit as its manager to inspect retained revisions.
4. Open **Process insights**. Filter by request type, team or period; inspect stalls, return loops, process variation and the request/event evidence behind each recommendation.
5. Open **Data & predictions** and **Evidence & coverage** to inspect separate delay/return forecasts, explanations, the model card, downloads and action journal.
6. Ask the **Assistant** about a request or next action. Switch to Arabic to explore the right-to-left interface and grounded Arabic answers.

All approvals require explicit human actions. No live HR integration or real employee data is included. Selected CSVs are processed locally in browser memory. No external model API is called.

## Evidence and limitations

The workflow demonstration contains 32 generated requests; 20 are in flight at the fixed report cutoff of **23 October 2026, 00:00 UTC**. A separate generated history of 1,200 cases trains and evaluates two logistic baselines. The model card discloses the chronological holdout, maturity purging, feature evidence and limitations. Return recall at the current threshold is low; probabilities are uncalibrated synthetic estimates and must not guide real personnel decisions.

Recommendation scenarios estimate **112 h**, **51 h** and **103 h** of aggregate elapsed time under stated reduction assumptions. These are not measured labour savings, financial benefits or monthly estimates. Open waits are censored at the report cutoff. Do not add the figures without reconciling overlap. Running UI totals can differ as time advances.

Reproduce the supporting fixed-cutoff evidence:

```sh
node submission/generate-demo-evidence.mjs
```

This produces demonstration evidence only, with checksums; it does not generate official test-set predictions.

## Verification and technical documentation

```sh
npm test
```

**42 automated checks** cover validation, explicit human workflows, persistence, concurrency, audit history, origin protection, prediction leakage, analytics, evidence, bilingual assistant behaviour and the standalone local server. Tests use only Node built-ins and need no package installation.

- [Requirements coverage](docs/MVP_COVERAGE.md)
- [Architecture and proposed Emirates pilot](docs/BLUEPRINT.md)
- [Provisional organiser-data adapter contract](docs/DATA_CONTRACT.md)
- [Responsible AI and security](docs/RESPONSIBLE_AI.md)

The optional Vinext/Cloudflare adapter is retained for deployment reuse. It is separate from the dependency-free judge runner: `npm ci`, `npm run build`, and `npx tsc --noEmit` validate that adapter. Its database, identity and hosting configuration require environment-specific provisioning. See the architecture document; use `npm start` for judging.
