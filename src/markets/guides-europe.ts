// The annual-report guide for Europe (spec #68, ticket #115), in the shape of src/markets/guides.ts (which lists it with
// India's, so the course check fails a line with no source). Listed companies in the EU file an annual financial report
// with consolidated accounts under EU-endorsed IFRS, in ESEF (web pages with tagged figures). The Europe Own Case counts
// in euros only, so the guide sends Learners to companies that report and trade in euros: a UK or Swiss company reports in
// pounds or francs (and London quotes pence), which the form would read as euros (G09). Each line links the rule that
// says where the number sits. Checked 2026-11-16: every link answered.
// Imports nothing, so plain Node runs it.

const IAS_REGULATION = { source: "Regulation (EC) No 1606/2002, IFRS for listed companies' consolidated accounts (EUR-Lex)", sourceUrl: "https://eur-lex.europa.eu/eli/reg/2002/1606/oj" };
const TRANSPARENCY = { source: "Directive 2004/109/EC, Article 4: the annual financial report (EUR-Lex)", sourceUrl: "https://eur-lex.europa.eu/eli/dir/2004/109/oj" };
const IAS_1 = { source: "IAS 1, Presentation of Financial Statements (IFRS Foundation)", sourceUrl: "https://www.ifrs.org/issued-standards/list-of-standards/ias-1-presentation-of-financial-statements/" };
const IFRS_18 = { source: "IFRS 18, Presentation and Disclosure in Financial Statements (IFRS Foundation)", sourceUrl: "https://www.ifrs.org/issued-standards/list-of-standards/ifrs-18-presentation-and-disclosure-in-financial-statements/" };
const IAS_12 = { source: "IAS 12, Income Taxes, paragraph 81(c) (IFRS Foundation)", sourceUrl: "https://www.ifrs.org/issued-standards/list-of-standards/ias-12-income-taxes/" };
const IFRS_16 = { source: "IFRS 16, Leases (IFRS Foundation)", sourceUrl: "https://www.ifrs.org/issued-standards/list-of-standards/ifrs-16-leases/" };
const IAS_7 = { source: "IAS 7, Statement of Cash Flows (IFRS Foundation)", sourceUrl: "https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/" };
const IFRS_8 = { source: "IFRS 8, Operating Segments (IFRS Foundation)", sourceUrl: "https://www.ifrs.org/issued-standards/list-of-standards/ifrs-8-operating-segments/" };
const EURONEXT = { source: "Euronext, share prices of listed companies", sourceUrl: "https://live.euronext.com/en" };

