# Yorvex Workforce: workforce software for shift-based teams

> **Fictional seller persona.** Yorvex, its people, products, prices, partners, clients and prospects are all made up. No real company's catalogue, prices or clients appear here. Written on 2026-10-15.
>
> **Status:** demo seller P5 (PRD 4.1, Q24, ADR-0012). In the deck now. It becomes a sample seller in "Try with sample data" once the deal room runs end to end for Olvessa, before the 17 Oct freeze. Before it loads, the price parser must read "RM 9 / employee / month" (PRD 10).

Yorvex shows FlowHub working for a **software company**: product lines sold in editions, priced per employee per month, with a professional services arm that runs enterprise projects. Its catalogue changes every two weeks, because the product ships every two weeks. Its biggest risk is selling the roadmap as if it were the product.

## 1. At a glance

| | |
|---|---|
| **Name** | Yorvex ("turn" or "shift" in Malay) |
| **Tagline** | Rosters, attendance and payroll for teams that work in shifts |
| **Kind** | B2B SaaS scale-up with a professional services arm |
| **Head office** | George Town, Penang. Offices in Kuala Lumpur, Singapore and Jakarta |
| **Founded** | 2017, by two former payroll-implementation consultants |
| **People** | 86: engineering 34, product and design 7, sales and marketing 15, professional services 13, customer success and support 12, finance and admin 5 |
| **Customers** | 340 companies. 61,000 employees are rostered or paid on Yorvex each month |
| **Where it sells** | Malaysia (70% of revenue), Singapore (18%), Indonesia (12%). The Philippines is on the roadmap for 2027 |
| **Currency** | MYR. A USD price list for Singapore and Indonesia |
| **Revenue** | About RM 15.5 million a year. Annual recurring revenue about RM 12 million |
| **Revenue mix** | Subscriptions 76%, professional services 17%, managed payroll 5%, resold attendance terminals 2% |
| **Funding** | Series A in 2023. Preparing a Series B for 2027 |
| **Best customers** | Shift-based employers with 200 to 10,000 staff: electronics and food manufacturing, plantations, hospitals and clinic groups, retail and F&B chains, logistics, security services |
| **Why FlowHub fits** | Product lines × editions is a rate card. Feature status (active or planned) is the roadmap. Enterprise projects are man-days. RFPs are the deal room |

## 2. The company story

Yorvex began in 2017 as a rostering tool for a private hospital in Penang, whose nurse managers built four-week rosters in spreadsheets every month. The hospital then asked for attendance, so it could see who actually turned up for each shift. Once Yorvex knew who worked which hours, customers asked it to pay them too, and payroll followed in 2019.

Penang's electronics factories became the second wave of customers. They run three shifts a day, seven days a week, with overtime rules that differ by grade and by union agreement. That pushed Yorvex into overtime rules, multi-entity payroll and integrations with factory systems.

Today Yorvex sells **six product lines in three editions** (Essentials, Business and Enterprise), plus an **Enterprise and projects** arm that runs implementations, builds integrations and custom modules, and hosts private deployments for the largest employers. It also runs payroll as a managed service for customers who don't want to run it themselves, and resells attendance terminals from a hardware supplier.

The product ships every two weeks. Features move from planned to live, editions gain modules, and the price card changes once a year in January. The sales team sells from a deck that is out of date the day it is printed.

## 3. People

All names are fictional. In the submission each workspace has one Owner (PRD Q16). The roles below are the design for later (PRD 4.2).

| Person | Job | What they do today | FlowHub role | What they want from FlowHub |
|---|---|---|---|---|
| **Farhana Idris** | CEO and co-founder | Signs off enterprise deals and discounts above 15% | Owner | One place that says what Yorvex sells today, and what it doesn't |
| **Shalini Menon** | Head of product | Owns the roadmap and the release notes | Editor | Feature status kept current from release notes, so sales stop selling the roadmap |
| **Marcus Lee** | Head of enterprise sales | Runs RFPs and tenders, and the enterprise pipeline | Editor | First drafts of RFP responses in a day, priced from this year's card |
| **Aina Sofea** | Solutions consultant (presales) | Demos, fit calls, RFP answers. The main FlowHub user | Editor | Fit maps per requirement, with the sources to defend each answer |
| **Ravi Chandran** | Head of professional services | Estimates implementations in man-days | Editor | Man-day rates with cost and margin on screen, and no surprises after the deal |
| **Kelvin Yap** | Finance controller | Owns the price card and the cost-to-serve model | Editor | Prices that change in one place, and cost that never leaves the building |
| **Putri Amelia** | Customer success lead | Renewals and upgrades | Viewer | The current prices and editions when a customer asks for more |
| **Budi Santoso** | Country manager, Indonesia | Sells in Jakarta with an implementation partner | Viewer | The USD price list and which features work for Indonesian payroll |

## 4. How Yorvex sells today

### 4.1 Three sales motions

| Motion | Edition | Who sells | First-year value | Cycle | Volume | What the buyer receives |
|---|---|---|---|---|---|---|
| **Self-serve and inside sales** | Essentials | Website trial, then an inside sales team of four | RM 4,000 to RM 15,000 | 1 to 3 weeks | 30 to 40 orders a month | An order form and a quick-start plan |
| **Business** | Business | Account executives with a solutions consultant | RM 30,000 to RM 150,000, plus implementation | 4 to 10 weeks | 10 to 15 proposals a month | A proposal: module scope, implementation plan, pricing |
| **Enterprise and projects** | Enterprise | Marcus, Aina and Ravi | RM 250,000 to RM 2 million over three years | 3 to 9 months | 3 to 5 RFPs or tenders a month | An RFP response, security answers, an implementation statement of work, a man-day estimate |

