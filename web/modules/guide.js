// 처음 쓰는 사람을 위한 안내 — C 소유. PDF를 열기 전 빈 화면 안에 놓인다 (창을 띄워 막지 않는다).
//
// 왜: 시연에서 처음 앉은 사람은 스페이스바로 넘어간다는 것, 물방울이 주황색이 되는 뜻, 왼쪽 표식의 색,
//     쪽을 넘기는 법을 모른다. 읽는 도중에 글로 알려 주면 눈이 그리로 가서 측정이 흐트러지므로 **읽기 전에** 알려 준다.
// 원칙: 그림은 실제 화면 요소(물방울·줄 표식·밑줄 막대·쪽 목록)를 같은 색·같은 모양으로 줄여 그린다 — 읽을 때 본 것과 같아야 한다.
//       건너뛸 수 있고(그냥 PDF를 열면 된다), 접어 두면 다음에는 접힌 채로 뜬다. 다시 펴는 단추는 늘 남는다.
// DOM만 쓴다. 측정·점수에는 관여하지 않는다.

const STORE_KEY = 'nd.guide';     // 'closed'면 접힌 채로 시작

const key = (label) => `<kbd class="g-key">${label}</kbd>`;
const ARROW = (dir) => `<svg class="g-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="${{ right: 'M3 8h9M8.5 4.5 12 8l-3.5 3.5', left: 'M13 8H4M7.5 4.5 4 8l3.5 3.5', up: 'M8 13V4M4.5 7.5 8 4l3.5 3.5', down: 'M8 3v9M4.5 8.5 8 12l3.5-3.5' }[dir]}"/></svg>`;
const keyArrow = (dir, name) => `<kbd class="g-key" aria-label="${name}">${ARROW(dir)}</kbd>`;
const MIC = '<svg class="g-ico g-mic" viewBox="0 0 16 16" aria-hidden="true"><rect x="6" y="2" width="4" height="7.5" rx="2"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.2"/></svg>';
const CHECK = '<svg class="g-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.6 11.5 12.5 4.8"/></svg>';
const POINTER = '<svg class="g-cursor" viewBox="0 0 18 22" aria-hidden="true"><path d="M2 1.5v15l4.2-3.6 2.6 6.1 2.6-1.1-2.6-6h5.4z"/></svg>';

/** 지면의 한 줄. tick: '' | 'read' | 'missed' | 'current' */
const line = (text, tick = '', extra = '') => `<div class="g-line${extra ? ` ${extra}` : ''}"><i class="g-tick${tick ? ` is-${tick}` : ''}"></i><span class="g-text">${text}</span>${
  extra.includes('g-has-drop') ? '<i class="g-drop"><b></b></i><i class="g-drop is-amber"><b></b></i>' : ''}</div>`;

