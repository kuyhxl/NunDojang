# B — 분석·발표 (이규태)

## 첫 목표
WebQAmGaze 저장소에서 파일 한 건을 열어 nr/is 과제를 구분하고 시선 그래프 한 장. 아직 훈련하지 않는다.

## 작업 위치
- `analysis/` 전체 (앱 실행과 분리, Colab 가능)
- 앱 로그 loader: `analysis/src/load_app_logs.py` (samples.csv·events.csv·session.json). 1.0.0 로그(EAR 열 없음)도 읽히게.

## 기록할 것
- 데이터 출처·커밋·이용 조건
- 실제 열 이름·타입·단위, 과제별 건수
- `results/feature_dictionary.csv`, `results/metrics.json` (schemaVersion `gazegate-analysis/1.0.0`)
- 참가자 분리 평가, 기준 모델(다수 클래스·경과 시간만) 비교
- `results/transfer_review.md`: 실시간 적용 가능 여부와 근거 (기본값: 적용 안 함)

## 발표·제출물 (주 담당)
- 실무 보고서 11/12 — 초안 11/10 저녁
- 포스터 11/15 — 초안 11/13 저녁
- 데모 11/18 — `demo/demo-script.md`, 슬라이드, 시연 영상, 리허설 5회
