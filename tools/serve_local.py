#!/usr/bin/env python3
"""눈도장 로컬 정적 서버 — web/ 폴더만 제공한다.

사용: 프로젝트 루트에서  python3 tools/serve_local.py [--port 8000] [--host 127.0.0.1]
종료: Ctrl+C

- Python 3 표준 라이브러리만 사용.
- .mjs/.js → text/javascript, .wasm → application/wasm, .json → application/json, .task → application/octet-stream
- 캐시 끔 (Cache-Control: no-store) → 코드 수정 후 새로고침만 하면 됨.
- analysis/, docs/ 등 web 밖은 제공하지 않음.
이 서버는 분석 모델을 실행하지 않는다. HTML·JS·모델·PDF worker를 브라우저에 주는 개발·시연용 도구다.
"""
import argparse
import os
import socket
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web"))


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".json": "application/json",
        ".task": "application/octet-stream",
        ".pdf": "application/pdf",
        ".ttf": "font/ttf",
        ".otf": "font/otf",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    ap = argparse.ArgumentParser(description="눈도장 로컬 서버")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()

    if not os.path.isfile(os.path.join(ROOT, "index.html")):
        print(f"[오류] web/index.html 을 찾을 수 없습니다: {ROOT}")
        sys.exit(1)

    handler = partial(Handler, directory=ROOT)
    try:
        httpd = ThreadingHTTPServer((args.host, args.port), handler)
    except OSError as e:
        print(f"[오류] {args.host}:{args.port} 를 열 수 없습니다 ({e}).")
        print(f"       다른 프로그램이 쓰고 있다면  python3 tools/serve_local.py --port {args.port + 1}  로 실행하세요.")
        sys.exit(1)

    url = f"http://localhost:{args.port}/"
    print(f"눈도장 로컬 서버 시작 — 제공 폴더: {ROOT}")
    print(f"  앱:        {url}")
    print(f"  측정 점검: {url}dev/measurement.html")
    print(f"  통합 점검: {url}dev/integration.html")
    missing = [p for p in ("vendor/pdfjs/pdf.mjs", "vendor/mediapipe/vision_bundle.mjs", "models/face_landmarker.task")
               if not os.path.exists(os.path.join(ROOT, p))]
    if missing:
        print("  [주의] 아직 없는 자산:", ", ".join(missing))
        print("         python3 tools/setup_assets.py 를 먼저 실행하세요.")
    print("종료: Ctrl+C")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n서버 종료")


if __name__ == "__main__":
    main()