export const EUROPE_GUIDE = [
  {
    field: "company",
    where:
      "The Europe Own Case counts in euros: pick a company whose report is in euros and whose shares trade in euros (Euronext, Xetra); a UK or Swiss company reports in pounds or francs and does not fit here. Type the name as the annual report's cover prints it (in France, the Universal Registration Document), and use the consolidated financial statements, prepared under IFRS, not the parent company's own accounts.",
    ...IAS_REGULATION,
    lingo: {
      term: "Consolidated statements",
      means: "The accounts of the company and every company it owns, added up as one.",
      pro: "consolidated numbers include the subsidiaries",
      example: "A dairy group that owns a water brand shows the water sales in its consolidated statements.",
      emoji: "office-building",
    },
  },
  {
    field: "reportDate",
    where:
      'The day the annual financial report was published, on its cover or the company\'s results page, when its figures were public. Not the balance sheet\'s year end, "as of December 31, 2025" (or "31.12.2025"): nobody outside knew the figures then; most European companies close on 31 December and publish within four months.',
    ...TRANSPARENCY,
    lingo: {
      term: "Annual financial report",
      means: "The yearly report a listed company must publish, with its audited accounts and the managers' review.",
      pro: "the AFR is due within four months of the year end",
      example: "A company closing on 31 December 2025 publishes its annual financial report by 30 April 2026.",
      emoji: "calendar",
    },
  },
  {
    field: "industry",
    where:
      'The management report says what the company makes and sells. The segment note (IFRS 8, "Operating segments") splits revenue by business: pick the industry that brings in most of it, or "Any other firm" when it is none of them. Banks and insurers do not fit the Own Case.',
    ...IFRS_8,
    lingo: {
      term: "Operating segment",
      means: "A part of the business the report counts on its own, with its own revenue and profit.",
      pro: "segment revenue shows where the sales come from",
      example: "A dairy group that also sells bottled water earns most of its revenue from food: a food processor.",
      emoji: "factory",
    },
  },
  {
    field: "sales",
    where:
      'Consolidated income statement, first line: "Revenue" (or "Sales", "Umsatzerlöse", "Chiffre d\'affaires"), this year\'s column. Read the unit at the top: € million (€m, Mio. €, M€) is what the form wants; TEUR or T€ means thousands, so divide by 1,000. German reports write 27.283,5 for 27,283.5.',
    ...IAS_1,
    lingo: {
      term: "Revenue",
      means: "Money from selling the company's goods or services in the year, before any costs.",
      pro: "revenue is the top line",
      example: "A yoghurt maker's revenue is its yoghurt sales, not interest on its cash.",
      emoji: "receipt",
    },
  },
  {
    field: "operatingProfit",
    where:
      'Consolidated income statement: "Operating income", "Operating profit" or "EBIT" (German "Betriebsergebnis"), before finance costs and tax. If the report shows a "recurring" figure and one after other operating items, take the one after them. From 2027 IFRS 18 makes every report print "Operating profit".',
    ...IFRS_18,
    lingo: {
      term: "Operating profit (EBIT)",
      means: "Profit from running the business, before interest and tax.",
      pro: "EBIT is earnings before interest and taxes",
      example: "Sales of 100 with costs of 88 leave an operating profit of 12, before interest and tax.",
      emoji: "factory",
    },
  },
  {
    field: "taxPercent",
    where:
      'The notes, "Income tax": the reconciliation starts from the tax rate of the company\'s home country (France 25.83%, Germany about 30%). Use that rate, not the "effective tax rate" the note ends on.',
    ...IAS_12,
    lingo: {
      term: "Statutory tax rate",
      means: "The rate the home country's law sets on company profit, before any one-off items.",
      pro: "the statutory rate, not the effective rate",
      example: "A French company's tax note reconciles from the 25.83% country rate to its own 29.2%.",
      emoji: "classical-building",
    },
  },
  {
    field: "debt",
    where:
      'Balance sheet, liabilities: add the borrowings ("Financing", "Borrowings", "Financial liabilities") under both non-current and current liabilities, and the lease liabilities if the report shows them on a line of their own. Leave out trade payables.',
    ...IFRS_16,
    lingo: {
      term: "Lease liability",
      means: "Rent the company has promised to pay in future years, counted like a loan.",
      pro: "lease liabilities are debt in all but name",
      example: "A grocer with 300 rented shops shows their future rent as a lease liability.",
      emoji: "bank",
    },
  },
  {
    field: "cash",
    where:
      'Balance sheet, current assets: "Cash and cash equivalents". If the balance sheet splits it into "Cash" and "Short-term investments", the cash note gives the total of the two.',
    ...IAS_7,
    lingo: {
      term: "Cash equivalent",
      means: "Money parked where it turns back into a known amount of cash within about three months.",
      pro: "cash equivalents are as good as cash",
      example: "A money market fund is a cash equivalent; shares in another company are not.",
      emoji: "money-bag",
    },
  },
  {
    field: "shares",
    where:
      'The notes on equity: the number of shares issued at the year end, less the treasury shares the company holds ("shares outstanding"). Type the full count, one by one: a note that counts shares in millions or thousands is multiplied out (640.2 million is 640,200,000). Not the euro share capital, and not the weighted average in the earnings-per-share note.',
    ...IAS_1,
    lingo: {
      term: "Treasury shares",
      means: "The company's own shares that it has bought back and holds; they get no dividend and no vote.",
      pro: "shares outstanding leave out treasury shares",
      example: "681 million shares issued less 41 million held in treasury is 640 million outstanding.",
      emoji: "coin",
    },
  },
  {
    field: "price",
    where:
      "Not in the accounts: on the home exchange's site (Euronext, Xetra), find the company and read the closing price in euros a share on the report's date. If that day had no trading, use the next trading day: a day before it could not know the figures. A price in pounds, pence or francs does not fit the Europe Own Case.",
    ...EURONEXT,
    lingo: {
      term: "Closing price",
      means: "The last price a share traded at on one day, as the exchange records it.",
      pro: "the close is the day's last traded price",
      example: "A share that opens at €75.10 and ends the day at €76.78 closed at €76.78.",
      emoji: "chart-increasing",
    },
  },
];
