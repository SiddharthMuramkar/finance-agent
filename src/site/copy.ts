// Every word of the public site (Signal spec §4, §7 and Appendices B to D), so the owner can rewrite it in one place.
// The examples' own copy is in examples.ts. `**bold**` and `*italic*` are read by rich.tsx. Voice rules (§12): short
// sentences, no advice words, product nouns capitalised, recorded things labelled as recorded.

import type { CourseFacts, ReadingStage } from "./stats";

export const BRAND = "Value It";

// Counts and the Spine list are never written here: the pages pass in the course's own facts (src/site/stats.ts, #72).
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
/** A count in words up to twenty ("fifteen"), in digits above. */
export const say = (n: number) => WORDS[n] ?? String(n);
/** The same, capitalised to open a sentence ("Fifteen"). */
export const Say = (n: number) => say(n).charAt(0).toUpperCase() + say(n).slice(1);
const readings = (c: CourseFacts) => c.byStage.reduce((n, s) => n + s.count, 0);
/** The Course Map's label on every Topic not written ahead (not a Converted Topic); Home, About and How it works use the same words. */
export const TAUGHT_LIVE = "Taught live by the AI Tutor";
/** The line Home, About and How it works carry about those Topics. */
export const TAUGHT_LIVE_LINE = "**Topics not written ahead yet are taught live by the AI Tutor.** You can open any of them.";

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
  // The theme switch in the phone menu (ADR 0019): what a press turns on, in each theme.
  theme: { light: "Dark theme", dark: "Light theme" },
  footer: "Past events only. Nothing here is investment advice. © 2026 Value It.",
  // The member Continue button's sub-line when there is no Topic to name.
  studyWorkspace: "Study Workspace",
} as const;

/** The contact address (spec §14): plain text a Visitor can copy, in the footer and on /join. */
export const CONTACT_EMAIL = "hello@value-it.xyz";

/**
 * Privacy and Terms (issue #77), linked from the footer and /join. Plainly true for what the app keeps and sets: Clerk
 * runs sign-in and the waitlist, the Learner record is in Neon, the Tutor's model is OpenAI's, Vercel hosts the site and
 * counts page views with no cookie. Change a cookie or a service and change these words (and the FAQ's) with it.
 */
