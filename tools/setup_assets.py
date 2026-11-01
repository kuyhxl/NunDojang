#!/usr/bin/env python3
"""외부 자산을 고정 버전으로 web/vendor, web/models 에 내려받는다 (처음 한 번).

사용: 프로젝트 루트에서  python3 tools/setup_assets.py
      --check  : 다운로드 없이 존재 여부만 확인

버전은 docs/dependencies.md 와 같아야 한다. 바꾸려면 공통 변경 제안.
unpkg/jsdelivr의 실제 파일 경로가 버전에 따라 다를 수 있다 — 실패하면 아래 표의 URL을 브라우저로 열어 수동으로 받고 같은 위치에 둔다.
"""
import argparse
import os
import sys
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEB = os.path.join(ROOT, "web")

MEDIAPIPE_VER = "0.10.32"
PDFJS_VER = "4.10.38"
PDFLIB_VER = "1.17.1"

ASSETS = [
    # (저장 경로, URL)
    ("vendor/mediapipe/vision_bundle.mjs",
     f"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@{MEDIAPIPE_VER}/vision_bundle.mjs"),
    ("vendor/mediapipe/wasm/vision_wasm_internal.js",
     f"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@{MEDIAPIPE_VER}/wasm/vision_wasm_internal.js"),
    ("vendor/mediapipe/wasm/vision_wasm_internal.wasm",
     f"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@{MEDIAPIPE_VER}/wasm/vision_wasm_internal.wasm"),
    ("vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js",
     f"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@{MEDIAPIPE_VER}/wasm/vision_wasm_nosimd_internal.js"),
    ("vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
     f"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@{MEDIAPIPE_VER}/wasm/vision_wasm_nosimd_internal.wasm"),
    ("models/face_landmarker.task",
     "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"),
    ("vendor/pdfjs/pdf.mjs",
     f"https://cdn.jsdelivr.net/npm/pdfjs-dist@{PDFJS_VER}/build/pdf.mjs"),
    ("vendor/pdfjs/pdf.worker.mjs",
     f"https://cdn.jsdelivr.net/npm/pdfjs-dist@{PDFJS_VER}/build/pdf.worker.mjs"),
    ("vendor/pdf-lib/pdf-lib.esm.min.js",
     f"https://cdn.jsdelivr.net/npm/pdf-lib@{PDFLIB_VER}/dist/pdf-lib.esm.min.js"),
]

# 한글 스탬프용 폰트 (OFL). 없으면 영문 스탬프로 대체되므로 실패해도 치명적이지 않음.
FONT = ("vendor/fonts/NotoSansKR-Regular.ttf",
        "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf")


def fetch(rel, url):
    dst = os.path.join(WEB, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        print(f"  있음   {rel}")
        return True
    print(f"  받는 중 {rel}\n          {url}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "nundojang-setup/0.1"})
        with urllib.request.urlopen(req, timeout=60) as r, open(dst, "wb") as f:
            f.write(r.read())
        # 404를 HTML로 받는 경우를 걸러낸다
        with open(dst, "rb") as f:
            head = f.read(64).lower()
        if b"<!doctype html" in head or b"<html" in head:
            os.remove(dst)
            print(f"  [실패] HTML이 내려왔습니다 (경로가 바뀐 듯): {rel}")
            return False
        print(f"  완료   {rel} ({os.path.getsize(dst) // 1024} KB)")
        return True
    except Exception as e:  # noqa: BLE001
        if os.path.exists(dst):
            os.remove(dst)
        print(f"  [실패] {rel}: {e}")
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    print(f"web 폴더: {WEB}")
    ok = True
    for rel, url in ASSETS + [FONT]:
        if args.check:
            exists = os.path.exists(os.path.join(WEB, rel))
            print(f"  {'있음' if exists else '없음'}   {rel}")
            ok = ok and (exists or rel == FONT[0])
        else:
            got = fetch(rel, url)
            if rel != FONT[0]:
                ok = ok and got
    if not ok:
        print("\n일부 자산이 없습니다. docs/dependencies.md의 수동 다운로드 안내를 보세요.")
        sys.exit(1)
    print("\n자산 준비 완료. 이제  python3 tools/serve_local.py  를 실행하세요.")


if __name__ == "__main__":
    main()
