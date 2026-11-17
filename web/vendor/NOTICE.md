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

**WebEyeTrack (GPL-3.0)은 제품에 넣지 않는다.** 2026-11-17 팀 결정.

GPL-3.0은 전염성이라, 묶어서 배포하면 눈도장 전체를 GPL-3.0으로 공개해야 한다.
A(민서)의 측정 시제품(PR #14)이 WebEyeTrack을 쓰므로, 그 시제품은 이 저장소 밖에서
연구·비교용으로만 둔다. 시제품의 **방법**을 읽고 우리가 다시 구현하는 것은 제한받지 않으며,
실제로 그렇게 반영한 항목은 `docs/decisions.md`와 해당 모듈 주석에 출처를 적는다.
그 과정에서 GPL 코드를 그대로 옮겨 적지 않는다.
