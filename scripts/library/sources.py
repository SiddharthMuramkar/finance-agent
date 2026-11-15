"""Extractors for the rest of the Library's sources (#21). Python 3 standard library plus poppler's pdftotext/pdfimages/pdfinfo.

Run from the laptop, with a scratch folder OUTSIDE this repo (downloads are cached there):
  python3 -I scripts/library/sources.py <source> <scratch dir> <documents.json>
where <source> is one of: damodaran-papers, yale-econ-251, yale-econ-252, fed-explained,
nyfed, sec-anthropic-s1, sec-amazon-1997-2000, sec-webvan-1999-2001, sec-wework-s1-2019. Each writes a JSON list of
documents ({ref, title, url, publishedOn, sections}) for `npm run library:load`, which cleans, cuts, repairs and checks
the text. Nothing extracted is written into the repo: the source text lives only in the private database.

Every request sends a descriptive User-Agent and waits between requests. SEC EDGAR's fair-access rule
(at most 10 requests a second, a declared User-Agent) is far from reached: a source is a few submissions pages and
one file per filing, 0.6 s apart.

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
SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header", "form", "button", "iframe", "object", "video", "audio"}


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


SUBMISSIONS = "https://data.sec.gov/submissions/"


def filing_row(submissions, accession, load_page):
    """One filing's row ({accessionNumber, filingDate, form, primaryDocument, ...}) from a submissions record. filings.recent holds only
    the latest filings; older ones are in the pages that filings.files names, which load_page(name) reads (only as far as needed)."""
    tables = [submissions["filings"]["recent"]]
    pages = [f["name"] for f in submissions["filings"].get("files", [])]
    while tables:
        table = tables.pop(0)
        if accession in table["accessionNumber"]:
            i = table["accessionNumber"].index(accession)
            return {key: column[i] for key, column in table.items() if isinstance(column, list) and len(column) > i}
        if pages:
            tables.append(load_page(pages.pop(0)))
    raise KeyError(f"accession {accession} is not in the submissions record of {submissions.get('name')}")


def sec_filing_row(cik, accession, scratch):
    """The company's EDGAR name and one filing's row: the submissions API confirms the accession and gives the filing date."""
    scratch = Path(scratch)
    sub = json.loads(fetch(f"{SUBMISSIONS}CIK{cik}.json", scratch / f"submissions-{cik}.json", ua=SEC_UA))
    return sub["name"], filing_row(sub, accession, lambda name: json.loads(fetch(SUBMISSIONS + name, scratch / name, ua=SEC_UA)))


def sec_filing(cik, accession, document, title, scratch, out, published_on=None, reader="layout", company=None):
    """One SEC filing's main document. The submissions API confirms the accession and filing date first.
    reader "layout": EDGAR's page-box rendering (layout_pages_to_document); "flowing": one long HTML document (flowing_html_sections)."""
    scratch = Path(scratch)
    name, row = sec_filing_row(cik, accession, scratch)
    filed = row["filingDate"]
    assert row["primaryDocument"] == document, (row["primaryDocument"], document)
    url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession.replace('-', '')}/{document}"
    markup = fetch(url, scratch / f"{accession}-{document}", ua=SEC_UA)
    ref, full_title = f"{row['form'].lower()}-{accession}", f"{company or name}: {title}"
    if reader == "flowing":
        doc = {"ref": ref, "title": full_title, "url": url, "publishedOn": filed, "sections": flowing_html_sections(markup)}
    else:
        doc = layout_pages_to_document(markup, ref, full_title, url, filed)
    Path(out).write_text(json.dumps([doc]))
    print(f"{company or name} {row['form']} filed {filed} ({accession}): {len(doc['sections'])} sections, {sum(len(p.split()) for s in doc['sections'] for p in s['paragraphs'])} words")


PAGE_NUMBER = re.compile(r"\s*(page\s*)?((F|II|A)-)?(\d{1,3}|[ivxlc]{1,6})\s*", re.I)


