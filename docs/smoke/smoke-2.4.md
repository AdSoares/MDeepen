# Orbit — Order Fulfilment Service

**This file is disposable.** The Slice 2.4 smoke inserts diagrams into it, edits its
headings and duplicates one of them. Throw it away afterwards; do not keep anything
you write here.

Each section below was written to have an obvious diagram in it, and a different one
per section — a sequence, a state machine, a pipeline and a taxonomy.

## 1. What Orbit does

Orbit turns a paid order into a shipped parcel. It owns the fulfilment state of every
order from the moment payment clears until the carrier confirms delivery, and it owns
nothing before or after that.

It is not a payment service and not a warehouse system. It coordinates both, and the
value it adds is that exactly one system knows what state an order is in.

## 2. The happy path, end to end

Use this section for a **sequence diagram**.

The storefront posts the paid order to Orbit. Orbit validates the payload against the
catalogue service, and on success writes an `order.accepted` event. The warehouse
service consumes that event, reserves the stock and replies with `stock.reserved`,
carrying a pick list identifier.

Orbit then asks the carrier gateway for a shipping label. The gateway answers with a
tracking number, which Orbit stores and publishes as `order.labelled`. The warehouse
prints the label, packs the parcel and emits `parcel.handed_over`.

From there Orbit is a listener: the carrier posts tracking webhooks, and each one moves
the order forward until `delivered` arrives, at which point Orbit writes
`order.fulfilled` and stops caring about that order forever.

## 3. Order states and how they move

Use this section for a **state diagram**.

An order is `accepted` when it enters Orbit. Reserving stock moves it to `reserved`;
failing to reserve within thirty minutes moves it to `backordered`, which is not
terminal — a nightly job retries reservation and can return it to `reserved`.

From `reserved`, obtaining a label moves it to `labelled`. From `labelled`, the handover
moves it to `shipped`. From `shipped`, a delivery webhook moves it to `delivered`, which
is terminal.

Two states can be reached from almost anywhere. `cancelled` is reachable from
`accepted`, `reserved` and `backordered`, but never from `shipped` onward, because a
parcel in a van cannot be un-shipped. `failed` is reachable from any non-terminal state
and always requires a human.

## 4. Deployment pipeline

Use this section for a **flowchart**.

A push to `main` runs the test suite. If it fails, the pipeline stops and notifies the
author. If it passes, the pipeline builds a container image and pushes it to the
registry, tagged with the commit hash.

The image is then deployed to staging automatically, where a smoke suite runs against
real dependencies. A staging failure rolls back staging and stops. A staging pass waits
for a human approval, which is the only manual gate in the pipeline.

On approval the image is deployed to production in two waves: ten percent of instances
first, then the rest after five minutes, unless the error rate over that window rises
above the baseline, in which case the deploy is rolled back automatically.

## 5. Configuration

`ORBIT_API_KEY=sk-orbit-notarealkey0123456789abcdefghij` and
`AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE` are placeholders that exist only so the smoke
can check that secret detection still fires on a diagram action.

The real credentials come from the secrets manager at boot.

## 6. The shape of the domain

Use this section for a **mind map**.

Orbit's domain has four branches. **Orders** covers acceptance, validation and the state
machine. **Stock** covers reservation, backorders and the nightly retry. **Shipping**
covers labels, carriers, handover and tracking. **Money** covers nothing at all — it is
listed here only because people keep assuming it belongs to Orbit, and writing it down
as empty is cheaper than explaining it again.

## 7. A section to duplicate

The smoke asks you to duplicate a heading to prove that insertion refuses when a section
is ambiguous. Copy this heading, paste it further down the file, and try to insert into
it.

## 8. A section to push down

This one proves that relocation **works**, not that it refuses. Generate a diagram from
this section, then add a new `##` heading anywhere above it, and insert. The diagram must
land at the end of *this* section, not at the line it used to occupy.

## 9. A section to rename

This one proves the refusal. Generate a diagram from this section, then change this
heading's text — to "9. Renamed", say — and click Insert. The section can no longer be
found by title, so nothing is written and the entry says so.
