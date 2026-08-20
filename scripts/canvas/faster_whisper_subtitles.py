import argparse
import json
import sys


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--device", required=True)
    parser.add_argument("--compute-type", required=True)
    parser.add_argument("--task", choices=["transcribe"], default="transcribe")
    parser.add_argument("--beam-size", type=int, default=5)
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("CONFIG_ERROR: faster-whisper is not installed.", file=sys.stderr)
        return 2

    try:
        model = WhisperModel(
            args.model,
            device=args.device,
            compute_type=args.compute_type,
            local_files_only=True,
        )
    except Exception:
        print("CONFIG_ERROR: the Faster Whisper model is not available locally.", file=sys.stderr)
        return 2

    segments, info = model.transcribe(
        args.video,
        task=args.task,
        vad_filter=True,
        word_timestamps=True,
        condition_on_previous_text=False,
        beam_size=args.beam_size,
    )
    output = []
    for segment in segments:
        words = []
        for word in segment.words or []:
            if word.start is None or word.end is None:
                continue
            words.append({
                "startMs": round(word.start * 1000),
                "endMs": round(word.end * 1000),
                "text": word.word,
            })
        if words:
            output.append({"text": segment.text, "words": words})

    json.dump(
        {
            "engine": "faster-whisper",
            "language": info.language,
            "durationMs": round(info.duration * 1000),
            "segments": output,
        },
        sys.stdout,
        ensure_ascii=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
