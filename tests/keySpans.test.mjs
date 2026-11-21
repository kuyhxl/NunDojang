// 중요 표시 응시 확인 시험 — keySpans.js와 reflow.js의 표시 옮기기.  실행:  node tests/keySpans.test.mjs
// 문턱은 가상의 표시로 고른 잠정값이다 (docs/feedback.md 6절). 여기서는 수식이 의도대로 도는지만 본다.

import assert from 'node:assert/strict';
import { createKeySpanWatch, KEY_SPAN_POLICY } from '../web/modules/keySpans.js';
import { annotationQuads, markItems, resolveMarks, stripMarks, layoutParagraphs, itemsToLines, linesToParagraphs, REFLOW_20 } from '../web/modules/reflow.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const LAYOUT = { fontPx: 20, columnPx: 800, lineHeightPx: 40 };
// 줄 3에 12자(240px)짜리 밑줄: x 300~540. 필요한 시간 = 12 ÷ (1200/60) = 0.6초
const MARKS = [[], [], [], [{ left: 300, width: 240, chars: 12, type: 'Underline' }], []];
const mk = (lineMarks = MARKS) => createKeySpanWatch({ lineMarks, layout: LAYOUT });
/** t0부터 ms 동안 x0→x1로 고르게 움직이며 line 줄을 본다 */
function sweep(W, { t0, ms, x0, x1, line }) {
  const out = [];
  for (let u = 0; u <= ms; u += 33) out.push(...W.push({ tMs: t0 + u, x: x0 + (x1 - x0) * (u / ms), line }));
  return out;
}

test('표시가 없으면 볼 것도 없다 — 처음부터 모두 채워진 것으로 본다', () => {
  const W = mk([[], []]);
  assert.equal(W.total, 0);
  assert.equal(W.allDone, true);
  assert.deepEqual(W.push({ tMs: 0, x: 100, line: 0 }), []);
});

test('필요한 시간 = 글자 수 ÷ 분당 1,200자', () => {
  const sp = mk().spans[0];
  assert.equal(sp.needMs, 600);
  assert.equal(sp.id, '3:0');
  assert.equal(KEY_SPAN_POLICY.maxCharsPerMin, 1200);
});

test('그 줄에서 구간을 천천히 지나가면 인정된다', () => {
  const W = mk();
  // 줄 3을 4초에 읽는다 (800px ÷ 4초 = 200px/s). 구간 240px + 여유 80px를 1.6초에 지난다
  const newly = sweep(W, { t0: 0, ms: 4000, x0: 0, x1: 800, line: 3 });
  assert.deepEqual(newly, ['3:0']);
  assert.equal(W.done, 1);
  assert.equal(W.allDone, true);
  assert.ok(Number.isFinite(W.spans[0].doneAtMs));
});

test('빠르게 지나가면 인정되지 않는다 (따라가기만 하는 속도)', () => {
  const W = mk();
  // 줄 3을 1초에 지난다 (800px/s = 분당 2,400자). 구간+여유 320px를 0.4초에 지난다 → 0.6초에 못 미친다
  sweep(W, { t0: 0, ms: 1000, x0: 0, x1: 800, line: 3 });
  assert.equal(W.done, 0);
  assert.ok(W.spans[0].bestMs > 300 && W.spans[0].bestMs < 600, `${W.spans[0].bestMs}ms`);
});

test('다른 줄에 있는 동안에는 같은 가로 자리를 봐도 세지 않는다', () => {
  const W = mk();
  sweep(W, { t0: 0, ms: 4000, x0: 0, x1: 800, line: 2 });
  sweep(W, { t0: 5000, ms: 4000, x0: 0, x1: 800, line: 4 });
  assert.equal(W.done, 0);
  assert.equal(W.spans[0].bestMs, 0);
});

test('빠르게 여러 번 지나가서 채울 수 없다 — 줄을 떠나면 머문 시간이 0으로 돌아간다', () => {
  const W = mk();
  for (let k = 0; k < 4; k++) {
    sweep(W, { t0: k * 3000, ms: 1000, x0: 0, x1: 800, line: 3 });          // 빠르게 지나가고
    sweep(W, { t0: k * 3000 + 1100, ms: 1000, x0: 0, x1: 800, line: 4 });   // 다음 줄로 갔다가 돌아온다
  }
  assert.equal(W.done, 0);
  assert.equal(W.spans[0].dwellMs, 0);
});

