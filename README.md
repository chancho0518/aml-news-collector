# AML News Collector

AML(자금세탁방지) 관련 뉴스를 RSS로 자동 수집하는 파이프라인 (Phase 1).

## 구조

```
aml-news-collector/
├── .github/workflows/collect.yml   # 4시간 주기 자동 수집 + Discord 알림 워크플로우
├── scripts/
│   ├── sources.js                  # RSS 소스 13개 정의
│   ├── keywords.js                 # AML 키워드셋 + 매칭 함수
│   ├── store.js                    # 저장/중복제거 공통 로직
│   ├── collect.js                  # RSS 수집 → 필터링 → 중복제거 → 저장
│   ├── collect-ofac-email.js       # OFAC GovDelivery 이메일(IMAP) 수집 → 저장
│   ├── translate.js                # Gemini API로 영문 신규 기사 직역
│   ├── notify-discord.js           # 이번 실행에서 새로 수집된 기사를 Discord 웹훅으로 전송
│   └── daily-digest.js             # (하루 1회) 그날 전체 기사 기반 트렌드 요약 → Discord
├── data/
│   ├── processed/{YYYY-MM-DD}.json # 날짜별 수집 결과 누적
│   └── index/seen.json             # 최근 90일 중복 방지 인덱스
├── tmp/latest-batch.json           # 이번 실행에서 새로 수집된 기사만 (git 추적 안 함)
└── package.json
```

## 로컬 실행

```bash
npm install
npm run collect
```

실행 후 `data/processed/오늘날짜.json`에 신규 기사가 누적되고, `data/index/seen.json`이 갱신됩니다.
이번 실행에서 새로 잡힌 기사만 `tmp/latest-batch.json`에 별도로 저장됩니다.

## Discord 알림

`tmp/latest-batch.json`에 담긴 신규 기사를 Discord 채널로 전송합니다 (원문 그대로, 요약은 Phase 2에서 추가 예정).

1. Discord 채널 → 설정 → 연동 → 웹후크 → 새 웹후크 생성 → URL 복사
2. GitHub 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `DISCORD_WEBHOOK_URL`, Value: 복사한 웹훅 URL
3. 로컬에서 테스트하려면:
   ```bash
   DISCORD_WEBHOOK_URL="복사한 URL" npm run notify:discord
   ```
   (PowerShell: `$env:DISCORD_WEBHOOK_URL="복사한 URL"; npm run notify:discord`)

`DISCORD_WEBHOOK_URL`이 없으면 알림 단계는 에러 없이 조용히 건너뜁니다.

## OFAC 이메일 수집 (Phase 1.5)

OFAC은 2025년 1월 RSS를 폐지해서, GovDelivery 이메일 구독으로만 업데이트를 받을 수 있습니다.
전용 Gmail 계정으로 구독을 받고, IMAP + 앱 비밀번호로 그 계정의 안 읽은 메일을 읽어와 처리합니다
(Gmail API OAuth 대신 IMAP을 쓰는 이유: 개인/서비스 전용 단일 메일함이라 OAuth 앱 심사가 불필요하고,
앱 비밀번호는 refresh token처럼 주기적으로 만료되지 않아 무인 자동화에 더 적합합니다).

### 준비

1. OFAC 업데이트 전용 Gmail 계정 생성
2. 그 계정으로 구독 신청: https://service.govdelivery.com/service/subscribe.html?code=USTREAS_61
3. 그 계정에서 2단계 인증 활성화 → https://myaccount.google.com/apppasswords 에서 앱 비밀번호 발급
4. GitHub 저장소 **Settings → Secrets and variables → Actions**에 등록:
   - `GMAIL_ADDRESS`: 위 Gmail 주소
   - `GMAIL_APP_PASSWORD`: 발급받은 16자리 앱 비밀번호

### 동작 방식

- `INBOX`에서 **안 읽은 메일**만 검색해 제목(`subject`)을 기사 제목으로, 본문에서 찾은 첫 `treasury.gov`(또는 GovDelivery 게시글) 링크를 기사 링크로 사용
- 구독/수신거부 관리 링크만 있고 실제 콘텐츠 링크가 없는 메일(가입 환영 메일 등)은 기사로 저장하지 않음
- 처리한 메일은 다음 실행에서 다시 훑지 않도록 읽음 처리
- `GMAIL_ADDRESS`/`GMAIL_APP_PASSWORD`가 없으면 이 단계는 에러 없이 조용히 건너뜀

