---
status: accepted
date: 2026-11-15
deciders: FlowHub maintainers
---

# ADR-0023: The dog as a companion that shows what the agents are doing

Extends [ADR-0013](0013-comic-theme-from-the-logo.md) D3 ("the dog speaks"). Keeps invariants 9 and 10 ([ADR-0005](0005-deal-room-data-model.md) D4): it reads only what FlowHub already writes, through the same Firestore listeners. Product decision PRD Q35, requirements PRD 7.31. A Grand Finale candidate (4 Dec 2026), built behind a flag.

## Context and problem statement

FlowHub's agents do most of their work out of sight. A person sees progress only on the deal room's progress panel, and only while that page is open. On the Home page, an offering page or the Inbox, nothing shows that research is running, that a gate is waiting, or that the Reviewer has blocked a claim. Judges weigh technical merit and GenAI use at 40%, and the AI has to look load-bearing. A person who can't see the agents working, and when they need you, reads FlowHub as forms with a model behind them.

The FlowHub dog already appears in empty states and the loader (ADR-0013 D3). On 2026-11-15 the maintainer saw a social post about a signup page whose 3D avatar reacts to typing. They asked for a small companion instead: on every screen, reacting to what the person does and to what the agents do.

Two clickable mockups settled the shape. The first put the dog in the corner of a FlowHub screen and drove it from a simulated deal run. The second compared five designs of the dog in eight states. The maintainer chose the sticker design.

## Decision drivers

- Show the agents working, and when a person is needed, on every screen, not only in the deal room.
- No new trust risk. The companion must never say anything the screen and the events don't already say. In particular, it gives no price, claim or number of its own (invariants 1 to 4).
- No new write path, no model call, no cost (invariants 9 and 10, a near-zero budget).
- The app must stay stable for the 4 Dec finale. The companion has to be easy to switch off and must never block a primary action.
- One product look: the logo's dog in the comic theme (ADR-0013).

## Considered options

**Whether to add it:**

