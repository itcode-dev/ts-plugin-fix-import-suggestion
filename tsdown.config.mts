/**
 * tsdown 설정 모듈
 *
 * @author RWB
 * @since 2026.07.09 Thu 10:49:48
 */

import { defineConfig } from 'tsdown';

export default defineConfig({
	clean: true,
	deps: {
		neverBundle: ['typescript']
	},
	dts: true,
	entry: ['src/index.mts'],
	format: 'cjs',
	minify: true
});
