import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type ts from 'typescript';
import type { server } from 'typescript';
import Tsserver from './tsserver.mts';

const FORMAT_DATE_TS = /formatDate\.ts/u;

/**
 * this.typescript.resolveModuleName만 흉내 내는 가짜 typescript 인스턴스.
 * 실제 Program/host 없이도 "specifier가 어떤 실제 파일로 resolve되는지"를
 * 테스트가 원하는 대로 통제할 수 있다.
 */
function createFakeTypescript(resolvedFileName: string | undefined): typeof ts {
	return {
		resolveModuleName: () => ({
			resolvedModule: resolvedFileName ? { resolvedFileName } : undefined
		})
	} as unknown as typeof ts;
}

function createFakeInfo(options: {
	languageService: Record<string, unknown>;
	config?: Record<string, unknown>;
	logs?: string[];
}): server.PluginCreateInfo {
	const logs = options.logs ?? [];

	return {
		config: options.config ?? {},
		languageService: {
			getProgram: () => ({ getCompilerOptions: () => ({}) }),
			...options.languageService
		},
		languageServiceHost: {},
		project: {
			projectService: {
				logger: { info: (message: string) => logs.push(message) }
			}
		}
	} as unknown as server.PluginCreateInfo;
}

describe('Tsserver#getOverrides (source, no build required)', () => {
	it('returns functions whose `this` is safe even when detached from the instance', () => {
		const info = createFakeInfo({
			languageService: { getCompletionsAtPosition: () => ({ entries: [] }) }
		});
		const overrides = new Tsserver(info, createFakeTypescript(undefined)).getOverrides();

		const detached = overrides.getCompletionsAtPosition;
		assert.ok(detached);

		assert.doesNotThrow(() => {
			detached('App.ts', 0, {}, {});
		});
	});
});

