#!/usr/bin/env python3
"""
Create GitHub Releases for all historical github-page tags.

Rules:
- Release title: the version part of the tag (e.g. "v0.260523.155437")
- Tags are processed in chronological order (oldest first)
- For the last tag of each day:
    - If CHANGELOG.md has a matching version entry: use that content
      AND append generate-note output
    - If no CHANGELOG entry: use generate-note only
- For earlier tags of the same day: use generate-note only
"""

import json
import re
import subprocess
import sys
import os

OWNER = "kajitiluna"
REPO = "erd-designer"

# All tags in chronological order (oldest first).
# Source: `git tag --sort=version:refname` / `git log` order.
TAGS = [
    "github-page/2026/01/v0.260118.115640",
    "github-page/2026/01/v0.260118.153610",
    "github-page/2026/01/v0.260131.111516",
    "github-page/2026/02/v0.260209.001736",
    "github-page/2026/02/v0.260222.165835",
    "github-page/2026/02/v0.260222.170447",
    "github-page/2026/02/v0.260224.015053",
    "github-page/2026/02/v0.260226.003528",
    "github-page/2026/02/v0.260226.005057",
    "github-page/2026/03/v0.260306.032453",
    "github-page/2026/03/v0.260307.144904",
    "github-page/2026/03/v0.260314.103811",
    "github-page/2026/03/v0.260315.200125",
    "github-page/2026/03/v0.260321.150753",
    "github-page/2026/03/v0.260321.194506",
    "github-page/2026/03/v0.260322.165103",
    "github-page/2026/03/v0.260328.230139",
    "github-page/2026/04/v0.260405.182340",
    "github-page/2026/04/v0.260411.115816",
    "github-page/2026/04/v0.260411.133036",
    "github-page/2026/04/v0.260411.141810",
    "github-page/2026/04/v0.260426.183748",
    "github-page/2026/04/v0.260427.003108",
    "github-page/2026/05/v0.260503.195001",
    "github-page/2026/05/v0.260503.204106",
    "github-page/2026/05/v0.260509.163611",
    "github-page/2026/05/v0.260509.201649",
    "github-page/2026/05/v0.260513.064632",
    "github-page/2026/05/v0.260521.233919",
    "github-page/2026/05/v0.260523.155437",
]

# The last (most recent) tag for each day.
# Only this tag may receive CHANGELOG content.
LAST_TAG_PER_DAY = {
    "260118": "github-page/2026/01/v0.260118.153610",
    "260131": "github-page/2026/01/v0.260131.111516",
    "260209": "github-page/2026/02/v0.260209.001736",
    "260222": "github-page/2026/02/v0.260222.170447",
    "260224": "github-page/2026/02/v0.260224.015053",
    "260226": "github-page/2026/02/v0.260226.005057",
    "260306": "github-page/2026/03/v0.260306.032453",
    "260307": "github-page/2026/03/v0.260307.144904",
    "260314": "github-page/2026/03/v0.260314.103811",
    "260315": "github-page/2026/03/v0.260315.200125",
    "260321": "github-page/2026/03/v0.260321.194506",
    "260322": "github-page/2026/03/v0.260322.165103",
    "260328": "github-page/2026/03/v0.260328.230139",
    "260405": "github-page/2026/04/v0.260405.182340",
    "260411": "github-page/2026/04/v0.260411.141810",
    "260426": "github-page/2026/04/v0.260426.183748",
    "260427": "github-page/2026/04/v0.260427.003108",
    "260503": "github-page/2026/05/v0.260503.204106",
    "260509": "github-page/2026/05/v0.260509.201649",
    "260513": "github-page/2026/05/v0.260513.064632",
    "260521": "github-page/2026/05/v0.260521.233919",
    "260523": "github-page/2026/05/v0.260523.155437",
}


def parse_changelog(filepath: str) -> dict[str, str]:
    """
    Parse CHANGELOG.md and return a dict mapping YYMMDD -> section body text.
    Section body is everything between one ## [0.YYYYMMDD] header and the next.
    """
    with open(filepath, encoding="utf-8") as f:
        content = f.read()

    sections: dict[str, str] = {}
    pattern = re.compile(
        r"^## \[0\.(\d{8})\][^\n]*\n(.*?)(?=^## |\Z)",
        re.MULTILINE | re.DOTALL,
    )
    for m in pattern.finditer(content):
        full_date = m.group(1)   # e.g. "20260523"
        body = m.group(2).strip()
        yy_mmdd = full_date[2:]  # e.g. "260523"
        sections[yy_mmdd] = body

    return sections


def get_version(tag: str) -> str:
    """Extract the version part from a tag name.

    e.g. "github-page/2026/05/v0.260523.155437" -> "v0.260523.155437"
    """
    return tag.split("/")[-1]


def get_yymmdd(tag: str) -> str | None:
    """Extract the YYMMDD date code from a tag version string.

    e.g. "github-page/2026/05/v0.260523.155437" -> "260523"
    """
    version = get_version(tag)
    m = re.match(r"v0\.(\d{6})\.", version)
    return m.group(1) if m else None


def create_release(
    tag: str,
    title: str,
    body: str | None,
    generate_notes: bool,
) -> bool:
    """Create a GitHub release via the gh CLI REST API wrapper."""
    payload: dict = {
        "tag_name": tag,
        "name": title,
        "generate_release_notes": generate_notes,
        "draft": False,
        "prerelease": False,
    }
    if body:
        payload["body"] = body

    result = subprocess.run(
        [
            "gh", "api",
            f"/repos/{OWNER}/{REPO}/releases",
            "--method", "POST",
            "--input", "-",
        ],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=30,
    )

    if result.returncode != 0:
        stderr = result.stderr.strip()
        # 422 means release already exists for this tag — skip gracefully.
        if "already_exists" in stderr or "422" in stderr:
            print(f"  SKIP (already exists): {title}")
            return True
        print(f"  ERROR: {stderr}", file=sys.stderr)
        return False

    data = json.loads(result.stdout)
    print(f"  OK -> {data['html_url']}")
    return True


def main() -> None:
    changelog_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "CHANGELOG.md"
    )
    changelog_path = os.path.normpath(changelog_path)

    if not os.path.exists(changelog_path):
        print(f"CHANGELOG.md not found at {changelog_path}", file=sys.stderr)
        sys.exit(1)

    changelog = parse_changelog(changelog_path)
    print(f"CHANGELOG versions found: {sorted(changelog.keys())}\n")

    errors: list[str] = []

    for tag in TAGS:
        version = get_version(tag)
        yymmdd = get_yymmdd(tag)

        is_last_of_day = yymmdd is not None and LAST_TAG_PER_DAY.get(yymmdd) == tag
        changelog_body = changelog.get(yymmdd) if (is_last_of_day and yymmdd) else None

        if changelog_body:
            print(f"[CHANGELOG + notes] {version}")
        else:
            print(f"[generate-notes]    {version}")

        ok = create_release(
            tag=tag,
            title=version,
            body=changelog_body,
            generate_notes=True,
        )
        if not ok:
            errors.append(tag)

    print()
    if errors:
        print(f"FAILED releases ({len(errors)}):")
        for t in errors:
            print(f"  {t}")
        sys.exit(1)
    else:
        print(f"All {len(TAGS)} releases processed successfully.")


if __name__ == "__main__":
    main()
