#!/usr/bin/env python3
"""눈도장 로컬 정적 서버 — web/ 폴더만 제공한다.

사용: 프로젝트 루트에서  python3 tools/serve_local.py [--port 8000] [--host 127.0.0.1]
종료: Ctrl+C

- Python 3 표준 라이브러리만 사용.
- .mjs/.js → text/javascript, .wasm → application/wasm, .json → application/json, .task → application/octet-stream
- 캐시 끔 (Cache-Control: no-store) → 코드 수정 후 새로고침만 하면 됨.
- analysis/, docs/ 등 web 밖은 제공하지 않음.
이 서버는 분석 모델을 실행하지 않는다. HTML·JS·모델·PDF worker를 브라우저에 주는 개발·시연용 도구다.
- 앱을 ?gazelog=1 로 열면 POST /__gazelog 로 받은 시선 수치를 logs/gaze/ 에 CSV로 쌓는다 (같은 출처 요청만).
"""
import argparse
import csv
import json
import os
import re
import socket
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web"))
GAZE_LOG_DIR = os.path.abspath(os.path.join(ROOT, "..", "logs", "gaze"))
GAZE_LOG_PATH = "/__gazelog"
GAZE_LOG_MAX_BYTES = 4 * 1024 * 1024
GAZE_SESSION_RE = re.compile(r"^\d{8}-\d{6}$")
gaze_log_lock = threading.Lock()


def is_scalar_row(row):
    return isinstance(row, list) and all(
        v is None or isinstance(v, (int, float)) or (isinstance(v, str) and len(v) <= 64) for v in row
    )


def write_gaze_log(body):
    """요청 본문을 기록한다. 형식이 맞지 않으면 ValueError."""
    session = body.get("session")
    if not isinstance(session, str) or not GAZE_SESSION_RE.match(session):
        raise ValueError("bad session")
    os.makedirs(GAZE_LOG_DIR, exist_ok=True)
    if "meta" in body:
        with gaze_log_lock, open(os.path.join(GAZE_LOG_DIR, f"{session}.meta.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(body["meta"], ensure_ascii=False) + "\n")
        return
    columns, rows = body.get("columns"), body.get("rows")
    if not is_scalar_row(columns) or not isinstance(rows, list) or not all(is_scalar_row(r) and len(r) == len(columns) for r in rows):
        raise ValueError("bad rows")
    path = os.path.join(GAZE_LOG_DIR, f"{session}.csv")
    with gaze_log_lock:
        is_new = not os.path.exists(path)
        with open(path, "a", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            if is_new:
                writer.writerow(columns)
            writer.writerows(rows)


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

    def do_POST(self):
        if urlsplit(self.path).path != GAZE_LOG_PATH:
            self.send_error(404)
            return
        # 다른 웹사이트가 브라우저를 통해 이 주소로 쓰지 못하게, 같은 출처의 JSON 요청만 받는다.
        if urlsplit(self.headers.get("Origin", "")).netloc != self.headers.get("Host"):
            self.send_error(403)
            return
        length = int(self.headers.get("Content-Length") or 0)
        if self.headers.get("Content-Type") != "application/json" or not 0 < length <= GAZE_LOG_MAX_BYTES:
            self.send_error(400)
            return
        try:
            write_gaze_log(json.loads(self.rfile.read(length)))
        except (ValueError, AttributeError):
            self.send_error(400)
            return
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        message = fmt % args
        if GAZE_LOG_PATH in message and " 204 " in message:
            return                      # 1초마다 오는 정상 기록은 화면을 채우지 않게 한다
        sys.stdout.write("%s - %s\n" % (self.address_string(), message))


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
