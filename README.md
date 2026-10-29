# CalCheck — 구글 캘린더 연동 체크리스트 (v0 프로토타입)

구글 캘린더를 **유일한 원본**으로 쓰는 개인용 체크리스트 PWA. 서버도 DB도 없다.
할 일·목표는 앱 전용 캘린더의 종일 이벤트로 저장되고, 완료 상태와 진행량은 이벤트의
`extendedProperties.private`에 들어간다. 위젯에서 끌어 옮기거나 지운 것이 곧 새 상태다.

스펙 문서: 채팅의 「캘린더 체크리스트 앱 스펙 v0.1」 참고.

## 1. 구글 쪽 준비 (한 번만, 약 10분)

1. [Google Cloud Console](https://console.cloud.google.com/) → 새 프로젝트.
2. **API 및 서비스 → 라이브러리** → "Google Calendar API" 사용 설정.
3. **OAuth 동의 화면** → 외부(External), 앱 이름 아무거나, 테스트 사용자에 본인 Gmail 추가.
   범위(scope)는 `https://www.googleapis.com/auth/calendar` 하나.
4. **사용자 인증 정보 → OAuth 2.0 클라이언트 ID → 웹 애플리케이션**.
   승인된 JavaScript 원본에 `http://localhost:5173` 과 나중에 배포할 도메인(예: `https://내아이디.github.io`) 등록.
   리디렉션 URI는 필요 없다 (토큰 클라이언트 방식).
5. 발급된 클라이언트 ID를 `.env`에 넣는다:

```
cp .env.example .env
# VITE_GOOGLE_CLIENT_ID=....apps.googleusercontent.com
```

비용은 없다. Calendar API는 호출당 과금이 없고 쿼터(하루 100만 건) 초과 시 요금이 아니라 거절이 돌아온다.
동의 화면이 "테스트" 상태여도 괜찮다 — 이 앱은 1시간짜리 access token만 쓰고 refresh token을 안 쓰므로 7일 만료 문제가 없다.
매시간 뜨는 토큰 팝업이 거슬리면 동의 화면을 "프로덕션"으로 올리면 된다(검증 불필요, "확인되지 않은 앱" 경고 1회).

## 2. 실행

```
npm install
npm run dev          # http://localhost:5173
npm run dev:mock     # 구글 로그인 없이 가짜 데이터로 화면만 보기
npm test             # 분배 계산 테스트 (스펙 4절 예시 표가 첫 케이스)
npm run build        # dist/ 생성 — GitHub Pages / Vercel 등 정적 호스팅에 그대로 올린다
```

폰에서 쓰려면: 배포한 주소를 Chrome/Safari로 열고 "홈 화면에 추가". 할 일은 구글 캘린더 위젯에서
**"할 일" 캘린더**를 켜면 보인다 (앱이 첫 로그인 때 자동 생성).

## 3. 구조

```
src/
  api/calendar.ts   # Calendar API v3 — 8개 호출을 fetch로. 401이면 토큰 한 번 재발급 후 재시도
  api/mock.ts       # VITE_MOCK=1 일 때의 가짜 API
  api/index.ts      # 둘 중 하나를 내보냄
  auth.ts           # Google Identity Services 토큰 클라이언트 (토큰은 메모리에만)
  model/dates.ts    # 'YYYY-MM-DD' 산수. 모든 날짜는 Asia/Seoul 기준
  model/items.ts    # 체크 항목 / 목표 / 외부 이벤트 ↔ 구글 이벤트 변환, 제목 포맷
  model/plan.ts     # 오늘 몫 q, 하루 부하 L, 회차 상한, 이월 — 순수 함수
  model/plan.test.ts
  store.ts          # 상태. 영속 저장은 설정·선택 캘린더·앱 캘린더 ID뿐
  views/Today.tsx   # 오늘 뷰: 일정 체크, 할 일 체크, 목표 +1
  views/Week.tsx    # 주간 뷰: 7칸 부하/상한 막대
  views/EditSheet.tsx
  views/Settings.tsx
```

## 4. 설계에서 지킨 원칙 (코드 읽을 때 기준)

- **캘린더가 원본.** 앱은 "읽고 → 바꾸고 → patch"만 한다. 캐시를 믿지 않고, 포그라운드로 올 때마다 다시 읽는다.
- **쓰기는 앱 전용 캘린더에만.** 사용자 캘린더의 이벤트에는 보이지 않는 private 속성(`done`)만 쓴다. 제목·시간은 절대 보내지 않는다.
- **분배는 저장하지 않고 계산한다.** 오늘 몫 = ⌈남은 양 ÷ 남은 날⌉. 오늘 덜 하면 내일 몫이 저절로 오른다. 계획을 다시 짤 일이 없다.
- **시간이 아니라 회차.** 하루 부하는 회차 합, 상한은 본인이 정한 값. 빈 시간 계산보다 정직하다.

## 5. v0에 없는 것 (v1)

주간 뷰 드래그 이동, 하위 항목형 목표, `etag` 충돌 감지, 반복 일정 템플릿, 오프라인 쓰기 큐.
