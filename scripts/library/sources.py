"""Extractors for the rest of the Library's sources (#21). Python 3 standard library plus poppler's pdftotext/pdfimages/pdfinfo.

Run from the laptop, with a scratch folder OUTSIDE this repo (downloads are cached there):
  python3 -I scripts/library/sources.py <source> <scratch dir> <documents.json>
where <source> is one of: damodaran-papers, fed-explained,
nyfed, investor-gov, fomc-historical, sec-anthropic-s1, sec-amazon-1997-2000, sec-webvan-1999-2001, sec-wework-s1-2019. Each writes a JSON
list of documents ({ref, title, url, publishedOn, sections}) for `npm run library:load`, which cleans, cuts, repairs and checks
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
from collections import Counter
from datetime import date, timedelta
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


# ---------------------------------------------------------------- Investor.gov explainers (#38)

INVESTOR_GOV = "https://www.investor.gov/"

# Paths from the site's sitemap (investor.gov/sitemap.xml, 2026-11-15): compounding, saving and risk, how markets work, the
# investment products (stocks, bonds, funds), four Investor Bulletins and the glossary entries the course leans on. Left out:
# pages on 2020s products (crypto assets, tokenized securities, Trump Accounts), fraud alerts and enforcement news.
INVESTOR_GOV_PAGES = [
    "additional-resources/information/youth/teachers-classroom-resources/what-compound-interest",
    "additional-resources/information/youth/teachers-classroom-resources/risk-and-return",
    "additional-resources/information/youth/teachers-classroom-resources/what-diversification",
    "additional-resources/information/youth/teachers-classroom-resources/why-save-and-invest",
    "introduction-investing/investing-basics/save-and-invest/small-savings-add-big-money",
    "introduction-investing/investing-basics/save-and-invest/understand-what-it-means-invest",
    "introduction-investing/investing-basics/save-and-invest/diversify-your-investments",
    "introduction-investing/investing-basics/save-and-invest/gauge-your-risk-tolerance",
    "introduction-investing/investing-basics/save-and-invest/learn-about-investment-options",
    "introduction-investing/investing-basics/save-and-invest/pay-credit-cards-or-other-high-interest",
    "introduction-investing/investing-basics/what-risk",
    "introduction-investing/getting-started/asset-allocation",
    "introduction-investing/getting-started/assessing-your-risk-tolerance",
    "introduction-investing/getting-started/understanding-fees",
    "introduction-investing/getting-started/five-questions-ask-you-invest",
    "introduction-investing/getting-started/researching-investments/how-read-10-k",
    "introduction-investing/investing-basics/how-stock-markets-work/public-companies",
    "introduction-investing/investing-basics/how-stock-markets-work/market-participants",
    "introduction-investing/investing-basics/how-stock-markets-work/types-orders",
    "introduction-investing/investing-basics/how-stock-markets-work/stock-purchases-and-sales-long-and",
    "introduction-investing/investing-basics/investment-products/stocks",
    "introduction-investing/investing-basics/investment-products/bonds-or-fixed-income-products/bonds",
    "introduction-investing/investing-basics/investment-products/bonds-or-fixed-income-products",  # corporate bonds
    "introduction-investing/investing-basics/investment-products/bonds-or-fixed-income-products/high",  # high-yield corporate bonds
    "introduction-investing/investing-basics/investment-products/bonds-or-fixed-income-products-0",  # municipal bonds
    "introduction-investing/investing-basics/investment-products/bonds-or-fixed-income-products/savings",  # savings bonds
    "introduction-investing/investing-basics/investment-products/certificates-deposit-cds",
    "introduction-investing/investing-basics/investment-products/mutual-funds-and-exchange-traded-funds-etfs/mutual-funds",
    "introduction-investing/investing-basics/investment-products/mutual-funds-and-exchange-traded-2",  # exchange-traded funds
    "introduction-investing/investing-basics/investment-products/mutual-funds-and-exchange-traded-4",  # index funds
    "introduction-investing/investing-basics/investment-products/mutual-funds-and-exchange-traded-5",  # money market funds
    "introduction-investing/investing-basics/investment-products/real-estate-investment-trusts-reits",
    "introduction-investing/investing-basics/investment-products/commodities",
    "introduction-investing/investing-basics/investment-products/international-investing",
    "introduction-investing/investing-basics/investment-products/private-investment-funds/hedge-funds",
    "introduction-investing/investing-basics/investment-products/private-investment-funds/private-equity",
    "introduction-investing/investing-basics/investment-products/annuities",
    "introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-86",  # interest rates up, fixed-rate bond prices down
    "introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/mutual-fund-and-etf-fees-and-expenses-investor-bulletin",
    "introduction-investing/general-resources/news-alerts/alerts-bulletins/characteristics-mutual-funds-exchange-traded-funds",
    "introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-24",  # exchange-traded funds
    "introduction-investing/investing-basics/glossary/compound-interest",
    "introduction-investing/investing-basics/glossary/basis-point",
    "introduction-investing/investing-basics/glossary/coupon-rate",
    "introduction-investing/investing-basics/glossary/yield",
    "introduction-investing/investing-basics/glossary/yield-curve",
    "introduction-investing/investing-basics/glossary/zero-coupon-bond",
    "introduction-investing/investing-basics/glossary/callable-or-redeemable-bonds",
    "introduction-investing/investing-basics/glossary/treasury-securities",
    "introduction-investing/investing-basics/glossary/price-earnings-pe-ratio",
    "introduction-investing/investing-basics/glossary/market-capitalization",
    "introduction-investing/investing-basics/glossary/dividend",
    "introduction-investing/investing-basics/glossary/expense-ratio",
    "introduction-investing/investing-basics/glossary/net-asset-value",
    "introduction-investing/investing-basics/glossary/initial-public-offering-ipo",
    "introduction-investing/investing-basics/glossary/prospectus",
    "introduction-investing/investing-basics/glossary/form-10-k",
    "introduction-investing/investing-basics/glossary/dollar-cost-averaging",
]

# Where a page's own text ends: the link lists under these headings.
INVESTOR_GOV_STOP = re.compile(r"(additional|related|more) (information|resources|reading|links)|for more information|related investor (alerts|bulletins)", re.I)
# The staff-views disclaimer under every Investor Bulletin and Alert, and the service note on some pages.
INVESTOR_GOV_DISCLAIMER = re.compile(r"represents the views of the staff|has provided this information as a service to investors", re.I)


def element_inner(markup, start):
    """The inner HTML of the element whose opening tag starts at markup[start], up to its matching closing tag (nested ones counted)."""
    tag = re.match(r"<(\w+)", markup[start:]).group(1)
    open_end = markup.find(">", start) + 1
    depth = 1
    for m in re.finditer(rf"<(/?){tag}\b[^>]*>", markup[open_end:], re.I):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return markup[open_end : open_end + m.start()]
    return markup[open_end:]


def _drop_link_only(markup, tag):
    """Removes each <p> or <li> whose text is all links (a jump list to the page's own sections, a list of other pages)."""

    def keep(m):
        inner = m.group(2)
        rest = re.sub(r"<a\b[^>]*>.*?</a>|<br\s*/?>|<[^>]+>|&nbsp;|\s", "", inner, flags=re.I | re.S)
        return "" if not rest and re.search(r"<a\b", inner, re.I) else m.group(0)

    return re.sub(rf"(<{tag}\b[^>]*>)(.*?)</{tag}>", keep, markup, flags=re.I | re.S)


def investor_gov_page(markup):
    """One Investor.gov page as {title, sections}: the text of the page's own body (the first body field inside <article>: an
    article's or glossary entry's field--name-body, a bulletin's article-body), so the navigation, the date line, the featured cards
    and the footer stay out. Jump links and link-only lines go, the link lists under "Additional information" and the like end the
    text, and the staff-views disclaimer goes. Videos and pictures are left out (text only)."""
    heading = re.search(r'<h1[^>]*field--name-title[^>]*>(.*?)</h1>', markup, re.S) or re.search(r"<title>(.*?)</title>", markup, re.S)
    title = " ".join(html.unescape(re.sub(r"<[^>]+>", "", heading.group(1) if heading else "")).split()).removesuffix(" | Investor.gov")
    start = markup.find("<article")
    if start < 0:
        return {"title": title, "sections": []}
    article = element_inner(markup, start)
    body = re.search(r'<div\b[^>]*class="[^"]*\b(field--name-body|article-body)\b[^"]*"', article)
    if not body:
        return {"title": title, "sections": []}
    inner = _drop_link_only(_drop_link_only(element_inner(article, body.start()), "p"), "li")
    blocks = []
    for kind, text in html_blocks(inner):
        if kind == "h" and INVESTOR_GOV_STOP.fullmatch(text.strip(" :")):
            break
        if not INVESTOR_GOV_DISCLAIMER.search(text):
            blocks.append((kind, text))
    return {"title": title, "sections": sections_from_blocks(blocks)}


def investor_gov(scratch, out, pages=None):
    """Investor.gov explainers (the SEC's Office of Investor Education and Assistance), one document per page in INVESTOR_GOV_PAGES,
    fetched as HTML (cached in <scratch>/investor-gov/) and read with investor_gov_page. Timeless: no page date is kept, so the
    latest-year rule dates each passage by its text. A page with no text is listed and skipped."""
    docs = []
    for page in INVESTOR_GOV_PAGES if pages is None else pages:
        url = INVESTOR_GOV + page
        try:
            markup = fetch(url, Path(scratch) / "investor-gov" / (page.replace("/", "-") + ".html"))
        except Exception as e:  # a page the site has since moved or removed
            print(f"skipped {url}: {e}")
            continue
        found = investor_gov_page(markup)
        if not found["sections"]:
            print(f"no text on {url}")
            continue
        docs.append({"ref": page.replace("/", "-"), "title": f"Investor.gov: {found['title']}", "url": url, "publishedOn": None, "sections": found["sections"]})
    Path(out).write_text(json.dumps(docs))
    print(f"Investor.gov: {len(docs)} pages, {sum(len(p.split()) for d in docs for s in d['sections'] for p in s['paragraphs'])} words")


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
    """The ISO day n days after an ISO day (calendar arithmetic, the same in every time zone)."""
    return (date.fromisoformat(day) + timedelta(days=n)).isoformat()


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
    plain text, so a page set inside one table cell keeps its paragraphs. The page's <head> (its <title>,
    "FRB: Press Release -- FOMC statement -- ...") is left out too."""
    markup = re.sub(r"<head\b.*?</head>|<title\b.*?</title>", "", markup, flags=re.I | re.S)
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
        # The attendance list: names, one a line, and its numbered footnotes ("3. Attended portion of meeting
        # relating to ..."), until the first sentence that is not about a person.
        opening, rest = blocks[starts[0]], blocks[starts[0] + 1 :]
        title = r"(Mr|Ms|Mrs|Miss|Messrs|Mmes|Dr)\.?\s|\d{1,2}\.\s"
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


LAYOUT_HEADING = re.compile(r"\d{1,2}\.\s+[A-Z][^.,;]{2,80}")


def _is_layout_heading(paragraph):
    return LAYOUT_HEADING.fullmatch(" ".join(paragraph.split())) is not None


def _goes_on(previous, paragraph):
    """Whether a paragraph is the rest of the one before it: that one stopped mid-sentence (no closing mark,
    not a heading) and this one starts in lower case or with a number that is not a heading's ("December" /
    "20. In foreign exchange markets, ..."). Every line of an indented quotation looks like a new paragraph."""
    if re.search(r"[.:;?!\"”)]$", previous) or _is_layout_heading(previous):
        return False
    return re.match(r"[a-z]", paragraph) is not None or (re.match(r"\d", paragraph) is not None and not _is_layout_heading(paragraph))


def layout_document(pages, ref, title, url, published_on):
    """A typewritten PDF (pages of `pdftotext -layout` text) as a document: paragraphs rebuilt from the layout,
    joined across page breaks, and numbered headings ("2. Authorization for domestic open market operations")
    starting sections. A paragraph that goes on from the one before it (_goes_on) is joined back to it."""
    stripped = strip_running_lines([{"text": p} for p in pages])
    paras = []
    for page in stripped:
        found, goes_on = layout_paragraphs(page["text"])
        if found and goes_on and paras and not re.search(r"[.:;?!\"”)]$", paras[-1]):
            paras[-1] += "\n" + found.pop(0)
        for p in found:
            if paras and _goes_on(paras[-1], p):
                paras[-1] += "\n" + p
            else:
                paras.append(p)
    blocks = [("h", " ".join(p.split())) if _is_layout_heading(p) else ("p", p) for p in paras]
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
                    stamped = re.search(r"Release Date:\s*" + DATE, markup)
                    released = max(item["releasedOn"], iso_date(stamped.group(0))) if stamped else item["releasedOn"]
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
TOC_BACK_LINK = re.compile(r'<a\s[^>]*href="[^"]*#toc[^"]*"[^>]*>\s*Table\s+of\s+Contents\s*</a>', re.I)


def flowing_html_sections(markup):
    """A filing typeset as one flowing HTML document (no page boxes), read with html_blocks + sections_from_blocks. Its section titles are
    the paragraphs that hold a table-of-contents target (<A NAME="toc...">), so those become headings; the "Table of Contents" back-link
    at the top of every page (in a <p> or an <h5>), the contents table itself and bare page numbers are left out. A target that is not
    inside a <p> (an empty <div>) heads nothing."""
    body = TOC_BACK_LINK.sub("", markup)
    pieces, at, low = [], 0, body.lower()
    for anchor in re.finditer(r'<a name="toc[^"]*">', body, re.I):
        start = low.rfind("<p", 0, anchor.start())
        end = low.find("</p>", anchor.end())
        if start < at or end < 0:
            continue  # a second anchor in a heading already rewritten
        if low.find("</p>", start, anchor.start()) >= 0:
            continue  # the nearest <p> before the target closed before it: the target is not in a paragraph
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


def _is_caps(line):
    """A line in capitals only, not SGML markup: a title, a caption or a running head."""
    s = line.strip()
    return re.search(r"[A-Z]{2}", s) is not None and re.search(r"[a-z]", s) is None and not s.startswith("<")


def _is_caps_heading(lines):
    """An all-capitals block such as GENERAL or RISK FACTORS: a sub-heading. A short one (two lines, 12 words) always is; a longer
    one up to four lines and 40 words, such as a risk factor's caption, is when it is one sentence (a legend of two is text)."""
    text = " ".join(l.strip() for l in lines)
    words = len(text.split())
    short = len(lines) <= 2 and words <= 12
    caption = len(lines) <= 4 and words <= 40 and re.search(r"[.!?]\s+\S", text) is None
    return (
        (short or caption) and re.search(r"[A-Z]{2}", text) is not None and re.search(r"[a-z]", text) is None
        and not re.match(r"[(\[$\d]", text) and not text.endswith((",", ";", ":"))
    )


