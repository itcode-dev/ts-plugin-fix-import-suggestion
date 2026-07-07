# ts-plugin-fix-import-suggestion

**English** | [한국어](README.ko.md)

A TypeScript Language Service Plugin that works around a wrong-file-extension bug in your editor's (VS Code, etc.) auto-import suggestions when working with [Turborepo](https://turborepo.com/)'s [JIT (Just-In-Time) packages](https://turborepo.com/docs/core-concepts/internal-packages#just-in-time-packages).

## The problem

With a Turborepo JIT package, an internal package ships `.ts`/`.tsx` source files directly — there's no build step turning them into `.js`. For example, `@your-org/utils` might export `src/formatDate.ts` as-is:

```
your-monorepo/
├── apps/
│   └── web/
│       └── src/
│           └── App.ts          -- you're typing here
└── packages/
    └── utils/
        ├── package.json        -- "exports": { "./*": "./src/*" }
        └── src/
            └── formatDate.ts   -- the real file (shipped as source, never compiled)
```

Say you type `formatDate(` in `App.ts` and accept your editor's auto-import suggestion. You'd expect:

```ts
import { formatDate } from '@your-org/utils/formatDate.ts';
```

But VS Code actually inserts this instead:

```ts
import { formatDate } from '@your-org/utils/formatDate.js';
```

There is no `formatDate.js` file — only `formatDate.ts` exists. TypeScript still compiles and type-checks this fine (it has a special rule that maps a `.js` specifier back to a same-named `.ts`/`.tsx` file), so nothing is actually broken. But the import looks wrong, is confusing to read, and can trip up other tooling that expects import specifiers to point at real files.

This plugin detects exactly this mismatch — a suggested specifier ending in `.js`/`.jsx` where the file TypeScript actually resolved ends in `.ts`/`.tsx` — and rewrites the suggestion to use the real extension. It has no effect on `tsc` builds or type-checking, since `tsc` never loads language service plugins — it only changes what your editor's IntelliSense shows and inserts.

Third-party packages that genuinely ship `.js`/`.jsx` files are unaffected — the fix only kicks in when the apparent specifier extension and the real resolved file extension disagree.

## Is this still needed?

This package exists purely to work around how VS Code's TypeScript integration currently generates auto-import specifiers for JIT packages. If/once VS Code (or the underlying TypeScript language service) fixes this upstream, this plugin will no longer be necessary — you should be able to remove it from your `tsconfig.json` and uninstall it.

## Installation

```sh
npm install --save-dev @itcode-dev/ts-plugin-fix-import-suggestion
```

```sh
yarn add --dev @itcode-dev/ts-plugin-fix-import-suggestion
```

```sh
pnpm add --save-dev @itcode-dev/ts-plugin-fix-import-suggestion
```

## Prerequisite: `allowImportingTsExtensions`

The whole point of this plugin is to make suggestions end in a real `.ts`/`.tsx` extension. By default, TypeScript rejects import specifiers that literally end in `.ts`/`.tsx` (`An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled`). JIT-package setups almost always already have this enabled (since `tsc` never emits output for them — `noEmit`/`emitDeclarationOnly` is required alongside it), but if you see that error, add it to your `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}
```

## Usage

Add the plugin to the `compilerOptions.plugins` array in your `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "plugins": [
      { "name": "@itcode-dev/ts-plugin-fix-import-suggestion" }
    ]
  }
}
```

Then restart the TypeScript server in your editor (in VS Code: **TypeScript: Restart TS Server**).

## Options

| Option      | Type      | Default | Description                                                                                                                                                     |
| ----------- | --------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `debug`     | `boolean` | `false` | Logs plugin activity to the TS server log.                                                                                                                        |
| `overwrite` | `boolean` | `false` | When `false` (default), the original suggestion is kept and a corrected one is added alongside it. When `true`, the original suggestion is replaced in place. |

```jsonc
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@itcode-dev/ts-plugin-fix-import-suggestion",
        "debug": false,
        "overwrite": true
      }
    ]
  }
}
```

## Caveats

- This plugin has only been verified in **VS Code**, in a limited set of setups. Other tsserver-based editors (WebStorm, Neovim, etc.) aren't tested.
- TypeScript plugins can be chained — multiple `plugins` entries in `tsconfig.json` each wrap the previous one's `LanguageService`. Depending on **which other plugins are chained alongside this one** (e.g. Next.js's TS plugin, Volar-based plugins like `@mdx-js/typescript-plugin`), the shape of the data this plugin depends on isn't always guaranteed. For example, `getCodeFixesAtPosition`'s `fixId` field was found to be missing in one such chained setup, so this plugin also falls back to checking `fixName`. There may be other chaining combinations where this plugin doesn't work as expected — if you hit one, enabling `"debug": true` and checking the TS server log is the fastest way to see what's actually happening.

## License

MIT
