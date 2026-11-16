// Every word of the public site (Signal spec §4, §7 and Appendices B to D), so the owner can rewrite it in one place.
// The examples' own copy is in examples.ts. `**bold**` and `*italic*` are read by rich.tsx. Voice rules (§12): short
// sentences, no advice words, product nouns capitalised, recorded things labelled as recorded.

export const BRAND = "Value It";

/** The nav and footer links (§4.2, §4.3). */
export const NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/examples", label: "Examples" },
  { href: "/about", label: "About" },
] as const;

export const chrome = {
  skip: "Skip to content",
  signIn: "Sign in",
  join: "Join the waitlist",
  continue: "Continue",
  menu: "Menu",
  close: "Close",
  home: "Home",
  account: "Account menu",
  accountLinks: [
    { href: "/course", label: "Course map" },
    { href: "/notebook", label: "Notebook" },
    { href: "/settings", label: "Account settings" },
  ],
  signOut: "Sign out",
  footer: "Past events only. Nothing here is investment advice. © 2026 Value It.",
  // The member Continue button's sub-line when there is no Topic to name.
  studyWorkspace: "Study Workspace",
} as const;

/**
 * The CTA and the note under it, by viewer state (§7.1). A visitor's Join opens /join, Clerk's Waitlist (#33), which
 * owns the email check and the "you're in" email.
 */
export const cta = {
  visitor: { label: "Join the waitlist", href: "/join", note: "Free. We let people in by hand and email you when you’re in." },
  member: { label: "Continue" },
} as const;

export const home = {
  hero: {
    eyebrow: "Finance, taught through real events",
    h1: ["Learn what", "things are", "worth."],
    lede: "Ask a money question. The Tutor answers with a live widget built from a real event, and **you move the numbers until it makes sense**.",
    secondary: { visitor: "Play a real case", member: "Course map" },
    facts: ["Topics", "10 to 15 minutes each", "No sums to type"],
  },
  demo: {
    title: "The Tutor",
    sub: "A recorded conversation from the course. The widget is live.",
    pick: "Pick a question",
    you: "You ask",
    tutor: "Tutor",
    typing: "The Tutor is typing",
    opening: "Opening a widget…",
    caption: "The Tutor picked this widget. Tested code draws it.",
  },
  moves: {
    eyebrow: "How a Topic works",
    h2: "One real event. Four moves. Ten to fifteen minutes.",
    link: "See a Topic step by step",
  },
  levers: {
    eyebrow: "A worked example",
    h2: "Every value comes down to four levers.",
    intro: [
      "February 2000. Amazon sells books online and loses money. Buyers pay **$84** a share. A professor in New York, Aswath Damodaran, writes down his story about its future, and his story says **$35**.",
      "Four numbers make the difference.",
    ],
    leverOf: (n: number) => `Lever ${n} of 4`,
    yourTurn: "Your turn",
    yourTurnH2: "Now it’s your story.",
    yourTurnBody: "**Drag any lever.** Green means your change adds value to his story. Red means it takes value away. *Find a story worth the $84 price.*",
    fullCase: "Open the full case, with what happened next",
    presets: "Try a story",
    win: {
      pill: "You reached the price",
      line: (rev: string, margin: string) => `Your story needs ${rev} of sales in year 10 and a margin of ${margin}. Would you have believed that in 2000?`,
    },
    hints: {
      intro: "Scroll to meet the four levers.",
      lever: (n: number) => `Lever ${n} of 4. Drag it. The shaded band is as far as it can move the value on its own.`,
      yourTurn: "Drag any lever. Arrow keys work too.",
    },
  },
  colours: {
    eyebrow: "Reading a widget",
    h2: "Every colour means one thing.",
    body: "Learn five colours and one pattern once and you can read any widget in the course at a glance. Each colour also carries a sign or a word, so it reads the same if you can’t tell red from green.",
  },
  questions: {
    eyebrow: "Five cases, open now",
    h2: "Start with a question you already have.",
    body: "No finance background needed. **If you can read a headline, you can start.**",
    play: "Play",
    more: (topics: number) => `**${topics} Topics wait inside.** 15 teach valuation in order, 72 go wider across 9 subjects, and 23 read real arguments.`,
    path: "See the whole path",
  },
  trust: {
    eyebrow: "Why you can trust it",
    h2: "Real events. Checked numbers. No tips.",
    link: "How we source our facts",
    columns: [
      { heading: "Past events only.", body: "Every Topic is a real event with a known outcome. **You see only what people knew that day**, until the reveal." },
      { heading: "Every figure has a source.", body: "Each number in a widget is stored with its public source and **the date it was checked**. Source chip: “CNBC, 24 Oct 2018”." },
      { heading: "Code draws the charts.", body: "The Tutor picks the widget; tested code draws it. **The AI never invents a chart.**" },
    ],
  },
  faq: { eyebrow: "Questions", h2: "Before you ask.", link: "More questions", pick: [1, 2, 4, 5] },
  closing: {
    lines: ["Money makes sense,", "one bar at a time."],
    steps: ["Request received", "Reviewed by hand", "Email: you’re in"],
  },
} as const;

