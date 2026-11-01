"""앱이 내보낸 samples.csv · events.csv · session.json loader (계약 1.1.0, 1.0.0 호환).

사용:
    from load_app_logs import load_samples, load_events, load_session
    s = load_samples("samples.csv")
"""
import json
from pathlib import Path

import pandas as pd

SAMPLE_COLUMNS = [
    "contractVersion", "source", "documentId", "sessionId", "pageId", "segmentId", "seq", "tMs", "valid",
    "leftIrisX", "rightIrisX", "leftIrisY", "rightIrisY", "leftEar", "rightEar", "headMotion", "invalidReason",
]
EVENT_COLUMNS = [
    "contractVersion", "documentId", "sessionId", "eventId", "pageId", "segmentId", "tMs", "type",
    "amplitudeX", "durationMs", "detectorVersion",
]


def load_samples(path):
    df = pd.read_csv(path)
    for col in ("leftEar", "rightEar"):  # 1.0.0 로그에는 없음
        if col not in df.columns:
            df[col] = pd.NA
    missing = [c for c in SAMPLE_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"samples.csv 열 누락: {missing}")
    df = df[SAMPLE_COLUMNS]
    df["valid"] = df["valid"].astype(str).str.lower().eq("true")
    for c in ("leftIrisX", "rightIrisX", "leftIrisY", "rightIrisY", "leftEar", "rightEar", "headMotion", "tMs"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["dtMs"] = df.groupby(["sessionId", "segmentId"])["tMs"].diff()
    return df


def load_events(path):
    df = pd.read_csv(path)
    missing = [c for c in EVENT_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"events.csv 열 누락: {missing}")
    return df[EVENT_COLUMNS]


def load_session(path):
    with open(path, encoding="utf-8") as f:
        s = json.load(f)
    if s.get("mode") != "real":
        print(f"[주의] mode={s.get('mode')!r}: 실제 측정 로그가 아닙니다.")
    return s


if __name__ == "__main__":
    import sys
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("samples.csv")
    df = load_samples(p)
    print(df.head())
    print("유효 비율:", df["valid"].mean())
    print("처리 간격(ms) 중앙값:", df["dtMs"].median())
