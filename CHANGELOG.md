# Changelog

All notable changes to this project are documented here, generated automatically from the [Conventional Commits](https://www.conventionalcommits.org/) by [semantic-release](https://github.com/semantic-release/semantic-release).

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
