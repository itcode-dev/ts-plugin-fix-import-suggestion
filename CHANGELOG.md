# Changelog

## [1.1.0]

### Fixed

- Fixed a false positive where a completely correct `.js`/`.mjs`/`.cjs` import specifier for an ordinary compiled package (one that ships a `.js` file alongside a companion `.d.ts`/`.d.mts`/`.d.cts` declaration file — the standard output shape for `node16`/`nodenext` module resolution) would get incorrectly rewritten into a non-existent `.ts`/`.mts`/`.cts` specifier. The root cause: `.d.ts` ends with the substring `.ts` (same for `.d.mts`/`.d.cts`), so the extension-matching logic treated declaration files as if they were `.ts`/`.mts`/`.cts` *source* files. Declaration files are now explicitly excluded before the source-extension check.

### Added

- Extended support beyond `.js`/`.jsx` ↔ `.ts`/`.tsx` to also cover `.mjs`/`.cjs` ↔ `.mts`/`.cts`. TypeScript's specifier-substitution rule applies symmetrically to these extensions, so Turborepo JIT packages that ship raw `.mts`/`.cts` source (rather than `.ts`/`.tsx`) previously got no fix at all — auto-import suggestions ending in `.mjs`/`.cjs` for a `.mts`/`.cts` file went right past this plugin, since the `Extension` type only recognized `.ts`/`.tsx`/`.js`/`.jsx`.

### Notes

- Why minor and not patch: unlike previous releases, this one is not "no runtime behavior change" — the `.mts`/`.cts`/`.mjs`/`.cjs` support is genuinely new capability (previously unhandled cases are now handled), which is a backwards-compatible feature addition rather than a pure fix. The `.d.ts` false-positive fix included in this same release would have been patch-only on its own.

## [1.0.3]

### Removed

- Removed the `devEngines.packageManager` field from `package.json`. It pinned pnpm to a semver *range* (`^11.1.1`), which newer pnpm releases reject outright (`Invalid package manager specification (pnpm@^11.1.1); expected a semver version`), breaking every `pnpm` command in the repo. The field is advisory only, so removing it is the safe fix.

### Docs

- `README.md`/`README.ko.md`: documented that VS Code must be set to use the **workspace version** of TypeScript (Status Bar → TypeScript version → **Use Workspace Version**), not the one bundled with VS Code. `tsconfig.json`-declared plugins are resolved relative to whichever TypeScript installation is actually running `tsserver` — if that's VS Code's bundled copy, it never looks in the project's `node_modules`, so this plugin (or any other locally-installed plugin) silently fails to load.
- Added an example enabling `js/ts.tsdk.promptToUseWorkspaceVersion` in `.vscode/settings.json`, so VS Code proactively prompts anyone opening the workspace — teammates included — to switch to the workspace version instead of relying on everyone to do it manually.

### Notes

- No runtime behavior change: this release is docs and dev-tooling config only.

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
