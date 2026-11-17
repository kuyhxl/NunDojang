# 발표용 프로세스 흐름도 SVG 생성. 내용은 web/ 코드에서 확인한 실제 순서다.
import html

W, H = 1660, 1180
MARGIN, GAP = 36, 20
COLW = (W - MARGIN * 2 - GAP * 3) // 4
COLX = [MARGIN + i * (COLW + GAP) for i in range(4)]
HDR_Y, HDR_H, BOX_Y0, BOX_GAP = 96, 36, 148, 14

C = {
    'bg': '#ffffff', 'ink': '#1e293b', 'mute': '#64748b', 'line': '#cbd5e1',
    'prep': '#0284c7', 'prepbg': '#f0f9ff', 'prepbd': '#bae6fd',
    'cal':  '#7c3aed', 'calbg':  '#f5f3ff', 'calbd':  '#ddd6fe',
    'read': '#059669', 'readbg': '#ecfdf5', 'readbd': '#a7f3d0',
    'seal': '#d97706', 'sealbg': '#fffbeb', 'sealbd': '#fde68a',
}
FONT = "'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic','Helvetica Neue',sans-serif"
MONO = "'SF Mono','JetBrains Mono',Menlo,monospace"

# 각 칸: (제목, [(종류, 글), ...])   종류: 'w'=무엇, 'y'=왜, 'f'=수식, 'b'=목록
PHASES = [
    ('준비', '문서를 측정할 수 있는 모양으로', 'prep', [
        ('① PDF 첨부', [
            ('w', '사용자가 원본 PDF를 올린다.'),
            ('w', '원본은 글자 크기·단 수·배율이'),
            ('w', '문서마다 제각각이다.'),
        ]),
        ('② 텍스트 재배치 (reflow)', [
            ('w', 'PDF.js로 글자를 뽑아 고정 규격으로'),
            ('w', '다시 그린다 — 글자 20px, 줄 간격'),
            ('w', '40px, 단 폭 800px, 쪽당 12줄.'),
            ('y', '문서가 달라도 줄바꿈 눈 이동 폭이'),
            ('y', '같아진다 (측정 조건 통일).'),
            ('y', '앱이 줄 수와 각 줄의 위치·폭을'),
            ('y', '정확히 안다 — 점수 계산의 전제.'),
        ]),
        ('핵심 수치 한눈에', [
            ('b', '재배치 — 글자 20px · 줄 간격 40px'),
            ('i', '단 폭 800px · 쪽당 12줄'),
            ('b', '보정 — 27점(격자 20 + 고개 3'),
            ('i', '+ 어두운 화면 4), 점당 1.1초'),
            ('b', '줄바꿈 — 떨어짐 ≥ 단 폭의 19%,'),
            ('i', '착지 ≤ 글 왼쪽에서 단 폭의 25%'),
            ('b', '줄 인정 — 가로 ≥ 줄 폭의 40%,'),
            ('i', '최대 속도 = 단 폭/초 ≈ 2400자/분'),
            ('b', '통과 — 쪽 점수 80점'),
        ]),
    ]),
    ('보정', '27점 · 약 30초', 'cal', [
        ('③ 자세 맞춤', [
            ('w', '눈꼬리 간격이 영상 폭의 19~27%'),
            ('w', '(카메라에서 약 28~38cm), 고개'),
            ('w', '기울기 6° 이내로 맞춘다.'),
            ('y', '눈이 크게 잡힐수록 홍채 움직임이 더'),
            ('y', '많은 픽셀로 보인다 = 분해능.'),
            ('y', "이 자세를 '기준 자세'로 저장한다."),
        ]),
        ('④ 20점 격자 (흰 화면)', [
            ('w', '5×4 격자를 ㄹ자로 훑는다.'),
            ('w', '점당 200ms 대기 + 900ms 수집.'),
            ('y', '아래 식의 계수를 푼다:'),
            ('f', '화면좌표 = w₀ + w₁·눈좌우'),
            ('f', '  + w₂·눈위아래 + w₃·고개좌우'),
            ('f', '  + w₄·고개위아래'),
            ('y', '가로·세로가 같은 재료를 쓰므로'),
            ('y', '세로 점이 가로 정확도에도 필요하다.'),
        ]),
        ('⑤ 고개 돌림 3점', [
            ('w', '가운데 점을 계속 보면서 고개만'),
            ('w', '왼쪽·오른쪽·위로 5~15° 돌린다.'),
            ('y', '보정 중 머리가 고정이면 고개 계수를'),
            ('y', '못 구한다 → 읽다가 고개가 조금'),
            ('y', '돌면 좌표가 통째로 밀린다.'),
        ]),
        ('⑥ 어두운 화면 4점', [
            ('w', '검정 배경에서 네 점을 더 본다.'),
            ('y', '어두우면 동공이 커지고 홍채 중심'),
            ('y', '추정이 달라진다. 두 밝기의 표본을'),
            ('y', '섞어 맞춰 밝기가 바뀌어도 버틴다.'),
        ]),
        ('⑦ 보정 판정', [
            ('w', '점을 하나씩 빼고 다시 맞춰 오차를'),
            ('w', '잰다 (leave-one-out).'),
            ('y', '가로 오차가 화면 폭 20%를 넘으면'),
            ('y', '보정 실패 → 재시도. 세로만 나쁘면'),
            ('y', "'세로는 안 쓴다'로 통과."),
        ]),
    ]),
    ('읽기', '쪽마다 되풀이', 'read', [
        ('⑧ 첫 줄 앵커', [
            ('w', '읽기 자세에서 PDF 첫 줄 옆 점을'),
            ('w', '1~2초 본다. 쪽이 바뀔 때마다.'),
            ('y', '기울기(배율)는 그대로 두고 치우침만'),
            ('y', '되민다. 보정 자세와 읽기 자세의'),
            ('y', '미세한 차이로 좌표가 통째로'),
            ('y', '흘러내리는 것(실측 2~6줄)을 되돌린다.'),
        ]),
        ('⑨ 시선 측정 (30fps)', [
            ('w', '홍채 랜드마크 → 화면 좌표.'),
            ('w', '깜빡임·화면 밖·저품질 프레임은'),
            ('w', '빼고 쓴다.'),
        ]),
        ('⑩ 줄 추적', [
            ('w', '가로 되돌림을 찾는다 — x가 단 폭의'),
            ('w', '19% 이상 왼쪽으로 떨어져 왼쪽 25%'),
            ('w', "안에 착지하면 '한 줄 끝'."),
            ('y', '짧은 줄은 되돌림이 안 생기므로'),
            ('y', '머문 시간으로 넘긴다.'),
        ]),
        ('⑪ 줄 인정', [
            ('w', "두 조건을 모두 넘겨야 '읽음':"),
            ('b', '가로 진행 ≥ 줄 폭의 40%'),
            ('b', '머문 시간 ≥ 줄 폭 ÷ 최대 속도'),
            ('y', '앞은 한 점 응시·세로 훑기를,'),
            ('y', '뒤는 휙 넘기기를 막는다.'),
        ]),
        ('⑫ 쪽 점수', [
            ('w', '읽은 줄 ÷ 전체 줄 × 100.'),
            ('w', '80점 이상 + 품질 관문(유효 측정'),
            ('w', '시간 비율)을 넘으면 그 쪽 통과.'),
        ]),
    ]),
    ('봉인', '증거를 문서에 박는다', 'seal', [
        ('⑬ 모든 쪽 통과', [
            ('w', '쪽마다의 통과를 모아 문서 전체가'),
            ('w', '완료되면 다음으로 넘어간다.'),
        ]),
        ('⑭ 서명 + 동의', [
            ('w', '손글씨 서명을 받고 동의 항목을'),
            ('w', '확인받는다.'),
        ]),
        ('⑮ 봉인 PDF 발급', [
            ('w', '문서 해시, 쪽별 점수, 보정 품질,'),
            ('w', '점수 정책 버전을 함께 박아 넣는다.'),
            ('y', "나중에 '무엇을 근거로 통과했는지'를"),
            ('y', '되짚을 수 있어야 한다.'),
        ]),
    ]),
]

