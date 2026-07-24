# Changelog

All notable changes to this project are documented here, generated automatically from the [Conventional Commits](https://www.conventionalcommits.org/) by [semantic-release](https://github.com/semantic-release/semantic-release).

## [2.7.1](https://github.com/maxgfr/ultradoc/compare/v2.7.0...v2.7.1) (2026-07-24)


### Bug Fixes

* **index:** route symbol extraction through the AST tier ([f4b6d6d](https://github.com/maxgfr/ultradoc/commit/f4b6d6d45fd44fc4b13a5806c65a14966b9b2c34))

# [2.7.0](https://github.com/maxgfr/ultradoc/compare/v2.6.0...v2.7.0) (2026-07-24)


### Features

* **engine:** re-pin codeindex v2.16.0 ([c301236](https://github.com/maxgfr/ultradoc/commit/c301236f2f1323fd2fb9dde192dd7143eb4550ec))

# [2.6.0](https://github.com/maxgfr/ultradoc/compare/v2.5.0...v2.6.0) (2026-07-24)


### Features

* **engine:** re-pin codeindex v2.15.0 ([910ae1d](https://github.com/maxgfr/ultradoc/commit/910ae1db20a6dd8b43e84dccf31dfb062e384118))

# [2.5.0](https://github.com/maxgfr/ultradoc/compare/v2.4.0...v2.5.0) (2026-07-24)


### Features

* **engine:** re-pin codeindex v2.14.0 ([0d98502](https://github.com/maxgfr/ultradoc/commit/0d98502aa53fb885fb4bc5dbf5663fc05a1e3161))

# [2.4.0](https://github.com/maxgfr/ultradoc/compare/v2.3.1...v2.4.0) (2026-07-24)


### Features

* **engine:** re-pin codeindex v2.13.0 ([d5606ad](https://github.com/maxgfr/ultradoc/commit/d5606addf0113c6cfc247c1eec1188f4b583f295))

## [2.3.1](https://github.com/maxgfr/ultradoc/compare/v2.3.0...v2.3.1) (2026-07-23)


### Bug Fixes

* **engine:** ship the codeindex v2.12.0 re-pin in a release ([f59651b](https://github.com/maxgfr/ultradoc/commit/f59651b8f0079a243c4ebf8554ebb8d8d591903b)), closes [#9](https://github.com/maxgfr/ultradoc/issues/9)

# [2.3.0](https://github.com/maxgfr/ultradoc/compare/v2.2.0...v2.3.0) (2026-07-23)


### Features

* **engine:** re-pin the codeindex engine at v2.10.0 ([a8af72e](https://github.com/maxgfr/ultradoc/commit/a8af72ed7d29ce3b3b3eb40328541f8a6cc11e97))
* **engine:** re-pin the codeindex engine at v2.11.0 ([3e41e78](https://github.com/maxgfr/ultradoc/commit/3e41e780432438fc7c1c32d759a7a48bc6cdd44f))
* **engine:** re-pin the codeindex engine at v2.11.1 ([3315318](https://github.com/maxgfr/ultradoc/commit/3315318c4e1f48cf186befcffc77c3d6768e5b3f)), closes [#1](https://github.com/maxgfr/ultradoc/issues/1)

# [2.2.0](https://github.com/maxgfr/ultradoc/compare/v2.1.3...v2.2.0) (2026-07-22)


### Features

* **index:** adopt the vendored codeindex engine ([bbd3af8](https://github.com/maxgfr/ultradoc/commit/bbd3af8f20213f339bac7d610d6bfa62ccd52f71))

## [2.1.3](https://github.com/maxgfr/ultradoc/compare/v2.1.2...v2.1.3) (2026-07-16)


### Bug Fixes

* **search:** anchor the pin against the full file line, not the truncated hit text ([a029db8](https://github.com/maxgfr/ultradoc/commit/a029db84d8244ca28c98ceefc7c363359435570d))
* **search:** anchor the pinned excerpt on the literal, not a subtoken match ([334613a](https://github.com/maxgfr/ultradoc/commit/334613a69fa328de00099906aca953001b962298))
* **search:** pin the sole holder of a near-unique query literal into the results ([e5e4ded](https://github.com/maxgfr/ultradoc/commit/e5e4ded6095b4cfe033acf74af5157134371e432))
* **search:** rescue rare-term attribution lost to the per-file match cap ([ef14eab](https://github.com/maxgfr/ultradoc/commit/ef14eabb78cb339a65b1c70371b8bb88a0194193))

## [2.1.2](https://github.com/maxgfr/ultradoc/compare/v2.1.1...v2.1.2) (2026-07-10)


### Bug Fixes

* **check:** bind VERIFY.json to its answer so --semantic fails closed on a stale ledger ([78349c6](https://github.com/maxgfr/ultradoc/commit/78349c67e1d554dc5a32aba8ab92431399353c2a))
* **check:** make --semantic claim coverage trustless (re-derive, don't trust claims[]) ([2de0812](https://github.com/maxgfr/ultradoc/commit/2de08123114a5c365d6266e3a3620c2d170b7ab6))
* **check:** require the semantic ledger to adjudicate every cited claim ([c1a6f2c](https://github.com/maxgfr/ultradoc/commit/c1a6f2cc053b614e46150369b172edd079e34dee))
* **semantic:** pull stack images in a separate step with a generous, configurable timeout ([cc11884](https://github.com/maxgfr/ultradoc/commit/cc11884876d76f5f3654ddcf0a4e35d88c61df56))

## [2.1.1](https://github.com/maxgfr/ultradoc/compare/v2.1.0...v2.1.1) (2026-07-09)


### Bug Fixes

* **verify:** fail-closed fold + accept orchestrate fragment shape ([#14](https://github.com/maxgfr/ultradoc/issues/14)) ([c63b482](https://github.com/maxgfr/ultradoc/commit/c63b4826561aebf1e69e22206aff9d09c5cd997b))

# [2.1.0](https://github.com/maxgfr/ultradoc/compare/v2.0.0...v2.1.0) (2026-07-09)


### Features

* **orchestrate:** engine-managed drill/verify/doc fan-out (family round) ([#13](https://github.com/maxgfr/ultradoc/issues/13)) ([3ea7e1e](https://github.com/maxgfr/ultradoc/commit/3ea7e1ed4acba67a1cb9067295e9cd71d8dd43bc))

# [2.0.0](https://github.com/maxgfr/ultradoc/compare/v1.8.2...v2.0.0) (2026-07-08)


### Features

* implement ultradoc eval feedback (P1–P7, fail-closed semantic gate → v2.0.0) ([#12](https://github.com/maxgfr/ultradoc/issues/12)) ([98eebda](https://github.com/maxgfr/ultradoc/commit/98eebda37e02a47a613b0a223f4c5c039dd12d0f))


### BREAKING CHANGES

* check --semantic now exits non-zero when VERIFY.json is
missing, unreadable, or records no verdicts. Run verify + verify --apply
first, or pass --allow-unverified to restore the old warn-and-pass.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

* feat(verify): cross-check issue/PR-grounded claims against current source

Two layers close the faithfulness-vs-correctness blind spot (eval P2) —
a claim can be faithful to a closed issue yet contradicted by today's code:

- check warns when a claim's only support is issue/PR evidence (tracker
  state at a point in time; cite the code or the fixing release alongside).
- verify marks issue/PR pairs crossCheck:true and VERIFY.md instructs the
  skeptic to judge them against CURRENT code — contradiction => refuted,
  or partial with a temporal qualifier citing the fixing release.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

* feat(check): re-validate code/docs excerpts against the pinned clone

check used to prove only that [E#] resolves to an evidence id — a corrupted
line range or a fabricated snippet still exited 0 (eval P1/L02b, the gap
that most undermined the grounding guarantee). Every code/docs item with a
path:start-end location is now re-opened in the pinned clone when its HEAD
still matches the dossier commit: the range must exist and the stored
snippet must match those lines (exact normalized equality; in-order
subsequence >= 80% only for clip()-truncated snippets). Mismatches fail in
both modes; a moved HEAD or evicted clone downgrades to a warning that
names the skipped gate.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

* feat(search): rank and excerpt call sites, not just declarations

Retrieval was declaration-only: a symbol's excerpt was pinned to its
definition, and an options-callback property (onFailedAttempt) that is
never declared as a symbol could only surface via BM25, with its
invocation line never reaching the excerpt (eval P4, the lowest-scoring
dimension).

When a query names an identifier, a call-site pass now ranks the files
that INVOKE it (a third RRF list, fused only when non-empty so prose
queries are unchanged) and the excerpt either folds a nearby call region
into the definition window or emits a second call-site excerpt when the
invocation is far from the anchor. Call lines are already among the
lexical hits, so there is no extra ripgrep call. Adds a p-retry-shaped
onRetry callback to the sample-lib fixture plus offline eval pins; the 16
prior offline expects are unchanged (0 regressions).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

* docs: document excerpt re-validation, fail-closed semantic gate, call sites

Update SKILL.md + references (citation-format, orchestration, retrieval-
playbook) for the P1-P4 behavior changes, and rebuild the bundle.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

## [1.8.2](https://github.com/maxgfr/ultradoc/compare/v1.8.1...v1.8.2) (2026-07-07)


### Bug Fixes

* **check:** stop false commit-drift warnings when a shallow clone is deepened ([ca9894a](https://github.com/maxgfr/ultradoc/commit/ca9894ad6be8bf03da6d097cb71c7f64b122711a))

## [1.8.1](https://github.com/maxgfr/ultradoc/compare/v1.8.0...v1.8.1) (2026-07-07)


### Bug Fixes

* **verify:** actionable error when evidence.json or verdicts file is missing ([b284ece](https://github.com/maxgfr/ultradoc/commit/b284ece401f10aea9e499a0754fdca4af00bdaff))

# [1.8.0](https://github.com/maxgfr/ultradoc/compare/v1.7.2...v1.8.0) (2026-07-07)


### Bug Fixes

* **net:** stamp the real version in the User-Agent; name ranking constants ([937ea25](https://github.com/maxgfr/ultradoc/commit/937ea2579f3fc5c2c11bf6303c635c63489e4b64))
* **semantic:** embed the compose stack so semantic up works from any install ([e3c93d5](https://github.com/maxgfr/ultradoc/commit/e3c93d5966f144e3c4307d16434b3b3cb30f3b9e))


### Features

* **cache:** persistent cache root, cache subcommand, extdocs TTL ([6266144](https://github.com/maxgfr/ultradoc/commit/626614480adf168cae4519b5175b9052078e374f))
* **check:** claim-coverage gate, strict typed aliases, fence-aware citations ([ff05182](https://github.com/maxgfr/ultradoc/commit/ff05182cded8b5e69bd4a54a570a3795f2d355e4))
* **config:** env-overridable limits (ULTRADOC_MAX_FILES, …) ([d897870](https://github.com/maxgfr/ultradoc/commit/d8978702fa3234bf8d963c37bf501055e3e705ce))
* **doc:** adaptive outline (CLI Commands section) + DOC.md section-coverage check ([78661b5](https://github.com/maxgfr/ultradoc/commit/78661b569e7a0cb503bbde98f22b107a9bd9a909))
* **evals:** negative assertions and doc-section expectations ([55523f9](https://github.com/maxgfr/ultradoc/commit/55523f91afb32c01450a3a2fa2eea9d2b760e48a))
* **index:** commit-validated index + truncation stats surfaced as notes (schema v4) ([4366ee4](https://github.com/maxgfr/ultradoc/commit/4366ee41e44a3ecff335bba16189f9f6aa3a2e4a))
* **lang:** export-list, CJS, and default-export detection for JS/TS ([198f4e6](https://github.com/maxgfr/ultradoc/commit/198f4e61987d2b7cedc661f345a594c7ba1e89ad))
* **net:** bounded retries, Retry-After, rate-limit surfacing, GITHUB_TOKEN ([e5add55](https://github.com/maxgfr/ultradoc/commit/e5add556b46464093313a3d60b4b0160714adcfd))
* **providers:** GitLab relaxation + scoring parity, Gitea/Codeberg support ([1d63632](https://github.com/maxgfr/ultradoc/commit/1d63632d398b9614063d1ecaba5ae7946bf81470))
* **search:** top-3 symbol ranking, named ranking constants, rg path scoping ([9210390](https://github.com/maxgfr/ultradoc/commit/9210390ca36bc8864ebe4c682d28864bd54a1936))
* **semantic:** symbol-boundary chunking and parallel embedding ([72b15ee](https://github.com/maxgfr/ultradoc/commit/72b15ee41e45cbe9c5ddf47ae0c7dc9867747dbc))

## [1.7.2](https://github.com/maxgfr/ultradoc/compare/v1.7.1...v1.7.2) (2026-06-28)


### Bug Fixes

* **skill:** restore temporal/doc-gen triggers in ultradoc description (≤1024) ([b84e269](https://github.com/maxgfr/ultradoc/commit/b84e269f5828d85d0514e5a509946dc72eac3e12))

## [1.7.1](https://github.com/maxgfr/ultradoc/compare/v1.7.0...v1.7.1) (2026-06-28)


### Bug Fixes

* **skill:** package under skills/ultradoc/ so `npx skills add` bundles the engine + references ([f06727c](https://github.com/maxgfr/ultradoc/commit/f06727cc9e4fe878fba3a9771e5d54ccd8295fc0))

# [1.7.0](https://github.com/maxgfr/ultradoc/compare/v1.6.0...v1.7.0) (2026-06-16)


### Features

* grounded reference-doc generation, parallel-retrieval skill, .ultradoc persistence ([ef3ebe2](https://github.com/maxgfr/ultradoc/commit/ef3ebe267cc7ec878c8e5907c1d026aa6c01a38a))

# [1.6.0](https://github.com/maxgfr/ultradoc/compare/v1.5.0...v1.6.0) (2026-06-15)


### Features

* semantic verify gate — verify + check --semantic ([#8](https://github.com/maxgfr/ultradoc/issues/8)) ([0215f9c](https://github.com/maxgfr/ultradoc/commit/0215f9c1a8a22af04ad99cc51c2594f848740674))

# [1.5.0](https://github.com/maxgfr/ultradoc/compare/v1.4.0...v1.5.0) (2026-06-11)


### Features

* **search:** accent-, plural- and subtoken-aware retrieval with filename boost and adaptive excerpts ([0cbb8e7](https://github.com/maxgfr/ultradoc/commit/0cbb8e7c6d5a204bc1847af002c2317a1ed3c056))
* **sources:** heading-aware doc excerpts, cross-source dedup and per-phase timings ([c274731](https://github.com/maxgfr/ultradoc/commit/c274731c86fbb0ee3a6dffa920ae6189a916cf8d))

# [1.4.0](https://github.com/maxgfr/ultradoc/compare/v1.3.0...v1.4.0) (2026-06-10)


### Bug Fixes

* **search:** walk only the scoped package subtree in the ripgrep-less fallback ([f974424](https://github.com/maxgfr/ultradoc/commit/f97442406e2633292bd57e9b236a7b9d7a1a995e))


### Features

* **search:** BM25 lexical scoring fused with the symbol index via RRF ([4dbfb36](https://github.com/maxgfr/ultradoc/commit/4dbfb3640b5bbbc780becdff266e551e0df52477))
* **skill:** agent-side query expansion and evidence triage guidance ([0d37b1e](https://github.com/maxgfr/ultradoc/commit/0d37b1e31d9c7a09142de554f2de65427fba9c9c))
* **sources:** releases, git history and GitHub Discussions evidence sources ([6dc1d59](https://github.com/maxgfr/ultradoc/commit/6dc1d593d7c971f52be9fa8034d6c9c990601ebb))
* **workspaces:** uv/Composer/Maven/Gradle discovery, robust Cargo parsing, nested globs ([6b01301](https://github.com/maxgfr/ultradoc/commit/6b0130173ded2b99dff6d834861d5af65d6a9b5e))

# [1.3.0](https://github.com/maxgfr/ultradoc/compare/v1.2.0...v1.3.0) (2026-06-10)


### Features

* add monorepo workspace discovery and --package scoping ([b658e6f](https://github.com/maxgfr/ultradoc/commit/b658e6f0b886e560ec7ec1a4a82972ecb1e184ec))

# [1.2.0](https://github.com/maxgfr/ultradoc/compare/v1.1.1...v1.2.0) (2026-06-08)


### Features

* auto-discover the project's official docs (folder + URL) from its .md/manifests ([7b0b113](https://github.com/maxgfr/ultradoc/commit/7b0b11320994132313f801b8a2aeb4c5db9a0b66))

## [1.1.1](https://github.com/maxgfr/ultradoc/compare/v1.1.0...v1.1.1) (2026-06-08)


### Bug Fixes

* relevance ranking for issues/PRs and docs (Matomo acceptance) ([123874c](https://github.com/maxgfr/ultradoc/commit/123874c2de07340772e448cd093bd3d7ce477306))

# [1.1.0](https://github.com/maxgfr/ultradoc/compare/v1.0.0...v1.1.0) (2026-06-08)


### Features

* symbol extractors for 9 more languages + lockfile/ranking fixes ([ebd0869](https://github.com/maxgfr/ultradoc/commit/ebd0869708dd8b09a98e2b5dae94f44b3a5b0f48))

# 1.0.0 (2026-06-08)


### Features

* ultradoc — grounded Q&A skill for open-source projects ([7f92f65](https://github.com/maxgfr/ultradoc/commit/7f92f651e1ae7fdc9c713d9f96137872e2caa4d4))
