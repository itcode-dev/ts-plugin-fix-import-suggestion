# Changelog

## [1.0.2]

### Changed

- Switched the build tool from `tsup` to [`tsdown`](https://tsdown.dev/) (`tsup` is deprecated). Output is now `dist/index.cjs` instead of `dist/index.js`; `main`/`types` in `package.json` were updated to match.
- Migrated all source files (`src/index.ts`, `src/tsserver.ts`, `src/extension.ts`) to real ESM `.mts`. The published `dist/index.cjs` is still plain CommonJS (`module.exports = init`) — `tsdown` correctly collapses the ESM `export default` down to a CJS export when bundling, so this has no effect on how tsserver loads the plugin.
- Refactored `Tsserver` into a class with four `private` override methods and a single `public getOverrides()` that wraps them in arrow functions before handing them to the `Proxy`, so their `this` stays bound no matter how tsserver ends up calling them.

### Added

- A real test suite via [Vitest](https://vitest.dev/): source-level unit tests (`src/*.test.mts`) that run directly against `.mts` source with no build step, plus an integration test (`test/tsserver.test.mts`) that loads the built `dist/index.cjs` to verify the actual CommonJS contract tsserver depends on.
- 100% statement/branch/function/line coverage, enforced via `vitest run --coverage` (`pnpm run test:coverage`).
- A "Development" section in `README.md`/`README.ko.md` documenting the `build`/`typecheck`/`check`/`test`/`test:coverage` scripts for contributors.

### Notes

- No runtime behavior change: completions, Quick Fix, and "Add all missing imports" all continue to work identically to `1.0.1`.
- The published `main`/`types` entry points changed from `dist/index.js`/`dist/index.d.ts` to `dist/index.cjs`/`dist/index.d.cts` (a consequence of the `tsdown` migration above), but the module itself still resolves and loads the same way for consumers.

## [1.0.1]

### Changed

- Switched the build tool from `tsc` to `tsup` (esbuild-based). Output is now a single bundled, minified `dist/index.js` instead of separate compiled files.
- Added a dedicated `typecheck` script (`tsc --noEmit`), since `tsup`/esbuild doesn't type-check on its own. `build` now only bundles.
- Narrowed `tsconfig.json`'s `include` to `src/**/*.ts` so root-level config files (e.g. `tsup.config.ts`) aren't pulled into the type-checked program.

### Notes

- No runtime behavior change: completions, Quick Fix, and "Add all missing imports" were re-verified against a real TypeScript `Program` after this change, with identical results to before.
- The published `main`/`types` entry points are unchanged.

## [1.0.0]

- Initial public release.
