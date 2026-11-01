# C — 통합 (황찬혁)

## 지금 상태 (2026-11-01 뼈대)
- 공통 계약·설정·점수 함수·세션 저장소·로그 내보내기·서명 패드·로컬 서버·자산 스크립트 작성
- `eyeTracker.js`·`movementDetector.js`는 mock. 화면 상단 배지가 MOCK
- `pdfManager.js`: PDF.js 로드·표시·줄 수 1차 추정까지. 자산 다운로드 후 실제 확인 필요
- `sealExport.js`: sealId·payload 생성까지. pdf-lib 스탬프 삽입은 단계 5

## 다음 할 일
1. `python3 tools/setup_assets.py` → 자산 확인, `docs/dependencies.md` 확인 상태 갱신
2. `python3 tools/serve_local.py` → `dev/integration.html` 전부 OK인지
3. 데모 PDF 초안 만들어 `index.html`에서 열기, 줄 수를 손으로 세서 `demo/reading-demo-ground-truth.json` 작성
4. `pdfManager.estimateLineCount`를 정답과 대조해 보정
5. A의 실제 모듈이 오면 교체 → MOCK 배지가 REAL로 바뀌는지
6. 단계 5: `issueSeal` pdf-lib 구현 (스탬프 페이지 추가·메타데이터·한글 폰트)

## 통합본 버전 기록

| 버전 | 날짜 | 포함된 A/B 산출물 | 비고 |
|---|---|---|---|
| 0.1.0-skeleton | 2026-11-01 | 없음 (mock) | 뼈대 |