const SCENES = {
  calibrate: () => `
    <div class="g-sheet g-sheet-calib">
      <div class="g-dots">${Array.from({ length: 9 }, (_, i) => `<i class="g-dot${i === 4 ? ' is-on' : i < 4 ? ' is-done' : ''}"></i>`).join('')}</div>
    </div>
    <div class="g-keys"><span class="g-keyrow">${key('Space')}<em>점을 보면서 누르기</em></span></div>`,
  droplet: () => `
    <div class="g-sheet">
      ${line('이 문서는 시연을 위해 만든 예시입니다.', 'read')}
      ${line('검사에는 보통 10분에서 20분이 걸립니다.', 'current', 'g-has-drop')}
      ${line('회복실에서 30분 이상 머문 뒤 귀가합니다.')}
      ${line('복용 중인 약이 있으면 미리 알려 주십시오.')}
    </div>`,
  ticks: () => `
    <div class="g-sheet">
      ${line('이 문서는 시연을 위해 만든 예시입니다.', 'read')}
      ${line('검사에는 보통 10분에서 20분이 걸립니다.', 'missed', 'g-pointed')}
      ${line('회복실에서 30분 이상 머문 뒤 귀가합니다.', 'read')}
      ${line('복용 중인 약이 있으면 미리 알려 주십시오.', 'current')}
      ${line('조직 검사를 하면 출혈이 생길 수 있습니다.')}
      ${POINTER}
      <ul class="g-legend">
        <li><i class="g-tick is-read"></i>읽은 줄</li>
        <li><i class="g-tick is-missed"></i>지나쳤지만 못 읽은 줄</li>
        <li><i class="g-tick"></i>아직 안 읽은 줄</li>
      </ul>
    </div>`,
  marks: (o) => `
    <div class="g-sheet">
      ${line('2. 검사 전 준비', 'read')}
      ${line(`<span class="g-mark${o.marks === 'voice' ? ' is-voice' : ''}">검사 전날 밤 9시 이후에는 금식합니다.<b></b></span>`, 'current')}
      ${line('복용 중인 약이 있으면 미리 알려 주십시오.')}
      ${line('혈액을 묽게 하는 약은 의사와 상의합니다.')}
      ${o.marks === 'voice' ? `<span class="g-voice">${MIC}소리 내어 읽기</span>` : ''}
    </div>`,
  pages: () => `
    <div class="g-pages">
      <ul class="g-index">
        <li class="is-passed"><span>1쪽 · 페이지 기준 충족</span><span class="num">100%</span></li>
        <li class="is-current"><span>2쪽 · 읽는 중</span><span class="num">42%</span></li>
        <li><span>3쪽 · 아직 열지 않음</span><span class="num">—</span></li>
      </ul>
      <div class="g-keys">
        <span class="g-keyrow">${key('Space')}${keyArrow('right', '오른쪽 화살표')}<em>다음 쪽</em></span>
        <span class="g-keyrow">${keyArrow('left', '왼쪽 화살표')}<em>앞쪽</em></span>
        <span class="g-keyrow">${key('Esc')}<em>읽기 화면 나가기</em></span>
      </div>
    </div>`,
  sign: () => `
    <div class="g-pages">
      <ul class="g-index">
        <li class="is-passed"><span>1쪽 · 페이지 기준 충족</span><span class="num">100%</span></li>
        <li class="is-passed"><span>2쪽 · 페이지 기준 충족</span><span class="num">92%</span></li>
        <li class="is-passed"><span>3쪽 · 페이지 기준 충족</span><span class="num">100%</span></li>
      </ul>
      <div class="g-signrow"><span class="g-seal">${CHECK}</span><span class="btn-white g-fake-btn">서명 <span class="arrow">→</span></span></div>
    </div>`
};

/** 안내의 단계. marks: null | 'gaze' | 'voice' (중요 표시 기능을 켰을 때만 그 단계가 들어간다) */
export function guideSteps({ marks = null } = {}) {
  const steps = [
    { scene: 'calibrate', title: '점을 보고 스페이스바',
      body: '카메라를 켜면 화면에 점이 아홉 번 나옵니다. 점을 바라보면서 스페이스바를 누르세요. 15초쯤 걸리고, 끝나면 스페이스바로 읽기를 시작합니다.' },
    { scene: 'droplet', title: '물방울이 읽는 줄을 따라갑니다',
      body: '물방울은 지금 읽고 있는 줄에 머뭅니다. 평소 속도로 읽으면 됩니다. 물방울이 <b class="g-amber">주황색</b>으로 바뀌면 너무 빨리 지나가고 있다는 뜻이니 조금 천천히 읽어 주세요.' },
    { scene: 'ticks', title: '왼쪽 표식이 읽은 줄을 알려 줍니다',
      body: '줄마다 왼쪽에 작은 막대가 있습니다. 빨간 줄이 생기면 그 줄을 누르거나 <span class="g-inline">' + keyArrow('up', '위 화살표') + keyArrow('down', '아래 화살표') + '</span>로 물방울을 옮긴 뒤 다시 읽으세요.' }
  ];
  if (marks) {
    steps.push({ scene: 'marks', title: marks === 'voice' ? '밑줄과 형광펜은 소리 내어 읽습니다' : '밑줄과 형광펜은 천천히 읽습니다',
      body: marks === 'voice'
        ? '중요한 부분에는 밑줄이나 형광펜이 있습니다. 그 줄을 보면서 소리 내어 읽으면 아래 막대가 차오르고, 다 차면 초록색이 됩니다. 소리는 저장하지 않습니다.'
        : '중요한 부분에는 밑줄이나 형광펜이 있습니다. 그 부분을 천천히 읽으면 아래 막대가 차오르고, 다 차면 초록색이 됩니다.' });
  }
  steps.push(
    { scene: 'pages', title: '한 쪽을 다 읽으면 스페이스바',
      body: '스페이스바나 오른쪽 화살표로 다음 쪽으로 넘어갑니다. 왼쪽 목록의 <b class="g-blue">파란 선</b>이 지금 보는 쪽이고, 옆의 숫자가 그 쪽을 읽은 정도입니다.' },
    { scene: 'sign', title: '모든 쪽을 읽으면 서명이 열립니다',
      body: `모든 쪽이 기준을 채우${marks ? '고 중요한 부분이 모두 초록색이 되' : ''}면 서명 단추가 켜집니다. 서명하면 읽은 기록이 PDF에 봉인으로 남습니다.` }
  );
  return steps;
}

