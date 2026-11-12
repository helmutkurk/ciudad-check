# Market pricing analysis

What field marketing, mystery shopping and crowd-audit apps charge today, and how Shelfie's price is set against them. Researched on 2026-10-29. Every other pitch file takes its price figures from here; `storyline.md` keeps only the summary.

## Market benchmarks

| Benchmark | Price | Source and caveat |
|---|---|---|
| Merchandising audit visit (US), quick | **$30-45** per visit | T-ROC Global 2026 pricing guide. Vendor's own figures, but the clearest published rate card. Includes labour, photo verification and reporting. |
| Merchandising visit (US), standard / complex | $45-75 standard (with corrections); $75-140 complex or specialty categories; store resets $200-500+ | Same source |
| Merchandising programme (US), recurring | $15-30 per store per month (quarterly visits) up to $180-400 (weekly visits) | Same source |
| Mystery shop / Testkauf (Germany), client price | **from about EUR 50** (simple) to **EUR 260** (one on-site test with written report and a conversation of up to 45 min, excl. VAT); large projects reach four figures | mystery.agency; mystery-shopping.de price list. Sales pages, not dated. |
| Mystery shop on-site visit (Germany), reference value | EUR 500 per visit, plus setup EUR 1,000 and reporting EUR 700 | kennstdueinen.de cost table. Single reference values, no ranges; probably the high end. Unclear whether shopper fee and travel are included. |
| Mystery-shopper pay (Germany) | EUR 10-100 per test, mostly EUR 10-50; booked hourly from about EUR 22 per hour | mystery.agency jobs page; instaff |
| Crowd-audit apps, worker pay | BeMyEye about GBP 1.5-6 for a ~10 min photo task; Roamler about GBP 5 (range GBP 3-20); Field Agent $3-20; Streetspotr $2-5 | Consumer blogs and forums, some several years old. Indicative only. |
| Crowd-audit apps, client side | BeMyEye subscription from EUR 500/month (Basic) and EUR 2,000/month (Pro) | G2 listing, vendor-supplied. No published per-check client price; it is quote-only. |

What the sources say drives the price: visit length, photo documentation, authority to fix the shelf on site, report depth, setup and training, travel to remote stores, tight schedules. Volume lowers the price per visit.

## Shelfie pricing (hypotheses)

| Item | Value | Status |
|---|---|---|
| Pay-as-you-go | **EUR 12 per verified check** | Headline price; our assumption |
| Monthly pack | EUR 399/month for 50 checks (about EUR 8 per check) | Recurring audits; our assumption |
| Volume / API (later) | EUR 5-6 per check | Floor, not the headline; our assumption |
| Payout to the person per passed check | EUR 3.50 | In line with crowd-audit worker pay above |
| Verifier cost per check (vision model + x402 fee) | well under EUR 0.10 | Estimate from model pricing; measure during the build |
| Network/escrow fee | about 5% of price (EUR 0.60 at EUR 12) | Secondary source in `../investigacion/cardano/competitive-landscape.md`; verify |
| Margin per pay-as-you-go check | about EUR 7.80 (65%) = 12 less 3.50, less 0.10, less 0.60 | Estimate, before support, disputes and verifier fees spent on rejected photos |
| Failed checks | free for the brand; not paid to the worker; task reopened | Design fact |

## How it compares

- EUR 12 is about a third of the cheapest US audit visit ($30-45) and a quarter of the cheapest German Testkauf (from EUR 50).
- 10 store checks: **EUR 120 with Shelfie** vs about $300-450 for audit visits, EUR 500-2,600 for German test purchases.
- Agencies are booked in advance and paid per visit whether or not the data is usable; Shelfie charges only for checks that pass.
- The EUR 3.50 payout sits at the upper end of what crowd-audit apps pay for a short photo task, which helps worker supply.

**Positioning caveat:** agencies also fix the shelf, do resets and write long reports. Shelfie replaces only the "is it there and at what price" check. Say so before a judge does.

**Units:** all EUR figures are illustrative product pricing, never the preprod test amounts the demo moves (1 tADA per verifier check, 3 tADA per payout). The US figures are in dollars; do not convert them on slides.

## Still open

- Agency lead time in days. [SOURCE NEEDED]
- Share of visit data that is unusable. [SOURCE NEEDED]
- Retail out-of-stock loss figures (e.g. ECR / retail-research reports) for the "why it matters" line. [SOURCE NEEDED]
- Confirm the 5% Masumi fee.
- Validate the EUR 12 price in the 5 planned brand interviews.

## Sources

Most are vendor or agency sales pages; the worker-pay figures come from older blogs and forums. Call them "indicative".

- [T-ROC Global, retail merchandising services cost 2026](https://trocglobal.com/retail-merchandising-services/)
- [mystery-shopping.de, 1 Testkauf (EUR 260 excl. VAT)](https://www.mystery-shopping.de/produkt/1-testkauf-mystery-shopping/)
- [mystery.agency, Testkauf (from about EUR 50)](https://www.mystery.agency/content/testkauf-2/)
- [mystery.agency, jobs (tester pay)](https://www.mystery.agency/jobs/)
- [kennstdueinen.de, mystery shopping costs](https://www.kennstdueinen.de/branche-mystery-shopping-1069.html)
- [instaff, mystery shopper hourly rates](https://www.instaff.jobs/marktforschung-personal-agentur)
- [G2, BeMyEye pricing](https://www.g2.com/products/bemyeye/reviews)
- [The Money Shed, Field Agent / Roamler / BeMyEye earnings](https://blog.themoneyshed.co.uk/earn-thousands-with-field-agent-roamler-task360-bemyeye/)
- [Save the Student, tasking apps](https://www.savethestudent.org/make-money/money-making-task-apps-that-pay-out-instantly.html)
- [TMS, apps like Field Agent](https://tms-outsource.com/blog/posts/apps-like-field-agent/)
- [GreenBook, how much mystery shopping companies charge](https://www.greenbook.org/insights/research-methodologies/how-much-do-mystery-shopping-companies-charge) (pricing models only, no figures)
