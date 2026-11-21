#!/usr/bin/env python3
"""외부 자산을 고정 버전으로 web/vendor, web/models 에 내려받는다 (처음 한 번).

사용: 프로젝트 루트에서  python3 tools/setup_assets.py
      --check  : 다운로드 없이 존재 여부만 확인

버전은 docs/dependencies.md 와 같아야 한다. 바꾸려면 공통 변경 제안.
unpkg/jsdelivr의 실제 파일 경로가 버전에 따라 다를 수 있다 — 실패하면 아래 표의 URL을 브라우저로 열어 수동으로 받고 같은 위치에 둔다.
"""
import argparse
import hashlib
import os
import sys
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEB = os.path.join(ROOT, "web")

MEDIAPIPE_VER = "0.10.32"
PDFJS_VER = "4.10.38"
PDFLIB_VER = "1.17.1"
TESSERACT_VER = "5.1.1"        # tesseract.js (본체·일꾼)
TESSERACT_CORE_VER = "5.1.1"   # tesseract.js-core (wasm). lstm판만 받는다 (엔진 1 = LSTM 전용)
TESSDATA_VER = "4.0.0"         # 인식 데이터
TFJS_VER = "4.22.0"            # 시선 모형(BlazeGaze)을 돌린다
# WebEyeTrack(MIT)의 고정 커밋. 코드는 web/modules/webEyeTrackMath.js 로 옮겨 적었고, 여기서는 가중치만 받는다.
# 가중치는 표기가 MIT지만 학습 데이터가 비상업 조건이다 — web/vendor/NOTICE.md "BlazeGaze 가중치" 절.
WEBEYETRACK_COMMIT = "75fbd2f5f784f2eb3a39675a8dcbf1b01c697f1c"
WEBEYETRACK_RAW = f"https://raw.githubusercontent.com/RedForestAI/WebEyeTrack/{WEBEYETRACK_COMMIT}"

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
    # 시선 추정 (2026-11-21, MediaPipe 뒤 단계를 WebEyeTrack의 BlazeGaze로 교체). 없으면 시선 추적이 켜지지 않는다.
    ("vendor/tfjs/tf.fesm.min.js",
     f"https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@{TFJS_VER}/dist/tf.fesm.min.js"),
    ("models/blazegaze/model.json",
     f"{WEBEYETRACK_RAW}/js/examples/minimal-example/public/web/model.json"),
    ("models/blazegaze/group1-shard1of1.bin",
     f"{WEBEYETRACK_RAW}/js/examples/minimal-example/public/web/group1-shard1of1.bin"),
]

# 받은 파일이 기대한 것과 같은지 본다 (SHA-256). 모형 가중치와 그것을 돌리는 코드는 조용히 바뀌면 안 된다.
# 가중치 두 값은 A가 측정 시제품(v7.8)에서 따로 적어 둔 값과 같다 (review/ASSETS.json).
SHA256 = {
    "vendor/tfjs/tf.fesm.min.js": "d04eb25983352ee850046cf8079a864f4fe0284fb0b3aa409a9f9c8ae668cdac",
    "models/blazegaze/model.json": "a214f074ccd4724cf4ebf008814a05485e7eaa5faf5aaeb85e66b24a1af55688",
    "models/blazegaze/group1-shard1of1.bin": "c030a762a2d21ac0f3c59700a723b2d8790f2003b3f8e72fbe31129fcb234e58",
}

# 사진·스캔 PDF 글자 인식 (Apache-2.0). 받지 않으면 이미지 PDF를 열 때 안내만 뜨고 나머지는 그대로 동작한다.
# 용량이 크다 (합계 약 29MB): core 2개 약 7.9MB + kor 7.0MB + eng 10.9MB.
# --no-ocr 로 건너뛸 수 있다.
OCR_ASSETS = [
    ("vendor/tesseract/tesseract.esm.min.js",
     f"https://cdn.jsdelivr.net/npm/tesseract.js@{TESSERACT_VER}/dist/tesseract.esm.min.js"),
    ("vendor/tesseract/worker.min.js",
     f"https://cdn.jsdelivr.net/npm/tesseract.js@{TESSERACT_VER}/dist/worker.min.js"),
    ("vendor/tesseract/core/tesseract-core-lstm.wasm.js",
     f"https://cdn.jsdelivr.net/npm/tesseract.js-core@{TESSERACT_CORE_VER}/tesseract-core-lstm.wasm.js"),
    ("vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js",
     f"https://cdn.jsdelivr.net/npm/tesseract.js-core@{TESSERACT_CORE_VER}/tesseract-core-simd-lstm.wasm.js"),
    ("vendor/tesseract/lang/kor.traineddata.gz",
     f"https://tessdata.projectnaptha.com/{TESSDATA_VER}/kor.traineddata.gz"),
    ("vendor/tesseract/lang/eng.traineddata.gz",
     f"https://tessdata.projectnaptha.com/{TESSDATA_VER}/eng.traineddata.gz"),
]

