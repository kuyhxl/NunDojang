# 처음 한 번: 개발 환경 준비 (uv)

uv는 Python 가상환경·패키지 설치·실행을 한 명령으로 처리하는 도구입니다. **`activate` 같은 건 없습니다.** 아래 명령을 그대로 치면 됩니다.

## 1. uv 설치 (한 번만)

터미널(맥북의 "터미널" 앱)을 열고:

```
curl -LsSf https://astral.sh/uv/install.sh | sh
```

끝나면 터미널을 **닫았다가 다시 열고** 확인:

```
uv --version
```

버전이 찍히면 됩니다. 안 찍히면 `source ~/.zshrc` 를 치고 다시 해보세요.

## 2. 저장소 받기 (한 번만)

GitHub Desktop으로 clone 하거나:

```
cd ~/Desktop/Developer
git clone https://github.com/kuyhxl/NunDojang.git
cd NunDojang
```

## 3. 브라우저 자산 받기 (한 번만)

```
uv run tools/setup_assets.py
```

`web/vendor/`와 `web/models/`에 MediaPipe·PDF.js·pdf-lib·얼굴 모델이 들어옵니다. 네트워크가 안 되면 `docs/dependencies.md`의 수동 다운로드 표를 보세요.

## 4. 서버 실행 (매번)

```
uv run nundojang
```

처음 한 번은 FastAPI를 설치하느라 몇 초 걸리고, 그다음부터는 바로 뜹니다. 브라우저에서 `http://localhost:8000/` 을 엽니다.
종료는 터미널에서 `Ctrl+C`.

- 포트가 겹치면: `uv run nundojang --port 8001`
- A의 측정 점검 화면: `http://localhost:8000/dev/measurement.html`
- 통합 점검(fixture): `http://localhost:8000/dev/integration.html`
- API 문서(자동 생성): `http://localhost:8000/api/docs`

`web/` 안의 HTML·JS·CSS를 고친 뒤에는 **브라우저 새로고침만** 하면 됩니다(캐시 꺼짐). 서버를 다시 켤 필요 없습니다.

## 5. B만: 분석 환경

```
uv sync --group analysis
uv run jupyter lab
```

pandas·numpy·matplotlib·scikit-learn·jupyter가 `uv.lock`에 고정된 버전으로 설치됩니다. 노트북은 `analysis/notebooks/`에.
Colab을 쓴다면 이 단계는 건너뛰어도 됩니다.

## uv 없이 돌리기 (비상용)

uv 설치가 안 되는 상황이면 Python 3만으로도 됩니다:

```
python3 tools/serve_local.py
```

같은 `web/` 폴더를 서빙하므로 앱 동작은 동일합니다. `/api/*` 만 없습니다.

## 자주 나는 문제

| 증상 | 원인 | 해결 |
|---|---|---|
| `uv: command not found` | 설치 후 터미널을 안 닫음 | 터미널 재시작 또는 `source ~/.zshrc` |
| `Address already in use` | 8000번 포트를 다른 프로그램이 씀 | `--port 8001` |
| 화면은 뜨는데 PDF가 안 열림 | 자산 미설치 | `uv run tools/setup_assets.py` |
| 카메라 권한 창이 안 뜸 | `file://`로 열었거나 http 원격 접속 | 반드시 `http://localhost:8000/` |
| `git pull` 후 서버 오류 | 의존성 바뀜 | `uv sync` 한 번 |

## 왜 FastAPI인가 (한 줄)

지금은 `web/` 파일을 내려주는 일만 하지만, 봉인 2단계(서버 측 서명·검증)나 배포로 확장할 때 같은 서버에 `/api/*`만 붙이면 되도록 자리를 잡아둔 것입니다. 측정·점수·서명은 여전히 전부 브라우저에서 돌아가고, 서버는 PDF도 영상도 받지 않습니다.
