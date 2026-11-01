# A — 측정 (박민서)

## 첫 목표
카메라 켜기 → 양쪽 눈 상대 x·EAR 그래프 → samples.csv 저장. `web/dev/measurement.html`에서 확인.

## 교체할 파일
- `web/modules/eyeTracker.js` (지금은 mock, `IS_MOCK = true`) → 실제 구현 시 `IS_MOCK = false`
- `web/modules/movementDetector.js` (지금은 mock)

## 기록할 것
- 사용한 MediaPipe 랜드마크 번호와 식 (홍채 중심, 눈 양끝, EAR)
- 실제 videoWidth·videoHeight, 처리 fps
- `directionSign` 확인 결과 (화면 오른쪽을 볼 때 상대 x가 커지는가)
- Go/No-Go (11/5): 자연스럽게 읽을 때 줄바꿈 스윕이 그래프에서 구분되는가 — 녹화 조건(거리·조명·글)과 함께
- DETECTOR_CONFIG 값과 그 근거 (`minAmplitudeX`, `minDurationMs`, `maxDurationMs`, `refractoryMs`)
- BLINK_CONFIG 값과 근거

## 점검 기록

| 날짜 | 조건 | 행동 | 관찰 | 결론 |
|---|---|---|---|---|
| | | | | |
