# Which Card? — how to maintain it

Two pages are built from this folder, and both run the same rules (`engine.js`):

- **The main page**: a private Claude artifact (its address is in the maintenance task, not here). It holds the
  shared store: expenses, to-dos, points balances (`points`) and the private settings in `config/main` (names, phone
  wallets, the partner page's address and access code, the HeyMax links). It asks Claude about places it doesn't know.
- **The partner's page**: this repository's GitHub Pages site, served from the `gh-pages` branch, which holds the
  built files only. Card advice only: no account, no Claude, no spending data. Works offline once opened.

## Privacy: this repository is public

Never commit personal data: no names, addresses, phone numbers, card or account numbers, amounts, balances,
transactions, Signal or HeyMax links, and no addresses of the artifact. They stay in the artifact's store.

The partner's page gets the few it needs (the two names, the Signal link behind its Ask button, the HeyMax links, the
balances that person may use and the confirmed Max Miles) in `sealed.json`, encrypted with an access code (`seal.js`:
PBKDF2-SHA256, AES-256-GCM). The code is only in the store
(`config/main.sealCode`) and in the link sent to the partner (`…/#code=…`). Without it the page works the same, minus
those extras.

## Files

| File | What it is |
| --- | --- |
| `engine.js` | The rules: cards, merchants, rates, caps, welcome bonuses, the default card, points, HeyMax. No DOM. |
| `app.js`, `style.css`, `shell.html` | The page. `shell.html` holds the markup; the build fills it in. |
| `test_engine.js` | Scenario tests for the rules: `node test_engine.js` must pass before any publish. |
| `build.js` | Builds `dist/index.html` (main page) and the partner's site (`dist-site/`, or `SITE_OUT=<folder>`). |
| `site.json` | The partner's card states (`cfg`), `builtOn` (date the rules were last checked), `welcomeDone`. |
| `snapshot.js` | `node snapshot.js <store export> > <scratch>/private.json` builds the partner page's extras from an export of the store (`config/main`, `txns`, `points`, made with ArtifactData `list` and `out_dir`). Keep both outside the repository. |
| `seal.js`, `sealed.json` | `node seal.js <scratch>/private.json` writes `sealed.json`, only when the code or the extras changed. Delete `private.json` afterwards. |
| `sw.js` | The partner page's offline service worker (its cache name changes with every build). |
| `assets/` | Icons and the card pictures (HSBC Red and easy) published next to both pages. |

## Build, test, publish

```sh
cd src
node test_engine.js                           # must end with "N/N passed"
git worktree add ../../which-card-site gh-pages   # once: a checkout of the site branch next to the repository
SITE_OUT=../../which-card-site node build.js  # main page in src/dist/, the site into the gh-pages checkout
cd .. && git add -A && git commit -m "…" && git push origin main
cd ../which-card-site && git add -A && git commit -m "Site: …" && git push origin gh-pages
```

Then publish the main page with the Artifact tool: read the artifact first (`action: "read"`), then publish
`src/dist/index.html` to that same `url`. The card pictures already published with it (`cards/`) are kept.

Check the site serves the new version: fetch `<site address>/config.js?v=<anything>` with WebFetch (the shell can't
reach github.io) and look for the new `builtOn`.

## Keeping the partner's page in step

The partner's page cannot read the store. When a card changes (approved, issued, registered), copy these fields from
`config/main` (ArtifactData `get`, collection `config`, doc `main`) into `site.json` → `cfg`:

- `cards.red_b`, `cards.easy_b`, `cards.hs_b` (status and dates, `funRegistered`)
- `cards.citi` (`status`, `approvedOn`, `suppCard`)
- `redHot.b`, `moneybackVip.b`, `travelPlus.promoEnd` when it differs from the engine's default

`welcomeDone` lists welcome bonuses already reached (e.g. `["citi"]`), so the partner's page stops pushing them.
Set `builtOn` to the day of the check. Then refresh the sealed extras (names, Signal and HeyMax links, balances the
partner may use: `points` docs whose `users` include `"b"`, and the confirmed Max Miles): export the store,
`snapshot.js`, `seal.js`, delete the export and `private.json`.

## Points and miles

Balances are documents in the store's `points` collection, one per programme and person: `program` (a key of
`PROGRAMS` in `engine.js`), `owner` ("a" or "b"), `users` (who may spend it, default the owner), `balance`,
`expiring` ([{ amount, on }]), `expiresOn` (whole balance), `vouchers`, `progress`, `note`, `asOf`. Update them from
the screenshots the owner sends. `PROGRAMS` holds what a point is worth in HK$ (`perHkd`, `hkdEach`, an estimate for
airline miles), the least needed to use it (`min`) and where it can be spent (`at`): the page suggests a balance
before the card only where it can be spent and only when it reaches `min`.

