"""Extractors for the rest of the Library's sources (#21). Python 3 standard library plus poppler's pdftotext/pdfimages/pdfinfo.

Run from the laptop, with a scratch folder OUTSIDE this repo (downloads are cached there):
  python3 -I scripts/library/sources.py <source> <scratch dir> <documents.json>
where <source> is one of: damodaran-blog, damodaran-papers, yale-econ-251, yale-econ-252, fed-explained,
nyfed, sec-anthropic-s1. Each writes a JSON list of documents ({ref, title, url, publishedOn, sections})
for `npm run library:load`, which cleans, cuts, repairs and checks the text. Nothing extracted is
written into the repo: the source text lives only in the private database.

Every request sends a descriptive User-Agent and waits between requests. SEC EDGAR's fair-access rule
(at most 10 requests a second, a declared User-Agent) is far from reached: the S-1 is one document.

PDF sources also write <scratch>/<source>.vision-candidates.json (pages with a picture and hardly any
text, where a chart or scanned slide hides the content). `node scripts/library/vision.mjs` reads
those pages as images and writes <scratch>/<source>.vision.json, which this script merges back in.
"""

import html
import json
import re
import subprocess
import sys
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

UA = "finance-agent-library/1.0 (siddharth.muramkar@icloud.com; private study use)"
SEC_UA = "Siddharth Muramkar siddharth.muramkar@icloud.com"
PAUSE = 0.6


def fetch(url, cache, ua=UA, binary=False):
    """GET with a descriptive User-Agent, cached on disk; waits a little after each real request."""
    cache = Path(cache)
    if cache.exists() and cache.stat().st_size > 0:
        data = cache.read_bytes()
    else:
        for attempt in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": ua})
                with urllib.request.urlopen(req, timeout=120) as r:
                    data = r.read()
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(2 * (attempt + 1))
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(data)
        time.sleep(PAUSE)
    return data if binary else data.decode("utf-8", "replace")


# ---------------------------------------------------------------- HTML to blocks

BLOCK = {"p", "div", "br", "li", "ul", "ol", "tr", "table", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "pre", "hr"}
SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header", "form", "button", "iframe"}


