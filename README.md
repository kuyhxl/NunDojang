# 눈도장 (NunDojang / ReadSeal)

웹캠으로 측정한 눈 움직임으로 PDF를 실제로 읽었는지 판별하고, 모든 페이지의 읽기 기준을 충족해야 동의·서명을 열어 주며, 그 기록과 서명을 봉인(Seal)으로 PDF에 남기는 웹사이트.

- 과목: 디지털 헬스케어 인공지능 분석 실무 · 팀명: 내눈을바라봐
- 공통 기준 문서: `docs/common_script_v2.0.2.md` (계약 `gazegate-contract/1.1.0`)
- 역할: `docs/roles.md` · Git 규칙: `docs/GIT_RULES.md`
- 제출: 실무 보고서 11/12 · 포스터 11/15 · 교수님 데모 11/18 (localhost 시연, 배포 없음)

## 팀

| 역할 | 이름 | 담당 |
|---|---|---|
| A | 박민서 | 웹캠 측정 · 줄바꿈 후보 사건 검출 (`eyeTracker.js`, `movementDetector.js`) |
| B | 이규태 | 공개 데이터 분석 · AI 모델 평가 · 보고서/포스터/발표 (`analysis/`) |
| C | 황찬혁 | 뷰어 · 시선 좌표 추정 · 점수 · 서명 · 봉인 · 통합 · 로컬 서버 (`web/` 나머지, `tools/`) |

## 실행 (로컬)

처음이면 `docs/SETUP.md`를 따라 **uv**를 설치하세요 (한 줄, 한 번).

```
uv run tools/setup_assets.py   # 처음 한 번: MediaPipe·TensorFlow.js·BlazeGaze·PDF.js·pdf-lib·Tesseract·글꼴 다운로드
uv run nundojang               # 서버 실행 → http://localhost:8000/
```

2026-11-21 전에 자산을 받아 둔 사람은 `setup_assets.py`를 한 번 더 돌려야 합니다 (TensorFlow.js와 BlazeGaze 가중치가 추가됨. 있는 파일은 건너뜁니다).

`index.html`을 더블클릭해서 여는 `file://` 실행은 지원하지 않습니다. 서버는 FastAPI지만 **PDF도 영상도 받지 않습니다** — 측정·점수·서명·봉인은 전부 브라우저에서 돌아가고, `/api/*`는 봉인 2단계·배포를 위한 확장 자리입니다.

### 화면 주소

| 주소 | 무엇 |
|---|---|
| `http://localhost:8000/` | 앱 본체. PDF 열기 → 카메라·시선 보정 → 읽기 → 서명 → 봉인 |
| `/dev/integration.html` | 통합 점검. **카메라 없이** 인공 데이터(`fixtures.json`)로 점수 함수와 세션 규칙이 기대대로 나오는지 표로 보여 준다. 전부 OK여야 한다 |
| `/dev/measurement.html` | A의 측정 점검 화면 (상하 위치 구분 시험) |
| `/dev/reflow-check.html` | PDF 재배치 결과 점검 |
| `/api/docs` | API 문서. 지금은 health와 501 자리뿐 (`uv run nundojang`으로 띄웠을 때만) |

### 시선 기록을 남기며 실행

```
python3 tools/serve_local.py   # 표준 라이브러리만 쓰는 서버. uv 없이도 된다
```

`http://localhost:8000/?gazelog=1` 로 열면 시선 수치가 `logs/gaze/`에 CSV로 쌓입니다 (git에 올라가지 않음). **이 기록은 `serve_local.py`에서만 됩니다** — `uv run nundojang`에는 받는 자리가 없습니다. 그 밖의 앱 동작은 두 서버가 같습니다.

### 주소 옵션 (개발용 시험)

기본값은 팀이 합의한 동작이고, 아래는 주소 뒤에 붙여 켜는 시험판입니다. 합의 전이라 점수 정책을 바꾸는 것은 기본으로 켜지 않습니다.

| 옵션 | 동작 |
|---|---|
| `?gazelog=1` | 시선 수치를 `logs/gaze/`에 기록 (`serve_local.py` 전용) |
| `?score=lines` | 줄 단위 진행 점수. 쪽 점수 = 읽은 줄 ÷ 전체 줄, 줄마다 읽음 표식 |
| `?focus=1` | 측정하는 동안 PDF를 화면 가운데로 띄우는 읽기 모드 |
| `?reflow=20` · `?reflow=24` | 큰 글자 재배치 (기본 13px) |
| `?ylock=1` | 물방울 세로를 지금 줄에 고정하고 가로만 시선을 따라감 |
| `?xwindow=1` | 줄바꿈 착지권을 그 쪽의 관측 범위로 잡음 |
| `?validtime=1` | 시간 조건을 유효 측정 시간으로 셈 |
| `?pace=0` | 읽기 속도·가로 폭 경고 끄기 (기본 켜짐) |
| `?ocr=0` · `?ocrlang=kor` | 글자 인식 끄기 · 인식 언어 바꾸기 |

### 시험

Node만 있으면 됩니다 (설치할 패키지 없음).

```
for f in tests/*.test.mjs; do node "$f" || break; done
```

`blazeGaze.test.mjs`는 `setup_assets.py`로 받은 자산이 없으면 건너뜁니다.

### B 분석 환경

`uv sync --group analysis` → `uv run jupyter lab`. 앱 실행과 분리되어 있고, 브라우저는 이 코드를 호출하지 않습니다.

## 폴더

