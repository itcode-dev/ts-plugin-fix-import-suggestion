/**
 * Typescript 서버 모듈
 *
 * @author RWB
 * @since 2026.07.08 Wed 11:40:59
 */

import type ts from 'typescript';
import type { CompletionEntry, FileTextChanges, LanguageService, server } from 'typescript';
import { fixExtension, getExtension } from './extension.mts';

/**
 * "Add all missing imports" / Quick Fix가 사용하는 code fix id·이름.
 *
 * getCompletionsAtPosition과 달리 getCodeFixesAtPosition·getCombinedCodeFix는
 * entry.data.fileName 같은 실제 resolve 정보를 안 주기 때문에, module specifier가
 * 실제로 가리키는 파일을 직접 resolve해봐야 한다.
 *
 * getCodeFixesAtPosition이 반환하는 개별 CodeFixAction은 실제 환경(다른 plugin과
 * 체이닝되는 조합에 따라)에서 fixId가 비어 있는 경우가 있어서, fixName도 같이 확인한다.
 */
const IMPORT_FIX_ID = 'fixMissingImport';
const IMPORT_FIX_NAME = 'import';

export interface PluginConfig {
	/**
	 * 디버그 (boolean expect)
	 */
	debug?: unknown;

	/**
	 * 덮어쓰기 (boolean expect)
	 */
	overwrite?: unknown;
}

export interface SpecifierFix {
	/**
	 * 수정 대상
	 */
	fixed: string;

	/**
	 * 소스
	 */
	specifier: string;
}

/**
 * 실제 LanguageService를 오버라이드해서, JIT 패키지의 .js/.jsx 자동완성·import
 * 제안을 실제 확장자(.ts/.tsx)로 고쳐준다.
 */
export default class Tsserver {
	/**
	 * 플러그인 정보
	 */
	private readonly info: server.PluginCreateInfo;

	/**
	 * 호스트(tsserver)가 실행 중인 typescript 인스턴스.
	 *
	 * require('typescript')로 직접 가져오지 않는 이유는, 그러면 호스트가 실제로
	 * 실행 중인 인스턴스와 다른 버전을 잡을 수 있기 때문이다. 플러그인 factory가
	 * 받는 인스턴스를 그대로 넘겨받아 쓴다.
	 */
	private readonly typescript: typeof ts;

	/**
	 * 덮어쓰기 여부
	 */
	private readonly isOverwrite: boolean;

	/**
	 * 디버그 여부
	 */
	private readonly isDebug: boolean;

	/**
	 * 생성자 메서드
	 *
	 * @param {PluginCreateInfo} info PluginCreateInfo
	 * @param {typeof ts} typescript 호스트가 실행 중인 typescript 인스턴스
	 */
	public constructor(info: server.PluginCreateInfo, typescript: typeof ts) {
		this.info = info;
		this.typescript = typescript;

		const config = info.config as PluginConfig;

		this.isOverwrite = config.overwrite === true;
		this.isDebug = config.debug === true;
	}

	/**
	 * Proxy에 그대로 넘길 override 메서드 모음을 만든다.
	 *
	 * 아래 4개는 private 메서드라 인스턴스에서 분리되면 this 바인딩을 잃는다.
	 * 그래서 여기서만 화살표 함수로 감싸서 내보낸다 — 화살표 함수는 정의되는 시점의
	 * this(=이 인스턴스)를 그대로 가두기 때문에, 이렇게 만들어진 함수는 어디로
	 * 뽑혀나가서 호출되든 항상 정확한 this로 동작한다.
	 *
	 * @returns override 메서드 모음
	 */
	public getOverrides(): Partial<LanguageService> {
		return {
			getCodeFixesAtPosition: (...args) => this.getCodeFixesAtPosition(...args),
			getCombinedCodeFix: (...args) => this.getCombinedCodeFix(...args),
			getCompletionEntryDetails: (...args) => this.getCompletionEntryDetails(...args),
			getCompletionsAtPosition: (...args) => this.getCompletionsAtPosition(...args)
		};
	}

