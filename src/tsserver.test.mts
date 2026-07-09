import type ts from 'typescript';
import type { server } from 'typescript';
import { describe, expect, it } from 'vitest';
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
		expect(detached).toBeDefined();

		expect(() => {
			detached?.('App.ts', 0, {}, {});
		}).not.toThrow();
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

		expect(result?.entries.length).toBe(2);
		expect(result?.entries[0]?.source).toBe('@org/utils/formatDate.js');
		expect(result?.entries[1]?.source).toBe('@org/utils/formatDate.ts');
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

		expect(result?.entries.length).toBe(1);
		expect(result?.entries[0]?.source).toBe('@org/utils/formatDate.ts');
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

		expect(result?.entries.length).toBe(1);
		expect(result?.entries[0]?.source).toBe('lodash/debounce.js');
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

		expect(result?.[0]?.description).toBe('"@org/utils/formatDate.ts"에서 가져오기 추가');
		expect(result?.[0]?.changes[0]?.textChanges[0]?.newText ?? '').toMatch(FORMAT_DATE_TS);
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

		expect(result?.[0]?.changes[0]?.textChanges[0]?.newText ?? '').toMatch(FORMAT_DATE_TS);
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

		expect(result?.[0]?.changes[0]?.textChanges[0]?.newText).toBe(originalText);
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

		expect(result?.changes[0]?.textChanges[0]?.newText ?? '').toMatch(FORMAT_DATE_TS);
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

		expect(result?.changes[0]?.textChanges[0]?.newText).toBe(originalText);
	});
});