def flowing_html_sections(markup):
    """A filing typeset as one flowing HTML document (no page boxes), read with html_blocks + sections_from_blocks. Its section titles are
    the paragraphs that hold a table-of-contents target (<A NAME="toc...">), so those become headings; the "Table of Contents" back-link
    at the top of every page, the contents table itself and bare page numbers are left out."""
    body = re.sub(r'<h5[^>]*>\s*<a href="[^"]*#toc">\s*Table of Contents\s*</a>\s*</h5>', "", markup, flags=re.I)
    pieces, at, low = [], 0, body.lower()
    for anchor in re.finditer(r'<a name="toc[^"]*">', body, re.I):
        start = low.rfind("<p", 0, anchor.start())
        end = low.find("</p>", anchor.end())
        if start < at or end < 0:
            continue  # a second anchor in a heading already rewritten
        pieces += [body[at:start], "<h2>", body[body.find(">", start) + 1 : end], "</h2>"]
        at = end + len("</p>")
    body = "".join(pieces) + body[at:]
    sections = []
    for s in sections_from_blocks(html_blocks(body)):
        paras = [p for p in s["paragraphs"] if not PAGE_NUMBER.fullmatch(p)]
        if paras and s["heading"].lower() != "table of contents":
            sections.append({"heading": s["heading"], "paragraphs": paras})
    return sections


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


# ---------------------------------------------------------------- EDGAR plain text (1990s filings)

def first_sgml_document(submission):
    """The main form of an EDGAR full-submission .txt: the <TEXT> of its FIRST <DOCUMENT> only (the exhibits after it can be
    uuencoded binaries), with that document's <TYPE>. Text without <DOCUMENT> tags is returned whole, type None."""
    start = submission.find("<DOCUMENT>")
    if start < 0:
        return submission, None
    end = submission.find("</DOCUMENT>", start)
    doc = submission[start : end if end > 0 else len(submission)]
    kind = re.search(r"<TYPE>([^\n<]+)", doc)
    text = re.search(r"<TEXT>(.*?)(?:</TEXT>|$)", doc, re.S)
    return (text.group(1) if text else doc), (kind.group(1).strip() if kind else None)


ITEM_LINE = re.compile(r"\s*ITEM\s+\d+[A-Z]?(\.|\s{2,}|\s+[A-Z]{2})", re.I)
PART_LINE = re.compile(r"\s*PART\s+[IV]+\b", re.I)
TOC_LINE = re.compile(r".*\.{4,}\s*((F|II|A)-)?(\d{1,3}|[ivx]+)\s*", re.I)
RULE_LINE = re.compile(r"\s*([-=_*]\s*){3,}")
TABLE_MARKUP = re.compile(r"\s*</?(TABLE|CAPTION|S|C|FN|F\d*)>", re.I)


def _is_toc(lines):
    """A contents list: most of its lines end in a dot leader and a page number."""
    return sum(1 for l in lines if TOC_LINE.fullmatch(l)) * 2 >= len(lines)


def _table_row(line):
    """A fixed-width table row as cells: runs of two or more spaces split columns; dot leaders and rules go."""
    cells = [re.sub(r"\s*\.{2,}\s*$", "", c).strip() for c in re.split(r"\s{2,}", line.strip())]
    return " | ".join(c for c in cells if c and not RULE_LINE.fullmatch(c))


def _is_caps_heading(lines):
    """A short all-capitals block such as GENERAL or RISK FACTORS: a sub-heading."""
    text = " ".join(l.strip() for l in lines)
    return (
        len(lines) <= 2 and len(text.split()) <= 12 and re.search(r"[A-Z]{2}", text) is not None and re.search(r"[a-z]", text) is None
        and not re.match(r"[(\[$\d]", text) and not text.endswith((",", ";", ":"))
    )


