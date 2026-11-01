# 팀 Git 규칙 (초보자용 · 눈도장)

저장소: https://github.com/kuyhxl/NunDojang
원칙은 하나다: **자기 브랜치에서, 자기 파일만, 작은 단위로 자주.** 합치는 건 C(황찬혁)가 한다.

## 1. 브랜치 — 한 사람 한 브랜치, 새로 만들지 않는다

| 브랜치 | 주인 | 용도 |
|---|---|---|
| `main` | C만 합침 | 항상 실행되는 통합본. **직접 push 금지** |
| `a-measurement` | 박민서 (A) | 측정 작업 전부 |
| `b-analysis` | 이규태 (B) | 분석·발표 자료 전부 |
| `c-integration` | 황찬혁 (C) | 뷰어·점수·봉인·통합 |

기능별 브랜치를 따로 만들지 않는다. 자기 브랜치 하나에서 계속 작업하고 PR을 반복한다.

## 2. 매일의 흐름 (5단계)

GitHub Desktop 사용을 권장한다. 터미널 명령은 괄호 안.

1. **받기** — 작업 시작 전 `main`의 최신 내용을 내 브랜치로 가져온다.
   (GitHub Desktop: Branch → *Update from main* / 터미널: `git checkout a-measurement && git pull origin main`)
2. **작업** — 자기 소유 파일만 고친다 (3절 표).
3. **저장** — 작은 단위로 커밋한다. 하루 최소 1회. (`git add <파일> && git commit -m "[A] 홍채 x 계산 추가"`)
4. **올리기** — `git push` (GitHub Desktop: *Push origin*)
5. **합치기 요청** — 공유할 만한 상태가 되면 GitHub에서 `내 브랜치 → main` **Pull Request**를 연다. C가 확인하고 합친다.

PR은 하루 한 번도 괜찮고, 단계가 끝날 때마다는 반드시 연다. "완벽해지면 올리기"보다 "되는 것부터 올리기".

## 3. 파일 소유 — 자기 것만 고친다

| 담당 | 고쳐도 되는 파일 | 읽기만 |
|---|---|---|
| **A 박민서** | `web/modules/eyeTracker.js`, `web/modules/movementDetector.js`, `web/dev/measurement.html`, `web/dev/measurement.js`, `docs/A_measurement.md` | `web/modules/contracts.js`, `web/modules/config.js`(값만 제안), `docs/interface.md` |
| **B 이규태** | `analysis/` 전체, `docs/B_analysis.md`, `demo/demo-script.md`, `web/models/reading-model.json`(합의 후) | `web/modules/logExport.js`(로그 열 이름), `docs/interface.md` |
| **C 황찬혁** | 위 두 사람 파일을 **제외한 전부** (`web/index.html`·`app.js`·`styles.css`, 나머지 `web/modules/*`, `web/dev/integration.*`·`fixtures.json`, `tools/`, `docs/` 공통 문서, `README.md`, `demo/reading-demo.pdf`·`ground-truth.json`) | — |

- 남의 파일을 고쳐야 할 때: **고치지 말고** PR 설명이나 GitHub Issue에 "어느 파일 어느 줄을 어떻게"를 적는다. 주인이 반영한다.
- `config.js`의 `DETECTOR_CONFIG`·`BLINK_CONFIG` 값은 A가 정하지만 파일 주인은 C다. A는 값을 PR 설명에 적고 C가 넣는다. (값만 바꾸는 작은 변경이라 A가 직접 고치고 PR에 명시해도 된다 — 둘 중 하나로 정하면 그대로 간다.)
- 계약(함수명·키·열 이름·점수식)을 바꾸고 싶으면 `docs/decisions.md`의 공통 변경 제안 양식으로 Issue를 연다.

## 4. 커밋 메시지

`[역할] 한 줄 설명` — 한국어, 무엇을 했는지 한 줄.

```
[A] 홍채 상대 x·EAR 계산 추가
[B] WebQAmGaze 한 건 로딩 노트북
[C] 줄 수 추정 y 임계값 0.5→0.6
[C] 통합본 0.2.0: A 실제 모듈 반영
```

"수정", "업데이트", "asdf" 같은 메시지는 쓰지 않는다. 한 커밋에 서로 다른 일을 섞지 않는다.

## 5. Pull Request

제목은 커밋과 같은 형식. 본문은 템플릿(`.github/PULL_REQUEST_TEMPLATE.md`)이 자동으로 뜨니 빈칸만 채운다. 핵심 세 줄:

- 무엇을 했나
- 실제로 실행해 봤나 (어느 맥북, 어느 화면, 결과)
- 다른 사람이 알아야 할 것 (계약·설정·경로 변경 여부)

C는 PR을 받으면 ① 소유 파일 밖을 건드렸는지, ② `dev/integration.html`이 여전히 OK인지 확인하고 합친다. 합친 뒤 Slack/카톡에 "main 갱신 — 받으세요" 한 줄.

## 6. 올리지 않는 것 (이미 .gitignore에 있음)

- `web/vendor/`, `web/models/face_landmarker.task` — `python3 tools/setup_assets.py`로 각자 받는다
- `analysis/data/raw/`, `analysis/data/processed/` — 다운로드 방법만 `data/raw/SOURCES.md`에 적는다
- 측정 로그(`samples*.csv`, `events*.csv`, `session-*.json`), 녹화 영상, 봉인된 PDF, 서명 이미지 — 개인 자료
- `.DS_Store`

실수로 올라갔으면 삭제 커밋을 하지 말고 C에게 말한다.

## 7. 충돌(conflict)이 나면

**건드리지 말고 C에게 알린다.** 자기 파일만 고쳤다면 충돌은 거의 안 난다. 충돌이 났다는 건 두 사람이 같은 파일을 고쳤다는 뜻이니 3절을 먼저 확인한다.

## 8. 하지 않는 것

- `main`에 직접 push
- `git push --force`
- 남의 브랜치에 커밋
- 이해 안 되는 git 명령을 검색해서 그대로 실행 (먼저 C에게 묻기)
- 실행해 보지 않은 코드를 "확인 완료"라고 PR에 쓰기

## 9. 처음 한 번만 (각자)

1. GitHub Desktop 설치 → `kuyhxl/NunDojang` clone
2. 브랜치를 자기 것으로 전환 (A: `a-measurement`, B: `b-analysis`)
3. 터미널에서 `python3 tools/setup_assets.py` → `python3 tools/serve_local.py` → `http://localhost:8000/` 열리는지 확인
4. 첫 커밋: 자기 `docs/X_*.md`에 이름·날짜 한 줄 적고 push → PR. (git 흐름 연습용)

macOS 한글 파일명 문제를 피하려고 파일·폴더 이름은 영문으로 짓는다.
