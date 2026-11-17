// 이미지 PDF 글자 인식 — 순수 부분 시험. 브라우저 없이 도는 것만 다룬다
// (엔진·쪽 그리기는 DOM이 필요해 여기서 못 본다. 그쪽은 손으로 확인한다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectLines, wordsToLines, pageConfidence, renderScaleFor, OCR } from '../web/modules/ocr.js';
import { linesToParagraphs } from '../web/modules/reflow.js';

/** 그림 픽셀 기준 낱말 하나 */
const W = (text, x0, y0, x1, y1, confidence = 90) => ({ text, confidence, bbox: { x0, y0, x1, y1 } });

// ---- collectLines: Tesseract 판마다 다른 결과 모양을 모두 받는다

test('collectLines: v5 중첩 모양(blocks → paragraphs → lines → words)', () => {
  const data = { blocks: [{ paragraphs: [{ lines: [{ words: [W('가', 0, 0, 10, 10), W('나', 12, 0, 22, 10)] }, { words: [W('다', 0, 20, 10, 30)] }] }] }] };
  const got = collectLines(data);
  assert.equal(got.length, 2);
  assert.deepEqual(got[0].map((w) => w.text), ['가', '나']);
  assert.deepEqual(got[1].map((w) => w.text), ['다']);
});

test('collectLines: 예전 평면 모양(data.lines)', () => {
  const got = collectLines({ lines: [{ words: [W('가', 0, 0, 10, 10)] }] });
  assert.deepEqual(got.map((l) => l.map((w) => w.text)), [['가']]);
});

test('collectLines: 줄 구조가 없으면 세로 위치로 묶는다', () => {
  const data = { words: [W('나', 20, 0, 30, 10), W('가', 0, 1, 10, 11), W('다', 0, 40, 10, 50)] };
  const got = collectLines(data);
  assert.deepEqual(got.map((l) => l.map((w) => w.text)), [['가', '나'], ['다']], '같은 높이는 한 줄로, 왼쪽부터');
});

test('collectLines: 빈 줄과 상자 없는 낱말은 버린다', () => {
  const data = { blocks: [{ paragraphs: [{ lines: [{ words: [] }, { words: [{ text: '가' }] }, { words: [W('나', 0, 0, 10, 10)] }] }] }] };
  assert.deepEqual(collectLines(data).map((l) => l.length), [1]);
});

// ---- wordsToLines: 낱말 상자 → reflow가 받는 줄

test('wordsToLines: 그림 픽셀을 pt로 바꾸고 줄 상자를 잡는다', () => {
  // scale 2 = 1pt가 2px. 글자 높이 24px → 12pt
  const [line] = wordsToLines([[W('눈도장', 100, 76, 200, 100), W('읽기', 220, 76, 300, 100)]], { scale: 2 });
  assert.equal(line.t, '눈도장 읽기');
  assert.equal(line.x0, 50);
  assert.equal(line.x1, 150);
  assert.equal(line.base, 50, '아랫변이 기준선');
  assert.equal(line.size, 12);
  assert.equal(line.firstW, 50, '첫 낱말 폭 (앞 줄에 들어갈 수 있었는지 판단용)');
  assert.equal(line.mono, false);
  assert.equal(line.row, false);
});

test('wordsToLines: 확신도가 낮은 낱말은 버리고, 줄 전체가 버려지면 줄도 없앤다', () => {
  const lines = wordsToLines([
    [W('좋음', 0, 0, 40, 20, 95), W('의심', 50, 0, 90, 20, 10)],
    [W('전부의심', 0, 40, 90, 60, 5)]
  ], { scale: 1, minConfidence: 40 });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].t, '좋음');
  assert.equal(lines[0].x1, 40, '버린 낱말은 줄 폭에도 안 들어간다');
});

test('wordsToLines: 음절로 쪼개져 나온 한글을 다시 붙인다 (간격이 글자 높이의 40%를 넘을 때만 띄어쓴다)', () => {
  // 실측값 (질병관리청 안내문, 글자 높이 40px): 음절 사이 -1~13px, 낱말 사이 21~35px
  const h = 40;
  let x = 0;
  const w = (text, gap) => { x += gap; const a = W(text, x, 0, x + 38 * text.length, h); x += 38 * text.length; return a; };
  const [line] = wordsToLines([[
    w('코', 0), w('로', 4), w('나', -1), w('19', 6),
    w('예', 31), w('방', 12), w('접종', 11),
    w('전', 27)
  ]], { scale: 1 });
  assert.equal(line.t, '코로나19 예방접종 전');
});

