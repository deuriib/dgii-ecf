# Regression lock — mechanism and Reality Checker close decision

## The lock, stated honestly

#127 is a documentation defect with a hard non-goal of "no test change". No unit test asserts on
markdown prose, and inventing a red/green test that asserts nothing would violate the close rule's
own spirit ("a green test that was not observed red for the recorded cause does not satisfy").

The lock chosen for this defect class is **provenance + register link**, and it is structural, not
prose:

1. **Every corrected statement re-traces to an extractable DGII document, or is explicitly labelled
   an SDK rule.** The corrected text names its source (Norma General 01-2020 Art. 8 ¶I; TEC-10's
   "no son necesarios"; the SDK symbols `B2B_EXCLUDED_TYPES` / `checkB2BApplicability` /
   `enforceB2BRules`). A future change that re-introduces "DGII requires X" without a source is now
   visibly un-cited.
2. **`dgii-ground-truth.md` links `project-tasks/124-source-register.md` from its header** as the
   verifiable companion. A future audit starts from the register's evidence instead of re-deriving the
   34/43-document provenance from scratch.

The red reproduction (`red-reproduction.md`) is the observed failing state; the green verification
(`green-verification.md`) is each corrected claim re-traced or re-labelled.

No automated CI check was added (no Observability Reviewer signal — `devops-automator` dropped per
the roster rule: a row cited by no gate is removed). If a cheap automated check is ever wanted, the
only honest candidate is a `grep`-based lint that fails when `dgii-ground-truth.md` contains a
"Decreto 587-24 Art." / "Norma General 01-2020 Art. 14" citation without a matching register row —
proposed, not shipped, because it would assert on citation style, not on the defect's cause.

## Reality Checker close decision

Verdict: **PASS** (withdrawn from the default NEEDS WORK) — close case (a) "fixed".

Rationale against the close rule:

- The recorded cause (unsourced / mis-cited claims, no register link) is exactly what the fix removes
  or re-labels, and each finding carries a source or code citation in `green-verification.md`.
- No fabricated unit test is claimed as the lock; the lock is provenance + register link, and it is
  present in the diff (header link + per-statement sources).
- The diff is confined to the two non-goal-permitted files; no SDK/test/docs-site/CHANGELOG change.

Scope-list arithmetic: N = 1 → after this close, **N = 0** (backlog drained).
