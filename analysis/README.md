# analysis — B(이규태)

앱 실행과 분리된 Python 분석. 브라우저가 이 코드를 호출하지 않는다.

## 환경
```
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```
Colab에서 해도 된다. 실제 사용한 버전은 `requirements.txt`와 `../docs/dependencies.md`에 기록.

## 폴더
- `notebooks/` 탐색용 노트북
- `src/` 재사용 코드 (`load_app_logs.py`: 앱 로그 loader)
- `data/raw/` 다운로드 원본 (git에 올리지 않음) · `data/processed/` 정리본
- `results/` `feature_dictionary.csv`, `metrics.json`, `transfer_review.md`, `figures/`

## 데이터
- WebQAmGaze: https://github.com/tfnribeiro/WebQAmGaze — 사용 커밋과 파일 목록을 `data/raw/SOURCES.md`에 기록
- OneStop: https://lacclab.github.io/OneStop-Eye-Movements/ — 실제 받을 수 있는 파일을 먼저 확인

## 순서
1. 파일 한 건 열어 키·타입·과제(nr/is) 확인 → 그래프 한 장
2. 소수 참가자 특징 표 (`feature_dictionary.csv` 정의와 함께)
3. 참가자 분리 로지스틱 회귀 + 기준 모델 비교 → `metrics.json`
4. 앱 로그(samples.csv) 불러와 특징 분포 비교 → `transfer_review.md`
