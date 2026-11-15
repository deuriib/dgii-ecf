#!/usr/bin/env python3
"""Write a per-locale `sitemap.xml` for the MkDocs i18n build.

MkDocs emits a single `sitemap.xml` at the site root, but Material for MkDocs
fetches `<locale>/sitemap.xml` for every `rel=alternate` language link in the
page head, to resolve translated URLs while prefetching. With the Spanish
locale served from `/es/` that request was a 404 on every page view: no user
impact (the theme falls back to an empty map) but a console error on the site,
and it means the ES URLs were never prefetchable.

The root sitemap already carries the translated URLs as
`<xhtml:link rel="alternate" hreflang="es" href="…"/>`, so the locale sitemap is
a projection of it — no second crawl, no extra dependency.

Run after `mkdocs build` (wired into `mise run docs-build` and the docs
workflow). Exits non-zero when the root sitemap is missing or a locale has no
translated URLs, so a silent regression fails the build instead of shipping a
404.
"""

from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SITE = REPO / "site"
SITEMAP = SITE / "sitemap.xml"

SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
XHTML_NS = "http://www.w3.org/1999/xhtml"

#: Non-default locales built by `mkdocs-static-i18n` (see mkdocs.yml).
LOCALES = ("es",)


def main() -> int:
    if not SITEMAP.is_file():
        print(f"i18n sitemap: {SITEMAP} is missing — run mkdocs build first")
        return 1

    ET.register_namespace("", SITEMAP_NS)
    ET.register_namespace("xhtml", XHTML_NS)
    root = ET.parse(SITEMAP).getroot()

    failures: list[str] = []
    for locale in LOCALES:
        urls: list[tuple[str, str | None]] = []
        seen: set[str] = set()
        for entry in root.findall(f"{{{SITEMAP_NS}}}url"):
            loc = entry.find(f"{{{SITEMAP_NS}}}loc")
            if loc is None or loc.text is None:
                continue
            lastmod = entry.find(f"{{{SITEMAP_NS}}}lastmod")
            for link in entry.findall(f"{{{XHTML_NS}}}link"):
                if link.get("hreflang") != locale:
                    continue
                href = link.get("href")
                # The root sitemap repeats a page once per language entry, so
                # the projection has to deduplicate to stay a valid urlset.
                if href and href not in seen:
                    seen.add(href)
                    urls.append((href, None if lastmod is None else lastmod.text))
                break

        if not urls:
            failures.append(f"{locale}: no translated URLs found in {SITEMAP.name}")
            continue

        urlset = ET.Element(f"{{{SITEMAP_NS}}}urlset")
        for href, lastmod in urls:
            url = ET.SubElement(urlset, f"{{{SITEMAP_NS}}}url")
            ET.SubElement(url, f"{{{SITEMAP_NS}}}loc").text = href
            if lastmod:
                ET.SubElement(url, f"{{{SITEMAP_NS}}}lastmod").text = lastmod

        target = SITE / locale / "sitemap.xml"
        target.parent.mkdir(parents=True, exist_ok=True)
        ET.ElementTree(urlset).write(
            target, encoding="utf-8", xml_declaration=True
        )
        print(f"i18n sitemap: wrote {target.relative_to(REPO)} ({len(urls)} URLs)")

    for failure in failures:
        print(f"i18n sitemap: {failure}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