LH, PAD_T, PAD_B, TITLE_H = 18, 14, 14, 26
def box_h(lines):
    h = PAD_T + TITLE_H + PAD_B
    prev = None
    for kind, _ in lines:
        if prev and kind != prev and not (prev in 'yf' and kind in 'yf') and not (prev in 'bi' and kind in 'bi'): h += 6
        h += LH; prev = kind
    return h

out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
       f'font-family="{FONT}" role="img" aria-label="눈도장 동작 흐름도">']
out.append(f'<rect width="{W}" height="{H}" fill="{C["bg"]}"/>')
out.append(f'<text x="{MARGIN}" y="48" font-size="27" font-weight="700" fill="{C["ink"]}">'
           f'눈도장 — 프로그램이 실제로 하는 일</text>')
out.append(f'<text x="{MARGIN}" y="74" font-size="13.5" fill="{C["mute"]}">'
           f'문서를 고정 규격으로 다시 그린 뒤, 시선을 화면 좌표로 바꾸고, 줄마다 "따라 읽었는가"를 판정해 봉인한다.</text>')

col_bottom = []
for ci, (name, sub, key, boxes) in enumerate(PHASES):
    x, acc, bd, bg = COLX[ci], C[key], C[key + 'bd'], C[key + 'bg']
    out.append(f'<rect x="{x}" y="{HDR_Y}" width="{COLW}" height="{HDR_H}" rx="8" fill="{acc}"/>')
    out.append(f'<text x="{x + 14}" y="{HDR_Y + 24}" font-size="15.5" font-weight="700" fill="#ffffff">{html.escape(name)}</text>')
    out.append(f'<text x="{x + COLW - 14}" y="{HDR_Y + 24}" font-size="12" fill="#ffffff" opacity="0.85" text-anchor="end">{html.escape(sub)}</text>')
    if ci < 3:
        ax = x + COLW + GAP / 2
        out.append(f'<path d="M{ax - 5} {HDR_Y + HDR_H / 2 - 6} l7 6 l-7 6" fill="none" stroke="{C["line"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>')
    y = BOX_Y0
    for bi, (title, lines) in enumerate(boxes):
        h = box_h(lines)
        if bi:
            out.append(f'<path d="M{x + COLW / 2} {y - BOX_GAP + 1} v{BOX_GAP - 6}" stroke="{bd}" stroke-width="2"/>')
            out.append(f'<path d="M{x + COLW / 2 - 4} {y - 7} l4 5 l4 -5" fill="none" stroke="{bd}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')
        out.append(f'<rect x="{x}" y="{y}" width="{COLW}" height="{h}" rx="10" fill="{bg}" stroke="{bd}"/>')
        out.append(f'<rect x="{x}" y="{y}" width="4" height="{h}" rx="2" fill="{acc}"/>')
        out.append(f'<text x="{x + 16}" y="{y + PAD_T + 17}" font-size="14.5" font-weight="700" fill="{C["ink"]}">{html.escape(title)}</text>')
        ty, prev = y + PAD_T + TITLE_H + 12, None
        for kind, text in lines:
            if prev and kind != prev and not (prev in 'yf' and kind in 'yf') and not (prev in 'bi' and kind in 'bi'): ty += 6
            if kind == 'w':
                out.append(f'<text x="{x + 16}" y="{ty}" font-size="12.5" fill="{C["ink"]}">{html.escape(text)}</text>')
            elif kind == 'y':
                first = prev not in ('y', 'f')
                if first:
                    out.append(f'<text x="{x + 16}" y="{ty}" font-size="12.5" font-weight="700" fill="{acc}">왜 <tspan font-weight="400">{html.escape(text)}</tspan></text>')
                else:
                    out.append(f'<text x="{x + 16 + 22}" y="{ty}" font-size="12.5" fill="{acc}">{html.escape(text)}</text>')
            elif kind == 'f':
                out.append(f'<text x="{x + 16 + 22}" y="{ty}" font-size="12" fill="{acc}" font-style="italic">{html.escape(text)}</text>')
            elif kind == 'i':
                out.append(f'<text x="{x + 16 + 13}" y="{ty}" font-size="12.5" fill="{C["ink"]}">{html.escape(text)}</text>')
            else:
                out.append(f'<text x="{x + 16}" y="{ty}" font-size="12.5" fill="{C["ink"]}">• {html.escape(text)}</text>')
            ty += LH; prev = kind
        y += h + BOX_GAP
    col_bottom.append(y - BOX_GAP)