class Blocks(HTMLParser):
    """Turns HTML into a list of (kind, text) blocks, kind 'h' for headings and 'p' otherwise. Table rows become 'a | b | c'."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks, self.buf, self.skip, self.heading, self.cells, self.cell = [], [], 0, 0, None, None

    def flush(self):
        text = " ".join("".join(self.buf).split())
        self.buf = []
        if text:
            self.blocks.append(("h" if self.heading else "p", text))

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip += 1
        elif tag in ("td", "th"):
            self.cell = []
        elif tag == "tr":
            self.flush()
            self.cells = []
        elif tag in BLOCK:
            self.flush()
            if re.fullmatch(r"h[1-6]", tag):
                self.heading = int(tag[1])
        if tag == "li":
            self.buf.append("• ")

    def handle_endtag(self, tag):
        if tag in SKIP:
            self.skip = max(0, self.skip - 1)
        elif tag in ("td", "th") and self.cells is not None and self.cell is not None:
            cell = " ".join("".join(self.cell).split())
            self.cells.append(cell)
            self.cell = None
        elif tag == "tr" and self.cells is not None:
            row = " | ".join(c for c in self.cells if c)
            self.cells = None
            if row:
                self.blocks.append(("p", row))
        elif tag in BLOCK:
            self.flush()
            if re.fullmatch(r"h[1-6]", tag):
                self.heading = 0

    def handle_data(self, data):
        if self.skip:
            return
        (self.cell if self.cell is not None else self.buf).append(data)

    def close(self):
        super().close()
        self.flush()


def html_blocks(markup):
    parser = Blocks()
    parser.feed(markup)
    parser.close()
    return parser.blocks


def sections_from_blocks(blocks, first_heading=""):
    """Groups blocks into sections: a heading block starts a new section."""
    sections, heading, paras = [], first_heading, []
    for kind, text in blocks:
        if kind == "h":
            if paras:
                sections.append({"heading": heading, "paragraphs": paras})
            heading, paras = text, []
        else:
            paras.append(text)
    if paras:
        sections.append({"heading": heading, "paragraphs": paras})
    return sections


# ---------------------------------------------------------------- PDF

def run(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout


def pdf_pages(path):
    """Per-page text and picture counts: [{number, text, images}]."""
    text = run("pdftotext", str(path), "-")
    pages = text.split("\f")
    if pages and not pages[-1].strip():
        pages.pop()
    images = {}
    for line in run("pdfimages", "-list", str(path)).splitlines()[2:]:
        parts = line.split()
        if len(parts) > 2 and parts[0].isdigit():
            images[int(parts[0])] = images.get(int(parts[0]), 0) + 1
    return [{"number": i + 1, "text": t, "images": images.get(i + 1, 0)} for i, t in enumerate(pages)]


def strip_running_lines(pages):
    """Removes lines that repeat on many pages (running heads, footers) and bare page numbers."""
    counts = {}
    for p in pages:
        for line in {l.strip() for l in p["text"].splitlines() if l.strip()}:
            counts[line] = counts.get(line, 0) + 1
    limit = max(4, len(pages) * 0.3)
    for p in pages:
        keep = [l for l in p["text"].splitlines() if not re.fullmatch(r"\s*(page\s*)?\d{1,4}\s*", l, re.I) and counts.get(l.strip(), 0) < limit]
        p["text"] = "\n".join(keep)
    return pages


def pdf_document(ref, title, url, published_on, path, scratch_vision):
    """A PDF as a document, one section per page; page descriptions from vision are added where they exist."""
    pages = strip_running_lines(pdf_pages(path))
    vision = {}
    if scratch_vision and Path(scratch_vision).exists():
        vision = json.loads(Path(scratch_vision).read_text()).get(ref, {})
    sections = []
    for p in pages:
        paras = [" ".join(chunk.split()) for chunk in re.split(r"\n\s*\n", p["text"]) if chunk.strip()]
        if str(p["number"]) in vision:
            paras.append("[Chart or figure on this page, described from the page image: " + vision[str(p["number"])] + "]")
        if paras:
            sections.append({"heading": f"page {p['number']}", "paragraphs": paras})
    return {"ref": ref, "title": title, "url": url, "publishedOn": published_on, "sections": sections}, pages


def write_candidates(scratch, source, found):
    """found: {ref: (pdf path, [page numbers])} for the vision script."""
    path = Path(scratch) / f"{source}.vision-candidates.json"
    path.write_text(json.dumps({ref: {"pdf": str(pdf), "pages": pages} for ref, (pdf, pages) in found.items() if pages}, indent=1))
    n = sum(len(pages) for _, pages in found.values())
    print(f"{n} pages with a picture and hardly any text -> {path}")


def vision_pages(pages, max_words=40):
    return [p["number"] for p in pages if p["images"] > 0 and len(p["text"].split()) <= max_words]


# ---------------------------------------------------------------- sources

def damodaran_blog(scratch, out):
    docs, start = [], 1
    while True:
        url = f"https://aswathdamodaran.blogspot.com/feeds/posts/default?max-results=100&start-index={start}&alt=json"
        feed = json.loads(fetch(url, Path(scratch) / f"blog-{start}.json"))["feed"]
        entries = feed.get("entry", [])
        if not entries:
            break
        for e in entries:
            link = next((l["href"] for l in e["link"] if l["rel"] == "alternate"), None)
            if not link:
                continue
            title = e["title"]["$t"] or "Untitled post"
            blocks = html_blocks(e.get("content", {}).get("$t", ""))
            sections = sections_from_blocks(blocks)
            if not sections:
                continue
            docs.append({"ref": "post-" + e["id"]["$t"].rsplit("post-", 1)[-1], "title": title, "url": link, "publishedOn": e["published"]["$t"][:10], "sections": sections})
        start += len(entries)
        if start > int(feed["openSearch$totalResults"]["$t"]):
            break
    Path(out).write_text(json.dumps(docs))
    print(f"{len(docs)} blog posts, {sum(len(p.split()) for d in docs for s in d['sections'] for p in s['paragraphs'])} words")


def yale(course, scratch, out):
    """ECON 251 (Financial Theory, Geanakoplos, 2009) or ECON 252 (Financial Markets, Shiller, 2011): transcripts of every lecture."""
    slug, label, taught = {"251": ("econ-251", "ECON 251 Financial Theory", "2009"), "252": ("econ-252-11", "ECON 252 Financial Markets", "2011")}[course]
    base = f"https://oyc.yale.edu/economics/{slug}"
    index = fetch(f"https://oyc.yale.edu/economics/{slug.removesuffix('-11')}", Path(scratch) / f"yale-{slug}.html")
    lectures = sorted(set(re.findall(rf'href="/economics/{slug}/lecture-(\d+)"', index)), key=int)
    docs = []
    for n in lectures:
        page = fetch(f"{base}/lecture-{n}", Path(scratch) / f"yale-{slug}-{n}.html")
        start = page.find('id="transcript-top"')
        if start < 0:
            print(f"no transcript on lecture {n}")
            continue
        body = page[start:]
        body = body[body.find(">") + 1 :]
        end = body.find('class="element-hidden"')
        body = body[: end if end > 0 else len(body)]
        title_match = re.search(r"<h2>(.*?)</h2>", body, re.S)
        title = html.unescape(re.sub(r"<[^>]+>", "", title_match.group(1))).strip() if title_match else f"{label}, lecture {n}"
        title = re.sub(r"^ECON \d+ - ", "", title)
        # Chapter markers are <h3>; the transcript text follows as paragraphs inside the same <p>.
        body = re.sub(r"<h1.*?</h1>|<h2.*?</h2>", "", body, flags=re.S).replace("<p><h3>", "<h3>")
        sections = sections_from_blocks(html_blocks(body))
        if sections:
            docs.append({"ref": f"lecture-{n}", "title": f"{label}: {title}", "url": f"{base}/lecture-{n}", "publishedOn": None, "sections": sections})
    Path(out).write_text(json.dumps(docs))
    print(f"{label}: {len(docs)} lectures, {sum(len(p.split()) for d in docs for s in d['sections'] for p in s['paragraphs'])} words (taught {taught})")


def damodaran_papers(scratch, out):
    """Damodaran's papers page: every PDF it links under /pdfiles/papers/, dated by the file's own dates (the later of last-modified and PDF creation, so a paper is never dated earlier than it was published)."""
    scratch = Path(scratch)
    listing = fetch("https://pages.stern.nyu.edu/~adamodar/New_Home_Page/papers.html", scratch / "papers.html")
    names = {}
    for href, label in re.findall(r'<a [^>]*href="(https://www\.stern\.nyu\.edu/~adamodar/pdfiles/papers/[^"]+\.pdf)"[^>]*>(.*?)</a>', listing, re.S):
        names.setdefault(href, " ".join(html.unescape(re.sub(r"<[^>]+>", "", label)).split()))
    docs, candidates = [], {}
    for href, label in sorted(names.items()):
        name = href.rsplit("/", 1)[1]
        path = scratch / "damodaran-pdf" / name
        try:
            req = urllib.request.Request(href.replace("https://www.stern", "https://pages.stern"), headers={"User-Agent": UA})
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                with urllib.request.urlopen(req, timeout=120) as r:
                    path.write_bytes(r.read())
                    modified = r.headers.get("Last-Modified")
                time.sleep(PAUSE)
                (scratch / "damodaran-pdf" / (name + ".modified")).write_text(modified or "")
            if path.read_bytes()[:4] != b"%PDF":
                print(f"skipped (not a PDF): {name}")
                continue
        except Exception as e:
            print(f"skipped {name}: {e}")
            continue
        modified = (scratch / "damodaran-pdf" / (name + ".modified")).read_text() if (scratch / "damodaran-pdf" / (name + ".modified")).exists() else ""
        dates = []
        if modified:
            dates.append(time.strftime("%Y-%m-%d", time.strptime(modified, "%a, %d %b %Y %H:%M:%S GMT")))
        info = re.search(r"CreationDate:\s+(.*)", run("pdfinfo", str(path)))
        if info:
            for fmt in ("%a %b %d %H:%M:%S %Y",):
                try:
                    dates.append(time.strftime("%Y-%m-%d", time.strptime(re.sub(r"\s+[A-Z]{2,4}$", "", info.group(1).strip()), fmt)))
                except ValueError:
                    pass
        published = max(dates) if dates else "2026-11-02"
        doc, pages = pdf_document("paper-" + name[:-4], f"Damodaran: {label}", href, published, path, scratch / "damodaran-papers.vision.json")
        if doc["sections"]:
            docs.append(doc)
            candidates[doc["ref"]] = (path, vision_pages(pages))
    write_candidates(scratch, "damodaran-papers", candidates)
    Path(out).write_text(json.dumps(docs))
    print(f"{len(docs)} papers, {sum(len(p.split()) for d in docs for s in d['sections'] for p in s['paragraphs'])} words")


def fed_explained(scratch, out):
    url = "https://www.federalreserve.gov/aboutthefed/files/the-fed-explained.pdf"
    path = Path(scratch) / "the-fed-explained.pdf"
    fetch(url, path, binary=True)
    doc, pages = pdf_document("fed-explained", "The Fed Explained (11th edition)", url, None, path, Path(scratch) / "fed-explained.vision.json")
    write_candidates(scratch, "fed-explained", {doc["ref"]: (path, vision_pages(pages))})
    Path(out).write_text(json.dumps([doc]))
    print(f"{len(pages)} pages, {sum(len(p.split()) for s in doc['sections'] for p in s['paragraphs'])} words")


NYFED_PAGES = [
    "aboutthefed/history",
    "markets/domestic-market-operations/monetary-policy-implementation",
    "markets/domestic-market-operations/monetary-policy-implementation/treasury-securities",
    "markets/domestic-market-operations/monetary-policy-implementation/repo-reverse-repo-agreements",
    "markets/domestic-market-operations/monetary-policy-implementation/agency-mortgage-backed-securities",
    "markets/international-market-operations/foreign-exchange-operations",
    "markets/international-market-operations/central-bank-swap-arrangements",
    "markets/international-market-operations/foreign-reserves-management",
    "markets/reference-rates/sofr",
    "markets/reference-rates/effr",
    "markets/primarydealers",
    "markets/soma-holdings",
    "markets/treasury-debt-auctions-and-buybacks-as-fiscal-agent",
    "aboutthefed/whatwedo",
]


def nyfed(scratch, out):
    """New York Fed explainer pages, read as Markdown from <scratch>/nyfed/<path with / as ->.md (made by `firecrawl scrape <url> --only-main-content`); the Fedpoints series is retired."""
    docs = []
    for page in NYFED_PAGES:
        path = Path(scratch) / "nyfed" / (page.replace("/", "-") + ".md")
        if not path.exists():
            print(f"missing {path}; run: firecrawl scrape https://www.newyorkfed.org/{page} --only-main-content -o {path}")
            continue
        md = path.read_text()
        md = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", md)
        md = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", md)
        title = next((l[2:].strip() for l in md.splitlines() if l.startswith("# ")), page)
        blocks = []
        for chunk in re.split(r"\n\s*\n", md):
            chunk = " ".join(chunk.split())
            if not chunk or chunk.startswith("# ") or chunk.startswith("By continuing to use our site"):
                continue
            blocks.append(("h", chunk.lstrip("# ").strip()) if re.match(r"#{2,6} ", chunk) else ("p", chunk))
        for i, (kind, text) in enumerate(blocks):  # drop the page's data links, announcements and cookie notice
            if kind == "h" and text in ("Data", "Resources", "Announcements", "Related New York Fed Content", "Related External Content"):
                blocks = blocks[:i]
                break
        sections = sections_from_blocks(blocks)
        if sections:
            docs.append({"ref": page.replace("/", "-"), "title": f"New York Fed: {title}", "url": f"https://www.newyorkfed.org/{page}", "publishedOn": None, "sections": sections})
    Path(out).write_text(json.dumps(docs))
    print(f"{len(docs)} pages, {sum(len(p.split()) for d in docs for s in d['sections'] for p in s['paragraphs'])} words")


def sec_filing(cik, accession, document, title, scratch, out, published_on=None):
    """One SEC filing's main document. The submissions API confirms the accession and filing date first."""
    scratch = Path(scratch)
    sub = json.loads(fetch(f"https://data.sec.gov/submissions/CIK{cik}.json", scratch / f"submissions-{cik}.json", ua=SEC_UA))
    recent = sub["filings"]["recent"]
    idx = recent["accessionNumber"].index(accession)
    filed = recent["filingDate"][idx]
    assert recent["primaryDocument"][idx] == document, (recent["primaryDocument"][idx], document)
    url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession.replace('-', '')}/{document}"
    markup = fetch(url, scratch / f"{accession}-{document}", ua=SEC_UA)
    doc = layout_pages_to_document(markup, f"{recent['form'][idx].lower()}-{accession}", f"{sub['name']}: {title}", url, filed)
    Path(out).write_text(json.dumps([doc]))
    print(f"{sub['name']} {recent['form'][idx]} filed {filed} ({accession}): {len(doc['sections'])} sections, {sum(len(p.split()) for s in doc['sections'] for p in s['paragraphs'])} words")


