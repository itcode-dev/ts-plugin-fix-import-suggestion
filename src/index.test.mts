import type ts from 'typescript';
import type { server } from 'typescript';
import { describe, expect, it } from 'vitest';
import init from './index.mts';

function createFakeTypescript(): typeof ts {
	return {
		resolveModuleName: () => ({ resolvedModule: undefined })
	} as unknown as typeof ts;
}

function createFakeInfo(languageService: Record<string, unknown>): server.PluginCreateInfo {
	return {
		config: {},
		languageService,
		languageServiceHost: {},
		project: { projectService: { logger: { info: (_message: string) => undefined } } }
	} as unknown as server.PluginCreateInfo;
}

describe('init', () => {
	it('override 대상 메서드는 Tsserver의 override 함수로 바뀐다', () => {
		const info = createFakeInfo({ getCompletionsAtPosition: () => ({ entries: [] }) });
		const proxied = init({ typescript: createFakeTypescript() }).create?.(info);

		expect(typeof proxied?.getCompletionsAtPosition).toBe('function');
		expect(() => proxied?.getCompletionsAtPosition?.('App.ts', 0, {}, {})).not.toThrow();
	});

	it('override 대상이 아닌 함수 프로퍼티는 원본 target에 바인딩된 채로 통과시킨다', () => {
		const languageService: Record<string, unknown> = {};
		languageService.getQuickInfoAtPosition = function getQuickInfoAtPosition(this: unknown) {
			return this === languageService ? 'bound-correctly' : 'lost-this';
		};

		const info = createFakeInfo(languageService);
		const proxied = init({ typescript: createFakeTypescript() }).create?.(info) as unknown as {
			getQuickInfoAtPosition: () => string;
		};

		expect(proxied.getQuickInfoAtPosition()).toBe('bound-correctly');
	});

	it('함수가 아닌 프로퍼티는 그대로 통과시킨다', () => {
		const info = createFakeInfo({ someFlag: true });
		const proxied = init({ typescript: createFakeTypescript() }).create?.(info) as unknown as {
			someFlag: boolean;
		};

		expect(proxied.someFlag).toBe(true);
	});
});
