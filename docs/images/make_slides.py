# 발표 슬라이드용 16:9 그림 3장. 멀리서 읽히도록 글자를 크게, 말은 적게.
import html, os
W, H = 1920, 1080
OUT = '/Users/ozzing727/Desktop/Developer/NunDojang/docs/images'
FONT = "'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic','Helvetica Neue',sans-serif"
INK, MUTE, LINE, PAPER = '#0f172a', '#64748b', '#cbd5e1', '#f8fafc'
ACC = ['#0284c7', '#7c3aed', '#059669', '#d97706']
TINT = ['#eff6ff', '#f5f3ff', '#ecfdf5', '#fffbeb']
EDGE = ['#bfdbfe', '#ddd6fe', '#a7f3d0', '#fde68a']
e = html.escape

def head(o, title, sub):
    o.append(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
    o.append(f'<text x="80" y="104" font-size="54" font-weight="800" fill="{INK}">{e(title)}</text>')
    if sub: o.append(f'<text x="80" y="152" font-size="27" fill="{MUTE}">{e(sub)}</text>')

def card(o, x, y, w, h, i):
    o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="22" fill="{TINT[i]}" stroke="{EDGE[i]}" stroke-width="2"/>')
    o.append(f'<rect x="{x}" y="{y}" width="{w}" height="8" rx="4" fill="{ACC[i]}"/>')

def arrow(o, x, y):
    o.append(f'<path d="M{x-16} {y-18} l20 18 l-20 18" fill="none" stroke="{LINE}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>')

def save(o, name):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{FONT}">\n' + '\n'.join(o) + '\n</svg>'
    open(f'{OUT}/{name}.svg', 'w').write(svg)
    print(f'{OUT}/{name}.svg')

# ─────────────────────────── 1장: 전체 흐름
o = []
head(o, '눈도장은 이렇게 동작합니다', '문서를 고쳐 그리고 → 눈을 보정하고 → 줄마다 판정하고 → 봉인한다')
CW, CX = 400, [80, 540, 1000, 1460]
CY, CH = 250, 505
ICON_Y = CY + 60
steps = [
    ('1', '문서를 다시 그린다', '같은 글자 크기', '같은 단 폭 · 쪽당 12줄', '앱이 줄 위치를 정확히 안다'),
    ('2', '눈을 보정한다', '27점 · 약 30초', '눈 움직임 → 화면 좌표', '변환식의 계수를 구한다'),
    ('3', '줄마다 판정한다', '줄바꿈을 세고', '진행 거리와 시간을 본다', '이 줄을 따라 읽었는가'),
    ('4', '봉인한다', '쪽별 점수와 보정 품질을', '문서에 함께 박는다', '나중에 근거를 되짚는다'),
]
for i, (num, title, l1, l2, take) in enumerate(steps):
    x = CX[i]; card(o, x, CY, CW, CH, i)
    cx = x + CW / 2
    # 아이콘
    if i == 0:
        o.append(f'<rect x="{cx-52}" y="{ICON_Y}" width="104" height="128" rx="10" fill="#fff" stroke="{ACC[i]}" stroke-width="5"/>')
        for k in range(5): o.append(f'<rect x="{cx-32}" y="{ICON_Y+24+k*20}" width="{64 if k%2 else 46}" height="7" rx="3.5" fill="{ACC[i]}" opacity="0.55"/>')
    elif i == 1:
        for r in range(4):
            for c in range(5):
                o.append(f'<circle cx="{cx-60+c*30}" cy="{ICON_Y+22+r*28}" r="6.5" fill="{ACC[i]}" opacity="{1 if (r*5+c)%7==0 else 0.35}"/>')
        o.append(f'<path d="M{cx-78} {ICON_Y+128} q78 -42 156 0 q-78 42 -156 0z" fill="none" stroke="{ACC[i]}" stroke-width="5"/>')
        o.append(f'<circle cx="{cx}" cy="{ICON_Y+128}" r="15" fill="{ACC[i]}"/>')
    elif i == 2:
        for k in range(3):
            o.append(f'<rect x="{cx-72}" y="{ICON_Y+14+k*40}" width="{144 if k<2 else 92}" height="9" rx="4.5" fill="{ACC[i]}" opacity="0.28"/>')
        o.append(f'<path d="M{cx-66} {ICON_Y+19} L{cx+64} {ICON_Y+19} L{cx-66} {ICON_Y+59} L{cx+64} {ICON_Y+59} L{cx-66} {ICON_Y+99} L{cx+22} {ICON_Y+99}" fill="none" stroke="{ACC[i]}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>')
        o.append(f'<circle cx="{cx+22}" cy="{ICON_Y+99}" r="11" fill="{ACC[i]}"/>')
    else:
        o.append(f'<circle cx="{cx}" cy="{ICON_Y+62}" r="58" fill="none" stroke="{ACC[i]}" stroke-width="6"/>')
        o.append(f'<circle cx="{cx}" cy="{ICON_Y+62}" r="44" fill="none" stroke="{ACC[i]}" stroke-width="3" opacity="0.5"/>')
        o.append(f'<path d="M{cx-24} {ICON_Y+62} l17 19 l33 -40" fill="none" stroke="{ACC[i]}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>')
    o.append(f'<text x="{x+28}" y="{CY+58}" font-size="40" font-weight="800" fill="{ACC[i]}" opacity="0.45">{num}</text>')
    o.append(f'<text x="{cx}" y="{CY+268}" font-size="37" font-weight="800" fill="{INK}" text-anchor="middle">{e(title)}</text>')
    o.append(f'<text x="{cx}" y="{CY+322}" font-size="26" fill="{MUTE}" text-anchor="middle">{e(l1)}</text>')
    o.append(f'<text x="{cx}" y="{CY+358}" font-size="26" fill="{MUTE}" text-anchor="middle">{e(l2)}</text>')
    o.append(f'<line x1="{x+40}" y1="{CY+400}" x2="{x+CW-40}" y2="{CY+400}" stroke="{EDGE[i]}" stroke-width="2"/>')
    o.append(f'<text x="{cx}" y="{CY+452}" font-size="27" font-weight="700" fill="{ACC[i]}" text-anchor="middle">{e(take)}</text>')
    if i < 3: arrow(o, CX[i] + CW + 30, CY + CH / 2)
fy = CY + CH + 62
o.append(f'<rect x="80" y="{fy}" width="{W-160}" height="130" rx="18" fill="{PAPER}" stroke="{LINE}"/>')
o.append(f'<text x="118" y="{fy+54}" font-size="30" fill="{INK}"><tspan font-weight="800" fill="{ACC[2]}">증명하는 것 </tspan>각 줄을 따라 읽는 눈 움직임이, 그 줄을 읽을 만한 시간 동안 관찰되었다.</text>')
o.append(f'<text x="118" y="{fy+102}" font-size="30" fill="{INK}"><tspan font-weight="800" fill="#b91c1c">증명하지 않는 것 </tspan>이해. 그건 1000Hz 장비로도 글만 보고 맞히는 예측을 넘지 못한다.</text>')
save(o, 's06_flow')

# ─────────────────────────── 2장: 보정 27점이 각각 하는 일
o = []
head(o, '보정 27점은 각각 다른 일을 합니다', '왜 점이 이렇게 많은가 — 점 하나하나가 서로 다른 오차를 막는다')
CY, CH, VY = 230, 560, 296
items = [
    ('20점 격자', '흰 화면 · 5×4', '눈 움직임을 화면 좌표로', '바꾸는 변환식을 구한다', '이게 없으면 측정 자체가 안 된다'),
    ('고개 돌림 3점', '가운데를 보며 5~15°', '읽다가 고개가 조금만', '움직여도 좌표가 안 밀리게', '없으면 자세가 바뀔 때 통째로 밀린다'),
    ('어두운 화면 4점', '검정 배경', '화면이 어두워 동공이', '커져도 어긋나지 않게', '없으면 어두운 문서에서 틀어진다'),
    ('첫 줄 앵커', '읽기 직전 · 쪽마다', '앉은 자세가 달라져 생긴', '밀림만 되민다 (배율은 그대로)', '실측 2~6줄의 밀림을 되돌린다'),
]
for i, (title, sub, l1, l2, take) in enumerate(items):
    x = CX[i]; card(o, x, CY, CW, CH, i); cx = x + CW / 2
    if i == 0:
        o.append(f'<rect x="{cx-130}" y="{VY}" width="260" height="150" rx="10" fill="#fff" stroke="{LINE}" stroke-width="3"/>')
        pts = []
        for r in range(4):
            cs = range(5) if r % 2 == 0 else range(4, -1, -1)
            for c in cs: pts.append((cx - 96 + c * 48, VY + 26 + r * 33))
        o.append('<path d="M' + ' L'.join(f'{a} {b}' for a, b in pts) + f'" fill="none" stroke="{ACC[i]}" stroke-width="2.5" opacity="0.4"/>')
        for a, b in pts: o.append(f'<circle cx="{a}" cy="{b}" r="8" fill="{ACC[i]}"/>')
    elif i == 1:
        o.append(f'<circle cx="{cx}" cy="{VY+80}" r="50" fill="#fff" stroke="{ACC[i]}" stroke-width="5"/>')
        o.append(f'<circle cx="{cx-17}" cy="{VY+72}" r="7" fill="{ACC[i]}"/><circle cx="{cx+17}" cy="{VY+72}" r="7" fill="{ACC[i]}"/>')
        for d in ((-1, 0), (1, 0)):
            sx = cx + d[0] * 66
            o.append(f'<path d="M{sx} {VY+60} q{d[0]*42} 20 0 40" fill="none" stroke="{ACC[i]}" stroke-width="5" stroke-linecap="round"/>')
            o.append(f'<path d="M{sx+d[0]*13} {VY+96} l{-d[0]*13} 6 l2 -16" fill="{ACC[i]}"/>')
        o.append(f'<path d="M{cx-34} {VY+14} q34 -16 68 0" fill="none" stroke="{ACC[i]}" stroke-width="5" stroke-linecap="round"/>')
        o.append(f'<path d="M{cx+28} {VY+2} l10 6 l-12 8" fill="{ACC[i]}"/>')
    elif i == 2:
        o.append(f'<rect x="{cx-120}" y="{VY+5}" width="110" height="140" rx="10" fill="#fff" stroke="{LINE}" stroke-width="3"/>')
        o.append(f'<circle cx="{cx-65}" cy="{VY+75}" r="13" fill="none" stroke="{MUTE}" stroke-width="3"/><circle cx="{cx-65}" cy="{VY+75}" r="5" fill="{MUTE}"/>')
        o.append(f'<text x="{cx-65}" y="{VY+172}" font-size="21" fill="{MUTE}" text-anchor="middle">밝을 때</text>')
        o.append(f'<rect x="{cx+10}" y="{VY+5}" width="110" height="140" rx="10" fill="#1e293b"/>')
        for a, b in ((-28, -34), (28, -34), (28, 34), (-28, 34)): o.append(f'<circle cx="{cx+65+a}" cy="{VY+75+b}" r="7" fill="{ACC[i]}"/>')
        o.append(f'<circle cx="{cx+65}" cy="{VY+75}" r="19" fill="none" stroke="#fff" stroke-width="3"/><circle cx="{cx+65}" cy="{VY+75}" r="11" fill="#fff"/>')
        o.append(f'<text x="{cx+65}" y="{VY+172}" font-size="21" fill="{MUTE}" text-anchor="middle">어두울 때</text>')
    else:
        o.append(f'<rect x="{cx-110}" y="{VY}" width="220" height="150" rx="10" fill="#fff" stroke="{LINE}" stroke-width="3"/>')
        for k in range(5): o.append(f'<rect x="{cx-86}" y="{VY+26+k*25}" width="{172 if k%2 else 132}" height="8" rx="4" fill="{LINE}"/>')
        o.append(f'<rect x="{cx-86}" y="{VY+22}" width="132" height="16" rx="8" fill="{ACC[i]}" opacity="0.25"/>')
        o.append(f'<circle cx="{cx+72}" cy="{VY+30}" r="11" fill="{ACC[i]}"/>')
        o.append(f'<path d="M{cx+120} {VY+96} l0 -48" fill="none" stroke="{ACC[i]}" stroke-width="5" stroke-linecap="round"/>')
        o.append(f'<path d="M{cx+112} {VY+56} l8 -12 l8 12" fill="{ACC[i]}"/>')
    o.append(f'<text x="{cx}" y="{CY+288}" font-size="36" font-weight="800" fill="{INK}" text-anchor="middle">{e(title)}</text>')
    o.append(f'<text x="{cx}" y="{CY+330}" font-size="24" fill="{ACC[i]}" text-anchor="middle">{e(sub)}</text>')
    o.append(f'<text x="{cx}" y="{CY+392}" font-size="26" fill="{MUTE}" text-anchor="middle">{e(l1)}</text>')
    o.append(f'<text x="{cx}" y="{CY+428}" font-size="26" fill="{MUTE}" text-anchor="middle">{e(l2)}</text>')
    o.append(f'<line x1="{x+40}" y1="{CY+470}" x2="{x+CW-40}" y2="{CY+470}" stroke="{EDGE[i]}" stroke-width="2"/>')
    o.append(f'<text x="{cx}" y="{CY+524}" font-size="24" font-weight="700" fill="{ACC[i]}" text-anchor="middle">{e(take)}</text>')
fy = CY + CH + 56
o.append(f'<rect x="80" y="{fy}" width="{W-160}" height="78" rx="18" fill="{PAPER}" stroke="{LINE}"/>')
o.append(f'<text x="118" y="{fy+50}" font-size="29" fill="{INK}">첫 번째가 없으면 <tspan font-weight="800">측정이 아예 안 되고</tspan>, 나머지 셋이 없으면 <tspan font-weight="800">읽었는데 떨어지는 일</tspan>이 생긴다.</text>')
save(o, 's13_calibration')

# ─────────────────────────── 3장: 한 줄을 '읽음'으로 보는 조건
o = []
head(o, "한 줄을 '읽었다'고 보는 조건", '눈이 줄을 따라 갔는가 — 거리와 시간, 두 가지만 본다')
DX, DY, DW = 80, 250, 1060
o.append(f'<rect x="{DX}" y="{DY}" width="{DW}" height="500" rx="20" fill="#fff" stroke="{LINE}" stroke-width="3"/>')
widths = [880, 620, 840, 300, 790, 700]
bar_x = DX + 70
seg, sweeps = [], []
for k, bw in enumerate(widths):
    by = DY + 76 + k * 68
    o.append(f'<rect x="{bar_x}" y="{by}" width="{bw}" height="20" rx="10" fill="#e2e8f0"/>')
    a, b = bar_x + 12, bar_x + bw * 0.78
    seg.append((a, b, by + 10))
    if k: sweeps.append((seg[k-1][1], seg[k-1][2], a, by + 10))
for sx, sy, ex, ey in sweeps:
    o.append(f'<line x1="{sx:.0f}" y1="{sy:.0f}" x2="{ex:.0f}" y2="{ey:.0f}" stroke="{ACC[2]}" stroke-width="3" stroke-dasharray="9 8" opacity="0.45"/>')
for a, b, y in seg:
    o.append(f'<line x1="{a:.0f}" y1="{y:.0f}" x2="{b:.0f}" y2="{y:.0f}" stroke="{ACC[2]}" stroke-width="7" stroke-linecap="round"/>')
    o.append(f'<circle cx="{a:.0f}" cy="{y:.0f}" r="8" fill="{ACC[2]}"/><circle cx="{b:.0f}" cy="{y:.0f}" r="8" fill="{ACC[2]}"/>')
o.append(f'<text x="{seg[0][1]+26:.0f}" y="{seg[0][2]+8:.0f}" font-size="23" font-weight="700" fill="{ACC[2]}">줄 끝</text>')
o.append(f'<text x="{bar_x+330}" y="{DY+76+68+44}" font-size="23" font-weight="700" fill="{ACC[2]}" opacity="0.85">점선 = 되돌림 (한 줄 끝남)</text>')
o.append(f'<text x="{DX+32}" y="{DY+48}" font-size="25" font-weight="700" fill="{MUTE}">초록 실선이 시선이 지나간 길</text>')
# 오른쪽 조건
RX, RW = 1200, 640
conds = [
    (ACC[2], '조건 1 — 거리', '그 줄에 있는 동안', '시선이 가로로 움직인 폭이', '줄 폭의 40% 이상', '한 점만 보거나 세로로 훑으면 탈락'),
    (ACC[1], '조건 2 — 시간', '그 줄에 머문 시간이', '읽을 만한 시간 이상', '(최대 2400자/분)', '휙 넘기면 탈락'),
]
cy = 250
for col, t, a, b, c, note in conds:
    o.append(f'<rect x="{RX}" y="{cy}" width="{RW}" height="212" rx="20" fill="#fff" stroke="{col}" stroke-width="3"/>')
    o.append(f'<text x="{RX+34}" y="{cy+54}" font-size="31" font-weight="800" fill="{col}">{e(t)}</text>')
    o.append(f'<text x="{RX+34}" y="{cy+100}" font-size="26" fill="{MUTE}">{e(a)}</text>')
    o.append(f'<text x="{RX+34}" y="{cy+136}" font-size="26" fill="{MUTE}">{e(b)}</text>')
    o.append(f'<text x="{RX+34}" y="{cy+168}" font-size="29" font-weight="800" fill="{INK}">{e(c)}</text>')
    o.append(f'<text x="{RX+34}" y="{cy+200}" font-size="23" fill="{col}">{e(note)}</text>')
    cy += 240
o.append(f'<rect x="{RX}" y="{cy}" width="{RW}" height="78" rx="18" fill="{INK}"/>')
o.append(f'<text x="{RX+34}" y="{cy+50}" font-size="29" font-weight="800" fill="#fff">둘 다 넘기면 그 줄은 &#8220;읽음&#8221;</text>')
fy = 846
o.append(f'<rect x="80" y="{fy}" width="{W-160}" height="78" rx="18" fill="{PAPER}" stroke="{LINE}"/>')
o.append(f'<text x="118" y="{fy+50}" font-size="29" fill="{INK}">쪽 점수 = <tspan font-weight="800">읽은 줄 ÷ 전체 줄 × 100</tspan>   ·   80점 이상이면 그 쪽 통과   ·   모든 쪽을 통과해야 봉인된다</text>')
save(o, 's07_linecheck')
