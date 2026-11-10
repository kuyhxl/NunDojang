// 리퀴드 글라스 눈 물방울 — C 소유. PDF 지면 위에 투명한 물방울 하나를 띄운다. 표시 전용, 판정에 관여하지 않음.
//  가로: 홍채 상대 x(두 눈 평균)를 따라감
//  세로: 줄바꿈 후보 사건이 누적될 때마다 다음 줄로 (pdfManager의 줄 위치 사용)
//  움직임: 스프링 물리(관성·오버슈트) + 이동 방향으로 늘어나는 액체 변형 + 깜빡임 시 납작해짐
// 위 동작은 보정이 없을 때의 표시이며 "줄 단위 읽기 리듬"을 보여준다.
// 보정된 시선이 있으면 그 좌표를 따라 화면 전체를 움직여, 지면 밖으로 벗어난 것도 그대로 보인다.

export function createEyeGlass(container, { size = 56, stiffness = 120, damping = 14, maxStretch = 0.28 } = {}) {
  container.classList.add('gaze-layer');
  container.innerHTML = `
    <div class="drop" style="--size:${size}px"><i class="drop-rim"></i><i class="drop-glint"></i><i class="drop-glint2"></i></div>
    <div class="gaze-note" aria-live="polite"></div>`;
  const drop = container.querySelector('.drop');
  const note = container.querySelector('.gaze-note');

  let lines = [];          // [{top, height, left?, width?}] 지면(CSS) 픽셀
  let span = { left: 0.14, width: 0.72 };   // 물방울이 가로로 움직이는 범위 (지면 폭 비율). 재배치 모드는 본문 단에 맞춘다
  let lineIndex = 0;
  let directionSign = 1;
  let earBase = null;
  const target = { x: 0.5, y: 0.25 };   // 0~1 지면 비율
  const pos = { x: 0.5, y: 0.25 };
  const vel = { x: 0, y: 0 };
  let raf = null, last = 0, visible = false;
  let followsGazeY = false;   // 보정된 세로값을 쓰는 중이면 줄바꿈 후보로 세로를 움직이지 않고, 화면 전체에서 표시한다
  const unit = (v) => Math.min(1, Math.max(0, v));

  function setFog(on, text) { container.classList.toggle('is-fogged', on); note.textContent = text ?? ''; }
  setFog(true, '');

  function lineY(i) {
    if (!lines.length) return 0.25;
    const L = lines[Math.min(i, lines.length - 1)];
    return (L.top + L.height / 2) / (container.clientHeight || 1);
  }

  // 스프링 적분: 매 프레임 목표로 끌려가되 속도를 가져 지나쳤다가 돌아온다
  function step(now) {
    raf = null;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    for (const k of ['x', 'y']) {
      const a = (target[k] - pos[k]) * stiffness - vel[k] * damping;
      vel[k] += a * dt;
      pos[k] += vel[k] * dt;
    }
    const W = container.clientWidth, H = container.clientHeight;
    const cx = pos.x * W, cy = pos.y * H;
    // 속도(픽셀/초) → 늘어남과 방향
    const vx = vel.x * W, vy = vel.y * H;
    const speed = Math.hypot(vx, vy);
    const stretch = Math.min(maxStretch, speed / 2400);
    const angle = speed > 20 ? Math.atan2(vy, vx) * 180 / Math.PI : 0;
    drop.style.transform = `translate(${(cx - size / 2).toFixed(1)}px, ${(cy - size / 2).toFixed(1)}px) rotate(${angle.toFixed(1)}deg) scale(${(1 + stretch).toFixed(3)}, ${(1 - stretch * 0.6).toFixed(3)}) rotate(${(-angle).toFixed(1)}deg)`;
    const moving = Math.abs(target.x - pos.x) > 0.0005 || Math.abs(target.y - pos.y) > 0.0005 || speed > 2;
    if (moving) raf = requestAnimationFrame(step);
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); } };

  /** 지면 안 표시와 화면 전체 표시를 오간다. 기준 영역이 바뀌어도 물방울이 튀지 않게 위치를 옮겨 적는다. */
  function setFree(free) {
    if (free === followsGazeY) return;
    const before = container.getBoundingClientRect();
    const px = { x: before.left + pos.x * before.width, y: before.top + pos.y * before.height };
    container.classList.toggle('is-free', free);
    followsGazeY = free;
    const after = container.getBoundingClientRect();
    pos.x = (px.x - after.left) / (after.width || 1);
    pos.y = (px.y - after.top) / (after.height || 1);
    vel.x = vel.y = 0;
    if (!free) target.y = lineY(lineIndex);
  }

  function closure(ear) {
    if (ear === null || !Number.isFinite(ear)) return 0;
    earBase = earBase === null ? ear : Math.max(earBase * 0.995, ear);
    return earBase > 0 ? Math.min(1, Math.max(0, 1 - ear / earBase)) : 0;
  }

  return {
    setLines(boxes) {
      lines = Array.isArray(boxes) ? boxes : []; lineIndex = 0;
      const W = container.clientWidth || 1, b = lines[0];
      span = b && Number.isFinite(b.left) && Number.isFinite(b.width) ? { left: b.left / W, width: b.width / W } : { left: 0.14, width: 0.72 };
      if (!followsGazeY) target.y = lineY(0);
      kick();
    },
    setDirectionSign(s) { directionSign = s === -1 ? -1 : 1; },
    advance(n = 1) { lineIndex = Math.min(lineIndex + n, Math.max(lines.length - 1, 0)); if (!followsGazeY) target.y = lineY(lineIndex); kick(); },
    resetLine() { lineIndex = 0; if (!followsGazeY) target.y = lineY(0); kick(); },
    /** @param gaze 보정이 있을 때의 화면 좌표 {x, y|null} (CSS px). 없으면 홍채 x로 대강 표시한다 */
    update(sample, gaze = null) {
      if (!sample.valid || sample.leftIrisX === null || sample.rightIrisX === null) { setFog(true, reasonText(sample.invalidReason)); return; }
      if (!visible) { visible = true; container.classList.add('is-visible'); }
      setFog(false, '');
      const useGazeY = gaze !== null && gaze.y !== null;
      setFree(useGazeY);
      if (gaze) {
        const rect = container.getBoundingClientRect();
        target.x = unit((gaze.x - rect.left) / (rect.width || 1));
        if (useGazeY) target.y = unit((gaze.y - rect.top) / (rect.height || 1));
      } else {
        const x = (sample.leftIrisX + sample.rightIrisX) / 2;
        const screenX = directionSign === 1 ? x : 1 - x;
        target.x = span.left + Math.min(1, Math.max(0, (screenX - 0.3) / 0.4)) * span.width;
      }
      const ear = sample.leftEar !== null && sample.rightEar !== null ? (sample.leftEar + sample.rightEar) / 2 : null;
      drop.style.setProperty('--close', closure(ear).toFixed(2));
      kick();
    },
    idle() { setFree(false); visible = false; container.classList.remove('is-visible'); setFog(true, ''); earBase = null; vel.x = vel.y = 0; }
  };
}

function reasonText(r) {
  return { no_face: '얼굴이 보이지 않아요', multiple_faces: '얼굴이 둘 이상이에요', eye_unreliable: '눈이 가려졌어요', head_motion: '머리가 많이 움직여요', timestamp_error: '시간 오류' }[r] ?? '눈을 찾는 중';
}
