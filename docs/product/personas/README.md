# Seller personas

FlowHub is the hub for everything a company sells. Its three demo sellers each sell a different kind of thing (PRD Q24, ADR-0012). Kelapa Cloud, the built sample seller, sells **services**. The two personas in this folder show the same hub and the same deal room working for a company that sells **software** and a company that sells **physical products**. Together they show how different kinds of companies benefit, using one data model.

> **Everything here is fictional:** the companies, people, brands, prices, partners, clients and prospects. No real company's catalogue, prices, vendors or clients appear. Before any of these names is used in the video, check them for trademark and business-name clashes (PRD 4.1). A quick web search on 2026-10-15 found no notable company using Giliran, Rantai Supply, Taviro, Kertala, Cendana Leasing or Sentuh Devices for these lines of business. That is not a formal check.

| File | Seller | What it sells |
|---|---|---|
| [giliran.md](giliran.md) | **Giliran**, Penang | Workforce software (rostering, attendance, payroll) in three editions, plus an enterprise projects arm |
| [rantai-supply.md](rantai-supply.md) | **Rantai Supply**, Shah Alam | Laptops, desktops and printers from manufacturers, plus device-as-a-service, managed print, deployment, warranty and disposal |

Each persona has the same sections: the company, its people, how it sells today and what goes wrong, a full offering tree with features, every rate card and fee schedule (with private costs), partners, proof (public and not), selling rules, sales material, team notes, opportunities, a demo deal walked through every stage, Ask or tell examples, and where the data model fits or stretches.

## Status

Decided on 2026-10-15 (PRD Q24, ADR-0012):

- **Now:** all three sellers are in the deck, the PRD (4.1 and 10) and the proposal ("one engine, three kinds of seller"), and in the demo video's last frame.
- **Once the deal room runs end to end for Kelapa Cloud,** before the 17 Oct freeze: Giliran and Rantai Supply become sample sellers in "Try with sample data", each with one eval opportunity taken from its demo deal.
- **First, the price parser** must read a unit and a period together ("RM 9 / employee / month", "RM 119 / device / month"), and non-price rows must not hold bare numbers (PRD 10).
- **If time runs out,** they are the first thing cut, and stay in the deck.

## The line-up

| Seller | What it sells | Where | People | Status |
|---|---|---|---|---|
| **Kelapa Cloud** (P1) | Services: cloud and data consulting | Kuala Lumpur | 14 | Built. Sample seller |
| **Giliran** (P5) | Software: workforce SaaS, plus enterprise projects | Penang | 86 | In the deck. Sample seller after the deal room runs end to end |
| **Rantai Supply** (P6) | Products: IT hardware, plus device services | Shah Alam | 140 | In the deck. Sample seller after the deal room runs end to end |
| ~~Stoklane~~ (P3) | Software, startup: AI demand forecasting for restaurant chains | Singapore | | Retired (Q24), replaced by Giliran |
| ~~Karang Systems~~ (P4) | Services, enterprise: core-system modernisation | Jakarta | | Retired (Q24). Rantai Supply now shows tenders |

The earlier personas differed by **company size** (startup, SME, enterprise). The three demo sellers differ by **what the company sells** (services, software, products), and still span sizes from 14 to 140 staff. Giliran replaces Stoklane: Stoklane was a startup selling pilots of one product, while Giliran is a scale-up with six product lines, three editions, a roadmap and an enterprise projects arm.

## Three kinds of seller, side by side

| | Kelapa Cloud (services) | Giliran (software) | Rantai Supply (products) |
|---|---|---|---|
| **What an offering is** | A consulting service or a package | A product line, or a project service | A product range, a model, or a service contract around the devices |
| **Catalogue size** | 6 offerings, about 35 prices | 13 offerings, about 80 prices | 14 offerings, about 110 prices, chosen from 3,000+ stock items |
| **How often it changes** | Prices yearly | Features every two weeks, prices yearly | Prices every month, sometimes mid-month |
| **Pricing shape** | Tiers × deliverables, man-days, add-ons | Per employee per month × editions, minimums, a USD list, man-days | Volume bands × models, per page, per device per month, per kg, per drop |
| **Margin** | About 55% | About 80% on subscriptions, about 50% on services | 7% to 12% on hardware, 30% to 45% on services |
| **How deals arrive** | Discovery-call invites | Demo requests and RFPs | Spec-list emails, RFQs, tender PDFs, renewals |
| **Deal size** | RM 20,000 to RM 300,000 | RM 4,000 to RM 2 million | RM 2,000 to RM 20 million |
| **What the buyer receives** | A proposal | A proposal, an implementation plan, RFP answers | A quotation, a solution proposal, a tender response |
| **The mistake FlowHub stops** | A price from memory, a client who didn't want to be named | Selling the roadmap, adding one-time fees to subscriptions | An expired price, a leaked buy price, a delivery date logistics can't keep |
| **The control that matters most** | Prices only from the rate card (invariant 1) | Feature status and the Reviewer (invariant 4) | Cost stays private (invariant 2), and Cannot meet on delivery and validity |
| **One line for the deck** | A discovery call becomes a priced proposal by Friday | An enterprise RFP answered in a day, without selling the roadmap | 600 laptops quoted at this month's price, with the margin in the services and the buy price kept private |

