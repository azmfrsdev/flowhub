# Trassoq Hardware: laptops, printers and the services around them

> **Fictional seller persona.** Trassoq, its people, brands, products, prices, partners, clients and prospects are all made up. The brands Taviro, Kertala and Trassoq Essentials are fictional too. No real company's catalogue, prices, vendors or clients appear here. Written on 2026-10-15.
>
> **Status:** demo seller P6 (PRD 4.1, Q24, ADR-0012). In the deck now. It becomes a sample seller in "Try with sample data" once the deal room runs end to end for Olvessa, before the 17 Oct freeze. Before it loads, the price parser must read "RM 119 / device / month" (PRD 10).

Trassoq shows FlowHub working for a company that sells **physical products through a supply chain**: laptops, desktops and printers bought from manufacturers and resold with services wrapped around them. Its prices move every month with the exchange rate, its margins on hardware are thin, and its profit comes from the services and contracts. Its biggest risks are an expired price, a leaked buy price, and a delivery promise the warehouse can't keep.

## 1. At a glance

| | |
|---|---|
| **Name** | Trassoq ("trassoq" is Malay for "chain") |
| **Tagline** | Laptops, printers and the services around them, delivered across Malaysia |
| **Kind** | IT hardware reseller and regional distributor, with device services and managed print |
| **Head office** | Shah Alam, Selangor, with a 4,000 m² central warehouse. Branches in Penang (Bayan Lepas), Johor Bahru, Kuching and Kota Kinabalu |
| **Founded** | 2006, as a two-person printer sales and repair shop in Klang |
| **People** | 140: sales 26, presales and bids 8, service engineers 36, managed print 12, warehouse and logistics 34, finance, admin and IT 24 |
| **Customers** | 2,100 active accounts |
| **Revenue by customer** | Companies and SMEs 55%, education 20%, government agencies and government-linked companies through tenders 15%, dealers in Sabah and Sarawak 10% |
| **Where it sells** | Malaysia only |
| **Currency** | MYR. Manufacturers' buy prices are linked to the US dollar |
| **Revenue** | About RM 210 million a year |
| **Revenue mix** | Hardware 78%, services and contracts 22% |
| **Margins** | Hardware 7% to 12%. Services 30% to 45%. Managed print about 28%. Services are 22% of revenue but about 55% of gross profit |
| **Brands** | Taviro (laptops, desktops, monitors: authorised reseller and service centre), Kertala (printers: authorised dealer and service partner), Trassoq Essentials (its own accessories brand) |
| **Why FlowHub fits** | Volume-band price grids, buy prices that must stay private, services that lift the margin, delivery zones and lead times, and tenders |

## 2. The company story

Vincent Lau opened Trassoq in Klang in 2006 to sell and repair office printers. Repairs brought him into every office in the area, and customers started asking him for laptops too. In 2012 Trassoq became an authorised Taviro reseller and moved to a warehouse in Shah Alam.

In 2016 it won its first state education tender, for 3,000 laptops for schools, and learned what delivery to Sabah and Sarawak really takes. Branches in Kuching and Kota Kinabalu followed. Managed print launched in 2018, built on Trassoq's printer engineers. Device-as-a-service launched in 2022 with a leasing partner, after customers asked to pay monthly instead of buying. IT asset disposal followed in 2024, when customers needed certified data wiping and responsible e-waste recycling.

The business has moved from selling boxes to selling contracts, but the sales team still thinks in boxes. Only 31% of hardware deals include a service. Every month the manufacturers change their prices, and every month somebody re-sends an old quote.

## 3. People

All names are fictional. In the submission each workspace has one Owner (PRD Q16). The roles below are the design for later (PRD 4.2).

| Person | Job | What they do today | FlowHub role | What they want from FlowHub |
|---|---|---|---|---|
| **Vincent Lau** | Founder and managing director | Approves project prices below the margin floor, and every tender | Owner | Margin protected on every quote, and services sold with every box |
| **Norazlina Ismail (Lina)** | Head of sales, companies and government | Runs the sales team and key accounts | Editor | Quotes that go out the same day, at this month's price |
| **Jason Chin** | Presales and solutions lead | Designs device-as-a-service, deployment and disposal deals. The main FlowHub user | Editor | A fit map that adds the right services to every hardware request |
| **Kavitha Rajan** | Bids and tenders coordinator | Assembles tender responses and spec compliance tables | Editor | Past answers and company documents found in seconds, not days |
| **Faizal Hamid** | Managed print manager | Owns the print rate card and print audits | Editor | Cost-per-page prices that are always current |
| **Melissa Ong** | Finance and pricing controller | Loads manufacturers' buy prices every month and sets sell prices | Editor | Buy prices that never leave the Pricing tab |
| **Ahmad Shukri** | Logistics and warehouse manager | Owns delivery zones, lead times and staging | Editor | Sales promising only the delivery dates his team can meet |
| **Grace Liew** | Account manager, Sabah and Sarawak | Sells to dealers, schools and companies in Kuching | Viewer | The current price, the delivery cost and the lead time for East Malaysia |

## 4. How Trassoq sells today

### 4.1 Four sales motions

| Motion | Buyers | Arrives as | Deal size | Cycle | Volume | What the buyer receives |
|---|---|---|---|---|---|---|
| **Quick quotes** | SMEs and companies' IT buyers | An email with a spec list, a chat message, a web form | RM 2,000 to RM 80,000 | Same day to 3 days | More than 300 quotes a month | A quotation, valid for 14 days |
| **Solution deals** | Companies, universities, hospitals | A request for quotation with requirements, or a contract renewal | RM 100,000 to RM 3 million | 3 to 12 weeks | 15 to 25 a month | A proposal: devices, services and contract terms |
| **Tenders** | Government agencies, state education departments, government-linked companies, public universities | Tender documents (PDF, 60 to 200 pages) with spec compliance tables | RM 500,000 to RM 20 million | 2 to 4 weeks to bid, 4 to 16 weeks to award | 6 to 10 bids a month | A tender response: spec compliance, delivery plan, price schedule, company documents |
| **Dealer orders** | Smaller dealers in Sabah and Sarawak | An order against the dealer price list | RM 5,000 to RM 200,000 | Days | About 150 orders a month | An invoice and a delivery |