Opportunities arrive as website demo requests, meeting invites from trade shows, referrals from the Indonesian partner, and RFP documents (PDF, 20 to 80 pages) from enterprises and government-linked companies.

### 4.2 Where the catalogue lives today

- **What the product does:** the product team's roadmap board, and release notes every two weeks.
- **Prices:** a pricing spreadsheet owned by finance, with tabs for MYR, USD and enterprise floor prices. Three versions are in circulation.
- **Implementation estimates:** Ravi's estimator workbook.
- **Proof:** a customer-stories deck. The list of clients who may be named lives in a chat thread.
- **Security answers:** a bank of 240 security-questionnaire answers in a shared drive.
- **Past RFP responses:** more than 60 documents in shared-drive folders.

### 4.3 What goes wrong

1. **Selling the roadmap.** Account executives promised planned features (Philippines payroll, piece-rate pay) as if they were live. In 2025 three enterprise deals escalated during implementation. One ended in a RM 48,000 credit note.
2. **Old prices.** Proposals start from the last one. After the January price change, about 1 in 5 Business proposals still quoted the old prices for six weeks.
3. **Adding one-time to recurring.** Proposals add the one-time implementation fee to the annual subscription in a single "Total". Buyers compare the wrong numbers, and finance re-checks every enterprise quote.
4. **Slow RFPs.** An enterprise RFP takes Aina 6 to 9 working days. About 40% of the questions were answered in an earlier RFP.
5. **Naming the wrong client.** A rep cited a client that had asked not to be named. The client complained.
6. **Services margin is invisible.** Man-days are quoted without seeing their cost. Two 2025 projects ran at a loss.

### 4.4 The job

> "Answer an enterprise RFP in two days, with only what we sell today, priced from this year's card, and with the roadmap clearly marked as roadmap."

| Measure | Today | With FlowHub |
|---|---|---|
| First draft of an enterprise RFP response | 6 to 9 working days | 1 day, then a person's review |
| Business proposals quoting an old price | About 1 in 5 after a price change | None: code copies prices from the current card |
| Planned features sold as live | 3 escalations in 2025 | Caught by the fit map and the Reviewer |
| Non-public clients cited | 1 complaint in 2025 | None: only public proof can be cited |
| One-time and recurring added together | Common | Never: they are shown separately (FR-FIT-5c) |

## 5. Offerings

### 5.1 The offering tree

```
Yorvex
├── Yorvex Shifts                 product   rostering and scheduling
├── Yorvex Time                   product   attendance and timesheets
│   └── Attendance terminals       product   resold hardware, from Sentuh Devices
├── Yorvex Payroll                product   statutory payroll for MY, SG and ID
│   └── Managed payroll            service   we run payroll for you
├── Yorvex Leave and Claims       product   leave, expense claims, approvals
├── Yorvex Hire                   product   pilot: hiring, onboarding, worker documents
├── Yorvex Insights               product   workforce analytics
└── Enterprise and projects        service
    ├── Implementation             service
    ├── Integrations               service
    ├── Custom modules             service
    └── Private deployment         package
```

Thirteen offerings: six product lines, two sub-offerings with their own terms, and the enterprise arm with four sub-offerings.

### 5.2 Product lines

Each feature shows its status and its source. **Planned** features are on the roadmap and must never be sold as live.

#### Yorvex Shifts (product, active, owner Shalini)

*Summary:* Build rosters from demand, with skills, rest-hour and labour-law checks, and let staff swap shifts in the app.

*Description:* Shifts builds weekly or monthly rosters from a demand forecast (footfall, bed occupancy or a production plan). It only rosters people who hold the right skills and certificates, checks rest hours and weekly limits, and publishes the roster to the staff app, where people swap and pick up open shifts.

*Key facts:* typical go-live 3 to 6 weeks. Best for hospitals, factories, retail and F&B chains with 100 or more shift workers.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Demand-based rostering | Active | Rosters built from forecast footfall, bed occupancy or a production plan | Product deck p.6 |
| Skills and certificate rules | Active | Only staff with a valid certificate (for example a forklift licence or a nursing registration) can fill a shift | Product deck p.7 |
| Labour-law checks | Active | Rest hours, weekly hour limits, rest days and public holidays by state | Product deck p.7 |
| Shift swaps and open shifts | Active | Staff swap or claim shifts in the app, with a manager's approval | Product deck p.8 |
| Auto-fill suggestions | Active | Suggests who should fill each gap, ranked by cost and fairness | Release notes p.3 |
| Shift bidding | Active | Staff bid for preferred shifts before the roster is published | Release notes p.5 |
| Fatigue risk score | Planned | Flags rosters with long runs of night shifts. Roadmap, H1 2027 | Roadmap p.4 |

#### Yorvex Time (product, active, owner Shalini)

*Summary:* Clock in by app, face or fingerprint, even without mobile coverage, with overtime calculated by rule.

*Description:* Time records attendance through the staff app (with a face match), QR codes at sites, or wall-mounted terminals. Clock-ins made without coverage sync later. Overtime, lateness and allowances are calculated by rule and flow straight to payroll.

