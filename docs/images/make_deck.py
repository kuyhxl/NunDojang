# 발표 슬라이드 — docs/presentation_script.md 대본에 맞춘 10장. 16:9, 멀리서 읽히게.
import html
W, H = 1920, 1080
OUT = '/Users/ozzing727/Desktop/Developer/NunDojang/docs/images'
FONT = "'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic','Helvetica Neue',sans-serif"
INK, MUTE, LINE, PAPER = '#0f172a', '#64748b', '#cbd5e1', '#f8fafc'
BLUE, VIOLET, GREEN, AMBER, RED = '#0284c7', '#7c3aed', '#059669', '#d97706', '#b91c1c'
e = html.escape

def svg(body, bg='#ffffff'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
            f'font-family="{FONT}"><rect width="{W}" height="{H}" fill="{bg}"/>' + '\n'.join(body) + '</svg>')

def save(name, body, bg='#ffffff'):
    open(f'{OUT}/{name}.svg', 'w').write(svg(body, bg))
    print(f'{name}.svg')

def head(o, title, sub=None, color=INK):
    o.append(f'<text x="80" y="104" font-size="54" font-weight="800" fill="{color}">{e(title)}</text>')
    if sub: o.append(f'<text x="80" y="152" font-size="27" fill="{MUTE}">{e(sub)}</text>')

def card(o, x, y, w, h, acc, tint, edge):
    o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="22" fill="{tint}" stroke="{edge}" stroke-width="2"/>')
    o.append(f'<rect x="{x}" y="{y}" width="{w}" height="8" rx="4" fill="{acc}"/>')

def lines(o, xs, y0, items, size, fill, lh=None, anchor='start', weight='400'):
    lh = lh or size + 14
    for i, t in enumerate(items):
        o.append(f'<text x="{xs}" y="{y0 + i*lh}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{e(t)}</text>')

# ───────────────────────────── 1. 표지
o = []
o.append(f'<rect width="{W}" height="{H}" fill="#0b1220"/>')
o.append(f'<text x="{W/2}" y="440" font-size="128" font-weight="800" fill="#ffffff" text-anchor="middle">눈도장</text>')
o.append(f'<text x="{W/2}" y="512" font-size="38" fill="#7dd3fc" text-anchor="middle" letter-spacing="6">ReadSeal</text>')
o.append(f'<line x1="{W/2-200}" y1="580" x2="{W/2+200}" y2="580" stroke="#334155" stroke-width="2"/>')
o.append(f'<text x="{W/2}" y="660" font-size="44" font-weight="700" fill="#e2e8f0" text-anchor="middle">읽었다는 것을 증명합니다</text>')
o.append(f'<text x="{W/2}" y="940" font-size="28" fill="#94a3b8" text-anchor="middle">박민서 · 이규태 · 황찬혁</text>')
save('s01_title', o, '#0b1220')

# ───────────────────────────── 2. Hook — 안내문
o = []
o.append(f'<image href="hook_notice.png" x="80" y="40" height="1000" preserveAspectRatio="xMidYMid meet"/>')
RX = 840
o.append(f'<text x="{RX}" y="330" font-size="52" font-weight="800" fill="{INK}">2021년,</text>')
o.append(f'<text x="{RX}" y="402" font-size="52" font-weight="800" fill="{INK}">이 안내문 받으셨을 겁니다.</text>')
o.append(f'<line x1="{RX}" y1="470" x2="{RX+700}" y2="470" stroke="{LINE}" stroke-width="2"/>')
o.append(f'<text x="{RX}" y="572" font-size="60" font-weight="800" fill="{RED}">혹시 내용이</text>')
o.append(f'<text x="{RX}" y="650" font-size="60" font-weight="800" fill="{RED}">기억나시나요?</text>')
o.append(f'<text x="{RX}" y="760" font-size="26" fill="{MUTE}">질병관리청 · 교육부 · 코로나19 예방접종 안내문(학생용)</text>')
save('s02_hook', o)

