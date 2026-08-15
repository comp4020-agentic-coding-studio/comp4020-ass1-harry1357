# Process overview

## What I built

An interactive explainer arguing one claim about Final Fantasy X's turn system:
Haste doesn't make your counter tick down faster. Every counter drops by exactly
1 on every global tick, always — Haste halves the value the counter _resets to_
after you act. Same visible outcome, completely different machine. Three dials,
an Agility slider and a Haste switch on each, and a tick ledger you can read the
rate off directly
([`9f75c7f...ce29e9e`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-harry1357/compare/9f75c7f...ce29e9e)).

## The moments that mattered

### I didn't trust the tests until I broke them on purpose

The obvious test for Haste is "a hasted unit takes more turns", and it passes.
It's also worthless: the misconception predicts exactly the same turn counts, so
counting turns cannot tell the two stories apart. Rather than write more tests, I
reimplemented the misconception in the engine — Haste decrements 2 per tick, no
reset halving — and re-ran the suite. Seven tests went red, and "hasted gets
twice the turns" **still passed**. That told me which assertions were actually
load-bearing. The engine is pure and DOM-free precisely so that experiment was a
one-line change
([`a988a4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-harry1357/commit/a988a4d)).

### My measuring instrument was lying to me

I was checking phone layout with a headless-Chrome probe that reported clean
numbers: scrollWidth 390, nothing overflowing. Then I printed the iframe's actual
`innerWidth` — 300, with the outer window at 756. The shell is zsh, which doesn't
word-split unquoted variables, so `set -- $spec` passed a single argument and
Chrome silently ignored a malformed `--window-size`. I had been reading confident
measurements of a viewport I had never rendered. The fix that mattered wasn't the
loop; it was the rule in `CLAUDE.md` telling the next probe to assert its own
viewport before I believe its output
([`a988a4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-harry1357/commit/a988a4d)).

### Cutting a real mechanic, and saying so

In the actual game a Haste cast also halves your _current_ counter. I left it
out — not to simplify, but because the reset multiplier alone is what produces
the pause where you flip the switch and nothing happens until the next turn, and
that pause is the entire proof. Adding the catch-up would have hidden it. The
call I had to make was what to do about the gap: an undisclosed omission, on a
page staking itself on accuracy, reads as an error. So it's on the page as a "One
simplification" note, and twice in the engine — including on `setHaste`, the
one-line change that would silently undo it
([`230aa2e`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-harry1357/commit/230aa2e)).

### The screenshot that showed the page arguing against itself

Late on I screenshotted the exact frame I'd be presenting from: Haste just
flipped. The ring had turned brass immediately — which reads as "something
changed" at the precise moment the page needs to say "nothing has changed yet",
because the ring on screen is still the un-hasted cycle. The obvious fix was CSS.
I changed the model instead: combatants now carry `cycleHasted`, whether the
reset that produced the current ring was a hasted one, and the dial is coloured
by that rather than by the status flag. A preview scale now draws the halved ring
a full cycle before it lands. Two tests hold it there
([`ce29e9e`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-harry1357/commit/ce29e9e)).