*Key facts:* typical go-live 2 to 4 weeks. Best for sites with poor connectivity, such as estates, warehouses and construction sites.

| Feature | Status | What it does | Source |
|---|---|---|---|
| App clock-in with face match | Active | A selfie is matched to the employee's photo on the phone | Product deck p.10 |
| Geofence and QR site check-in | Active | Clock-in only counts inside the site's boundary, or after scanning the site's code | Product deck p.10 |
| Offline clock-in | Active | Clock-ins without coverage are stored on the phone or terminal and synced later | Product deck p.11 |
| Overtime rules | Active | Overtime, rest-day and public-holiday rates by grade and agreement | Product deck p.11 |
| Project and cost-centre timesheets | Active | Hours booked to projects or cost centres | Product deck p.12 |
| Attendance terminals | Active | Wall terminals with face and fingerprint, through the sub-offering below | Product deck p.12 |

##### Attendance terminals (sub-offering, product, active, owner Ravi)

*Summary:* Face and fingerprint terminals for sites where staff don't carry phones, installed and supported by our hardware supplier.

*Why it's a sub-offering:* it has its own supplier (Sentuh Devices), its own price lines and its own warranty terms.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Standard terminal | Active | Indoor wall unit, face and fingerprint, 3,000 users, works offline for 30 days | PS catalogue p.9 |
| Outdoor terminal | Active | Weatherproof unit with a 4G connection, for estates and yards | PS catalogue p.9 |
| Installation | Active | Mounting, power and set-up by the supplier's technicians | PS catalogue p.10 |

#### Yorvex Payroll (product, active, owner Kelvin)

*Summary:* Statutory payroll for Malaysia, Singapore and Indonesia, paid from what was actually worked.

*Description:* Payroll takes hours, overtime and allowances from Time, calculates statutory contributions and tax for each country, produces payslips in the staff app, and creates bank files and statutory returns. It handles many legal entities and currencies in one account.

*Key facts:* typical go-live 4 to 8 weeks, including two parallel runs. Best for employers with 50 to 10,000 staff in Malaysia, Singapore or Indonesia.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Malaysia statutory payroll | Active | EPF, SOCSO, EIS, monthly tax deductions and HRDF levy, with the year-end forms | Product deck p.14 |
| Singapore statutory payroll | Active | CPF, SDL and year-end income forms | Product deck p.14 |
| Indonesia statutory payroll | Active | BPJS contributions and PPh 21 income tax | Product deck p.15 |
| Philippines statutory payroll | **Planned** | SSS, PhilHealth, Pag-IBIG and income tax. Roadmap, Q2 2027, not committed | Roadmap p.2 |
| Piece-rate and productivity pay | **Planned** | Pay by output (for example per tonne harvested or per piece sewn). Roadmap, Q1 2027, not committed | Roadmap p.3 |
| Multi-entity and multi-currency | Active | Many legal entities and currencies in one account, with consolidated reports | Product deck p.15 |
| Bank files | Active | Bulk-payment files in the formats of the main Malaysian, Singaporean and Indonesian banks | Product deck p.16 |
| Payslips in four languages | Active | English, Malay, Indonesian and Chinese, in the staff app | Release notes p.2 |
| Payslips in Nepali and Bengali | **Planned** | For foreign workers. Roadmap, H1 2027 | Roadmap p.5 |
| Approvals and audit trail | Active | Two-step approval of each pay run, with a full change history | Product deck p.16 |

##### Managed payroll (sub-offering, service, active, owner Ravi)

*Summary:* Our payroll specialists run every pay cycle for you, file the statutory returns and answer employees' pay questions.

*Why it's a sub-offering:* it has its own owner (professional services), its own price lines and its own service levels.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Monthly pay run | Active | We collect changes, run payroll, and send it for your approval | PS catalogue p.11 |
| Statutory submissions | Active | Monthly contributions and tax filed on time | PS catalogue p.11 |
| Year-end forms | Active | Year-end tax forms for every employee | PS catalogue p.12 |
| Employee pay help desk | Active | Pay questions answered within two working days | PS catalogue p.12 |

#### Yorvex Leave and Claims (product, active, owner Shalini)

*Summary:* Leave policies by entity, state and grade, and expense claims with receipt capture and approval chains.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Leave policies | Active | Entitlements by entity, state, grade and length of service | Product deck p.18 |
| Expense claims | Active | Receipt photos, mileage and per-diem rules | Product deck p.18 |
| Approval chains | Active | Approvals by amount, department and delegate | Product deck p.19 |
| Clinic panel claims | **Planned** | Direct billing from panel clinics. Roadmap, H2 2027 | Roadmap p.6 |

#### Yorvex Hire (product, **pilot**, owner Shalini)

*Summary:* Job posts, onboarding checklists and expiry alerts for workers' documents, in pilot with eight customers.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Job posts | Active | Post to job boards and track applicants | Product deck p.21 |
| Onboarding checklist and e-signature | Active | Contracts and forms signed in the app before day one | Product deck p.21 |
| Worker document tracking | Active | Permit, passport and medical expiry dates, with alerts 90, 60 and 30 days ahead | Release notes p.6 |
| Background checks | **Planned** | Through a screening provider. Roadmap, 2027 | Roadmap p.6 |

#### Yorvex Insights (product, active, owner Shalini)