# ───────────────────────────── 3. Hook — 질문과 답
o = []
head(o, '세 가지만 여쭤보겠습니다', '전부 이 안내문에 적혀 있던 내용입니다')
QS = [('접종 후 몇 분 동안', '접종기관에 머물러야 할까요?', '15~30분', BLUE),
      ('그 뒤로 몇 시간을', '더 관찰해야 할까요?', '3시간', VIOLET),
      ('이상반응이 의심되면', '어디에 전화할까요?', '1339', AMBER)]
CW, CX = 530, [80, 695, 1310]
for i, (q1, q2, ans, acc) in enumerate(QS):
    x = CX[i]; card(o, x, 240, CW, 540, acc, '#f8fafc', LINE)
    cx = x + CW/2
    o.append(f'<text x="{cx}" y="330" font-size="31" fill="{MUTE}" text-anchor="middle">{e(q1)}</text>')
    o.append(f'<text x="{cx}" y="374" font-size="31" fill="{MUTE}" text-anchor="middle">{e(q2)}</text>')
    o.append(f'<line x1="{x+60}" y1="430" x2="{x+CW-60}" y2="430" stroke="{LINE}" stroke-width="2"/>')
    o.append(f'<text x="{cx}" y="590" font-size="84" font-weight="800" fill="{acc}" text-anchor="middle">{e(ans)}</text>')
    o.append(f'<text x="{cx}" y="700" font-size="24" fill="{MUTE}" text-anchor="middle">안내문에 적혀 있던 내용</text>')
o.append(f'<rect x="80" y="840" width="{W-160}" height="150" rx="18" fill="#fef2f2" stroke="#fecaca" stroke-width="2"/>')
o.append(f'<text x="{W/2}" y="906" font-size="36" fill="{INK}" text-anchor="middle">안전에 관한 내용이었습니다.</text>')
o.append(f'<text x="{W/2}" y="958" font-size="36" font-weight="800" fill="{RED}" text-anchor="middle">그리고 우리는 전부 “읽었습니다”에 체크했습니다.</text>')
save('s03_hook_answers', o)