ny = max(col_bottom) + 24
out.append(f'<rect x="{MARGIN}" y="{ny}" width="{W - MARGIN * 2}" height="52" rx="10" fill="#f8fafc" stroke="{C["line"]}" stroke-dasharray="5 4"/>')
out.append(f'<text x="{MARGIN + 18}" y="{ny + 22}" font-size="13" font-weight="700" fill="{C["ink"]}">측정하는 동안 계속 — 자세 감시</text>')
out.append(f'<text x="{MARGIN + 18}" y="{ny + 40}" font-size="12.5" fill="{C["mute"]}">'
           f'기준 자세에서 벗어나면(얼굴 이동 0.25 눈꼬리폭 · 크기 변화 12% · 고개 돌림 0.08) 경고하고 보정·측정을 멈춘다. '
           f'자세가 변하면 ④에서 구한 계수가 더 이상 맞지 않기 때문이다.</text>')

fy = ny + 52 + 28
out.append(f'<line x1="{MARGIN}" y1="{fy - 14}" x2="{W - MARGIN}" y2="{fy - 14}" stroke="{C["line"]}"/>')
out.append(f'<text x="{MARGIN}" y="{fy + 8}" font-size="13.5" fill="{C["ink"]}">'
           f'<tspan font-weight="700" fill="{C["read"]}">증명하는 것 </tspan>'
           f'각 줄을 따라 읽는 눈 움직임이, 그 줄을 읽을 만한 시간 동안 관찰되었다.</text>')
out.append(f'<text x="{MARGIN}" y="{fy + 30}" font-size="13.5" fill="{C["ink"]}">'
           f'<tspan font-weight="700" fill="#b91c1c">증명하지 않는 것 </tspan>'
           f'이해. 1000Hz 장비로도 이해도 예측은 59.2%로, 글만 보고 맞히는 예측(58.7%)을 넘지 못한다.</text>')
out.append('</svg>')

svg = '\n'.join(out)
path = '/Users/ozzing727/Desktop/Developer/NunDojang/docs/images/process_flow.svg'
open(path, 'w').write(svg)
print(f'{path}  ({len(svg)} bytes), 필요한 높이 {fy + 44:.0f} / 지정 {H}')