| | A companion driven by progress events (chosen) | No companion | A reacting avatar on the sign-in page only (the post's idea) |
|---|---|---|---|
| Shows the agents working | Everywhere | Deal room only | No |
| Shows when a person is needed | Everywhere, with a badge | Deal room and Inbox counts | No |
| Cost | None: reads existing events | None | None |
| Risk | Distraction if it talks too much | None | A heavy page where people sign in |

**Which dog** (compared on 2026-11-15 in every state at 64 px):

| | A: the logo image | B: the logo redrawn on its disc | C: comic outline on a yellow disc | D: peeking over the edge | E: sticker (chosen) |
|---|---|---|---|---|---|
| Reads as the logo | Exactly | Yes | Partly | Partly | Yes, full body |
| Shows states with its face | No, props only | Yes | Yes | Yes, no body | Yes, with body and tail |
| Fits the comic theme | Less | Less (heavy black disc) | Yes | Yes | Yes: white edge, ink shadow |
| Works on light and dark | Yes | Heavy on light | Yes | Needs a ledge | Yes |
| Art to draw | None | Some | Some | Some | Most |

**How it is drawn:** an inline SVG of parts, posed by CSS (chosen), over a 3D or WebGL avatar from another project (a heavy dependency, likelier to fail on old phones, someone else's design, and against the fresh-project rule) and over Lottie or video files (a new runtime dependency and files to maintain).

## Decision

**D1. The sticker dog.** The logo's dog, full body, as a die-cut sticker: a white edge, a 3 px hard ink shadow, a yellow bandana in the primary colour, and no disc. It is drawn from the logo as an inline SVG in parts (ears, head, eyes, brows, mouth, body, tail, props), so CSS can pose it. The dog keeps its own ink and white in light and dark mode. The art is FlowHub's own. The mockup drawings are a guide, and the final poses are drawn properly before release.

**D2. Where it sits.** Bottom right of every signed-in screen inside the hub shell, about 72 px, clear of the page's own controls. A page whose primary action sits bottom right moves the dog up. It never appears on the public pages, the proposal preview (`.fh-doc`), printable pages such as `/form-qr`, or dialogs. On phones it shrinks to 56 px.

**D3. Eight states, from data FlowHub already writes.** The companion opens no listener the browser doesn't already have permission for. It reads three things: the workspace's opportunities (the stage summaries), the latest event of a running stage (`limitToLast(1)` on that run's `events`), and the Ask or tell proposals still marked `proposed`. Typing in the Ask or tell box is a local browser event and is sent nowhere. When several states apply, the highest in this table wins:

| Priority | State | When | Pose |
|---|---|---|---|
| 1 | Worried | A stage is `failed` | Ears down, brows up, a sweat drop |
| 2 | Flagged | The current write run's claim table has a claim marked `neither` | Points at a red flag |
| 3 | Waiting for you | A stage is `waiting` at its gate, or a proposal is still `proposed` | Sits up, a "!" |
| 4 | Thinking | The running stage's latest event comes from an `ai` actor | Sniffs with a magnifier |
| 5 | Counting | The running stage's latest event comes from a `calc` actor | Taps a calculator |
| 6 | Happy | A stage turned `approved` in the last 6 seconds | Three hops, tail wags |
| 7 | Listening | The person is typing in Ask or tell | Ears up, head tilted toward the box |
| 8 | Asleep | None of the above | Eyes closed, "zzz" |

The mapping from data to state is a pure function in `web/src/lib/companion/`, with unit tests.

**D4. It only repeats what is already true.** A speech bubble appears when the state changes, and fades after about 5 seconds. One bubble at most every 3 seconds. Its text is either the event's own `message`, which the pipeline wrote for the progress panel, or a fixed line from a short list in code ("Research is waiting for you"). It never contains a price, a claim about a prospect, or a figure that isn't in that event. It carries the same who-did-what marker as the event (ADR-0009 D4). States that need a person keep a badge on the dog after the bubble fades.

**D5. Clicking it.** A small panel shows the active deal's stages with their markers and state, the prospect's name, and a link to open the deal room (or the proposals). It also has "Hide the dog". Escape closes the panel, and focus returns to the dog.

**D6. The person stays in control, and nothing is written.** Hiding the dog is a browser preference in `localStorage`, not workspace data, so the browser still never writes to Firestore (invariant 10). "Show the dog" sits in the sidebar foot, next to Sign out. Under `prefers-reduced-motion` the dog changes pose with no movement. The dog itself is decorative (`aria-hidden`), and the button carries a label. Only states that need a person (worried, flagged, waiting) are announced, in a polite live region, because the screen already says the rest.

**D7. Behind a flag.** The companion renders only when `NEXT_PUBLIC_FLOWHUB_COMPANION=1`. It is off by default. It is tried on the dev project first (ADR-0011), and switched on in production only if it reads well in a recorded run of the demo. Turning it off is a redeploy with the flag unset. Nothing else changes.

## Consequences

- The agents' work, and every moment that needs a person, show on every screen. This is the GenAI story the judges weigh, at no running cost.
- No new write path, model call, Firestore field or Google permission. The extra reads are one listener on the workspace's opportunities, which is small. They are bounded by the same security rules as every other read (invariant 7).
- The companion can't drift into making claims. Its words are the pipeline's own event messages or fixed lines, and tests check that the mapping uses nothing else.
- It is one more moving thing on screen. The priority order, the bubble rate limit, the fade, the badge and the hide option keep it from nagging, and the flag keeps it out of the finale if it doesn't help.
- The sticker dog needs the most art of the five designs. The poses have to be drawn properly, and until then the flag stays off in production.
- No new runtime dependency: inline SVG and CSS, with the fonts already loaded.

## More information

- Both mockups were made and reviewed on 2026-11-15 and are private to the maintainers. The eight states, the priority order and the bubble rules above come from the first. The five designs and the 64 px comparison come from the second.
- The empty states and the loader (ADR-0013 D3) keep the logo mark for now. Moving them to the sticker dog is a later, separate change.
