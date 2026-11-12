# Homepage market research and business case

Researched 2026-10-30 for the Shelfie homepage. Rules: a number is "verified" only if the source text was read in this session (opened page or search-tool excerpt of that page, stated per row). Anything else is "unverified" and must not go on the page. Derived = our arithmetic on a sourced figure. Assumption = ours, never present as fact.

Access notes: IHL Group's own pages returned HTTP 403, Beroe's page returned 404 on direct fetch (its text was only seen in a search-tool excerpt), the McKinsey PDF timed out on fetch (text seen in a search-tool excerpt of the article). These rows are marked.

## 1. Summary of headline numbers

| Claim | Value | Source | Year | URL | Status |
|---|---|---|---|---|---|
| Global inventory distortion (overstock + out-of-stock + returns) | about $1.7T, 6.2% of worldwide retail sales | IHL Group, quoted by Retail Insight Network | 2026 (article 2026-08-06) | https://www.retail-insight-network.com/features/how-overstock-stockouts-and-returns-cost-retail-1-75tn/ | verified (secondary; IHL pages 403) |
| Out-of-stock share of that | 65.6% (overstock 34.4%) | same | 2026 | same | verified (secondary) |
| Out-of-stock loss in dollars | about $1.1T | 65.6% x $1.7T = $1.115T | 2026 | derived | derived, not stated by IHL in anything read; see section 2 |
| Trade promotion spend | about 20% of CPG revenue, worldwide | McKinsey, "How analytics can drive growth in CPG trade promotions" (Hwang, Murphy, Shaikh) | 2019 | https://www.mckinsey.com/industries/consumer-packaged-goods/our-insights/how-analytics-can-drive-growth-in-consumer-packaged-goods-trade-promotions | verified (search excerpt; PDF fetch timed out) |
| Promotions that lost money | 59% worldwide, 72% US | same, quote: "Stunningly, 59 percent lost money (in the United States, it's 72 percent)" | 2019 | same | verified (search excerpt) |
| Promo execution on Kimberly-Clark products | 15% to 50% | Consumer Goods Technology, audits run in 2013 with RW3 app | article 2014-02-19 | https://consumergoods.com/kimberly-clark-improves-promotion-execution-rate | verified (opened); old, one brand |
| Brands' believed vs measured in-store compliance | about 70% believed, about 40% measured | Shop! Compliance Initiative Study (2016 per Repsly URL), as quoted by Roamler and Repsly | 2016 | https://roamler.com/clients/resources/blog/articles/execution-display-promotion-compliance.html ; https://www.repsly.com/blog/why-half-of-promotions-fail | verified as quoted by vendors; primary study not opened; displays, not price |
| Global in-store merchandising services | $6-6.2B (2023 est.), about 5% a year; North America about 35% of spend, Europe "more than 20%" | Beroe (own estimate) | 2023 | https://www.beroeinc.com/category-intelligence/instore-merchandisers-market/ | verified (search excerpt; direct fetch 404); single publisher |
| Mystery shopping services, global | $2.35B (2025); $2.48B 2026; $3.75B by 2034; CAGR 5.32% | Straits Research | 2025 | https://straitsresearch.com/report/mystery-shopping-services-market | verified (opened) |
| Mystery shopping services, Germany | $0.10B (2025) | same | 2025 | same | verified (opened) |
| US basic merchandising audit visit | $30-45 per visit, about 20 min, planogram check and photo | T-ROC Global | 2026 | https://trocglobal.com/retail-merchandising-services/ | verified (opened); vendor rate card |
| German test purchase | "ab ca. 50 EUR", extensive projects four figures | mystery.agency | undated | https://www.mystery.agency/content/testkauf-2/ | verified (opened); sales page, "about" |
| German merchandiser gross salary | EUR 38,600 a year (range 31,600-47,200) | StepStone salary page | 2026 label | https://www.stepstone.de/gehalt/Merchandiser-in.html | verified (opened); no sample size stated |
| Roamler merchandiser in the field | "within 24 hours" | Roamler (vendor claim) | n/a | https://roamler.com/clients/resources/blog/articles/execution-display-promotion-compliance.html | verified as a vendor claim |
| Germany merchandising / field marketing services market | none found | | | | unverified |
| Export store-check cost abroad | none found | | | | unverified |
| Agency lead time in days | none found (T-ROC: proposal "within a week", no start time) | | | | unverified |

