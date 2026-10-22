# Provisional data contract

**This is an adapter plan, not the official file schema.** The official synthetic pack has not been supplied. Only the filenames and high-level contents below come from the problem statement. Column names, identifiers, business meanings and timing conventions must be confirmed from the delivered pack.

## Expected inputs

| File | Expected purpose | Required interpretation to confirm |
| --- | --- | --- |
| `requests.csv` | Submitted request forms | Request ID, type, submission time, fields by type, and whether rows are initial or revised submissions |
| `p2p_event_log.csv` | Each request's recorded steps | Case linkage, event time, activity, actor, team, outcome and return reason; whether a timestamp marks entry, start or completion |
| `process_map.md` | Permitted steps, approvers and targets | Process versions, routing, dependencies, target-time scope and calendar |
| `validation_rules.md` | Checks for each request type | Mandatory versus advisory checks, source fields, exceptions and rule versions |
| `org_positions.csv` | Positions and organisational relationships | Position keys, grades, departments, reporting lines, occupancy and effective dating |
| Held-out in-flight test set | Requests to score without final outcomes | Exact file schema, prediction observation time, output format and label definition |

## Normalised internal records

The adapter should preserve original values and provenance alongside normalised fields. Do not silently fabricate missing owners, dependencies, outcomes or policy rules.

### Request

Minimum useful fields are a stable `requestId`, `requestType`, `submittedAt`, and the type-specific submitted form. Tracking additionally needs the observed `currentStep`, `status`, `owner` or team, applicable `targetHours` or deadline, and any dependency identifiers. Position-related requests may contain source/target position IDs, synthetic employee IDs, effective dates and justification.

Request snapshots need an observation timestamp. A revised form should remain linked to its earlier submission so rework can be reconstructed. Targets belong to the applicable process/rule version; a target missing from the official process must remain unknown.

### Event

Minimum useful fields are `requestId`, `step`, `timestamp`, and `outcome`. Include a stable source event ID when available, plus actor, team and return reason. If start and end times are separately recorded, retain both. Preserve source order or a tie-break field for simultaneous timestamps.

The event meaning determines the metric. A completion-to-completion interval includes all time between those events; it cannot automatically be called active processing or queue time. An in-flight interval ends at the stated observation time, not an invented completion event.

### Position and process configuration

Use stable position IDs and preserve department, grade, reporting relationship, occupancy and validity dates when supplied. Keep process steps, allowed transitions, human approver roles, rule IDs, dependencies and target-time definitions in versioned configuration. A present-day position snapshot may be insufficient to validate a historic request; record that limitation.

## Timing and quality rules

- Confirm timezone, daylight-saving treatment, timestamp precision and whether dates lack a time component.
- Confirm whether targets use elapsed hours, working hours or business days, and which workweek, holiday calendar and pause rules apply. The demo uses illustrative elapsed-hour targets.
- Validate foreign keys and request-type values; list unresolved links rather than discarding them unnoticed.
- Detect exact duplicates, repeated legitimate activities, out-of-order events, negative intervals and multiple apparent terminal events. Document each handling rule.
- Treat missing or ambiguous data as unknown. A request with no terminal event is not necessarily completed, and a missing return reason is not proof that no return occurred.
- Keep the synthetic pack within the approved environment. Do not introduce employee-identifying data or external retention/training services.

## Replacing demo data

1. Preserve the supplied files unchanged in an approved local location; record their version and extraction date.
2. Profile schemas and agree column mappings and event semantics before import.
3. Add an adapter to the normalised request/event/position structures without changing the source files.
4. Replace every illustrative validation rule, target and route with the confirmed configuration; retain rule IDs and provenance.
5. Reconcile counts, sample request journeys and durations against the source pack. Surface rows that cannot be interpreted safely.
6. Recompute status and process metrics at a declared observation time; separate open and completed intervals.
7. Train and evaluate the two outcome baselines using the blueprint's chronological, case-grouped protocol. Replace the generated-data models and their scope label only once official-pack training and validated prediction results exist.
8. Recalculate recommendations and savings from the official observations; retain assumptions and overlap adjustments. Do not relabel the demo estimates as official findings.
9. Validate the held-out test schema and freeze the scoring pipeline before producing the final prediction file.

## Browser-local scoring

The MVP accepts a provisional normalized requests CSV with unique `id`, supported `type`, valid `submittedAt` and positive `targetHours`, plus the form fields described above. An optional event CSV requires `id`, `requestId`, `step` and `timestamp`; preserve its observed `outcome` and evidence fields. Request and event IDs must be mapped consistently before scoring. Selected files stay in browser memory and are not posted to the shared API.

Outputs identify observation time, separate delay/return probabilities, observed-versus-forecast flags, model version, synthetic training scope, data warnings and supporting evidence. This is an adapter demonstration, not a claim that the unknown official schema or judge submission format is already supported.