test('안 채워졌으면 그 줄로 돌아와 천천히 다시 읽으면 채워진다', () => {
  const W = mk();
  sweep(W, { t0: 0, ms: 1000, x0: 0, x1: 800, line: 3 });
  sweep(W, { t0: 1100, ms: 2000, x0: 0, x1: 800, line: 4 });
  assert.equal(W.done, 0);
  assert.equal(W.pendingOnLine(3), true);
  const newly = sweep(W, { t0: 4000, ms: 4000, x0: 0, x1: 800, line: 3 });
  assert.deepEqual(newly, ['3:0']);
  assert.equal(W.pendingOnLine(3), false);
});

test('추적이 끊긴 시간은 머문 시간으로 세지 않는다', () => {
  const W = mk();
  W.push({ tMs: 0, x: 400, line: 3 });
  W.push({ tMs: 5000, x: 400, line: 3 });      // 5초 뒤의 표본 하나 — 그 사이는 모른다
  assert.equal(W.done, 0);
  W.push({ tMs: 5033, x: 400, valid: false, line: 3 });
  W.push({ tMs: 9000, x: 400, line: 3 });
  assert.equal(W.spans[0].bestMs < 100, true);
});

test('좌우 여유는 두 글자 (20px판 40px)', () => {
  const W = mk();
  for (let t = 0; t <= 1000; t += 33) W.push({ tMs: t, x: 270, line: 3 });    // 구간 왼쪽 끝에서 30px 밖 → 여유 안
  assert.equal(W.done, 1);
  const V = mk();
  for (let t = 0; t <= 1000; t += 33) V.push({ tMs: t, x: 240, line: 3 });    // 60px 밖 → 여유 밖
  assert.equal(V.done, 0);
});

test('6자보다 짧은 표시는 6자로 넓혀서 본다', () => {
  const W = mk([[{ left: 400, width: 40, chars: 2, type: 'Highlight' }]]);
  const sp = W.spans[0];
  assert.equal(sp.needMs, 300);                 // 6자 ÷ 20자/초
  assert.equal(sp.width, 40, '그릴 자리는 그대로');
  for (let t = 0; t <= 600; t += 33) W.push({ tMs: t, x: 330, line: 0 });      // 가운데 420에서 90px: 넓힌 구간(360~480) + 여유 40 안
  assert.equal(W.done, 1);
});

test('앞줄에서 넘어온 짧은 꼬리는 따로 요구하지 않는다', () => {
  const W = mk([[{ left: 0, width: 800, chars: 40, type: 'Underline' }], [{ left: 0, width: 70, chars: 4, type: 'Underline', cont: true }]]);
  assert.equal(W.total, 1);
  assert.equal(W.spans[0].id, '0:0');
  // 넘어온 부분이 길면 그것도 요구한다
  const V = mk([[{ left: 0, width: 800, chars: 40, type: 'Underline' }], [{ left: 0, width: 300, chars: 15, type: 'Underline', cont: true }]]);
  assert.equal(V.total, 2);
});

test('restore: 앞서 인정된 표시는 쪽을 다시 그려도 그대로다', () => {
  const W = mk();
  W.restore(['3:0']);
  assert.equal(W.allDone, true);
  const V = mk();
  V.restore(new Set(['9:9']));
  assert.equal(V.done, 0);
});

test('snapshot에 문턱과 구간마다의 머문 시간이 들어간다 (기록용)', () => {
  const W = mk();
  sweep(W, { t0: 0, ms: 1000, x0: 0, x1: 800, line: 3 });
  const sn = W.snapshot();
  assert.equal(sn.version, 'key-span/0.1.0-dev');
  assert.equal(sn.total, 1); assert.equal(sn.done, 0);
  assert.equal(sn.limits.maxCharsPerMin, 1200);
  assert.ok(sn.spans[0].progress > 0.5 && sn.spans[0].progress < 1);
});

// ---- reflow.js: 주석 → 표지 → 줄마다의 글자 범위
const item = (str, x, y, size = 10) => ({ str, transform: [size, 0, 0, size, x, y], width: str.length * size, height: size, fontName: 'f' });