In the Spending tab each expense shows what it gave back in HK$: card rewards minus fees, plus Max Miles at their
FlyAnywhere value, from the rent (Rently) and from purchases HeyMax tracked (put the tracked Max Miles in the
expense's `heymaxMiles`). Airline miles are not counted. Travel sites (Trip.com, Expedia) ask whether the purchase is
a flight: HeyMax pays much less on flights (`flightPer` in `HEYMAX`).

## Monthly check of the rules (1st of each month)

Re-verify each rule below against the bank's own page first, then recent articles (MoneyHero, Flyformiles,
MoneySmart, Miss Card, HK01). Change `engine.js` only when the bank's page, or two independent recent sources,
confirm the change; otherwise report it as "to watch". Add or adjust a test for every change.

1. **HSBC Red** (hsbc.com.hk/credit-cards/products/red/): 4% online on the first HK$10,000 a month, then 0.4%;
   8% at the designated merchants on the first HK$1,250 a month (list in `MERCHANTS`, "Red 8%"); e-wallet payments
   (AlipayHK, WeChat Pay, PayMe) excluded from 4%; 1.95% foreign-currency fee; 1% fee on HKD bills from overseas merchants.
   Open question: one article (HK01, Oct 2026) says the Red earns 4% on Taobao paid through AlipayHK; not tested yet.
2. **HSBC Red Hot Rewards of Your Choice** (hsbc.com.hk/credit-cards/rewards/your-choice/): 5X (2% extra) up to
   HK$100,000 a year; the Home list of merchants (in `MERCHANTS`).
3. **HSBC easy / MoneyBack**: MoneyBack points at PARKnSHOP, Fortress, Watsons; member-day offers (`PROMOS`).
4. **Citi Cash Back** (citibank.com.hk): 2% on Hong Kong restaurants and hotels and on foreign currency, 1% on
   everything else including e-wallets, no cash back on bills; the MoneyHero welcome offer (25,000 Max Miles for
   HK$4,000 in 30 days) and its activation deadline (`DEFAULT_CONFIG.welcome.citi`).
5. **Hang Seng Travel+** (hangseng.com): +FUN Dollars 5% at restaurants and abroad, 7% in the Asian destinations,
   after HK$6,000 a month, extra capped at HK$500 a month, promotion end date (`travelPlus.promoEnd`); welcome
   HK$700 +FUN for HK$5,000 in 60 days.
6. **Hong Kong Tramways**: HK$2.30 with a Visa card, HK$3.30 otherwise (`CATS.tram`).
7. **Taobao through AlipayHK**: Taobao's fee when a card pays (1.5%, 1.3% for Hang Seng cards), 1% from the
   AlipayHK balance (`CATS.taobao`). Pinduoduo through AlipayHK: no fee known (`wallet_buy`).
8. **Rently**: 8,400 Max Miles a month for the first 12 payments, then 5,250; FPS by the 12th (`rently`).
9. **HeyMax**: value of a Max Mile in FlyAnywhere (`miles.rate`; whole tickets only, claim within 31 days), Visa-only
   offers, and the shopping rates in `HEYMAX` when heymax.ai shows them (they were read from the app).
10. **Offers** in `PROMOS`: remove the ones past their `until` date, update dates that were extended.
11. **Flight agencies that charge by card network** (Mytrip, Gotogate, BudgetAir, Flightnetwork, eDreams, Opodo,
    GO Voyages: `netFees` in `MERCHANTS`). Their fees show only at checkout, so the page asks for them; keep the list
    current and add any other site known to charge Mastercard and Visa differently.
12. **Points and miles** (`points` in the store): report what expires within the next two months. The page itself
    alerts 30 days ahead. Re-check the values and minimums in `PROGRAMS`: MoneyBack 50 points = HK$1; yuu 200 points =
    HK$1; RewardCash to MoneyBack $1 = 50 points (HSBC Reward+), to Asia Miles $1 = 10 miles from $40; Asia Miles
    7,000 one-way up to 750 miles on Cathay; Qatar Avios 6,000 up to 650 miles on partners; Turkish 35,000 Asia to
    Türkiye (promotion); Flying Blue and Miles & More Cash & Miles (Miles & More from 3,000); Delta Pay with Miles from
    5,000. The partner lists in `at` (yuu: Wellcome, Market Place, Mannings, 7-Eleven, IKEA, Maxim's, Starbucks, KFC,
    Pizza Hut, PHD).
13. **HSBC Travel Guru** (redhotoffers.hsbc.com.hk, Travel Guru): extra RewardCash in shops abroad (GO 3%, GING 4%,
    GURU 6%; caps $500, $1,200, $2,200) once HK$8,000 is spent within 3 consecutive months; offer period to
    `travelGuruEnd` (31 Dec 2026). Members per person in `config/main.travelGuru`.

After the check, sync the partner's settings (above), set `builtOn`, test, build and publish both pages, even when no
rule changed (the date on the partner's page shows the check happened).