def _running_head_lines(lines, pages):
    """The lines of each page's running head: at the top of a page (after its <PAGE> line), the capitals lines that open three or
    more pages (WEBVAN GROUP, INC. AND SUBSIDIARY), and any capitals block with "(CONTINUED)" in it, with the blank lines among them.
    The scan stops at the page's first other line, so a title that opens one page only (NOTES TO ... STATEMENTS) is kept."""
    def top(p):  # the capitals lines that open the page, up to its first other line
        out, j = [], p + 1
        while j < len(lines) and not lines[j].strip().upper().startswith("<PAGE>") and (not lines[j].strip() or _is_caps(lines[j])):
            if lines[j].strip():
                out.append(" ".join(lines[j].split()))
            j += 1
        return out

    opens = Counter(line for p in pages for line in set(top(p)))
    heads = set()
    for p in pages:
        j = p + 1
        while j < len(lines) and not lines[j].strip().upper().startswith("<PAGE>"):
            if not lines[j].strip():
                heads.add(j)
                j += 1
                continue
            end = j
            while end < len(lines) and lines[end].strip():
                end += 1
            block = range(j, end)
            if all(_is_caps(lines[k]) for k in block) and any("(CONTINUED)" in lines[k] for k in block):
                heads.update(block)
                j = end
            elif _is_caps(lines[j]) and opens[" ".join(lines[j].split())] >= 3:
                heads.add(j)
                j += 1
            else:
                break
    return heads


