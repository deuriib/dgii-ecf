#!/usr/bin/env python3
"""Write a per-locale search index for the MkDocs i18n build.

Material for MkDocs resolves `search/search_index.json` relative to the page's
locale root, so every page under `/es/` asked for `/es/search/search_index.json`
— which the i18n build never produces. Result: search worked on the English
pages and returned nothing on any Spanish page (verified in Chromium: typing
"idempotencia" on `/es/` left the results pane at its placeholder).

The plugin's own `reconfigure_search` option does not help: it rewrites the
search *config* handed to the theme and leaves the browser with a worker that
never answers, which broke search on every locale (also verified in Chromium).

So the locale index is derived from the single index MkDocs builds: keep the
documents whose `location` is inside the locale and strip the locale prefix, so
the links resolve under `/es/`. Same source of truth, no second crawl.

Run after `mkdocs build` (wired into `mise run docs-build` and the docs
workflow). Exits non-zero when the root index is missing or a locale ends up
with no documents, so a silent regression fails the build.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SITE = REPO / "site"
INDEX = SITE / "search" / "search_index.json"

#: Non-default locales built by `mkdocs-static-i18n` (see mkdocs.yml).
LOCALES = ("es",)


def main() -> int:
    if not INDEX.is_file():
        print(f"i18n search: {INDEX} is missing — run mkdocs build first")
        return 1

    payload = json.loads(INDEX.read_text(encoding="utf-8"))
    documents = payload.get("docs", [])
    if not documents:
        print("i18n search: the root search index has no documents")
        return 1

    failures: list[str] = []
    for locale in LOCALES:
        prefix = f"{locale}/"
        localised = []
        for document in documents:
            location = document.get("location", "")
            if location == locale or location == prefix:
                localised.append({**document, "location": ""})
            elif location.startswith(prefix):
                localised.append({**document, "location": location[len(prefix) :]})

        if not localised:
            failures.append(f"{locale}: no documents found in the root search index")
            continue

        target = SITE / locale / "search" / "search_index.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps({**payload, "docs": localised}, ensure_ascii=False),
            encoding="utf-8",
        )
        print(
            f"i18n search: wrote {target.relative_to(REPO)} ({len(localised)} documents)"
        )

    for failure in failures:
        print(f"i18n search: {failure}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
