# 역할 분리 (v2.0.2 기준)

| | **A — 측정 · 박민서** | **B — 분석·발표 · 이규태** | **C — 통합 · 황찬혁** |
|---|---|---|---|
| **한 줄 역할** | 웹캠에서 눈 신호를 뽑아 사건으로 넘긴다 | 공개 데이터로 AI 분석을 하고, 보고서·포스터·발표를 만든다 | 뷰어·점수·서명·봉인을 만들고 셋을 하나로 합친다 |
| **소유 파일** | `web/modules/eyeTracker.js`, `movementDetector.js`, `web/dev/measurement.html`·`.js`, `docs/A_measurement.md` | `analysis/` 전체, `docs/B_analysis.md`, `web/models/reading-model.json`(합의 후), `demo/demo-script.md`, 슬라이드·시연 영상 | `web/index.html`·`app.js`·`styles.css`, `pdfManager.js`, `pageScoring.js`, `sessionStore.js`, `signature.js`, `sealExport.js`, `logExport.js`, `contracts.js`·`config.js`, `tools/`, README, `docs/C_integration.md`·`interface.md`·`dependencies.md`·`decisions.md` |
| **핵심 책임** | MediaPipe·카메라 초기화, 홍채 상대 x·EAR 계산, 유효/무효 판정, 머리 움직임 영향 점검, 줄바꿈 후보 사건 검출, 임계값(directionSign 등) 측정으로 결정 | WebQAmGaze·OneStop 로딩, 특징 정의·사전, 로지스틱 회귀 + 참가자 분리 평가, metrics.json, 앱 로그 loader, 실시간 적용 가능 여부 판단 | PDF.js 표시·줄 수 계산, 세션·세그먼트·시간 누적, 점수 정책(유일한 판정 지점), 동의·서명, 봉인 1단계 발급, 로그 내보내기, A 모듈 mock, 로컬 서버, 통합 ZIP |
| **계약상 출력** | `EyeSample`(onSample), `MovementEvent[]`(push 반환), diagnostics | `samples.csv`·`events.csv` loader, `feature_dictionary.csv`, `metrics.json`, 선택 모델 JSON | `PageEvaluation`, `canSign()`, 봉인된 PDF + `session-<sealId>.json`, 공통 config·URL 해석 |
| **하지 않는 것** | PDF 열기·줄 수 세기, 점수·서명 결정, 제품 DOM 직접 수정 | 앱 판정 로직 교체, 화면 시선 좌표와 홍채 x를 같다고 가정 | 다른 사람 파일 통째로 재작성, 측정 실패를 시험값으로 덮기 |
| **제출물 기여** | 보고서: 측정 방법·Go/No-Go 결과 / 포스터: 파형 그림 / 데모: 시연 환경·발표자 | 보고서 **주 담당**(11/12) / 포스터 **주 담당**(11/15) / 데모: 대본·슬라이드·영상 | 보고서: 시스템 구조·점수 정책·캡처 / 포스터: 통합 화면·봉인 PDF 캡처 / 데모: 통합본·로컬 서버·백업 영상 |
| **첫 산출물** | 카메라 켜서 홍채 x·EAR 그래프 + samples.csv | WebQAmGaze 한 건 열어 nr/is 구분 그래프 | localhost에서 PDF 열리는 뼈대 + serve_local.py |
| **공통 변경 창구** | 제안 작성 | 제안 작성 | 제안 취합·결정 기록·통합본 버전 관리 |

## 단계별 목표일

| 단계 | 목표 | 핵심 | 제출물 |
|---|---|---|---|
| 0 | 11/2 | 기본 실행·공통 파일 | |
| 1 | 11/4 | 실제 측정·데이터 한 건·PDF 한 장 | |
| 2 | 11/5 | Go/No-Go (줄바꿈 스윕이 보이는가) | |
| 3 | 11/8 | 검출기·첫 모델 | |
| 4 | 11/10 | 전체 흐름 연결 | 보고서 초안 → **11/12 제출** |
| 5 | 11/13 | 봉인 1단계·기준 고정 | 포스터 → **11/15 제출** |
| 6 | 11/17 | 리허설·시연 영상·슬라이드 | **11/18 데모** |
