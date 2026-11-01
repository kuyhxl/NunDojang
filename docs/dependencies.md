# 의존성 (고정 버전)

C가 실제 실행을 확인한 결과를 아래 표에 기록한다. 확인 전에는 "미확인"으로 둔다. 각 GPT가 임의로 버전을 올리지 않는다.

| 항목 | 버전 | 저장 위치 | 출처 | 확인 상태 |
|---|---|---|---|---|
| @mediapipe/tasks-vision | 0.10.32 | `web/vendor/mediapipe/` | jsdelivr npm | 미확인 — `setup_assets.py` 실행 후 `dev/measurement.html`에서 확인 |
| Face Landmarker 모델 | float16/1 | `web/models/face_landmarker.task` | storage.googleapis.com/mediapipe-models | 미확인 |
| pdfjs-dist | 4.10.38 | `web/vendor/pdfjs/` | jsdelivr npm | 미확인 — `index.html`에서 PDF 열기 |
| pdf-lib | 1.17.1 | `web/vendor/pdf-lib/` | jsdelivr npm | 미확인 — 단계 5 |
| Noto Sans CJK KR (OFL) | main | `web/vendor/fonts/` | notofonts GitHub | 선택. 없으면 영문 스탬프 |
| Python | 3.x | 로컬 | — | `serve_local.py`는 표준 라이브러리만 사용 |
| pandas / numpy / matplotlib / scikit-learn | B가 실행 확인한 버전 기록 | `analysis/requirements.txt` | pip | 미확인 |

## 수동 다운로드

`setup_assets.py`가 실패하면 `tools/setup_assets.py` 안의 URL을 브라우저로 열어 받고, 표의 저장 위치에 같은 파일명으로 둔다. PDF.js 본체(`pdf.mjs`)와 worker(`pdf.worker.mjs`)는 반드시 같은 버전이어야 한다.

MediaPipe wasm 폴더의 실제 파일 목록은 버전마다 다를 수 있다. `vision_bundle.mjs`가 요구하는 파일명이 다르면 Chrome 콘솔의 404 메시지를 보고 그 파일을 추가로 받는다.

## 확인 기록

| 날짜 | 누가 | 환경 (macOS·Chrome 버전) | 결과 |
|---|---|---|---|
| | | | |
