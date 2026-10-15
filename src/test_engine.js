// Scenario checks for the rules engine. Run: node test_engine.js
const E = require("./engine.js");
let fails = 0, n = 0;
function check(name, got, want) {
  n++;
  const ok = got === want;
  if (!ok) fails++;
  console.log((ok ? "ok   " : "FAIL ") + name + " -> " + got + (ok ? "" : "  (want " + want + ")"));
}
// The public code carries no names: labels have none until settings give them.
check("No name in the public code", E.cardLabel("red_b") + " / " + E.PEOPLE.a + E.PEOPLE.b, "HSBC Red / ");
check("...and no name in the reasons", E.rateFor("easy_b", "home", { payer: "b", date: "2026-10-12", amount: 100, flags: {}, cfg: E.deepMerge(E.mergeConfig(null), { redHot: { b: { cat: "" } } }), st: E.audit([], E.mergeConfig(null)).state }).why.some((w) => /^Not registered for Red Hot/.test(w)), true);
E.setPeople({ a: "Person A", b: "Person B" });
const base = E.mergeConfig(null);
const rec = (cfg, q, txns) => {
  const st = E.audit(txns || [], cfg).state;
  return E.recommend(Object.assign({ date: "2026-10-12", payer: "a", flags: {} }, q), st, cfg);
};
const T = (o) => Object.assign({ id: Math.random().toString(36).slice(2), payer: "a", flags: {} }, o);

// Today, with only the easy cards, A's Red and the Citi PLUS debit.
let r = rec(base, { catId: "red8_dining", amount: 300 });
check("Sushiro today -> Red A", r.pick.id, "red_a");
check("Sushiro rate 8%", E.pct(r.pick.net), "8%");
r = rec(base, { catId: "dining", amount: 400 });
check("Restaurant today -> easy (Red cap kept free)", r.pick.id, "easy_a");
check("Restaurant today notes the coming Citi", r.notes.some((x) => /Citi Cash Back/.test(x)), true);
r = rec(base, { catId: "online_hk", amount: 500 });
check("HKTVmall -> Red", r.pick.id, "red_a");
r = rec(base, { catId: "online_fx_hkd", amount: 7200, flags: { flight: 1 } });
check("Turkish Airlines -> Red", r.pick.id, "red_a");
check("Turkish net 3%", E.pct(r.pick.net), "3%");
r = rec(base, { catId: "home", amount: 600, flags: { moneyback: 1 } });
check("PARKnSHOP A -> easy", r.pick.id, "easy_a");
check("PARKnSHOP A 4%", E.pct(r.pick.net), "4%");
r = rec(base, { payer: "b", catId: "home", amount: 600, flags: { moneyback: 1 } });
check("PARKnSHOP B -> her easy", r.pick.id, "easy_b");
check("PARKnSHOP B (Home 5X + MoneyBack) 4%", E.pct(r.pick.net), "4%");
r = rec(base, { payer: "b", catId: "shopping", amount: 300, flags: { moneyback: 1 } });
check("Watsons B (Home 5X doesn't cover it) 2%", r.pick.id + " " + E.pct(r.pick.net), "easy_b 2%");
r = rec(base, { payer: "b", catId: "red8_dining", amount: 300 });
check("Sushiro B -> her own Red 8%", r.pick.id + " " + E.pct(r.pick.net), "red_b 8%");
const withMaryShop = E.deepMerge(base, { redHot: { b: { cat: "shopping", since: "2026-10-12" } } });
r = rec(withMaryShop, { payer: "b", catId: "shopping", amount: 300, flags: { moneyback: 1 } });
check("Watsons B (Shopping 5X + MoneyBack) 4%", E.pct(r.pick.net), "4%");
r = rec(base, { payer: "b", catId: "online_hk", amount: 300 });
check("B online -> her Red 4%", r.pick.id + " " + E.pct(r.pick.net), "red_b 4%");
const noMaryRed = E.deepMerge(base, { cards: { red_b: { status: "pending", since: "" } } });
r = rec(noMaryRed, { payer: "b", catId: "online_hk", amount: 300 });
check("B online without her Red -> easy", r.pick.id, "easy_b");
check("...and notes her Red is coming", r.notes.some((x) => /HSBC Red · Person B/.test(x)), true);