### 4.2 Where the catalogue lives today

- **Buy prices:** the manufacturers' monthly price lists, in spreadsheets, linked to the US dollar. Taviro sometimes changes prices mid-month.
- **Sell prices:** Melissa's price-list workbook, updated on the first working day of each month.
- **Managed print prices:** Faizal's spreadsheet.
- **Device-as-a-service prices:** Jason's calculator workbook, using the leasing partner's funding rate.
- **Service prices:** a 2024 PDF price list with handwritten updates.
- **Delivery zones and lead times:** Ahmad's whiteboard, and a chat group.
- **References:** a few slides. Government references can't be published.
- **Tender material:** the company profile, certificates, licences and past tenders, in a shared drive.

### 4.3 What goes wrong

1. **Expired prices.** Quotes are re-sent after their 14-day validity. When Taviro raised prices 4% in the middle of Q3 2026, Trassoq honoured 37 old quotes and lost about RM 118,000 of margin.
2. **A leaked buy price.** A salesperson once pasted the manufacturer's buy-price sheet into an email to a customer. The customer then insisted on cost-plus pricing for two years.
3. **Services left out.** Only 31% of hardware deals include deployment, warranty upgrades or disposal, the lines that carry the margin.
4. **Delivery promises.** Sales promised two-week delivery to schools in the Sabah interior. It took five weeks. The late-delivery penalty on that tender cost RM 64,000.
5. **Slow tenders.** Each tender takes Kavitha two to four weeks. About 1 in 6 bids is disqualified for a missing document or a spec line that doesn't comply.
6. **The wrong references.** Government references are confidential, but reps still paste them into proposals for companies.

### 4.4 The job

> "Quote 600 laptops with deployment and disposal in a day, at this month's price, with a delivery promise logistics can keep for every site, and without ever showing our buy price."

| Measure | Today | With FlowHub |
|---|---|---|
| Time to a solution proposal for 500+ devices | 3 to 5 working days | Same day, then a person's review |
| Quotes sent at an expired price | 37 honoured in Q3 2026 | None: prices are copied from the current card, and price changes flag open deals |
| Buy prices exposed to customers | 1 known incident | None: cost never reaches a model or a document |
| Hardware deals with at least one service | 31% | Above 50%: the fit map maps each need to services as well as devices |
| Late-delivery penalties | RM 64,000 on one tender | Delivery promises checked against the zones and the interior-site rule |

## 5. Offerings

### 5.1 The offering tree

```
Trassoq
├── Business laptops and desktops        product   Taviro range
│   ├── Taviro Classroom 14              product
│   ├── Taviro Office 14                 product
│   ├── Taviro Executive 14              product
│   ├── Taviro Workstation 16            product
│   └── Taviro Mini Desktop              product
├── Printers and multifunction devices   product   Kertala range
├── Accessories and peripherals          product   Taviro monitors, Trassoq Essentials
├── Managed print services               service
├── Device-as-a-service                  package
├── Deployment services                  service
├── Warranty and on-site support         service
├── IT asset disposal and buy-back       service
└── Delivery and logistics               service
```

Fourteen offerings: three product ranges, five laptop and desktop models, and six services. Each model is a sub-offering because it has its own warranty terms and lead time (R1).

Trassoq's ERP holds more than 3,000 stock items. FlowHub holds the **selling catalogue**: the 30 or so items that make most of the revenue, and every service. Everything else stays in the ERP (see section 15).

### 5.2 Business laptops and desktops (product, active, owner Lina)

*Summary:* Taviro laptops and desktops for schools, offices, managers and engineers, in stock in Shah Alam and delivered across Malaysia.

*Description:* Trassoq is an authorised Taviro reseller and service centre. It keeps the five most-sold models in stock, prices them in four volume bands, and builds custom configurations to order. Every device can be imaged, enrolled and tagged before it leaves the warehouse.

*Key facts:* in-stock models delivered in 2 to 5 working days in the Klang Valley. Best for organisations buying 10 to 2,000 devices at a time.

**The five models** (each a sub-offering, with its spec lines as features). Source: Taviro sell price list, October 2026, p.2 to p.4.

| Spec | Classroom 14 | Office 14 | Executive 14 | Workstation 16 | Mini Desktop |
|---|---|---|---|---|---|
| Best for | Schools and students | Office staff | Managers and travelling staff | Engineers, designers, labs | Labs, counters, call centres |
| Screen | 14-inch, 1920×1080 | 14-inch, 1920×1200 | 14-inch, 2880×1800 OLED | 16-inch, 2560×1600 | Monitor sold separately |
| Processor | Entry 8-core | Mid-range 10-core | High-end 12-core | High-end 14-core | Mid-range 10-core |
| Memory | 8 GB | 16 GB | 32 GB | 32 GB, up to 64 GB | 16 GB |
| Storage | 256 GB SSD | 512 GB SSD | 1 TB SSD | 1 TB SSD | 512 GB SSD |
| Graphics | Integrated | Integrated | Integrated | Discrete, 8 GB | Integrated |
| Connectivity | Wi-Fi 6 | Wi-Fi 6E | Wi-Fi 7 and 4G | Wi-Fi 7 | Wi-Fi 6E and 2.5 Gb Ethernet |
| Security | Security chip | Security chip, fingerprint reader | Security chip, fingerprint, face sign-in | Security chip, fingerprint reader | Security chip |
| Build | 1.5 kg, rugged, spill-resistant keyboard | 1.4 kg | 1.1 kg | 2.1 kg | 1.2 kg, mounts behind a monitor |
| Battery | 10 hours | 12 hours | 14 hours | 8 hours | |
| Standard warranty | 1-year carry-in | 3-year carry-in | 3-year on-site, next business day | 3-year on-site, next business day | 3-year carry-in |
| Certified for | | | | Major CAD packages | |
| Lead time, Klang Valley | 2 to 5 working days | 2 to 5 working days | 1 to 2 weeks | 2 to 3 weeks | 2 to 5 working days |

