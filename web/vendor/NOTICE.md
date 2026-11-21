# 외부 구성요소 고지 (NOTICE)

눈도장은 아래 외부 구성요소를 쓴다. **코드·글꼴·인식 데이터는 모두 허용적(permissive) 라이선스**이고, 우리 코드에
공개 의무를 지우지 않는다. 전염성(copyleft) 라이선스 구성요소는 쓰지 않는다 — 아래 "쓰지 않는 것" 참고.

**예외가 하나 있다 — 시선 모형의 가중치(BlazeGaze).** 표기는 MIT지만 학습에 쓴 데이터가 **비상업·연구 전용**이다.
수업 과제로 로컬에서 돌리는 지금은 걸리지 않지만, 상업적으로 쓰거나 서비스로 올리기 전에 풀어야 한다.
아래 ["BlazeGaze 가중치"](#blazegaze-가중치--표기는-mit-학습-데이터는-비상업) 절.

마지막으로 전체를 다시 본 날: **2026-11-21** (C).

실제 파일은 `.gitignore`에 걸려 저장소에 올라가지 않는다. 각자 `python3 tools/setup_assets.py`로
원 배포처에서 직접 받는다. 그래서 **지금은 우리가 재배포하지 않는다.** 다만 앱을 어딘가에 올려 서비스하거나
zip으로 건네는 순간 재배포가 되므로, 그때 필요한 고지를 미리 여기에 모아 둔다.

| 구성요소 | 버전 | 라이선스 | 저작권 | 받는 곳 |
|---|---|---|---|---|
| @mediapipe/tasks-vision | 0.10.32 | Apache-2.0 | Google LLC | jsdelivr npm |
| Face Landmarker 모델 | float16/1 | Apache-2.0 | Google LLC | storage.googleapis.com/mediapipe-models |
| pdfjs-dist | 4.10.38 | Apache-2.0 | Mozilla Foundation | jsdelivr npm |
| pdf-lib | 1.17.1 | MIT | Andrew Dillon | jsdelivr npm |
| └ tslib (pdf-lib 번들 안) | — | Apache-2.0 | Microsoft Corporation | pdf-lib 번들에 포함 |
| Noto Sans CJK KR | main | SIL Open Font License 1.1 | Google / Adobe | notofonts GitHub |
| tesseract.js | 5.1.1 | Apache-2.0 | Tesseract.js 기여자 (naptha) | jsdelivr npm |
| tesseract.js-core (lstm) | 5.1.1 | Apache-2.0 | Tesseract.js 기여자 · Tesseract OCR(Google) | jsdelivr npm |
| tessdata kor·eng | 4.0.0 | Apache-2.0 | Tesseract OCR 기여자 (Google) | tessdata.projectnaptha.com |
| @tensorflow/tfjs | 4.22.0 | Apache-2.0 | Google LLC | jsdelivr npm |
| └ seedrandom (tfjs 번들 안) | — | MIT | David Bau | tfjs 번들에 포함 (난수 생성기 alea·xor4096·tychei) |
| WebEyeTrack — 전처리·보정 식 | 커밋 `75fbd2f` | MIT | Eduardo Davalos, Yike Zhang, Amanda Goodwin, Gautam Biswas | **저장소에 들어 있다** — `web/modules/webEyeTrackMath.js`(옮겨 적음), `gazeModel.js`(보정 절차를 따름) |
| WebEyeTrack — BlazeGaze 가중치 | 커밋 `75fbd2f` | **MIT로 표기. 학습 데이터는 비상업** (아래 절) | 같음 | GitHub `RedForestAI/WebEyeTrack` |

서버 쪽 파이썬 패키지(FastAPI·uvicorn 등, `uv.lock`)는 브라우저로 나가지 않고 각자 PyPI에서 받으므로 이 표에 넣지 않는다.

WebEyeTrack의 코드는 내려받는 파일이 아니라 **우리 저장소에 옮겨 적은 파일**로 들어 있다. MIT는 사본에
저작권·허가 고지를 남기라고 요구하므로 `webEyeTrackMath.js` 머리에 원문을 그대로 적어 두었다. 지우지 말 것.

## 번들 안에 고지가 남아 있는지 (2026-11-17 확인, C)

| 파일 | 고지 |
|---|---|
| `pdfjs/pdf.mjs` | 있음 — `Copyright 2024 Mozilla Foundation`, Apache-2.0 |
| `pdf-lib/pdf-lib.esm.min.js` | tslib의 Apache-2.0 고지만 있음. pdf-lib 자신의 MIT 고지는 없음 |
| `mediapipe/vision_bundle.mjs` | **없음** — 축약 과정에서 전부 지워졌다 (`apache`·`copyright` 0건) |
| `tfjs/tf.fesm.min.js` | Google의 Apache-2.0 고지만 있음 (`Copyright 2024 Google LLC`). 안에 묶인 seedrandom의 MIT 고지는 없음 (2026-11-21 확인) |
| `tesseract/tesseract.esm.min.js`·`worker.min.js`·`core/*.wasm.js` | **없음** — `copyright`·`apache`·`@license` 0건 (2026-11-21 확인) |
| `models/blazegaze/model.json`·`.bin` | 없음 — 모형 파일이라 고지를 담을 자리가 없다. 옆에 받아 두는 `LICENSE`가 대신한다 |

Apache-2.0은 재배포할 때 라이선스 사본을 함께 주라고 요구한다. MediaPipe·tesseract 번들에는 그 고지가 아예 없으므로,
이 표와 `setup_assets.py`가 받아 두는 라이선스 원문이 그 자리를 대신한다.
MIT도 사본에 저작권·허가 고지를 남기라고 요구한다. pdf-lib와 seedrandom은 번들에 자기 고지가 없으니
위 표의 저작권 줄이 그 자리를 대신한다.

## 라이선스 원문

`python3 tools/setup_assets.py`를 돌리면 아래에 원문이 함께 받아진다 (저장소에는 올라가지 않는다).

```
web/vendor/mediapipe/LICENSE     Apache-2.0
web/vendor/pdfjs/LICENSE         Apache-2.0
web/vendor/pdf-lib/LICENSE       MIT
web/vendor/fonts/LICENSE         SIL OFL 1.1
web/vendor/tesseract/LICENSE     Apache-2.0
web/vendor/tfjs/LICENSE          Apache-2.0
web/models/blazegaze/LICENSE     MIT (WebEyeTrack)
```

저장소에 직접 들어 있는 고지는 하나다.

```
web/modules/webEyeTrackMath.js   머리말에 WebEyeTrack의 MIT 원문 (옮겨 적은 코드라 파일과 함께 다닌다)
```

## 쓰지 않는 것 — GPL 계열

**GPL 계열 구성요소는 제품에 넣지 않는다.** 2026-11-17 팀 결정.
GPL은 전염성이라, 묶어서 배포하면 눈도장 전체를 같은 조건으로 공개해야 한다.
브라우저에서 도는 코드는 사용자에게 **전송**되므로, 서버에만 두면 피해 가는 길도 없다.

지금 쓰는 구성요소 중 GPL 계열은 **없다.**

### 정정 (2026-11-18)

이 자리에 **"WebEyeTrack (GPL-3.0)은 제품에 넣지 않는다"**고 적혀 있었다. **틀렸다 — WebEyeTrack은 MIT다.**

| 확인한 것 | 결과 |
|---|---|
| 상류 저장소 현재 `main` | MIT |
| A가 고정한 커밋 `75fbd2f`의 `LICENSE` | MIT 원문 |
| A가 보관한 사본 `review/LICENSE-WebEyeTrack-MIT.txt` | 같은 원문 |
| 번들 worker 법적 고지 (`pilot-worker.js.LEGAL.txt`) | Apache-2.0 1078건(전부 TensorFlow.js), GPL 0건 |

`SPDX-License-Identifier: GPL-3.0-or-later`는 A가 직접 쓴 `core/math.mjs`·`core/viewport.mjs`
두 파일에만 붙어 있고, 그것은 **눈도장 자체를 GPL로 본** 표기다. C가 그걸 WebEyeTrack 것으로
잘못 읽었다. 근거와 경위는 `docs/comprehension_evidence.md` 18절.

**따라서 WebEyeTrack은 고지만 함께 주면 쓸 수 있다.** 다만 BlazeGaze **가중치와 학습 데이터**의
조건은 아직 확인하지 않았다 — 코드가 MIT여도 가중치는 별개일 수 있다. 제품에 넣기 전에 본다.

### 2026-11-21 — 넣었다

시선 추정을 WebEyeTrack으로 바꾸면서(`docs/decisions.md`) 코드와 가중치를 실제로 쓰게 됐다.
코드는 MIT라 고지만 남기면 된다. **가중치는 그렇게 간단하지 않았다** — 바로 아래 절.

### 정정 (2026-11-21) — 우리 코드 주석의 "그 구현은 GPL-3.0이라"

A의 시제품(PR #14)에서 **방법만** 가져온 세 곳(`lineProgress.js`·`gazeSweep.js`·`xAnchor.js`)의 주석과
`docs/decisions.md` 열린 제안 1에 "그 구현은 GPL-3.0이라 제품에 넣지 않는다"고 적혀 있었다. 11-18 정정 때 놓친 자리다.

파일별로 다시 봤다. `GPL-3.0-or-later` 표기가 붙은 것은 `core/math.mjs`·`core/viewport.mjs` **둘뿐**이고,
방법을 가져온 `detector.mjs`(HorizontalDetector)·`anchors.mjs`에는 **라이선스 표기가 없다.**
그래서 "GPL이라서"는 근거가 못 된다. 주석을 "코드는 옮기지 않고 방법만 가져와 새로 썼다"로 고쳤다.
코드를 옮기지 않았다는 사실과 그 판단은 그대로다 — 저장소 라이선스가 정해지지 않은 동안은 A의 코드도 조건이 미정이다.

## BlazeGaze 가중치 — 표기는 MIT, 학습 데이터는 비상업

2026-11-21에 상류 저장소(`RedForestAI/WebEyeTrack@75fbd2f`)와 데이터셋 배포처를 직접 읽었다. **법률 판단이 아니라 확인한 사실이다.**

| 확인한 것 | 결과 |
|---|---|
| 저장소 `LICENSE` | MIT. README는 "개인·학술·**상업적** 사용을 허용한다"고 적는다 |
| 가중치에만 붙은 조건 (모형 카드·별도 `LICENSE`) | **없다.** 가중치는 MIT 저장소 안에 파일로만 올라와 있다 |
| 웹용 가중치를 만든 변환 스크립트 `python/scripts/ml_routines/tfjs_convert.py` | 학습 결과 `2025-06-02-16-34-03_mpiifacegaze_maml_full_run`을 읽는다. 웹 가중치 파일이 마지막으로 바뀐 날은 2025-06-03 |
| 파이썬 쪽 기본 가중치 이름 | `blazegaze_mpiifacegaze.keras` |
| **MPIIFaceGaze** 배포처 | **CC BY-NC-SA 4.0**, "비상업적 과학 목적에만 쓸 것" |
| **GazeCapture** `LICENSE.md` | 연구 전용. 상업적 응용에 어떤 형태로도 쓰지 말라고 적고, 그 형태에 **"데이터셋으로 학습한 모형"** 을 명시한다 |
| EyeDiap | 확인하지 않았다 |

읽히는 바:

- 우리가 받는 웹 가중치는 **MPIIFaceGaze로 학습한 것으로 보인다.** 저자가 그렇게 적은 곳은 없고, 변환 스크립트의
  경로·파일 날짜·파이썬 기본값에서 짐작한 것이다. (조사 기록 18-4절의 "GazeCapture 250만 프레임"은 논문의 수치이고,
  배포된 이 파일의 이야기가 아닐 수 있다.)
- 어느 쪽이든 **학습 데이터는 비상업 조건이다.** 논문이 쓴 세 데이터셋 가운데 확인한 둘이 모두 그렇다.
- 데이터의 조건이 학습된 가중치에 따라붙는지는 법적으로 정리되지 않은 문제다. GazeCapture는 따라붙는다고 **명시**하고,
  CC BY-NC-SA는 명시하지 않는다. 저자들은 가중치를 MIT 저장소에 올렸지만 그 점을 따로 밝히지 않았다.

그래서:

- **지금** — 수업 과제이고, 각자 원 배포처에서 받아 로컬에서만 돌린다(배포 제외, `docs/decisions.md` 11-01).
  비상업·연구 범위 안이고 재배포도 아니다. 걸리는 것이 없다.
- **상업적으로 쓰거나 서비스로 올리려면** — 그 전에 둘 중 하나를 해야 한다.
  ① 저자에게 가중치의 조건을 묻는다 (Eduardo Davalos, 저장소 이슈 또는 논문 연락처).
  ② 조건이 분명한 데이터로 다시 학습하거나 다른 모형으로 바꾼다. 가중치만 갈아 끼우면 되고 코드는 그대로다 (`blazeGaze.js`).
- **11-17 결정("허용적 라이선스만 쓴다")과 부딪치는가** — 표기는 MIT라 문면으로는 맞고, 취지로는 걸린다.
  팀이 정할 문제다. `docs/decisions.md` 2026-11-21 확인 항목.

발표·보고서에서 이 모형을 쓴 결과를 내보일 때는 아래를 밝힌다 (CC BY는 출처 표시를, GazeCapture는 인용을 요구한다).

- Davalos et al. *WEBEYETRACK: Scalable Eye-Tracking for the Browser via On-Device Few-Shot Personalization.* arXiv:2508.19544, 2025.
- Zhang, Sugano, Fritz, Bulling. *It's Written All Over Your Face: Full-Face Appearance-Based Gaze Estimation.* CVPR Workshops, 2017. (MPIIFaceGaze)
- Krafka et al. *Eye Tracking for Everyone.* CVPR, 2016. (GazeCapture)

## 우리 프로젝트의 라이선스 — 아직 없다

이 저장소에 `LICENSE` 파일이 없고 `pyproject.toml`에도 라이선스 항목이 없다 (2026-11-21 다시 확인).
라이선스가 없으면 기본값은 "저작권 보유, 아무도 못 씀"이다.
A가 자기 파일에 GPL-3.0-or-later를 적은 것을 보면 팀 안에서 공유된 적이 없다. **정할 문제다.**

정할 때 알아 둘 것 두 가지.

- 우리 코드에 어떤 라이선스를 붙이든 **받아 오는 구성요소의 조건은 그대로 남는다.** 특히 BlazeGaze 가중치를 쓰는 동안은
  "이 앱을 상업적으로 써도 된다"고 말할 수 없다 (위 절).
- `web/modules/webEyeTrackMath.js`는 WebEyeTrack(MIT)을 옮겨 적은 파일이다. 프로젝트 라이선스를 무엇으로 정하든
  이 파일 머리의 MIT 고지는 지우면 안 된다.
