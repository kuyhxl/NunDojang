# 모듈 인터페이스 (계약 `gazegate-contract/1.1.0`)

전체 규칙은 `공통시작스크립트_v2.0.2.md` 10~18절. 여기는 코드에서 바로 참조할 요약이다.

## 데이터 흐름

```
eyeTracker(A) --onSample(EyeSample)--> app.js --push--> movementDetector(A) --MovementEvent[]-->
  sessionStore(C).acceptSample / acceptEvents --> pageScoring(C).evaluatePage --> 화면·canSign
  --> signature(C) --> sealExport(C).issueSeal --> 봉인 PDF + session-<sealId>.json
```

## A → C

- `createEyeTracker({videoElement, wasmBaseUrl, modelAssetUrl, onSample, onError})` → `{start({sessionId, sessionT0}), stop(), destroy(), getDiagnostics()}`
- `EyeSample` 키(항상 전부 포함, 미측정은 null): contractVersion, source, sessionId, seq, tMs, valid, leftIrisX, rightIrisX, leftIrisY, rightIrisY, **leftEar, rightEar**, headMotion, invalidReason
- `createMovementDetector({config: DETECTOR_CONFIG})` → `{push({sample, pageId, segmentId}) → MovementEvent[], reset(), getDiagnostics()}`
- `MovementEvent` 키: contractVersion, sessionId, eventId, pageId, segmentId, tMs, type, amplitudeX, durationMs, detectorVersion
- 검증 함수: `contracts.js`의 `validateSample`, `validateEvent` (문제 목록 반환)

## C 내부

- `createPdfManager({canvasElement, config})` → `{open(file) → {pageCount}, renderPage(pageId) → {pageId, lineCount, supported, unsupportedReason}, close()}`
- `evaluatePage(pageState, config)` → `PageEvaluation` (순수 함수)
- `createSessionStore({documentId, sessionId, pageCount, config})` → registerPage / beginSegment / endSegment / acceptSample / acceptEvents / getPage / getSnapshot / canSign / setConsent / setSignature / setSeal / getLogs
- `issueSeal({pdfFile, snapshot, signaturePng, signatureMethod, signatureImageSha256, appVersion, config})` → `{sealId, issuedAt, sealedPdfBlob, sealPayload}`

## C → B (로그)

- `samples.csv` 열: contractVersion,source,documentId,sessionId,pageId,segmentId,seq,tMs,valid,leftIrisX,rightIrisX,leftIrisY,rightIrisY,leftEar,rightEar,headMotion,invalidReason
- `events.csv` 열: contractVersion,documentId,sessionId,eventId,pageId,segmentId,tMs,type,amplitudeX,durationMs,detectorVersion
- `session.json`: `logExport.js`의 `sessionJson()` 참조. `mode`가 `mock`이면 실제 측정이 아님.

## 좌표·시간 규칙 (요약)

- +X = 반전 안 된 카메라 영상의 오른쪽. `left/right` = 사용자의 해부학적 좌·우 눈.
- 상대 x: 눈 양끝 중 영상 x가 작은 쪽 0, 큰 쪽 1. `directionSign`을 곱하면 화면 오른쪽을 볼수록 커짐.
- EAR = 눈꺼풀 세로 거리 평균 / 눈 가로 거리. 눈별로 전달.
- `tMs` = 프레임을 추론에 넣는 시점의 `performance.now() - sessionT0`. 카메라 재시작해도 0으로 돌리지 않음.
- `seq`, `eventId` 번호는 세션 안에서 이어짐. 새 세션에서만 초기화.

## headMotion

첫 버전은 null 허용. 계산을 추가할 때 식·단위·경계값을 여기에 적는다.