| Feature of the range | Status | What it does | Source |
|---|---|---|---|
| Custom configurations | Active | More memory, larger storage or a different keyboard, built to order in 3 to 4 weeks | Price list p.5 |
| Project pricing | Active | For 200 or more units, a project price through Taviro's deal registration | Price list p.6 |
| Education pricing | Active | The 50 to 199 band for schools from 20 units | Price list p.6 |

### 5.3 Printers and multifunction devices (product, active, owner Faizal)

*Summary:* Kertala printers and multifunction devices, sold outright or placed under a managed print contract.

*Key facts:* in stock, delivered in 3 to 5 working days in the Klang Valley. Best for offices of 5 to 2,000 staff.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Kertala M40 | Active | Mono A4 laser, 40 pages a minute, two-sided, networked | Kertala brochure p.3 |
| Kertala C35 | Active | Colour A4 multifunction: print, copy, scan to email, 35 pages a minute | Kertala brochure p.5 |
| Kertala C55 | Active | Colour A3 multifunction, 55 pages a minute, optional finisher | Kertala brochure p.7 |
| Kertala P90 | Active | High-volume mono A3, 90 pages a minute, for print rooms | Kertala brochure p.9 |
| Secure print release | Active | Jobs print only when the owner taps a staff card | Kertala brochure p.10 |
| Fleet monitoring | Active | Every device reports page counts and toner levels to Trassoq | Managed print guide p.4 |

### 5.4 Accessories and peripherals (product, active, owner Lina)

*Summary:* Taviro monitors and Trassoq Essentials docks, bags and input devices, added to laptop orders.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Taviro 24-inch monitor | Active | 1920×1080, height-adjustable, USB-C | Price list p.4 |
| Taviro 27-inch monitor | Active | 2560×1440, height-adjustable, USB-C with charging | Price list p.4 |
| Trassoq Essentials USB-C dock | Active | Two screens, Ethernet, charging. Trassoq's own brand, 2-year warranty | Price list p.5 |
| Trassoq Essentials laptop backpack | Active | Fits 14 and 16-inch laptops | Price list p.5 |
| Trassoq Essentials keyboard and mouse | Active | Wireless set | Price list p.5 |
| Privacy filter | Active | For 14-inch screens | Price list p.5 |

### 5.5 Services

#### Managed print services (service, active, owner Faizal)

*Summary:* Printers placed in your offices for a monthly fee, with toner, parts and repairs included, and a price per page.

*Description:* Faizal's team starts with a 30-day print audit, right-sizes the fleet, places Kertala devices, and bills a monthly rental plus the pages printed. Toner ships automatically before it runs out.

*Key facts:* contracts of 36 or 60 months. Best for companies with 5 or more printers across one or more offices.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Print audit | Active | 30 days of page counts and a right-sizing plan before the quote | Managed print guide p.2 |
| Automatic toner delivery | Active | Toner ships when a device reports 15% left | Managed print guide p.4 |
| On-site repairs | Active | Response times by plan, parts included | Managed print guide p.5 |
| Monthly usage report | Active | Pages by device, department and colour | Managed print guide p.6 |

#### Device-as-a-service (package, active, owner Jason)

*Summary:* Taviro laptops and desktops for a fixed monthly fee per device, with deployment, warranty, damage cover and end-of-term disposal included.

*Description:* The customer pays per device per month for 24, 36 or 48 months. Trassoq deploys the devices, swaps broken ones from a spare pool, and collects and wipes them at the end of the term. The devices are financed by Trassoq's leasing partner, Cendana Leasing, after a credit check.

*Key facts:* 24 to 48 months. Best for companies of 25 to 2,000 staff that would rather not buy devices upfront.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Fixed monthly fee | Active | One price per device per month for the whole term | DaaS guide p.2 |
| Deployment included | Active | Imaging, enrolment and asset tagging included | DaaS guide p.3 |
| Swap from a spare pool | Active | A replacement device within 4 working hours in the Klang Valley | DaaS guide p.3 |
| Refresh at the end of the term | Active | New devices, and the old ones collected and wiped | DaaS guide p.4 |

#### Deployment services (service, active, owner Jason)

*Summary:* Devices imaged, enrolled, tagged and set up at the customer's desks, with the old ones collected.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Imaging and configuration | Active | The customer's standard image, drivers and settings loaded in our staging area | Services price list p.2 |
| Device management enrolment | Active | Devices enrolled in the customer's device management service before shipping | Services price list p.2 |
| Asset tagging and register | Active | Tags and an asset register handed over | Services price list p.2 |
| On-site deployment | Active | Engineers set up devices at desks and move users' data | Services price list p.3 |
| Staged roll-out | Active | Devices stored and shipped in waves to match the customer's plan | Services price list p.3 |

#### Warranty and on-site support (service, active, owner Lina)

*Summary:* Warranty upgrades, accidental damage cover and a spare pool, repaired by Trassoq's own engineers as a Taviro service centre.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Next-business-day on-site upgrade | Active | An engineer at the desk the next business day, for three years | Services price list p.4 |
| Accidental damage cover | Active | Drops and spills covered for three years, through Payung Assurance | Services price list p.4 |
| Keep your drive | Active | Failed drives stay with the customer | Services price list p.4 |
| Spare pool | Active | Spare devices kept at the customer's site | Services price list p.5 |
| User help desk | **Planned** | Help desk for end users, office hours. Planned for Q2 2027 | Services price list p.5 |

#### IT asset disposal and buy-back (service, active, owner Jason)

