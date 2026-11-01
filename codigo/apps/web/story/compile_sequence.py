#!/usr/bin/env python3
"""Compile an MP4 into a canvas frame sequence (webp, else jpg, else png) plus manifest.json.

Optional tool for a future photoreal version of the story page; the live page draws its frames
in code and does not need it. Needs ffmpeg on PATH.
"""
import argparse
import json
import shutil
import subprocess
from pathlib import Path


def run(cmd):
    subprocess.run(cmd, check=True)


def encoders():
    return subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], check=True, capture_output=True, text=True).stdout


def has_encoder(name):
    return any(line.split()[1:2] == [name] for line in encoders().splitlines())


def choose_format(requested):
    if requested != "auto":
        return requested
    if has_encoder("libwebp") or has_encoder("webp"):
        return "webp"
    if has_encoder("mjpeg"):
        return "jpg"
    return "png"


def filters(width, height, fps, fit):
    chain = [f"fps={fps}"]
    if width and height:
        if fit == "cover":
            chain.append(f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}")
        else:
            chain.append(f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2")
    elif width:
        chain.append(f"scale={width}:-2")
    elif height:
        chain.append(f"scale=-2:{height}")
    return ",".join(chain)


def codec_args(fmt, quality):
    if fmt == "webp":
        return ["-c:v", "libwebp", "-quality", str(quality), "-compression_level", "4"]
    if fmt == "jpg":
        return ["-q:v", str(max(2, min(31, round((100 - quality) / 4) + 2)))]
    if fmt == "png":
        return ["-compression_level", "6"]
    raise SystemExit(f"Unsupported format: {fmt}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("input", type=Path)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--id", required=True)
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("--width", type=int)
    p.add_argument("--height", type=int)
    p.add_argument("--fit", choices=["cover", "contain"], default="cover")
    p.add_argument("--format", choices=["auto", "webp", "jpg", "png"], default="auto")
    p.add_argument("--quality", type=int, default=82)
    p.add_argument("--public-url", required=True)
    p.add_argument("--overwrite", action="store_true")
    args = p.parse_args()

    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg is missing. Install ffmpeg and run again.")
    if not args.input.exists():
        raise SystemExit(f"Input not found: {args.input}")

    fmt = choose_format(args.format)
    args.out.mkdir(parents=True, exist_ok=True)
    if args.overwrite:
        for file in args.out.glob("frame_*.*"):
            file.unlink()
        for name in ["manifest.json", "poster.webp", "poster.jpg", "poster.png"]:
            target = args.out / name
            if target.exists():
                target.unlink()

    pattern = args.out / f"frame_%04d.{fmt}"
    run(["ffmpeg", "-y", "-i", str(args.input), "-vf", filters(args.width, args.height, args.fps, args.fit), *codec_args(fmt, args.quality), str(pattern)])

    frames = sorted(args.out.glob(f"frame_*.{fmt}"))
    if not frames:
        raise SystemExit("No frames were produced.")
    poster = args.out / f"poster.{fmt}"
    shutil.copyfile(frames[0], poster)
    public = args.public_url.rstrip("/")
    manifest = {
        "id": args.id,
        "kind": "canvas-sequence",
        "format": fmt,
        "frameCount": len(frames),
        "framePattern": f"frame_%04d.{fmt}",
        "indexBase": 1,
        "pad": 4,
        "fps": args.fps,
        "publicUrl": public,
        "frameUrlTemplate": f"{public}/frame_{{index}}.{fmt}",
        "poster": f"{public}/poster.{fmt}",
        "size": {"width": args.width, "height": args.height, "fit": args.fit},
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"frames": len(frames), "manifest": str(args.out / "manifest.json")}, indent=2))


if __name__ == "__main__":
    main()
