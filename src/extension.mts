/**
 * 확장자 모듈
 *
 * @author RWB
 * @since 2026.07.07 Tue 14:31:14
 */

export type Extension = '.tsx' | '.ts' | '.jsx' | '.js';

/**
 * 확장자 반환 메서드
 *
 * @param {string} fileName 파일명
 *
 * @returns {Extension} 확장자
 */
export function getExtension(fileName?: string): Extension | undefined {
	if (fileName === undefined) {
		return;
	}

	if (fileName.endsWith('.tsx')) {
		return '.tsx';
	}

	if (fileName.endsWith('.ts')) {
		return '.ts';
	}

	if (fileName.endsWith('.jsx')) {
		return '.jsx';
	}

	if (fileName.endsWith('.js')) {
		return '.js';
	}
}

/**
 * 확장자 수정 메서드
 *
 * @param {string} specifier 지시문
 * @param {string} fileName 파일명
 *
 * @returns {string} 확장자
 */
export function fixExtension(specifier: string, fileName?: string): string {
	const displayExt = getExtension(specifier);
	const fileExt = getExtension(fileName);

	if (!(displayExt && fileExt)) {
		return specifier;
	}

	return `${specifier.slice(0, -displayExt.length)}${fileExt}`;
}