def plain_text_document(submission, ref, title, url, filed):
    """An EDGAR plain-text filing (the 1990s, before HTML) as a document. Only the first <DOCUMENT> is read. Paragraphs are blocks of
    lines between blank lines; a paragraph cut by a page break (<PAGE> and the page number above it) is joined back unless the page ended
    on a full stop. "ITEM n." lines are the section headings, and a short all-capitals line under one (GENERAL, COMPETITION) is added to it
    as a sub-heading; a prospectus, which has no ITEMs, is headed by its centred all-capitals titles instead. Fixed-width <TABLE> rows
    become "a | b | c" paragraphs; contents lists, PART lines, running heads and rules are left out."""
    text, _ = first_sgml_document(submission)
    lines = text.replace("\r\n", "\n").split("\n")
    # A page break: each <PAGE> marker (and the end), with the page number and blank lines just above it.
    breaks = set()
    for i in [i for i, l in enumerate(lines) if l.strip().upper().startswith("<PAGE>")] + [len(lines)]:
        breaks.add(i)
        j = i - 1
        while j >= 0 and not lines[j].strip():
            breaks.add(j)
            j -= 1
        if j >= 0 and PAGE_NUMBER.fullmatch(lines[j]):
            breaks.add(j)
            j -= 1
            while j >= 0 and not lines[j].strip():
                breaks.add(j)
                j -= 1
    blocks, current, table, page_break = [], [], None, False

    def close():
        nonlocal current
        if current:
            blocks.append(("text", current))
        current = []

    for i, line in enumerate(lines):
        stripped = line.strip()
        if table is not None:  # inside a <TABLE>: rows only
            if re.match(r"</TABLE>", stripped, re.I):
                if table:
                    blocks.append(("table", table))
                table = None
            elif i not in breaks and stripped and not TABLE_MARKUP.match(stripped) and not RULE_LINE.fullmatch(stripped):
                table.append(line)
            continue
        if i in breaks:
            page_break = True
            continue
        if re.match(r"<TABLE>", stripped, re.I):
            close()
            table, page_break = [], False
            continue
        if not stripped or RULE_LINE.fullmatch(stripped) or TABLE_MARKUP.match(stripped):
            if not page_break:
                close()
            continue
        if page_break:  # the page ended mid-paragraph unless its last line closed a sentence or was a heading
            page_break = False
            if current and (re.search(r"[.!?:;\"”)]$", current[-1].strip()) or ITEM_LINE.match(current[0]) or _is_caps_heading(current)):
                close()
        current.append(line)
    close()

    caps = [" ".join(" ".join(b).split()) for k, b in blocks if k == "text" and _is_caps_heading(b) and not ITEM_LINE.match(b[0])]
    running = {c for c in caps if caps.count(c) >= 3 or "(CONTINUED)" in c}  # running heads at the top of each page
    out, top, in_items = [], "", False
    for kind, block in blocks:
        if _is_toc(block):
            continue
        if kind == "table":
            out += [("p", row) for row in map(_table_row, block) if row]
            continue
        if ITEM_LINE.match(block[0]):
            head = block if len(block) <= 3 and len(" ".join(block).split()) <= 30 else block[:1]
            top, in_items = " ".join(" ".join(head).split()), True
            out.append(("h", top))
            rest = block[len(head) :]
            if rest:
                out.append(("p", " ".join(" ".join(rest).split())))
            continue
        if (PART_LINE.match(block[0]) and len(" ".join(block).split()) <= 10) or " ".join(" ".join(block).split()) in running:
            continue
        if _is_caps_heading(block):
            text = " ".join(" ".join(block).split())
            if text in ("TABLE OF CONTENTS", "INDEX"):  # its list is gone; what follows is untitled front text
                out.append(("h", ""))
                continue
            # A prospectus has no ITEMs: its centred titles (RISK FACTORS, BUSINESS) lead, its flush-left ones are sub-headings.
            if not in_items and len(block[0]) - len(block[0].lstrip()) >= 10:
                top = text
                out.append(("h", top))
            else:
                out.append(("h", f"{top} — {text}" if top else text))
            continue
        out.append(("p", " ".join(" ".join(block).split())))
    return {"ref": ref, "title": title, "url": url, "publishedOn": filed, "sections": sections_from_blocks(out)}


