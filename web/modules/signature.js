// 서명 입력 — C 소유. 캔버스 그리기(기본) + 이미지 업로드(선택).
// 최종 서명은 PNG dataURL과 SHA-256 해시로 세션에 저장한다. 서버로 보내지 않는다.

export function createSignaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let strokes = 0;
  ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#111';

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - r.left) * (canvas.width / r.width), y: (p.clientY - r.top) * (canvas.height / r.height) };
  };
  const down = (e) => { drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
  const move = (e) => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); strokes++; e.preventDefault(); };
  const up = () => { drawing = false; };
  canvas.addEventListener('mousedown', down); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  canvas.addEventListener('touchstart', down, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', up);

  return {
    clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); strokes = 0; },
    isEmpty() { return strokes === 0; },
    toPngDataUrl() { return canvas.toDataURL('image/png'); },
    destroy() { window.removeEventListener('mouseup', up); window.removeEventListener('touchend', up); }
  };
}

/** 업로드 이미지(PNG/JPG, ≤2MB)를 PNG dataURL로 정규화. */
export async function imageFileToPngDataUrl(file) {
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('PNG 또는 JPG만 올릴 수 있습니다.');
  if (file.size > 2 * 1024 * 1024) throw new Error('서명 이미지는 2MB 이하여야 합니다.');
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  return c.toDataURL('image/png');
}

export async function sha256OfDataUrl(dataUrl) {
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (ch) => ch.charCodeAt(0));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