	/**
	 * 에디터에서 타이핑하는 동안 뜨는 자동완성(IntelliSense) 목록을 만드는 LanguageService
	 * 인터페이스다. 사용자가 문자를 입력할 때마다 호출되며, 이 안에 auto-import 제안도
	 * 함께 포함되어 있다.
	 *
	 * 여기서는 auto-import로 제안된 항목 중 겉보기 specifier(.js/.jsx)와 실제 resolve된
	 * 파일(entry.data.fileName, .ts/.tsx)이 다른 것만 골라 확장자를 고친다.
	 *
	 * @param param0 getCompletionsAtPosition 파라미터
	 *
	 * @returns 자동완성 목록 (CompletionInfo)
	 */
	private getCompletionsAtPosition(
		...[fileName, position, options, formattingSettings]: Parameters<LanguageService['getCompletionsAtPosition']>
	): ReturnType<LanguageService['getCompletionsAtPosition']> {
		const result = this.info.languageService.getCompletionsAtPosition(fileName, position, options, formattingSettings);

		if (!result) {
			return result;
		}

		/**
		 * overwrite 모드: 필요없는 원본 항목은 제거하고 typescript 파일로 치환함
		 */
		if (this.isOverwrite) {
			// overwrite 모드일 경우 항목을 덮어씀
			let fixedCount = 0;

			for (const entry of result.entries) {
				if (!(entry.source && entry.data?.fileName)) {
					continue;
				}

				const fixed = fixExtension(entry.source, entry.data.fileName);

				if (fixed === entry.source) {
					continue;
				}

				entry.source = fixed;
				entry.sourceDisplay = [{ kind: 'text', text: fixed }];
				fixedCount++;
			}

			this.log(`getCompletionsAtPosition: ${result.entries.length} entries, ${fixedCount} overwritten`);

			return result;
		}

		/**
		 * 기본 모드: 원본은 그대로 두고 실제 파일 확장자를 보여주는 항목을 하나 더 추가한다.
		 *
		 * source/sourceDisplay만 바꾸고 data(실제 조회 키)는 원본과 동일하게 유지한다
		 * 안 그러면 존재하지 않는 경로로 조회해서 선택 시 아무것도 못 찾을 수 있다.
		 */

		const addedEntries: CompletionEntry[] = [];

		for (const entry of result.entries) {
			if (!(entry.source && entry.data?.fileName)) {
				continue;
			}

			const fixed = fixExtension(entry.source, entry.data.fileName);

			if (fixed === entry.source) {
				continue;
			}

			addedEntries.push({
				...entry,
				source: fixed,
				sourceDisplay: [{ kind: 'text', text: fixed }]
			});
		}

		result.entries.push(...addedEntries);

		this.log(`getCompletionsAtPosition: ${result.entries.length} entries, ${addedEntries.length} variants added`);

		return result;
	}

	/**
	 * 사용자가 getCompletionsAtPosition이 보여준 자동완성 목록에서 항목 하나를 실제로
	 * 선택(Tab/Enter)했을 때, 그 항목을 적용하기 위한 상세 정보 — 실제로 삽입될
	 * import 구문을 담은 codeActions — 를 만드는 LanguageService 인터페이스다.
	 *
	 * 우리가 add 모드에서 추가한 .ts/.tsx 변형 항목을 선택한 경우에만, 거기 담긴
	 * codeActions의 textChanges 안 겉보기 specifier를 실제 확장자로 고쳐서 반영한다.
	 * 원본 .js 항목을 선택했으면 그대로 둔다.
	 *
	 * @param param0 getCompletionEntryDetails 파라미터
	 *
	 * @returns 선택된 항목의 상세 정보 (CompletionEntryDetails)
	 */
	private getCompletionEntryDetails(
		...[fileName, position, entryName, formatOptions, source, preferences, data]: Parameters<
			LanguageService['getCompletionEntryDetails']
		>
	): ReturnType<LanguageService['getCompletionEntryDetails']> {
		const result = this.info.languageService.getCompletionEntryDetails(
			fileName,
			position,
			entryName,
			formatOptions,
			source,
			preferences,
			data
		);

		if (!result?.codeActions) {
			return result;
		}

		/**
		 * source는 사용자가 실제로 선택한 항목의 source다.
		 *
		 * data는 원본 .js 항목과 우리가 추가한 .ts 항목이 동일하게 공유하기 때문에,
		 * source가 이미 실제 확장자(.ts/.tsx)로 끝나는 경우(=우리가 추가한 항목을 선택한 경우)에만 고친다.
		 * 원본 .js 항목을 선택했으면 건드리지 않는다.
		 */

		const realExt = getExtension(data?.fileName);
		const pickedAddedEntry = realExt && source?.endsWith(realExt);

		const fakeSpecifier = data?.moduleSpecifier;
		const fixedSpecifier = pickedAddedEntry && fakeSpecifier ? fixExtension(fakeSpecifier, data.fileName) : undefined;

		let patchedCount = 0;

		if (fixedSpecifier && fakeSpecifier && fixedSpecifier !== fakeSpecifier) {
			for (const codeAction of result.codeActions) {
				for (const change of codeAction.changes) {
					for (const textChange of change.textChanges) {
						if (textChange.newText.includes(fakeSpecifier)) {
							textChange.newText = textChange.newText.split(fakeSpecifier).join(fixedSpecifier);
							patchedCount++;
						}
					}
				}
			}
		}

		this.log(`getCompletionEntryDetails: ${patchedCount} textChanges patched`);

		return result;
	}