def layout_pages_to_document(markup, ref, title, url, filed):
    """EDGAR's rendering of a filing that was typeset as pages: each page a box, each line an absolutely positioned <div> of <font> pieces.
    Lines are rebuilt from the pieces (a wide gap becomes a table cell break), paragraphs from the vertical spacing, and bold short
    lines become section headings. Each section's heading carries the page number where it starts."""
    body = markup[markup.find("<body"):]
    pages = re.split(r'<div style="[^"]*border:1px solid[^"]*">', body)[1:]
    sections, heading, paras, para, last_top, start_page, prev_heading = [], "Cover", [], [], None, 1, False

    def end_para():
        nonlocal para
        if para:
            paras.append(" ".join(para))
            para = []

    def end_section():
        nonlocal paras
        end_para()
        if paras:
            sections.append({"heading": f"{heading} (page {start_page})", "paragraphs": paras})
        paras = []

    for number, page in enumerate(pages, 1):
        last_top = None
        for line in re.findall(r'<div style="[^"]*?top:([\d.]+)pt[^"]*">(.*?)</div>', page, re.S):
            top, inner = float(line[0]), line[1]
            fonts = re.findall(r'<font style="([^"]*)">(.*?)</font>', inner, re.S)
            if not fonts:
                continue
            cells, bold, end_x, space = [], True, None, False
            for style, text in fonts:
                left = float(m.group(1)) if (m := re.search(r"left:([\d.]+)pt", style)) else 0.0
                width = float(m.group(1)) if (m := re.search(r"width:([\d.]+)pt", style)) else 0.0
                text = html.unescape(re.sub(r"<[^>]+>", "", text)).replace("\xa0", " ")
                if not text.strip():
                    end_x, space = left + width, True
                    continue
                bold = bold and "font-weight:bold" in style
                if cells and end_x is not None and left - end_x > 8:
                    cells.append(text.lstrip())
                elif cells:
                    # pieces set a hair apart with no space between them are separate words
                    glue = " " if (space or (end_x is not None and left - end_x > 0.8)) and not cells[-1].endswith(" ") and not text.startswith(" ") else ""
                    cells[-1] += glue + text
                else:
                    cells.append(text.lstrip())
                end_x, space = left + width, False
            text = " | ".join(c.strip() for c in cells if c.strip()).strip().replace("• | ", "• ")
            if not text or re.fullmatch(r"(\d{1,3}|[ivxlc]+)", text, re.I) or text.lower() in ("table of contents",):
                continue
            words = len(text.split())
            if bold and words <= 14 and not text.endswith((".", ",", ";")) and " | " not in text and top < 740:
                if prev_heading and last_top is not None and top - last_top < 14.5:
                    heading += " " + text  # a heading set over two lines
                else:
                    end_section()
                    heading, start_page = text, number
                prev_heading = True
                last_top = top
                continue
            prev_heading = False
            if last_top is not None and top - last_top > 14.5:
                end_para()
            para.append(text)
            last_top = top
    end_section()
    return {"ref": ref, "title": title, "url": url, "publishedOn": filed, "sections": sections}



def main():
    source, scratch, out = sys.argv[1:4]
    Path(scratch).mkdir(parents=True, exist_ok=True)
    if source == "damodaran-blog":
        damodaran_blog(scratch, out)
    elif source == "damodaran-papers":
        damodaran_papers(scratch, out)
    elif source == "yale-econ-251":
        yale("251", scratch, out)
    elif source == "yale-econ-252":
        yale("252", scratch, out)
    elif source == "fed-explained":
        fed_explained(scratch, out)
    elif source == "nyfed":
        nyfed(scratch, out)
    elif source == "sec-anthropic-s1":
        sec_filing("0002130357", "0001628280-26-067168", "anthropicpbc-sx1.htm", "Form S-1 registration statement", scratch, out)
    else:
        sys.exit(f"unknown source {source}")


if __name__ == "__main__":
    main()