```
web/        사이트 본체 (게시 대상은 이 폴더뿐)
  modules/
    공통      contracts · config
    측정(A)   eyeTracker · movementDetector
    PDF       pdfManager · reflow(13px 재배치) · ocr(사진·스캔 PDF)
    시선(C)   gazeTracker · webEyeTrackMath · blazeGaze · gazeModel · gazeMath
              gazeCalibration · calibrationOverlay · eyeGlass(물방울) · gazeLog
    읽기 판정 pageScoring · gazeSweep · lineProgress · xAnchor · xObserve · pace
    마무리    sessionStore · signature · sealExport · logExport
  dev/      integration(C) · measurement(A) · reflow-check · fixtures.json
  vendor/   고정 버전 라이브러리 (setup_assets.py로 채움). 라이선스 고지는 NOTICE.md
  models/   face_landmarker.task · blazegaze/ (setup_assets.py로 채움) · reading-model.json(B, 선택 — 아직 없음)
tests/      node로 돌리는 단위 시험 (*.test.mjs)
analysis/   B의 Python 분석 (앱 실행과 분리)
docs/       공통 스크립트 · 인터페이스 · 의존성 · 결정 기록 · 역할별 문서 · 조사 기록
server/     FastAPI 앱 (정적 서빙 + /api 확장 자리)
tools/      setup_assets.py · serve_local.py(시선 기록·비상용)
pyproject.toml · uv.lock  Python 환경 (uv)
demo/       시연 PDF 원본 4개 · 13px/ 재배치본과 줄 수 정답
logs/       시선 기록 (?gazelog=1, git에 올리지 않음)
```

## 현재 상태 (2026-11-21)

돌아가는 것:

- [x] PDF 열기와 13px 한 단 재배치(기본). 사진·스캔 PDF는 글자 인식(Tesseract)으로 연다
- [x] 실제 웹캠 측정과 줄바꿈 후보 검출 (A, `return-sweep/0.1.0-pilot2`) — 화면 배지 REAL
- [x] 시선 보정과 시선 좌표 추정 (C, `gaze-tracker/2.0.0`) — 물방울, 줄 읽음 표식, 속도·폭 경고에 쓴다
- [x] 쪽 점수 `count-over-sweeps/0.2.0` = 줄바꿈 후보 ÷ (줄 수 − 1). 80점 이상이 통과, 모든 쪽이 통과해야 서명이 열린다
- [x] 서명(그리기·이미지) → 봉인 PDF 발급 (`seal/0.1.0`, 봉인 1단계)
- [x] 기록 내보내기 (samples·events CSV, session JSON)
- [x] 공개 데이터 분석 (B): WebQAmGaze 일반 읽기/정보 탐색 분류, OneStop 비교, 웹캠 실측 분석

아직이거나 조심할 것:

- [ ] **시선 추정을 11-21에 WebEyeTrack(BlazeGaze)으로 교체했다.** 실제 카메라로 두 번 재 보니 보정 오차는 옛 엔진과 같은 수준(x 90~97px / y 68~71px)이고 흔들림은 더 크다 — 나아지지 않았다. 그 전의 시선 기록과 그 위에서 고른 문턱(속도·폭 경고, 줄 단위 점수)은 옛 엔진 기준이라 평소처럼 읽은 새 기록으로 다시 골라야 한다 (`docs/comprehension_evidence.md` 20-6절)
- [ ] 봉인 2단계(서버 측 서명·검증) — `/api/seals/verify`는 501
- [ ] 앱은 B의 모델을 실행하지 않는다 (`modelRuntimeEnabled: false`)
- [ ] 프로젝트 자체의 `LICENSE` 파일이 없다 (팀이 정할 일)

모든 숫자(통과 기준, 검출 문턱, 경고 관문)는 **개발용 초기값**이고 일반 사용자로 검증한 값이 아닙니다 (`validationLevel: 'pilot'`). 이 앱이 보는 것은 **눈이 줄을 따라갔는가**이지 내용을 이해했는가가 아닙니다 — 그 한계와 대응은 `docs/comprehension_evidence.md`에 있습니다.

## 라이선스

- 외부 구성요소와 고지: `web/vendor/NOTICE.md`, 버전·출처: `docs/dependencies.md`
- 원칙: GPL 계열은 제품에 넣지 않고 허용적 라이선스(Apache-2.0·MIT·OFL)만 쓴다 (`docs/decisions.md` 2026-11-17)
- **예외로 확인이 필요한 것 — BlazeGaze 가중치.** 저장소 표기는 MIT지만 학습 데이터가 비상업·연구 전용이다. 수업 과제·로컬 실행에는 걸리지 않고, 상업적 이용이나 서비스 배포 전에 저자 확인 또는 가중치 교체가 필요하다 (`NOTICE.md`의 "BlazeGaze 가중치" 절)
- 외부 자산은 저장소에 올리지 않고 `setup_assets.py`가 고정 버전으로 받는다. TensorFlow.js와 BlazeGaze 가중치는 SHA-256까지 확인한다

## 작업 규칙 (요약)

- 자기 소유 파일만 수정. 다른 사람 파일은 패치·제안으로.
- 공통 계약(함수명·키·단위·pageId 1-based)은 바꾸지 않음. 바꿔야 하면 `docs/decisions.md`에 공통 변경 제안 양식으로.
- 브랜치: `a-measurement`, `b-analysis`, `c-integration`. C가 main에 통합.
- 실행하지 않은 코드를 "확인 완료"라고 쓰지 않음.
