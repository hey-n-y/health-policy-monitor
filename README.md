# 보건의료 제도 모니터 (공개 웹페이지 버전)

- **매일 오전 9시(한국시간)** GitHub이 자동으로 뉴스를 수집해 `data/feed.json`에 저장합니다.
- 페이지는 GitHub Pages 주소로 **누구나 로그인 없이** 볼 수 있습니다.
- 페이지의 **새로 수집** 버튼을 누르면 GitHub의 수집 작업 화면이 열립니다. 저장소 관리자가 *Run workflow*를 누르면 바로 수집되고, 2~4분 뒤 페이지에 반영됩니다.
- `ANTHROPIC_API_KEY`를 등록하면 수집할 때마다 Claude가 상단 요약도 새로 씁니다. 키가 없으면 기사 수집, 교차확인, 고시 감시는 그대로 동작하고, 요약만 마지막 것이 유지됩니다.

## 폴더 구성

| 경로 | 내용 |
|---|---|
| `index.html` | 대시보드 화면. 검색 키워드 목록(`const CATS`)도 여기에 있습니다 |
| `data/feed.json` | 수집된 기사 (최신 300건) |
| `data/brief.json` | 상단 핵심 요약 |
| `scripts/collect.mjs` | 수집·요약 스크립트 |
| `.github/workflows/collect.yml` | 매일 09:00 자동 실행 설정 |

## 처음 설정하기 (약 15분)

1. **GitHub 가입**: https://github.com 에서 계정을 만듭니다.
2. **저장소 만들기**: 오른쪽 위 **+ → New repository**를 누릅니다.
   - Repository name: `health-policy-monitor`
   - **Public**을 선택합니다. 무료 계정은 공개 저장소만 Pages를 쓸 수 있습니다.
   - **Create repository**를 누릅니다.
3. **파일 올리기**: 새 저장소 화면에서 **uploading an existing file**을 누릅니다.
   - 이 폴더의 `index.html`, `README.md`, `data` 폴더, `scripts` 폴더를 끌어다 놓습니다.
   - **Commit changes**를 누릅니다.
4. **자동 실행 설정 파일 만들기**: `.`으로 시작하는 폴더는 끌어 놓기로 안 올라갈 수 있어서 직접 만듭니다.
   - **Add file → Create new file**을 누릅니다.
   - 파일 이름 칸에 `.github/workflows/collect.yml`을 그대로 입력합니다. `/`를 치면 폴더가 자동으로 만들어집니다.
   - 이 폴더의 `.github/workflows/collect.yml`을 메모장으로 열어 전체를 복사해 붙여넣습니다.
   - **Commit changes**를 누릅니다.
5. **저장 권한 주기**: **Settings → Actions → General**로 갑니다.
   - 맨 아래 *Workflow permissions*에서 **Read and write permissions**를 선택합니다.
   - **Save**를 누릅니다.
6. **웹페이지 켜기**: **Settings → Pages**로 갑니다.
   - *Source*에서 **Deploy from a branch**를 고릅니다.
   - Branch는 **main**, 폴더는 **/(root)**를 고르고 **Save**를 누릅니다.
   - 1~2분 뒤 `https://<GitHub아이디>.github.io/health-policy-monitor/` 주소가 생깁니다. 이 주소를 공유하면 됩니다.
7. **(선택) Claude 요약 켜기**: **Settings → Secrets and variables → Actions → New repository secret**을 누릅니다.
   - Name에 `ANTHROPIC_API_KEY`, Secret에 Anthropic API 키를 넣고 저장합니다.
   - 키는 https://console.anthropic.com 에서 발급합니다.
   - 사용량만큼 요금이 나갑니다. 하루 1회 요약이면 적은 금액입니다.
8. **첫 수집 시험**: **Actions** 탭 → 왼쪽 **뉴스 수집** → **Run workflow** → 초록 **Run workflow**를 누릅니다.
   - 2~4분 뒤 초록 체크가 뜨면 성공입니다.
   - `data/feed.json`이 갱신되고 페이지에도 반영됩니다.

## 운영 메모

- **실행 시각**: GitHub 예약 실행은 붐비는 시간에 수 분~수십 분 늦게 시작될 수 있습니다. 페이지의 '마지막 수집' 시각으로 확인하세요.
- **예약 중지**: 저장소에 60일 동안 활동이 없으면 GitHub이 예약 실행을 멈출 수 있습니다. 매일 수집 결과가 커밋되므로 보통은 문제없습니다. 멈췄다면 Actions 탭에서 다시 켭니다(Enable).
- **수집 실패 알림**: 실패하면 GitHub이 저장소 주인에게 메일을 보냅니다. Actions 탭의 실행 기록에서 어떤 검색어가 실패했는지 볼 수 있습니다. 모든 검색이 실패하면 기존 데이터는 바뀌지 않습니다.
- **키워드 추가·변경**: `index.html`의 `const CATS = [...]` 한 곳만 고치면 됩니다. 수집 스크립트도 이 목록을 읽어 씁니다.
- **공개 범위**: 이 페이지는 인터넷에 공개됩니다. 내부 메모나 민감한 내용은 넣지 마세요.
- **Claude 아티팩트와 함께 쓸 때**: 아티팩트판(`health-policy-monitor/index.html`)을 고친 뒤 `sync-github.ps1`을 실행합니다. 그러면 이 폴더의 `index.html`이 갱신되니 GitHub에 다시 올리면 됩니다.