// Citi approved on 20 Oct: 30-day welcome window to 19 Nov, HK$4,000.
const citiOn = E.deepMerge(base, { cards: { citi: { status: "active", approvedOn: "2026-10-20", suppCard: true } } });
r = rec(citiOn, { date: "2026-10-25", catId: "dining", amount: 400 });
check("Restaurant in Citi window -> Citi", r.pick.id, "citi");
check("...mode welcome", r.mode, "welcome");
r = rec(citiOn, { date: "2026-10-25", catId: "home", amount: 600, flags: { moneyback: 1 } });
check("PARKnSHOP on track -> stays on easy", r.pick.id, "easy_a");
r = rec(citiOn, { date: "2026-10-25", catId: "online_hk", amount: 500 });
check("Online on track -> stays on Red", r.pick.id, "red_a");
r = rec(citiOn, { date: "2026-10-25", catId: "grocery", amount: 300 });
check("Wellcome -> Citi", r.pick.id, "citi");
const behindTx = [T({ date: "2026-10-21", card: "citi", category: "dining", amount: 1000 })];
r = rec(citiOn, { date: "2026-11-12", catId: "home", amount: 600, flags: { moneyback: 1 } }, behindTx);
check("Behind schedule: PARKnSHOP -> Citi", r.pick.id, "citi");
r = rec(citiOn, { payer: "b", date: "2026-10-25", catId: "grocery", amount: 300 });
check("B Wellcome with supplementary -> Citi", r.pick.id, "citi");
r = rec(citiOn, { date: "2026-10-25", catId: "ewallet", amount: 1000 });
check("PayMe top-up -> Citi 1%", r.pick.id + " " + E.pct(r.pick.net), "citi 1%");

// Red cap nearly used: HK$9,500 online already this month.
const capTx = [T({ date: "2026-11-22", card: "red_a", category: "online_hk", amount: 9500 })];
r = rec(citiOn, { date: "2026-11-26", catId: "online_fx_hkd", amount: 2000 }, capTx);
check("Overseas site after Red cap -> Citi", r.pick.id, "citi");
r = rec(citiOn, { date: "2026-11-26", catId: "online_hk", amount: 2000 }, capTx);
check("HK site after Red cap -> Red still 1.3%", r.pick.id + " " + E.pct(r.pick.net), "red_a 1.3%");
r = rec(citiOn, { date: "2026-10-26", catId: "online_hk", amount: 2000 }, [T({ date: "2026-10-22", card: "red_a", category: "online_hk", amount: 9500 })]);
check("Same purchase inside the Citi window -> Citi for the bonus", r.pick.id, "citi");

// December: Citi bonus done, Hang Seng issued 20 Nov and registered.
const hsOn = E.deepMerge(citiOn, { cards: { hs_a: { status: "active", issuedOn: "2026-11-20", funRegistered: true } } });
const citiDone = [T({ date: "2026-10-28", card: "citi", category: "grocery", amount: 4200 })];
r = rec(hsOn, { date: "2026-12-05", catId: "dining", amount: 500 }, citiDone);
check("December restaurant -> Hang Seng", r.pick.id, "hs_a");
check("...at 5%", E.pct(r.pick.net), "5%");
r = rec(hsOn, { date: "2026-12-05", catId: "grocery", amount: 300 }, citiDone);
check("December Wellcome -> Hang Seng (builds HK$6,000)", r.pick.id, "hs_a");
r = rec(hsOn, { date: "2027-01-10", catId: "dining", amount: 500 }, citiDone.concat([T({ date: "2026-12-20", card: "hs_a", category: "grocery", amount: 5200 })]));
check("January restaurant after promo -> Citi", r.pick.id, "citi");
r = rec(hsOn, { payer: "b", date: "2026-12-05", catId: "dining", amount: 500 }, citiDone);
check("B December restaurant -> Citi (no Hang Seng card)", r.pick.id, "citi");

