# ts-plugin-fix-import-suggestion

[English](README.md) | **한국어**

[Turborepo](https://turborepo.com/)의 [JIT(Just-In-Time) 패키지](https://turborepo.com/docs/core-concepts/internal-packages#just-in-time-packages) 방식을 쓸 때 에디터(VS Code 등)의 자동 import 제안이 잘못된 파일 확장자를 표시하는 버그를 우회하는 TypeScript Language Service Plugin입니다.

## 문제 상황

Turborepo의 JIT 패키지 방식을 쓰면, 내부 패키지가 `.ts`/`.tsx` 소스 파일을 빌드 과정 없이 그대로 export합니다. 예를 들어 `@your-org/utils` 패키지가 `src/formatDate.ts`를 그대로 내보낸다고 해봐요:

```
your-monorepo/
├── apps/
│   └── web/
│       └── src/
│           └── App.ts          -- 여기서 타이핑하는 중
└── packages/
    └── utils/
        ├── package.json        -- "exports": { "./*": "./src/*" }
        └── src/
            └── formatDate.ts   -- 실제 파일 (소스 그대로 배포, 컴파일 안 됨)
```

`App.ts`에서 `formatDate(`를 입력하고 에디터가 제안하는 자동 import를 그대로 선택하면 이렇게 되길 기대하죠:

```ts
import { formatDate } from '@your-org/utils/formatDate.ts';
```

하지만 실제로 VS Code는 이렇게 삽입합니다:

```ts
import { formatDate } from '@your-org/utils/formatDate.js';
```

`formatDate.js`라는 파일은 존재하지 않아요 — 있는 건 `formatDate.ts`뿐입니다. TypeScript는 `.js` specifier를 같은 이름의 `.ts`/`.tsx` 파일로 되돌려주는 특수 규칙이 있어서 컴파일과 타입 체크는 문제없이 되지만(그래서 실제로 뭔가 깨지진 않아요), import 코드 자체는 보기에 이상하고 헷갈리며, import specifier가 실제 파일을 가리킨다고 가정하는 다른 툴에서 문제가 될 수 있습니다.

이 플러그인은 정확히 이 불일치 — 제안된 specifier는 `.js`/`.jsx`로 끝나는데 TypeScript가 실제로 resolve한 파일은 `.ts`/`.tsx`로 끝나는 경우 — 를 감지해서, 제안을 실제 확장자로 고쳐줍니다. `tsc`는 language service plugin을 로드하지 않으므로 빌드나 타입 체크에는 아무 영향이 없습니다 — 오직 에디터의 IntelliSense가 보여주고 삽입하는 내용만 바꿉니다.

실제로 `.js`/`.jsx` 파일을 배포하는 서드파티 패키지는 영향을 받지 않습니다 — 겉보기 specifier의 확장자와 실제 resolve된 파일의 확장자가 다를 때만 동작합니다.

## 계속 필요한 디펜던시인가요?

이 패키지는 VS Code의 TypeScript 통합이 JIT 패키지에 대해 자동 import specifier를 생성하는 현재 방식을 우회하기 위해서만 존재합니다. VS Code(또는 그 기반이 되는 TypeScript language service)가 이 문제를 근본적으로 고치면, 이 플러그인은 더 이상 필요 없어집니다 — 그때는 `tsconfig.json`에서 제거하고 의존성에서 삭제하시면 됩니다.

## 설치

```sh
npm install --save-dev @itcode-dev/ts-plugin-fix-import-suggestion
```

```sh
yarn add --dev @itcode-dev/ts-plugin-fix-import-suggestion
```

```sh
pnpm add --save-dev @itcode-dev/ts-plugin-fix-import-suggestion
```

## 전제조건: `allowImportingTsExtensions`

이 플러그인의 핵심은 제안을 실제 확장자인 `.ts`/`.tsx`로 끝나게 만드는 거예요. 그런데 TypeScript는 기본적으로 `.ts`/`.tsx`로 끝나는 import specifier를 거부합니다(`An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled`). JIT 패키지 구성이라면 대부분 이미 이 옵션이 켜져 있을 거예요(JIT 패키지는 애초에 `tsc`로 결과물을 emit하지 않으므로, 이 옵션과 함께 `noEmit`/`emitDeclarationOnly`가 필요하거든요). 혹시 저 에러가 보인다면 `tsconfig.json`에 추가해주세요:

```jsonc
{
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}
```

## 사용법

`tsconfig.json`의 `compilerOptions.plugins` 배열에 플러그인을 추가합니다:

```jsonc
{
  "compilerOptions": {
    "plugins": [
      { "name": "@itcode-dev/ts-plugin-fix-import-suggestion" }
    ]
  }
}
```

이후 에디터에서 TypeScript 서버를 재시작합니다 (VS Code: **TypeScript: Restart TS Server**).

> [!IMPORTANT]
> VS Code에서는 반드시 **워크스페이스 버전**의 TypeScript를 사용해야 합니다 — VS Code에 내장된 버전이 아니라요. VS Code는 `tsconfig.json`에 선언된 플러그인을, 실제로 `tsserver`를 구동 중인 TypeScript 설치 위치를 기준으로 찾습니다. 만약 그게 VS Code 내장 TypeScript라면(별도로 선택하지 않았다면 기본값입니다) 프로젝트의 `node_modules`는 아예 탐색하지 않기 때문에, 이 플러그인을 포함해 로컬에 설치된 어떤 플러그인도 에러 하나 없이 조용히 로드되지 않습니다. `.ts`/`.tsx` 파일을 열고 상태 표시줄(우측 하단)의 TypeScript 버전 번호를 클릭한 뒤 **Use Workspace Version**을 선택하세요.
>
> 각자 수동으로 바꾸도록 맡기는 대신, 레포의 `.vscode/settings.json`에 `js/ts.tsdk.promptToUseWorkspaceVersion`을 켜두면 이 워크스페이스를 여는 사람 누구에게나 VS Code가 워크스페이스 버전으로 전환할지 직접 물어봐 줍니다:
>
> ```jsonc
> // .vscode/settings.json
> {
>   "js/ts.tsdk.promptToUseWorkspaceVersion": true
> }
> ```

## 옵션

| 옵션        | 타입      | 기본값  | 설명                                                                                                   |
| ----------- | --------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `debug`     | `boolean` | `false` | 플러그인 동작을 TS 서버 로그에 기록합니다.                                                              |
| `overwrite` | `boolean` | `false` | `false`(기본값)이면 원본 제안은 그대로 두고 고쳐진 제안을 하나 더 추가합니다. `true`면 원본 제안 자체를 고쳐진 것으로 덮어씁니다. |

```jsonc
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@itcode-dev/ts-plugin-fix-import-suggestion",
        "debug": false,
        "overwrite": true
      }
    ]
  }
}
```

## 개발

```sh
pnpm install
pnpm run build          # tsdown으로 src/를 dist/에 번들링
pnpm run typecheck      # tsc --noEmit
pnpm run check          # biome check
pnpm run test           # dist/를 빌드한 뒤 vitest 스위트 실행
pnpm run test:coverage  # 위와 동일 + coverage 리포트 (100% 임계값 강제)
```

테스트는 두 가지 방식을 섞어서 씁니다. `src/**/*.test.mts`는 빌드 없이 소스를 직접 단위 테스트하고, `test/tsserver.test.mts`는 빌드된 `dist/index.cjs`를 로드해서 tsserver가 실제로 의존하는 CommonJS 계약을 검증합니다 — 소스 레벨 테스트로는 잡을 수 없는 번들러/빌드 산출물 회귀는 이쪽에서 걸러집니다.

## 주의사항

- 이 플러그인은 **VS Code**의 제한적인 셋업에서만 동작을 확인했습니다. WebStorm, Neovim 등 다른 tsserver 기반 에디터에서는 테스트되지 않았어요.
- TypeScript 플러그인은 여러 개가 체이닝될 수 있습니다 — `tsconfig.json`의 `plugins` 배열에 여러 항목이 있으면 각각이 앞선 플러그인의 `LanguageService`를 감싸는 구조예요. **이 플러그인과 함께 체이닝되는 다른 플러그인이 무엇이냐**에 따라(예: Next.js의 TS 플러그인, `@mdx-js/typescript-plugin` 같은 Volar 기반 플러그인) 이 플러그인이 의존하는 데이터의 형태가 항상 보장되지는 않습니다. 실제로 어떤 체이닝 조합에서는 `getCodeFixesAtPosition`의 `fixId` 필드가 비어 있는 걸 발견해서, `fixName`도 함께 확인하도록 우회해뒀어요. 이 외에도 특정 플러그인 조합에서 예상대로 동작하지 않는 경우가 있을 수 있습니다 — 그런 경우를 만나면 `"debug": true`를 켜고 TS 서버 로그를 확인하는 게 원인을 가장 빠르게 파악하는 방법이에요.

## 라이선스

MIT
