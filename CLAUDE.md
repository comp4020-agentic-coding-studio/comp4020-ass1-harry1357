# COMP4020 prototype

This is your starter repo for a COMP4020 prototype: a static site written in
HTML/CSS/TypeScript that builds to plain HTML/CSS/JS and deploys to GitHub
Pages. The **deployed site is what gets marked** --- not this repo, and not "it
works on my machine". It's marked live in Chrome against the deployed URL at two
viewports --- 1920×1080 (desktop) and 390×844 (phone) --- and both count in
full, so make that artefact good at both and use the checks below to know
whether it is.

What you're building this week — the spec — is published on the course website,
and this repo's name tells you which deliverable it is. Run the course plugin's
**start** skill at the start of each week: it pulls the right spec from the
course API, carries your harness forward from last week, and helps you turn the
spec's checkable lines into tests of your own. Read the spec before you build,
and see `spec/README.md` for how the checks in this repo relate to it.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Before you push, run `pnpm check`. It runs most of what CI runs --- build,
  lint, and the spec --- so you catch those in seconds instead of waiting for
  the pipeline. The links check, the evidence check, the secrets scan, and the
  deploy itself only run in CI; run `pnpm dlx linkinator ./dist --silent`
  locally against a fresh `pnpm build` for the links check without waiting for
  CI.