*Summary:* Old devices collected, wiped with a certificate, bought back where they still have value, and recycled responsibly.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Certified data wipe | Active | A certificate per device, by serial number | Services price list p.6 |
| Drive shredding on site | Active | For customers whose drives may not leave the building | Services price list p.6 |
| Buy-back | Active | Working devices bought back, priced by model, age and condition | Services price list p.7 |
| E-waste recycling | Active | Through a licensed recycling facility, with a certificate of recycling | Services price list p.7 |

#### Delivery and logistics (service, active, owner Ahmad)

*Summary:* Delivery to every state, staged roll-outs, and a clear rule for sites without road access.

| Feature | Status | What it does | Source |
|---|---|---|---|
| Klang Valley | Active | 2 to 5 working days for stock items | Delivery zones p.1 |
| Rest of Peninsular Malaysia | Active | 3 to 7 working days, through the Penang and Johor Bahru branches | Delivery zones p.1 |
| Sabah and Sarawak, main towns | Active | 10 to 15 working days, through the Kuching and Kota Kinabalu branches | Delivery zones p.2 |
| Interior sites | Active | Quoted per site, 4 to 6 weeks. Some sites need a boat | Delivery zones p.2 |
| Next-day express | Active | Klang Valley only | Delivery zones p.3 |

## 6. Pricing

All prices are fictional and exclude SST. Text in cells is written exactly as it would appear on the Pricing tab.

### 6.1 Rate card: Taviro computing, October 2026

*Note on the card:* "Price per unit. Valid to 31 October 2026, or 14 days from the quote, whichever is earlier." On Business laptops and desktops. Source: Taviro sell price list, October 2026, p.2.

| Group | Row | 1 to 9 units | 10 to 49 units | 50 to 199 units | 200+ units (project price) |
|---|---|---|---|---|---|
| Laptops | Taviro Classroom 14 | RM 1,899 | RM 1,849 | RM 1,789 | On quote |
| Laptops | Taviro Office 14 | RM 3,299 | RM 3,199 | RM 3,099 | On quote |
| Laptops | Taviro Executive 14 | RM 5,899 | RM 5,749 | RM 5,599 | On quote |
| Laptops | Taviro Workstation 16 | RM 8,499 | RM 8,299 | RM 8,099 | On quote |
| Desktops | Taviro Mini Desktop | RM 2,699 | RM 2,629 | RM 2,549 | On quote |

### 6.2 Rate card: Taviro buy prices, October 2026 (private)

`kind: cost`. Never sent to a model (invariant 2). Melissa enters it by hand from Taviro's monthly list.

| Row | 1 to 9 units | 10 to 49 units | 50 to 199 units | 200+ units |
|---|---|---|---|---|
| Taviro Classroom 14 | RM 1,690 | RM 1,690 | RM 1,650 | RM 1,590 |
| Taviro Office 14 | RM 2,890 | RM 2,890 | RM 2,840 | RM 2,760 |
| Taviro Executive 14 | RM 5,180 | RM 5,180 | RM 5,090 | RM 4,950 |
| Taviro Workstation 16 | RM 7,520 | RM 7,520 | RM 7,410 | RM 7,200 |
| Taviro Mini Desktop | RM 2,330 | RM 2,330 | RM 2,290 | RM 2,220 |

On screen, the team sees the Office 14 margin fall from 12.4% (1 to 9 units) to 8.4% (50 to 199 units). The 200+ price is negotiated per project with Taviro.

### 6.3 Rate card: Kertala printers, October 2026

On Printers and multifunction devices. Source: Kertala range brochure 2026, p.11.

| Row | Buy outright |
|---|---|
| Kertala M40, mono A4 laser | RM 1,190 |
| Kertala C35, colour A4 multifunction | RM 4,350 |
| Kertala C55, colour A3 multifunction | RM 16,900 |
| Kertala P90, high-volume mono A3 | RM 28,500 |
| Finisher for the C55 | RM 3,200 |

### 6.4 Rate card: Accessories, October 2026

On Accessories and peripherals. Source: Taviro sell price list, October 2026, p.4 and p.5.

| Row | 1 to 9 units | 10+ units |
|---|---|---|
| Taviro 24-inch monitor | RM 649 | RM 599 |
| Taviro 27-inch monitor | RM 1,099 | RM 1,029 |
| Trassoq Essentials USB-C dock | RM 389 | RM 349 |
| Trassoq Essentials laptop backpack | RM 129 | RM 109 |
| Trassoq Essentials keyboard and mouse | RM 119 | RM 99 |
| Privacy filter, 14-inch | RM 159 | RM 139 |

A private cost card holds the buy prices. The house-brand dock costs RM 190, a margin of about 51% at 1 to 9 units, against 8% to 12% on a laptop.

### 6.5 Rate card: Managed print 2026

On Managed print services. Source: Managed print and device-as-a-service guide, p.8.

| Row | Office (A4 fleet) | Department (A3 fleet) | High volume (A3, 90 pages a minute) |
|---|---|---|---|
| Device rental | RM 159 / month | RM 590 / month | RM 1,450 / month |
| Mono page | RM 0.035 / page | RM 0.03 / page | RM 0.022 / page |
| Colour page | RM 0.28 / page | RM 0.24 / page | Not offered |
| Minimum monthly billing | RM 800 / month | RM 2,500 / month | RM 4,000 / month |
| Toner and parts | Included | Included | Included |
| On-site response | Next business day | Within 8 business hours | Within 4 business hours |
| Contract term | 36 months | 36 or 60 months | 60 months |

A private cost card holds Kertala's device lease and the cost per page (for example RM 0.012 per mono page and RM 0.10 per colour page on the Department plan).

### 6.6 Rate card: Device-as-a-service 2026

On Device-as-a-service. Source: Managed print and device-as-a-service guide, p.9.

