/**
 * 인덱스 모듈
 *
 * @author RWB
 * @since 2026.07.07 Tue 18:53:14
 */

import type ts from 'typescript';
import type { server } from 'typescript';
import Tsserver from './tsserver.mts';

interface InitParams {
	/**
	 * 타입스크립트 객체
	 */
	typescript: typeof ts;
}

/**
 * 구동 메서드
 *
 * @returns 인터페이스
 */
export default function init({ typescript }: InitParams): Partial<server.PluginModule> {
	return {
		create(info) {
			const overrides = new Tsserver(info, typescript).getOverrides();

			return new Proxy(info.languageService, {
				get(target, prop, receiver) {
					if (prop in overrides) {
						// @ts-expect-error: prop이 string으로 수렴하지 않아 어쩔 수 없이 suppress
						return overrides[prop];
					}

					const value = Reflect.get(target, prop, receiver);
					return typeof value === 'function' ? value.bind(target) : value;
				}
			});
		}
	};
}
