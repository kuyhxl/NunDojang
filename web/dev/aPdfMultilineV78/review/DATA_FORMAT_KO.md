# v7.8 독립 시제품 로그 형식

스키마: `nundojang-pdf-horizontal/0.7.8`. 공통 `gazegate-contract/1.1.0` CSV와 다른 형식입니다. 원본 참가자 파일은 PR에 포함하지 않습니다.

## samples.csv
UTF-8 BOM이 있는 CSV입니다. Python은 `encoding='utf-8-sig'`로 읽습니다. 전체 열 순서는 protocol.mjs의 SAMPLE_COLUMNS, 공통 수치 열은 measurement-record.mjs를 참조합니다. 빈 값은 미측정이며0으로 대체하지 않습니다. true/false는 CSV 문자열입니다.

| 열/그룹 | 의미 |
|---|---|
| schemaVersion,source,sessionId,seq,frameId | 스키마·출처·실행·측정행·카메라 프레임 식별 |
| captureTMs,resultTMs,mediaTimeSec,resultAgeMs,processingMs | 독립 실행 origin 기준 추론 입력/결과 시각(ms), 영상 시간(s), 지연/처리 시간(ms) |
| phase,stageIndex,targetId,layoutCondition,startMode | 준비·기준·점검·읽기 단계와 표시 조건 |
| targetXCssPx,targetYCssPx,targetOnsetMs,analysisStartMs,analysisEndMs,settled | 지시한 점 위치(CSS px)·시간 구간. 실제 시선의 정답이 아님 |
| faceDetected,eyeState,trackingValid,invalidReason,outsideViewport | 얼굴·눈 상태·수치 사용 가능 여부·무효 사유·화면 밖 추정 |
| networkNormX/Y,filteredNormX/Y,gazeXCssPx/Y | 모델 원시/필터 결과, 화면 CSS px 위치. 홍채 상대좌표가 아님 |
| headX/Y/Z,faceOriginX/Y/Z | upstream 모델 보조 입력. 독립 검증된 각도·거리로 간주하지 않음 |
| adaptCalls,featureFitCalls,predictionMethod | 모델 설정 횟수·개인 매핑 횟수·추정 방식 |
| eyeFeatureDimension,eyeFeaturesF32Base64 | 파생 눈 영상 특징512차원, float32 little-endian base64. 공개 저장소 업로드 대상이 아님 |
| baseline* | 같은 프레임의 비교 모델 결과. 기본 제품 입력이 아님 |
| leftEAR,rightEAR,meanEAR | upstream 눈 뜸 지표. 해부학적 좌우·식은 기존 모듈과 대조 후 사용 |
| trialId,pageId,captureState | 읽기 회차·원본 페이지·실행 상태 |
| decodedContentId,decodedSlot,segment,smoothedXCssPx,detectorState | 고정 경계 검출기의 내용ID·물리적 좌우·구간·평활X·상태 |
| personal*,probe*,briefEnd*,checkpoint*,checkpointProbe* | 최초120ms·최초60ms·끝 체류 비교·중간120ms·중간60ms의 상태 및 조건 충족 영역 개수 |

`*TrialSweepCount`는 raw 가로 이동의 총개수와 다릅니다. 해당 비교기의 회차 내 조건을 충족한 영역 수입니다. raw 이동 횟수는 diagnostics.trialResults의 각 *RegionEvidence.trialSweepCounts 또는 events에서 확인합니다.

## events.csv
열: schemaVersion,sessionId,event,tMs,phase,stageIndex,targetId,detail. detail은 JSON 또는 문자열이며 원시 쉼표로 분리하지 말고 CSV parser를 사용합니다. events.tMs는 사건을 기록한 실행 시각이고, 검출 사건 detail의 captureTMs/startMs/endMs가 실제 측정 입력 시각을 나타냅니다.

주요 prefix는 personal_,probe_,brief_end_,checkpoint_,checkpoint_probe_입니다. sweep_observed/repeat_sweep_observed는 영역 내 가로 통과 후보이고, return_sweep_candidate와 같은 사건이 아닙니다. detail에는 contentId,slot,startMs,endMs,durationMs,validCoverage,rawSweepOrdinal,requiredSweeps,creditedSweeps,criterionMet 등이 기록됩니다.

## diagnostics.json
- plan: 본문·원본 페이지·contentId·표시 글 폭·규칙·회차 순서.
- personalAnchors/checkpointFits: 가로 기준점·품질·경계 및 최초 기준 대체 여부. 읽기 결과로 경계를 학습하지 않음.
- trialResults: 회차별 raw 후보 수, 문서 누적 조건과 각 시점 pageObservation.
- applicationObservation: 중간120ms 기준의 페이지별 조건 충족 영역 집계.
- signatureDecision=false: 이 화면은 실제 서명 판단을 사용하지 않음.
- frozen/finalAudit: 최초 모델 설정 이후 유지 여부. codeStatus의 미검증 문구는 생성 시점의 표기이고, 실측 확인 여부는 review/RESULTS_KO.md의 실제 자료와 구분함.

문서 누적은 조건에 필요한 횟수까지만 집계됩니다. 1쪽 반복이2쪽을 채우지 않지만 같은 영역의 일부 줄 반복은 구별하지 못합니다. 조건 충족 영역2/2를 실제 읽은 줄100%로 표현하지 않습니다.