# ───────────────────────────── 4. 문제
o = []
head(o, '문제', '체크박스는 읽었다는 증거가 아닙니다')
# 왼쪽: 체크박스
o.append(f'<rect x="80" y="240" width="820" height="300" rx="22" fill="{PAPER}" stroke="{LINE}" stroke-width="3"/>')
o.append(f'<rect x="150" y="340" width="58" height="58" rx="10" fill="#fff" stroke="{MUTE}" stroke-width="4"/>')
o.append(f'<path d="M163 369 l16 18 l31 -36" fill="none" stroke="{MUTE}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>')
o.append(f'<text x="236" y="388" font-size="40" font-weight="700" fill="{MUTE}">위 내용을 모두 읽었습니다</text>')
o.append(f'<text x="490" y="482" font-size="36" font-weight="800" fill="{RED}" text-anchor="middle">아무것도 증명하지 않습니다</text>')
TAGS = ['의료 동의서', '약관', '보험', '근로계약서']
for i, t in enumerate(TAGS):
    x = 100 + (i % 2) * 400; y = 580 + (i // 2) * 86
    o.append(f'<rect x="{x}" y="{y}" width="370" height="68" rx="34" fill="#fff" stroke="{LINE}" stroke-width="2"/>')
    o.append(f'<text x="{x+185}" y="{y+45}" font-size="28" fill="{MUTE}" text-anchor="middle">{e(t)}</text>')
# 오른쪽: 미시간대 연구
o.append(f'<rect x="960" y="240" width="880" height="508" rx="22" fill="#fef2f2" stroke="#fecaca" stroke-width="3"/>')
o.append(f'<text x="1400" y="300" font-size="26" fill="{MUTE}" text-anchor="middle">온라인 동의서 1,209명을 추적한 연구</text>')
ROWS = [('동의서 분량', '2,833단어', INK), ('다 읽으려면', '9분 30초', INK),
        ('실제 동의까지', '53초', RED)]
for i, (k, v, col) in enumerate(ROWS):
    y = 372 + i * 76
    o.append(f'<text x="1010" y="{y}" font-size="30" fill="{MUTE}">{e(k)}</text>')
    o.append(f'<text x="1790" y="{y}" font-size="44" font-weight="800" fill="{col}" text-anchor="end">{e(v)}</text>')
o.append(f'<line x1="1010" y1="628" x2="1790" y2="628" stroke="#fecaca" stroke-width="2"/>')
o.append(f'<text x="1400" y="676" font-size="28" fill="{INK}" text-anchor="middle">문서 끝에 숨겨 둔 링크를 찾은 사람</text>')
o.append(f'<text x="1400" y="730" font-size="52" font-weight="800" fill="{RED}" text-anchor="middle">2.5%</text>')
o.append(f'<text x="960" y="796" font-size="22" fill="{MUTE}">Desch 외 (2011), Annals of Internal Medicine 155(5):316–322</text>')
o.append(f'<rect x="80" y="860" width="{W-160}" height="110" rx="18" fill="#0f172a"/>')
o.append(f'<text x="{W/2}" y="906" font-size="36" fill="#e2e8f0" text-anchor="middle">읽었는지 알아내려고 <tspan font-weight="800" fill="#fff">문서에 함정을 파야 했습니다.</tspan></text>')
o.append(f'<text x="{W/2}" y="950" font-size="32" font-weight="800" fill="#7dd3fc" text-anchor="middle">저희는 그걸 직접 재기로 했습니다.</text>')
save('s04_problem', o)

# ───────────────────────────── 5. 팀 역할
o = []
head(o, '팀 역할', '세 명이 측정 · 분석 · 통합을 나눠 맡았습니다')
TEAM = [('A', '박민서', '측정 · 보정', ['웹캠 영상에서', '시선 좌표를 뽑는다'], 'eyeTracker.js · movementDetector.js', BLUE, '#eff6ff', '#bfdbfe'),
        ('B', '이규태', '분석', ['공개 데이터에서 읽기 모드를', '가를 수 있는지 확인한다'], 'WebQAmGaze · OneStop · 로지스틱 회귀', VIOLET, '#f5f3ff', '#ddd6fe'),
        ('C', '황찬혁', '통합', ['앱 · 재배치 · 점수 정책', '· 봉인 발급'], 'web/ 전체 · tools/ · docs/', GREEN, '#ecfdf5', '#a7f3d0')]
for i, (tag, name, role, body, files, acc, tint, edge) in enumerate(TEAM):
    x = CX[i]; card(o, x, 250, CW, 560, acc, tint, edge)
    cx = x + CW/2
    o.append(f'<circle cx="{cx}" cy="360" r="46" fill="{acc}"/>')
    o.append(f'<text x="{cx}" y="378" font-size="46" font-weight="800" fill="#fff" text-anchor="middle">{tag}</text>')
    o.append(f'<text x="{cx}" y="470" font-size="46" font-weight="800" fill="{INK}" text-anchor="middle">{e(name)}</text>')
    o.append(f'<text x="{cx}" y="522" font-size="30" font-weight="700" fill="{acc}" text-anchor="middle">{e(role)}</text>')
    lines(o, cx, 596, body, 28, MUTE, 40, 'middle')
    o.append(f'<line x1="{x+50}" y1="700" x2="{x+CW-50}" y2="700" stroke="{edge}" stroke-width="2"/>')
    o.append(f'<text x="{cx}" y="752" font-size="22" fill="{MUTE}" text-anchor="middle">{e(files)}</text>')
save('s05_team', o)

# ───────────────────────────── 8. 근거
o = []
head(o, '근거', '저희가 잰 읽기 속도가 문헌이 말하는 읽기 속도와 맞습니다')
o.append(f'<rect x="80" y="250" width="820" height="440" rx="22" fill="#f8fafc" stroke="{LINE}" stroke-width="2"/>')
o.append(f'<text x="490" y="330" font-size="30" fill="{MUTE}" text-anchor="middle">Brysbaert (2019) · 메타분석</text>')
o.append(f'<text x="490" y="392" font-size="30" fill="{INK}" text-anchor="middle">비문학 묵독 속도</text>')
o.append(f'<text x="490" y="552" font-size="150" font-weight="800" fill="{VIOLET}" text-anchor="middle">238</text>')
o.append(f'<text x="490" y="620" font-size="32" fill="{MUTE}" text-anchor="middle">단어 / 분</text>')
o.append(f'<rect x="1020" y="250" width="820" height="440" rx="22" fill="#ecfdf5" stroke="#a7f3d0" stroke-width="2"/>')
o.append(f'<text x="1430" y="330" font-size="30" fill="{MUTE}" text-anchor="middle">눈도장 실측 · 성실하게 읽은 쪽 47개</text>')
o.append(f'<text x="1430" y="392" font-size="30" fill="{INK}" text-anchor="middle">분당 223 ~ 696자 중 최대값</text>')
o.append(f'<text x="1430" y="552" font-size="150" font-weight="800" fill="{GREEN}" text-anchor="middle">232</text>')
o.append(f'<text x="1430" y="620" font-size="32" fill="{MUTE}" text-anchor="middle">어절 / 분</text>')
o.append(f'<text x="1430" y="662" font-size="22" fill="{MUTE}" text-anchor="middle">696자 ÷ 3 (한글 평균 3자/어절)</text>')
o.append(f'<text x="960" y="470" font-size="54" font-weight="800" fill="{MUTE}" text-anchor="middle">≈</text>')
o.append(f'<rect x="80" y="730" width="{W-160}" height="100" rx="18" fill="#0f172a"/>')
o.append(f'<text x="{W/2}" y="795" font-size="40" font-weight="800" fill="#fff" text-anchor="middle">저희가 재고 있는 것이 진짜 읽기라는 뜻입니다</text>')
o.append(f'<text x="80" y="912" font-size="29" fill="{INK}"><tspan font-weight="800">Rayner 외 (2016)</tspan>  묵독 200~400 wpm. <tspan font-weight="800">훑기는 그 2~4배이고 이해도가 떨어진다</tspan> — 저희가 잡으려는 구간이 정확히 거기입니다.</text>')
o.append(f'<text x="80" y="962" font-size="29" fill="{INK}"><tspan font-weight="800">Shubi 외 (2024, EMNLP)</tspan>  1000Hz 장비로 이해도 예측 59.2% — 글만 보고 맞히는 예측 58.7%.</text>')
save('s08_evidence', o)

# ───────────────────────────── 9. 시연
o = []
o.append(f'<rect width="{W}" height="{H}" fill="#0b1220"/>')
o.append(f'<text x="{W/2}" y="300" font-size="150" font-weight="800" fill="#ffffff" text-anchor="middle">시연</text>')
STEPS = [('1', '문서 열기', '스캔 이미지 PDF를 글자 인식으로'), ('2', '성실하게 읽기', '줄마다 읽음 표식이 찬다'),
         ('3', '일부러 훑기', '경고가 뜬다 — 점수는 깎지 않는다'), ('4', '봉인 발급', '쪽별 점수와 보정 품질을 문서에')]
for i, (n, t, s) in enumerate(STEPS):
    y = 440 + i*140
    o.append(f'<circle cx="430" cy="{y-14}" r="34" fill="#1e293b" stroke="#475569" stroke-width="2"/>')
    o.append(f'<text x="430" y="{y-2}" font-size="34" font-weight="800" fill="#7dd3fc" text-anchor="middle">{n}</text>')
    o.append(f'<text x="510" y="{y-24}" font-size="42" font-weight="700" fill="#e2e8f0">{e(t)}</text>')
    o.append(f'<text x="510" y="{y+22}" font-size="28" fill="#94a3b8">{e(s)}</text>')
save('s09_demo', o, '#0b1220')

# ───────────────────────────── 10. 한계 세 가지
o = []
head(o, '한계 세 가지', '그냥 한계로 두지 않고, 어디로 갈지까지 말씀드리겠습니다')
LIM = [('1', '안경', ['안경 쓰고는 한 번도', '테스트해 보지 않았습니다.', '반사가 홍채 검출을', '방해할 수 있습니다.'],
        '보정이 이미 자기 오차를 안다 →\n기준 미달이면 거부하는 관문', BLUE, '#eff6ff', '#bfdbfe'),
       ('2', '윗부분만 읽어도 통과', ['제목과 첫 줄만 읽었는데', '95.3%가 나왔습니다.', '세로 오차가 줄 간격의 3배라', '몇 번째 줄인지 모릅니다.'],
        '단기 속도 경고(완료) → 중기 아이폰\nTrueDepth 적외선 → 장기 글·시선 결합', RED, '#fef2f2', '#fecaca'),
       ('3', '이해는 판별 못 함', ['눈으로 읽은 건 압니다.', '이해했는지는 모릅니다.', '1000Hz 장비도 59.2% —', '글만 보면 58.7%입니다.'],
        '이해 대신 읽기 모드를 가른다\nB가 공개 데이터로 65.5% (기준선 50%)', VIOLET, '#f5f3ff', '#ddd6fe')]
for i, (n, title, body, fix, acc, tint, edge) in enumerate(LIM):
    x = CX[i]; card(o, x, 230, CW, 610, acc, tint, edge)
    o.append(f'<text x="{x+34}" y="300" font-size="36" font-weight="800" fill="{acc}" opacity="0.5">{n}</text>')
    o.append(f'<text x="{x+CW/2}" y="372" font-size="37" font-weight="800" fill="{INK}" text-anchor="middle">{e(title)}</text>')
    lines(o, x+34, 444, body, 27, MUTE, 40)
    o.append(f'<line x1="{x+34}" y1="618" x2="{x+CW-34}" y2="618" stroke="{edge}" stroke-width="2"/>')
    o.append(f'<text x="{x+34}" y="668" font-size="25" font-weight="800" fill="{acc}">개선 방향</text>')
    lines(o, x+34, 714, fix.split('\n'), 25, acc, 36)
o.append(f'<text x="{W/2}" y="920" font-size="34" font-weight="800" fill="{INK}" text-anchor="middle">거부할 줄 아는 것이 틀린 답을 내는 것보다 낫습니다</text>')
save('s10_limits', o)

# ───────────────────────────── 11. 한계 ② 상세
o = []
head(o, '가장 큰 한계 — 저희가 직접 깨 봤습니다', '일부러 훑어서 기록을 남기고, 우리 알고리즘으로 채점했습니다', RED)
o.append(f'<rect x="80" y="230" width="880" height="430" rx="22" fill="#fef2f2" stroke="#fecaca" stroke-width="3"/>')
o.append(f'<text x="520" y="310" font-size="32" fill="{MUTE}" text-anchor="middle">제목과 문단 첫 줄만 읽었더니</text>')
o.append(f'<text x="520" y="486" font-size="170" font-weight="800" fill="{RED}" text-anchor="middle">95.3%</text>')
o.append(f'<text x="520" y="562" font-size="34" font-weight="800" fill="{INK}" text-anchor="middle">성실하게 읽은 기록 5개 중</text>')
o.append(f'<text x="520" y="612" font-size="34" font-weight="800" fill="{INK}" text-anchor="middle">4개보다 높습니다</text>')
o.append(f'<rect x="1020" y="230" width="820" height="430" rx="22" fill="{PAPER}" stroke="{LINE}" stroke-width="2"/>')
o.append(f'<text x="1060" y="300" font-size="30" font-weight="800" fill="{INK}">왜 그런가 — 웹캠의 한계</text>')
lines(o, 1060, 364, ['문단 첫 줄만 읽는 사람의 눈 움직임은', '진짜 읽기 움직임입니다.'], 28, MUTE, 40)
o.append(f'<rect x="1060" y="434" width="740" height="110" rx="12" fill="#fff" stroke="{LINE}"/>')
o.append(f'<text x="1430" y="478" font-size="29" fill="{INK}" text-anchor="middle">보정 후에도 세로 오차 95~121px</text>')
o.append(f'<text x="1430" y="520" font-size="29" font-weight="800" fill="{RED}" text-anchor="middle">= 줄 간격(40px)의 2.4~3.0배</text>')
lines(o, 1060, 596, ['몇 번째 줄을 보는지 모릅니다.', '문턱 조정으로 될 문제가 아닙니다.'], 28, MUTE, 40)
FIX = [('단기 — 이미 넣음', '속도·가로 폭 경고. 빠르게 쓸거나 글 밖을 보는 건 잡는다', GREEN, '#ecfdf5', '#a7f3d0'),
       ('중기 — 아이폰 TrueDepth', '적외선으로 깊이를 재니 조명·안경에 강하다. 세로 정확도가 오르면 줄을 짚을 수 있다 (아직 가설)', AMBER, '#fffbeb', '#fde68a'),
       ('장기 — 글과 시선 결합', '어려운 문장에서 더 오래 머무는가', VIOLET, '#f5f3ff', '#ddd6fe')]
for i, (t, s, acc, tint, edge) in enumerate(FIX):
    x = CX[i]; y = 710
    o.append(f'<rect x="{x}" y="{y}" width="{CW}" height="260" rx="18" fill="{tint}" stroke="{edge}" stroke-width="2"/>')
    o.append(f'<rect x="{x}" y="{y}" width="{CW}" height="7" rx="3.5" fill="{acc}"/>')
    o.append(f'<text x="{x+30}" y="{y+68}" font-size="29" font-weight="800" fill="{acc}">{e(t)}</text>')
    # 긴 설명은 글자 수로 끊는다 (한 줄 약 24자)
    words, cur, out = s.split(' '), '', []
    for w in words:
        if len(cur) + len(w) > 23: out.append(cur.strip()); cur = w + ' '
        else: cur += w + ' '
    if cur.strip(): out.append(cur.strip())
    lines(o, x+30, y+120, out[:4], 25, MUTE, 38)
save('s11_limit_detail', o)

# ───────────────────────────── 12. 마무리
o = []
o.append(f'<rect width="{W}" height="{H}" fill="#0b1220"/>')
o.append(f'<text x="160" y="300" font-size="34" font-weight="800" fill="#f87171">증명하지 않는 것</text>')
o.append(f'<text x="160" y="372" font-size="52" fill="#cbd5e1">이해했다.</text>')
o.append(f'<line x1="160" y1="440" x2="{W-160}" y2="440" stroke="#334155" stroke-width="2"/>')
o.append(f'<text x="160" y="540" font-size="34" font-weight="800" fill="#4ade80">증명하는 것</text>')
o.append(f'<text x="160" y="622" font-size="52" font-weight="800" fill="#ffffff">이 문서의 각 줄을 따라 읽는 눈 움직임이,</text>')
o.append(f'<text x="160" y="694" font-size="52" font-weight="800" fill="#ffffff">그 줄을 읽을 만한 시간 동안 관찰되었다.</text>')
o.append(f'<rect x="160" y="800" width="{W-320}" height="110" rx="18" fill="#1e293b"/>')
o.append(f'<text x="{W/2}" y="868" font-size="38" font-weight="800" fill="#7dd3fc" text-anchor="middle">그리고 그 한계를 저희가 직접 깨서 확인했습니다</text>')
save('s12_closing', o, '#0b1220')