| Group | Row | 24 months | 36 months (most chosen) | 48 months (desktops only) |
|---|---|---|---|---|
| Per device | Taviro Classroom 14 | RM 99 / device / month | RM 72 / device / month | Not offered |
| Per device | Taviro Office 14 | RM 165 / device / month | RM 119 / device / month | Not offered |
| Per device | Taviro Executive 14 | RM 289 / device / month | RM 205 / device / month | Not offered |
| Per device | Taviro Workstation 16 | RM 410 / device / month | RM 295 / device / month | Not offered |
| Per device | Taviro Mini Desktop with 24-inch monitor | RM 159 / device / month | RM 115 / device / month | RM 92 / device / month |
| Included | Imaging, enrolment and tagging | Included | Included | Included |
| Included | 3-year on-site warranty | Included | Included | Included |
| Included | Accidental damage cover | Add-on | Included | Included |
| Included | End-of-term collection and certified wipe | Included | Included | Included |

### 6.7 Fee schedules

**Deployment** (on Deployment services). Source: Services price list 2026, p.2 and p.3.

| Line | Basis | Price | Cost (private) |
|---|---|---|---|
| Imaging and configuration | per_unit | RM 85 / device | RM 32 |
| Device management enrolment | per_unit | RM 35 / device | RM 12 |
| Asset tagging and register | per_unit | RM 8 / device | RM 3 |
| On-site deployment, Klang Valley | per_unit | RM 65 / device, min RM 1,500 | RM 28 |
| On-site deployment, outside the Klang Valley | per_unit | RM 95 / device, min RM 2,500 | RM 45 |
| User data transfer from the old device | per_unit | RM 120 / device | RM 50 |
| Old device collection | per_unit | RM 25 / device | RM 10 |

**Man-day rates** (on Deployment services, section `man_days`). Source: Services price list 2026, p.3.

| Line | Basis | Price | Cost (private) |
|---|---|---|---|
| Field engineer | daily | RM 900 | RM 380 |
| Senior engineer | daily | RM 1,400 | RM 600 |
| Project manager | daily | RM 1,800 | RM 820 |
| Site survey | per_unit | RM 1,200 per site | RM 500 |

**Warranty and support** (on Warranty and on-site support). Source: Services price list 2026, p.4 and p.5.

| Line | Basis | Price | Cost (private) | Paid to |
|---|---|---|---|---|
| 3-year next-business-day on-site upgrade, laptops | per_unit | RM 349 per device | RM 210 | Taviro |
| 5-year extended warranty, desktops | per_unit | RM 420 per device | RM 260 | Taviro |
| Accidental damage cover, 3 years | per_unit | RM 289 per device | RM 165 | Payung Assurance |
| Keep your drive | per_unit | RM 120 per device | RM 70 | Taviro |
| Spare pool management | monthly | RM 450 / month | RM 180 | |

**Disposal and buy-back** (on IT asset disposal and buy-back). Source: Services price list 2026, p.6 and p.7.

| Line | Basis | Price | Cost (private) | Paid to |
|---|---|---|---|---|
| Certified data wipe | per_unit | RM 30 / device | RM 11 | |
| Drive shredding on site | per_unit | RM 15 / drive | RM 7 | |
| E-waste collection and recycling | per_unit | RM 1.20 / kg, min RM 300 | RM 0.55 / kg | Kitar Sentosa Recovery |
| Buy-back of working devices | other | On quote | | |
| Certificate of destruction | other | Included | | |

**Delivery** (on Delivery and logistics). Source: Delivery zones and lead times, p.1 to p.3.

| Line | Basis | Price | Cost (private) | Paid to |
|---|---|---|---|---|
| Klang Valley, orders above RM 5,000 | per_unit | Waived | | |
| Klang Valley, smaller orders | per_unit | RM 80 per drop | RM 35 | |
| Rest of Peninsular Malaysia | per_unit | RM 180 per drop | RM 95 | |
| Sabah and Sarawak, main towns | per_unit | RM 480 per drop | RM 310 | Arus Freight |
| Sabah and Sarawak, interior sites | other | On quote | | Arus Freight |
| Next-day express, Klang Valley | per_unit | RM 250 per drop | RM 120 | |
| Staging and storage after 4 weeks | per_unit | RM 3 / device / week | RM 1 | |

## 7. Partners, vendors and suppliers

Contacts and buy prices never appear in proposals. Contact details use `.example` addresses.

| Name | Relationship | Covers | Arrangement | Buy price (private) | Contact | Region |
|---|---|---|---|---|---|---|
| **Taviro** | supplier | Laptops, desktops, monitors, warranty upgrades | Authorised reseller and service centre. A monthly price list linked to the US dollar. Deal registration for 200+ units | The buy-price card, with deal registration a further 3% to 6% off | Kenneth Soo, channel manager, kenneth@taviro.example | Malaysia |
| **Kertala** | supplier | Printers, multifunction devices, toner and parts | Authorised dealer and service partner. Device lease for managed print at a fixed monthly rate | Device lease from RM 98 / month (A4) and RM 380 / month (A3) | Nurul Izzati, partner manager, izzati@kertala.example | Malaysia |
| **Cendana Leasing** | partner | Financing for device-as-a-service | Cendana buys the devices from Trassoq and leases them to the customer. Trassoq is paid in full on delivery. A credit check comes first | Funding rate 6.8% a year | Harith Zainal, relationship manager, harith@cendana.example | Malaysia |
| **Payung Assurance** | vendor | Accidental damage cover | Trassoq sells the cover. Payung pays the claims | RM 165 per device for 3 years | Siti Mariam, bancassurance lead, mariam@payung.example | Malaysia |
| **Kitar Sentosa Recovery** | vendor | Licensed e-waste recycling, certificates of recycling | Collected from Trassoq's warehouse every two weeks | RM 0.55 / kg | Raj Kumar, operations, raj@kitarsentosa.example | Peninsular Malaysia |
| **Arus Freight** | vendor | Freight to Sabah and Sarawak, including interior sites | Per drop, booked a week ahead | RM 310 per drop to main towns | Agnes Ting, East Malaysia desk, agnes@arus.example | Sabah, Sarawak |
| **Jentayu Networks** | partner | Network cabling and Wi-Fi installation | Referral. They quote the customer directly | | Aiman Rosli, project lead, aiman@jentayu.example | Peninsular Malaysia |

