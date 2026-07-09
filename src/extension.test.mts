import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fixExtension, getExtension } from './extension.mts';

describe('getExtension', () => {
	it('returns undefined for undefined input', () => {
		assert.equal(getExtension(undefined), undefined);
	});

	it('returns undefined for a file with no known extension', () => {
		assert.equal(getExtension('package.json'), undefined);
	});

	it('recognizes .tsx before .ts (order matters)', () => {
		assert.equal(getExtension('Button.tsx'), '.tsx');
	});

	it('recognizes .ts', () => {
		assert.equal(getExtension('formatDate.ts'), '.ts');
	});

	it('recognizes .jsx before .js', () => {
		assert.equal(getExtension('Button.jsx'), '.jsx');
	});

	it('recognizes .js', () => {
		assert.equal(getExtension('formatDate.js'), '.js');
	});
});

describe('fixExtension', () => {
	it('swaps a fake .js specifier for the real .ts extension', () => {
		assert.equal(fixExtension('./formatDate.js', '/repo/src/formatDate.ts'), './formatDate.ts');
	});

	it('swaps a fake .jsx specifier for the real .tsx extension', () => {
		assert.equal(fixExtension('./Button.jsx', '/repo/src/Button.tsx'), './Button.tsx');
	});

	it('leaves the specifier untouched when the real file is genuinely .js', () => {
		assert.equal(fixExtension('lodash/debounce.js', '/repo/node_modules/lodash/debounce.js'), 'lodash/debounce.js');
	});

	it('leaves the specifier untouched when fileName is unresolved', () => {
		assert.equal(fixExtension('./formatDate.js', undefined), './formatDate.js');
	});

	it('leaves the specifier untouched when it has no recognized extension', () => {
		assert.equal(fixExtension('./formatDate', '/repo/src/formatDate.ts'), './formatDate');
	});
});
