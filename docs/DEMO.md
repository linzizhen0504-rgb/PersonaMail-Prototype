# Demo: the style profile learns from what the writer does

For a presentation. It shows one email: the more the writer changes, the more the system knows about how they change text, and it says
so with evidence. Nothing here is shown to participants of the study: the profile only appears with `?profile=1` in the address.

## Before the demo

1. Three services running (see README, "Run"): `npm start` (3000), `npm run server` (3001), `uvicorn app:app --port 3003` in `model_service`.
   Restart the backend and the preference service after any code change, otherwise the old code answers.
2. Open **http://localhost:3000/?pid=DEMO&profile=1** (a `pid` of its own keeps the demo out of the study logs). Log in with a name.
3. Rehearse once. The model writes something different every time, and a quarter of the displays come in random order (this is on
   purpose, for the study; a click on Regenerate shows them again).
4. Keep a screen recording of a good run as a backup.

## The request

> My roommate keeps eating the leftovers I label in the fridge, and last night it was my birthday cake. We're good friends and I don't want a war, but I'm done being nice about it. Write him an email.

Say beforehand who the writer is: **"someone direct, who does not like long and soft texts."** Then act like that.

## Steps (3 to 4 minutes)

1. **Send the request.** The factors are chosen, the email and its components appear together. Click the **Style** tag next to
   "Email Components": it says nothing is learned yet.
2. **Take three cards the way that writer would**: the shortest, most direct version each time (for example in Subject Line, Statement of
   Purpose, Justification). Use, do not Regenerate.
3. **Click the Style tag again.** The tag shows the **evidence** (it only goes up). The popover has two bars: **Evidence** and **Style strength**
   (hover each for what it means; the strength can go down when the writer changes very different texts, so do not present it as accuracy). It now shows, with the cards they come from: what the writer tends to do ("Tends to make texts shorter
   (about N% on average)", "Often adds new sentences (k of n changes)"), the versions taken and the ones passed over, and the latest operations.
   Every statement lists its evidence; nothing is said from fewer than two changes.
4. **Open the next component and an intent.** One card may carry a line "Matches your picks: ..." (hover it for the similarity and the length it
   would give). It is the card the profile is clear about; there is not always one.
5. **Use a card in a component that shares its intent with others.** The window "Apply this change to other parts?" opens; the rewrites there follow
   the length and the manner of what the writer has done in this email.
6. **Edit by hand** the text of a card you used (cut a few words), then open the tag: the hand edit is in the latest operations and in the statistics.
7. **New Task** starts again with an empty profile: it belongs to one email.

## What to say, and what not

What is true and measured:
- When the profile says the writer shortens or lengthens texts, the rewrites in the propagation window and the version cards follow that length (14 of 14 and 13 of 14 cases in a test with the real model).
- The profile is built from what the writer does (cards used, cards passed over, AI rewrites, hand edits), and every statement shows its evidence.
- The sentence analysis (which sentences a card added or removed) was checked on real cards before it was built.

What is **not** shown by our data (say so if asked):
- That the ranking is more accurate with the profile. Replayed on the study logs (74 picks) the card the writer took was ranked first in about
  45% of the cases with the profile term against 40% without, and the mean rank did not move; the difference is inside the noise (see docs/ARCHITECTURE.md).
- That the rewrites are better with the profile. What was measured: with a profile that says "shorter" or "longer" the rewrite follows (14 of 14 and 13 of 14
  cases); the profile alone did not change the rewrites in a way our measures can see, and nobody has judged whether they read better (docs/ARCHITECTURE.md).
- That the system knows the writer across emails: the profile is kept for one email only.

## If something does not work

- No **Style** tag: the address has no `profile=1`.
- The tag stays at "nothing learned yet" after Use: the preference service (3003) is not running or runs old code. Restart it.
- A card list says "Couldn't generate versions" for the Opening Salutation: the rewriter returned the same greeting for every value, so no card
  differs from the text. Use another component for the demo.
- Rewrites do not seem to follow the writer: they follow the length and manner only where it applies, and the model is free; show the profile, not a promise.
