// Every word of Home's own (the page at "/") lives here, so the owner can rewrite it in one place, including the
// words of Home's Explorable (its question, labels and lines); its numbers come from code and the Topic file.
// Value It as a sales page: plain words for a beginner, no maths, no buy or sell calls, no forecasts, and no invented
// numbers, prices or quotes. The only numbers are the counts, worked out by code (landingStats()), and the Explorable's,
// worked out by the tested present value formula. Drafts from spec 2026-11-12 Appendix F (E2): the promise says valuation.

export const copy = {
  brand: "Value It",
  // The eyebrow above the headline.
  eyebrow: "Learn valuation by doing",
  // One line today; the share-link title joins the lines: "Value It: Learn what things are worth."
  headline: ["Learn what things are worth."],
  // What Value It is, under the headline, and the site's description for search results and shared links.
  subtext:
    "Value It teaches you to value a jackpot, a bond or a company the way it is really done: a story first, then the numbers. You move every number yourself. You never work out a sum, and it never tells you what to buy.",
  // The header's and footer's links.
  nav: { howItWorks: "How it works", examples: "Examples", about: "About" },
  signIn: "Sign in",
  // The signed-out main button, in the header, hero and closing band. Every one opens the sign-in page, which offers
  // Google or an email link (ADR 0014).
  cta: "Join early access",
  // Under the hero's button, signed out only: a signed-in Learner has already joined. On a screen narrower than 768 px it
  // adds `phoneNote` (E7), so a visitor on a phone knows before they join.
  ctaNote: "Free during early access.",
  phoneNote: "Studying needs a laptop or tablet today.",
  // Under the closing band's button, signed out only: the offer, from the old "Free during early access" section (E1).
  closingNote: "Free during early access. Join with Google or an email link. While the course grows, we let people in one at a time.",
  // Shown instead of "Sign in" when the Learner is already signed in. Both open /study.
  studyWorkspace: "Study Workspace",
  openStudyWorkspace: "Open Study Workspace",
  // Signed-in main button (E7): "Resume" or "Start" on the first line and the Topic's title on a second line that wraps,
  // or What comes next ("New in [Topic]: Check N →", "Next Topic: [title] →"); every one opens that Topic (via /api/open)
  // and lands on /study.
  resume: "Resume",
  start: "Start",
  // Signed in on a screen narrower than 768 px (E7): studying needs a laptop or tablet, so the main button opens the
  // phone's share sheet with the site's address instead (no email: a Sign-in link lasts 15 minutes). Where there is no
  // share sheet it copies the address and says so.
  sendToLaptop: "Send this to my laptop",
  shareTitle: "Value It",
  linkCopied: "Link copied. Open it on your laptop or tablet.",
  linkToType: (url: string) => `Open ${url} on your laptop or tablet.`,
  signOut: "Sign out",
  // The share-link image's alt text (site-metadata.ts).
  screenshotAlt: "The Study Workspace: a Tutor conversation on the left and a worked widget on the right.",
  // Home's Explorable (the owner's design E, 11 Nov 2026; E3), in the hero's white card on the Band: the card's label,
  // what shows if the annuity can't be read, the Explorable's words, and the link in it (signed out only), to the sign-in
  // page. Every number in these lines is passed in by code: the annuity from the Topic file, the cash option from its Case
  // Data, and the match from the present value formula.
  frameLabel: "A live Widget. Try the slider.",
  widgetPlaceholder: "The live Widget appears here.",
  widget: {
    question: (total: string) => `Is a ${total} jackpot really worth ${total}?`,
    context: (s: { year: number; payments: number; cash: string }) =>
      `The ${s.year} Mega Millions winner could take ${s.payments} yearly payments, or ${s.cash} in cash now. Money later is worth less than money today.`,
    // When the cash option's Case Data can't be read: the same idea without the comparison.
    contextNoCash: (s: { year: number; payments: number }) =>
      `The ${s.year} Mega Millions jackpot was paid as ${s.payments} yearly payments. Money later is worth less than money today.`,
    // Before the first move: a guess, kept and shown beside the match line, never marked and never in the slider's way.
    guess: {
      ask: "At an ordinary interest rate, which is worth more?",
      options: { payments: "The 30 payments", cash: "The cash", same: "About the same" },
      said: { payments: "the 30 payments", cash: "the cash", same: "about the same" },
      shown: (said: string) => `You guessed: ${said}`,
    },
    rate: "Interest rate",
    chip: (rate: number) => `${rate}%`,
    reset: "Reset",
    // Under the slider: the opening line, then a line that tracks the state, then the match line.
    start: "Raise the rate and watch the far-off payments shrink.",
    standing: { payments: "The payments are worth more than the cash.", cash: "The cash is worth more than the payments." },
    // The match rate is worked out by code, to one decimal (Appendix B.4: 3.38%, so "about 3.4%").
    found: (rate: string) => `You found it. At about ${rate}% the 30 payments are worth the cash on offer.`,
    barsHint: "Each bar is one yearly payment, in today's money.",
    barRead: (s: { year: number; worth: string }) => `${s.year} payment: worth ${s.worth} today`,
    gap: { gain: "more than the cash option", loss: "short of the cash option", even: "about the same as the cash option" },
    // The comparison's two parts (E3).
    paymentsNow: "30 payments, in today's money",
    cashNow: "Cash now",
    totalNote: (payments: number) => `The total: all ${payments} bars added up, against the cash on offer.`,
    // The cash option's source, linked (it is the one figure the Explorable takes from Case Data).
    source: (name: string) => `Source: ${name}`,
    signIn: "Sign in to learn why →",
  },
  // Section 2 (E4): Value levers on Amazon in February 2000. Its three sentences set the scene; the caption is the best line
  // of the old "Why this and not a video" (E1). The Case's own story chip is the professor's (B3); under the Widget, signed
  // out, a link to the sign-in page; signed in, a link that opens Spine Topic 1. The Widget's own words (the headline, the
  // levers, "A grocer's margins", the Things to try) are the Widget's, from B3.
  valueCompany: {
    title: "Now value a company.",
    intro: "February 2000. Amazon sells books online, loses money, and its shares cost $84. Set four levers and see what your story is worth.",
    caption: "You find the point by trying it, not by watching.",
    caseStory: "Damodaran's story",
    signIn: "Sign in to see what happened next →",
    open: "Open this Topic →",
  },
  // Section 3 (E5): the four moves of every Topic, one for each bar of the mark, on a Band. They group the seven Teaching
  // Steps. Each step keeps one line of caption (Appendix F).
  movesTitle: "How every Topic works",
  movesIntro: "Four moves, the same every time.",
  moves: [
    { name: "Hear the story", line: "A true moment, and what people knew that day.", icon: "scroll" },
    { name: "Learn the lingo", line: "Each money word in plain English, when the story needs it.", icon: "label" },
    { name: "Try it", line: "Tap an answer or move a lever, with no sums.", icon: "person-raising-hand" },
    { name: "Value it", line: "Put your own number on it, then see what really happened.", icon: "chart-increasing" },
  ],
  // Section 3's four-step control (E5): its labels. What each step shows is Spine Topic 1's own words
  // (how-topics-work-steps.ts); these are only the control's.
  movesUi: {
    tabs: "The four moves",
    storyLabel: "The story",
    lingoLabel: "Lingo",
    pro: "Say it like a pro:",
    example: "For example:",
    inStory: "In the story",
    right: "Right.",
    notQuite: "Not quite.",
    again: "Try again",
    revealLabel: "What really happened",
    revealValue: "His value, a share",
    revealPrice: "The price that day",
  },
  // Section 4 (E6): three Showcases as tabs, one on screen. The intro keeps the old "Real cases" point, with the count.
  showcases: {
    title: "More moments from real Topics",
    intro: (s: { cases: number }) =>
      `Each is a question, the Tutor's reply and the live Widget from one Topic, written ahead. Every Topic is a real past event: ${s.cases} in all.`,
    tabs: "Showcases",
    you: "You ask",
    tutor: "Tutor",
    areas: { everyday: "Everyday money", economy: "The news", company: "A real company" },
    everyday: {
      question: "My deposit earns 10% a year. Does it grow by the same amount every year?",
      reply: "No, a little more each year. ₹1,000 at 10% a year is ₹1,100 after one year. Year two adds 10% of ₹1,100, which is ₹110, so it reaches ₹1,210. Each year's gain is earned on a bigger total. That is compounding: each year grows on the new total, not on the start.",
    },
    news: {
      question: "A headline says rates are up 1%. How big a move is that?",
      reply: "It depends which size the writer means. Take a rate going from 4% to 5%: that is 1 point, 100 basis points, and 25% of the old rate. All three are true, but they are different sizes. Up 1% could mean 1 point, or 1% of the old 4%, which is only 0.04 points. So say up 1 point, or up 100 bp.",
    },
    company: {
      question: "WeWork boasted of $3 billion of run-rate revenue. Is that what it earned?",
      reply: "Not quite. A run rate takes a recent period and scales it to a year: WeWork's S-1 took the revenue of the last month and multiplied it by 12. That is a pace, not revenue already recorded, and it is only as good as the guess that the pace repeats. The revenue it recorded in the first six months of 2019 was $1.54 billion, with a net loss of about $905 million.",
    },
  },
  // Section 5 (E1): three items and two short lists (Appendix F).
  get: {
    title: "What you get, and who it is for",
    items: [
      { name: "A Tutor that answers back", icon: "speech-balloon" },
      { name: "Widgets you move", icon: "bar-chart" },
      { name: "Checks that bring back what you missed", icon: "check-mark-button" },
    ],
  },
  forWho: {
    title: "Who it is for",
    line: "Adults who want to know what things are worth and why: a company, a bond, a headline. No background needed.",
  },
  notWhat: {
    title: "What it is not",
    lines: ["Not investment advice: no tips, no buy or sell calls.", "Every Case is a past event whose outcome is known.", "Studying needs a laptop or tablet today."],
  },
  // The closing Band's two lines; the second is faint.
  closing: ["Money makes sense", "one bar at a time."],
  footer: "Past events only. Nothing here is investment advice.",
} as const;
