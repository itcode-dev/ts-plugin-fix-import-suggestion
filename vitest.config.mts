/**
 * vitest 설정 모듈
 *
 * @author RWB
 * @since 2026.07.09 Thu 11:07:46
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			exclude: ['src/**/*.test.mts'],
			include: ['src/**/*.mts'],
			provider: 'v8',
			reporter: ['text', 'html'],
			thresholds: {
				100: true
			}
		}
	}
});