/** The four moves of every Topic (§7.2.2). */
export const MOVES = [
  { name: "Hear the story", line: "A true moment, and what people knew that day." },
  { name: "Learn the lingo", line: "Each money word in plain English, when the story needs it." },
  { name: "Try it", line: "Tap an answer or move a lever. No sums." },
  { name: "Value it", line: "Put your own number on it, then see what really happened." },
] as const;

/** The colour language (§7.2.4): the tile each cell draws, its name, its meaning and its line. */
export const COLOURS = [
  { tile: "knob", name: "Royal blue", means: "You", line: "Whatever you can drag or tap, and your own number." },
  { tile: "gain", name: "Green", means: "Gain", line: "Money coming in, value added, a right answer." },
  { tile: "loss", name: "Red", means: "Loss", line: "Cash burned, value taken away, a wrong answer." },
  { tile: "wait", name: "Orange", means: "Careful", line: "A claim not yet earned, a break-even, a shaky assumption." },
  { tile: "pin", name: "Black", means: "The record", line: "Prices paid, figures reported, what you put in." },
  { tile: "hatch", name: "Hatched", means: "Not real yet", line: "Advertised, projected, or lost by waiting." },
] as const;

export type ColourTile = (typeof COLOURS)[number]["tile"];

/** Appendix B: the FAQ, in order (numbered from 1). */
export const FAQ = [
  { q: "Is Value It investment advice?", a: "No. It teaches how finance works through past events. It never tells you what to buy or sell, and gives no tips." },
  { q: "Do I need to be good at maths?", a: "No. You never type a number: every question is a tap, or a sentence in your own words. Widgets work out the sums with tested code, and the Tutor explains them in words." },
  { q: "Where do the facts come from?", a: "From real past events with known outcomes. Widget figures come from checked datasets, each stored with its public source and the date it was checked. When the Tutor quotes its Library, the answer links to the passage." },
  { q: "Does the AI make up the charts?", a: "No. The Tutor chooses which widget to open and at which numbers; tested code draws it. Made-up numbers are labelled Illustration." },
  { q: "What does it cost?", a: "Nothing during early access. No price has been decided yet." },
  { q: "How do I get in?", a: "Join the waitlist with your email. We let people in by hand while the course grows, and email you when you’re in." },
  { q: "Can I start again?", a: "Yes. Start one Topic over and its earlier attempt stays in your Notebook, or start everything over in Settings. Your old record is archived, not deleted." },
  { q: "Do you track me?", a: "There are no ads. We count page views with Vercel Web Analytics, which records the page address, where you came from, and your browser, device and country. It sets no cookie." },
] as const;

export const howItWorks = {
  eyebrow: "How it works",
  h1: "How a Topic works",
  lede: "Every Topic is **one real event, taught in four moves**, in 10–15 minutes. You never type a number: you tap, drag and explain in your own words.",
  rail: {
    title: "Running example: Amazon, Feb 2000",
    moveOf: (n: number) => `Move ${n} of 4`,
    done: "**That’s one Topic.** The four bars make the logo.",
  },
  inside: "Inside this move:",
  steps: [["Story"], ["The idea"], ["Your turn"], ["Wrap up", "Check", "Reveal", "Principle"]],
  closingLine: "*15 short steps in all. Your place is saved after each one.* Moves 2 and 3 repeat for each idea in a Topic, usually four.",
  lingo: { pro: "Say it like a pro", example: "For example", inStory: "In the story" },
  tryIt: {
    ask: "His story says $35 a share. Is that a price or a value?",
    choices: [
      { id: "value", label: "A value", right: true, fb: "It is what one story says a share is worth. The price is what buyers paid: $84." },
      { id: "price", label: "A price", right: false, fb: "A price is what buyers pay on the day. $35 is what his story says a share is worth: a value." },
    ],
    yourCall: "Your call",
    right: "Right",
    notQuite: "Not quite",
  },
  valueIt: {
    slider: "Your value for one share",
    min: 0,
    max: 150,
    start: 50,
    reveal: "Reveal what really happened",
    facts: { yours: "Your value", his: "His value", price: "Price, 3 Feb 2000", low: "Low, late 2000" },
    figures: { his: 35.08, price: 84, low: 14.88 },
    key: "*A price is what buyers paid that day. A value is what one story about the business is worth.* Neither number proves the other wrong.",
  },
  workspace: {
    // The mock's two bubbles are the rates example's (examples.ts): the learner's question and the Tutor's lead.
    h2: "The Study Workspace",
    input: "Ask the Tutor anything",
    readout: "4% → 5%: **1 point · 100 bp · 25%**",
    saved: "Saved to your Notebook",
    legend: ["Ask anything, any time.", "The Tutor picks the widget; tested code draws it.", "The step bar shows where you are in the Topic’s 15 short steps.", "What you find lands in your Notebook."],
  },
  colourBody: "The same five colours and one pattern mean the same thing in every widget. Each colour also carries a sign or a word, so no meaning rests on colour alone.",
  reviews: {
    h2: "It brings back what you missed.",
    illustration: "Illustration",
    passed: "Check passed",
    review: "Review",
    missed: "missed: back sooner",
  },
  path: {
    eyebrow: "The path",
    h2: "The whole path",
    core: "15 core Topics",
    subjects: "9 subjects",
    stages: "3 stages that read real arguments",
    minutes: (n: number) => `${n} min`,
  },
  closing: "Start with Topic 1: What is a business worth?",
} as const;

