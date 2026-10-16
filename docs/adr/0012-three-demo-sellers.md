---
status: accepted
date: 2026-10-15
deciders: FlowHub maintainers
---

# ADR-0012: Three demo sellers, one for each kind of thing a company sells

Amends [ADR-0009](0009-offering-centred-hub-and-ask-or-tell.md) (D7). Product decision PRD Q24.

## Context and problem statement

ADR-0009 D7 kept one sample seller, Kelapa Cloud, and moved Stoklane (a startup) and Karang Systems (an enterprise integrator) to the deck. Those three differ by company size. But all three sell services or a single software product, so the demo only ever showed a consultancy's kind of catalogue.

FlowHub is "the hub for everything a company sells". On 2026-10-15 two personas were written that differ by **what they sell**:
- **Giliran** sells software: six product lines in three editions, priced per employee per month, plus enterprise projects.
- **Rantai Supply** sells products: laptops, desktops and printers by volume band, with services wrapped around them.

Both catalogues fit the current offering graph with no new entity type (`docs/product/personas/README.md`).

The question is which demo sellers the deck and the app show, and when, with the deal room still being built and the feature freeze at noon on 17 October.

## Considered options

1. **Deck only.** Giliran and Rantai Supply go in the deck. Kelapa Cloud stays the only sample seller.
2. **Deck now, app later.** All three go in the deck and the PRD now. Giliran and Rantai Supply become sample sellers once the deal room runs end to end for Kelapa Cloud, before the freeze.
3. **All three in the app now.**

Option 1 leaves judges able to try only a consultancy. Option 3 takes time from the deal room on the days it is being built. Option 2 gets the story into the deck at once and builds the rest only when Kelapa Cloud is safe.

## Decision outcome

Option 2.

### D1. Three demo sellers, by what they sell

| Sells | Seller | Persona |
|---|---|---|
| Services | Kelapa Cloud, Kuala Lumpur | PRD 4.1, P1 |
| Software | Giliran, Penang | `docs/product/personas/giliran.md`, P5 |
| Products | Rantai Supply, Shah Alam | `docs/product/personas/rantai-supply.md`, P6 |

Stoklane and Karang Systems retire. Tenders, which Karang Systems stood for, are shown by Rantai Supply.

### D2. When

- **Now:** the deck, the PRD (v3.1) and the proposal source.
- **Once the deal room runs end to end for Kelapa Cloud** (through Finalise), and before the 17 October freeze: Giliran and Rantai Supply become sample sellers.
- **If that point isn't reached in time,** Kelapa Cloud stays the only sample seller, and the other two stay in the deck and the video's last frame. They are the first item in the cut order.

### D3. What loading them needs

- **The price parser reads a unit and a period together,** for example "RM 9 / employee / month", "RM 119 / device / month" and "RM 380 / unit / year". Today the first two parse as unreadable and would show as On quote (FR-FIT-5b). Cases go into `fixtures/price-strings.json` first.
- **Non-price rows hold no bare numbers.** "1" in a row such as "Legal entities included" parses as RM 1. Such rows say "1 entity".
- **One TypeScript sample per seller,** validated against R12 and loaded like Kelapa Cloud's, with document records (names and page counts, no stored file) for the source chips.
- **`SampleSeller` gains `giliran` and `rantai-supply`.** The setup page shows three cards. FR-WS-4 applies: choosing another sample seller replaces the sample workspace, after confirmation.
- **All three use the standard (SME) proposal template.** No new templates, and no pipeline changes.
- **One eval opportunity per new seller,** taken from its persona's demo deal, with its planted constraint conflict and planted unsupported claims.

## Consequences

**Good**
- The demo shows the whole claim: one hub for services, software and products.
- The parser fix helps every real customer with per-seat or per-device pricing, not only the samples.
- No new entity types, pipelines or templates. Each seller is data.
- Each new seller exercises a different control hardest: Giliran the Reviewer on planned features, Rantai Supply cost privacy and Cannot meet.

**Bad**
- All three sellers are based in Malaysia. Regional reach shows only through Giliran's sales in Singapore and Indonesia and its USD price list.
- The startup and enterprise customer groups lose a named seller of their own. Giliran spans startup to scale-up, and Rantai Supply bids for tenders the way an enterprise integrator does.
- Two more catalogues must stay in step with their persona documents.
- Loading them close to the freeze risks a late bug in the setup flow. They are cut first to contain it.