export const legal = {
  links: [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
  ],
  contact: "Contact",
  updated: "Last changed 16 November 2026.",
  privacy: {
    title: "Privacy",
    lede: "What Value It keeps about you, who else handles it, and the cookies the site sets.",
    sections: [
      {
        heading: "When you join the waitlist",
        body: [
          "You give us your email. Clerk, the company that runs our sign-in, keeps it on the waitlist. We use it to let you in and to email you when you’re in. We don’t sell it and we don’t send marketing.",
        ],
      },
      {
        heading: "When you have an account",
        body: [
          "Clerk keeps your email and your sign-in details. We keep your Learner record in our database, hosted by Neon: your conversations with the Tutor, your answers to quizzes and practice, your progress through the Topics, your Notebook notes and your settings.",
          "To write the Tutor’s replies, we send your messages and the Topic you’re on to OpenAI, whose AI model writes them.",
        ],
      },
      {
        heading: "Page views",
        body: [
          "Vercel hosts the site. We count page views with Vercel Web Analytics, which records the page address (with any sign-in code removed), where you came from, and your browser, device and country. It sets no cookie. Vercel also checks that a message to the Tutor comes from a browser and not a bot.",
        ],
      },
      {
        heading: "Cookies",
        body: [
          "There are no ad or tracking cookies. Clerk sets __session and __client_uat on this site, and __client on clerk.value-it.xyz, to know whether you’re signed in. In the Study Workspace, a cookie called split remembers how wide you set the two columns. If you press the sun/moon switch, a cookie called theme remembers Light or Dark. A private copy that signs in with a passcode instead of Clerk uses fa_access for that.",
        ],
      },
      {
        heading: "Who sees it",
        body: [
          "The Owner, who runs Value It, can read Learner records, to let people in and to improve the course. Clerk, Neon, Vercel and OpenAI handle it for us as described above. Nobody else, and we never sell it.",
        ],
      },
      {
        heading: "Keeping and deleting",
        body: [
          "We keep your record while you have an account. Starting over in Settings archives your old record; it doesn’t delete it. To see what we hold, or to have your account and your record deleted, email us.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms",
    lede: "The rules for using Value It during early access.",
    sections: [
      {
        heading: "What Value It is",
        body: ["A course in what things are worth, with an AI Tutor and widgets built from past events. It is for learning."],
      },
      {
        heading: "Not advice",
        body: [
          "Nothing here is investment, financial, tax or legal advice. The cases are past events and the numbers are there to learn from. Make your own decisions, and ask a licensed adviser about your own money.",
        ],
      },
      {
        heading: "The Tutor can be wrong",
        body: ["The Tutor is an AI model and it makes mistakes. Check anything that matters against the Sources."],
      },
      {
        heading: "Early access",
        body: [
          "Early access is free, and no price has been decided. We let people in by hand and may close an account or the waitlist at any time. The site may change, break or go offline while it grows.",
        ],
      },
      {
        heading: "Your account",
        body: [
          "One account per person; keep your sign-in to yourself. Don’t try to break the site, overload it or use the Tutor for anything but learning.",
        ],
      },
      {
        heading: "What’s ours and what’s yours",
        body: [
          "The course, the widgets and the site are ours. Sources belong to their owners and are credited where they appear. What you write stays yours; you let us store it and send it to the Tutor’s model so the course works.",
        ],
      },
      {
        heading: "Liability",
        body: [
          "Value It is provided as it is, with no promises that it is complete or free of errors. As far as the law allows, we are not responsible for losses from using it, including decisions you make.",
        ],
      },
    ],
  },
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
    eyebrow: "Finance for beginners",
    // Display lines; the page puts a space between them, so a screen reader reads one sentence.
    h1: ["What is it", "really worth?"],
    // Three headline numbers a beginner has seen. The jackpot's is the jackpot Example's chip (pages.test.tsx keeps them equal).
    lede: "A **₹25 crore jackpot**. A **$3bn “run rate”**. **Amazon at $84 a share**. You have seen numbers like these. Here you work out what each one is really worth. An AI Tutor explains every money word, and you move the numbers yourself. No sums.",
    // A visitor's first action opens the jackpot Example (the page finds it by its widget); Join the waitlist comes second.
    tryIt: "Try the jackpot",
    secondary: { member: "Course map" },
    facts: {
      topics: (c: CourseFacts) => `${c.topics} Topics`,
      minutes: (c: CourseFacts) => `${c.minutes.low} to ${c.minutes.high} minutes each`,
    },
  },
  demo: {
    title: "The AI Tutor",
    sub: "A recorded conversation from the course. The Example is live: move the numbers.",
    pick: "Pick a question",
    you: "You ask",
    tutor: "Tutor",
    typing: "The Tutor is typing",
    opening: "Opening a widget…",
    caption: "The AI Tutor picked this Example. Checked numbers draw it.",
  },
  moves: {
    eyebrow: "How a Topic works",
    h2: (c: CourseFacts) => `One real event. Four moves. ${Say(c.minutes.low)} to ${say(c.minutes.high)} minutes.`,
    link: "See a Topic step by step",
  },
  levers: {
    eyebrow: "A worked example",
    h2: "Every value comes down to four levers.",
    intro: [
      "February 2000. Amazon sells books online and loses money. Buyers pay **$84** a share. One published valuation tells a Story about its future, and that Story says **$35**.",
      "Four numbers make the difference.",
    ],
    leverOf: (n: number) => `Lever ${n} of 4`,
    yourTurn: "Your turn: judge it",
    yourTurnH2: "What did the $84 price need?",
    yourTurnBody: "**Drag any lever** until the value reaches $84. Green adds value to the published Story. Red takes value away. *Would you have believed it in 2000?*",
    fullCase: "Open the full Example, with what happened next",
    presets: "Try a story",
    win: {
      pill: "You reached the price",
      line: (rev: string, margin: string) => `To reach the $84 price, Amazon needs ${rev} of sales in year 10 and a margin of ${margin}. Would you have believed that in 2000?`,
    },
    hints: {
      intro: "Scroll to meet the four levers.",
      lever: (n: number) => `Lever ${n} of 4. Drag it. The shaded band is as far as it can move the value on its own.`,
      yourTurn: "Drag any lever. Arrow keys work too.",
    },
  },
  questions: {
    eyebrow: (examples: number) => `${Say(examples)} Examples, open now`,
    h2: "Start with a question you already have.",
    body: "No finance background needed. **If you can read a headline, you can start.**",
    play: "Play",
    more: (c: CourseFacts) =>
      `**${c.topics} Topics wait inside.** ${c.spine.length} teach valuation in order, ${c.electives} go wider across ${c.bySubject.length} subjects, and ${readings(c)} read real arguments. ${TAUGHT_LIVE_LINE}`,
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
  /** #75: the one-page note a Learner saves to the Notebook at the end of the Spine (src/site/end-note.ts). */
  end: {
    eyebrow: "Where you end up",
    h2: "By the end, you value a company yourself.",
    body: "Near the end of the core Topics you value a real company as of a past date, lever by lever, and save the Story you told. This is the note it leaves in your Notebook.",
    caption: "From the Notebook. Every figure worked out by the course’s tested valuation engine.",
  },
  faq: { eyebrow: "Questions", h2: "Before you ask.", link: "More questions", pick: [1, 2, 4, 5] },
  closing: {
    lines: ["Money makes sense,", "one bar at a time."],
    steps: ["Request received", "Reviewed by hand", "Email: you’re in"],
  },
} as const;

/**
 * The Amazon story's source (#74, spec §12 rule 11): the one line on Home and How it works that names Damodaran. Every
 * other line calls his work "one published valuation".
 */
export const AMAZON_SOURCE = {
  lead: "Source:",
  label: "Aswath Damodaran, “Valuing Amazon.com”, February 2000",
  href: "https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/HighGrow.pdf",
} as const;

/** The four moves of every Topic (§7.2.2). */
export const MOVES = [
  { name: "Meet the moment", line: "A true event, and what people knew that day." },
  { name: "Learn the lingo", line: "The AI Tutor explains each money word in plain English, when you need it." },
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
  { q: "Do I need to be good at maths?", a: "No. You never type a number to answer a question: every question is a tap, or a sentence in your own words. The site works out the sums, and the AI Tutor explains them in words. The one place you type numbers is the Assignment after the Spine, where you copy figures from a company's annual report." },
  { q: "Where do the facts come from?", a: "From real past events with known outcomes. Widget figures come from checked datasets, each stored with its public source and the date it was checked. When the Tutor quotes its Library, the answer links to the passage." },
  { q: "Does the AI make up the charts?", a: "No. The AI Tutor chooses which chart to open and at which numbers; the chart is drawn from checked figures. Made-up numbers are labelled Illustration." },
  { q: "What does it cost?", a: "Nothing during early access. No price has been decided yet." },
  { q: "How do I get in?", a: "Join the waitlist with your email. We let people in by hand while the course grows, and email you when you’re in." },
  { q: "Can I start again?", a: "Yes. Start one Topic over and its earlier attempt stays in your Notebook, or start everything over in Settings. Your old record is archived, not deleted." },
  { q: "Do you track me?", a: "There are no ads. We count page views with Vercel Web Analytics, which records the page address, where you came from, and your browser, device and country. It sets no cookie. The site’s own cookies: Clerk, which runs sign-in, sets __session and __client_uat here and __client on clerk.value-it.xyz, to know whether you’re signed in. In the Study Workspace, a cookie called split remembers how wide you set the two columns. If you press the sun/moon switch, a cookie called theme remembers Light or Dark. A private copy that signs in with a passcode instead of Clerk uses fa_access. The Privacy page has the rest." },
] as const;

export const howItWorks = {
  eyebrow: "How it works",
  h1: "How a Topic works",
  lede: (c: CourseFacts) =>
    `Every Topic is **one real event, taught in four moves**, in ${c.minutes.low}–${c.minutes.high} minutes. You never type a number to answer: you tap, drag and explain in your own words.`,
  description: (c: CourseFacts) => `Every Topic is one real event, taught in four moves, in ${c.minutes.low} to ${c.minutes.high} minutes.`,
  rail: {
    title: "Running example: Amazon, Feb 2000",
    moveOf: (n: number) => `Move ${n} of 4`,
    done: "**That’s one Topic.** The four bars make the logo.",
  },
  inside: "Inside this move:",
  steps: [["The moment"], ["The idea"], ["Your turn"], ["Wrap up", "Check", "Reveal", "Principle"]],
  closingLine: "*15 short steps in all. Your place is saved after each one.* Moves 2 and 3 repeat for each idea in a Topic, usually four.",
  lingo: { pro: "Say it like a pro", example: "For example", inStory: "In the story" },
  tryIt: {
    ask: "One published valuation says $35 a share. Is that a price or a value?",
    choices: [
      { id: "value", label: "A value", right: true, fb: "It is what one Story says a share is worth. The price is what buyers paid: $84." },
      { id: "price", label: "A price", right: false, fb: "A price is what buyers pay on the day. $35 is what one published valuation says a share is worth: a value." },
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
    facts: { yours: "Your value", his: "Published value", price: "Price, 3 Feb 2000", low: "Low, late 2000" },
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
  // The colour language lives here, not on Home (#74).
  colours: { eyebrow: "Reading a widget", h2: "Every colour means one thing." },
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
    body: TAUGHT_LIVE_LINE,
    core: (c: CourseFacts) => `${c.spine.length} core Topics`,
    subjects: (c: CourseFacts) => `${c.bySubject.length} subjects`,
    stages: (c: CourseFacts) => `${c.byStage.length} stages that read real arguments`,
    number: (n: number) => String(n).padStart(2, "0"),
    minutes: (n: number) => `${n} min`,
  },
  closing: "Start with Topic 1: What is a business worth?",
} as const;

/** Appendix C: the course map the site shows. The Spine, the Subjects and the counts come from the course (#72). */
export const COURSE = {
  stages: {
    follow: { name: "Follow", line: "understand what a writer argues" },
    judge: { name: "Judge", line: "spot where an argument is weak" },
    analyse: { name: "Analyse", line: "reach your own view from the numbers" },
  } satisfies Record<ReadingStage, { name: string; line: string }>,
  locked: [
    { category: "Follow", title: "Tesla, a valuation (Feb 2020)" },
    { category: "Judge", title: "Twitter's 2013 IPO valuation versus what happened" },
    { category: "Follow", title: "Uber, a crowd valuation (Dec 2014)" },
    { category: "Banks, crises & the system", title: "Bank runs and interest-rate risk in banks" },
    { category: "Economics & policy", title: "India's economy and the 1991 reforms" },
    { category: "Judge", title: "Junk or BB+?" },
    { category: "Banks, crises & the system", title: "Securitisation, MBS and CDOs" },
    { category: "Follow", title: "OpenAI’s cheap AI prices (Sep 2024)" },
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
    pro: "One published valuation puts the shares at $35.",
    example: "You think the bike is worth $150 to you, whatever it sells for.",
    inStory: "In the story, $35 is what one published valuation says a share is worth.",
  },
] as const;

export const examplesPage = {
  h1: "Real events. Move the numbers.",
  lede: (examples: number) => `${Say(examples)} Examples from the course, playable here. **Each is a question, your call, a live widget and the Tutor’s answer**, with what really happened kept for last.`,
  description: (examples: number) => `${Say(examples)} Examples from the course, playable here.`,
  filter: "Filter the Examples",
  members: "Members",
} as const;

export const casePage = {
  all: "All Examples",
  progress: ["The moment", "Your call", "The answer", "The ending"],
  story: "The moment",
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
  /** An Example's As-of date, "2024-10-09", as "As of 9 Oct 2024." */
  asOf: (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return `As of ${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}.`;
  },
  fromTopic: "From the Topic",
  footCta: { visitor: "Join to take the full Topic", member: "Open this Topic" },
  previous: "Previous Example",
  next: "Next Example",
} as const;

export const about = {
  title: "About",
  h1: "About Value It",
  lede: "Value It teaches money, markets and valuation through real past events. You ask, the Tutor answers with a live widget, and you move the numbers until the idea makes sense.",
  glance: {
    title: "At a glance",
    rows: (c: CourseFacts) => [
      { label: "Topics", value: String(c.topics) },
      { label: "Subjects", value: String(c.bySubject.length) },
      { label: "Stages that read real arguments", value: String(c.byStage.length) },
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
  notAffiliated: "The valuations used as Cases are published work by Aswath Damodaran and others, named and linked where they appear. Value It is not affiliated with them.",
  /** The one Source the line names, and where it links (#75: every named Source is a link). */
  notAffiliatedSource: { name: "Aswath Damodaran", url: "https://pages.stern.nyu.edu/~adamodar/" },
  learnH2: "What you can learn",
  learnBody: (c: CourseFacts) =>
    `${Say(c.spine.length)} core Topics teach valuation in order. ${Say(c.bySubject.length)} subjects go wider, and ${say(c.byStage.length)} stages read real arguments. ${TAUGHT_LIVE_LINE}`,
  earlyH2: "Early access",
  early: [
    { heading: "Join", body: "Join the waitlist with your email. **We let people in by hand**, a few at a time." },
    { heading: "Cost", body: "**Free during early access.** No price has been decided yet." },
    { heading: "What you need", body: "A phone, a tablet or a laptop. Study works on all three." },
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

/** The Visitor's 'page not found' (issue #70, src/app/not-found.tsx): an unknown address, signed out. */
export const notFound = {
  h1: "Page not found",
  lede: "The address may be mistyped, or the page has moved. Everything on Value It starts from Home.",
  home: "Back to Home",
} as const;

/** Search results and shared links (src/app/site-metadata.ts). */
export const meta = {
  title: BRAND,
  description: "Ask a money question. The Tutor answers with a live widget built from a real event, and you move the numbers until it makes sense.",
  shareTitle: `${BRAND}: Learn what things are worth.`,
  screenshotAlt: "The Study Workspace: a Tutor conversation on the left and a worked widget on the right.",
} as const;