*Summary:* Labour cost, overtime and absence by site and shift, with an export to the customer's own data warehouse.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Labour cost by site and shift | Active | Daily cost against budget | Product deck p.23 |
| Overtime and absence trends | Active | Trends by site, team and manager | Product deck p.23 |
| Headcount and turnover | Active | Joiners, leavers and turnover by month | Product deck p.24 |
| Data export | Active | Scheduled export to BigQuery or as files | Product deck p.24 |

### 5.3 Enterprise and projects (service, active, owner Ravi)

*Summary:* Implementation, integrations, custom modules and private deployments for employers with 1,000 staff or more.

*Description:* The professional services team takes large employers from their old systems to Yorvex: design workshops, configuration, data migration, parallel pay runs, integrations, training and go-live support. Where the product doesn't do something yet, the team can build a custom module on the platform, priced in man-days.

*Key facts:* typical length 8 to 16 weeks. Best for employers with 1,000 to 10,000 staff and several legal entities.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Security and compliance | Active | ISO/IEC 27001 certified since 2024. An independent penetration test every year | Security overview p.3 |
| Uptime commitment | Active | 99.9% monthly uptime on Enterprise, with service credits | Pricing p.2 |
| Named success manager | Active | One person who owns the account after go-live | Pricing p.2 |

| Sub-offering | Type | Summary | Features | Source |
|---|---|---|---|---|
| **Implementation** | service | Design, configuration, data migration, two parallel runs, training and go-live support | Design workshops; configuration; data migration from another payroll; parallel runs; train-the-trainer; hypercare for the first two pay runs | PS catalogue p.3 to p.5 |
| **Integrations** | service | Connect Yorvex to finance, HR and factory systems | Single sign-on (SAML or OpenID Connect); connectors for popular cloud accounting packages; REST API and webhooks; SFTP file exchange; general-ledger posting | PS catalogue p.6 to p.7 |
| **Custom modules** | service | Features built on the platform for one customer, before or instead of the roadmap | Built and maintained by Yorvex; may later be released to all customers | PS catalogue p.8 |
| **Private deployment** | package | A dedicated environment for one customer, hosted by Yorvex | Dedicated Google Cloud project; region of the customer's choice (Malaysia or Singapore); customer-managed encryption keys; dedicated support line. From 3,000 employees | Security overview p.6 |

### 5.4 Technology

| Category | Value |
|---|---|
| hosting | Google Cloud |
| database | Cloud SQL |
| analytics | BigQuery |
| mobile | iOS and Android staff app (other) |
| auth_security | SAML and OpenID Connect single sign-on (other) |
| integration_external | REST API, webhooks, SFTP (other) |

Yorvex runs on Google Cloud. It does not claim any Google partner status.

## 6. Pricing

All prices are fictional and exclude SST. Text in cells is written exactly as it would appear on the Pricing tab, because FlowHub's parser reads it as written.

### 6.1 Rate card: Subscriptions 2026 (MYR)

*Note on the card:* "Prices per employee per month, billed annually. Monthly billing adds 15%." Source: Pricing and editions 2026, p.2.

| Group | Row | Essentials (up to 150 employees) | Business (most sold) | Enterprise (from 1,000 employees) |
|---|---|---|---|---|
| Products | Yorvex Shifts | Not offered | RM 6 / employee / month | RM 5 / employee / month |
| Products | Yorvex Time | RM 3 / employee / month | RM 5 / employee / month | RM 4 / employee / month |
| Products | Yorvex Payroll | RM 6 / employee / month | RM 9 / employee / month | RM 7 / employee / month |
| Products | Yorvex Leave and Claims | RM 2 / employee / month | Included | Included |
| Products | Yorvex Hire (pilot) | Not offered | RM 450 / hiring site / month | On quote |
| Products | Yorvex Insights | Not offered | RM 2 / employee / month | Included |
| Minimums | Minimum monthly fee | RM 300 / month | RM 1,500 / month | RM 15,000 / month |
| Service | Support | Email, office hours | Email and chat, office hours | Named success manager, 24x7 for urgent issues |
| Service | Uptime commitment | Not offered | 99.5% uptime | 99.9% uptime |
| Service | Legal entities included | 1 entity | 3 entities | 10 entities |
| Service | Sandbox environment | Not offered | Add-on | Included |

### 6.2 Rate card: Regional price list 2026 (USD)

*Note on the card:* "For customers billed in Singapore or Indonesia. Per employee per month, billed annually." Source: Pricing and editions 2026, p.4.

| Row | Essentials | Business | Enterprise |
|---|---|---|---|
| Yorvex Shifts | Not offered | USD 2.20 / employee / month | USD 1.90 / employee / month |
| Yorvex Time | USD 1.00 / employee / month | USD 1.80 / employee / month | USD 1.50 / employee / month |
| Yorvex Payroll | USD 2.50 / employee / month | USD 3.50 / employee / month | USD 2.80 / employee / month |
| Yorvex Leave and Claims | USD 0.80 / employee / month | Included | Included |
| Yorvex Insights | Not offered | USD 0.80 / employee / month | Included |
| Minimum monthly fee | USD 90 / month | USD 450 / month | USD 4,500 / month |

### 6.3 Rate card: Cost to serve 2026 (private)

`kind: cost`. Never sent to a model (invariant 2). Entered by hand by Kelvin.

