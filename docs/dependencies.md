# 의존성 (고정 버전)

C가 실제 실행을 확인한 결과를 아래 표에 기록한다. 확인 전에는 "미확인"으로 둔다. 각 GPT가 임의로 버전을 올리지 않는다.

| 항목 | 버전 | 라이선스 | 저장 위치 | 출처 | 확인 상태 |
|---|---|---|---|---|---|
| @mediapipe/tasks-vision | 0.10.32 | Apache-2.0 | `web/vendor/mediapipe/` | jsdelivr npm | 다운로드 확인 (2026-11-01, C). 실제 추론은 A가 카메라 연결 후 확인 |
| Face Landmarker 모델 | float16/1 | Apache-2.0 | `web/models/face_landmarker.task` | storage.googleapis.com/mediapipe-models | 다운로드 확인 (2026-11-01, C). 추론은 A 확인 |
| pdfjs-dist | 4.10.38 | Apache-2.0 | `web/vendor/pdfjs/` | jsdelivr npm | 확인됨 (2026-11-01, C) — PDF 열기·페이지 이동·줄 수 추정 동작 |
| pdf-lib | 1.17.1 | MIT | `web/vendor/pdf-lib/` | jsdelivr npm | 미확인 — 단계 5 |
| Noto Sans CJK KR | main | SIL OFL 1.1 | `web/vendor/fonts/` | notofonts GitHub | 선택. 없으면 영문 스탬프 |
| Python / uv | uv가 관리 (`uv.lock`) | — | 로컬 | astral.sh | `uv run nundojang` 확인됨 (2026-11-01, C). `serve_local.py`는 표준 라이브러리만 사용 |
| FastAPI / uvicorn | `uv.lock` 고정 | — | `server/app.py` | PyPI | 확인됨 (2026-11-01, C) — 정적 서빙·/api/health·501 자리 |
| pandas / numpy / matplotlib / scikit-learn | B가 실행 확인한 버전 기록 | — | `analysis/requirements.txt` | pip | 미확인 |

## 라이선스

전부 허용적(permissive) 라이선스라 우리 코드에 공개 의무를 지우지 않는다. 고지·확인 결과·원문 받는 자리는
`web/vendor/NOTICE.md`. **GPL 계열은 제품에 넣지 않는다** (2026-11-17 팀 결정) — WebEyeTrack(GPL-3.0)을 쓰는
A의 측정 시제품은 이 저장소 밖에 둔다.

`setup_assets.py`가 자산과 함께 라이선스 원문도 받아 자산 옆에 둔다. 원문은 `.gitignore` 대상이라
저장소에는 올라가지 않지만, 앱을 올리거나 건넬 때 함께 나간다.

## 수동 다운로드

`setup_assets.py`가 실패하면 `tools/setup_assets.py` 안의 URL을 브라우저로 열어 받고, 표의 저장 위치에 같은 파일명으로 둔다. PDF.js 본체(`pdf.mjs`)와 worker(`pdf.worker.mjs`)는 반드시 같은 버전이어야 한다.

MediaPipe wasm 폴더의 실제 파일 목록은 버전마다 다를 수 있다. `vision_bundle.mjs`가 요구하는 파일명이 다르면 Chrome 콘솔의 404 메시지를 보고 그 파일을 추가로 받는다.

## 확인 기록

| 날짜 | 누가 | 환경 (macOS·Chrome 버전) | 결과 |
|---|---|---|---|
| 2026-11-01 | 황찬혁 (C) | MacBook Pro M4 Pro, macOS 27.1, Chrome 156.0.8078.80 (arm64) | `setup_assets.py` 성공, `uv run nundojang` 기동, PDF 열기·페이지 이동·줄 수 추정 OK, mock 측정·물방울 동작, `/api/health` 응답. 실제 카메라 추론은 미확인(A 대기) |
