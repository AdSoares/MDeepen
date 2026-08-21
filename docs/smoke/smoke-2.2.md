# Meridian — Payment Reconciliation Platform

Internal engineering handbook for Meridian, the service that reconciles card
settlements against the ledger. Written to be read end to end, which is exactly
why it doubles as a summarization test: each section makes claims the others do
not, and the last section carries a decision that appears nowhere else.

## 1. What Meridian is for

Meridian answers one question for every payment: did the money we think we took
actually arrive, and does the ledger agree. It sits between the acquirer's
settlement files and the double-entry ledger, and it owns the reconciliation
verdict for each transaction.

It is not a payment gateway. It never authorizes, captures or refunds. It reads
what other systems did and decides whether the records line up. That boundary
has been challenged three times by teams wanting Meridian to "just issue the
refund while it is there", and has held each time, because a service that both
judges and acts on discrepancies cannot be audited by anyone who does not trust
it completely.

The service handles roughly 4.2 million transactions a day across eleven
acquirers, with a settlement window that closes at 03:00 UTC. Everything in this
handbook is downstream of that deadline: the pipeline exists to have a defensible
answer before the finance team opens its books at 08:00 local.

## 2. The settlement file pipeline

Acquirers deliver settlement files by SFTP, one file per acquirer per day, in
seven mutually incompatible formats. Three are fixed-width, two are CSV with
different quoting rules, one is a proprietary binary layout, and one is XML that
claims to be ISO 20022 but omits four mandatory elements.

Each format has an adapter that produces the canonical settlement record. The
adapters share no code beyond the target type, deliberately: an early attempt at
a shared parsing framework meant a quoting fix for one acquirer broke another,
and the outage lasted six hours because nobody expected those two to be coupled.

Files arrive between 22:00 and 02:30 UTC. Late arrival is normal, not
exceptional: two acquirers have missed the window on more than 40% of business
days over the last year. The pipeline therefore never waits for a complete set.
It processes what it has, marks the rest as pending, and reruns per-acquirer as
files land.

Every file is archived byte-for-byte before parsing, in an S3 bucket with object
lock set to seven years. When an acquirer disputes what they sent us, the archive
is the answer, and it has settled four disputes in Meridian's favour.

## 3. Configuration and credentials

Meridian reads its configuration from the environment, and every credential below
is a placeholder that exists only for documentation and tests.

- `MERIDIAN_DB_URL=postgres://meridian:hunter2@db.internal:5432/meridian`
- `ANTHROPIC_API_KEY=sk-ant-api03-notarealkey0123456789abcdefghijklmnopqrstuv`
- `AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE`
- `GITHUB_TOKEN=ghp_0123456789abcdefghijklmnopqrstuvwxyzAB`

The SFTP private keys are not in the environment. They live in the secrets
manager and are fetched at boot, because rotating an environment variable means
a redeploy, and key rotation happens on the acquirer's schedule rather than ours.

Session tokens issued to the internal API look like
`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJtZXJpZGlhbiJ9.not-a-signature`
and last fifteen minutes. The redaction filter runs before the log formatter, not
after it, so a custom formatter cannot leak a value the filter already replaced.

## 4. The matching engine

Matching runs in three passes, cheapest first, and a transaction leaves the
pipeline as soon as a pass claims it.

The first pass matches on the acquirer reference, which is unique per acquirer
per day. It resolves about 94% of the volume and costs one index lookup per
record. The second pass matches on the tuple of amount, currency, card last four
and capture timestamp within a two-minute window; it resolves another 5%, mostly
transactions where the acquirer regenerated its reference after a retry. The
third pass is a bounded fuzzy match over amount and timestamp with a widened
window of thirty minutes, and it exists only to produce candidates for a human.

Nothing is auto-matched by the third pass. It proposes; an operator disposes. The
temptation to auto-accept high-confidence fuzzy matches has been resisted because
the failure mode is silent: a wrong auto-match produces a clean-looking ledger
that is wrong, which is worse than an obvious exception queue.

## 5. Exceptions and the operator queue

Anything unmatched after three passes becomes an exception with a typed reason:
`missing_in_ledger`, `missing_in_settlement`, `amount_mismatch`,
`duplicate_candidate`, or `currency_mismatch`.

The queue is deliberately small. If it grows past 500 open items the pipeline
raises an alert, on the theory that a large queue is not a staffing problem but a
signal that something upstream changed shape. That threshold has fired eleven
times in two years, and in nine of those the root cause was an acquirer changing
a field without notice.

Operators can resolve, defer or escalate. Resolution requires a reason code and
free text; the free text is mandatory because the reason codes are always
slightly wrong and the text is what the auditors actually read.

## 6. The ledger contract

Meridian never writes to the ledger. It emits `ReconciliationCompleted` and
`ReconciliationFailed` events, and the ledger service decides what to post.

