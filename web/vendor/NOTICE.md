# 외부 구성요소 고지 (NOTICE)

눈도장은 아래 외부 구성요소를 쓴다. 모두 **허용적(permissive) 라이선스**이고, 우리 코드에
공개 의무를 지우지 않는다. 전염성(copyleft) 라이선스 구성요소는 쓰지 않는다 — 아래 "쓰지 않는 것" 참고.

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

## 번들 안에 고지가 남아 있는지 (2026-11-17 확인, C)

| 파일 | 고지 |
|---|---|
| `pdfjs/pdf.mjs` | 있음 — `Copyright 2024 Mozilla Foundation`, Apache-2.0 |
| `pdf-lib/pdf-lib.esm.min.js` | tslib의 Apache-2.0 고지만 있음. pdf-lib 자신의 MIT 고지는 없음 |
| `mediapipe/vision_bundle.mjs` | **없음** — 축약 과정에서 전부 지워졌다 (`apache`·`copyright` 0건) |

Apache-2.0은 재배포할 때 라이선스 사본을 함께 주라고 요구한다. MediaPipe 번들에는 그 고지가 아예 없으므로,
이 표와 `setup_assets.py`가 받아 두는 라이선스 원문이 그 자리를 대신한다.

## 라이선스 원문

`python3 tools/setup_assets.py`를 돌리면 아래에 원문이 함께 받아진다 (저장소에는 올라가지 않는다).

```
web/vendor/mediapipe/LICENSE     Apache-2.0
web/vendor/pdfjs/LICENSE         Apache-2.0
web/vendor/pdf-lib/LICENSE       MIT
web/vendor/fonts/LICENSE         SIL OFL 1.1
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

## 우리 프로젝트의 라이선스 — 아직 없다

이 저장소에 `LICENSE` 파일이 없다. 라이선스가 없으면 기본값은 "저작권 보유, 아무도 못 씀"이다.
A가 자기 파일에 GPL-3.0-or-later를 적은 것을 보면 팀 안에서 공유된 적이 없다. **정할 문제다.**
