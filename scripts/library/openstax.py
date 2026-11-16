"""Extracts an OpenStax book's text from its CNXML Git repository into Library source documents.

Run from the laptop (Python 3 standard library only), on a copy kept OUTSIDE this repo:
  python3 -I scripts/library/openstax.py <repo copy> <book> <out.json> [<source url>]

<book> is the collection's slug (collections/<book>.collection.xml). With <source url> (the repository
at a fixed commit, such as https://github.com/openstax/osbooks-principles-finance/blob/<commit>),
each document links to its module's CNXML file there, the text the Library actually holds; without it,
each links to the book's page on openstax.org. Each source's exact command is its "fetch" line in
scripts/library/sources.json.

The output is a JSON list of documents ({ref, title, url, publishedOn, sections: [{heading, paragraphs}]})
for `npm run library:load`, which cleans, cuts, checks for corrupted text and loads them. Exercises,
quizzes, learning objectives, video activities and figures are left out; the book's own words are kept.
Nothing extracted is written into the repo: the source text lives only in the private database.
"""

import json
import re
import sys
import xml.etree.ElementTree as ET

NS = {"c": "http://cnx.rice.edu/cnxml", "col": "http://cnx.rice.edu/collxml", "md": "http://cnx.rice.edu/mdml"}
C = "{http://cnx.rice.edu/cnxml}"
SKIP_SECTIONS = {"learning-objectives", "multiple-choice", "problem-set", "review-questions", "video-activity", "cfa-institute"}
SKIP_ELEMENTS = {"exercise", "figure", "media", "image", "title", "metadata"}


def slug(text):
    text = re.sub(r"[^\w\s-]", "", text.lower().replace("’", "").replace("'", ""))
    return re.sub(r"[\s_-]+", "-", text).strip("-")


def title_of(el):
    return " ".join("".join(el.itertext()).split()) if el is not None else ""


def text_of(el):
    """Readable text of an element: nested text, tables as rows of cells, lists as items."""
    tag = el.tag.replace(C, "")
    if tag in SKIP_ELEMENTS:
        return el.tail or ""
    if tag == "table":
        rows = []
        for row in el.iter(C + "row"):
            cells = [" ".join(text_of(e).split()) for e in row.findall(C + "entry")]
            rows.append(" | ".join(cells))
        caption = el.find(C + "caption")
        head = title_of(caption) + ". " if caption is not None else ""
        return head + "; ".join(rows) + (el.tail or "")
    parts = [el.text or ""]
    for child in el:
        child_tag = child.tag.replace(C, "")
        if child_tag == "item":
            parts.append(" • " + text_of(child).strip() + " ")
            parts.append(child.tail or "")
        else:
            parts.append(text_of(child))
    parts.append(el.tail or "")
    return "".join(parts)


def blocks(container, heading, out):
    """Collects paragraphs per section heading, in reading order."""
    current = []
    out.append({"heading": heading, "paragraphs": current})
    for el in container:
        tag = el.tag.replace(C, "")
        if tag == "section":
            if el.get("class") in SKIP_SECTIONS:
                continue
            sub = title_of(el.find(C + "title"))
            if el.get("class") == "section-summary":
                sub = "Summary"
            blocks(el, f"{heading}: {sub}" if heading and sub else (sub or heading), out)
            current = []
            out.append({"heading": heading, "paragraphs": current})
        elif tag in ("para", "list", "table", "equation"):
            current.append(text_of(el).replace(el.tail or "", "", 1) if el.tail else text_of(el))
        elif tag == "note":
            label = title_of(el.find(C + "title"))
            inner = []
            blocks(el, label, inner)
            for b in inner:
                if b["paragraphs"]:
                    first = f"{label}. " if label else ""
                    current.append(first + " ".join(b["paragraphs"]))
                    label = ""
        elif tag == "glossary":
            for d in el.iter(C + "definition"):
                term = d.find(C + "term")
                meaning = d.find(C + "meaning")
                if term is not None and meaning is not None:
                    current.append(f"{' '.join(text_of(term).split())}: {' '.join(text_of(meaning).split())}")
        elif tag in SKIP_ELEMENTS:
            continue
        else:
            current.append(text_of(el))
    return out


def module_url(book, page, mid, source_url=None):
    """Where a document links: its CNXML file in the repository at a commit, or else its openstax.org page."""
    if source_url:
        return f"{source_url.rstrip('/')}/modules/{mid}/index.cnxml"
    return f"https://openstax.org/books/{book}/pages/{page}"


def main(repo, book, out_path, source_url=None):
    col = ET.parse(f"{repo}/collections/{book}.collection.xml").getroot()
    docs = []
    chapter = 0

    def module(mid, number, chapter_title):
        root = ET.parse(f"{repo}/modules/{mid}/index.cnxml").getroot()
        title = title_of(root.find(C + "title"))
        content = root.find(C + "content")
        if root.get("class") == "introduction":
            page = f"{number}-why-it-matters"
            label = f"{number} {chapter_title}: {title}"
        else:
            page = f"{number}-{slug(title)}"
            label = f"{number.replace('-', '.')} {title}"
        sections = [s for s in blocks(content, "", []) if any(p.strip() for p in s["paragraphs"])]
        if sections:
            docs.append({"ref": mid, "title": label, "url": module_url(book, page, mid, source_url), "publishedOn": None, "sections": sections})

    for el in col.find("col:content", NS):
        if el.tag.endswith("module"):
            continue  # the preface: about OpenStax, not finance
        elif el.tag.endswith("subcollection"):
            chapter += 1
            chapter_title = el.find("md:title", NS).text
            section = 0
            for m in el.find("col:content", NS):
                mid = m.get("document")
                is_intro = ET.parse(f"{repo}/modules/{mid}/index.cnxml").getroot().get("class") == "introduction"
                if is_intro:
                    module(mid, str(chapter), chapter_title)
                else:
                    section += 1
                    module(mid, f"{chapter}-{section}", chapter_title)
    with open(out_path, "w") as f:
        json.dump(docs, f, ensure_ascii=False, indent=1)
    words = sum(len(p.split()) for d in docs for s in d["sections"] for p in s["paragraphs"])
    print(f"{len(docs)} documents, {words} words -> {out_path}")


if __name__ == "__main__":
    if len(sys.argv) not in (4, 5):
        sys.exit(__doc__)
    main(*sys.argv[1:])
