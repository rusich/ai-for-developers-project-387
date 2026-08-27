# Changelog

## [0.3.0](https://github.com/rusich/ai-for-developers-project-386/compare/call-booking-backend-v0.2.1...call-booking-backend-v0.3.0) (2026-08-27)


### Features

* add Docker deployment with axum-served static ([99272f2](https://github.com/rusich/ai-for-developers-project-386/commit/99272f27faf63d347c0f755e149ced40074acb66))
* implement backend in Rust (axum, in-memory) per OpenAPI contract ([3a19bb2](https://github.com/rusich/ai-for-developers-project-386/commit/3a19bb2ab544b743bc12a2e4cf91cebb53d648cf))
* report app version via GET /api/version ([7a3206f](https://github.com/rusich/ai-for-developers-project-386/commit/7a3206f9c4b56f9e587e74c9f321700997e62dd4))


### Build

* keep changelog under backend/ for release-please rust strategy ([421e33a](https://github.com/rusich/ai-for-developers-project-386/commit/421e33a54ac0fc62a8f37afe2803323353f0c3e5))

## [0.2.1](https://github.com/rusich/ai-for-developers-project-386/compare/v0.2.0...v0.2.1) (2026-08-27)


### Documentation

* add status badges to README ([0df2065](https://github.com/rusich/ai-for-developers-project-386/commit/0df206522bef4f86e87ff6bb4c9569f312de7aad))

## [0.2.0](https://github.com/rusich/ai-for-developers-project-386/compare/v0.1.0...v0.2.0) (2026-08-27)


### Features

* add frontend (guest + owner pages) verified against Prism mock ([f8d770e](https://github.com/rusich/ai-for-developers-project-386/commit/f8d770ecb35bc894ddde42f2ceb691b39ebb8a9c))
* add stateful dev-stub API, replace Prism for browser checks ([00156b9](https://github.com/rusich/ai-for-developers-project-386/commit/00156b9c113a6ee4825341ccf1a34c21dc1a865d))
* add TypeSpec API contract for call booking service ([eea30d1](https://github.com/rusich/ai-for-developers-project-386/commit/eea30d11557d083670d4dadec153e2158bfabd80))
* implement backend in Rust (axum, in-memory) per OpenAPI contract ([3a19bb2](https://github.com/rusich/ai-for-developers-project-386/commit/3a19bb2ab544b743bc12a2e4cf91cebb53d648cf))


### Bug Fixes

* full CORS preflight response in dev-stub (Firefox admin login) ([dce1608](https://github.com/rusich/ai-for-developers-project-386/commit/dce16081ecff415b48898fa09c186bbde02f1a52))
* just dev stops backend/frontend on Ctrl+C ([6ff579e](https://github.com/rusich/ai-for-developers-project-386/commit/6ff579ea43e455b1583f4d448db801cba96e3bd6))
* make just dev resilient to leftover processes on ports 4010/8080 ([698df67](https://github.com/rusich/ai-for-developers-project-386/commit/698df67f94f5cd64de08f6eb5808f56493649759))


### Tests

* **e2e:** add Playwright integration tests for booking flow ([1aae1ea](https://github.com/rusich/ai-for-developers-project-386/commit/1aae1ea6293e9794aeccc4b6e18748f7b2c57a4a))


### CI

* add GitHub Actions workflow for backend and e2e tests ([0e93e9e](https://github.com/rusich/ai-for-developers-project-386/commit/0e93e9e1fa4036b9ede7d3d2bb4cb69afc0badd1))
* add release-please to automate releases from conventional commits ([5b350b2](https://github.com/rusich/ai-for-developers-project-386/commit/5b350b2664c10f1a67e6af1dd1acf6d6ceff23aa))


### Documentation

* add "new machine" section to AGENTS.md ([074a3a8](https://github.com/rusich/ai-for-developers-project-386/commit/074a3a897bac64c8518d07e5b2babc8a343a9629))
* document e2e tests, CI and release process in AGENTS.md ([82a043d](https://github.com/rusich/ai-for-developers-project-386/commit/82a043def4bb5e86aa5d3dce760ce087cabb500f))


### Miscellaneous Chores

* add justfile with dev commands (mock + static server) ([49e59e0](https://github.com/rusich/ai-for-developers-project-386/commit/49e59e0ffaa75a38da8db84f02fd068a30d82fe1))