// Abroad.
r = rec(base, { catId: "abroad_asia7", amount: 1000 });
check("Japan shop in October -> cash", r.pick.id, "cash");
r = rec(base, { catId: "red8_abroad", amount: 500 });
check("FamilyMart Japan -> Red 8% minus FX", r.pick.id + " " + E.pct(r.pick.net), "red_a 6.1%");
r = rec(hsOn, { date: "2026-12-26", catId: "abroad_eea", amount: 1000 }, citiDone);
check("France in December -> Hang Seng 5% minus FX", r.pick.id + " " + E.pct(r.pick.net), "hs_a 3.1%");
r = rec(citiOn, { date: "2027-01-10", catId: "abroad_eea", amount: 1000 }, citiDone);
check("France in January -> cash", r.pick.id, "cash");

// Checking what was paid.
const paid = [
  T({ id: "a", date: "2026-10-13", card: "easy_a", category: "red8_dining", amount: 420, merchant: "Sushiro" }),
  T({ id: "b", date: "2026-10-13", card: "red_a", category: "online_hk", amount: 300, merchant: "HKTVmall" }),
  T({ id: "c", date: "2026-10-26", card: "easy_a", category: "dining", amount: 600, merchant: "Dinner" }),
];
const a = E.audit(paid, citiOn).byId;
check("Sushiro on easy flagged", a.a.flagged, true);
check("...best was Red", a.a.best, "red_a");
check("HKTVmall on Red not flagged", a.b.flagged, false);
check("Dinner on easy during Citi window flagged", a.c.flagged && a.c.mode === "welcome", true);

// Status report.
const s = E.status(paid.concat([
  T({ id: "f", date: "2026-10-12", card: "red_a", category: "online_fx_hkd", amount: 6800, merchant: "Turkish Airlines", flags: { flight: 1 } }),
  T({ id: "r", date: "2026-10-12", card: "fps", category: "rent", amount: 20000, merchant: "Rently", miles: 8400 }),
]), citiOn, "2026-10-30");
check("Status has Citi welcome meter", s.meters.some((m) => m.key === "wel_citi"), true);
check("Flight claim deadline", s.flights[0].deadline, "2026-11-12");
check("Max Miles credited by 30 Oct", s.miles.balance, 8400);
check("Rent next due", s.rently.nextDue, "2026-11-16");
check("Rent FPS by the 12th", s.rently.payBy, "2026-11-12");
check("Alerts include the Sushiro mistake", s.alerts.some((x) => x.kind === "txn" && /Sushiro/.test(x.text)), true);
// Thresholds say what is left to spend; caps say what is left at the bonus rate and what it has earned so far.
const welM = s.meters.find((x) => x.key === "wel_citi");
check("Citi welcome is a threshold with HK$ left to spend", welM.kind + " " + welM.left + " by " + welM.deadline, "threshold 4000 by 2026-11-19");
const onM = s.meters.find((x) => x.key === "red_a_on");
check("Red online is a cap: left at 4%, collected so far", onM.kind + " " + onM.left + " " + onM.collected.toFixed(2) + " resets " + onM.resets, "cap 2900 284.00 resets 2026-11-01");
const s2 = E.status([T({ id: "h1", date: "2026-12-03", card: "hs_a", category: "dining", amount: 6500 })], hsOn, "2026-12-31");
const hsM = s2.meters.find((x) => x.key === "hs_a_mo");
check("Hang Seng month target reached: bonus collected", hsM.kind + " " + hsM.reached + " " + hsM.collected.toFixed(0) + " until " + hsM.deadline, "threshold true 299 until 2026-12-31");

