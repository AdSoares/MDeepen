# Smoke materials

Documents and checklists for the manual smoke each slice ends with. They live here rather
than in a scratch directory because a deferred smoke is run in a later session, and
regenerating the material is both wasteful and a way to quietly change what is being tested.

| File | Slice | What it is |
| --- | --- | --- |
| `smoke-2.2.md` | 2.2, 2.3 | A 24-section handbook. Its term distribution is known — `chrony` occurs in one section, `acquirer` and `settlement` in 16 of 24 — which is what makes the chat ranking checks meaningful |
| `smoke-2.3-guia.md` | 2.3 | The 16 chat checks |
| `smoke-2.4.md` | 2.4 | **Disposable.** Nine sections, each written around one diagram type, plus planted fake credentials and two sections prepared for the refusal cases. The smoke writes into this file, renames one of its headings and duplicates another |
| `smoke-2.4-guia.md` | 2.4 | The 16 diagram checks |

`smoke-2.4.md` is meant to be copied before use, or discarded afterwards and restored with
`git checkout`. Every other file here is read-only in practice.

**Slice 2.4's smoke has not been run.** See the plan at
`docs/superpowers/plans/2026-08-21-mdeepen-slice2.4-diagrams.md`, Task 8 Step 6, for what
that leaves unverified.