/** Appendix C: the course map the site shows. */
export const COURSE = {
  core: [
    { n: "01", title: "What is a business worth? Price against value, and the four levers", min: 10 },
    { n: "02", title: "Why is money later worth less?", min: 12 },
    { n: "03", title: "Where does the cash come from?", min: 12 },
    { n: "04", title: "Growth: how big can it get?", min: 12 },
    { n: "05", title: "Margins: what does it keep?", min: 12 },
    { n: "06", title: "What does growth cost?", min: 13 },
    { n: "07", title: "Risk: what rate do you discount at?", min: 13 },
    { n: "08", title: "What about the years you cannot forecast?", min: 12 },
    { n: "09", title: "How do you get from the business to one share?", min: 13 },
    { n: "10", title: "What if it does not survive?", min: 12 },
    { n: "11", title: "How does a story become numbers?", min: 14 },
    { n: "12", title: "Is a price a value? Multiples and comparables", min: 13 },
    { n: "13", title: "What does the price assume?", min: 13 },
    { n: "14", title: "How do you live with being wrong?", min: 14 },
    { n: "15", title: "Value one yourself, as of a past date", min: 15 },
  ],
  subjects: [
    { name: "Numbers & time value", count: 6 },
    { name: "Financial statements", count: 11 },
    { name: "Economics & policy", count: 11 },
    { name: "Bonds & credit", count: 7 },
    { name: "Currencies & countries", count: 4 },
    { name: "Markets & investing", count: 9 },
    { name: "Valuation & corporate finance", count: 12 },
    { name: "Derivatives", count: 5 },
    { name: "Banks, crises & the system", count: 7 },
  ],
  stages: [
    { name: "Follow", line: "understand what a writer argues", count: 9 },
    { name: "Judge", line: "spot where an argument is weak", count: 8 },
    { name: "Analyse", line: "reach your own view from the numbers", count: 6 },
  ],
  locked: [
    { category: "Follow", title: "Damodaran, Tesla valuation (Feb 2020)" },
    { category: "Judge", title: "Twitter's 2013 IPO valuation versus what happened" },
    { category: "Follow", title: "Damodaran, crowd valuation of Uber (Dec 2014)" },
    { category: "Banks, crises & the system", title: "Bank runs and interest-rate risk in banks" },
    { category: "Economics & policy", title: "India's economy and the 1991 reforms" },
    { category: "Judge", title: "Junk or BB+?" },
    { category: "Banks, crises & the system", title: "Securitisation, MBS and CDOs" },
    { category: "Follow", title: "Zitron, The Subprime AI Crisis (Sep 2024)" },
    { category: "Analyse", title: "Transfer to India (G-sec, bank, rupee)" },
  ],
} as const;

/** Appendix D: the lingo cards of How it works, move 2. */
export const LINGO = [
  {
    term: "price",
    means: "What buyers pay for one share today.",
    pro: "The shares closed at $84.",
    example: "A used bike sells for $200 on the day, whatever it is worth to you.",
    inStory: "In the story, $84 is what buyers pay for an Amazon share.",
  },
  {
    term: "value",
    means: "What one story about the business says a share is worth.",
    pro: "His story values the shares at $35.",
    example: "You think the bike is worth $150 to you, whatever it sells for.",
    inStory: "In the story, $35 is what Damodaran’s story says a share is worth.",
  },
] as const;

