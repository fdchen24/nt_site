#!/usr/bin/env python3
"""Assemble the metadata consumed by the NextAvatar demo page.

Layout
------
The folder is self-contained: every asset the page loads lives under it and is
referenced with a path relative to it, so the folder can be served from any
sub-path (or pushed as its own repository).

    ref_images/                        reference images (anchor_XXXX.png)
    videos/comparison/qualified.csv    English prompts for the comparison cases
    videos/comparison/<model>/<id>.mp4
    videos/more_results/qualified.csv  English prompts for the long sequences
    videos/more_results/<name>.mp4
    assets/figures/                    paper figures used by the text sections
    data/qualitative.js                generated: window.NEXTAVATAR_QUALITATIVE
    data/more.js                       generated: window.NEXTAVATAR_MORE

Sources
-------
Comparison clips for the six baselines are copied in from
``baselines_results/present_results/<model>/<id>.mp4``.  The ``nextavatar``
clips and every ``more_results`` clip are curated inputs: they are never copied
or overwritten.  The comparison case set is defined by the clips already
present in ``videos/comparison/nextavatar/``.

The script is idempotent: existing copies are skipped unless ``--force``.
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
from pathlib import Path

SITE = Path(__file__).resolve().parent
PROJECT = SITE.parent
PRESENT = PROJECT / "baselines_results" / "present_results"

VIDEO_DIR = SITE / "videos" / "comparison"
MORE_DIR = SITE / "videos" / "more_results"
REF_DIR = SITE / "ref_images"

# Display order: proposed method first, then the six external systems.
MODELS: list[tuple[str, str, str]] = [
    ("nextavatar", "NextAvatar (Ours)", "ours"),
    ("longcat", "LongCat-Video-Avatar 1.5", "base"),
    ("flashtalk", "SoulX-FlashTalk", "base"),
    ("liveact", "SoulX-LiveAct", "base"),
    ("liveavatar", "Live Avatar", "base"),
    ("taomate", "TaoMate", "base"),
    ("aptavatar", "AptAvatar", "base"),
]


def read_prompts(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def split_prompt(prompt: str) -> tuple[str, str]:
    """Split a full prompt into its expression and action sentences."""
    expr = prompt.split("[Expression]")[-1].split("[Action]")[0].strip()
    act = (prompt.split("[Action]")[-1] if "[Action]" in prompt else "").strip()
    return expr, act


def copy(src: Path, dst: Path, force: bool) -> bool:
    if not src.exists():
        print(f"  [miss] {src}")
        return False
    if dst.exists() and not force:
        return True
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return True


def write_data(name: str, global_name: str, payload: dict) -> None:
    """Write one payload as a JS file that assigns a global.

    The page must also work when served by Anonymous GitHub's mirror, which
    sandboxes the document without ``allow-same-origin``.  That gives the page
    an opaque origin, so ``fetch()`` on the page's own data files is treated as
    cross-origin and blocked (the mirror sends no CORS headers), while a classic
    ``<script>`` tag is not subject to CORS at all.  The payload therefore ships
    as JS rather than JSON.
    """
    body = json.dumps(payload, ensure_ascii=False, indent=1)
    (SITE / "data" / f"{name}.js").write_text(
        f"window.{global_name} = {body};\n", encoding="utf-8"
    )


def qual_ids() -> list[int]:
    """The comparison case set is defined by the nextavatar clips in the repo."""
    ids = set()
    for p in (VIDEO_DIR / "nextavatar").glob("*_seed*.mp4"):
        try:
            ids.add(int(p.name.split("_", 1)[0]))
        except ValueError:
            continue
    return sorted(ids)


def baseline_src(model: str, video_id: int) -> Path:
    """On-disk path of one baseline clip in the results tree."""
    if model == "longcat":
        return PRESENT / "longcat" / "videos" / f"{video_id}.mp4"
    return PRESENT / model / f"{video_id:04d}.mp4"


def qual_clip(model: str, video_id: int) -> Path | None:
    """In-repo path of one comparison clip, or None when it is not there yet."""
    if model == "nextavatar":
        hits = sorted((VIDEO_DIR / model).glob(f"{video_id}_seed*.mp4"))
        return hits[0] if hits else None
    return VIDEO_DIR / model / f"{video_id}.mp4"


def build_qualitative(force: bool) -> None:
    by_id = {int(r["video_id"]): r for r in read_prompts(VIDEO_DIR / "qualified.csv")}

    groups = []
    for vid in qual_ids():
        row = by_id.get(vid)
        if row is None:
            print(f"  [miss] prompt for case {vid}")
            continue
        ref_name = Path(row["ref_image_path"]).name
        if not (REF_DIR / ref_name).exists():
            print(f"  [miss] ref_images/{ref_name}")
            continue

        clips = []
        for key, label, kind in MODELS:
            # Baseline clips are pulled from the results tree on demand; the
            # nextavatar clips are curated inputs and are never touched.
            if key != "nextavatar":
                copy(baseline_src(key, vid), VIDEO_DIR / key / f"{vid}.mp4", force)
            src = qual_clip(key, vid)
            if src is None:
                print(f"  [miss] case {vid} / {key}")
                continue
            clips.append({
                "model": key,
                "label": label,
                "kind": kind,
                "src": f"videos/comparison/{key}/{src.name}",
            })

        prompt = row["prompt"]
        expr, act = split_prompt(prompt)
        groups.append({
            "id": vid,
            "ref": f"ref_images/{ref_name}",
            "prompt": prompt,
            "expression": expr,
            "action": act,
            "clips": clips,
        })
        print(f"  [qual] case {vid:02d}: {len(clips)} clips")

    write_data("qualitative", "NEXTAVATAR_QUALITATIVE", {"groups": groups})


def build_more() -> None:
    rows = read_prompts(MORE_DIR / "qualified.csv")

    # One sequence per file, in the order the file first appears in the CSV.
    order: list[str] = []
    per_file: dict[str, list[dict]] = {}
    for r in rows:
        if r["filename"] not in per_file:
            order.append(r["filename"])
        per_file.setdefault(r["filename"], []).append(r)

    videos = []
    for name in order:
        items = sorted(per_file[name], key=lambda r: int(r["within_video_id"]))
        if not (MORE_DIR / name).exists():
            print(f"  [miss] videos/more_results/{name}")
            continue
        ref_name = Path(items[0]["ref_image_path"]).name
        if not (REF_DIR / ref_name).exists():
            print(f"  [miss] ref_images/{ref_name}")
            continue

        prompts = []
        for r in items:
            expr, act = split_prompt(r["prompt"])
            prompts.append({
                "index": int(r["within_video_id"]),
                "expression": expr,
                "action": act,
                "full": r["prompt"],
            })

        videos.append({
            "id": int(items[0]["video_id"]),
            "ref": f"ref_images/{ref_name}",
            "src": f"videos/more_results/{name}",
            "prompts": prompts,
        })
        print(f"  [more] {name}: {len(prompts)} prompts")

    write_data("more", "NEXTAVATAR_MORE", {"videos": videos})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="overwrite existing clips")
    ap.add_argument("--skip-qual", action="store_true")
    ap.add_argument("--skip-more", action="store_true")
    args = ap.parse_args()

    if not args.skip_qual:
        print("qualitative comparison:")
        build_qualitative(args.force)
    if not args.skip_more:
        print("more results:")
        build_more()


if __name__ == "__main__":
    main()
