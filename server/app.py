"""눈도장 FastAPI 서버 — C 소유.

역할 (지금): web/ 폴더를 정적으로 서빙한다. serve_local.py와 같은 일을 FastAPI 위에서 한다.
역할 (확장 자리): /api/* 아래에 봉인 2단계 서버 서명·검증, 배포 시 HTTPS 뒤에서 그대로 사용.

실행:  uv run nundojang            (기본 http://localhost:8000/)
       uv run nundojang --port 8001
       uv run nundojang --reload   (서버 코드 수정 시 자동 재시작; web/ 수정은 새로고침만으로 반영)

중요: 측정·점수·서명·봉인 1단계는 전부 브라우저에서 돌아간다. 이 서버는 PDF도 영상도 받지 않는다.
      /api/* 는 아직 비어 있다(501). 실제로 데이터를 받기 시작하면 공통 스크립트의 '백엔드 없음' 조항을 변경 제안으로 바꾼다.
"""
from __future__ import annotations

import argparse
import mimetypes
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
APP_VERSION = "nundojang-server/0.1.0"

# 브라우저가 모듈·WASM·모델을 올바르게 받도록 MIME 보강
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("application/octet-stream", ".task")
mimetypes.add_type("font/ttf", ".ttf")
mimetypes.add_type("font/otf", ".otf")

app = FastAPI(title="눈도장 (NunDojang)", version=APP_VERSION, docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.middleware("http")
async def no_cache(request: Request, call_next):
    """개발 중 수정이 바로 반영되도록 정적 파일 캐시를 끈다."""
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, max-age=0"
    return response


# ---------- API (확장 자리) ----------

@app.get("/api/health")
async def health():
    """서버가 떠 있는지, 자산이 준비됐는지."""
    missing = [p for p in ("vendor/pdfjs/pdf.mjs", "vendor/mediapipe/vision_bundle.mjs", "models/face_landmarker.task")
               if not (WEB / p).exists()]
    return {"ok": True, "version": APP_VERSION, "missingAssets": missing}


@app.post("/api/seals/verify", status_code=501)
async def verify_seal():
    """봉인 2단계 자리. 서버 측 서명·검증은 아직 구현하지 않았다.
    구현 시: session-<sealId>.json의 sealSignature를 서버 공개키로 확인하고 sealId·문서 해시 일치를 돌려준다."""
    raise HTTPException(status_code=501, detail="seal verification is not implemented yet (roadmap: seal stage 2)")


@app.exception_handler(404)
async def not_found(request: Request, exc):
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": "not found"}, status_code=404)
    return JSONResponse({"detail": f"{request.url.path} 를 web/ 에서 찾을 수 없습니다"}, status_code=404)


# ---------- 정적 사이트 (web/) ----------
# 반드시 API 라우트 뒤에 마운트해야 /api/* 가 정적 파일에 가려지지 않는다.
app.mount("/", StaticFiles(directory=str(WEB), html=True), name="web")


def main() -> None:
    import uvicorn

    ap = argparse.ArgumentParser(description="눈도장 로컬 서버 (FastAPI)")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--reload", action="store_true", help="server/ 코드 수정 시 자동 재시작")
    args = ap.parse_args()

    if not (WEB / "index.html").is_file():
        raise SystemExit(f"[오류] web/index.html 을 찾을 수 없습니다: {WEB}")

    url = f"http://localhost:{args.port}/"
    print(f"눈도장 서버 시작 — 제공 폴더: {WEB}")
    print(f"  앱:        {url}")
    print(f"  측정 점검: {url}dev/measurement.html")
    print(f"  통합 점검: {url}dev/integration.html")
    print(f"  API 문서:  {url}api/docs")
    print("종료: Ctrl+C")
    uvicorn.run("server.app:app", host=args.host, port=args.port, reload=args.reload, log_level="info")


if __name__ == "__main__":
    main()