This is the second boundary that has been challenged and held. Writing directly
would be faster and would remove an entire class of eventual-consistency bugs,
but it would also mean two services could post to the ledger, and the ledger's
whole value is that exactly one thing writes to it.

Events carry the transaction id, the verdict, the matched settlement record id,
and a monotonic sequence number per transaction. Consumers deduplicate on the
sequence number rather than the event id, because retries produce new event ids
for identical facts.

## 7. Idempotency

Every pipeline stage is idempotent on `(transactionId, stageName, inputHash)`.
Reprocessing a settlement file is therefore safe and is done routinely: when an
acquirer sends a corrected file, we replay rather than patch.

The input hash matters. Without it, a replay of a corrected file would be treated
as a duplicate of the original and silently skipped, which is precisely the bug
that shipped in the first version and took nine days to notice.

Idempotency records are kept for 30 days, then dropped. A replay older than that
is treated as new work, which is acceptable because settlement disputes past 30
days go through the manual process anyway.

## 8. Retries and backoff

Retries apply only to idempotent operations and only to transient failures: 429,
502, 503, 504, connection resets, and SFTP timeouts. Everything else fails fast.

Backoff starts at 200ms, doubles, and is capped at 8 seconds, with full jitter.
Past the cap the circuit breaker for that upstream opens for 30 seconds and lets
a single probe through before closing. The breaker is per-upstream and never
global: one slow acquirer must not stop the other ten.

There is no retry budget across the pipeline as a whole, and that is a known gap.
A pathological day can spend a large fraction of its wall clock in backoff, and
the only current mitigation is the settlement deadline alert firing at 02:00.

## 9. Observability

One span per transaction, one child span per pipeline stage, with the pass number
and the match reason as span attributes. A three-pass match shows as three
siblings rather than one opaque gap.

Metrics are per-acquirer and per-stage: throughput, exception rate, and duration
percentiles from a histogram rather than an average. The average hides the tail,
and the tail is where the deadline is lost.

Alerts fire on symptoms — exception rate, deadline risk, queue depth — never on
log patterns. An alert defined on a log string breaks the day someone rewords the
log line, and that has happened twice in systems this team has owned.

## 10. Data retention

Canonical settlement records live for seven years, matching the object lock on the
raw archive. Exceptions and their resolution notes live for seven years too, for
the same audit reason.

Trace data lives for 14 days, metrics for 13 months. The asymmetry is deliberate:
traces answer "what happened to this request" and lose value quickly, while
metrics answer "what is the shape of our load" and are compared year over year.

Personal data in settlement records is limited to card last four and the acquirer
reference. Full PANs never enter Meridian; a file containing one is rejected at
the adapter boundary and raises a security incident.

## 11. Deployment

Blue-green, one deploy per day at most, never between 20:00 and 04:00 UTC. The
deployment freeze during the settlement window is not negotiable and has been
enforced by tooling since someone deployed at 01:40 and reprocessed a day twice.

Migrations are expand-contract and always ship in a separate release from the
code that uses them. A migration and its consumer in the same deploy means the
rollback path requires a down-migration, and down-migrations on a seven-year
audit table are not a thing anyone should do at 02:00.

## 12. Failure drills

Meridian runs a monthly game day against the staging environment with one of six
scripted failures: an acquirer file that never arrives, a file with a shifted
column, a ledger service returning 500 for ten minutes, a database failover, an
S3 outage in the archive path, and a clock skew of four minutes on one node.

The clock skew drill is the one that keeps finding bugs. Three of the last six
game days surfaced a real defect from it, all in the second matching pass, all
because a two-minute window is not much larger than the skew we tolerate.

## 13. Known weaknesses

The third matching pass is O(n log n) in the exception set and has never been
profiled against a day where the first pass fails broadly. If an acquirer changed
its reference format silently, the fallback path would be exercised at a volume
it has never seen.

The seven adapters share no code, which is a deliberate choice that costs real
duplication. Two of them have diverged in how they treat a trailing empty field,
and neither behaviour is documented as correct.

There is no end-to-end test that spans a real settlement file to a posted ledger
entry. The pieces are tested; the seam is not.

## 14. The canonical settlement record

