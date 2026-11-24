import json, os, sys
from faster_whisper import WhisperModel

def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python transcribe.py <audio-or-video-file>")
    model = WhisperModel(os.getenv("WHISPER_MODEL", "small.en"), device="cpu", compute_type="int8")
    segments, info = model.transcribe(sys.argv[1], beam_size=5, vad_filter=True, word_timestamps=False)
    rows = [{"start": float(s.start), "end": float(s.end), "text": s.text.strip()} for s in segments]
    text = " ".join(x["text"] for x in rows).strip()
    if not text:
        raise SystemExit("Speech recognition returned an empty transcript.")
    print(json.dumps({"text": text, "language": info.language, "duration": info.duration, "segments": rows}, ensure_ascii=False))

if __name__ == "__main__":
    main()
