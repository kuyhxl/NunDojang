#!/usr/bin/env python3
"""중요 표시(밑줄·형광펜 주석)가 들어간 짧은 시연용 PDF를 만든다 → demo/marks.pdf

사용:  uv run --no-project --with fpdf2 python tools/make_marks_demo.py

- 글꼴은 web/vendor/fonts/NotoSansKR-Regular.ttf (OFL). tools/setup_assets.py로 받아 둔 것을 쓴다.
- 표시는 **PDF 주석**(Underline·Highlight)으로 넣는다. 미리보기·Acrobat에서 밑줄·형광펜을 친 것과 같은 형식이라
  앱(?marks=1)이 page.getAnnotations()로 읽는다. 다른 보기 프로그램에서도 보이도록 같은 자리에 선·색도 그려 둔다.
- 내용은 지어낸 예시다. 실제 의료 정보가 아니다.
- 20px 재배치(?reflow=20)에서 2쪽이 되도록 분량을 맞췄다.
"""
import os
import sys
from fpdf import FPDF

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FONT = os.path.join(ROOT, "web", "vendor", "fonts", "NotoSansKR-Regular.ttf")
OUT = os.path.join(ROOT, "demo", "marks.pdf")

# 문단. [[...]] = 밑줄, {{...}} = 형광펜
TITLE = "수면 내시경 검사 동의서 (시연용 예시)"
PARAS = [
    "이 문서는 눈도장 시연을 위해 지어낸 예시이며 실제 의료 정보가 아닙니다. 밑줄과 형광펜으로 표시한 곳이 중요한 내용입니다.",
    "1. 검사의 내용",
    "수면 내시경은 진정제를 정맥으로 투여한 뒤 내시경으로 위와 십이지장을 살펴보는 검사입니다. 검사에는 보통 10분에서 20분이 걸리고, 회복실에서 30분 이상 머문 뒤 귀가합니다.",
    "2. 검사 전 준비",
    "[[검사 전날 밤 9시 이후에는 물을 포함해 아무것도 드시면 안 됩니다.]] 복용 중인 약이 있으면 미리 알려 주십시오. 특히 혈액을 묽게 하는 약은 의사와 상의해 조절해야 합니다.",
    "3. 생길 수 있는 위험",
    "진정제 때문에 {{호흡이 느려지거나 혈압이 떨어질 수 있으며}} 드물게 응급 처치가 필요할 수 있습니다. 조직 검사를 함께 하면 출혈이 생길 수 있습니다.",
    "4. 검사 뒤 주의할 점",
    "[[검사 당일에는 운전을 하거나 기계를 다루면 안 되며 반드시 보호자와 함께 귀가해야 합니다.]] 목이 따갑거나 배가 더부룩한 느낌은 하루 안에 사라집니다.",
    "5. 동의의 철회",
    "이 동의는 [[검사를 시작하기 전까지 언제든지 불이익 없이 철회할 수 있습니다.]] 궁금한 점은 서명하기 전에 의료진에게 물어보시기 바랍니다.",
]


def segments(text):
    """'가[[나]]다{{라}}' → [('가', None), ('나', 'Underline'), ('다', None), ('라', 'Highlight')]"""
    out, i = [], 0
    while i < len(text):
        u, h = text.find("[[", i), text.find("{{", i)
        nxt = min([p for p in (u, h) if p >= 0], default=-1)
        if nxt < 0:
            out.append((text[i:], None)); break
        if nxt > i:
            out.append((text[i:nxt], None))
        kind, close = ("Underline", "]]") if nxt == u else ("Highlight", "}}")
        end = text.index(close, nxt)
        out.append((text[nxt + 2:end], kind))
        i = end + 2
    return out


def main():
    if not os.path.exists(FONT):
        sys.exit("글꼴이 없습니다. 먼저 tools/setup_assets.py 를 실행하세요.")
    pdf = FPDF(format="A4", unit="pt")
    pdf.set_auto_page_break(False)
    pdf.add_page()
    pdf.add_font("NotoKR", "", FONT)
    left, right, y = 72, 595 - 72, 96
    width = right - left

    pdf.set_font("NotoKR", size=16)
    pdf.text(left, y, TITLE)
    y += 34

    size, lead = 11, 19
    marks = 0
    for para in PARAS:
        heading = para[:2] in ("1.", "2.", "3.", "4.", "5.")
        pdf.set_font("NotoKR", size=12.5 if heading else size)
        if heading:
            y += 8
            pdf.text(left, y, para)
            y += lead + 2
            continue
        # 낱말 단위로 줄을 나누되, 낱말마다 표시 종류를 들고 간다
        words = []
        for seg, kind in segments(para):
            parts = seg.split(" ")
            for j, w in enumerate(parts):
                if w:
                    words.append((w, kind))
                if j < len(parts) - 1:
                    words.append((" ", kind if parts[j + 1] else None))   # 표시 안의 띄어쓰기는 표시에 포함
        line, line_w = [], 0.0
        lines = []
        for w, kind in words:
            ww = pdf.get_string_width(w)
            if w != " " and line and line_w + ww > width:
                while line and line[-1][0] == " ":
                    line.pop()
                lines.append(line); line, line_w = [], 0.0
            if w == " " and not line:
                continue
            line.append((w, kind)); line_w += ww
        if line:
            lines.append(line)
        for ln in lines:
            x = left
            # 같은 종류가 이어진 구간을 하나로 묶어 주석 하나로 만든다
            run_kind, run_x0 = None, None
            def flush(x_end):
                nonlocal run_kind, run_x0, marks
                if run_kind is None:
                    return
                top, bottom = y - size * 0.86, y + size * 0.28      # 글자 상자 (위에서부터 잰 pt)
                x0, x1 = run_x0, x_end
                if run_kind == "Highlight":
                    pdf.set_fill_color(255, 236, 130); pdf.rect(x0, top, x1 - x0, bottom - top, style="F")
                else:
                    pdf.set_draw_color(20, 20, 20); pdf.set_line_width(0.9); pdf.line(x0, bottom - 0.6, x1, bottom - 0.6)
                # quad_points는 PDF 쪽 좌표(아래에서부터 잰 pt)로 줘야 한다 — fpdf2가 뒤집어 주지 않는다.
                # 순서: 왼쪽 위, 오른쪽 위, 왼쪽 아래, 오른쪽 아래
                H = pdf.h
                pdf.add_text_markup_annotation(run_kind, "눈도장 중요 표시",
                                               quad_points=(x0, H - top, x1, H - top, x0, H - bottom, x1, H - bottom))
                marks += 1
                run_kind, run_x0 = None, None
            placed = []
            for w, kind in ln:
                ww = pdf.get_string_width(w)
                if kind != run_kind:
                    flush(x)
                    if kind is not None:
                        run_kind, run_x0 = kind, x
                placed.append((x, w))
                x += ww
            flush(x)
            pdf.set_text_color(20, 20, 20)
            for px, w in placed:        # 형광펜 색을 먼저 칠했으므로 글자는 그 위에 온다
                if w != " ":
                    pdf.text(px, y, w)
            y += lead
        y += 6
    pdf.set_title("수면 내시경 검사 동의서 (눈도장 시연용 예시)")
    pdf.output(OUT)
    print(f"만듦: {os.path.relpath(OUT, ROOT)} — 주석 {marks}개, 마지막 줄 y={y:.0f}pt (A4 높이 842)")


if __name__ == "__main__":
    main()