export const examplesPage = {
  h1: "Real events. Move the numbers.",
  lede: "Five cases from the course, playable here. **Each is a question, your call, a live widget and the Tutor’s answer**, with what really happened kept for last.",
  filter: "Filter the cases",
  members: "Members",
} as const;

export const casePage = {
  all: "All cases",
  progress: ["The story", "Your call", "The answer", "The ending"],
  story: "The story",
  question: "Question",
  you: "You ask",
  tutor: "Tutor",
  answer: "The Tutor’s answer",
  waiting: "The Tutor explains after your call.",
  ending: "The ending",
  locked: { next: "Make your call first. This step shows what happened next.", rule: "Make your call first. This step shows the rule the Topic leaves you with." },
  skip: "Skip to the ending",
  ready: "Your call is in. Ready for what happened next?",
  reveal: (label: string) => `Reveal ${label.charAt(0).toLowerCase()}${label.slice(1)}`,
  sources: "Sources:",
  fromTopic: "From the Topic",
  footCta: { visitor: "Join to take the full Topic", member: "Open this Topic" },
  previous: "Previous case",
  next: "Next case",
} as const;

export const about = {
  title: "About",
  h1: "About Value It",
  lede: "Value It teaches money, markets and valuation through real past events. You ask, the Tutor answers with a live widget, and you move the numbers until the idea makes sense.",
  glance: {
    title: "At a glance",
    rows: (topics: number) => [
      { label: "Topics", value: String(topics) },
      { label: "Subjects", value: "9" },
      { label: "Stages that read real arguments", value: "3" },
      { label: "Each Topic", value: "10–15 min" },
      { label: "Price", value: "Free in early access" },
    ],
  },
  promisesH2: "Four promises",
  promises: [
    { heading: "Past events only.", body: "Every Topic is built on a real event whose outcome is known. **Until the reveal, you see only what was known that day.**" },
    { heading: "Every figure has a source.", body: "Widget figures come from checked datasets, each stored with **its public source and the date it was checked**." },
    { heading: "Code draws the charts. The AI never does.", body: "The Tutor picks the widget and its numbers; tested code draws it. **Made-up numbers are labelled Illustration.**" },
    { heading: "Never advice.", body: "No tips, no buy or sell calls. If you share your situation, **the Tutor uses it only when you ask** how an idea applies to you." },
  ],
  sourcingH2: "Where the numbers come from",
  sourcing: [
    { step: "Real event", body: "A past moment whose outcome is known, like Amazon in February 2000." },
    { step: "Checked dataset", body: "Each figure stored with its public source and the date it was checked." },
    { step: "Tested widget", body: "Code draws the chart from that data, from a tested design." },
    { step: "The Tutor explains", body: "Quotes from its Library carry a number that opens the passage." },
  ],
  notAffiliated: "The valuations used as cases are published work by Aswath Damodaran and others, named and linked where they appear. Value It is not affiliated with them.",
  learnH2: "What you can learn",
  learnBody: "Fifteen core Topics teach valuation in order. Nine subjects go wider, and three stages read real arguments.",
  founderH2: "A note from the founder",
  // §14: a placeholder until the founder writes two or three sentences of their own.
  founder: "The founder’s note is coming soon.",
  earlyH2: "Early access",
  early: [
    { heading: "Join", body: "Join the waitlist with your email. **We let people in by hand**, a few at a time." },
    { heading: "Cost", body: "**Free during early access.** No price has been decided yet." },
    { heading: "What you need", body: "A laptop or tablet to study. These pages work on any phone." },
  ],
  faqH2: "Questions",
  closing: "Start with a question you already have.",
} as const;

/**
 * The joining pages (issue #76): /join, Clerk's Waitlist, and /sign-up, where its invitation lands. One name for the
 * list, "the waitlist", and the page's one heading is ours (Clerk's own header is hidden: src/auth/clerk-appearance.ts).
 */
export const joining = {
  join: {
    title: "Join the waitlist",
    lede: "Leave your email below. What happens next:",
    next: ["It’s free.", "We review each request by hand.", "We email you when you’re in.", "You can study on a laptop or a phone."],
  },
  signUp: {
    title: "Create your account",
    noInvitation: "You need an invitation to create an account. Join the waitlist and we’ll email you one when you’re in.",
    toWaitlist: "Join the waitlist",
  },
} as const;

/** Search results and shared links (src/app/site-metadata.ts). */
export const meta = {
  title: BRAND,
  description: "Ask a money question. The Tutor answers with a live widget built from a real event, and you move the numbers until it makes sense.",
  shareTitle: `${BRAND}: Learn what things are worth.`,
  screenshotAlt: "The Study Workspace: a Tutor conversation on the left and a worked widget on the right.",
} as const;
