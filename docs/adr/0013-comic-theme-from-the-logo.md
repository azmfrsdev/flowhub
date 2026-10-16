---
status: accepted
date: 2026-10-16
deciders: FlowHub maintainers
---

# ADR-0013: A comic theme taken from the logo

Amends [ADR-0004](0004-ui-component-library.md) as amended by [ADR-0010](0010-genai-workflow-in-typescript.md) D6: the mockup canvas still sets the layout, but the brand look now comes from the logo.

## Context and problem statement

On 2026-10-16 FlowHub got its logo: a white puppy in a black circle, and a hero picture of the same dog sitting calmly in a burning cartoon room, saying "This is FlowHub" in a hand-drawn speech bubble. The joke is the product's promise: the catalogue chaos is real, and FlowHub stays calm.

The app still wore the mockup canvas's look: a cool grey page, a blue primary and Plus Jakarta Sans throughout. The logo and the app looked like two different products.

Three directions were compared side by side on the same offering card: keep the current look, a warm version (yellow primary, rounded headings), and a comic version (ink outlines, hard offset shadows, hand-lettered headings). The maintainer chose the comic version. A first build used Gochi Hand for headings over Plus Jakarta Sans; the maintainer found the heading font too wild and the body too formal next to it. Three font pairings were then compared on the same offering card, and the maintainer chose Patrick Hand with Shantell Sans.

## Decision drivers

- The logo and the app should read as one product, from the home page into the deal room.
- The trust signals are part of the pitch and must stay legible: who-did-what markers, stage states, fit strength, claim support and the private-cost badges (CLAUDE.md invariants 1 to 5).
- Prices, claims and the proposal text are read closely, so body text must stay easy to read, even if it is informal.
- UX is 10% of judging, and the feature freeze is 17 Oct. The change has to be a theme layer, not a rebuild of screens.

## Decision

**D1. Tokens, not screens.** The look changes through the theme in `web/src/app/globals.css` and the shared components (`ui/button`, `ui/badge`, `ui/card`, `SectionCard`, `EditDialog`, the loader and the empty states). Screen layouts stay as built.

**D2. The comic look.**
- **Ink** (`--ink`, a warm near-black) outlines every panel, dialog and button at 2px. Dividers inside a panel stay a soft warm line.
- **Hard offset shadows** in ink: `shadow-comic-sm` (2px) on buttons, `shadow-comic` (4px) on panels, `shadow-comic-lg` (6px) on dialogs and hovered cards. Buttons press into their shadow when clicked.
- **Yellow primary** from the hero art, with ink text on it. Links get their own blue `--link` token, because yellow text on cream fails contrast.
- **Cream page**, white panels.
- **Patrick Hand** for headings (h1 to h3 and card titles) and for the dog's lines: a calm marker hand. It has one weight, so bold is never faked (`font-synthesis-weight: none`). Headings get a thin text stroke for marker weight, and `font-size-adjust` evens the size against the body font.
- **Shantell Sans** for body text, tables and numbers: it has a hand-drawn feel but stays easy to read at small sizes. Code and IDs stay JetBrains Mono.

**D3. The dog speaks.** Empty lists show the dog mark with the empty-state line in a comic speech bubble (`EmptyRow`, `EmptyState`). The loader is the dog, hopping; under reduced motion it only breathes.

**D4. The semantic colours stay.** Markers for AI and code, stage states, fit strength, claim support, go/no-go, private and outcome keep their own colours. "Running" and "research" move off the old blue brand to an `--info` token with the same values, so they don't turn yellow. The Ask or tell box and button take the comic outline and shadow in the AI colour, not ink, so they still read as AI.

**D5. The proposal preview is not themed.** The rendered draft (`.fh-doc`) is set in Arial, the Google Docs default, because it previews the Doc the client will receive.

## Consequences

- The app, the logo and the home page now look like one product.
- Contrast holds: ink on yellow, ink on cream and the semantic pairs all stay at 4.5:1 or better. Muted text on cream was checked against the new background.
- The type is less formal. The hand-lettered font is kept to headings and the dog's lines; prices, claims and tables use Shantell Sans, which is built for reading.
- Inner list items keep soft borders. Only outer panels get the ink outline, so dense screens like the deal room don't turn into a grid of heavy boxes.
- Dark mode tokens were updated to match, but the app has no dark mode switch yet, so they are untested.

## More information

- The direction, and then the font pairing, were each picked from a side-by-side mockup of three options on 2026-10-16.
- Patrick Hand and Shantell Sans are on Google Fonts, under the SIL Open Font License, and are loaded with `next/font`. Plus Jakarta Sans and Gochi Hand are no longer loaded.