## One graph, three businesses

The same entities hold all three catalogues. No seller needed a new entity type.

| Entity | Kelapa Cloud | Giliran | Rantai Supply |
|---|---|---|---|
| **Offering** | Google Cloud migration | Giliran Payroll | Taviro Office 14 |
| **Feature** | Landing zone setup | Offline clock-in (active), Piece-rate pay (planned) | 16 GB memory, 512 GB SSD (a spec line) |
| **Rate card** | Packages: deliverables × tiers | Subscriptions: modules × editions | Volume bands × models |
| **Cost (private)** | Delivery cost per tier | Cost to serve per employee | The manufacturer's buy price per band |
| **Fee schedule** | Man-days, add-ons | Onboarding, man-days, terminals, managed payroll | Deployment, warranty, disposal, delivery |
| **Partner** | Jentayu Networks (referral), Sempadan Security (vendor) | Sentuh Devices (supplier), Tanjung HR Consulting (partner) | Taviro and Kertala (suppliers), Cendana Leasing (partner), Jentayu Networks (referral) |
| **Proof, not public** | A core banking migration | A 9,000-employee migration for a government-linked company | A bank's 4,000-device wipe, a state hospital's testimonial |
| **Constraint, planted conflict** | No tobacco or gambling; no hardware supply | No on-premise installation | No Wi-Fi installation; no fixed dates to interior sites; 14-day price validity |

Jentayu Networks appears in both Kelapa Cloud's and Rantai Supply's hubs, as one fictional installer would in a real city. Each workspace keeps its own record of it (invariant 7).

## Where each seller gets the most from FlowHub

| FlowHub capability | Kelapa Cloud | Giliran | Rantai Supply |
|---|---|---|---|
| Offering pages, six tabs | One page per service | The Scope tab is the honest roadmap | The Scope tab is the spec sheet |
| Ask or tell | A brochure becomes offerings | Release notes every two weeks become feature updates | The monthly price list becomes cell changes, with open quotes flagged |
| Cited research | Prospect's business before the call | Prospect's workforce and sites before an RFP | Buyer's campuses, expansion and procurement notices |
| Fit map and Cannot meet | Hardware goes to a partner | On-premise becomes Private deployment | Wi-Fi goes to a partner, interior delivery is quoted per site |
| Prices copied by code | Tier prices | Per-employee prices, with recurring and one-time kept apart | Volume-band prices, with 200+ units left On quote |
| Reviewer | Blocks unsupported claims | Blocks planned features sold as live | Blocks delivery times and reliability claims the graph doesn't support |
| Cost privacy | Delivery cost | Cost to serve | Buy prices, funding rate, cost per page |

## What the two personas teach us about the model

Both personas fit the current schema with no new entity. The stretches, gathered for later ADRs (none are in the submission scope):

| Stretch | Giliran | Rantai Supply | Possible answer |
|---|---|---|---|
| New price-string shapes (per unit per period, per page, per kg) | Yes | Yes | Add cases to `fixtures/price-strings.json` before loading either catalogue |
| Non-price rows in a grid ("99.9% uptime", "Next business day") | Yes | Yes | Fixtures that must parse as `unparsed`, never as a fee |
| Dates on features or prices | Roadmap quarter | 14-day price validity | `availableFrom` on features; a validity date per rate card, checked in code |
| Choosing a column from a quantity | Edition by headcount | Volume band by units | A quantity rule on column labels, in code |
| Specs that code can compare | | Tender spec lines | A typed spec list, for the compliance matrix (C5) |
| Row status | | End-of-life models | A status on rate-card rows |
| Cost updates | Terminal buy price | Monthly buy-price list | A private cost import that never calls a model |
| Discounts, billing terms, SST | Yes | Yes | Quotes (C8) |

## Decided

On 2026-10-15 the maintainer chose all three sellers for the deck and the PRD now, with Giliran and Rantai Supply loaded as sample sellers once the deal room runs end to end for Kelapa Cloud (PRD Q24, ADR-0012). Stoklane and Karang Systems are retired.