Jentayu Networks is the same fictional installer that Olvessa refers network work to. Each workspace keeps its own record of it (invariant 7).

## 8. Proof (results you can cite)

The Writer may cite only proof marked public (invariant 5).

| Kind | Title | Body | Public | Offerings | Source |
|---|---|---|---|---|---|
| case_study | 1,850 laptops imaged and delivered to 62 schools in Sarawak in five weeks | Staged through the Kuching branch, with interior sites delivered by river | **Yes** | Laptops, Deployment, Delivery | Case studies p.2 |
| case_study | A university swapped 1,200 lab PCs over one semester break | Old PCs wiped with certificates and 40% bought back | **Yes** | Mini Desktop, Deployment, Disposal | Case studies p.4 |
| case_study | A 300-staff engineering firm moved to device-as-a-service with no upfront cost | 36-month term, with Workstation 16s for its design team | **Yes** | Device-as-a-service | Case studies p.6 |
| metric | Print spend down 27% in the first year for a 600-staff insurer | After a print audit cut the fleet from 74 devices to 41 | **Yes** | Managed print | Case studies p.8 |
| metric | 97.8% of on-site warranty calls fixed by the next business day in 2025 | Across 6,400 calls | **Yes** | Warranty | Company profile p.9 |
| metric | 20 years in business, 2,100 active accounts, five branches | As of October 2026 | **Yes** | All | Company profile p.2 |
| case_study | 4,000 devices wiped with certificates for a bank's refresh | The client asked not to be named | **No** (client: Withheld) | Disposal | Past tender response p.88 |
| testimonial | "Every one of the 420 PCs arrived before the deadline." | A procurement officer at a state hospital. Government clients can't endorse suppliers, so it is for internal use only | **No** | Mini Desktop, Delivery | Past tender response p.91 |

## 9. Selling rules and exclusions (constraints)

| Kind | Statement | Values | Applies to | What we offer instead |
|---|---|---|---|---|
| region | Malaysia only. No export or cross-border delivery | MY | Company-wide | |
| min_deal_size | RM 1,000 minimum order | 1000 | Company-wide | |
| other | Hardware prices are valid for 14 days from the quote, or to the end of the month, whichever is earlier | 14 days | Company-wide | For 200+ units, Taviro's deal registration can hold a project price for up to 60 days |
| industry | No sales to online marketplace sellers or exporters | marketplace seller, parallel export, grey market | Company-wide | Taviro's reseller agreement forbids it |
| min_deal_size | Device-as-a-service from 25 devices, for organisations trading at least two years, after Cendana Leasing's credit check | 25 | Device-as-a-service | Outright purchase with a warranty upgrade |
| min_deal_size | Managed print from 5 devices or RM 800 a month | 5, 800 | Managed print services | Printers bought outright |
| scope | Fixed delivery dates to interior sites in Sabah and Sarawak | interior, river, boat access, no road access, longhouse | Delivery and logistics | Quoted per site, with 4 to 6 weeks' lead time, staged through the nearest branch |
| scope | Network cabling and Wi-Fi installation | network, cabling, Wi-Fi, access points | Deployment services | Partner Jentayu Networks quotes the customer directly |
| scope | Software licences and application support | licences, software, application support | Business laptops and desktops | Not offered. Customers buy licences from their software provider |
| scope | Wide-format and production printing presses | wide-format, plotter, production press | Printers and multifunction devices | Not offered |

**Planted conflicts for a demo:** a tender that fixes a two-week delivery date to interior schools (Cannot meet, with per-site quoting instead), a request for Wi-Fi installation (Cannot meet, consider Jentayu Networks), or a buyer that asks for prices held for 90 days (Cannot meet, with deal registration as the alternative).

## 10. Sales material

| Document | Kind | Pages | OK to share | Offerings |
|---|---|---|---|---|
| Company profile and references 2026.pdf | sales_deck | 24 | Yes | All |
| Taviro sell price list, October 2026.pdf | rate_card | 6 | Yes | Laptops and desktops, Accessories |
| Kertala range brochure 2026.pdf | brochure | 12 | Yes | Printers |
| Services price list 2026.pdf | rate_card | 8 | Yes | Deployment, Warranty, Disposal |
| Managed print and device-as-a-service guide.pdf | brochure | 10 | Yes | Managed print, Device-as-a-service |
| Case studies 2026.pdf | case_study | 10 | Yes | Laptops, Deployment, Managed print, Device-as-a-service |
| Delivery zones and lead times.pdf | other | 3 | Internal only | Delivery and logistics |
| Past tender response, state education laptops 2025.pdf | past_proposal | 140 | Internal only | Laptops, Deployment, Delivery |

## 11. Notes from the team

| Offering | Note | By | Date | Pinned |
|---|---|---|---|---|
| Business laptops and desktops | Taviro moves prices at quarter end when the ringgit weakens. Never re-send a quote older than 14 days. Re-run pricing. | Melissa | 2026-10-03 | Yes |
| Delivery and logistics | Kota Kinabalu to interior schools: allow three extra weeks. Two sites near Kapit need a boat. | Ahmad | 2026-09-26 | |
| Business laptops and desktops | Lost the state hospital PC tender in September on delivery schedule, not price. The winner promised 21 days. We said 35. | Kavitha | 2026-09-22 | |
| Managed print services | Customers underestimate colour volume by about 40%. Always run the 30-day print audit before quoting. | Faizal | 2026-09-15 | |
| Device-as-a-service | The 36-month term wins most deals. Offer 24 months only when the finance director wants a short commitment. | Jason | 2026-09-08 | |
| Warranty and on-site support | Universities ask for keep-your-drive in every tender now. Price it in by default. | Lina | 2026-08-30 | |

