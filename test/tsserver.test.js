'use strict';

/**
 * dist/index.cjs(빌드된 결과물)를 직접 테스트한다.
 *
 * src의 TypeScript 원본을 직접 require/import하지 않는 이유: 이 패키지는
 * "type": "commonjs"인데 소스는 ESM export 문법을 쓰기 때문에, Node가 소스 파일을
 * 직접 실행하면 CJS로 봐도(문법 에러), ESM으로 봐도(형제 .js 파일이 실제로는 없어서
 * 해석 실패) 둘 다 문제가 생긴다. 게다가 지금까지 겪은 버그(this 바인딩 소실,
 * export = 계약이 번들러에 의해 깨지는 것 등)는 전부 "소스 로직"이 아니라
 * "빌드된 결과물"에서 드러나는 문제였다 — 그래서 오히려 빌드 산출물을 테스트하는
 * 쪽이 실전과 더 가깝다. package.json의 pretest 스크립트가 테스트 전에 항상
 * 새로 빌드해준다.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('node:test');

const createPlugin = require(path.join(__dirname, '..', 'dist', 'index.cjs'));

const FORMAT_DATE_TS = /formatDate\.ts/u;

function createFakeTypescript(resolvedFileName) {
	return {
		resolveModuleName: () => ({
			resolvedModule: resolvedFileName ? { resolvedFileName } : undefined
		})
	};
}

function createFakeInfo({ languageService, config, logs }) {
	return {
		config: config ?? {},
		languageService: {
			getProgram: () => ({ getCompilerOptions: () => ({}) }),
			...languageService
		},
		languageServiceHost: {},
		project: { projectService: { logger: { info: (message) => (logs ?? []).push(message) } } }
	};
}

function createLanguageService(typescript, info) {
	return createPlugin({ typescript }).create(info);
}

describe('module contract', () => {
	it('module.exports는 팩토리 함수 그 자체다 (tsserver가 require()해서 바로 호출)', () => {
		assert.equal(typeof createPlugin, 'function');
		assert.equal(createPlugin.length, 1);
	});

	it('this 바인딩 없이 호출돼도 안전하다 (Proxy가 실제로 하는 방식과 동일)', () => {
		// Proxy의 get 트랩은 override 함수를 참조로만 꺼내서 반환하고, 호출부가
		// 임의의 this로 호출한다. 예전 클래스 버전은 이 상황에서 정확히 크래시가 났다.
		const info = createFakeInfo({ languageService: { getCompletionsAtPosition: () => ({ entries: [] }) } });
		const languageService = createLanguageService(createFakeTypescript(undefined), info);

		const detached = languageService.getCompletionsAtPosition;

		assert.doesNotThrow(() => {
			detached('App.ts', 0, {}, {});
		});
	});
});

describe('getCompletionsAtPosition', () => {
	it('add 모드(기본값): 원본 .js 항목은 유지하고 .ts 변형을 하나 더 추가한다', () => {
		const entry = { data: { fileName: '/repo/src/formatDate.ts' }, source: '@org/utils/formatDate.js' };
		const info = createFakeInfo({ languageService: { getCompletionsAtPosition: () => ({ entries: [{ ...entry }] }) } });
		const languageService = createLanguageService(createFakeTypescript(undefined), info);

		const result = languageService.getCompletionsAtPosition('App.ts', 0, {}, {});

		assert.equal(result.entries.length, 2);
		assert.equal(result.entries[0].source, '@org/utils/formatDate.js');
		assert.equal(result.entries[1].source, '@org/utils/formatDate.ts');
	});

	it('overwrite 모드: 원본 항목 자체를 .tsx로 덮어쓰고 개수는 그대로다', () => {
		const entry = { data: { fileName: '/repo/src/Button.tsx' }, source: '@org/ui/Button.jsx' };
		const info = createFakeInfo({
			config: { overwrite: true },
			languageService: { getCompletionsAtPosition: () => ({ entries: [{ ...entry }] }) }
		});
		const languageService = createLanguageService(createFakeTypescript(undefined), info);

		const result = languageService.getCompletionsAtPosition('App.tsx', 0, {}, {});

		assert.equal(result.entries.length, 1);
		assert.equal(result.entries[0].source, '@org/ui/Button.tsx');
	});

	it('실제로 .js를 배포하는 서드파티 패키지는 건드리지 않는다', () => {
		const entry = { data: { fileName: '/repo/node_modules/lodash/debounce.js' }, source: 'lodash/debounce.js' };
		const info = createFakeInfo({ languageService: { getCompletionsAtPosition: () => ({ entries: [{ ...entry }] }) } });
		const languageService = createLanguageService(createFakeTypescript(undefined), info);

		const result = languageService.getCompletionsAtPosition('App.ts', 0, {}, {});

		assert.equal(result.entries.length, 1);
		assert.equal(result.entries[0].source, 'lodash/debounce.js');
	});
});

describe('getCompletionEntryDetails', () => {
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
		const languageService = createLanguageService(createFakeTypescript(undefined), info);

		const result = languageService.getCompletionEntryDetails(
			'App.ts',
			0,
			'formatDate',
			{},
			'@org/utils/formatDate.ts',
			{},
			{ fileName: '/repo/src/formatDate.ts', moduleSpecifier: '@org/utils/formatDate.js' }
		);

		assert.match(result.codeActions[0].changes[0].textChanges[0].newText, FORMAT_DATE_TS);
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
		const languageService = createLanguageService(createFakeTypescript(undefined), info);

		const result = languageService.getCompletionEntryDetails(
			'App.ts',
			0,
			'formatDate',
			{},
			'@org/utils/formatDate.js',
			{},
			{ fileName: '/repo/src/formatDate.ts', moduleSpecifier: '@org/utils/formatDate.js' }
		);

		assert.equal(result.codeActions[0].changes[0].textChanges[0].newText, originalText);
	});
});

describe('getCodeFixesAtPosition', () => {
	it('fixId로 "Add import" 액션을 식별해서 description·textChanges를 고친다', () => {
		const info = createFakeInfo({
			languageService: {
				getCodeFixesAtPosition: () => [
					{
						changes: [
							{
								fileName: 'App.ts',
								textChanges: [{ newText: "import { formatDate } from '@org/utils/formatDate.js';\n" }]
							}
						],
						description: '"@org/utils/formatDate.js"에서 가져오기 추가',
						fixId: 'fixMissingImport',
						fixName: 'import'
					}
				]
			}
		});
		const languageService = createLanguageService(createFakeTypescript('/repo/src/formatDate.ts'), info);

		const result = languageService.getCodeFixesAtPosition('App.ts', 0, 0, [2304], {}, {});

		assert.equal(result[0].description, '"@org/utils/formatDate.ts"에서 가져오기 추가');
		assert.match(result[0].changes[0].textChanges[0].newText, FORMAT_DATE_TS);
	});

	it('fixId가 비어 있어도 fixName === "import"면 동일하게 고친다 (실환경 회귀 테스트)', () => {
		// 실제로 다른 tsserver 플러그인과 체이닝된 환경에서 fixId가 비어 있는 채로
		// 넘어오는 경우가 있었다 — fixName 폴백이 없으면 조용히 아무 것도 안 고쳐진다.
		const info = createFakeInfo({
			languageService: {
				getCodeFixesAtPosition: () => [
					{
						changes: [
							{
								fileName: 'App.ts',
								textChanges: [{ newText: "import { formatDate } from '@org/utils/formatDate.js';\n" }]
							}
						],
						description: '"@org/utils/formatDate.js"에서 가져오기 추가',
						fixId: undefined,
						fixName: 'import'
					}
				]
			}
		});
		const languageService = createLanguageService(createFakeTypescript('/repo/src/formatDate.ts'), info);

		const result = languageService.getCodeFixesAtPosition('App.ts', 0, 0, [2304], {}, {});

		assert.match(result[0].changes[0].textChanges[0].newText, FORMAT_DATE_TS);
	});

	it('import 추가와 무관한 fix(예: 함수 선언 추가)는 건드리지 않는다', () => {
		const originalText = '  function formatDate(status) {\n    throw new Error("Function not implemented.");\n  }\n\n';
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
		const languageService = createLanguageService(createFakeTypescript('/repo/src/formatDate.ts'), info);

		const result = languageService.getCodeFixesAtPosition('App.ts', 0, 0, [2304], {}, {});

		assert.equal(result[0].changes[0].textChanges[0].newText, originalText);
	});
});

describe('getCombinedCodeFix', () => {
	it('fixId가 "fixMissingImport"일 때만 일괄 삽입되는 import를 고친다', () => {
		const info = createFakeInfo({
			languageService: {
				getCombinedCodeFix: () => ({
					changes: [
						{
							fileName: 'App.ts',
							textChanges: [{ newText: "import { formatDate } from '@org/utils/formatDate.js';\n" }]
						}
					]
				})
			}
		});
		const languageService = createLanguageService(createFakeTypescript('/repo/src/formatDate.ts'), info);

		const result = languageService.getCombinedCodeFix({ fileName: 'App.ts', type: 'file' }, 'fixMissingImport', {}, {});

		assert.match(result.changes[0].textChanges[0].newText, FORMAT_DATE_TS);
	});

	it('다른 fixId로 호출되면 손대지 않는다', () => {
		const originalText = "import { formatDate } from '@org/utils/formatDate.js';\n";
		const info = createFakeInfo({
			languageService: {
				getCombinedCodeFix: () => ({ changes: [{ fileName: 'App.ts', textChanges: [{ newText: originalText }] }] })
			}
		});
		const languageService = createLanguageService(createFakeTypescript('/repo/src/formatDate.ts'), info);

		const result = languageService.getCombinedCodeFix({ fileName: 'App.ts', type: 'file' }, 'sortImports', {}, {});

		assert.equal(result.changes[0].textChanges[0].newText, originalText);
	});
});

describe('debug logging', () => {
	it('debug: true일 때만 로그를 남긴다', () => {
		const logsOn = [];
		const infoOn = createFakeInfo({
			config: { debug: true },
			languageService: { getCompletionsAtPosition: () => ({ entries: [] }) },
			logs: logsOn
		});
		createLanguageService(createFakeTypescript(undefined), infoOn).getCompletionsAtPosition('App.ts', 0, {}, {});
		assert.ok(logsOn.length > 0);

		const logsOff = [];
		const infoOff = createFakeInfo({
			languageService: { getCompletionsAtPosition: () => ({ entries: [] }) },
			logs: logsOff
		});
		createLanguageService(createFakeTypescript(undefined), infoOff).getCompletionsAtPosition('App.ts', 0, {}, {});
		assert.equal(logsOff.length, 0);
	});
});
