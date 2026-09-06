# AML News Collector

AML(자금세탁방지) 관련 뉴스를 RSS로 자동 수집하는 파이프라인 (Phase 1).

## 구조

```
aml-news-collector/
├── .github/workflows/collect.yml   # 4시간 주기 자동 수집 + Discord 알림 워크플로우
├── scripts/
│   ├── sources.js                  # RSS 소스 13개 정의
│   ├── keywords.js                 # AML 키워드셋 + 매칭 함수
│   ├── collect.js                  # 수집 → 필터링 → 중복제거 → 저장
│   └── notify-discord.js           # 이번 실행에서 새로 수집된 기사를 Discord 웹훅으로 전송
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