Every adapter produces this record and nothing else. Fields marked required are
rejected at the adapter boundary when absent, which means a malformed file fails
loudly at parse time rather than quietly at match time.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `settlementId` | uuid | yes | Generated by Meridian, not the acquirer |
| `acquirerId` | string(8) | yes | Stable across the acquirer's lifetime |
| `acquirerReference` | string(64) | yes | Unique per acquirer per settlement date |
| `settlementDate` | date | yes | The acquirer's date, not ours; timezone is per-acquirer |
| `capturedAt` | timestamptz | yes | Normalized to UTC at the adapter |
| `grossAmountMinor` | int64 | yes | Minor units; no floats anywhere in the pipeline |
| `feeAmountMinor` | int64 | yes | Always positive; the sign convention is applied downstream |
| `netAmountMinor` | int64 | yes | Must equal gross minus fee, checked at parse |
| `currency` | string(3) | yes | ISO 4217; a currency we do not trade is a hard failure |
| `cardLastFour` | string(4) | no | Absent for two acquirers; never used as a sole match key |
| `schemeName` | enum | yes | visa, mastercard, amex, elo, hipercard |
| `transactionType` | enum | yes | sale, refund, chargeback, representment |
| `originalReference` | string(64) | no | Set for refunds and chargebacks; points at the sale |
| `rawFileId` | uuid | yes | Foreign key into the byte-for-byte archive |
| `rawLineNumber` | int32 | yes | Together with rawFileId, reproduces the source line |

Two fields exist purely for auditability: `rawFileId` and `rawLineNumber`. Any
record in Meridian can be traced to the exact line of the exact file the acquirer
sent, and that pairing is what makes the archive useful rather than decorative.

The `netAmountMinor` check at parse time is the single most valuable validation in
the pipeline. It has caught four acquirer-side bugs, three of which the acquirer
did not know about until we showed them the failing line.

## 15. Runbook — an acquirer file never arrives

Symptom: the pipeline reports pending for one acquirer past 02:00 UTC and the
deadline alert fires.

First, confirm the file is genuinely absent rather than unparseable: check the
SFTP landing bucket for the acquirer prefix. An empty prefix means absent; a file
present but not archived means the adapter rejected it, which is a different
runbook.

If absent, check the acquirer status page and the shared mailbox before paging
anyone. Two of the eleven acquirers announce delays by email and nothing else.

If the file is genuinely late and unannounced, the escalation path is the
acquirer's operations contact, not our own on-call. Meridian being late because
an input is late is the expected behaviour, not an incident. Record the delay in
the daily reconciliation note so the finance team is not surprised at 08:00.

Do not fabricate an empty settlement file to unblock the pipeline. This has been
tried, and it produced a day where every transaction reported
`missing_in_settlement`, which took longer to unwind than simply waiting.

## 16. Runbook — a file with a shifted column

Symptom: an adapter parses a file successfully but the exception rate for that
acquirer jumps above 20%, usually with `amount_mismatch` dominating.

A shifted column is the most common silent format change. The fixed-width
adapters are the vulnerable ones: a new field inserted upstream shifts everything
after it, and the parse still succeeds because every field is still the right
width and character class.

Diagnosis: take the `rawFileId` from any three failing records, pull those exact
lines from the archive, and compare them against yesterday's file for the same
acquirer. A visual diff of two raw lines finds this in under a minute.

Remediation: do not patch the adapter under time pressure. Mark the acquirer's
day as quarantined, which stops event emission for those transactions, and fix
the adapter with a test built from the archived line. Then replay. The replay is
safe because every stage is idempotent on the input hash, and the corrected file
produces a different hash from the original.

## 17. Runbook — the ledger service is returning 500

Symptom: `ReconciliationCompleted` events accumulate in the outbox and the
consumer lag metric climbs.

Meridian does not retry ledger delivery itself beyond the standard backoff. The
outbox is the buffer, and it is sized for four hours of full-rate accumulation.
Below four hours, do nothing but watch: the consumer will catch up.

Past four hours, the decision is whether to shed. Shedding means dropping the
oldest events, and it is never correct here, because the ledger is the system of
record and a dropped verdict is a transaction that is silently unreconciled.
Instead, the outbox spills to S3 and replays from there, at the cost of ordering
guarantees within a transaction — which is why consumers deduplicate on the
per-transaction sequence number rather than on arrival order.

If the ledger outage crosses the settlement deadline, the reconciliation is late,
and late is allowed. Notify finance; do not improvise.

## 18. Runbook — database failover

Symptom: connection errors for 10 to 40 seconds, then recovery, with a burst of
stage retries.

Meridian tolerates failover without intervention. Stages are idempotent, the
connection pool retries with backoff, and in-flight work replays. The only thing
worth checking afterwards is the idempotency table: a failover during a write to
it can leave a stage marked started and never finished.

The query for orphaned stage records is in the operations repository under
`queries/orphaned_stages.sql`. Anything older than one hour with no terminal
state is safe to clear, which returns the transaction to the pipeline for a clean
retry.

Failover has happened five times in production. Four were invisible to the
finance team. The fifth crossed the settlement deadline by eleven minutes and was
still, correctly, not an incident.

## 19. Runbook — clock skew on one node

Symptom: intermittent second-pass match failures concentrated on one node, often
with `duplicate_candidate` exceptions that make no sense on inspection.

