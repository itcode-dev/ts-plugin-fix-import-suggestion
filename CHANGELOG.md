# Changelog

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