describe('Tsserver#getOverrides().getCompletionsAtPosition (edge cases)', () => {
	it('언더라잉 languageService가 falsy를 반환하면 그대로 통과시킨다', () => {
		const info = createFakeInfo({
			languageService: { getCompletionsAtPosition: () => undefined }
		});

		const overrides = new Tsserver(info, createFakeTypescript(undefined)).getOverrides();
		const result = overrides.getCompletionsAtPosition?.('App.ts', 0, {}, {});

		expect(result).toBeUndefined();
	});

	it('overwrite 모드: source/data.fileName이 없는 항목은 건드리지 않고 건너뛴다', () => {
		const info = createFakeInfo({
			config: { overwrite: true },
			languageService: {
				getCompletionsAtPosition: () => ({ entries: [{ data: undefined, source: undefined }] })
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript(undefined)).getOverrides();
		const result = overrides.getCompletionsAtPosition?.('App.ts', 0, {}, {});

		expect(result?.entries.length).toBe(1);
		expect(result?.entries[0]?.source).toBeUndefined();
	});

	it('overwrite 모드: 실제로 .js를 배포하는 서드파티 패키지는 건드리지 않는다', () => {
		const entry = { data: { fileName: '/repo/node_modules/lodash/debounce.js' }, source: 'lodash/debounce.js' };
		const info = createFakeInfo({
			config: { overwrite: true },
			languageService: {
				getCompletionsAtPosition: () => ({ entries: [{ ...entry }] })
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript(undefined)).getOverrides();
		const result = overrides.getCompletionsAtPosition?.('App.ts', 0, {}, {});

		expect(result?.entries.length).toBe(1);
		expect(result?.entries[0]?.source).toBe('lodash/debounce.js');
	});

	it('add 모드: source/data.fileName이 없는 항목은 변형을 추가하지 않는다', () => {
		const info = createFakeInfo({
			languageService: {
				getCompletionsAtPosition: () => ({ entries: [{ data: undefined, source: undefined }] })
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript(undefined)).getOverrides();
		const result = overrides.getCompletionsAtPosition?.('App.ts', 0, {}, {});

		expect(result?.entries.length).toBe(1);
	});
});

describe('Tsserver#getOverrides().getCompletionEntryDetails (추가 케이스)', () => {
	it('codeActions이 없으면 그대로 반환한다', () => {
		const info = createFakeInfo({
			languageService: { getCompletionEntryDetails: () => ({ codeActions: undefined }) }
		});

		const overrides = new Tsserver(info, createFakeTypescript(undefined)).getOverrides();
		const result = overrides.getCompletionEntryDetails?.(
			'App.ts',
			0,
			'formatDate',
			{},
			'@org/utils/formatDate.js',
			{},
			{ exportName: 'formatDate', fileName: '/repo/src/formatDate.ts', moduleSpecifier: '@org/utils/formatDate.js' }
		);

		expect(result?.codeActions).toBeUndefined();
	});

	it('원본 .js 항목을 선택했으면 손대지 않는다', () => {
		const originalText = "import { formatDate } from '@org/utils/formatDate.js';\n";
		const info = createFakeInfo({
			languageService: {
				getCompletionEntryDetails: () => ({
					codeActions: [{ changes: [{ textChanges: [{ newText: originalText }] }] }]
				})
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript(undefined)).getOverrides();
		const result = overrides.getCompletionEntryDetails?.(
			'App.ts',
			0,
			'formatDate',
			{},
			'@org/utils/formatDate.js',
			{},
			{ exportName: 'formatDate', fileName: '/repo/src/formatDate.ts', moduleSpecifier: '@org/utils/formatDate.js' }
		);

		expect(result?.codeActions?.[0]?.changes[0]?.textChanges[0]?.newText).toBe(originalText);
	});

	it('add 모드로 추가된 .ts 항목을 선택했을 때만 codeActions의 specifier를 고친다', () => {
		const info = createFakeInfo({
			languageService: {
				getCompletionEntryDetails: () => ({
					codeActions: [
						{
							changes: [
								{ textChanges: [{ newText: "import { formatDate } from '@org/utils/formatDate.js';\n" }] }
							]
						}
					]
				})
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript(undefined)).getOverrides();
		const result = overrides.getCompletionEntryDetails?.(
			'App.ts',
			0,
			'formatDate',
			{},
			'@org/utils/formatDate.ts',
			{},
			{ exportName: 'formatDate', fileName: '/repo/src/formatDate.ts', moduleSpecifier: '@org/utils/formatDate.js' }
		);

		expect(result?.codeActions?.[0]?.changes[0]?.textChanges[0]?.newText ?? '').toMatch(FORMAT_DATE_TS);
	});

	it('add 모드로 추가된 항목이어도 textChange에 fakeSpecifier가 없으면 건드리지 않는다', () => {
		const unrelatedText = "import { unrelated } from '@org/utils/unrelated.js';\n";
		const info = createFakeInfo({
			languageService: {
				getCompletionEntryDetails: () => ({
					codeActions: [{ changes: [{ textChanges: [{ newText: unrelatedText }] }] }]
				})
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript(undefined)).getOverrides();
		const result = overrides.getCompletionEntryDetails?.(
			'App.ts',
			0,
			'formatDate',
			{},
			'@org/utils/formatDate.ts',
			{},
			{ exportName: 'formatDate', fileName: '/repo/src/formatDate.ts', moduleSpecifier: '@org/utils/formatDate.js' }
		);

		expect(result?.codeActions?.[0]?.changes[0]?.textChanges[0]?.newText).toBe(unrelatedText);
	});
});

describe('Tsserver#getOverrides() - patchMissingImportChanges 경계 조건', () => {
	it('getProgram이 undefined면 아무 것도 고치지 않는다', () => {
		const originalText = "import { formatDate } from '@org/utils/formatDate.js';\n";
		const info = createFakeInfo({
			languageService: {
				getCodeFixesAtPosition: () => [
					{
						changes: [{ fileName: 'App.ts', textChanges: [{ newText: originalText }] }],
						description: '"@org/utils/formatDate.js"에서 가져오기 추가',
						fixId: 'fixMissingImport',
						fixName: 'import'
					}
				],
				getProgram: () => undefined
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript('/repo/src/formatDate.ts')).getOverrides();
		const result = overrides.getCodeFixesAtPosition?.('App.ts', 0, 0, [2304], {}, {});

		expect(result?.[0]?.changes[0]?.textChanges[0]?.newText).toBe(originalText);
		expect(result?.[0]?.description).toBe('"@org/utils/formatDate.js"에서 가져오기 추가');
	});

	it('specifier가 이미 실제 확장자와 일치하면 그대로 둔다', () => {
		const originalText = "import { formatDate } from '@org/utils/formatDate.ts';\n";
		const info = createFakeInfo({
			languageService: {
				getCombinedCodeFix: () => ({
					changes: [{ fileName: 'App.ts', textChanges: [{ newText: originalText }] }]
				})
			}
		});

		const overrides = new Tsserver(info, createFakeTypescript('/repo/src/formatDate.ts')).getOverrides();
		const result = overrides.getCombinedCodeFix?.({ fileName: 'App.ts', type: 'file' }, 'fixMissingImport', {}, {});

		expect(result?.changes[0]?.textChanges[0]?.newText).toBe(originalText);
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
		expect(logsOn.length).toBeGreaterThan(0);

		const logsOff: string[] = [];
		const infoOff = createFakeInfo({
			languageService: { getCompletionsAtPosition: () => ({ entries: [] }) },
			logs: logsOff
		});
		new Tsserver(infoOff, createFakeTypescript(undefined)).getOverrides().getCompletionsAtPosition?.('App.ts', 0, {}, {});
		expect(logsOff.length).toBe(0);
	});
});