## 2. Verification of current figures

| Figure on page / facts.tex | Verdict | Detail |
|---|---|---|
| $1.1T retail sales lost to out-of-stocks (IHL Group) | corrected wording | Nothing read states "$1.1T". Retail Insight Network (2026-08-06): "around $1.7tn in 2026", out-of-stocks "the remaining 65.6%". $1.1T is our product (about $1.115T). The same article gives $634.1bn for out-of-stocks in the 2015 study and warns the 2015 and recent figures measure different things. A search excerpt of IHL's own 2026 study listing mentions "empty shelves $690.9B" and a 2025 edition with "$1.2 trillion" out-of-stocks; I could not open IHL (403) and cannot reconcile these. Recommendation: use "$1.7T inventory distortion a year, about two thirds from out-of-stocks (IHL Group, 2026)"; if the $1.1T form stays, label it "about, derived". It is a loss across all retail, not CPG, not revenue. |
| $6B global in-store merchandising services (Beroe 2023) | verified with caveat | Beroe: $6-6.2B, 2023 estimate, about 5% a year. Beroe's page text came through a search excerpt; direct fetch 404. Another Beroe page gives $5B for 2021. Single publisher, no independent confirmation found. Say "estimate". |
| $2.35B mystery shopping 2025 (Straits), $3.75B by 2034 | verified | Quotes: "USD 2.35 billion in 2025"; "USD 2.48 billion in 2026 to USD 3.75 billion by 2034"; CAGR 5.32%. Bonus: Germany $0.10B (2025). Mystery shopping is a neighbour market, not the same service. |
| Test purchase in Germany EUR 50+ | verified, soften | "Einfache Testkaeufe starten ab ca. 50 EUR, umfangreiche Projekte koennen vierstellige Betraege erreichen." Say "from about EUR 50". EUR 260 (mystery-shopping.de) and EUR 500 (kennstdueinen.de) in market-pricing.md were not re-opened today. |
| US merchandising audit visit $30-45 (T-ROC 2026) | verified | "Basic audit (about 20 minutes, planogram check and photo): $30-45". Also $45-75 standard, $75-120 complex, $85-140 specialty; per store per month: quarterly $15-30, monthly $45-90, weekly $180-400. |
| facts.tex placeholders LeadTimeDays, WasteShare, TimeToReport | remain unverified | No source for agency lead time or unusable-photo share. Do not fill. |

## 3. Use case deep dive: trade-promotion and price/shelf compliance

### Legal frame (read before writing copy)
- In Germany and the EU, resale price maintenance (Preisbindung der zweiten Hand) is prohibited under section 1 GWB and Art. 101 TFEU; manufacturers may give non-binding recommendations (UVP) but not binding prices or pressure such as threatening to stop supply. Source: IHK Frankfurt, https://www.frankfurt-main.ihk.de/recht/uebersicht-alle-rechtsthemen/wettbewerbsrecht/kartellrecht-5196642 ; Bundeskartellamt guidance paper on food retail, 2017 (via https://www.ihk-muenchen.de/Hinweispapier-Preisbindung-im-Lebensmitteleinzelhandel2017.pdf, not opened). Fines exist: EUR 8.2M on Recticel Schlafkomfort (resale price maintenance), per search excerpt; not opened.
- Consequence for copy: never say brands "check retailers keep the agreed price". Say "check that the promotion you paid for happened, that the product is on the shelf, and what the shelf tag says". Competitor price monitoring is separate and legitimate.
- Not legal advice; the legal Q&A item in `qa-prep.md` should be reviewed by someone qualified. Photographing in stores is a separate open question there.

