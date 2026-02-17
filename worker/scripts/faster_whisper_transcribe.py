#!/usr/bin/env python3
import argparse
import json
import sys
from typing import Any


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default="pt")
    parser.add_argument("--compute-type", default="int8")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception as exc:
        print(
            json.dumps(
                {
                    "error": f"faster_whisper import failed: {exc}",
                    "hint": "Install with: pip3 install faster-whisper"
                }
            ),
            file=sys.stderr,
        )
        return 2

    try:
        model = WhisperModel(args.model, compute_type=args.compute_type)
        segments, info = model.transcribe(
            args.audio,
            language=args.language,
            vad_filter=True,
            word_timestamps=True,
            beam_size=5,
            best_of=5
        )
    except Exception as exc:
        print(json.dumps({"error": f"transcribe failed: {exc}"}), file=sys.stderr)
        return 3

    out_segments: list[dict[str, Any]] = []
    out_words: list[dict[str, Any]] = []
    text_parts: list[str] = []
    max_end = 0.0

    for segment in segments:
        seg_text = (segment.text or "").strip()
        if seg_text:
            text_parts.append(seg_text)
        seg_start = float(segment.start or 0.0)
        seg_end = float(segment.end or seg_start)
        max_end = max(max_end, seg_end)
        out_segments.append(
            {
                "start": seg_start,
                "end": seg_end,
                "text": seg_text,
            }
        )
        words = getattr(segment, "words", None) or []
        for word in words:
            w_start = float(getattr(word, "start", 0.0) or 0.0)
            w_end = float(getattr(word, "end", w_start) or w_start)
            token = str(getattr(word, "word", "") or "").strip()
            if not token:
                continue
            out_words.append({"start": w_start, "end": w_end, "word": token})

    payload = {
        "text": " ".join(text_parts).strip(),
        "duration": float(max_end or 0.0),
        "segments": out_segments,
        "words": out_words,
        "language": getattr(info, "language", args.language),
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