| Row | Essentials | Business | Enterprise |
|---|---|---|---|
| Hosting and infrastructure | RM 0.60 / employee / month | RM 0.75 / employee / month | RM 0.90 / employee / month |
| Support and success | RM 0.40 / employee / month | RM 0.70 / employee / month | RM 1.30 / employee / month |

Gross margin on subscriptions is about 80%. The margin shows on the Pricing tab for the team and is marked private.

### 6.4 Fee schedules

**Onboarding** (on Implementation). Source: PS catalogue p.4.

| Line | Basis | Price | Cost (private) |
|---|---|---|---|
| Essentials quick start (remote, 2 weeks) | one_time | RM 1,500 | RM 600 |
| Business implementation, base fee | one_time | RM 8,000 | RM 3,600 |
| Business implementation, per employee | per_unit | RM 15 / employee | RM 6 / employee |
| Data migration from another payroll system | per_unit | RM 3,500 per entity | RM 1,400 |
| Extra parallel payroll run | per_unit | RM 2,500 per run | RM 1,100 |
| Training session (up to 15 people) | per_unit | RM 1,600 / session | RM 550 |
| Enterprise implementation | other | On quote | |

**Man-day rates** (on Enterprise and projects, section `man_days`). Source: PS catalogue p.13.

| Line | Basis | Price | Cost (private) |
|---|---|---|---|
| Implementation consultant | daily | RM 1,800 | RM 820 |
| Payroll specialist | daily | RM 2,200 | RM 1,000 |
| Integration developer | daily | RM 2,000 | RM 900 |
| Project manager | daily | RM 2,400 | RM 1,050 |
| Solution architect | daily | RM 3,000 | RM 1,350 |
| After-hours go-live support | hourly | RM 450 / hour | RM 200 / hour |

**Add-ons** (on Yorvex Time and Yorvex Payroll, section `add_ons`). Source: Pricing and editions 2026, p.5.

| Line | Basis | Price | Cost (private) | Paid to |
|---|---|---|---|---|
| SMS one-time passwords and alerts | per_unit | RM 0.12 / SMS | RM 0.05 / SMS | Isyarat Messaging |
| Extra legal entity | monthly | RM 250 / month | | |
| Sandbox environment (Business) | monthly | RM 1,000 / month | RM 300 / month | |
| Premium support (Business) | monthly | RM 2,500 / month | RM 1,100 / month | |
| Custom report | per_unit | RM 1,800 per report | RM 700 | |

**Attendance terminals** (on Attendance terminals). Source: PS catalogue p.10.

| Line | Basis | Price | Cost (private) | Paid to |
|---|---|---|---|---|
| Standard terminal | per_unit | RM 2,900 per unit | RM 1,850 | Sentuh Devices |
| Outdoor terminal with 4G | per_unit | RM 4,600 per unit | RM 3,050 | Sentuh Devices |
| Installation | per_unit | RM 650 per site | RM 400 | Sentuh Devices |
| Terminal care plan | annual | RM 380 / unit / year | RM 190 | Sentuh Devices |

**Managed payroll** (on Managed payroll). Source: PS catalogue p.12.

| Line | Basis | Price | Cost (private) |
|---|---|---|---|
| Monthly pay run | per_unit | RM 22 / payslip, min RM 2,000 | RM 9 / payslip |
| Off-cycle pay run | per_unit | RM 1,200 per run | RM 450 |
| Year-end tax forms | per_unit | RM 15 / employee | RM 5 / employee |

**Custom modules** (on Custom modules). Source: PS catalogue p.8.

| Line | Basis | Price |
|---|---|---|
| Custom module build | other | On quote |
| Custom module maintenance | annual | 20% of the build price per year |

**Private deployment** (on Private deployment). Source: Security overview p.6.

| Line | Basis | Price | Cost (private) | Note |
|---|---|---|---|---|
| Environment set-up | one_time | RM 45,000 | RM 21,000 | |
| Dedicated environment | monthly | RM 18,000 / month | RM 7,500 / month | 36-month minimum term |

## 7. Partners, vendors and suppliers

Contacts and buy prices never appear in proposals. Contact details use `.example` addresses.

| Name | Relationship | Covers | Arrangement | Buy price (private) | Contact | Region |
|---|---|---|---|---|---|---|
| **Sentuh Devices** | supplier | Attendance terminals, installation, hardware warranty | We buy and resell. They install and repair | RM 1,850 per standard terminal, RM 3,050 per outdoor terminal | Wong Mei Kuan, channel manager, meikuan@sentuh.example | Malaysia |
| **Isyarat Messaging** | vendor | SMS for one-time passwords and alerts | Pay per message, billed monthly | RM 0.05 / SMS | Danial Hakimi, account manager, danial@isyarat.example | Malaysia, Singapore, Indonesia |
| **Tanjung HR Consulting** | partner | Implementation and payroll advice in Indonesia | They implement at their own rates. We pay them 15% of the first-year subscription on deals they refer | | Dewi Lestari, managing partner, dewi@tanjunghr.example | Indonesia |

## 8. Proof (results you can cite)

The Writer may cite only proof marked public (invariant 5).

