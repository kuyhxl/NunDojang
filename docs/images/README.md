# 발표 자료

대본은 [../presentation_script.md](../presentation_script.md). 슬라이드는 그 대본의 구간 번호와 맞춘다.

## 발표 순서 (12장)

| 파일 | 구간 | 초 |
|---|---|---|
| `s01_title` | ① 표지 | 10 |
| `s02_hook` | ② Hook — 안내문 | 40 |
| `s03_hook_answers` | ② Hook — 질문과 답 | (위에 포함) |
| `s04_problem` | ③ 문제 — 미시간대 동의서 연구 | 40 |
| `s05_team` | ④ 팀 역할 | 20 |
| `s06_flow` | ⑤ 어떻게 동작하나 | 30 |
| `s07_linecheck` | ⑥ 줄 판정 기준 | 25 |
| `s08_evidence` | ⑦ 근거 — 238과 232 | 45 |
| `s09_demo` | ⑧ 시연 (화면 전환 신호) | 255 |
| `s10_limits` | ⑨ 한계 세 가지 | 105 |
| `s11_limit_detail` | ⑨-(2) 가장 큰 한계 상세 | (위에 포함) |
| `s12_closing` | ⑩ 마무리 | 15 |

**합계 9분 45초.** 버퍼 15초 — 빠듯하니 한 번은 재 보고 들어간다.

## 보조 자료 (발표 중 띄우지 않음)

| 파일 | 쓸 자리 |
|---|---|
| `s13_calibration` | 시연 전에 보정을 미리 해 두므로, 보정 설명이 필요할 때만 |
| `process_flow` | 부록·발표 노트용 상세 흐름도. 질문이 깊게 들어올 때 |
| `hook_notice` | `s02_hook`에 들어가는 안내문 원본 이미지 |

## 다시 만들기

```
python3 docs/images/make_deck.py     # s01~s05, s08~s12
python3 docs/images/make_slides.py   # s06, s07, s13
python3 docs/images/make_process_flow.py
```

SVG가 원본이다. PNG는 Chrome으로 2배 렌더한 것이다.

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --hide-scrollbars --allow-file-access-from-files --default-background-color=ffffffff \
  --force-device-scale-factor=2 --window-size=1920,1080 \
  --screenshot=s01_title.png "file://$PWD/s01_title.svg"
```

Keynote·PowerPoint는 SVG를 그대로 읽는다. 확대해도 안 깨지는 쪽이 필요하면 SVG를 쓴다.
