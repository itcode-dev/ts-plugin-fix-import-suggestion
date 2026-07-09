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
});
