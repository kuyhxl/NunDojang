# demo

- `reading-demo.pdf` — 시연용 PDF (C가 제작). 텍스트 선택 가능, 단일 열, 3쪽, 쪽당 10~12줄, 표·그림 없음, 머리말·꼬리말 최소.
- `reading-demo-ground-truth.json` — 사람이 센 쪽별 본문 줄 수. 자동 계산 결과를 복사하지 않는다.
- `demo-script.md` — 3분 시연 대본 (B). 공통 스크립트 26절 표를 바탕으로.
- `signature-sample.png` — 발표자 서명 이미지 (업로드 기능 시험용).

ground-truth 형식:
```json
{ "file": "reading-demo.pdf", "countedBy": "황찬혁", "countedAt": "2026-11-0X",
  "pages": [ { "pageId": 1, "lineCount": 11 }, { "pageId": 2, "lineCount": 12 }, { "pageId": 3, "lineCount": 10 } ] }
```