test('wordsToLines: 줄 평균 확신도가 낮으면 줄째로 버린다 (장식 그림을 글자로 읽은 줄)', () => {
  const lines = wordsToLines([
    [W('--->', 0, 0, 40, 20, 12), W('ㅋㅋ', 60, 0, 100, 20, 18)],   // 실측 15%
    [W('본문입니다', 0, 40, 120, 60, 86)]
  ], { scale: 1, minConfidence: 0 });
  assert.deepEqual(lines.map((l) => l.t), ['본문입니다']);
});

test('wordsToLines: 글자 크기는 낱말 높이의 가운데값이라 튀는 상자에 끌려가지 않는다', () => {
  const [line] = wordsToLines([[
    W('가', 0, 0, 10, 20), W('나', 12, 0, 22, 20), W('다', 24, 0, 34, 20), W('튐', 36, 0, 46, 80)
  ]], { scale: 1 });
  assert.equal(line.size, 20);
  assert.equal(line.base, 80, '줄 아랫변은 가장 아래 상자 기준 그대로');
});

test('wordsToLines: 읽는 순서로 다시 세운다 (위에서 아래, 같은 높이면 왼쪽부터)', () => {
  const lines = wordsToLines([
    [W('아래', 0, 100, 40, 120)],
    [W('위오른쪽', 200, 0, 240, 20)],
    [W('위왼쪽', 0, 2, 40, 22)]
  ], { scale: 1 });
  assert.deepEqual(lines.map((l) => l.t), ['위왼쪽', '위오른쪽', '아래']);
});

test('wordsToLines: scale이 없으면 바로 막는다 (좌표가 조용히 틀리는 것보다 낫다)', () => {
  assert.throws(() => wordsToLines([[W('가', 0, 0, 10, 10)]], {}), /scale/);
});

// ---- 확신도·배율

test('pageConfidence: 빈 쪽은 0, 아니면 낱말 평균', () => {
  assert.equal(pageConfidence([]), 0);
  assert.equal(pageConfidence([[W('가', 0, 0, 1, 1, 80), W('나', 2, 0, 3, 1, 60)]]), 70);
  assert.equal(pageConfidence([[W('  ', 0, 0, 1, 1, 0), W('가', 2, 0, 3, 1, 90)]]), 90, '빈 글자는 안 센다');
});

test('renderScaleFor: 가로를 목표 픽셀에 맞추되 한계 안에 둔다', () => {
  assert.equal(renderScaleFor(1000), 2, '2000px 목표 ÷ 1000pt');
  assert.equal(renderScaleFor(100), OCR.maxScale, '작은 쪽도 4배까지만');
  assert.equal(renderScaleFor(4000), OCR.minScale, '큰 쪽도 1.5배 아래로는 안 내린다');
  assert.equal(renderScaleFor(0), OCR.minScale);
});

// ---- 재배치로 넘어가는 자리

test('인식한 줄이 reflow의 문단 잇기로 그대로 넘어간다', () => {
  // 폭 600pt 쪽. 첫 줄이 오른쪽 끝까지 차 있고 다음 줄 첫 낱말이 거기 못 들어간다 = 자동 줄바꿈
  const lines = wordsToLines([
    [W('예방접종', 200, 176, 600, 200), W('안내문', 620, 176, 1000, 200)],
    [W('전후', 200, 216, 300, 240), W('주의사항', 320, 216, 600, 240)]
  ], { scale: 2 });
  const paras = linesToParagraphs(lines, 600);
  assert.equal(paras.length, 1, `문단이 나뉘었다: ${JSON.stringify(paras.map((p) => p.text))}`);
  assert.equal(paras[0].text, '예방접종 안내문 전후 주의사항');
  assert.equal(paras[0].kind, 'p');
});

test('빈 인식 결과는 빈 문단 목록이 된다 (부른 쪽에서 막는다)', () => {
  assert.deepEqual(linesToParagraphs(wordsToLines([], { scale: 2 }), 600), []);
});
