#!/usr/bin/env python3
"""Extract every fenced code block in README.md that shows a real captured
command run (its first line is a `$ blastradius ...` prompt) and assert
every non-empty line in that block appears verbatim in
media/2026-09-16-day5.txt. Blocks that are not a captured run (the CI yaml
snippet, the scoring pseudo-formula) are deliberately not checked here -
they were never claimed to be pasted output.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
README = ROOT / "README.md"
CAPTURE = ROOT / "media" / "2026-09-16-day5.txt"

readme_text = README.read_text()
capture_lines = set(CAPTURE.read_text().splitlines())

fence_re = re.compile(r"```(?:\w*)\n(.*?)```", re.DOTALL)
blocks = fence_re.findall(readme_text)

captured_blocks = [b for b in blocks if b.splitlines() and b.splitlines()[0].startswith("$ blastradius")]

unmatched = []
checked = 0
for block in captured_blocks:
    for line in block.splitlines():
        if line.strip() == "":
            continue
        checked += 1
        if line not in capture_lines:
            unmatched.append(line)

print(f"fenced blocks total: {len(blocks)}")
print(f"captured-run blocks checked: {len(captured_blocks)}")
print(f"lines checked: {checked}")
print(f"unmatched: {len(unmatched)}")
for line in unmatched:
    print(f"  MISS: {line!r}")

sys.exit(1 if unmatched else 0)