### 로컬 테스트

```bash
GMAIL_ADDRESS="계정 주소" GMAIL_APP_PASSWORD="앱 비밀번호" npm run collect:ofac
```

## Gemini API 설정 (Phase 2 공통)

번역(`translate.js`)과 일일 트렌드 요약(`daily-digest.js`) 둘 다 Gemini API를 사용합니다.

1. https://aistudio.google.com/apikey 에서 API 키 발급 (신용카드 등록 불필요, 무료 티어)
2. GitHub 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `GEMINI_API_KEY`, Value: 발급받은 키
3. 필요 시 모델 변경: 워크플로우 env에 `GEMINI_MODEL` 추가 (기본값 `gemini-2.5-flash`)

`GEMINI_API_KEY`가 없으면 두 단계 모두 에러 없이 조용히 건너뜁니다.

## 번역 (기사 단위)

이번 실행에서 새로 수집된 기사(`tmp/latest-batch.json`) 중 **영문 기사만** Gemini API로 보내
제목+미리보기 텍스트를 한국어로 **직역**합니다 (요약/의역 없이 원문 의미 그대로). 이미 한국어인
기사는 번역을 생략합니다. 결과는 `translation: { titleKo, snippetKo }` 필드로
`tmp/latest-batch.json`과 `data/processed/{날짜}.json`에 반영되고, Discord embed 본문에도 표시됩니다.

### 로컬 테스트

```bash
GEMINI_API_KEY="발급받은 키" npm run translate
```
(`tmp/latest-batch.json`이 있어야 동작합니다 — 먼저 `npm run collect` 등을 실행해 생성)

## 일일 트렌드 요약 (하루 전체 기사 기준)

기사 단위 번역과 별개로, **그날 수집된 전체 기사**(`data/processed/{오늘날짜}.json`)를 모아
Gemini에게 하루 동향(자주 등장하는 기관/사건/키워드 등)을 3~6개 불릿포인트로 요약받아
Discord에 **별도 메시지**(`📊 오늘의 AML 뉴스 동향`)로 전송합니다.

- 4시간 주기 cron 중 **KST 21:00(UTC 12:00) 실행에서만** 동작하도록 스크립트 내부에서 시간을 확인합니다
  (그날의 마지막 수집이 끝난 뒤 전체 데이터를 기준으로 요약하기 위함).
- 그 외 시간대 실행에서는 조용히 건너뜁니다.
- `GEMINI_API_KEY`, `DISCORD_WEBHOOK_URL` 둘 다 필요합니다 (Discord 설정은 위 "Discord 알림" 절 참고).

### 로컬/수동 테스트 (시간 무시하고 강제 실행)

```bash
DIGEST_FORCE=1 GEMINI_API_KEY="발급받은 키" DISCORD_WEBHOOK_URL="웹훅 URL" npm run digest
```

## 배포 체크리스트 (Phase 1 마무리)

1. 이 폴더(`aml-news-collector/`)를 별도 GitHub 저장소 루트로 push
2. 저장소 **Settings → Actions → General → Workflow permissions**에서
   "Read and write permissions" 선택 (워크플로우가 결과를 커밋하려면 필요)
3. **Actions** 탭 → `Collect AML News` → `Run workflow`로 수동 실행해 정상 동작 확인
4. 며칠 관찰 후 물량에 따라 소스 추가 또는 키워드(`scripts/keywords.js`) 조정

## 알려진 제약사항

- **OFAC**: 2025년 1월 RSS 폐지 → 현재 목록에서 제외 (Phase 1.5에서 Gmail API 연동 검토)
- **FATF**: 공식 RSS 없음 → Google News 키워드검색으로 대체
- **매일경제 증권 RSS**: 증권 전용 피드 코드를 확인하지 못해 경제·금융 통합 피드(`https://www.mk.co.kr/rss/30100041/`)로 임시 대체. `scripts/sources.js`의 주석 참고