/**
 * @param {HTMLElement} root 안내가 들어갈 자리 (빈 화면 안)
 * @param {object} o
 * @param {null|'gaze'|'voice'} [o.marks]
 * @param {boolean} [o.open] true면 저장된 상태와 상관없이 펴서 시작
 * @param {HTMLElement} [o.reopenHost] 접었을 때 "사용법 보기" 단추를 둘 자리 (빈 화면의 PDF 넣는 곳)
 * @param {() => void} [o.onStart] 마지막 단계의 "PDF 열기"
 */
export function createGuide(root, { marks = null, open = null, onStart = null, reopenHost = null } = {}) {
  const steps = guideSteps({ marks });
  let index = 0;
  const stored = (() => { try { return localStorage.getItem(STORE_KEY); } catch { return null; } })();
  let isOpen = open ?? stored !== 'closed';
  const remember = () => { try { localStorage.setItem(STORE_KEY, isOpen ? 'open' : 'closed'); } catch { /* 저장 못 해도 동작은 같다 */ } };

  // 접었을 때 다시 펴는 단추. 위쪽 고정 막대에 가리지 않게, 눈이 가 있는 "PDF 넣는 곳" 안에 둔다
  const reopen = document.createElement('button');
  reopen.type = 'button'; reopen.className = 'g-reopen'; reopen.textContent = '처음이신가요? 사용법 보기';
  (reopenHost ?? root).appendChild(reopen);
  root.insertAdjacentHTML('beforeend', `
    <div class="g-body">
      <div class="g-stage" aria-hidden="true"></div>
      <div class="g-copy">
        <h2 class="g-title" tabindex="-1"></h2>
        <p class="g-desc"></p>
        <div class="g-nav">
          <button class="btn-ghost g-prev" type="button">이전</button>
          <button class="btn-white g-next" type="button"></button>
          <span class="g-count" aria-live="polite"></span>
          <button class="g-close" type="button">접기</button>
        </div>
      </div>
    </div>`);
  const $ = (s) => root.querySelector(s);
  const stage = $('.g-stage'), title = $('.g-title'), desc = $('.g-desc'), count = $('.g-count');
  const prev = $('.g-prev'), next = $('.g-next');

  function render({ focus = false } = {}) {
    const s = steps[index], last = index === steps.length - 1;
    root.classList.toggle('is-closed', !isOpen);
    reopen.hidden = isOpen;
    document.body.classList.toggle('has-guide', isOpen);
    stage.dataset.scene = s.scene;
    stage.innerHTML = SCENES[s.scene]({ marks });
    title.textContent = s.title;
    desc.innerHTML = s.body;
    count.textContent = `${index + 1} / ${steps.length}`;
    prev.disabled = index === 0;
    next.innerHTML = last ? 'PDF 열기 <span class="arrow">→</span>' : '다음';
    if (focus) title.focus({ preventScroll: true });
  }
  function go(to) { index = Math.min(steps.length - 1, Math.max(0, to)); render({ focus: true }); }
  function setOpen(v) { isOpen = v; remember(); render(); }

  prev.addEventListener('click', () => go(index - 1));
  next.addEventListener('click', () => { if (index === steps.length - 1) onStart?.(); else go(index + 1); });
  $('.g-close').addEventListener('click', () => setOpen(false));
  // PDF 넣는 곳은 누르면 파일 창이 열리는 label이다. 이 단추는 파일 창을 열지 않는다
  reopen.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); index = 0; setOpen(true); root.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  // ←/→로 넘긴다. 빈 화면에서 안내가 펴져 있을 때만, 글 입력 중이 아닐 때만
  document.addEventListener('keydown', (e) => {
    if (!isOpen || !document.body.classList.contains('is-empty') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof Element && e.target.matches('input, textarea, select')) return;
    if (document.querySelector('.calib:not([hidden])')) return;
    if (e.key === 'ArrowRight' && index < steps.length - 1) { e.preventDefault(); go(index + 1); }
    else if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); go(index - 1); }
  });

  root.hidden = false;
  render();
  return { get open() { return isOpen; }, get index() { return index; }, get length() { return steps.length; }, go, setOpen };
}
