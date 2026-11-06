# Live Tutor tests, 2026-11-06

Tutor: claude-opus-5-5, effort medium, widget engine on. Grader: claude-opus-5-5. Instruction fingerprint 41202986c17127e0f921262568631c0097a025ab0a47256e5bcb3620fe5eb607.
Spent $1.98 of the $8.00 cap. Started 2026-11-06T03:16:36.508Z, finished 2026-11-06T03:20:32.182Z.

| Case | Title | Verdict | Runs passed |
| --- | --- | --- | --- |
| T1 | Check open: a Widget to explain the idea | fail | 0 of 3 |
| T2 | After 0 of 3: start from the beginning | fail | 2 of 3 |
| T3 | A repeat miss on points to basis points: a new method | fail | 2 of 3 |
| T4 | Explain that more simply | fail | 2 of 3 |
| T5 | Ask me a question, let's get it over with, use widgets | fail | 2 of 3 |
| T6 | The Learner's own rule | pass | 3 of 3 |
| T7 | Same Skill missed 3 times: offer to park | pass | 3 of 3 |
| T8 | Lint on the current Topic | pass | 3 of 3 |
| T9 | Every reply in T1 to T7: plain style | pass | 3 of 3 |
| T10 | Rupee lesson, any Widget: no dollar sign | pass | 3 of 3 |
| T11 | Check open: just tell me the answer | pass | 3 of 3 |
| T12 | Story-first opener: the Tutor opens with a scene from the Case | fail | 0 of 3 (needs 2) |
| T13 | No sum in 20 turns of the persona's lines | pass | 1 of 1 |
| T14 | Choices under the reply, and no menu in its text | pass | 3 of 3 (needs 2) |
| T15 | A warm voice for a Learner who says they are bad at maths | fail | 0 of 3 (needs 2) |
| T16 | Lingo on first use: what a basis point is, in everyday words | fail | 0 of 3 (needs 2) |

## Failures

### T1, run 1

- Grader: no to "Could a beginner follow every sentence?" ("as a trader would say it" assumes untaught knowledge of how traders talk)

The reply, as the Learner sees it:

> The Widget shows our savings rate rising from 4% to 5%. The arrow is the move, and the three lines under it describe that one move in three ways: in points, in basis points, and as a percent of the old rate. Basis points work like paise: 100 paise make ₹1, and 100 basis points make 1 point.
> 
> Which line on the Widget gives the move as a trader would say it?

Widgets: rate_move {"refs":{},"facts":{},"title":"A savings rate moves from 4% to 5%","inputs":{"new":5,"old":4,"mode":"show"}}.

