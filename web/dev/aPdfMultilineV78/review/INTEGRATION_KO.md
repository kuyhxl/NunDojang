# C(찬혁) 연결 검토 메모

검토한 main:3892386d9fb1f1c79716177d93a35502ee2f740f. 이 문서는 연결 제안이며 공통 계약을 변경하지 않습니다. main에서 테스트 화면은 새 경로로 추가하고 제품 동작 연결은 후속 작업으로 분리합니다.

## 소유 범위
현재 docs/GIT_RULES.md의 A 지정 파일은 eyeTracker.js·movementDetector.js·measurement.html/js·docs/A_measurement.md입니다. 새 web/dev/aPdfMultilineV78/ 경로는 기존 지정 목록 밖이므로 기본 C 소유 범위로 검토를 요청합니다. 기존 C 파일, CODEOWNERS, 공통 규칙을 수정하지 않습니다. reference-c/reflow.mjs는 과거에 검증한 C helper의 별도 복사본이고 최신 reflow.js를 덮어쓰지 않습니다. C가 새 경로의 수용·소유·통합 여부를 판단해 주세요.

## 기존 계약과 새 시제품의 차이
| 항목 | 현재 main 공통 계약 | 새 시제품 |
|---|---|---|
| 위치 | 눈 폭으로 정규화한 홍채 상대위치 | 개인 매핑을 거친 화면 CSS pixel gazeXCssPx/gazeYCssPx |
| 시간 | sessionT0 기준 tMs | 독립 실행 origin 기준 captureTMs |
| 사건 | return_sweep_candidate, 주로 오른쪽→왼쪽 복귀 | 영역 내 왼쪽→가운데→오른쪽 통과 sweep_observed/repeat_sweep_observed |
| 식별 | pageId/segmentId | PDF SHA256·원본 페이지·추출문자 범위 contentId, trialId |
| 완료 | 기존 점수·canSign | 진단 pageLedger, 조건 충족 영역 수 |

화면좌표를 leftIrisX/rightIrisX에 넣거나, 가로 통과 사건을 그대로 return_sweep_candidate로 이름만 바꾸지 마세요. 실제 줄의 좌표·고유 줄 번호는 출력하지 않습니다. 추출문자 범위는 정규화된 추출 본문의 codepoint 범위이며 원본PDF의 객체 offset이 아닙니다.

## 연결할 경계
1. 준비: viewport·표시한 글의 실제 x0/x1·원본 페이지와 contentId를 고정하고 개인 모델을 설정합니다.
2. 측정: main.mjs의 Bridge는 worker init/step/accept/adapt/audit 호출을 감쌉니다. 독립 실행과 제품 세션의 sessionId·sessionT0를 명확히 맞춰야 합니다.
3. 수치: measurement-record.mjs의 numericResult가 유효성·지연·눈 상태·화면좌표·EAR를 기록합니다. EAR의 좌우 정의와 식도 기존 모듈과 대조한 뒤 계약으로 옮깁니다.
4. 검출: HorizontalDetector.consume({frameId,tMs,x,valid}), snapshot(). 좌우 물리적 위치의 경계는 anchorsForLayout으로 페이지의 새 contentId에 대응합니다. 경계는 점검 자료만으로 정하고 읽기 결과에 맞춰 다시 정하지 않습니다.
5. 내용 집계: pageLedger(pages,observedIds)는 알려진 내용ID만 페이지에 집계합니다. repeated content의 횟수와 문서 누적·회차 누적을 구분합니다.
6. 제어: 최종 제품에서 pageScoring/sessionStore/canSign을 연결하는 정책은 C가 공통 변경 제안으로 검토합니다. 진단 화면의 signatureDecision=false와 비활성 버튼을 실제 서명 성공으로 바꾸어 기록하지 않습니다.

## 제안하는 후속 인터페이스 — 미구현
별도 ScreenGazeSample(captureTMs,gazeXCssPx,gazeYCssPx,trackingValid,invalidReason,frameId,source,schemaVersion)과 RegionTraversalEvent(contentId,pageId,start/end,duration,validCoverage,criterionMet)를 구분하는 편이 적절합니다. 계약 이름·필드는 팀 합의가 필요합니다. 원래 EyeSample 계약은 유지합니다. 여기에서 제안한 adapter나 제품 UI 호출은 구현하지 않았습니다.

## 확인이 남은 항목
실제 제품13px와 시험16px·긴 줄 조건의 차이, 재배치·줌·페이지 이동 때의 상태 초기화, 중간 점검 빈도 축소, 카메라 중단·재개, 여러 사람 적용을 확인해야 합니다. 현재 parser는 이번2쪽각영역4줄 조건을 요구합니다. 같은 영역의 재읽기, 실제 내용 이해·고유 줄 비율은 판정하지 않습니다. 모델 자산 버전은 main MediaPipe와 다른 별도0.10.18이므로 제품의 자산URL을 그대로 공유하지 않습니다.

B(규태)용 logs는 기존 공통 로그와 별도 스키마입니다. samples의 eyeFeaturesF32Base64는512차원 파생 눈 영상 특징이며 개인정보를 포함할 수 있어 공개PR에 원본을 넣지 않았습니다. 데이터 비교는 별도 비공개 전달 및 열·단위 확인 후 진행합니다.
