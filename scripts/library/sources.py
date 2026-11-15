"""Extractors for the rest of the Library's sources (#21). Python 3 standard library plus poppler's pdftotext/pdfimages/pdfinfo.

Run from the laptop, with a scratch folder OUTSIDE this repo (downloads are cached there):
  python3 -I scripts/library/sources.py <source> <scratch dir> <documents.json>
where <source> is one of: damodaran-papers, yale-econ-251, yale-econ-252, fed-explained,
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


# ---------------------------------------------------------------- FOMC historical records (#38)

FED = "https://www.federalreserve.gov"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
DATE = r"(" + "|".join(MONTHS) + r")\s+(\d{1,2}),\s+(\d{4})"


def iso_date(text):
    """The first "March 25, 1994" in some text as "1994-03-25", or None."""
    m = re.search(DATE, text)
    return f"{m.group(3)}-{MONTHS.index(m.group(1)) + 1:02d}-{int(m.group(2)):02d}" if m else None


def meeting_end(label, year):
    """The last day of a meeting from its year-page label: "February 3-4" -> 1994-02-04, "January 31-February 1" -> 1995-02-01."""
    last = label.split("-")[-1].strip()
    month = re.match(r"[A-Za-z]+", label).group(0)
    if re.match(r"[A-Za-z]", last):
        month, last = last.split()[0], last.split()[1]
    return f"{year}-{MONTHS.index(month) + 1:02d}-{int(re.match(r'\d+', last).group(0)):02d}"


def days_after(day, n):
    return time.strftime("%Y-%m-%d", time.gmtime(time.mktime(time.strptime(day, "%Y-%m-%d")) + n * 86400 + 43200))


def fomc_year_page(markup, year):
    """What one year page of the Board's FOMC historical materials lists, in meeting order:
    [{label, call, date, items: [{kind, url, releasedOn}]}]. Kinds: statement, minutes (not the links
    into another meeting's minutes), policy-record (Record of Policy Actions) and beige-book (dated by its
    file name). Transcripts, Greenbooks, Bluebooks, agendas and Minutes of Actions are left out."""
    meetings = []
    for panel in re.split(r'<div class="panel-heading">', markup)[1:]:
        header = re.search(r"<h5>(.*?)</h5>", panel, re.S)
        label = " ".join(html.unescape(re.sub(r"<[^>]+>", "", header.group(1) if header else "")).split())
        m = re.fullmatch(r"(.+?) (Meeting|Conference Call) - (\d{4})", label)
        if not m:
            continue
        meeting = {"label": f"{m.group(1)}, {m.group(3)}", "call": m.group(2) == "Conference Call", "date": meeting_end(m.group(1), m.group(3)), "items": []}
        for href, text, after in re.findall(r'<a href="([^"]*)"[^>]*>(.*?)</a>([^<]*)', panel, re.S):
            text = " ".join(html.unescape(re.sub(r"<[^>]+>", "", text)).split())
            url = FED + href if href.startswith("/") else href
            if not href or "#" in href:
                continue
            if text == "Statement":
                meeting["items"].append({"kind": "statement", "url": url, "releasedOn": meeting["date"]})
            elif text == "Minutes":
                meeting["items"].append({"kind": "minutes", "url": url, "releasedOn": iso_date(after)})
            elif text.startswith("Record of Policy Actions") and href.endswith(".pdf"):
                meeting["items"].append({"kind": "policy-record", "url": url, "releasedOn": None})
            elif (b := re.search(r"beige(\d{4})(\d{2})(\d{2})\.pdf$", href)):
                meeting["items"].append({"kind": "beige-book", "url": url, "releasedOn": f"{b.group(1)}-{b.group(2)}-{b.group(3)}"})
        meetings.append(meeting)
    return meetings


def fomc_html_sections(markup, kind):
    """The words of an FOMC statement or minutes page as sections: without the press-release header, the
    list of those present, the signature, the footnotes and the site footer. Layout tables are read as
    plain text, so a page set inside one table cell keeps its paragraphs."""
    markup = re.sub(r"</?(table|tbody|thead|center)\b[^>]*>", "<div>", markup, flags=re.I)
    markup = re.sub(r"</?tr\b[^>]*>", "<br>", markup, flags=re.I)
    markup = re.sub(r"</?t[dh]\b[^>]*>", " ", markup, flags=re.I)
    blocks = []
    for kind_, text in html_blocks(markup):
        if re.match(r"(Home \||Footnotes$|Last update)", text, re.I):
            break
        if not re.fullmatch(r"(Release Date: .*|For immediate release|Return to top|\d{4} Monetary policy|Present:?)", text, re.I):
            blocks.append((kind_, text))
    starts = [i for i, (_, t) in enumerate(blocks) if t.startswith("For immediate release") or t.startswith("A meeting of the Federal Open Market Committee")]
    if kind == "minutes" and starts:
        # The attendance list: names, one a line, until the first sentence that is not about a person.
        opening, rest = blocks[starts[0]], blocks[starts[0] + 1 :]
        title = r"(Mr|Ms|Mrs|Miss|Messrs|Mmes|Dr)\.?\s"
        first = next((i for i, (_, t) in enumerate(rest) if len(t.split()) >= 12 and t.rstrip().endswith(".") and not re.match(title, t)), 0)
        blocks = [opening] + rest[first:]
        end = next((i for i, (_, t) in enumerate(blocks) if t.startswith("The meeting adjourned")), None)
        blocks = blocks[: end + 1] if end is not None else blocks
    return sections_from_blocks(blocks)


def layout_paragraphs(page):
    """Paragraphs from one page of `pdftotext -layout` text, as a typewritten record sets them: a new paragraph
    starts on an indented line or after a short line (the last line of a paragraph, or a heading). Returns
    (paragraphs, whether the first line goes on from the previous page)."""
    lines = [l.rstrip() for l in page.splitlines() if l.strip()]
    lines = [l for l in lines if not re.fullmatch(r"\s*(-\s*\d{1,3}\s*-|\d{1,2}/\d{1,2}/\d{2}(\s+-\s*\d{1,3}\s*-)?|(page\s*)?\d{1,3})\s*", l, re.I)]
    if not lines:
        return [], False
    base = min(len(l) - len(l.lstrip()) for l in lines)
    full = sorted(len(l.strip()) for l in lines)[int(len(lines) * 0.8)]
    paras, current, short = [], [], False
    for l in lines:
        indented = len(l) - len(l.lstrip()) - base >= 3
        if current and (indented or short):
            paras.append("\n".join(current))
            current = []
        current.append(" ".join(l.split()))
        short = len(l.strip()) < 0.7 * full
    paras.append("\n".join(current))
    return paras, not (len(lines[0]) - len(lines[0].lstrip()) - base >= 3)


def layout_document(pages, ref, title, url, published_on):
    """A typewritten PDF (pages of `pdftotext -layout` text) as a document: paragraphs rebuilt from the layout,
    joined across page breaks, and numbered headings ("2. Authorization for domestic open market operations")
    starting sections."""
    stripped = strip_running_lines([{"text": p} for p in pages])
    paras = []
    for page in stripped:
        found, goes_on = layout_paragraphs(page["text"])
        if found and goes_on and paras and not re.search(r"[.:;?!\"”)]$", paras[-1]):
            paras[-1] += "\n" + found.pop(0)
        paras += found
    blocks = [("h", " ".join(p.split())) if re.fullmatch(r"\d{1,2}\.\s+[A-Z][^.]{2,80}", " ".join(p.split())) else ("p", p) for p in paras]
    return {"ref": ref, "title": title, "url": url, "publishedOn": published_on, "sections": sections_from_blocks(blocks)}


def release_cover(page):
    """The release date on a Record of Policy Actions' press-release cover ("March 23, 1979 ... today released
    the attached record of policy actions"), or None when the first page is not such a cover."""
    if not re.search(r"today\s+released|released\s+the\s+attached", page, re.I):
        return None
    return iso_date(page)


