#!/usr/bin/env python3
"""
Ambil subtitle dari YouTube menggunakan youtube-transcript-api v1.x.
Usage: python fetch_transcript.py <video_url_or_id> [language_code]
Output: JSON { transcript, segments: [{start, end, text}] }
"""
import sys
import json
import re

def extract_video_id(url: str) -> str:
    patterns = [
        r'(?:v=|/v/|youtu\.be/|/embed/|/live/)([A-Za-z0-9_-]{11})',
        r'^([A-Za-z0-9_-]{11})$',
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    raise ValueError(f"Tidak bisa ekstrak video ID dari: {url}")

def fetch(url: str, lang: str = "id"):
    from youtube_transcript_api import YouTubeTranscriptApi

    video_id = extract_video_id(url)
    api = YouTubeTranscriptApi()

    # Coba ambil daftar transcript yang tersedia
    transcript_list = api.list(video_id)

    # Urutkan bahasa: bahasa proyek → en → apapun
    fetched = None
    langs_to_try = [lang] if lang != "en" else []
    langs_to_try += ["en", None]

    for try_lang in langs_to_try:
        try:
            if try_lang is None:
                # Ambil transcript pertama yang ada
                for t in transcript_list:
                    fetched = t.fetch()
                    break
            else:
                fetched = transcript_list.find_transcript([try_lang]).fetch()
            if fetched:
                break
        except Exception:
            continue

    if not fetched:
        raise Exception("Tidak ada transcript tersedia untuk video ini")

    segments = []
    texts = []
    for item in fetched:
        start = round(float(item.start), 2)
        duration = float(item.duration) if hasattr(item, 'duration') and item.duration else 3.0
        end = round(start + duration, 2)
        text = item.text.strip()
        if text:
            segments.append({"start": start, "end": end, "text": text})
            texts.append(text)

    print(json.dumps({
        "transcript": " ".join(texts),
        "segments": segments,
    }))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "URL tidak diberikan"}))
        sys.exit(1)
    try:
        fetch(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "id")
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
