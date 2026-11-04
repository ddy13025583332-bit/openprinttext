#!/usr/bin/env python3
"""Ensure the generated offline HTML contains the *current* distributed assets.

This checks build integrity, not browser download, vector-editor import or printing.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
bundle_path = ROOT / "release/OpenPrintText-v0.1.0.html"
if not bundle_path.is_file():
    raise SystemExit("Offline HTML missing: run python3 scripts/build-standalone.py first")

bundle = bundle_path.read_text(encoding="utf-8")
scripts = (
    "vendor/opentype.min.js",
    "assets/demo-font.js",
    "engine.js",
    "app.js",
)
for relative in scripts:
    source = (ROOT / "dist" / relative).read_text(encoding="utf-8")
    expected = "<script>\n" + source + "\n</script>"
    if expected not in bundle:
        raise SystemExit(f"Offline bundle does not embed current {relative}")

css = (ROOT / "dist/styles.css").read_text(encoding="utf-8")
if "<style>\n" + css + "\n</style>" not in bundle:
    raise SystemExit("Offline bundle does not embed current styles.css")

if '<script src="' in bundle or '<link rel="stylesheet" href="styles.css">' in bundle:
    raise SystemExit("Offline bundle has remaining local runtime asset references")

if '<script type="text/plain" id="openprinttext-licenses">' not in bundle:
    raise SystemExit("Offline bundle lost the included third-party license notices")

print("Offline HTML embeds the current runtime assets and license notices.")
