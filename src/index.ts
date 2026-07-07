/**
 * 인덱스 모듈
 *
 * @author RWB
 * @since 2026.07.07 Tue 18:53:14
 */

import type ts from 'typescript';
import type { CompletionEntry, FileTextChanges, LanguageService, server } from 'typescript';
import { fixExtension, getExtension } from './extension.js';

interface PluginConfig {
	/**
	 * 디버그 (boolean expect)
	 */
	debug?: unknown;

	/**
	 * 덮어쓰기 (boolean expect)
	 */
	overwrite?: unknown;
}

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

interface SpecifierFix {
	fixed: string;
	specifier: string;
}

/**
 * code fix의 textChanges 안에 삽입된 import 구문에서 module specifier를 찾아,
 * 실제로 resolve되는 파일과 확장자가 다르면 고쳐서 그 자리에서 patch한다.
 *
 * host.getResolvedModuleWithFailedLookupLocationsFromCache는 resolveModuleNameLiterals를
 * 구현하는 최신 host(tsserver 포함)에서는 애초에 호출되지 않는 죽은 경로라 값을 못 얻는다.
 * 그래서 플러그인 factory가 받는 typescript 인스턴스의 resolveModuleName을, host를
 * ModuleResolutionHost로 재사용해서 직접 호출한다.
 *
 * @returns 실제로 고쳐진 (원본, 수정본) specifier 목록. textChanges 밖(예: description)에서
 * 같은 specifier를 다시 치환하고 싶을 때 이 목록을 그대로 재사용한다.
 */
function patchMissingImportChanges(
	changes: readonly FileTextChanges[],
	typescript: typeof ts,
	info: ts.server.PluginCreateInfo
): SpecifierFix[] {
	const program = info.languageService.getProgram();

	if (!program) {
		return [];
	}

	const compilerOptions = program.getCompilerOptions();
	const moduleResolutionHost = info.languageServiceHost;
	const fixes: SpecifierFix[] = [];

	for (const change of changes) {
		for (const textChange of change.textChanges) {
			textChange.newText = textChange.newText.replace(
				/\bfrom\s+(['"])([^'"]+)\1/gu,
				(whole, quote: string, specifier: string) => {
					const resolved = typescript.resolveModuleName(
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
 * 구동 메서드
 *
 * @returns 인터페이스
 */
function init({ typescript }: { typescript: typeof ts }): Partial<server.PluginModule> {
	return {
		create(info) {
			const config = info.config as PluginConfig;

			const isDebug = config.debug === true;
			const isOverwrite = config.overwrite === true;

			const log = (message: string) => {
				if (isDebug) {
					info.project.projectService.logger.info(`[ts-plugin-fix-import-extension] ${message}`);
				}
			};

			log(`create() called (overwrite: ${isOverwrite})`);

			const getCompletionsAtPosition: LanguageService['getCompletionsAtPosition'] = (
				fileName,
				position,
				options,
				formattingSettings
			): ReturnType<LanguageService['getCompletionsAtPosition']> => {
				const result = info.languageService.getCompletionsAtPosition(fileName, position, options, formattingSettings);

				if (!result) {
					return result;
				}

				if (isOverwrite) {
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

					log(`getCompletionsAtPosition: ${result.entries.length} entries, ${fixedCount} overwritten`);

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

				log(`getCompletionsAtPosition: ${result.entries.length} entries, ${addedEntries.length} variants added`);

				return result;
			};

			const getCompletionEntryDetails: LanguageService['getCompletionEntryDetails'] = (
				fileName,
				position,
				entryName,
				formatOptions,
				source,
				preferences,
				data
			): ReturnType<LanguageService['getCompletionEntryDetails']> => {
				const result = info.languageService.getCompletionEntryDetails(
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
				const fixedSpecifier =
					pickedAddedEntry && fakeSpecifier ? fixExtension(fakeSpecifier, data.fileName) : undefined;

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

				log(`getCompletionEntryDetails: ${patchedCount} textChanges patched`);

				return result;
			};

			const getCodeFixesAtPosition: LanguageService['getCodeFixesAtPosition'] = (
				fileName,
				start,
				end,
				errorCodes,
				formatOptions,
				preferences
			): ReturnType<LanguageService['getCodeFixesAtPosition']> => {
				const result = info.languageService.getCodeFixesAtPosition(
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

					const fixes = patchMissingImportChanges(action.changes, typescript, info);

					// description(Quick Fix 드롭다운에 뜨는 문구)에도 같은 specifier가 그대로 박혀 있어서
					// textChanges만 고치면 목록엔 여전히 원래 .js 경로가 보인다.
					for (const { fixed, specifier } of fixes) {
						action.description = action.description.split(specifier).join(fixed);
					}

					patchedCount += fixes.length;
				}

				log(`getCodeFixesAtPosition: ${result.length} actions, ${patchedCount} specifiers patched`);

				return result;
			};

			const getCombinedCodeFix: LanguageService['getCombinedCodeFix'] = (
				scope,
				fixId,
				formatOptions,
				preferences
			): ReturnType<LanguageService['getCombinedCodeFix']> => {
				const result = info.languageService.getCombinedCodeFix(scope, fixId, formatOptions, preferences);

				if (fixId !== IMPORT_FIX_ID) {
					return result;
				}

				const patchedCount = patchMissingImportChanges(result.changes, typescript, info).length;

				log(`getCombinedCodeFix: ${patchedCount} specifiers patched`);

				return result;
			};

			const overrides = {
				getCodeFixesAtPosition,
				getCombinedCodeFix,
				getCompletionEntryDetails,
				getCompletionsAtPosition
			};

			return new Proxy(info.languageService, {
				get(target, prop, receiver) {
					if (prop in overrides) {
						// @ts-expect-error
						return overrides[prop];
					}

					const value = Reflect.get(target, prop, receiver);
					return typeof value === 'function' ? value.bind(target) : value;
				}
			});
		}
	};
}

export = init;
