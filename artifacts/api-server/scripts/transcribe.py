#!/usr/bin/env python3
"""
Transcribe audio using faster-whisper (local model, no API key needed).
Usage: python transcribe.py <audio_path> [model_size]
Output: JSON with segments array [{start, end, text}]
"""
import sys
import json
import os

def transcribe(audio_path: str, model_size: str = "base"):
    from faster_whisper import WhisperModel

    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio_path, beam_size=5, word_timestamps=False)

    result_segments = []
    full_text_parts = []

    for seg in segments:
        result_segments.append({
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip(),
        })
        full_text_parts.append(seg.text.strip())

    print(json.dumps({
        "language": info.language,
        "duration": round(info.duration, 2),
        "transcript": " ".join(full_text_parts),
        "segments": result_segments,
    }))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio path provided"}))
        sys.exit(1)

    audio_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "base"

    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"File not found: {audio_path}"}))
        sys.exit(1)

    transcribe(audio_path, model_size)