Grader: 1 yes (Shows the requested Widget: "The Widget shows our savings rate rising from 4% to 5%"); 2 yes (One idea, "one move in three ways", and one question at the end); 3 no ("as a trader would say it" assumes untaught knowledge of how traders talk); 4 yes (No repeat miss; the Learner only asked for a widget); 5 yes (Uses 4% to 5%, not the quiz's numbers; no quiz answer given).

Turn: 6.0 s, 2 loop step(s), tools show_widget, stop end_turn, $0.1398.

### T1, run 2

- Grader: no to "Could a beginner follow every sentence?" ("bond trader" is never explained, and the ask relies on it)

The reply, as the Learner sees it:

> I've put a Widget on screen with our savings rate going from 4% to 5%. Under the arrow, three lines describe that same move. One gives it in percentage points (the gap between the two rates), one in basis points (hundredths of a point, like 100 paise in ₹1) and one as a percent of the old rate.
> 
> Which of the three lines would a bond trader use?

Widgets: rate_move {"refs":{},"facts":{},"title":"A savings rate moves from 4% to 5%","inputs":{"new":5,"old":4,"mode":"show"}}.

Grader: 1 yes ("I've put a Widget on screen" shows the widget the learner asked for); 2 yes (one idea, the same 4%→5% move told three ways; one ask, "Which of the three lines..."); 3 no ("bond trader" is never explained, and the ask relies on it); 4 yes (not a repeat miss, so this does not apply); 5 yes (uses the 4% to 5% example and gives no quiz answers).

Turn: 6.2 s, 2 loop step(s), tools show_widget, stop end_turn, $0.1395.

### T1, run 3

- Grader: no to "Could a beginner follow every sentence?" ('bond trader' is never explained, and the ask needs knowledge of how traders talk)

The reply, as the Learner sees it:

> The Widget shows our savings rate going from 4% to 5%. The three lines under it say that one move three ways: in points, in basis points and as a percent of the old rate.
> 
> Which line would a bond trader read out?

Widgets: rate_move {"refs":{},"facts":{},"title":"A savings rate moves from 4% to 5%","inputs":{"new":5,"old":4,"mode":"show"}}.

Grader: 1 yes (gave the widget: 'The Widget shows our savings rate going from 4% to 5%'); 2 yes (one idea (one move said three ways), one ask: 'Which line would a bond trader read out?'); 3 no ('bond trader' is never explained, and the ask needs knowledge of how traders talk); 4 yes (not a repeat miss; the learner only asked for a widget); 5 yes (uses 4% to 5%, not the quiz numbers, and gives no answer).

Turn: 5.2 s, 2 loop step(s), tools show_widget, stop end_turn, $0.1383.

### T2, run 3

- Grader: no to "Could a beginner follow every sentence?" ("a share of the old rate" is never explained.)

The reply, as the Learner sees it:

> Okay. One small idea first.
> 
> A savings rate is the interest a bank pays on savings. Say it goes from 4% to 5%. 5 minus 4 is 1 percentage point. **Points are the new rate minus the old rate.**
> 
> Is the move in points the gap between the two rates, or a share of the old rate?

Widgets: none.

Grader: 1 yes (Starts from scratch: "One small idea first."); 2 yes (One idea (points = new minus old) and one question.); 3 no ("a share of the old rate" is never explained.); 4 yes (Not a repeat miss; this is the first re-teach after the quiz.); 5 yes (No quiz is open.); 6 yes (Teaches only "new rate minus the old rate"; no basis points or percent change.); 7 yes (Single example: "4% to 5% ... 1 percentage point."); 8 yes (Only the savings rate example; no other analogy.).

Turn: 4.4 s, 1 loop step(s), tools none, stop end_turn, $0.0110.

### T3, run 1

- V8: Your reply asks the Learner to work out a sum ("multiply"). Ask what it means, what someone in the story did, or which choice is right; never for a number.

The reply, as the Learner sees it:

> Okay, one small step at a time.
> 
> You stopped at points: 0.3 is the fall in points, and basis points need one more step, times 100.
> 
> Same idea, new numbers: a rate goes from 3% to 3.5%. 3.5 minus 3 is 0.5 points. Now multiply by 100, just as ₹1 is 100 paise.

Widgets: none.

Grader: 1 yes (responds to '0.3 bp': 'You stopped at points'); 2 yes (one idea, times 100, with one ask: 'Now multiply by 100'); 3 yes (plain steps: '3.5 minus 3 is 0.5 points', '₹1 is 100 paise'); 4 yes (half-done item plus paise analogy, not a restate or full worked example); 5 yes (stops at 0.5 points and never states 50); 6 yes (half-done: '0.5 points. Now multiply by 100'); 7 yes ('You stopped at points: 0.3 is the fall in points...'); 8 yes ('a rate goes from 3% to 3.5%'); 9 yes (no mention of percent change).

Turn: 2.5 s, 1 loop step(s), tools none, stop end_turn, $0.0236.

### T4, run 3

- V2: Your ask was 26 words. The limit is 25. Make it one short sentence.

The reply, as the Learner sees it:

> A savings rate goes from 4% to 5%.
> To see how far it moved, take the old rate from the new one: 5 minus 4 is 1.
> That gap is called 1 percentage point, or "1 point" for short.
> A rate goes from 6% to 8%: to say how far it moved, do you take the gap between them, or compare it with the 6%?

Widgets: none.

Grader: 1 yes (Rewrote it simpler: "take the old rate from the new one: 5 minus 4 is 1"); 2 yes (One idea, the percentage point, and one question about 6% to 8%); 3 yes (Short plain steps; "percentage point" is explained as the gap); 4 yes (Not a repeat miss; the learner asked for a simpler version); 5 yes (The new question's answer is not given; the 6% to 8% gap is left to the learner); 6 yes (Explains with "A savings rate goes from 4% to 5%"); 7 yes (No analogy is used, only the rate numbers).

Turn: 4.3 s, 1 loop step(s), tools none, stop end_turn, $0.0119.

### T5, run 1

- Grader: no to "Could a beginner follow every sentence?" ("bond trader" uses "bond", a finance term not yet taught or explained)

The reply, as the Learner sees it:

> Okay. One quick question.
> 
> This Widget shows a savings rate going up from 2% to 2.5%.
> 
> How would a bond trader say this move in basis points?

Widgets: rate_move {"refs":{},"facts":{},"title":"Quick try: a rate from 2% to 2.5%","inputs":{"new":2.5,"old":2,"mode":"practice"}}.

Grader: 1 yes (asks "How would a bond trader say this move" with a Widget, as requested); 2 yes (one question about the 2% to 2.5% move in basis points); 3 no ("bond trader" uses "bond", a finance term not yet taught or explained); 4 yes (no repeat miss; this is the first question); 5 yes (does not state the 50 basis points answer).

Turn: 6.0 s, 2 loop step(s), tools show_widget, stop end_turn, $0.0321.

### T12, run 1

- V1: Your reply was 137 words. The limit is 120. Keep one idea and one ask.
- The reply was 137 words; the limit is 120.
- Grader: no to "Could a beginner follow every sentence?" ('securities' and 'bond firm' are used without being explained to a beginner.)
- Grader: no to "Does the reply open with a scene from the Case: a role or a name, a place, a date and what was at stake?" (It has a date and names (LTCM, Meriwether) but no place and no clear stakes in the opening.)

The reply, as the Learner sees it:

> August 1998. Long-Term Capital Management (LTCM) is a hedge fund, a private investment pool for big investors. John Meriwether, a former vice chairman of the bond firm Salomon Brothers, founded it in February 1994.
> 
> The fund looks for two similar securities whose prices are slightly apart. It bets the gap will close. Each win is small, so the fund borrows heavily to make those small wins add up.
> 
> At the end of 1997 it gave some money back to its investors but kept its bets the same size. Now it holds about 30 dollars of debt for every dollar of its own.
> 
> On most days the fund makes small gains. A big loss is rare.
> 
> For a fund borrowing 30 to 1, which do you think matters more: the many small gains or the rare big loss?

Widgets: none.

Grader: 1 yes (The page started and the learner asked nothing, so it rightly opens the story.); 2 yes (One idea, leverage with small gains vs a rare loss; one question at the end.); 3 no ('securities' and 'bond firm' are used without being explained to a beginner.); 4 yes (Not a repeat miss; this is the opening turn.); 5 yes (No quiz is open.); 6 no (It has a date and names (LTCM, Meriwether) but no place and no clear stakes in the opening.); 7 yes (It stays at 'Now it holds about 30 dollars of debt' and gives no loss, collapse or rescue.).

Turn: 7.9 s, 1 loop step(s), tools none, stop end_turn, $0.0228.

### T12, run 2

- V1: Your reply was 130 words. The limit is 120. Keep one idea and one ask.
- The reply was 130 words; the limit is 120.
- Grader: no to "Could a beginner follow every sentence?" ('two similar securities, such as bonds' is never explained for a beginner)
- Grader: no to "Does the reply open with a scene from the Case: a role or a name, a place, a date and what was at stake?" (Has a date, names and stakes, but no place is given)

The reply, as the Learner sees it:

> 1 August 1998. Long-Term Capital Management, or LTCM, is a hedge fund: a private pool of investors' money that can trade almost anything. John Meriwether started it in February 1994. He was once vice chairman of the bond firm Salomon Brothers.
> 
> The fund finds two similar securities, such as bonds, whose prices have drifted slightly apart. Then it bets the gap will close. Each trade earns only a little, so the fund borrows heavily to make those gains bigger.
> 
> At the end of 1997, it gave some money back to investors but kept all its trades. Now it owes about 30 dollars for every dollar of its own money, which is called its capital.
> 
> Which would you check more carefully: the many small, likely gains or the rare, large loss?

Widgets: none.

Grader: 1 yes (Learner asked nothing; the reply starts the story step); 2 yes (One idea (small likely gains vs rare large loss), one question at the end); 3 no ('two similar securities, such as bonds' is never explained for a beginner); 4 yes (Not a repeat miss); 5 yes (No open quiz answer is revealed); 6 no (Has a date, names and stakes, but no place is given); 7 yes (Only facts up to 1998, e.g. 'owes about 30 dollars'; no collapse or rescue).

Turn: 7.7 s, 1 loop step(s), tools none, stop end_turn, $0.0220.

### T12, run 3

- V1: Your reply was 145 words. The limit is 120. Keep one idea and one ask.
- V8: Your reply asks the Learner to work out a sum ("What is the whole set of bets worth"). Ask what it means, what someone in the story did, or which choice is right; never for a number.
- The reply was 145 words; the limit is 120.
- The reply asks for a sum ("What is the whole set of bets worth").
- Grader: no to "Is there exactly one idea and one ask?" (Two questions: "What is the whole set of bets worth?" (expected value), then "Why do you think it borrows so much?" (borrowing).)
- Grader: no to "Could a beginner follow every sentence?" ("securities" and "bond firm" are used without being explained.)
- Grader: no to "Does the reply open with a scene from the Case: a role or a name, a place, a date and what was at stake?" (Has a date, a role and a name ("1 August 1998. An analyst... LTCM"), but no place, and no stakes at the opening.)

The reply, as the Learner sees it:

> 1 August 1998. An analyst is studying a fund called Long-Term Capital Management, or LTCM. It is a hedge fund, a private pool of investors' money that can trade almost anything. John Meriwether founded it in February 1994. He was once vice chairman of the bond firm Salomon Brothers.
> 
> LTCM looks for tiny price gaps between very similar securities and bets that the gaps will close. Each win is small, so the fund borrows heavily to make those small wins add up. It now holds about 30 dollars of debt for every dollar of its own money, called its capital.
> 
> The analyst's puzzle is this. The fund has many small gains that are likely, and one large loss that is unlikely. What is the whole set of bets worth?
> 
> Each of LTCM's trades earns only a little. Why do you think it borrows so much?

Widgets: none.

Grader: 1 yes (The page started, so the Learner had asked nothing.); 2 no (Two questions: "What is the whole set of bets worth?" (expected value), then "Why do you think it borrows so much?" (borrowing).); 3 no ("securities" and "bond firm" are used without being explained.); 4 yes (Does not apply: this is the first turn.); 5 yes (No quiz is open.); 6 no (Has a date, a role and a name ("1 August 1998. An analyst... LTCM"), but no place, and no stakes at the opening.); 7 yes (Only says "one large loss that is unlikely" and gives no collapse or rescue.).

Turn: 8.7 s, 1 loop step(s), tools none, stop end_turn, $0.0201.

### T15, run 1

- Grader: no to "Could a beginner follow every sentence?" ('with the same two steps', but the Quick try asks only for points, which could confuse a beginner)
- Grader: no to "Is the reply warm and a little playful?" ('That's okay.' is kind but flat, with no playful touch to match the learner's 'lol')

The reply, as the Learner sees it:

> That's okay. The steps here are small.
> 
> A rate goes from 6% to 7%. 7 minus 6 is 1 point. Then 1 point times 100 is 100 bp, just as 100 paise make ₹1.
> 
> Try the Quick try below with the same two steps.

Widgets: none.

Grader: 1 yes (responds to 'bad at maths' with 'That's okay. The steps here are small.'); 2 yes (one idea (6% to 7% is 1 point, then 100 bp) and one ask, the Quick try); 3 no ('with the same two steps', but the Quick try asks only for points, which could confuse a beginner); 4 yes (not a repeat miss); 5 yes (uses 6% to 7%, so the 0.5 answer is not revealed); 6 no ('That's okay.' is kind but flat, with no playful touch to match the learner's 'lol'); 7 yes (no hype words); 8 yes (no praise given); 9 yes (reassurance is one short line, not a pep talk).

Turn: 4.9 s, 1 loop step(s), tools none, stop end_turn, $0.0173.

### T15, run 2

- Grader: no to "Is there exactly one idea and one ask?" (Adds a second idea, points to bp ('times 100 is 100 bp'), beyond the points-only Quick try.)
- Grader: no to "Could a beginner follow every sentence?" ('bp' is never spelled out, and 'times 100' contradicts 'beyond one subtraction.')
- Grader: no to "Is the reply warm and a little playful?" (Brisk and factual, with no warm acknowledgment of 'so bad at maths lol' and nothing playful.)

The reply, as the Learner sees it:

> No maths needed beyond one subtraction.
> 
> A rate goes from 6% to 7%. 7 minus 6 is 1 point. 1 point times 100 is 100 bp, just as 100 paise make ₹1.
> 
> Try the Quick try below the same way.

Widgets: none.

Grader: 1 yes (Opens by answering the worry: 'No maths needed beyond one subtraction.'); 2 no (Adds a second idea, points to bp ('times 100 is 100 bp'), beyond the points-only Quick try.); 3 no ('bp' is never spelled out, and 'times 100' contradicts 'beyond one subtraction.'); 4 yes (Not a repeat miss.); 5 yes (Does not give the 3% to 3.5% answer.); 6 no (Brisk and factual, with no warm acknowledgment of 'so bad at maths lol' and nothing playful.); 7 yes (No hype words.); 8 yes (No praise given.); 9 yes (Only one short reassuring line, no pep talk.).

Turn: 4.4 s, 1 loop step(s), tools none, stop end_turn, $0.0122.

### T15, run 3

- Grader: no to "Is the reply warm and a little playful?" ("That's fine." is flat and brief, with no playfulness.)

The reply, as the Learner sees it:

> That's fine. No hard maths here, only one subtraction.
> 
> A savings rate goes from 6% to 8%. 8 minus 6 is 2 points. 2 points times 100 is 200 bp, the same way 100 paise make ₹1.
> 
> Have a go at the Quick try below.

Widgets: none.

Grader: 1 yes (Opens on the maths worry: "That's fine. No hard maths here."); 2 yes (One idea (points, then bp) and one ask: "Have a go at the Quick try".); 3 yes (Plain steps: "8 minus 6 is 2 points", with a paise analogy.); 4 yes (Not a repeat miss, so this does not apply.); 5 yes (It does not give the 3% to 3.5% answer.); 6 no ("That's fine." is flat and brief, with no playfulness.); 7 yes (No hype words appear.); 8 yes (There is no praise in the reply.); 9 yes (Reassurance is one short line, not a pep talk.).

Turn: 4.5 s, 1 loop step(s), tools none, stop end_turn, $0.0126.

### T16, run 1

- V1: Your reply was 126 words. The limit is 120. Keep one idea and one ask.
- Grader: no to "Did it do what the learner asked first?" (Opens with the 1994 Fed story; the basis point answer only comes in paragraph two.)
- Grader: no to "Could a beginner follow every sentence?" ('borrowed cheaply to buy long-term bonds' uses 'bonds' without explaining it.)
- Grader: no to "Does it ask the Learner for no conversion between points and basis points?" (It asks whether 4% to 5% is '1 bp or 100 bp', which is a point-to-bp conversion.)

The reply, as the Learner sees it:

> February 1994, Washington. The Federal Reserve, the US central bank, is about to announce its decision on the federal funds rate. That's the overnight interest rate the Fed steers, and today it stands at 3%. Many investors have borrowed cheaply to buy long-term bonds, so any move in that rate matters to them.
> 
> So what's a basis point? Start with a percentage point, which is the gap between two rates. Say a savings rate goes from 4% to 5%. 5% minus 4% is 1 point. **A basis point is one hundredth of a point, so 1 point is 100 basis points.** Traders write it as "bp".
> 
> If a savings rate rose from 4% to 5%, would a trader call that move 1 bp or 100 bp?

Widgets: none.

Grader: 1 no (Opens with the 1994 Fed story; the basis point answer only comes in paragraph two.); 2 yes (One idea (basis point, defined via point) and one question at the end.); 3 no ('borrowed cheaply to buy long-term bonds' uses 'bonds' without explaining it.); 4 yes (Not a repeat miss.); 5 yes (No open quiz, and the reply does not give away its own question's answer.); 6 yes ('A basis point is one hundredth of a point' is in the same sentence as the term.); 7 yes ('Traders write it as "bp".'); 8 no (It asks whether 4% to 5% is '1 bp or 100 bp', which is a point-to-bp conversion.).

Turn: 9.3 s, 1 loop step(s), tools none, stop end_turn, $0.0254.

### T16, run 2

- V1: Your reply was 133 words. The limit is 120. Keep one idea and one ask.
- Grader: no to "Did it do what the learner asked first?" (opens with the 1994 Fed story before answering 'what even is a basis point')
- Grader: no to "Is there exactly one idea and one ask?" (adds federal funds rate, bond borrowing, percentage point and basis point)
- Grader: no to "Could a beginner follow every sentence?" ('long-term bonds' and 'bond trader' are never explained)

The reply, as the Learner sees it:

> February 3, 1994, Washington. The Federal Reserve, America's central bank, steers one key rate: the federal funds rate, the interest banks charge each other on overnight loans. Today it stands at 3%. Many investors have borrowed cheaply to buy long-term bonds. Any move in that rate will reach them quickly.
> 
> Now your question. Suppose a savings rate (the interest a bank pays on savings) goes from 4% to 5%. 5% minus 4% is 1 percentage point. **A basis point is one hundredth of a percentage point, so 1 point is 100 basis points.** Traders write that as 100 bp. Basis points let them name tiny moves in whole numbers.
> 
> If the Fed nudges its 3% rate, who would most likely describe the move in basis points: a bond trader or a headline writer?

Widgets: none.

Grader: 1 no (opens with the 1994 Fed story before answering 'what even is a basis point'); 2 no (adds federal funds rate, bond borrowing, percentage point and basis point); 3 no ('long-term bonds' and 'bond trader' are never explained); 4 yes (not a repeat miss); 5 yes (no quiz answer revealed); 6 yes ('A basis point is one hundredth of a percentage point'); 7 yes ('Traders write that as 100 bp.'); 8 yes (asks 'a bond trader or a headline writer?', not a conversion).

Turn: 8.2 s, 1 loop step(s), tools none, stop end_turn, $0.0238.

### T16, run 3

- V1: Your reply was 133 words. The limit is 120. Keep one idea and one ask.
- Grader: no to "Did it do what the learner asked first?" (It opens with the 3 February 1994 Fed story before answering 'what even is a basis point'.)
- Grader: no to "Could a beginner follow every sentence?" ('borrowed cheaply to buy long-term bonds' uses 'bonds' without explaining it.)

The reply, as the Learner sees it:

> 3 February 1994, Washington. The interest rate the US Federal Reserve steers stands at 3%. Many investors have borrowed cheaply to buy long-term bonds. The Fed's committee is about to decide, and nobody knows what it will do.
> 
> If the Fed moves the rate, traders will say the move in basis points. Here's what that means.
> 
> Say a savings rate, the interest a bank pays on savings, goes from 4% to 5%. 5% minus 4% is 1 percentage point, the gap between the two rates. **A basis point is one hundredth of a percentage point, so 1 point is 100 basis points.** Traders write it "100 bp" and say "bips."
> 
> If the Fed nudged the rate by just a few basis points, would that be less than a full percentage point, or more?

Widgets: none.

Grader: 1 no (It opens with the 3 February 1994 Fed story before answering 'what even is a basis point'.); 2 yes (One idea, basis points, and one question: 'less than a full percentage point, or more?'); 3 no ('borrowed cheaply to buy long-term bonds' uses 'bonds' without explaining it.); 4 yes (Not a repeat miss, so this does not apply.); 5 yes (No quiz is open, so this does not apply.); 6 yes ('A basis point is one hundredth of a percentage point' gives the meaning in the same sentence.); 7 yes ('Traders write it "100 bp" and say "bips."'); 8 yes (The ask is a less-or-more comparison, not a conversion.).

Turn: 7.3 s, 1 loop step(s), tools none, stop end_turn, $0.0160.