| Kind | Title | Body | Public | Offerings | Source |
|---|---|---|---|---|---|
| case_study | A 2,300-staff electronics manufacturer runs payroll in 6 hours instead of 4 days | Three shifts, 11 overtime rules and two legal entities, live in 9 weeks | **Yes** | Payroll, Time | Customer stories p.2 |
| case_study | A hospital group rosters 1,100 nurses across three hospitals | Rosters that took a week are published in a day, with every certificate checked | **Yes** | Shifts | Customer stories p.4 |
| case_study | Offline attendance across 14 oil palm estates in Sabah | Field workers clock in at muster points without coverage. Data syncs at the estate office | **Yes** | Time, Attendance terminals | Customer stories p.6 |
| testimonial | "Our managers stopped building rosters in spreadsheets." | Head of HR, a 60-outlet F&B chain | **Yes** | Shifts | Customer stories p.8 |
| metric | 340 companies and 61,000 employees on Yorvex each month | As of September 2026 | **Yes** | All | Product deck p.2 |
| metric | Business implementations average 6 weeks from kick-off to first live payroll | Across 41 implementations in 2025 | **Yes** | Implementation | PS catalogue p.2 |
| metric | Overtime cost down 18% in six months for a logistics company | The client hasn't approved publication | **No** | Shifts, Time | Past RFP response p.31 |
| case_study | 9,000 employees moved from an on-premise payroll system | A government-linked company. The client asked not to be named | **No** (client: Withheld) | Implementation, Payroll | Past RFP response p.33 |

## 9. Selling rules and exclusions (constraints)

A constraint with no offerings is a company-wide selling rule (Settings, Selling rules). Otherwise it shows under *Not included* on the offering's Scope tab, and a need that hits it is **Cannot meet** (FR-FIT-3).

| Kind | Statement | Values | Applies to | What we offer instead |
|---|---|---|---|---|
| region | We sell in Malaysia, Singapore and Indonesia only | MY, SG, ID | Company-wide | |
| region | Payroll only for employees in Malaysia, Singapore and Indonesia | MY, SG, ID | Yorvex Payroll, Managed payroll | Philippines payroll is on the roadmap. Don't promise a date |
| min_deal_size | Business from RM 1,500 a month, Enterprise from RM 15,000 a month. 12-month minimum term | 1500, 15000 | Company-wide | |
| industry | No payroll for workers employed through labour-supply agencies | manpower agency, labour supplier, outsourcing agency | Company-wide | Board policy since 2024: we can't verify those workers' contracts |
| scope | On-premise installation | on-premise, on-prem, self-hosted, customer data centre | All product lines | **Private deployment**: a dedicated environment hosted by Yorvex, from 3,000 employees |
| scope | Paying salaries or holding client funds | salary disbursement, pay on behalf, payroll funding | Yorvex Payroll, Managed payroll | Bank files for the customer's own bulk-payment service |
| integration | Direct connectors to on-premise ERPs | on-premise ERP, legacy ERP | Integrations | SFTP file exchange, or a custom connector quoted in man-days |
| scope | Hardware other than attendance terminals | laptops, phones, network | Attendance terminals | Not offered |
| other | Custom modules belong to Yorvex and may be released to other customers | | Custom modules | |

**Planted conflicts for a demo:** an RFP that asks for on-premise installation (Cannot meet, with Private deployment as the alternative), or a prospect that employs its workers through a labour-supply agency (Cannot meet, company-wide).

## 10. Sales material

| Document | Kind | Pages | OK to share | Offerings |
|---|---|---|---|---|
| Yorvex product deck 2026.pdf | sales_deck | 32 | Yes | All product lines |
| Pricing and editions 2026.pdf | rate_card | 6 | Yes | All product lines, add-ons |
| Professional services catalogue 2026.pdf | brochure | 14 | Yes | Enterprise and projects, Managed payroll, Attendance terminals |
| Security and compliance overview.pdf | brochure | 12 | Yes | Enterprise and projects, Private deployment |
| Customer stories 2026.pdf | case_study | 10 | Yes | Shifts, Time, Payroll |
| Release notes, September to October 2026.pdf | other | 9 | Internal only | Shifts, Time, Payroll, Hire |
| Product roadmap H1 2027.pdf | other | 7 | **Internal only** | All product lines |
| Past RFP response, hospital group.pdf | past_proposal | 46 | Internal only | Shifts, Time, Payroll, Implementation |

The roadmap is internal only. FlowHub still reads it, so planned features carry a source, but planned features are never presented as live.

## 11. Notes from the team

| Offering | Note | By | Date | Pinned |
|---|---|---|---|---|
| Yorvex Payroll | Piece-rate pay is planned for Q1 2027, not committed. Say "on the roadmap" and never give a date in a proposal. | Shalini | 2026-10-09 | Yes |
| Enterprise and projects | Plan two parallel runs for any company above 2,000 staff. The one-run plan failed twice in 2025. | Ravi | 2026-09-30 | |
| Yorvex Shifts | Hospital RFPs always ask about nurse-to-patient ratios. We handle them through skills rules. Say so explicitly. | Marcus | 2026-09-24 | |
| Private deployment | Lost Seroja Components to a local vendor installing on-premise. Our private deployment came in about 40% higher. | Farhana | 2026-09-12 | |
| Yorvex Leave and Claims | Essentials customers who add claims usually move to Business within a year. | Putri | 2026-08-28 | |

## 12. Opportunities

All prospect names are fictional. A live demo would use a real company's public information instead (PRD 10).

### 12.1 History