- To see what the page actually looks like rather than what you assume it looks
  like, open it in a browser (the `agent-browser` CLI, documented on
  [the course site](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/backpressure/#agent-browser-the-rendered-page-as-ground-truth),
  works well for this). The rendered page is the truth; your mental model of it
  isn't.
- When a check fails, read its output before changing anything. Each check below
  names what it measures, and the failure message is the instruction: it tells
  you the file, the line, or the contract. Treat a red check as authoritative
  --- the page is wrong until the check is green, not until you decide it should
  be.
- Commit when the checks pass. Never commit a red state.

## The checks (your sensors)

CI runs these on every push once your repo is public. GitHub's checks UI shows
two jobs, `check` and `deploy` --- not one status per sensor below --- and
within `check` the steps run in sequence (`pnpm check` chains typecheck, build,
lint, and the spec with `&&`), so an early failure like a broken build stops the
later sensors from running for that push; fix it and push again to see the rest.
While the repo is private (all week, until you ship) the CI jobs stay skipped
--- `pnpm check` is the same roster on your machine, and it's the faster loop
anyway. They aren't hoops. Each is a different way of finding out something true
about the site that you can't reliably see by looking at it.

They also carry a mark at a crit: the sweep runs fifteen minutes after your
cutoff, and green checks there are worth half that week's shipped mark. Still
running counts as not green, so ship with time for CI to finish.

- **typecheck** --- `tsc --noEmit` runs first in `pnpm check`, so a type error
  stops the roster before the build even starts. The types are extra
  backpressure: a red here is the compiler telling you a claim in the code is
  false.
- **build** --- the site must build (`pnpm build`). A build failure means the
  deployed site is broken or stale, so nothing else matters until this is green.
- **deploy / online** --- the live GitHub Pages URL must load and return the
  page you expect. An asset that 404s on the deployed URL counts as broken even
  if it loads locally.
- **spec** --- `spec/invariants.test.ts` asserts what's true of any good
  website, whatever the week's brief asks; the tests you write for the week's
  own spec run alongside it (any `spec/*.test.ts`). A failure names the contract
  you haven't met yet.
- **lint** --- `stylelint` for CSS, `oxlint` for TypeScript. Flags code that's
  wrong, fragile, or non-idiomatic. Read the rule it names.
- **tests** --- any other tests you write, wherever you put them (co-located
  with your source is fine, not just `spec/`), must pass. Vitest picks up both
  this and the spec suite in one `vitest run`, the last step of `pnpm check`. A
  failing test is a claim about the site that's no longer true.
- **evidence** (`pnpm check:evidence`) --- checks your process evidence:
  `PROCESS.md`'s citations resolve to real commits, the current deliverable's
  exact reflection is in `reflections/` (worked out from this repo's name
  against the public course API), and your `CLAUDE.md` is present. Evidence
  gates the deploy --- `deploy` needs `check` to pass, so failing evidence
  blocks the deploy alongside everything else. See
  [Your process is part of the mark](#your-process-is-part-of-the-mark) below,
  and the course website's
  [assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#what-you-submit)
  for what counts as evidence.
- **links** --- internal links must resolve. A broken link is a dead end you
  didn't mean to ship.
- **secrets** --- the repo is scanned for committed credentials. Never put a
  key, token, or password in a tracked file. If one leaks, rotate it. A local
  pre-commit hook (`.githooks/pre-commit`, installed by `pnpm install`) also
  blocks any commit containing something shaped like an API key --- by the time
  CI sees a key it's already pushed, so the hook is the sensor that matters.

Nothing here measures **accessibility** or **performance** --- wiring those
sensors (`axe-core`, Lighthouse, or whatever you choose) is your work, and later
in the course the spec will ask you to show how you tested both. When you do,
read a green performance result honestly: it's a lab estimate from one run on a
CI machine, not proof the site is fast for real users.

## The stack is swappable

Out of the box this is plain HTML/CSS/TypeScript on Vite, and every `.html` file
in the repo is a page: add pages, link them, and the build picks them up with no
config. That's a default, not a rule (unless the week's spec says otherwise).
You can swap in Astro or any other static generator, because nothing in CI names
a tool --- the whole contract is:

- `pnpm build` emits the complete site into `dist/`
- the `package.json` scripts (`check`, `check:evidence`, `build`) keep working
- whatever lands in `dist/` still passes the invariants in `spec/`

Two things bite in a swap. The deployed site lives under a path
(`…github.io/<repo>/`), so configure your generator's base path --- this
template's Vite config uses relative asset URLs to sidestep that, but most
generators (Astro included) need `base` set explicitly, and getting it wrong
looks fine locally while every asset 404s on the live URL. And commit the
updated `pnpm-lock.yaml`: CI installs with `--frozen-lockfile`.

## Astro on this template (learned in crit 2)

- **Use relative URLs, not `base`.** Setting Astro's `base` to the repo name
  makes assets resolve once deployed but breaks the links check, which crawls
  `dist/` as the site root and sees `/<repo>/…` as a 404. Relative URLs are
  correct in both places. The config that does it:
  `build: { format: "file", assetsPrefix: "." }`. `format: "file"` is what makes
  it work — every page lands at the top level of `dist/`, so `./menu.html` means
  the same thing from every page; with the default directory format each page
  sits a level deeper and would need its own `../`.
- `astro check` replaces `tsc --noEmit` as the typecheck script.
- Astro's image pipeline pulls in `sharp`, which needs
  `allowBuilds: { sharp: true }` in `pnpm-workspace.yaml` or install warns.

## Verifying the rendered page

The rendered page is ground truth --- but only if you've checked you're
rendering the right page at the right size. Both failed here in one session.

- **The shell's working directory resets between commands.** `serve dist` without
  an explicit path silently served *last week's repo*. Always pass an absolute
  path: `python3 -m http.server 8099 --directory "$PWD/dist"`.
- **Chrome's headless mode enforces a ~500px minimum window.** `--window-size=390,844`
  lays the page out at 500px and then *crops* the screenshot to 390, which looks
  exactly like horizontal overflow that isn't there. Don't fix a bug you've only
  seen in a picture.
- **To measure a real phone viewport**, load the page in a **same-origin** iframe
  (`<iframe src="./index.html" style="width:390px">`) — an iframe gets its own
  viewport *and* its own media-query context — then read
  `document.documentElement.scrollWidth` and flag any element whose
  `getBoundingClientRect().right` exceeds the width. A number beats a screenshot.
  Cross-origin (a different port) yields a null `contentDocument` and a probe
  that silently reports nothing.
- **The shell here is zsh, which does not word-split unquoted variables.**
  `set -- $spec` with `spec="390 520"` gives *one* argument, not two, so a loop
  that is correct in bash quietly passes `--window-size=,900`. Chrome ignores
  the malformed flag, lays out at its own default width, and the probe reports
  confident numbers for a viewport you never tested. Split explicitly
  (`${=spec}`) or use separate variables.
- **Drive the page from the probe rather than screenshotting a live one.** Have
  the harness page pause the simulation, reset it, and step a fixed number of
  ticks before measuring, so two runs are comparable. Give the harness page a
  loud background colour (`#f0f`) --- it makes the boundary of the real
  viewport unmistakable instead of blending into the page's own dark ground.

## Accessibility sensors

Nothing in the starter measures accessibility, so wire it yourself --- and be
honest about what each tool actually covers.

- `axe-core` runs over the built HTML under jsdom and catches structural
  problems (landmarks, labels, heading order, duplicate ids).
- **Run axe *inside* the jsdom realm, not against it.** Construct the DOM with
  `runScripts: "dangerously"`, `dom.window.eval(readFileSync(require.resolve("axe-core")))`,
  then call `dom.window.axe.run(dom.window.document, …)`. The alternative is
  shimming a dozen browser globals onto `globalThis` and it breaks on every axe
  upgrade. Pass a `VirtualConsole` to swallow jsdom's complaints about module
  scripts it can't execute.
- **Check the sensor is actually looking.** A green axe run and a run that
  silently loaded nothing look identical from the test output. Print
  `results.passes.length` once: this page reports 37 rules passing, so zero
  violations means something. `landmark-one-main` and `page-has-heading-one`
  come back *incomplete* under jsdom because visibility needs layout --- the
  invariants already assert both, so that gap is covered elsewhere, not ignored.
- **Chrome has `--force-prefers-reduced-motion`.** Use it to verify the
  reduced-motion path renders what you think it does, rather than trusting the
  media query by inspection.
- A control's accessible name has to distinguish it from its siblings. Three
  sliders all named "Agility" are three identical announcements; append a
  visually hidden `for Unit A` so the name is "Agility for Unit A".
- Don't reach for `<output>` as a read-only value display. Its implicit role is
  `status`, so it is a live region, and it will double-announce every value the
  control it mirrors already reports. A plain `<span>` is correct.
- **axe cannot judge contrast under jsdom** — no layout, no computed colour, so
  `color-contrast` returns "incomplete" for every node. Disable that rule
  explicitly and check the palette arithmetically instead; leaving it enabled
  looks like coverage you don't have.
- Every `<h1>` must sit inside a landmark. A full-bleed hero placed between
  `<header>` and `<main>` trips axe's `region` rule — put it inside `<main>`.
- A colour token that's legible on one background is not legible on all of them.
  When a class is used on both the dark hero and the light page, scope the
  bright variant to the hero and make the *dark* value the default.

## CSS conventions

- Don't use the `padding` / `margin` shorthand on a class that shares an element
  with a layout class --- `padding: 2.5rem 0 4rem` on `.page` silently reset
  `.wrap`'s horizontal padding to `0`. Use `padding-block` / `padding-inline`.
- Declare lower-specificity selectors before higher ones or stylelint's
  `no-descending-specificity` fails (e.g. `.inline-list li` must come before
  `.menu-list li:last-child`). This bites across *sections* too: a
  `.mechanism .haste-factor` written down in the prose block still has to
  precede `.channel[data-hasted="true"] .haste-factor` written up in the
  components block.
- **Same trap as the shorthand one, different property: don't put
  `max-inline-size` on an element that already carries `.wrap`.** `.wrap`
  centres its own box with `margin-inline: auto`, so narrowing it centres the
  narrow column and silently breaks the left edge every other section shares.
  Nest a child (`<div class="wrap"><div class="prose">`) instead.
- **stylelint-config-standard rejects BEM.** `selector-class-pattern` is
  kebab-case only, so `channel__name` and `channel--hasted` both fail. Use
  `channel-name`, and state classes like `.is-acting` or a `data-` attribute.
- **Media queries must use range notation** (`media-feature-range-notation:
  context`): `@media (width <= 46rem)`, never `(max-width: 46rem)`.
- Alpha values are percentages (`opacity: 50%`), colour functions are modern
  (`rgb(0 0 0 / 50%)`), and a blank line between two declarations inside one
  rule fails `declaration-empty-line-before`.

## Typography

- **IBM Plex Mono squashes U+00BD (`½`) into a single monospace cell** and it
  renders as an illegible smudge next to a `×`. Write `1/2` --- three cells,
  legible, and it matches how the source documentation writes it.
- Reserve the mono face for values the page actually computes. Once it is also
  used for eyebrows and labels it stops meaning "this is a measured number".

## TypeScript on this template

- **Flow narrowing does not reach hoisted `function` declarations.**
  `const root = doc.querySelector(…); if (!root) return;` still leaves `root`
  possibly-null inside a `function foo()` declared further down, because the
  compiler can't prove the function isn't called before the guard. Re-bind with
  an explicit annotation (`const root: HTMLElement = found;`) rather than
  reaching for `!`.
- **`types: ["node"]` means a bare `setInterval` is Node's**, which returns a
  `Timeout`. `window.setInterval` returns a `number`. Type the handle
  `number | null` when you call it through `document.defaultView`.
- `verbatimModuleSyntax` is on, so type-only imports must say `import type`.

## Your process is part of the mark

The deployed page is only half of it. How you got there is marked too: your
commit history, your agent files, and the decisions visible across them. The
checks above can't see any of that, so a person reads it directly --- which
means building legibly is part of building well.

- **Commit as you go.** Small, frequent commits are the record of how the work
  came together, and that record is read, not just the final state. A trail that
  grew alongside the code is the strongest evidence of your process; a single
  dump the night before is the weakest.
- **Keep a process overview** (`PROCESS.md`). A short reading-guide, not an
  essay: what you built, the moments that mattered --- each pointing at a
  commit, a `CLAUDE.md` change, or a prompt and the commit it produced --- and
  where to look in the history. It points a marker at the evidence; it doesn't
  stand in for it, and claims the history doesn't back don't count. The
  `PROCESS.md` in this repo is a template showing the shape and the citation
  format (link text the commit hash or range, target the commit or compare URL);
  `pnpm check:evidence` verifies your citations resolve to real commits before
  you ship. Markers follow those citations and don't trawl the repo for evidence
  you didn't cite.
- **Write your reflection in `reflections/`** --- a short markdown file in this
  repo, named for the deliverable it answers, so the number in the filename is
  the number in this repo's name (`crit-1.md` in `comp4020-crit1-<you>`,
  `assignment-1.md` in `comp4020-ass1-<you>`); `reflections/README.md` has the
  full rule. `pnpm check:evidence` checks the exact current name against the
  course API, not merely the presence of any well-named file. It answers the two
  standing prompts: the breakthrough that moved the work forward, and what this
  work changed about the developer you want to be. It stays out of the deployed
  site. It's due at the cutoff, and if it isn't in the repo by then the week
  doesn't count as shipped, however good the prototype is.
- **This file is process evidence.** The harness you build to direct the agent,
  this `CLAUDE.md` and any `AGENTS.md`, is itself read as part of how you
  worked. Keep it honest and current (see below).

You don't need a name, a student number, or any identity file in the repo: we
know whose repo it is. Spend the effort on the work.

## This file is yours

This CLAUDE.md is a starting point, not a fixed rulebook. As you learn what your
prototype needs --- a convention to hold the agent to, a sensor that keeps
catching you out, a fact about the stack the agent keeps getting wrong --- write
it down here. Growing this file is the work of harness engineering, and the gap
between this boilerplate and your own version is part of what your prototype
says about the developer you're becoming.
