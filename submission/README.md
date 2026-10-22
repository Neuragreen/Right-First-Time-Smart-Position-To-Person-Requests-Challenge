# Final submission

- [Two-page solution note](output/pdf/P2P_Compass_Solution_Note.pdf), including responsible AI, local setup and proposed deployment inside Emirates.
- [Process recommendations](output/pdf/P2P_Compass_Process_Recommendations.pdf), with request/event references, assumptions and estimated elapsed time saved.
- [Recorded demo](../demo-video/demo.mp4): 175 seconds, within the three-minute limit.
- [Submission status](../docs/SUBMISSION_STATUS.md): organiser data unavailable at submission; no official test predictions submitted.
- [Supporting synthetic evidence](evidence/): generated requests/events, model report, scenario calculations and checksums. These are not organiser data or official test results.

Run the website with `npm start` from the repository root. No account, cloud provisioning or dependency installation is needed. Editable Markdown copies of the two reports are also provided here.

Reproduce fixed-cutoff evidence with `node submission/generate-demo-evidence.mjs`. The cutoff is 23 October 2026, 00:00 UTC; current UI waits will grow with time. Preparation scripts, obsolete bundles and recording instructions are not part of this final submission.