def plain_text_document(submission, ref, title, url, filed):
    """An EDGAR plain-text filing (the 1990s, before HTML) as a document. Only the first <DOCUMENT> is read. Paragraphs are blocks of
    lines between blank lines; a paragraph cut by a page break (<PAGE> and the page number above it) is joined back unless the page ended
    on a full stop. "ITEM n." lines are the section headings, and an all-capitals caption under one (GENERAL, COMPETITION) is added to it
    as a sub-heading; a prospectus, which has no ITEMs, is headed by its centred all-capitals titles instead. Fixed-width <TABLE> rows
    become "a | b | c" paragraphs; contents lists, PART lines, running heads and rules are left out. A running head at the top of a page
    is part of the page break, so a paragraph cut by the break is joined across it."""
    text, _ = first_sgml_document(submission)
    lines = text.replace("\r\n", "\n").split("\n")
    pages = [i for i, l in enumerate(lines) if l.strip().upper().startswith("<PAGE>")]
    # A page break: each <PAGE> marker (and the end), with the page number and blank lines just above it and the running head below it.
    breaks = _running_head_lines(lines, pages)
    for i in pages + [len(lines)]:
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
    elif source == "fed-explained":
        fed_explained(scratch, out)
    elif source == "nyfed":
        nyfed(scratch, out)
    elif source == "investor-gov":
        investor_gov(scratch, out)
    elif source == "fomc-historical":
        fomc_historical(scratch, out)
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
