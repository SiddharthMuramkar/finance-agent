// Every word on Home (the page at "/") lives here, so the owner can rewrite it in one place.
// Serious and grounded: finance taught through what already happened. No hype, no buy or sell, no forecasts.

export const copy = {
  brand: "Finance Agent",
  badge: "A private Study Workspace",
  headline: ["Learn finance from", "what already happened."],
  subtext:
    "A Tutor that teaches valuation, statements and markets through real historical Cases: the numbers, the documents and the decisions people made at the time.",
  signIn: "Sign in",
  // The signed-out main button, in the hero and after "Every number has a source". Both open the passcode page.
  startLearning: "Start learning",
  // Shown instead of "Sign in" when the Learner is already signed in. Both open /study.
  studyWorkspace: "Study Workspace",
  openStudyWorkspace: "Open Study Workspace",
  // Signed-in hero button: "Resume: [Topic]" or "Start: [Topic]". All three open /study.
  resume: "Resume:",
  start: "Start:",
  signOut: "Sign out",
  howItWorks: "How it works",
  screenshotAlt: "The Study Workspace: a Tutor conversation on the left and a worked widget on the right.",
  // The stats line, every number worked out by code: "95 Topics · 103 historical cases · 8 sources".
  stats: (s: { topics: number; cases: number; librarySources: number }) =>
    `${s.topics} Topics · ${s.cases} historical cases · ${s.librarySources} sources`,
  how: {
    eyebrow: "How it works",
    title: "Every Topic follows the same seven Teaching Steps",
    steps: [
      { name: "Story", line: "A real Case sets the scene: what was known, and what was at stake." },
      { name: "Concept", line: "The idea behind it, in plain words, with the one formula that matters." },
      { name: "Explore", line: "You move the sliders on a live Widget and spot the pattern for yourself, before the Tutor names it." },
      { name: "Your turn", line: "You answer a worked question on your own, using the idea you have just met." },
      { name: "Check", line: "A short question shows whether the idea landed." },
      { name: "Reveal", line: "What actually happened next, and how it compares with your answer." },
      { name: "Principle", line: "What this Topic teaches that carries over to the next filing you read." },
    ],
  },
  sources: {
    eyebrow: "Provenance",
    title: "Every number has a source",
    points: [
      { name: "Code calculates", line: "Sums, rates and present values are worked out by code, never guessed by the model." },
      { name: "Your assumptions", line: "Numbers you chose are marked in teal, so you always see what rests on you." },
      { name: "Sourced facts", line: "Figures from filings and records are marked in amber, with their date." },
      { name: "Quotes link back", line: "Every quote opens the passage it came from in the Library." },
    ],
  },
  footer: "A private study project. Past events only; nothing here is investment advice.",
} as const;