// Tram: Visa pays HK$2.30, other cards HK$3.30.
r = rec(base, { catId: "tram", amount: 2.3 });
check("Tram A -> his easy (Visa)", r.pick.id + " " + r.pick.fare, "easy_a 2.3");
check("...Red would charge the full fare", (r.alts.find((o) => o.id === "red_a") || {}).fare, 3.3);
r = rec(base, { payer: "b", catId: "tram", amount: 2.3 });
check("Tram B -> her easy", r.pick.id, "easy_b");
r = rec(citiOn, { date: "2026-10-25", catId: "tram", amount: 2.3 }, behindTx);
check("Tram during the Citi bonus, even behind schedule -> easy", r.pick.id, "easy_a");
const tramAudit = E.audit([T({ id: "tr", date: "2026-10-13", card: "red_a", category: "tram", amount: 3.3 })], base).byId.tr;
check("Tram paid with the Red is flagged", tramAudit.flagged + " " + tramAudit.loss.toFixed(2), "true 1.00");
// DS Groceries is on HSBC's Red Hot Home list.
r = rec(base, { date: "2026-10-12", catId: (E.matchMerchants("GPAY DS GROCERIES HK", [])[0] || {}).cat, amount: 100 });
check("DS Groceries -> easy with Home 5X 2.4%", r.pick.id + " " + E.pct(r.pick.net), "easy_a 2.4%");

// Taobao or Pinduoduo through AlipayHK: the Red pays nothing there.
r = rec(base, { catId: "wallet_buy", amount: 2900 });
check("Taobao via AlipayHK today -> easy, not Red", r.pick.id, "easy_a");
check("...Red at 0%", E.pct((r.alts.find((o) => o.id === "red_a") || {}).net), "0%");
r = rec(citiOn, { date: "2026-12-05", catId: "wallet_buy", amount: 2900 }, citiDone);
check("Taobao via AlipayHK once Citi is in -> Citi 1%", r.pick.id + " " + E.pct(r.pick.net), "citi 1%");

