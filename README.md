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
| C | 황찬혁 | 뷰어 · 점수 · 서명 · 봉인 · 통합 · 로컬 서버 (`web/` 나머지, `tools/`) |

## 실행 (로컬)

처음이면 `docs/SETUP.md`를 따라 **uv**를 설치하세요 (한 줄, 한 번).

```
uv run tools/setup_assets.py   # 처음 한 번: MediaPipe·PDF.js·pdf-lib·모델 다운로드
uv run nundojang               # 서버 실행 → http://localhost:8000/
```

- A 측정 점검: `http://localhost:8000/dev/measurement.html`
- 통합 점검(fixture): `http://localhost:8000/dev/integration.html`
- API 문서: `http://localhost:8000/api/docs` (지금은 health와 501 자리뿐)
- B 분석 환경: `uv sync --group analysis` → `uv run jupyter lab`
- uv 없이 비상 실행: `python3 tools/serve_local.py` (표준 라이브러리만, 동작 동일)

`index.html`을 더블클릭해서 여는 `file://` 실행은 지원하지 않습니다. 서버는 FastAPI지만 **PDF도 영상도 받지 않습니다** — 측정·점수·서명·봉인은 전부 브라우저에서 돌아가고, `/api/*`는 봉인 2단계·배포를 위한 확장 자리입니다.

## 폴더

```
web/        사이트 본체 (게시 대상은 이 폴더뿐)
  modules/  contracts · config · eyeTracker(A) · movementDetector(A) · pdfManager · pageScoring · sessionStore · signature · sealExport · logExport
  dev/      measurement.html(A) · integration.html(C) · fixtures.json
  vendor/   고정 버전 라이브러리 (setup_assets.py로 채움)
  models/   face_landmarker.task · reading-model.json(선택)
analysis/   B의 Python 분석 (앱 실행과 분리)
docs/       공통 스크립트 · 인터페이스 · 의존성 · 결정 기록 · 역할별 문서
server/     FastAPI 앱 (정적 서빙 + /api 확장 자리)
tools/      serve_local.py(비상용) · setup_assets.py
pyproject.toml · uv.lock  Python 환경 (uv)
demo/       시연 PDF · 수동 줄 수 정답 · 시연 대본
```

## 현재 상태 (2026-11-01, 뼈대)

- [x] 폴더 구조, 공통 계약·설정, FastAPI 로컬 서버(uv), 자산 다운로드 스크립트
- [x] dimension.dev 기반 UI, 리퀴드 글라스 눈 물방울, 빈 상태·검색
- [x] `pageScoring.js` 순수 함수 구현 + fixture 점검 페이지
- [ ] PDF.js 표시·줄 수 계산 (C, 단계 0~1)
- [ ] 실제 카메라 측정 (A, 단계 1) — 지금은 `eyeTracker.js`가 mock
- [ ] 공개 데이터 로딩 (B, 단계 1)
- [ ] 통합 (단계 4, 11/10) → 봉인 1단계 (단계 5, 11/13)

`eyeTracker.js`·`movementDetector.js`는 A가 교체하기 전까지 **mock**이며 화면에 "MOCK"으로 표시됩니다. mock 상태를 실제 측정으로 보고하지 않습니다.

## 작업 규칙 (요약)

- 자기 소유 파일만 수정. 다른 사람 파일은 패치·제안으로.
- 공통 계약(함수명·키·단위·pageId 1-based)은 바꾸지 않음. 바꿔야 하면 `docs/decisions.md`에 공통 변경 제안 양식으로.
- 브랜치: `a-measurement`, `b-analysis`, `c-integration`. C가 main에 통합.
- 실행하지 않은 코드를 "확인 완료"라고 쓰지 않음.