## 12. Opportunities

All prospect names are fictional. A live demo would use a real organisation's public information instead (PRD 10).

### 12.1 History

| Prospect | Industry, size | Offerings | Came in as | Outcome |
|---|---|---|---|---|
| Tameng General Insurance | Insurer, 600 staff, 9 branches | Managed print | Contract renewal | **Won**, 60 months, about RM 21,000 a month |
| A state hospital | Public hospital | Mini Desktop, Delivery | Tender | **Lost** on delivery schedule (Kavitha's note) |
| Gelora Engineering Consultants | Engineering firm, 300 staff | Device-as-a-service | Referral | **Won**, 36 months |
| Mahligai University College | Private university college, 3 campuses | Laptops, Workstation 16, Deployment, Disposal | Request for quotation | Researching (below) |

### 12.2 Demo opportunity: Mahligai University College laptop refresh

*Mahligai University College* (fictional) has campuses in Shah Alam, Penang and Kuching. It emails a request for quotation (PDF, 18 pages) for 520 staff laptops and 130 engineering lab workstations, with deployment, disposal of the old fleet, and an option to lease. Everything must be in place for the semester that starts on 12 January 2027.

**Intake: the requirements the RFQ lists**

| # | Requirement | Expected fit | Maps to | Why |
|---|---|---|---|---|
| R1 | 520 staff laptops: 14-inch, at least 16 GB memory and 512 GB SSD, fingerprint reader, 3-year on-site warranty | **Strong** | Taviro Office 14, Warranty | The Office 14 meets every spec line. The on-site upgrade turns its carry-in warranty into next-business-day on-site |
| R2 | 130 lab workstations certified for CAD | **Strong** | Taviro Workstation 16 | Certified for major CAD packages. 3-year on-site warranty as standard |
| R3 | Imaging with the college's standard image, and enrolment into its device management | **Strong** | Deployment services | Imaging and enrolment in the Shah Alam staging area |
| R4 | Delivered and set up on three campuses by 12 January 2027 | **Partial** | Delivery and logistics, Deployment services | Kuching takes 10 to 15 working days. Feasible if the order lands by early December |
| R5 | Collect and wipe 600 old devices, with certificates, and buy back working ones | **Strong** | IT asset disposal and buy-back | Public proof: the university lab swap with 40% bought back |
| R6 | Option to lease for three years instead of buying | **Strong** | Device-as-a-service | 36-month term, after Cendana Leasing's credit check |
| R7 | Failed drives must stay with the college | **Strong** | Warranty and on-site support | Keep your drive |
| R8 | Upgrade the Wi-Fi in two lecture halls | **Cannot meet** | | Constraint: network cabling and Wi-Fi. Consider partner Jentayu Networks |
| R9 | Prices held for 90 days for the finance committee | **Cannot meet** | | Constraint: hardware prices are valid for 14 days. Instead: Taviro deal registration can hold a project price for up to 60 days |

**Research brief.** For a real prospect, research would cite the institution's student and staff numbers, campus expansion news, its digital learning plans, and any published procurement notices. Every claim carries its grounding source (invariant 3).

**Go/no-go.** The score is calculated in code. Expect **Go**: strong fit on devices and services, and both Cannot meet items have an alternative.

**Pricing, option A: buy.** Code copies every price. The 520 laptops fall in the 200+ band, so they show **On quote**, never an invented number (FR-FIT-5b). An illustrative result:

| Line | Source | Quantity | Price (copied) | Amount (calculated) |
|---|---|---|---|---|
| **One-time** | | | | |
| Taviro Office 14, 200+ units | Taviro computing | 520 | On quote | On quote |
| Taviro Workstation 16, 50 to 199 units | Taviro computing | 130 | RM 8,099 | RM 1,052,870 |
| 3-year next-business-day on-site upgrade | Warranty and support | 520 | RM 349 per device | RM 181,480 |
| Keep your drive | Warranty and support | 650 | RM 120 per device | RM 78,000 |
| Imaging and configuration | Deployment | 650 | RM 85 / device | RM 55,250 |
| Device management enrolment | Deployment | 650 | RM 35 / device | RM 22,750 |
| Asset tagging and register | Deployment | 650 | RM 8 / device | RM 5,200 |
| On-site deployment, Klang Valley (Shah Alam) | Deployment | 400 | RM 65 / device, min RM 1,500 | RM 26,000 |
| On-site deployment, outside the Klang Valley (Penang, Kuching) | Deployment | 250 | RM 95 / device, min RM 2,500 | RM 23,750 |
| Certified data wipe | Disposal and buy-back | 600 | RM 30 / device | RM 18,000 |
| Old device collection | Deployment | 600 | RM 25 / device | RM 15,000 |
| Delivery, Shah Alam | Delivery | | Waived | |
| Delivery, Penang | Delivery | 2 drops | RM 180 per drop | RM 360 |
| Delivery, Kuching | Delivery | 2 drops | RM 480 per drop | RM 960 |
| Buy-back of working devices | Disposal and buy-back | | On quote | On quote |
| **One-time total, excluding On quote lines** | | | | **RM 1,479,620** |

**Pricing, option B: lease for 36 months.**

| Line | Source | Quantity | Price (copied) | Amount (calculated) |
|---|---|---|---|---|
| **Monthly, for 36 months** | | | | |
| Taviro Office 14 | Device-as-a-service | 520 | RM 119 / device / month | RM 61,880 / month |
| Taviro Workstation 16 | Device-as-a-service | 130 | RM 295 / device / month | RM 38,350 / month |
| **Monthly total** | | | | **RM 100,230 / month** |

Imaging, enrolment, tagging, warranty, damage cover and the end-of-term wipe are included in option B. Collecting and wiping today's 600 devices is still charged as one-time lines. The two options are never added together.

**Planted checks for the Reviewer**

- The draft says "Taviro laptops have the lowest failure rate in Malaysia". Nothing in the graph supports it, so it blocks the artefact (invariant 4).
- The draft says "delivery to Kuching within 7 days". The graph says 10 to 15 working days. It blocks the artefact.
- The draft cites the state hospital testimonial. It is not public, so the Writer must not use it (invariant 5). The public university lab-swap case study is used instead.
- No buy price, cost per page or funding rate appears anywhere in the fit map, the pricing or the draft (invariant 2).

## 13. Ask or tell examples

| Message | What FlowHub should propose | Control shown |
|---|---|---|
| *Drops "Taviro sell price list, November 2026.pdf"* | One change per price that moved, for example Taviro computing › Taviro Office 14 › 10 to 49 units, from "RM 3,199" to "RM 3,299", each sourced to its page. A warning names the open quotes that used October prices | FR-ASK-2, FR-ASK-6 |
| "Taviro is putting all laptops up 4% from 1 November." | No price changes. The new prices aren't written anywhere in the message, so any calculated price is dropped and shown as dropped. FlowHub asks for the new price list | FR-ASK-3: no price the person didn't write |
| "Our buy price for the Office 14 is now RM 2,950." | Nothing applied. Cost fields are dropped and shown as dropped. Melissa edits the buy-price card by hand | FR-ASK-3, invariant 2 |
| "Kertala is replacing the C35 with the C36 from December, at RM 4,450." | A new C36 feature on Printers, a new C36 row priced "RM 4,450", and a note that the C35 ends in December. All wait for Apply | FR-ASK-2, FR-ASK-4 |
| "What's our price for 40 Office 14s with the 3-year on-site upgrade?" | Copied lines "RM 3,199" (10 to 49 units) and "RM 349 per device", and a calculated total of RM 141,920 (marked Calculated), with the card's validity date | FR-ASK-8 |
| "Can we deliver to a school near Kapit next week?" | "Not as a fixed date. Interior sites are quoted per site with 4 to 6 weeks' lead time", citing the constraint and Ahmad's note | FR-ASK-8 |
| "Email from Tameng: their branch in Ipoh wants 12 more laptops and 2 printers. Contact Encik Hairul, facilities." | A new opportunity for Tameng General Insurance, with Office 14 and Printers as the offerings of interest. It waits at Gate A | FR-ASK-7 |

## 14. How FlowHub helps Trassoq

| FlowHub capability | What it does for Trassoq |
|---|---|
| **Offering pages** | Each range, model and service has one page. The Scope tab is the spec sheet. Not included shows what to offer instead (Jentayu for Wi-Fi, per-site quotes for interior delivery) |
| **Pricing tab** | Volume bands, per-page and per-device-per-month prices in one place. Buy prices and margins are visible to the team and marked private. The validity date sits on each card |
| **Ask or tell** | The monthly price list PDF becomes a set of cell changes in minutes, and open quotes at the old price are flagged. A percentage increase is never turned into invented prices |
| **Cited research** | Before a big deal: the buyer's sites, size, expansion plans and procurement notices, each claim with its source |
| **Fit map** | Every requirement mapped to devices and to the services that carry the margin. Cannot meet for Wi-Fi, held prices and interior delivery, with the alternative |
| **Pricing by code** | Prices copied from this month's card. One-time purchases and monthly leases shown side by side, never added together. 200+ units show On quote until the project price arrives |
| **Reviewer** | Blocks unsupported claims about reliability, delivery times the zones don't support, and confidential government references |
| **Cost privacy** | The manufacturer's buy price, the leasing funding rate and the cost per page never reach a model, a proposal or a document |

## 15. Fit with the data model

What fits today, and what stretches. Nothing here is in the submission scope. It is input for later ADRs.

**Fits cleanly**

- Ranges and services are offerings. Models are sub-offerings of type `product`, because each has its own warranty terms and lead time (R1).
- Volume bands are rate-card columns, and models are rows (R2). Buy prices are a `cost` rate card with the same rows and columns, so the margin can be shown per cell.
- Per-page, per-device, per-kg and per-drop prices are fee schedules or rate cards, with `paidTo` for the supplier behind each line (R3).
- Manufacturers are `supplier` partners, the insurer and recycler are `vendor`s, and the leasing company and the network installer are `partner`s, each with a private buy price (R6).
- Validity, minimum orders, interior delivery and the marketplace ban are constraints (R5). Confidential government references are non-public proof (R4).

**Stretches**

- **Catalogue size.** The ERP has more than 3,000 stock items. FlowHub should hold the selling catalogue and the services, not mirror the ERP. A later import could load a price file into a rate card without a model.
- **Specs as features.** Tenders compare spec lines ("at least 16 GB"). Features hold specs as text today. A typed spec list (name, value, unit) would let code check spec compliance for the compliance matrix (C5).
- **Price validity.** Prices here last 14 days. The 90-day staleness warning (FR-FIT-6) is far too long for hardware. A validity date per rate card, checked in code, would fit better than a note.
- **Picking the band.** For 40 units the Pricing step must pick the 10 to 49 column. That is a quantity rule on column labels, which belongs in code, not in a model.
- **Lead time and stock.** Lead time is text in the model specs and the delivery features. Live stock stays in the ERP.
- **Retired rows.** Rate-card rows have no status. When a model reaches end of life, its row is deleted or noted. A row status would keep the history.
- **Buy-price updates.** Ask or tell drops cost fields by design, so the monthly buy-price list is entered by hand. A private cost import that never calls a model would save Melissa an afternoon a month.
- **Company-wide fees.** Delivery applies to every product, but a fee schedule belongs to one offering. Today it lives on a Delivery and logistics offering.
- **New price-string shapes.** "RM 0.035 / page", "RM 119 / device / month", "RM 1.20 / kg, min RM 300" and "RM 65 / device, min RM 1,500" need parser cases in `fixtures/price-strings.json`. "Next business day" and "36 months" must parse as `unparsed`.
- **SST and quote totals** belong to quotes (C8). **Spec compliance tables and bid/no-bid** belong to C5.
