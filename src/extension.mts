/**
 * 확장자 모듈
 *
 * @author RWB
 * @since 2026.07.07 Tue 14:31:14
 */

export type Extension = '.tsx' | '.ts' | '.mts' | '.cts' | '.jsx' | '.js' | '.mjs' | '.cjs';

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

	/**
	 * .d.ts/.d.mts/.d.cts는 각각 .ts/.mts/.cts로 끝나지만 실제 소스가 아니라 타입 선언
	 * 파일이다. 아래 체크보다 먼저 걸러내지 않으면, 컴파일된 결과물과 선언 파일을 나란히
	 * 배포하는(예: node16/nodenext resolution을 쓰는 일반 패키지) 정상적인 .js/.mjs/.cjs
	 * import까지 존재하지 않는 .ts/.mts/.cts로 잘못 고쳐버린다.
	 */
	if (fileName.endsWith('.d.ts') || fileName.endsWith('.d.mts') || fileName.endsWith('.d.cts')) {
		return;
	}

	if (fileName.endsWith('.tsx')) {
		return '.tsx';
	}

	if (fileName.endsWith('.mts')) {
		return '.mts';
	}

	if (fileName.endsWith('.cts')) {
		return '.cts';
	}

	if (fileName.endsWith('.ts')) {
		return '.ts';
	}

	if (fileName.endsWith('.jsx')) {
		return '.jsx';
	}

	if (fileName.endsWith('.mjs')) {
		return '.mjs';
	}

	if (fileName.endsWith('.cjs')) {
		return '.cjs';
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
