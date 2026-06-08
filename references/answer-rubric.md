# Answer rubric (semantic self-review)

After `ultradoc check` passes (structural: every citation resolves), review the
answer against this rubric before presenting. If any item fails, retrieve more
(see `retrieval-playbook.md`) and rewrite. `check` proves the citations are
real; this proves the answer is actually *good*.

## 1. Completeness
- Does the answer address **every** part of the question? Multi-part questions
  need every part covered or explicitly marked unknown.
- Are the obvious follow-ups the user will have answered (defaults, edge cases,
  the "but what about X")?

## 2. Grounding
- Is **every** factual claim tied to evidence, not to prior knowledge of the
  library? A sentence with a fact and no citation is a red flag.
- Do the cited snippets actually say what the sentence claims? Re-read them.
- Did you avoid asserting anything the evidence doesn't show?

## 3. Precision
- Behavioral claims reflect what the **code does**, not what a name suggests.
- Exact identifiers, option names, defaults, and values are quoted correctly.
- File/line, issue/PR numbers, and URLs come from the evidence.

## 4. Recency & version
- Is the answer pinned to the commit in `meta.json` when it matters?
- If an open PR or recent issue changes the picture, is that stated (current
  behavior vs. proposed/forthcoming)?

## 5. Honesty about gaps
- Unknowns are stated plainly, not glossed or guessed.
- If sources disagree (e.g. docs vs. code, an issue vs. current code), the
  discrepancy is surfaced rather than silently resolved.

## 6. Usefulness
- Concise. No filler, no restating the question, no hedging.
- Leads with the answer; supporting detail and citations follow.
- Links the user can click (the evidence URLs) are included.

A good answer reads like a knowledgeable maintainer replying with receipts —
direct, specific, and every claim backed by a pointer to the source.
