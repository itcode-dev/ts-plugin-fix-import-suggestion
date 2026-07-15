import { describe, expect, it } from 'vitest';
import { fixExtension, getExtension } from './extension.mts';

describe('getExtension', () => {
	it('returns undefined for undefined input', () => {
		expect(getExtension(undefined)).toBeUndefined();
	});

	it('returns undefined for a file with no known extension', () => {
		expect(getExtension('package.json')).toBeUndefined();
	});

	it('recognizes .tsx before .ts (order matters)', () => {
		expect(getExtension('Button.tsx')).toBe('.tsx');
	});

	it('recognizes .ts', () => {
		expect(getExtension('formatDate.ts')).toBe('.ts');
	});

	it('recognizes .jsx before .js', () => {
		expect(getExtension('Button.jsx')).toBe('.jsx');
	});

	it('recognizes .js', () => {
		expect(getExtension('formatDate.js')).toBe('.js');
	});

	it('returns undefined for .d.ts (a declaration file, not a .ts source file)', () => {
		expect(getExtension('formatDate.d.ts')).toBeUndefined();
	});

	it('recognizes .mts', () => {
		expect(getExtension('formatDate.mts')).toBe('.mts');
	});

	it('recognizes .cts', () => {
		expect(getExtension('formatDate.cts')).toBe('.cts');
	});

	it('recognizes .mjs', () => {
		expect(getExtension('formatDate.mjs')).toBe('.mjs');
	});

	it('recognizes .cjs', () => {
		expect(getExtension('formatDate.cjs')).toBe('.cjs');
	});

	it('returns undefined for .d.mts (a declaration file, not a .mts source file)', () => {
		expect(getExtension('formatDate.d.mts')).toBeUndefined();
	});

	it('returns undefined for .d.cts (a declaration file, not a .cts source file)', () => {
		expect(getExtension('formatDate.d.cts')).toBeUndefined();
	});
});

describe('fixExtension', () => {
	it('swaps a fake .js specifier for the real .ts extension', () => {
		expect(fixExtension('./formatDate.js', '/repo/src/formatDate.ts')).toBe('./formatDate.ts');
	});

	it('swaps a fake .jsx specifier for the real .tsx extension', () => {
		expect(fixExtension('./Button.jsx', '/repo/src/Button.tsx')).toBe('./Button.tsx');
	});

	it('leaves the specifier untouched when the real file is genuinely .js', () => {
		expect(fixExtension('lodash/debounce.js', '/repo/node_modules/lodash/debounce.js')).toBe('lodash/debounce.js');
	});

	it('leaves the specifier untouched when fileName is unresolved', () => {
		expect(fixExtension('./formatDate.js', undefined)).toBe('./formatDate.js');
	});

	it('leaves the specifier untouched when it has no recognized extension', () => {
		expect(fixExtension('./formatDate', '/repo/src/formatDate.ts')).toBe('./formatDate');
	});

	it('leaves a correct .js specifier untouched when it resolves to a companion .d.ts (ordinary compiled package, not a JIT package)', () => {
		expect(fixExtension('./foo.js', '/repo/node_modules/my-lib/dist/foo.d.ts')).toBe('./foo.js');
	});

	it('swaps a fake .mjs specifier for the real .mts extension', () => {
		expect(fixExtension('./formatDate.mjs', '/repo/src/formatDate.mts')).toBe('./formatDate.mts');
	});

	it('swaps a fake .cjs specifier for the real .cts extension', () => {
		expect(fixExtension('./formatDate.cjs', '/repo/src/formatDate.cts')).toBe('./formatDate.cts');
	});

	it('leaves a correct .mjs specifier untouched when it resolves to a companion .d.mts', () => {
		expect(fixExtension('./foo.mjs', '/repo/node_modules/my-lib/dist/foo.d.mts')).toBe('./foo.mjs');
	});

	it('leaves a correct .cjs specifier untouched when it resolves to a companion .d.cts', () => {
		expect(fixExtension('./foo.cjs', '/repo/node_modules/my-lib/dist/foo.d.cts')).toBe('./foo.cjs');
	});
});
