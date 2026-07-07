/**
 * tsub 설정 모듈
 *
 * @author RWB
 * @since 2026.07.07 Tue 19:07:05
 */

import { defineConfig } from 'tsup';

export default defineConfig({
	clean: true,
	dts: true,
	entry: ['src/index.ts'],
	format: 'cjs',
	minify: true
});