# 한글 스탬프용 폰트 (OFL). 없으면 영문 스탬프로 대체되므로 실패해도 치명적이지 않음.
FONT = ("vendor/fonts/NotoSansKR-Regular.ttf",
        "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf")

# 라이선스 원문. 자산과 같은 자리에 둬서, 앱을 올리거나 건넬 때 함께 나가게 한다.
# Apache-2.0은 재배포 시 사본 동봉을 요구하는데 MediaPipe 축약 번들에는 고지가 남아 있지 않다.
# 요약과 확인 결과는 web/vendor/NOTICE.md.  없어도 앱은 돌아가므로 실패해도 중단하지 않는다.
LICENSES = [
    ("vendor/mediapipe/LICENSE", "https://www.apache.org/licenses/LICENSE-2.0.txt"),
    ("vendor/pdfjs/LICENSE",
     f"https://raw.githubusercontent.com/mozilla/pdf.js/v{PDFJS_VER}/LICENSE"),
    ("vendor/pdf-lib/LICENSE",
     f"https://raw.githubusercontent.com/Hopding/pdf-lib/v{PDFLIB_VER}/LICENSE.md"),
    ("vendor/fonts/LICENSE",
     "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/LICENSE"),
    ("vendor/tesseract/LICENSE", "https://www.apache.org/licenses/LICENSE-2.0.txt"),
    ("vendor/tfjs/LICENSE", "https://www.apache.org/licenses/LICENSE-2.0.txt"),
    ("models/blazegaze/LICENSE", f"{WEBEYETRACK_RAW}/LICENSE"),
]


def sha256_ok(rel, dst):
    """기대 해시가 적힌 파일이면 맞는지 본다. 적히지 않은 파일은 그대로 통과."""
    want = SHA256.get(rel)
    if not want:
        return True
    h = hashlib.sha256()
    with open(dst, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest() == want


def fetch(rel, url):
    dst = os.path.join(WEB, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        if not sha256_ok(rel, dst):
            print(f"  [실패] 이미 있는 파일의 해시가 다릅니다 (지우고 다시 받으세요): {rel}")
            return False
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
        if not sha256_ok(rel, dst):
            os.remove(dst)
            print(f"  [실패] 받은 파일의 해시가 기대와 다릅니다: {rel}")
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
    ap.add_argument("--no-ocr", action="store_true",
                    help="글자 인식 자산(약 29MB)을 건너뛴다. 이미지 PDF는 열 수 없게 된다.")
    args = ap.parse_args()

    print(f"web 폴더: {WEB}")
    ok = True
    ocr = [] if args.no_ocr else OCR_ASSETS
    # 글자 인식 자산은 없어도 앱이 돌아간다 (이미지 PDF만 못 연다) — 실패해도 중단하지 않는다
    optional = {FONT[0], *(rel for rel, _ in LICENSES), *(rel for rel, _ in OCR_ASSETS)}
    for rel, url in ASSETS + [FONT] + ocr + LICENSES:
        if args.check:
            exists = os.path.exists(os.path.join(WEB, rel))
            print(f"  {'있음' if exists else '없음'}   {rel}")
            ok = ok and (exists or rel in optional)
        else:
            got = fetch(rel, url)
            if rel not in optional:
                ok = ok and got
    if not ok:
        print("\n일부 자산이 없습니다. docs/dependencies.md의 수동 다운로드 안내를 보세요.")
        sys.exit(1)
    print("\n자산 준비 완료. 이제  python3 tools/serve_local.py  를 실행하세요.")


if __name__ == "__main__":
    main()