test('annotationQuads: 밑줄·형광펜만 꺼내고, 좌표 배열의 두 가지 모양을 모두 읽는다', () => {
  const q = annotationQuads([
    { subtype: 'Underline', quadPoints: new Float32Array([10, 112, 60, 112, 10, 98, 60, 98]), rect: [10, 98, 60, 112] },
    { subtype: 'Highlight', quadPoints: [[{ x: 100, y: 212 }, { x: 150, y: 212 }, { x: 100, y: 198 }, { x: 150, y: 198 }]] },
    { subtype: 'Highlight', rect: [5, 5, 30, 15] },
    { subtype: 'Link', rect: [0, 0, 10, 10] }, { subtype: 'Text', rect: [0, 0, 10, 10] }
  ]);
  assert.deepEqual(q.map((v) => [v.type, v.x0, v.x1, v.y0, v.y1]),
    [['Underline', 10, 60, 98, 112], ['Highlight', 100, 150, 198, 212], ['Highlight', 5, 30, 5, 15]]);
  assert.deepEqual(annotationQuads(null), []);
});

test('markItems → resolveMarks: 주석이 덮은 글자만 표시가 된다', () => {
  // "가나다라마바사아자차" (x 100~200, 글자마다 10pt). 주석은 x 130~170 = "라마바사"
  const items = markItems([item('가나다라마바사아자차', 100, 100)], [{ type: 'Underline', x0: 130, x1: 170, y0: 98, y1: 112 }]);
  assert.equal(stripMarks(items[0].str), '가나다라마바사아자차');
  const [r] = resolveMarks([items[0].str]);
  assert.equal(r.text, '가나다라마바사아자차');
  assert.deepEqual(r.marks, [{ start: 3, end: 7, type: 'Underline' }]);
  assert.equal(r.text.slice(3, 7), '라마바사');
});

test('markItems: 다른 줄(높이가 다른 곳)의 글은 건드리지 않는다. 주석이 없으면 그대로 돌려준다', () => {
  const its = [item('윗줄입니다', 100, 130), item('아랫줄입니다', 100, 100)];
  const out = markItems(its, [{ type: 'Highlight', x0: 100, x1: 160, y0: 98, y1: 112 }]);
  assert.equal(out[0].str, '윗줄입니다');
  assert.notEqual(out[1].str, '아랫줄입니다');
  assert.equal(markItems(its, []), its);
});

test('resolveMarks: 표시가 줄을 넘어가면 앞줄은 끝까지, 다음 줄은 처음부터 (cont)', () => {
  const r = resolveMarks(['앞 중요한 내용이', '다음 줄까지 이어진다', '표시 없는 줄']);
  assert.deepEqual(r[0], { text: '앞 중요한 내용이', marks: [{ start: 2, end: 9, type: 'Underline' }] });
  assert.deepEqual(r[1], { text: '다음 줄까지 이어진다', marks: [{ start: 0, end: 6, type: 'Underline', cont: true }] });
  assert.deepEqual(r[2], { text: '표시 없는 줄', marks: [] });
});

test('resolveMarks: 조각마다 따로 심긴 표시는 공백만 사이에 두면 하나로 잇고, 종류가 다르면 따로 둔다', () => {
  const [r] = resolveMarks(['가나 다라 마 바사']);
  assert.equal(r.text, '가나 다라 마 바사');
  assert.deepEqual(r.marks, [{ start: 0, end: 5, type: 'Underline' }, { start: 8, end: 10, type: 'Highlight' }]);
});

test('표시를 켜도 재배치 결과(글·줄 나눔)는 한 글자도 달라지지 않는다', () => {
  const measure = (s) => [...s].reduce((w, ch) => w + (/[ᄀ-￿]/.test(ch) ? 20 : 10), 0);
  const its = [];
  const body = '이 문장은 줄을 넘어갈 만큼 충분히 길어야 한다 그래서 같은 말을 여러 번 되풀이하여 적어 둔다 정말로 충분히 길다';
  its.push(item(body, 72, 700, 11));
  its.push(item('1. 목록으로 시작하는 줄', 72, 660, 11));
  const quads = [{ type: 'Underline', x0: 72, x1: 72 + 11 * 12, y0: 697, y1: 712 }, { type: 'Highlight', x0: 72, x1: 72 + 11 * 6, y0: 657, y1: 672 }];
  const lay = (items) => layoutParagraphs(linesToParagraphs(itemsToLines(items, 842), 595), measure, REFLOW_20);
  const plain = lay(its), marked = lay(markItems(its, quads));
  assert.deepEqual(marked.flat().map((l) => l.text), plain.flat().map((l) => l.text));
  assert.ok(plain.flat().every((l) => !('marks' in l)), '표시가 없으면 marks 키도 없다');
  const got = marked.flat().filter((l) => l.marks);
  assert.equal(got.length, 2);
  assert.equal(got[1].text.slice(got[1].marks[0].start, got[1].marks[0].end), '1. 목록으');   // 여섯 글자. 목록 표지 판정도 그대로다
});

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
