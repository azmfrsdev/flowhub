---
status: accepted
date: 2026-09-29
deciders: FlowHub maintainers
---

# ADR-0004: UI component library and design handoff

## Context and problem statement

Step 2 of the way of working is design. The PRD (section 9) lists 16 screens. Several of them are domain-specific and no library provides them:
- the stage rail
- the fit map, with lines between gaps and offerings
- the rate card grid editor
- claim rows with source chips

UX carries 10% of the judging, and there is a side prize for the best UI/UX. The web app is Next.js in TypeScript (ADR-0002).

The screens will be designed in **Claude Design**, which produces a handoff document. That document is then built in the real stack. So the library choice also decides what shape the handoff has to arrive in.

## Decision drivers

- **Full control of the look.** The design must not read as a stock template or a chat wrapper.
- **Accessible primitives** (focus handling, dialogs, menus) without writing them ourselves.
- **Tokens that map one-to-one onto the design handoff,** with both light and dark themes.
- **Room for the custom components,** built from the same tokens.
- **Speed.** About 12 build days remain, and the maintainer is fluent in React.

## Considered options

| Option | Pros | Cons |
|---|---|---|
| **A. Tailwind CSS v4 + shadcn/ui** | The components are copied into our code, so every one can be changed. They're built on accessible Radix primitives. Theme tokens are plain CSS variables, which a design handoff can fill in directly. Its data table is built on TanStack Table, a good base for the rate card grid | We own the component code. The styling is utility classes |
| B. MUI | Very complete, with a mature data grid | Looks like Material unless heavily themed. Its styling system is heavier. Its data-grid features beyond the basics are paid |
| C. Mantine | Complete, with good hooks | Its own theming model means the design tokens need translating. Harder to make the look distinctive |
| D. Radix Themes | Accessible and tidy | Less flexible for custom looks, and a smaller component set |

## Decision outcome

**Chosen: A. Tailwind CSS v4 and shadcn/ui,** at the latest stable versions when the app is scaffolded, pinned in `web/package.json`.

**Supporting choices:**

| Need | Choice |
|---|---|
| Icons | `lucide-react` (the shadcn default) |
| Light and dark theme | Toggled with a `.dark` class, which is how shadcn's tokens switch |
| Fonts | Loaded with `next/font` from Google Fonts. The families are chosen in the design handoff |
| Rate card grid (FR-OG-3) | TanStack Table, with our own editable cells |
| Fit map lines (FR-FIT-8) | Custom SVG over two lists. A two-column layout doesn't need a graph library |
| Score dial | Custom SVG |
| Charts, if any are needed | shadcn Chart |
| Graph view (FR-OG-12, a Should item) | Decided when it's built. A graph library is only justified there |

### The handoff contract

`docs/design/DESIGN-BRIEF.md` is what Claude Design is given. It says what the handoff must contain. The part that matters most for building is this:

1. **Tokens** come as a ready-to-paste CSS file, using **shadcn's variable names** in OKLCH, with a `:root` block and a `.dark` block.
2. **FlowHub's own semantic tokens** come in the same file, with the same two blocks:
   - stage states
   - fit strength
   - claim support
   - privacy markers
3. **Every component** is mapped either to a shadcn component plus a variant, or marked **custom** with its anatomy and states.
4. **Every PRD screen** (S1 to S16) lists its layout, the components it uses, its states and its copy.

The handoff is saved to `docs/design/` and implemented as-is. **The token CSS becomes the theme section of `web/app/globals.css` with no translation step.**

## Consequences

**Good**
- The design handoff and the code share one vocabulary: the token names and the component names. Implementation is mostly assembly.
- Custom components use the same tokens, so they match the rest of the UI.
- Everything is accessible by default through the Radix primitives, and WCAG AA is a stated requirement in the brief.

**Bad**
- We maintain the copied component code. That's acceptable: it's small, and changing it is the point.
- If the handoff doesn't follow the contract, it has to be translated by hand, which is slow. The brief states the contract explicitly to prevent that.

## More information

- **Amended by [ADR-0010](0010-genai-workflow-in-typescript.md) (2026-10-13), D6:** no Claude Design handoff was produced. The mockup canvas (page "v2 · Offering-centred") is the design source, and its palette becomes the tokens. Tailwind v4 and shadcn/ui are unchanged.
- **Amended by [ADR-0013](0013-comic-theme-from-the-logo.md) (2026-10-16):** the brand look comes from the logo: ink outlines, hard offset shadows, a yellow primary, Patrick Hand headings and Shantell Sans text. The canvas still sets the layout and the semantic colours.
- PRD sections 7 and 9 (FR IDs and screen inventory), and section 11 (the accessibility and platform requirements).
- shadcn/ui theming, checked on 2026-09-29: OKLCH CSS variables, a `.dark` override block, and Tailwind v4 `@theme inline`. https://ui.shadcn.com/docs/theming