### (a) Trade-promotion compliance
- Spend: about 20% of CPG revenue goes to trade promotions worldwide (McKinsey 2019). SPS Commerce (updated 2026-06-15) says "an estimated $500 billion each year" but gives no source: unverified, do not use. SPS also says trade spend is "the second-largest line item on the P&L after cost of goods sold" (opened, unsourced).
- Profitability: 59% of promotions lost money, 72% in the US (McKinsey 2019). This is about ROI, not execution. Do not present it as "failed to happen". The older "three-quarters of promotions do not break even" (Nielsen 2014, foodnavigator) was only seen in a search excerpt: unverified.
- Execution: Kimberly-Clark audits in 2013 found promotion execution "hovering around 15 percent to 50 percent" (opened, 2014 article, one brand, US). Brands believed about 70% compliance, measured about 40% (Shop! 2016, via vendor blogs). A.R.E.|POPAI 2015 (via Roamler): brokers executed 47% as planned, store personnel 37%, DSD 6%; by display type from 58% (bunker) to 4% (shipper). Repsly cites POI 2019: 70% of companies "struggle with compliance and in-store execution"; only 40% of brands could monitor promotions in flight. All are vendor-quoted, mostly displays, US, 2014-2019. No study found on price-tag or promo-price accuracy in Germany. Roamler's own "91% average compliance" is a vendor claim for its programmes.
- A 2026 OneDoor claim that only 4% of in-store activity is executed fully has no named data source: unverified.

### (b) Availability, (c) planogram and tag accuracy, (d) competitor prices
- Availability: IHL numbers above (global, all retail).
- Tag accuracy and planogram: no sourced Germany figure found. T-ROC sells "planogram check and photo" as the basic audit, which is the closest priced analogue to Shelfie's check.
- Competitor price monitoring: the founder's real request (competitor price and presence in a few shops). No market figure found.