// Taobao through AlipayHK: Taobao adds 1.5% when a card pays (1.3% with Hang Seng).
r = rec(base, { catId: "taobao", amount: 2900 });
check("Taobao today -> easy, net after Taobao's fee", r.pick.id + " " + E.pct(r.pick.net), "easy_a −1.1%");
check("...Red at −1.5%", E.pct((r.alts.find((o) => o.id === "red_a") || {}).net), "−1.5%");
check("...the fee is explained", r.pick.why.some((w) => /Taobao's fee/.test(w)), true);
r = rec(citiOn, { date: "2026-12-05", catId: "taobao", amount: 2900 }, citiDone);
check("Taobao once Citi is in -> Citi −0.5%", r.pick.id + " " + E.pct(r.pick.net), "citi −0.5%");
check("Hang Seng pays 1.3% to Taobao", E.pct(E.rateFor("hs_a", "taobao", { cfg: hsOn, st: E.newState(), date: "2026-12-05", amount: 100 }).net), "−0.9%");
check("Taobao tip is shown", E.promosFor("Taobao / Tmall (AlipayHK)", "easy_a").some((p) => p.tip), true);

// Flight agencies that charge more for Mastercard: the Red absorbs up to 3.6% more than the easy pays.
const mt = E.matchMerchants("mytrip", [])[0];
check("Mytrip is a flight agency with card fees", mt.name + " " + mt.cat + " " + !!mt.flags.netFees, "Mytrip online_fx_hkd true");
const gapQ = { payer: "a", date: "2026-10-13", catId: "online_fx_hkd", amount: 7200, flags: { flight: 1, netFees: 1 } };
const g0 = E.networkGap(gapQ, E.newState(), base);
check("Red vs easy gap on an overseas site in HKD", g0.mc + " " + g0.visa + " " + E.pct(g0.gap), "red_a easy_a 3.6%");
r = rec(base, { catId: "online_fx_hkd", amount: 7200, flags: { flight: 1, netFees: 1, netFee: { mastercard: 150, visa: 0 } } });
check("Mastercard fee HK$150 on HK$7,200 -> Red still", r.pick.id + " " + E.pct(r.pick.net), "red_a 0.9%");
check("...the fee is explained", r.pick.why.some((w) => /HK\$150: the site's fee for Mastercard/.test(w)), true);
r = rec(base, { catId: "online_fx_hkd", amount: 7200, flags: { flight: 1, netFees: 1, netFee: { mastercard: 300, visa: 0 } } });
check("Mastercard fee HK$300 on HK$7,200 -> easy", r.pick.id, "easy_a");
const feeAudit = E.audit([T({ id: "mt", date: "2026-10-13", card: "easy_a", category: "online_fx_hkd", amount: 7200, merchant: "Mytrip", flags: { flight: 1, netFee: { mastercard: 300, visa: 0 } } })], base).byId.mt;
check("Paying Mytrip with the easy after a big Mastercard fee isn't flagged", feeAudit.flagged, false);

// Default card in the phone wallet.
const dc = (cfg, payer, date, txns) => E.defaultCard(payer, date, E.audit(txns || [], cfg).state, cfg);
const xs = (d) => d.exceptions.map((x) => x.card + ":" + x.key).join(" ");
let d = dc(base, "a", "2026-10-13");
check("Default today: easy", d.id + " " + d.mode, "easy_a best");
check("...exceptions: Red online and partners", xs(d), "red_a:online red_a:red8");
check("...the Citi will take over", d.coming && d.coming.id, "citi");
d = dc(base, "b", "2026-10-13");
check("B's default today: her easy", d.id, "easy_b");
check("...exceptions on her own Red", xs(d), "red_b:online red_b:red8");
d = dc(citiOn, "a", "2026-10-25");
check("Citi window: default Citi for the bonus", d.id + " " + d.mode, "citi welcome");
check("...except Red online and partners, easy PARKnSHOP and tram", xs(d), "red_a:online red_a:red8 easy_a:pns easy_a:tram");
check("...Citi stays the default after the window", d.next, null);
d = dc(citiOn, "a", "2026-11-25", citiDone);
check("After the Citi window: Citi", d.id + " " + d.mode, "citi best");
check("...easy keeps the Home shops and the tram", xs(d), "red_a:online red_a:red8 easy_a:pns easy_a:home easy_a:watsons easy_a:tram");
d = dc(hsOn, "a", "2026-12-05", citiDone);
check("December: Hang Seng for its bonus", d.id + " " + d.mode, "hs_a welcome");
check("...back to the Citi from 20 Jan", d.next && d.next.from + " " + d.next.id, "2027-01-20 citi");
check("...AlipayHK keeps the Citi", d.exceptions.some((x) => x.key === "wallet" && x.card === "citi"), true);
d = dc(citiOn, "b", "2026-10-25");
check("B with the extra Citi card: Citi", d.id, "citi");

// FlyAnywhere pays back a whole ticket only: HK$6,800 needs 56,667 Max Miles. (Test figures, not anyone's balance.)
const fa = E.status([T({ id: "fl", date: "2026-10-14", card: "red_a", category: "online_hk", amount: 6800, merchant: "Trip.com", flags: { flight: 1 } }),
  T({ id: "rent", date: "2026-10-12", card: "fps", category: "rent", amount: 20000, merchant: "Rently", miles: 8400 })], E.deepMerge(base, { miles: { base: 100 } }), "2026-10-15");
check("FlyAnywhere: 56,667 Max Miles needed, 8,500 available", fa.flights[0].needed + " " + fa.miles.balance + " " + fa.flights[0].canClaim, "56667 8500 false");
check("...claim deadline 31 days after booking", fa.flights[0].deadline, "2026-11-14");
check("...no claim alert when the miles can't cover the ticket", fa.alerts.some((x) => x.kind === "flight"), false);
const fa2 = E.status([T({ id: "fl2", date: "2026-10-14", card: "red_a", category: "online_hk", amount: 900, merchant: "HK Express", flags: { flight: 1 } })], E.deepMerge(base, { miles: { base: 8500 } }), "2026-11-08");
check("...alert in the last week when they can (HK$900 ticket, 8,500 miles)", fa2.alerts.some((x) => x.kind === "flight" && /HK Express/.test(x.text)), true);
check("...no alert before the last week: waiting costs nothing", E.status([T({ id: "fl2", date: "2026-10-14", card: "red_a", category: "online_hk", amount: 900, merchant: "HK Express", flags: { flight: 1 } })], E.deepMerge(base, { miles: { base: 8500 } }), "2026-10-20").alerts.some((x) => x.kind === "flight"), false);
// The rent's Max Miles (about the 15th) count when they land before the deadline.
let fa3 = E.flyAnywhere("2026-10-20", 1500, 8500, base, 1);
check("FlyAnywhere HK$1,500 booked 20 Oct: needs 12,500, coverable from the 15 Nov rent miles", fa3.needed + " " + fa3.now + " " + fa3.claimFrom + " " + fa3.deadline, "12500 false 2026-11-15 2026-11-20");
fa3 = E.flyAnywhere("2026-10-15", 1500, 8500, base, 1);
check("...booked 15 Oct: the 15 Nov miles come too late (deadline 15 Nov)", String(fa3.claimFrom), "null");
fa3 = E.flyAnywhere("2026-10-15", 0, 8500, base, 1);
check("...covers a flight up to HK$1,020 now", fa3.coverNow + " " + fa3.now, "1020 true");
const fa4 = E.status([T({ id: "fl3", date: "2026-10-20", card: "red_a", category: "online_hk", amount: 1500, merchant: "Peach", flags: { flight: 1 } }),
  T({ id: "rent", date: "2026-10-12", card: "fps", category: "rent", amount: 20000, merchant: "Rently", miles: 8400 })], E.deepMerge(base, { miles: { base: 100 } }), "2026-10-21");
check("...Status says from when it can be claimed", (fa4.flights[0].claimFrom || "") + " | " + (fa4.alerts.find((x) => x.kind === "flight") || {}).text, "2026-11-15 | Peach: Max Miles can pay it back from 15 Nov");

// Loyalty programmes and HeyMax.
check("PARKnSHOP: MoneyBack, and RewardCash through MoneyBack", E.programsAt("PARKnSHOP").join(), "moneyback,rewardcash");
check("Wellcome: scan yuu", E.programsAt("Wellcome").join(), "yuu");
check("Trip.com is on HeyMax", (E.heymaxFor("Trip.com") || {}).k, "tripcom");
check("Taobao is on HeyMax at HK$4 a Max Mile", (E.heymaxFor("Taobao / Tmall (AlipayHK)") || {}).per, 4);
E.setPeople({ a: "Ann", b: "Bea" });
check("Names come from settings", E.cardLabel("red_b") + " / " + E.cardName("red_b"), "HSBC Red · Bea / HSBC Red");
E.setPeople({ a: "Person A", b: "Person B" });

// Points and miles: value, what runs out first, alerts within 30 days. (Test figures.)
const pts = E.pointsSummary([
  { id: "moneyback_a", program: "moneyback", owner: "a", balance: 1000, expiring: [{ amount: 100, on: "2028-03-31" }] },
  { id: "dsgroceries_a", program: "dsgroceries", owner: "a", balance: 40, expiring: [{ amount: 40, on: "2027-05-31" }], vouchers: [{ label: "Coffee coupon", value: 30, until: "2026-10-31" }] },
  { id: "msblue_a", program: "msblue", owner: "a", balance: 3, expiring: [{ amount: 0.5, on: "2026-10-28" }] },
  { id: "asiamiles_a", program: "asiamiles", owner: "a", balance: 7500, expiresOn: "2026-10-31", note: "Earn any miles before then." },
  { id: "turkish_a", program: "turkish", owner: "a", balance: 9000, expiring: [{ amount: 2000, on: "2026-12-31" }] },
  { id: "old", program: "yuu", owner: "a", balance: 1000, expiring: [{ amount: 10, on: "2026-01-31" }] },
  { id: "x", program: "nope", owner: "a", balance: 1 },
], "2026-10-15");
check("Points: unknown programmes are left out", pts.length, 6);
check("...shops first, the soonest first", pts.map((r) => r.id).join(), "msblue_a,dsgroceries_a,moneyback_a,old,asiamiles_a,turkish_a");
check("...yuu worth HK$5 (200 points a dollar), past expiry ignored", pts.find((r) => r.id === "old").value + " " + pts.find((r) => r.id === "old").runs.length, "5 0");
check("...MoneyBack worth HK$20 (50 points a dollar)", pts.find((r) => r.id === "moneyback_a").value, 20);
check("...DS Groceries: the coupon runs out first", pts.find((r) => r.id === "dsgroceries_a").next.voucher + " " + pts.find((r) => r.id === "dsgroceries_a").next.daysLeft, "Coffee coupon 16");
const pal = E.pointsAlerts(pts, 30);
check("...alerts within 30 days", pal.map((a) => a.level + ":" + a.text).join(" | "),
  "info:M&S (Blue): HK$0.50 of the balance expires on 28 Oct | warn:DS Groceries (DS Fans): Coffee coupon (HK$30) ends on 31 Oct | warn:Asia Miles (Cathay): 7,500 miles expire on 31 Oct");
check("...with the programme's note", pal[2].sub, "Earn any miles before then.");
check("...Turkish only from December", E.pointsAlerts(E.pointsSummary([{ program: "turkish", owner: "a", balance: 9000, expiring: [{ amount: 2000, on: "2026-12-31" }] }], "2026-12-01"), 30)[0].text, "Turkish Miles&Smiles: 2,000 miles expire on 31 Dec");

// Usable or not: the smallest use of each balance, and what is missing. (Test figures.)
const rows = E.pointsSummary([
  { id: "moneyback_a", program: "moneyback", owner: "a", balance: 1000 },
  { id: "yuu_a", program: "yuu", owner: "a", balance: 1000 },
  { id: "rc_a", program: "rewardcash", owner: "a", balance: 500, expiring: [{ amount: 300, on: "2027-03-31" }] },
  { id: "ds_a", program: "dsgroceries", owner: "a", balance: 40 },
  { id: "am_a", program: "asiamiles", owner: "a", balance: 7500 },
  { id: "tk_a", program: "turkish", owner: "a", balance: 9000 },
  { id: "mm_a", program: "milesmore", owner: "a", balance: 3500 },
  { id: "dl_a", program: "delta", owner: "a", balance: 1000 },
  { id: "yuu_b", program: "yuu", owner: "b", balance: 150 },
], "2026-10-15");
const row = (id) => rows.find((r) => r.id === id);
check("MoneyBack 1,000 points: usable, HK$20", row("moneyback_a").usable + " " + row("moneyback_a").value, "true 20");
check("RewardCash $500: usable, HK$500, '$300 RewardCash expires'", (row("rc_a").usable + " " + row("rc_a").value + " " + E.runLabel(row("rc_a"), row("rc_a").next) + E.runVerb(row("rc_a"), row("rc_a").next)).trim(), "true 500 $300 RewardCash expires");
check("DS Fans points: value and minimum unknown", String(row("ds_a").usable) + " " + row("ds_a").value, "null null");
check("Asia Miles 7,500: enough for 7,000, worth about HK$900", row("am_a").usable + " " + Math.round(row("am_a").value), "true 900");
check("Turkish 9,000: 26,000 short of 35,000", row("tk_a").usable + " " + row("tk_a").short, "false 26000");
check("Delta 1,000: 4,000 short", row("dl_a").short, 4000);
check("At Wellcome: A's yuu points to use", E.pointsToUse("Wellcome", rows, "a").map((r) => r.id).join(), "yuu_a");
check("...B's 150 points are not enough: nothing to suggest", E.pointsToUse("Wellcome", rows, "b").length, 0);
check("At PARKnSHOP: RewardCash and MoneyBack points", E.pointsToUse("PARKnSHOP", rows, "a").map((r) => r.id).sort().join(), "moneyback_a,rc_a");
check("Lufthansa: Miles & More (3,500 of 3,000)", E.pointsToUse("Lufthansa", rows, "a").map((r) => r.id).join(), "mm_a");
check("Turkish Airlines: not enough miles, nothing", E.pointsToUse("Turkish Airlines", rows, "a").length, 0);
check("Cathay: Asia Miles", E.pointsToUse("Cathay Pacific", rows, "a").map((r) => r.id).join(), "am_a");
check("Shared balances: usable by both when users says so", E.pointsToUse("Wellcome", E.pointsSummary([{ id: "y", program: "yuu", owner: "a", users: ["a", "b"], balance: 400 }], "2026-10-15"), "b").length, 1);

// HSBC Travel Guru (GO, 3%): HSBC cards beat cash in shops abroad, as a target to reach.
const tgCfg = E.deepMerge(base, { travelGuru: { a: "go" } });
r = rec(tgCfg, { date: "2026-10-25", catId: "abroad_eea", amount: 1000 });
check("Travel Guru: France -> easy at about 1.5% net (0.4% + 3% - 1.95%)", r.pick.id + " " + E.pct(r.pick.net), "easy_a 1.5%");
check("...the target is explained", r.pick.why.some((w) => /Travel Guru GO: 3% extra, once HSBC cards reach HK\$8,000 in shops abroad/.test(w)), true);
r = rec(tgCfg, { date: "2026-10-25", catId: "abroad_eea", amount: 1000, payer: "b" });
check("...not for B (not a member): cash", r.pick.id, "cash");
check("...nothing extra online", E.pct(rec(tgCfg, { date: "2026-10-25", catId: "online_fx", amount: 1000 }).alts.concat([]).find((o) => o.id === "easy_a").net), "−1.5%");
const tgTx = [T({ date: "2026-10-23", card: "easy_a", category: "abroad_eea", amount: 5000 }), T({ date: "2026-10-26", card: "red_a", category: "abroad_eea", amount: 3500 })];
const tgSt = E.status(tgTx, tgCfg, "2026-10-28");
const tgM = tgSt.meters.find((x) => x.key === "tg_a");
check("...Status: HK$8,500 of 8,000 reached, collected HK$255", tgM.reached + " " + tgM.used + " " + Math.round(tgM.collected), "true 8500 255");
check("...window: October to December", tgM.deadline, "2026-12-31");
check("...no meter for B", tgSt.meters.some((x) => x.key === "tg_b"), false);

// Merchant matching.
const top = (q) => (E.matchMerchants(q, [])[0] || {}).name;
check("match 'sushi'", top("sushi"), "Sushiro");
check("match 'PARKnSHOP Tsuen Wan'", top("PARKnSHOP Tsuen Wan"), "PARKnSHOP");
check("match 'hktvmall'", top("hktvmall"), "HKTVmall");
check("match '百佳超級市場'", top("百佳超級市場"), "PARKnSHOP");
check("match 'city super'", top("city super"), "city'super");
check("match 'Booking.com'", top("Booking.com"), "Booking.com");
check("match 'taxi' not tax", top("taxi"), "Taxi");
check("match statement line for the tram", top("GPAY HONG KONG TRAMWAY95800"), "Hong Kong Tramways");
check("match 'AlipayHK*Taobao.com'", top("SALES: AlipayHK*Taobao.com HK"), "Taobao / Tmall (AlipayHK)");

console.log("\n" + (n - fails) + "/" + n + " passed");
process.exit(fails ? 1 : 0);
