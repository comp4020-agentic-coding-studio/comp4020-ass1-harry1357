# Assignment 1 reflection

**What was the breakthrough that moved the work forward?**

The real breakthrough was realizing my tests were lying to me by passing.
The obvious test — "a hasted unit gets more turns" — passed even when I
deliberately coded the wrong mechanism, where Haste just decrements the
counter faster instead of resetting to a smaller value. That meant the
test wasn't actually checking my claim, just a side effect both
explanations produce identically. Once I reimplemented the misconception
on purpose and watched seven other tests fail while that one kept
passing, I could finally tell which assertions were proving something and
which just looked green.

**What did this work change about who I want to be as a software developer?**

I found a real gap between what the site shows and what actually happens
in the game — Haste also gives an instant partial catch-up in FFX, which
I left out to keep the demonstration clean. The instinct to just quietly
drop that and hope nobody noticed was there. I didn't, because a page
arguing for accuracy that hides its own simplification isn't actually
accurate. I want that to be the default instinct, not something I have to
talk myself into each time.