| Prospect | Industry, size | Offerings | Came in as | Outcome |
|---|---|---|---|---|
| Muara Foods | F&B chain, 48 outlets, 1,300 staff | Business: Shifts, Time, Payroll | Website demo request | **Won**, RM 96,000 first year. Shifts decided it |
| Seroja Components | Electronics manufacturer, 3,200 staff | Enterprise, Private deployment | RFP | **Lost**: wanted on-premise. Price 40% above the winner |
| Bayu Medik Hospitals | Private hospitals, 2 sites, 900 nurses | Shifts, Time | Referral | Proposing |
| Lembah Cold Chain | Logistics, 650 staff | Business: Time, Payroll, Insights | Trade-show meeting | Researching |

### 12.2 Demo opportunity: Kinabatu Plantations RFP

*Kinabatu Plantations* (fictional) runs 14 oil palm estates and 2 palm oil mills in Sabah, with 7,400 workers. About 70% of them are foreign workers. Its head office is in Sandakan. It sends an RFP (PDF, 38 pages) for payroll and attendance, with go-live by 1 March 2027.

**Intake: the requirements the RFP lists**

| # | Requirement | Expected fit | Maps to | Why |
|---|---|---|---|---|
| R1 | Malaysian statutory payroll for 7,400 workers | **Strong** | Yorvex Payroll | Malaysia statutory payroll is active |
| R2 | Harvesters paid per tonne of fresh fruit bunches | **Weak**, with a customisation | Payroll (piece-rate pay is **planned**), Custom modules | Not live. Offer a custom module in man-days, or wait for the roadmap without a date |
| R3 | Attendance at estates without mobile coverage | **Strong** | Yorvex Time | Offline clock-in is active. Public proof: 14 estates in Sabah |
| R4 | Fingerprint terminals at 16 muster points | **Strong** | Attendance terminals | Outdoor terminal with 4G. Supplier: Sentuh Devices |
| R5 | Payslips in Malay and Indonesian | **Strong** | Yorvex Payroll | Payslips in four languages is active |
| R6 | Alerts before work permits and passports expire | **Partial** | Yorvex Hire | Hire is in pilot |
| R7 | Post payroll journals to the group's finance system | **Partial** | Integrations | General-ledger posting by API or SFTP, in man-days |
| R8 | The system must be installed on Kinabatu's own servers | **Cannot meet** | | Constraint: no on-premise installation. Instead: Private deployment (Kinabatu qualifies, at 7,400 employees) |
| R9 | Three-shift rosters for 600 mill workers | **Strong** | Yorvex Shifts | Demand-based rostering and labour-law checks |
| R10 | 99.9% availability | **Strong** | Enterprise and projects | The uptime commitment on Enterprise is 99.9% |
| R11 | Live by 1 March 2027 | **Partial** | Implementation | 8 to 16 weeks, with two parallel runs (Ravi's note) |

**Research brief.** For a real prospect, research would cite the group's annual report (estates, workforce, mills), news on labour practices and certification audits, and any announced digital or ESG programmes. Every claim carries its grounding source (invariant 3).

**Go/no-go.** The score is calculated in code. Expect **Consider**, with three reasons: the on-premise requirement (Cannot meet, but Private deployment fits), piece-rate pay not live, and strong public proof for offline attendance in Sabah.

**Pricing.** The Pricing step picks lines from the Enterprise column and the fee schedules, and code copies the prices. One-time and recurring amounts stay separate (FR-FIT-5c). An illustrative result:

| Line | Source | Quantity | Price (copied) | Amount (calculated) |
|---|---|---|---|---|
| **Monthly** | | | | |
| Yorvex Payroll, Enterprise | Subscriptions 2026 | 7,400 employees | RM 7 / employee / month | RM 51,800 / month |
| Yorvex Time, Enterprise | Subscriptions 2026 | 7,400 employees | RM 4 / employee / month | RM 29,600 / month |
| Yorvex Shifts, Enterprise | Subscriptions 2026 | 600 employees | RM 5 / employee / month | RM 3,000 / month |
| Leave and Claims, Insights | Subscriptions 2026 | | Included | |
| Dedicated environment | Private deployment | 1 | RM 18,000 / month | RM 18,000 / month |
| **Monthly total** | | | | **RM 102,400 / month** |
| **Annual** | | | | |
| Terminal care plan | Attendance terminals | 16 units | RM 380 / unit / year | RM 6,080 / year |
| **One-time** | | | | |
| Environment set-up | Private deployment | 1 | RM 45,000 | RM 45,000 |
| Outdoor terminal with 4G | Attendance terminals | 16 | RM 4,600 per unit | RM 73,600 |
| Installation | Attendance terminals | 16 sites | RM 650 per site | RM 10,400 |
| Project manager | Man-day rates | 40 days | RM 2,400 | RM 96,000 |
| Implementation consultant | Man-day rates | 60 days | RM 1,800 | RM 108,000 |
| Payroll specialist | Man-day rates | 30 days | RM 2,200 | RM 66,000 |
| Integration developer | Man-day rates | 30 days | RM 2,000 | RM 60,000 |
| Solution architect | Man-day rates | 15 days | RM 3,000 | RM 45,000 |
| **One-time total** | | | | **RM 504,000** |
| Worker document alerts (Hire) | Subscriptions 2026 | | On quote | On quote |
| Piece-rate custom module | Custom modules | | On quote | On quote |

The 175 man-days are Ravi's estimate, entered at Gate C. "On quote" lines are never invented (FR-FIT-5b) and are left out of the totals.

**Planted checks for the Reviewer**

- The draft says "Yorvex guarantees 99.99% uptime". The graph says 99.9%. The claim has no support, so it blocks the artefact until a person fixes or accepts it (invariant 4).
- The draft says "piece-rate harvester pay is available today". The feature is **planned**. It blocks the artefact.
- The draft cites the 9,000-employee migration for a government-linked company. That proof is not public, so the Writer must not use it (invariant 5). The public estates case study is used instead.

## 13. Ask or tell examples

| Message | What FlowHub should propose | Control shown |
|---|---|---|
| "From 1 January 2027, Business payroll goes up to RM 10 per employee per month." | One change: Yorvex Payroll › Pricing › Subscriptions 2026 › Yorvex Payroll › Business, from "RM 9 / employee / month" to "RM 10 per employee per month". A warning names the open deals that used the old price | FR-ASK-2, FR-ASK-6 |
| *Drops "Release notes, November 2026.pdf"* | A new feature on Shifts (Shift templates by site), and Payslips in Nepali and Bengali moved from Planned to Active, each sourced to its page. Nothing changes before Apply | FR-ASK-2, FR-ASK-4 |
| "Piece-rate pay ships in January, so we can sell it now." | A status change for Piece-rate and productivity pay, from Planned to Active, sourced to the message. It waits for a person. Shalini can Discard it, because her pinned note says not to promise it | FR-ASK-4: people stay in control |
| "Sentuh raised our terminal buy price to RM 1,990." | Nothing applied. The change targets a cost field, so it is dropped and shown as dropped. Kelvin edits the buy price by hand on the Partners tab | FR-ASK-3, invariant 2 |
| "Give Muara Foods 2 months free on renewal." | Nothing in the hub changes. Discounts belong to quotes (C8, deferred) | Scope |
| "What would Enterprise payroll and time cost for 2,500 employees?" | Copied lines "RM 7 / employee / month" and "RM 4 / employee / month", a calculated total of RM 27,500 / month (marked Calculated), above the RM 15,000 minimum | FR-ASK-8 |
| "Do we do Philippines payroll?" | "Not yet. It's planned and on the roadmap", citing the feature and the region constraint | FR-ASK-8 |
| "Met Bayu Medik's HR director, Puan Rohana. They want rostering for 900 nurses. Next call Tuesday." | A new opportunity with the prospect, the contact, Shifts as the offering of interest, and the next meeting. It waits at Gate A | FR-ASK-7 |

## 14. How FlowHub helps Yorvex

| FlowHub capability | What it does for Yorvex |
|---|---|
| **Offering pages** | Each product line has one page. The Scope tab shows each feature as Active or Planned, with its source, so the roadmap stops leaking into proposals |
| **Pricing tab** | The editions grid, the USD list, onboarding fees, man-day rates and add-ons, all in one place. Cost to serve and margins are visible to the team and marked private |
| **Ask or tell** | Release notes every two weeks become feature updates in minutes. A price change touches exactly one cell and warns about open deals |
| **Cited research** | Before an enterprise meeting: the prospect's workforce, sites, expansion and labour news, each claim with its source |
| **Fit map** | Each RFP requirement mapped to a product line, with Strong, Partial or Weak, Cannot meet for on-premise, and partner suggestions |
| **Pricing by code** | Prices copied from the current card. Recurring, annual and one-time amounts shown separately, so a subscription is never added to an implementation fee |
| **Reviewer** | Blocks uptime figures the card doesn't support, planned features presented as live, and non-public clients |
| **Markers** | Every price and feature shows whether it came from a document, a message or a person. Finance can see who changed the price card |

## 15. Fit with the data model

What fits today, and what stretches. Nothing here is in the submission scope. It is input for later ADRs.

**Fits cleanly**

- Product lines are offerings of type `product`. Terminals and managed payroll are sub-offerings because they have their own terms and owners (R1).
- Editions × modules is a rate card: rows are modules, columns are editions (R2). The USD list is a second rate card with its own currency in the cells (FR-FIT-5d).
- Feature status `planned` holds the roadmap. The fit map and the Reviewer can treat planned features as not available.
- Man-day rates and add-ons are fee schedules, with private cost (R3).
- Supplier, vendor and partner relationships, with a private buy price (R6).

**Stretches**

- **New price-string shapes.** "RM 9 / employee / month", "RM 450 / hiring site / month" and "RM 380 / unit / year" combine a unit and a period. Checked on 2026-10-15: the parser returns `unparsed` for the first, so the cell would show as On quote. The parser needs these cases in `fixtures/price-strings.json` before this catalogue is loaded (PRD 10, ADR-0012 D3).
- **Non-price rows in a grid.** Rows such as Support and Uptime commitment hold text like "99.9% uptime", which correctly parses as `unparsed`. A bare number does not: "1" parses as RM 1, so the Legal entities row says "1 entity". Add fixtures for both.
- **Two-part prices.** "RM 8,000 plus RM 15 per employee" has to be split into two lines today.
- **Roadmap dates.** A planned feature has no availability date. The quarter lives in the description. A later `availableFrom` field could let the fit map say "planned for Q1 2027" without the Writer ever promising it.
- **Minimums.** The minimum monthly fee is a row. Ask's calculated totals should say when the minimum applies instead of the per-employee total.
- **Billing terms, ramps and multi-year discounts** belong to quotes (C8).
- **Security questionnaires** (240 questions) belong to the compliance matrix (C5).