describe('Tsserver#getOverrides().getCompletionsAtPosition', () => {
	it('add 모드(기본값): 원본 .js 항목은 유지하고 .ts 변형을 하나 더 추가한다', () => {
		const entry = {
			data: { fileName: '/repo/src/formatDate.ts' },
			source: '@org/utils/formatDate.js'
		};
		const info = createFakeInfo({
			languageService: {
				getCompletionsAtPosition: () => ({ entries: [{ ...entry }] })
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript(undefined)).getOverrides();
		const result = overrides.getCompletionsAtPosition?.('App.ts', 0, {}, {});

		assert.equal(result?.entries.length, 2);
		assert.equal(result?.entries[0]?.source, '@org/utils/formatDate.js');
		assert.equal(result?.entries[1]?.source, '@org/utils/formatDate.ts');
	});

	it('overwrite 모드: 원본 항목 자체를 .ts로 덮어쓰고 개수는 그대로다', () => {
		const entry = {
			data: { fileName: '/repo/src/formatDate.ts' },
			source: '@org/utils/formatDate.js'
		};
		const info = createFakeInfo({
			config: { overwrite: true },
			languageService: {
				getCompletionsAtPosition: () => ({ entries: [{ ...entry }] })
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript(undefined)).getOverrides();
		const result = overrides.getCompletionsAtPosition?.('App.ts', 0, {}, {});

		assert.equal(result?.entries.length, 1);
		assert.equal(result?.entries[0]?.source, '@org/utils/formatDate.ts');
	});

	it('실제로 .js를 배포하는 서드파티 패키지는 건드리지 않는다', () => {
		const entry = {
			data: { fileName: '/repo/node_modules/lodash/debounce.js' },
			source: 'lodash/debounce.js'
		};
		const info = createFakeInfo({
			languageService: {
				getCompletionsAtPosition: () => ({ entries: [{ ...entry }] })
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript(undefined)).getOverrides();
		const result = overrides.getCompletionsAtPosition?.('App.ts', 0, {}, {});

		assert.equal(result?.entries.length, 1);
		assert.equal(result?.entries[0]?.source, 'lodash/debounce.js');
	});
});

describe('Tsserver#getOverrides().getCodeFixesAtPosition', () => {
	it('fixId로 "Add import" 액션을 식별해서 description·textChanges를 고친다', () => {
		const info = createFakeInfo({
			languageService: {
				getCodeFixesAtPosition: () => [
					{
						changes: [
							{
								fileName: 'App.ts',
								textChanges: [
									{
										newText: "import { formatDate } from '@org/utils/formatDate.js';\n"
									}
								]
							}
						],
						description: '"@org/utils/formatDate.js"에서 가져오기 추가',
						fixId: 'fixMissingImport',
						fixName: 'import'
					}
				]
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript('/repo/src/formatDate.ts')).getOverrides();
		const result = overrides.getCodeFixesAtPosition?.('App.ts', 0, 0, [2304], {}, {});

		assert.equal(result?.[0]?.description, '"@org/utils/formatDate.ts"에서 가져오기 추가');
		assert.match(result?.[0]?.changes[0]?.textChanges[0]?.newText ?? '', FORMAT_DATE_TS);
	});

	it('fixId가 비어 있어도 fixName === "import"면 동일하게 고친다 (실환경 회귀 테스트)', () => {
		const info = createFakeInfo({
			languageService: {
				getCodeFixesAtPosition: () => [
					{
						changes: [
							{
								fileName: 'App.ts',
								textChanges: [
									{
										newText: "import { formatDate } from '@org/utils/formatDate.js';\n"
									}
								]
							}
						],
						description: '"@org/utils/formatDate.js"에서 가져오기 추가',
						fixId: undefined,
						fixName: 'import'
					}
				]
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript('/repo/src/formatDate.ts')).getOverrides();
		const result = overrides.getCodeFixesAtPosition?.('App.ts', 0, 0, [2304], {}, {});

		assert.match(result?.[0]?.changes[0]?.textChanges[0]?.newText ?? '', FORMAT_DATE_TS);
	});

	it('import 추가와 무관한 fix(예: 함수 선언 추가)는 건드리지 않는다', () => {
		const originalText =
			'  function formatDate(status: string): string {\n    throw new Error("Function not implemented.");\n  }\n\n';
		const info = createFakeInfo({
			languageService: {
				getCodeFixesAtPosition: () => [
					{
						changes: [{ fileName: 'App.ts', textChanges: [{ newText: originalText }] }],
						description: "누락된 함수 선언 'formatDate' 추가",
						fixId: undefined,
						fixName: 'fixMissingFunctionDeclaration'
					}
				]
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript('/repo/src/formatDate.ts')).getOverrides();
		const result = overrides.getCodeFixesAtPosition?.('App.ts', 0, 0, [2304], {}, {});

		assert.equal(result?.[0]?.changes[0]?.textChanges[0]?.newText, originalText);
	});
});

describe('Tsserver#getOverrides().getCombinedCodeFix', () => {
	it('fixId가 "fixMissingImport"일 때만 일괄 삽입되는 import를 고친다', () => {
		const info = createFakeInfo({
			languageService: {
				getCombinedCodeFix: () => ({
					changes: [
						{
							fileName: 'App.ts',
							textChanges: [
								{
									newText: "import { formatDate } from '@org/utils/formatDate.js';\n"
								}
							]
						}
					]
				})
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript('/repo/src/formatDate.ts')).getOverrides();
		const result = overrides.getCombinedCodeFix?.({ fileName: 'App.ts', type: 'file' }, 'fixMissingImport', {}, {});

		assert.match(result?.changes[0]?.textChanges[0]?.newText ?? '', FORMAT_DATE_TS);
	});

	it('다른 fixId로 호출되면 손대지 않는다', () => {
		const originalText = "import { formatDate } from '@org/utils/formatDate.js';\n";
		const info = createFakeInfo({
			languageService: {
				getCombinedCodeFix: () => ({
					changes: [{ fileName: 'App.ts', textChanges: [{ newText: originalText }] }]
				})
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript('/repo/src/formatDate.ts')).getOverrides();
		const result = overrides.getCombinedCodeFix?.({ fileName: 'App.ts', type: 'file' }, 'sortImports', {}, {});

		assert.equal(result?.changes[0]?.textChanges[0]?.newText, originalText);
	});
});

describe('Tsserver debug logging', () => {
	it('debug: true일 때만 로그를 남긴다', () => {
		const logsOn: string[] = [];
		const infoOn = createFakeInfo({
			config: { debug: true },
			languageService: { getCompletionsAtPosition: () => ({ entries: [] }) },
			logs: logsOn
		});
		new Tsserver(infoOn, createFakeTypescript(undefined)).getOverrides().getCompletionsAtPosition?.('App.ts', 0, {}, {});
		assert.ok(logsOn.length > 0);

		const logsOff: string[] = [];
		const infoOff = createFakeInfo({
			languageService: { getCompletionsAtPosition: () => ({ entries: [] }) },
			logs: logsOff
		});
		new Tsserver(infoOff, createFakeTypescript(undefined)).getOverrides().getCompletionsAtPosition?.('App.ts', 0, {}, {});
		assert.equal(logsOff.length, 0);
	});
});