The second matching pass uses a two-minute window around `capturedAt`. A node
whose clock has drifted by more than about ninety seconds will place transactions
outside their own window, and the failure looks like data corruption rather than
a clock problem.

Diagnosis: compare `chrony` offset across nodes before looking at anything else.
This is the first check, not the last, because three of the last six game days
found real defects here and each time the first hour was spent elsewhere.

Remediation: drain the node, correct the clock, and replay the affected window.
Do not widen the matching window as a mitigation. The window is two minutes
because a wider one produces false matches, and a false match is a wrong verdict.

## 20. Architecture decisions, abridged

**ADR-001 — Meridian judges, it does not act.** The service produces verdicts and
never mutates payment state. Rejected alternative: allow automatic refunds for
`missing_in_ledger`. Rationale: a service that both judges and acts cannot be
audited by a party that does not already trust it.

**ADR-002 — Seven adapters, no shared parsing framework.** Rejected alternative: a
configurable parser driven by per-acquirer schemas. Rationale: an earlier shared
framework coupled acquirers so tightly that a quoting fix for one broke another,
costing six hours of downtime. Duplication is cheaper than that coupling.

**ADR-003 — Events, not direct ledger writes.** Rejected alternative: Meridian
writes ledger entries directly under a shared transaction. Rationale: exactly one
service writes to the ledger, and that property is worth more than the latency.

**ADR-004 — Minor units everywhere, no floating point.** No alternative was
seriously considered. Recorded because new joiners ask about it monthly.

**ADR-005 — The third pass proposes, never decides.** Rejected alternative:
auto-accept fuzzy matches above a confidence threshold. Rationale: the failure
mode is a clean-looking wrong ledger, which is worse than a visible queue.

**ADR-006 — Archive before parse, seven-year object lock.** Rejected alternative:
archive the parsed canonical record only. Rationale: disputes are about what the
acquirer sent, not about what we understood.

## 21. Incident digest

**2024-03 — The double-processed day.** A deploy at 01:40 UTC restarted the
pipeline mid-run and reprocessed a partially complete settlement day. Idempotency
prevented duplicate verdicts, but the exception queue doubled and took two days
to drain by hand. Outcome: the deployment freeze between 20:00 and 04:00, enforced
by tooling rather than convention.

**2024-07 — The silent replay skip.** A corrected file from an acquirer was
treated as a duplicate of the original and skipped, because the idempotency key
did not include the input hash. Nine days passed before anyone noticed the
uncorrected verdicts. Outcome: `inputHash` became part of the key, and a test now
asserts that a changed file replays.

**2025-01 — The coupled quoting fix.** A CSV quoting fix for one acquirer changed
behaviour for another that shared the parsing framework. Six hours of downtime.
Outcome: ADR-002, and the deliberate duplication that followed.

**2025-06 — The four-minute clock.** A node drifted by four minutes after a
hypervisor migration. Second-pass matches failed in a pattern that looked like
acquirer data corruption; the first hour of the investigation was spent reading
settlement files. Outcome: clock offset became the first item on the diagnostic
checklist, and a game day scenario was written for it.

**2025-11 — The queue that was a signal.** The exception queue passed 500 and the
alert fired. Root cause was an acquirer adding a field without notice. This is
recorded not as a failure but as the alert working exactly as designed: the
threshold exists to detect upstream change, not to measure staffing.

## 22. Capacity and cost

Steady state is 4.2 million transactions a day, with a peak-hour rate of about
310,000. The pipeline is provisioned for 2.5 times peak, which sounds generous
until you remember that a late file compresses a full day's work into the two
hours before the deadline.

The dominant cost is not compute. It is the seven-year archive: object storage
with object lock, growing at roughly 240 GB a month, and it cannot be tiered to
the cheapest class because dispute retrieval must complete within minutes.

The second cost is the database, sized for the seven-year canonical record table
rather than for query load. Partitioning by settlement month keeps the working
set small; the older partitions are read perhaps twice a year, during audits.

Compute is a rounding error by comparison, which is why no one has ever been
asked to optimize the matching passes for cost. They are optimized for
correctness, and that has never been in tension with the budget.

## 23. The decision that governs everything else

Meridian is allowed to be late, and is never allowed to be wrong.

That single ordering resolves every trade-off in this handbook. It is why the
third pass proposes instead of deciding, why nothing auto-matches on fuzzy
confidence, why the exception threshold alerts rather than auto-resolves, and why
the service emits events instead of writing to the ledger. When a proposal makes
Meridian faster at the cost of a small chance of a wrong verdict, the proposal
loses, and it loses without further discussion.

The one exception ever granted was the settlement deadline alert at 02:00, which
trades a small false-positive rate for early warning. It was granted because
being late loudly is still being right.