	/**
	 * 에디터의 Quick Fix(전구 아이콘, VS Code 기준 Cmd+.)가 특정 위치의 진단
	 * (예: "Cannot find name 'x'")에 대해 제안하는 코드 수정 목록을 만드는
	 * LanguageService 인터페이스다.
	 *
	 * 이 중 "Add import" 계열 fix(fixId·fixName으로 식별)만 골라서, 삽입될 import
	 * 구문과 드롭다운에 표시되는 description 안의 겉보기 specifier를 실제 확장자로
	 * 고친다.
	 *
	 * @param param0 getCodeFixesAtPosition 파라미터
	 *
	 * @returns 코드 수정 제안 목록 (CodeFixAction[])
	 */
	private getCodeFixesAtPosition(
		...[fileName, start, end, errorCodes, formatOptions, preferences]: Parameters<LanguageService['getCodeFixesAtPosition']>
	): ReturnType<LanguageService['getCodeFixesAtPosition']> {
		const result = this.info.languageService.getCodeFixesAtPosition(
			fileName,
			start,
			end,
			errorCodes,
			formatOptions,
			preferences
		);

		let patchedCount = 0;

		for (const action of result) {
			if (action.fixId !== IMPORT_FIX_ID && action.fixName !== IMPORT_FIX_NAME) {
				continue;
			}

			const fixes = this.patchMissingImportChanges(action.changes);

			// description(Quick Fix 드롭다운에 뜨는 문구)에도 같은 specifier가 그대로 박혀 있어서
			// textChanges만 고치면 목록엔 여전히 원래 .js 경로가 보인다.
			for (const { fixed, specifier } of fixes) {
				action.description = action.description.split(specifier).join(fixed);
			}

			patchedCount += fixes.length;
		}

		this.log(`getCodeFixesAtPosition: ${result.length} actions, ${patchedCount} specifiers patched`);

		return result;
	}

	/**
	 * "Add all missing imports"처럼, 파일 하나에 있는 같은 fixId의 Quick Fix를 한 번에
	 * 전부 적용해주는 LanguageService 인터페이스다 (getCodeFixesAtPosition이 위치
	 * 하나짜리라면, 이건 파일 전체 스코프로 일괄 적용하는 버전).
	 *
	 * fixId가 import 추가("fixMissingImport")일 때만 개입해서, 일괄 삽입되는 모든
	 * import 구문의 겉보기 specifier를 실제 확장자로 고친다.
	 *
	 * @param param0 getCombinedCodeFix 파라미터
	 *
	 * @returns 파일 전체에 적용될 변경 사항 (CombinedCodeActions)
	 */
	private getCombinedCodeFix(
		...[scope, fixId, formatOptions, preferences]: Parameters<LanguageService['getCombinedCodeFix']>
	): ReturnType<LanguageService['getCombinedCodeFix']> {
		const result = this.info.languageService.getCombinedCodeFix(scope, fixId, formatOptions, preferences);

		if (fixId !== IMPORT_FIX_ID) {
			return result;
		}

		const patchedCount = this.patchMissingImportChanges(result.changes).length;

		this.log(`getCombinedCodeFix: ${patchedCount} specifiers patched`);

		return result;
	}

	/**
	 * code fix의 textChanges 안에 삽입된 import 구문에서 module specifier를 찾아,
	 * 실제로 resolve되는 파일과 확장자가 다르면 고쳐서 그 자리에서 patch한다.
	 *
	 * host.getResolvedModuleWithFailedLookupLocationsFromCache는 resolveModuleNameLiterals를
	 * 구현하는 최신 host(tsserver 포함)에서는 애초에 호출되지 않는 죽은 경로라 값을 못 얻는다.
	 * 그래서 this.typescript의 resolveModuleName을, host를 ModuleResolutionHost로
	 * 재사용해서 직접 호출한다.
	 *
	 * @param {FileTextChanges[]} changes FileTextChanges 배열
	 *
	 * @returns 실제로 고쳐진 (원본, 수정본) specifier 목록. textChanges 밖(예: description)에서
	 * 같은 specifier를 다시 치환하고 싶을 때 이 목록을 그대로 재사용한다.
	 */
	private patchMissingImportChanges(changes: readonly FileTextChanges[]): SpecifierFix[] {
		const program = this.info.languageService.getProgram();

		if (!program) {
			return [];
		}

		const compilerOptions = program.getCompilerOptions();
		const moduleResolutionHost = this.info.languageServiceHost;
		const fixes: SpecifierFix[] = [];

		for (const change of changes) {
			for (const textChange of change.textChanges) {
				textChange.newText = textChange.newText.replace(
					/\bfrom\s+(['"])([^'"]+)\1/gu,
					(whole, quote: string, specifier: string) => {
						const resolved = this.typescript.resolveModuleName(
							specifier,
							change.fileName,
							compilerOptions,
							moduleResolutionHost
						);
						const fixed = fixExtension(specifier, resolved.resolvedModule?.resolvedFileName);

						if (fixed === specifier) {
							return whole;
						}

						fixes.push({ fixed, specifier });

						return `from ${quote}${fixed}${quote}`;
					}
				);
			}
		}

		return fixes;
	}

	/**
	 * 로깅 메서드
	 *
	 * @param {string} message 메시지
	 */
	private log(message: string): void {
		if (this.isDebug) {
			this.info.project.projectService.logger.info(`[ts-plugin-fix-import-extension] ${message}`);
		}
	}
}