def sec_plain_filings(cik, company, accessions, scratch, out):
    """Plain-text EDGAR filings of one company, one document each, dated by filing date: the full-submission .txt is read (old rows often
    have no primaryDocument), and its first <DOCUMENT> must be the form the submissions API lists."""
    scratch = Path(scratch)
    docs = []
    for accession in accessions:
        _, row = sec_filing_row(cik, accession, scratch)
        url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession.replace('-', '')}/{accession}.txt"
        submission = fetch(url, scratch / f"{accession}.txt", ua=SEC_UA)
        _, form = first_sgml_document(submission)
        assert form == row["form"], (accession, form, row["form"])
        period = re.search(r"CONFORMED PERIOD OF REPORT:\s*(\d{4})(\d{2})(\d{2})", submission)
        when = f"period ended {period.group(1)}-{period.group(2)}-{period.group(3)}, " if period else ""
        doc = plain_text_document(submission, f"{form.lower()}-{accession}", f"{company} Form {form} ({when}filed {row['filingDate']})", url, row["filingDate"])
        words = sum(len(p.split()) for s in doc["sections"] for p in s["paragraphs"])
        print(f"{company} {form} filed {row['filingDate']} ({accession}): {len(doc['sections'])} sections, {words} words")
        docs.append(doc)
    Path(out).write_text(json.dumps(docs))
    print(f"{company}: {len(docs)} filings, {sum(len(p.split()) for d in docs for s in d['sections'] for p in s['paragraphs'])} words")


# Accessions confirmed in the EDGAR submissions API (#27 research, #38). Amazon: every 10-K and 10-Q from the 10-K405 for 1997
# (filed 1998-03-30) to the 10-K for 1999 (filed 2000-03-29); its 1990s rows sit in the filings.files pages. Webvan: the S-1, the
# 424B1 prospectus of its IPO, and the 10-K405 and 10-K, whose filing dates are Webvan Case dates.
AMAZON_FILINGS = [
    "0000891020-98-000448",  # 10-K405, 1998-03-30
    "0000891020-98-000846",  # 10-Q, 1998-05-15
    "0000891020-98-001313",  # 10-Q, 1998-08-14
    "0000891020-98-001632",  # 10-Q, 1998-11-13
    "0000891020-99-000375",  # 10-K, 1999-03-05
    "0000891020-99-000894",  # 10-Q, 1999-05-17
    "0000891020-99-001426",  # 10-Q, 1999-08-16
    "0000891020-99-001938",  # 10-Q, 1999-11-15
    "0000891020-00-000622",  # 10-K, 2000-03-29
]
WEBVAN_FILINGS = [
    "0000891618-99-003537",  # S-1, 1999-08-06
    "0000891618-99-004914",  # 424B1, 1999-11-05
    "0000891618-00-001877",  # 10-K405, 2000-03-30
    "0001012870-01-001485",  # 10-K, 2001-04-02
]



def main():
    source, scratch, out = sys.argv[1:4]
    Path(scratch).mkdir(parents=True, exist_ok=True)
    if source == "damodaran-papers":
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
    elif source == "sec-amazon-1997-2000":
        sec_plain_filings("0001018724", "Amazon.com, Inc.", AMAZON_FILINGS, scratch, out)
    elif source == "sec-webvan-1999-2001":
        sec_plain_filings("0001092657", "Webvan Group, Inc.", WEBVAN_FILINGS, scratch, out)
    elif source == "sec-wework-s1-2019":
        # the S-1 as filed on 2019-08-14 only: the September amendments come after every WeWork Case date (reveal material)
        sec_filing("0001533523", "0001193125-19-220499", "d781982ds1.htm", "Form S-1 registration statement", scratch, out, reader="flowing", company="The We Company")
    else:
        sys.exit(f"unknown source {source}")


if __name__ == "__main__":
    main()