### Market size and cost of doing it today
- Global in-store merchandising services: $6-6.2B (Beroe 2023); Europe "more than 20%" of it, so more than about $1.2B (derived, Beroe is the source of the share).
- Germany merchandising / field marketing / retail execution services: none found (searches returned only branded-merchandise and software reports). Unverified. The Straits Germany mystery-shopping figure ($0.10B) is the only Germany service number verified, and it is a neighbour market.
- Retail execution software, global 2025: estimates range from $0.29B to $6.2B depending on publisher (Intel Market Research, Wise Guy, King's Research, Insight Partners, seen in search excerpt only). Too inconsistent to use.
- Field rep cost: StepStone gives EUR 38,600 gross a year for Merchandiser (range 31,600-47,200). Visits per day: unverified. Illustration (assumptions): employer on-costs +21%, so about EUR 46,700; 6 visits a day x 200 days = 1,200 visits, so about EUR 39 labour per visit; at 4 visits a day, about EUR 58. Excludes car, travel time between towns, management, tools. Plausible against T-ROC $30-45 for a 20-minute audit.
- Lead time: Roamler claims a merchandiser "within 24 hours". Crowd platforms review submissions "within 48 hours" (Roamler FAQ, search excerpt). Agencies and Testkauf: no published lead time. Unverified.
- Export / market-entry angle: no published cost per store check abroad found. A store check is described as cheaper than a full retail audit (Moldovan consultancy, search excerpt, weak). SGS offers store checks without prices. Treat the angle as a story (the real request: a friend of Isabel's father, a drink, Germany), not a number.

## 4. Competitors and prices

| Player | What it sells | Brand-side price | Worker pay / other | Status |
|---|---|---|---|---|
| T-ROC Global (US) | Managed merchandising, audits | $30-45 basic audit; programmes $15-30 per store per month (quarterly) to $180-400 (weekly); 500 stores monthly $300K-700K a year | n/a | verified, vendor rate card |
| mystery.agency (DE) | Test purchase, mystery shopping | from about EUR 50 | tester pay EUR 10-100 per test, mostly 10-50 (market-pricing.md, not re-opened) | verified (brand price) |
| BeMyEye (EU crowd) | Crowd missions, platform | Basic from EUR 500 a month (G2/fitgap listing, quote depends on KPIs, categories, locations) | EUR 4-10 or GBP 2-10 per mission (affiliate and review blogs) | indicative |
| Roamler (NL/EU crowd) | Product and service checks, out-of-stock, promotion tracking, merchandising support | no public price | about GBP 5 per task (blog, market-pricing.md); "within 24 hours" in the field (vendor) | price unverified |
| Streetspotr (DE crowd) | Product placement checks (e.g. a snack brand at a named Rewe store, Frankfurt, 2014) | no public price | USD/EUR 2-5 per task (blog) | price unverified |
| Field Agent / Gigwalk (US crowd) | Photo, price check, display audit | no public price | price check $3-8, display audit $5-12 (blog) | indicative |
| Repsly (software for own reps) | Retail execution app | conflicting: $29, $89, "$50-100" per user per month (third-party directories) | n/a | unverified |
| Trax, Streetbees, Pensa | Shelf image recognition, consumer research | no public price found | n/a | unverified |

Positioning (honest): crowd platforms already do photo checks with similar worker pay; their client price is quote-only or subscription (BeMyEye from EUR 500 a month). Shelfie's differences are pay-per-verified-check with a public price, deterministic verification, and escrow refund. Agencies also fix shelves; Shelfie does not.

## 5. Business case and ROI

Inputs from `slides/facts.tex`: price EUR 12 (illustrative), payout EUR 3.50 (illustrative), verifier under EUR 0.10 (estimate), escrow about 5% = EUR 0.60 (estimate, unconfirmed). All Shelfie prices are hypotheses until the five brand interviews.

### Unit economics (assumptions, not facts)
- Gross profit per pay-as-you-go check = 12.00 - 3.50 - 0.10 - 0.60 = EUR 7.80, margin 7.80 / 12.00 = 65%.
- Monthly pack: EUR 399 for 50 checks = EUR 7.98 each; gross profit = 7.98 - 4.20 = EUR 3.78 (47%), if the same costs apply.
- Excluded: support, disputes, verifier calls on rejected photos, refunds, payment on-ramp. Real margin is lower.
- Illustrative break-even: if monthly fixed costs were EUR 5,000 (assumption), 5,000 / 7.80 = 641 checks a month.

### Cost per verified data point
| Option | Cost per data point | Basis |
|---|---|---|
| Own rep, Germany | about EUR 39-58 | assumption chain in section 3; 38,600 gross is sourced |
| US audit visit (T-ROC) | $30-45 | sourced |
| German test purchase | from about EUR 50 | sourced; different service (buy, experience, report) |
| Shelfie | EUR 12 | illustrative price |
Shelfie at EUR 12 is 12/50 = 24% of the German test purchase floor. Versus a US audit, do not convert currencies on the page.

### ROI for a brand checking 50 stores a month
- Shelfie pay-as-you-go: 50 x 12 = EUR 600; monthly pack EUR 399.
- US audits: 50 x $30-45 = $1,500-2,250.
- German test purchases: 50 x 50 = EUR 2,500 minimum.
- Own rep (assumption): 50 x 39-58 = EUR 1,950-2,900.
- Saving vs the floor of the cheapest alternative: EUR 2,500 - 600 = EUR 1,900 a month, or 76%, on a like-for-like count of data points. Caveat: scope differs; Shelfie covers one photo, price and presence only.
- Value side (illustrative, assumption): a brand paying 20% of revenue in trade promotion (McKinsey) on a EUR 1M account spends EUR 200,000; if 40% execution failure (Shop! measured 40% compliance, so 60% failure for displays) applied, EUR 120,000 of promotion money buys nothing; proof for 50 stores costs EUR 600 a month, EUR 7,200 a year. This ratio is an illustration of exposure, not a measured saving; the Shop! figure is US displays 2016.

### TAM / SAM / SOM
Not additive; one chain only.
- TAM (sourced): global in-store merchandising services $6-6.2B (Beroe 2023).
- Europe slice (derived from sourced share): "more than 20%" gives more than about $1.2B.
- SAM (assumption): the part that is a simple presence-and-price check, assumed 5% of the Europe slice = about $60M. Germany share unknown (no source), so no Germany SAM is stated.
- SOM (assumption, bottom-up, Munich only): 20 brands x 50 stores x 12 months x EUR 12 = EUR 144,000 a year. Number of brands and stores reachable in Munich: unverified.
- Neighbour market, not added: mystery shopping $2.35B global, $0.10B Germany (Straits 2025).

## 6. Suggested homepage copy

Hero options (every number cited in the note under it):
1. "Pay for the shelf photo only when it is true." Small print: price EUR 12 per check is illustrative pricing; demo runs on Cardano preprod with test money.
2. "Brands spend about 20% of revenue on trade promotions. Who checks the shelf?" Citation: McKinsey, 2019 (https://www.mckinsey.com/industries/consumer-packaged-goods/our-insights/how-analytics-can-drive-growth-in-consumer-packaged-goods-trade-promotions).
3. "Brands think about 70% of promotions run as planned. Audits measured about 40%." Citation: Shop! Compliance Initiative Study, 2016, US displays, as quoted by Roamler. Use only with "US study".

Market section:
- "A basic shelf audit costs $30-45 a visit in the US (T-ROC, 2026) and a German test purchase starts at about EUR 50 (mystery.agency). A Shelfie check is EUR 12, illustrative, and charged only when the photo passes."
- "Retail loses about $1.7T a year to inventory distortion; two thirds is out-of-stocks (IHL Group, 2026, via Retail Insight Network)."
- "In-store merchandising is a $6B services market (Beroe, 2023 estimate)."
- "59% of promotions lost money (72% in the US). Proof of execution is the first thing a brand can fix." Citation: McKinsey 2019. Wording note: this is about profitability, not about promotions that did not happen.
- Legal line, if used: "We check what happened on the shelf: availability, tags, promotions you paid for, competitor prices. We do not set prices." Do not write "agreed prices".
- Scope line: "One shelf photo proves price and presence, not placement or share of shelf."

Do not use: "$1.1T" without "about, derived"; "$500 billion trade spend"; "4% executed"; any Germany market size; "10x cheaper"; any lead-time or unusable-photo number; Trax valuation as market size.

## 7. Open questions

1. IHL out-of-stock dollar value: need the IHL 2026 study (403 here) to confirm $1.1T versus $690.9B "empty shelves" versus the 2025 "$1.2T". Until then use $1.7T and "two thirds".
2. Beroe and McKinsey were read via search excerpts; open them in a browser once before the pitch.
3. Germany size of merchandising / field marketing services: needs a paid report (Euromonitor, IBISWorld) or an association (e.g. BVH, GfK); none free found.
4. Agency lead time and share of unusable audit photos: only obtainable by calling agencies or from the brand interviews.
5. A.R.E.|POPAI 2015 and Shop! 2016 primary reports: open and confirm before quoting on stage.
6. Escrow fee 5% (Masumi) still unconfirmed; it moves the 65% margin.
7. Legal review of the promotion-proof wording and in-store photography.
8. Price validation of EUR 12 in the five planned brand interviews; Roamler, Streetspotr and Gigwalk brand prices need a quote request.
