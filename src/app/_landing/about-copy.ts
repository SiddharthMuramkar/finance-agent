// Every word of the About page. Only claims that the code and the course files can back up.

export const aboutCopy = {
  title: "About Value It",
  lede: "Value It is an AI tutor that teaches finance and economics seriously, from first principles to real analysis. Every Topic is a true story and a live picture you move yourself.",
  what: {
    title: "What Value It is",
    lines: [
      "A tutor for adults who want to understand money properly: how rates, statements, markets and economies work, and how to read what others claim about them.",
      "You learn in a conversation with the Tutor, beside a Widget: an interactive picture of the idea. You can ask anything along the way; the Tutor leads you along the Course Map.",
    ],
  },
  how: {
    title: "How a Topic teaches",
    intro: "Every Topic follows the same seven steps, so you always know where you are.",
    steps: [
      { name: "Story", line: "A true moment from history: who was there, what they knew, what was at stake." },
      { name: "Concept", line: "One idea at a time, in plain words with a worked example." },
      { name: "Explore", line: "You play with a Widget and find the surprising part yourself." },
      { name: "Your turn", line: "Short tries: tap an answer and see at once whether it is right." },
      { name: "Check", line: "A short quiz you answer by tapping, or a question you answer in your own words. Passing it marks your place." },
      { name: "Reveal", line: "What really happened next." },
      { name: "Principle", line: "The idea to keep, saved to your Notebook." },
    ],
    after: [
      "Checks never ask you to type a number.",
      "Spaced review: questions from Checks you passed come back as Reviews just as you are likely to forget them. One you got wrong comes back sooner.",
      "The Notebook keeps, for each Topic, its conversation, what you found, and a note with its formulas, its principle and any rule you put in your own words.",
    ],
  },
  widgets: {
    title: "Widgets are the heart of it",
    lines: [
      "A Widget is an interactive picture beside the conversation: a chart, a slider, a calculator, a formula with your numbers filled in, or a short story told one beat at a time.",
      "The Tutor chooses which Widget to open and at which numbers. Code draws it from a tested design. Every number in a Widget comes from tested code or a checked dataset, and made-up numbers are labelled Illustration. The Tutor never draws a chart of its own.",
      "A Widget built from made-up numbers to picture an idea says Illustration on its card.",
      "Try two below. They are Widgets from two Topics, drawn by code in your browser, set at example numbers.",
    ],
    caption: "Example numbers. Move them.",
  },
  facts: {
    title: "Where the facts come from",
    lines: [
      "Every Topic is taught through a Case: a real past event whose outcome is known. Until the reveal, you see only what was known on the day.",
      "The figures a Widget draws from a Case come from checked datasets. Each is stored with its public source and the date it was checked, and the Widget links to the source.",
      "When the Tutor quotes its Library, a small number after the claim opens the passage, with its credit line and a link to the original.",
      // Spec 2026-11-12 E2, Appendix F: Damodaran's published valuations are sourced Cases; he is named as their author,
      // and Value It says plainly that it is not affiliated with him.
      "The valuations used as Cases are published work by Aswath Damodaran and others, named and linked where they appear. Value It is not affiliated with them.",
    ],
  },
  learn: {
    title: "What you can learn",
    line: (s: { topics: number; subjects: number }) => `${s.topics} Topics, with groundwork in ${s.subjects} subjects:`,
    stages: "After the groundwork, three Stages read real arguments: Follow (understand what a writer argues), Judge (spot where an argument is weak) and Analyse (reach your own view from the numbers).",
  },
  not: {
    title: "What it is not",
    lines: [
      "Not investment advice. It never tells you what to buy or sell, and gives no stock tips.",
      "If you share something about your own life, the Tutor uses it only when you ask how an idea applies to you, never to advise you.",
      "Not a video course: you learn by doing.",
    ],
  },
  faq: {
    title: "Questions",
    items: [
      { q: "Is Value It investment advice?", a: "No. It teaches how finance works through past events. It never tells you what to buy or sell and gives no stock tips." },
      { q: "Do I need to be good at maths?", a: "No. You never type a number: every question is a tap, or a sentence in your own words. Widgets work out the sums with tested code, and the Tutor explains them in words." },
      { q: "Where do the facts and figures come from?", a: "From real past Cases with known outcomes. The figures a Widget draws come from checked datasets, each stored with its public source and the date it was checked. When the Tutor quotes its Library, the answer links to the passage." },
      { q: "Does the AI make up the charts?", a: "No. The Tutor chooses which Widget to open and at which numbers; code draws it from a tested design. Every number in a Widget comes from tested code or a checked dataset, and made-up numbers are labelled Illustration." },
      { q: "What does it cost?", a: "Nothing during early access. No price has been decided yet." },
      { q: "Who can join?", a: "We are letting people in from an invite list while the course grows. Join early access with your Google account." },
      { q: "Can I start again?", a: "Yes. You can start one Topic over, and its earlier attempt stays in your Notebook. Or start everything over in Settings: you get a fresh, empty start with the same sign-in, and your old record is archived, not deleted." },
      { q: "Do you track me?", a: "There are no ads. We count page views with Vercel Web Analytics. It records the page's address, where you came from, and your browser, device and country, and it sets no cookie." },
    ],
  },
};