def text_layer_reasons(reference, docs):
    """{ref: reasons} for PDF documents, from scripts/library/text-layer.mjs (corruptionReasons and the joined-word check of src/library/prepare.ts)."""
    if not docs:
        return {}
    script = Path(__file__).resolve().with_name("text-layer.mjs")
    result = subprocess.run(["node", str(script)], input=json.dumps({"reference": reference, "docs": docs}), capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def fomc_historical(scratch, out, first=1979, last=2001, beige_books=False):
    """FOMC records the Board published at the time, 1979-2001, each dated by its own release: statements
    (from February 1994, dated by the meeting), minutes (from February 1993, dated by the "Released" date on the
    year page), Records of Policy Actions (to 1992, PDF, dated by their press-release cover, or a week after the
    next meeting where the cover is missing) and, with beige_books, Beige Books (PDF, dated by file name).
    A PDF goes in only when its text layer passes text-layer.mjs; the rest are listed in
    <scratch>/fomc-historical.dropped.json with the reason."""
    scratch = Path(scratch)
    cache = scratch / "fomc"
    fetch(f"{FED}/monetarypolicy/fomc_historical.htm", cache / "fomc_historical.htm")
    meetings = []
    for year in range(first, last + 1):
        meetings += fomc_year_page(fetch(f"{FED}/monetarypolicy/fomchistorical{year}.htm", cache / f"fomchistorical{year}.htm"), year)
    scheduled = sorted(m["date"] for m in meetings if not m["call"])
    html_docs, pdf_docs, dropped, fallback = [], [], [], []
    for meeting in meetings:
        for item in meeting["items"]:
            name = item["url"].removeprefix(FED + "/").strip("/").replace("/", "_")
            day = meeting["date"].replace("-", "")
            if item["kind"] in ("statement", "minutes"):
                if not item["releasedOn"]:
                    dropped.append({"url": item["url"], "year": meeting["date"][:4], "reason": "no release date on the year page"})
                    continue
                markup = fetch(item["url"], cache / (name if name.endswith("htm") else name + ".htm"))
                sections = fomc_html_sections(markup, item["kind"])
                if item["kind"] == "statement":
                    released = max(item["releasedOn"], iso_date(re.search(r"Release Date:.*", markup).group(0)) if "Release Date:" in markup else item["releasedOn"])
                    title = f"FOMC statement, {iso_label(released)}" + (" (after a conference call)" if meeting["call"] else "")
                    doc = {"ref": f"statement-{day}", "title": title, "url": item["url"], "publishedOn": released, "sections": sections}
                else:
                    doc = {"ref": f"minutes-{day}", "title": f"FOMC minutes, meeting of {meeting['label']}", "url": item["url"], "publishedOn": item["releasedOn"], "sections": sections}
                if sections:
                    html_docs.append(doc)
                else:
                    dropped.append({"url": item["url"], "year": meeting["date"][:4], "reason": "no text found on the page"})
            elif item["kind"] == "policy-record" or (item["kind"] == "beige-book" and beige_books):
                path = cache / name
                try:
                    fetch(item["url"], path, binary=True)
                except Exception as e:
                    dropped.append({"url": item["url"], "year": meeting["date"][:4], "reason": f"download failed: {e}"})
                    continue
                pages = run("pdftotext", "-layout", str(path), "-").split("\f")
                if sum(len(p.split()) for p in pages) < 50 * max(1, len([p for p in pages if p.strip()]) // 4):
                    dropped.append({"url": item["url"], "year": meeting["date"][:4], "reason": "no text layer (a scan)"})
                    continue
                if item["kind"] == "policy-record":
                    released = release_cover(pages[0])
                    if released and meeting["date"] < released <= days_after(meeting["date"], 120):
                        pages = pages[1:]
                    else:
                        later = [d for d in scheduled if d > meeting["date"]]
                        released = days_after(later[0], 7) if later else days_after(meeting["date"], 60)
                        fallback.append(item["url"])
                    doc = layout_document(pages, f"policy-record-{day}", f"FOMC Record of Policy Actions, meeting of {meeting['label']}", item["url"], released)
                else:
                    doc = layout_document(pages, f"beige-book-{item['releasedOn'].replace('-', '')}", f"Beige Book, {iso_label(item['releasedOn'])}", item["url"], item["releasedOn"])
                pdf_docs.append(doc)
    reasons = text_layer_reasons(html_docs, pdf_docs)
    docs = html_docs[:]
    for doc in pdf_docs:
        if reasons.get(doc["ref"]):
            dropped.append({"url": doc["url"], "year": doc["ref"].rsplit("-", 1)[1][:4], "reason": "; ".join(reasons[doc["ref"]])})
        else:
            docs.append(doc)
    docs.sort(key=lambda d: (d["publishedOn"], d["ref"]))
    Path(out).write_text(json.dumps(docs))
    (scratch / "fomc-historical.dropped.json").write_text(json.dumps(dropped, indent=1))
    count = {}
    for d in docs:
        kind = d["ref"].rsplit("-", 1)[0]
        count[kind] = count.get(kind, 0) + 1
    print(f"FOMC {first}-{last}: {len(docs)} documents {count}, {sum(len(p.split()) for d in docs for s in d['sections'] for p in s['paragraphs'])} words")
    if fallback:
        print(f"{len(fallback)} Records of Policy Actions had no release cover; dated a week after the next meeting")
    for d in dropped:
        print(f"dropped {d['year']} {d['url']}: {d['reason']}")


def iso_label(day):
    """1994-02-04 -> "February 4, 1994"."""
    y, m, d = day.split("-")
    return f"{MONTHS[int(m) - 1]} {int(d)}, {y}"


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
    else:
        sys.exit(f"unknown source {source}")


if __name__ == "__main__":
    main()
