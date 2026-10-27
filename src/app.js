/* Which Card? page logic: rendering, the shared store, and asking Claude about unknown places.
   Solo mode (window.WC_EMBED.mode === "solo") is the partner's stand-alone page: card advice only, settings built in,
   no Claude and no shared store, and an "Ask" button when in doubt. Names, the Ask link and the HeyMax links are not
   in the public files: the private page reads them from its store, the solo page from a sealed (encrypted) block that
   opens with the access code. */
(function () {
  "use strict";
  const E = window.WC;
  const EMBED = window.WC_EMBED || null;
  const SOLO = !!(EMBED && EMBED.mode === "solo");
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const pad = (n) => String(n).padStart(2, "0");
  const localToday = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  const nowIso = () => new Date().toISOString();
  const store = {
    get(k, d) { try { const v = localStorage.getItem("wc." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("wc." + k, JSON.stringify(v)); } catch (e) { /* storage unavailable: fine */ } },
  };
  const parseAmt = (s) => { const n = parseFloat(String(s == null ? "" : s).replace(/,/g, "").replace(/[^0-9.]/g, "")); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };
  const tone = (id) => "t-" + ((E.CARDS[id] || {}).tone || "debit");
  // Money as people say it: HK$120, HK$3.20, HK$2.40 (no percentages on the Which card tab).
  const money = (v) => { const a = Math.abs(v); return (v < 0 ? "−" : "") + "HK$" + (a >= 10 || Number.isInteger(Math.round(a * 100) / 100) ? Math.round(a).toLocaleString("en-US") : a.toFixed(2)); };
  // What a net rate gives back: on the amount typed, or per HK$100 when there is none.
  const backOf = (net, amount) => (amount ? net * amount : net * 100);
  const SHORT = { red: "Red", easy: "easy", citi: "Citi", hs: "Hang Seng", debit: "Citi PLUS", cash: "Cash", fps: "FPS" };
  const shortCard = (id) => SHORT[(E.CARDS[id] || {}).kind] || id;
  // Names come from the private settings (the store, or the solo page's sealed block); the public code has none.
  const nameOf = (p) => E.PEOPLE[p] || (S.priv.people && S.priv.people[p]) || "";
  // The solo page is one person's: card labels there carry no holder.
  const cardLabel = (id) => (SOLO ? E.cardName(id) : E.cardLabel(id));
  const shortWithHolder = (id) => { const c = E.CARDS[id] || {}; return shortCard(id) + (c.holder && c.kind !== "citi" && c.kind !== "debit" && nameOf(c.holder) ? " · " + nameOf(c.holder) : ""); };
  // Pictures of the physical cards, published next to the page; other cards get a drawn card.
  const CARD_IMG = {
    red: { src: "cards/red.webp", thumb: "cards/red-thumb.webp", shape: "landscape", w: 480, h: 302 },
    easy: { src: "cards/easy.webp", thumb: "cards/easy-thumb.webp", shape: "portrait", w: 302, h: 480 },
    citi: { src: "cards/citi.webp", thumb: "cards/citi-thumb.webp", shape: "landscape", w: 480, h: 307 },
  };
  const cardImg = (id) => CARD_IMG[(E.CARDS[id] || {}).kind] || null;
  const cardPill = (id, text) => {
    const img = cardImg(id);
    return '<span class="pill ' + tone(id) + '">' + (img ? '<img class="pill-img" src="' + img.thumb + '" alt="" width="36" height="23">' : "") + esc(text) + "</span>";
  };

  const CAT_SHORT = {
    dining: "Restaurant or bar", dining_hotel: "Hotel restaurant", grocery: "Supermarket", retail: "Shop", taxi: "Taxi",
    hotel_hk: "Hotel stay", online_hk: "Online, HK site", online_fx_hkd: "Online, overseas site (HKD)", online_fx: "Online, foreign currency", wallet_buy: "Paid via AlipayHK or WeChat Pay",
    ewallet: "PayMe or AlipayHK top-up", octopus: "Octopus top-up", bills: "Bill", taobao: "Taobao via AlipayHK",
  };
  // Kinds of place offered when a name isn't in the list (Taobao is a shop, not a kind of place).
  const PICK_CATS = Object.keys(CAT_SHORT).filter((c) => c !== "taobao");
  const CLAUDE_CATS = PICK_CATS.concat(["telecom"]);
  const QUICK_HK = [
    { label: "Restaurant or bar", cat: "dining" },
    { label: "Sushiro, TamJai", cat: "red8_dining" },
    { label: "Wellcome, Market Place", cat: "grocery" },
    { label: "PARKnSHOP, Fortress", cat: "home", flags: { moneyback: 1 } },
    { label: "Watsons", cat: "shopping", flags: { moneyback: 1 } },
    { label: "AEON, YATA, Uniqlo", cat: "shopping" },
    { label: "Online, HK site", cat: "online_hk" },
    { label: "Flights, Booking, Agoda", cat: "online_fx_hkd" },
    { label: "Taxi", cat: "taxi" },
    { label: "Tram (Ding Ding)", cat: "tram" },
    { label: "PayMe or AlipayHK top-up", cat: "ewallet" },
    { label: "Shops in Japan, Thailand, China", cat: "abroad_asia7" },
    { label: "Shops in France or Europe", cat: "abroad_eea" },
  ];
  // The Red's 8% partners abroad are in Japan and Korea only.
  const RED8_ABROAD = { jp: "FamilyMart, Suica", kr: "Olive Young, T-money" };
  // In mainland China AlipayHK charges the card in HK$ (no foreign-currency fee): an e-wallet payment for the cards.
  const WALLET_ABROAD = { cn: "Mainland China via AlipayHK (QR codes, DiDi, metro)" };
  function quickList() {
    if (!S.ask.abroad) return QUICK_HK;
    const p8 = RED8_ABROAD[S.ask.country];
    const w = WALLET_ABROAD[S.ask.country];
    return [{ label: "Shops and restaurants in " + countryLabel(), cat: E.abroadCat(countryRegion()) }]
      .concat(w ? [{ label: w, cat: "wallet_buy" }] : [])
      .concat(p8 ? [{ label: p8, cat: "red8_abroad" }] : [])
      .concat([
        { label: "Website in a foreign currency", cat: "online_fx" },
        { label: "Flights, Booking, Agoda (in HKD)", cat: "online_fx_hkd" },
      ]);
  }
  const STATUS_LABEL = { active: "Active", pending: "Applied, waiting", planned: "To apply", closed: "Closed" };
  const RH_LABEL = { "": "Not registered", home: "Home (PARKnSHOP, Fortress, telecoms…)", shopping: "Shopping (Watsons, AEON, YATA…)", dining: "Dining", overseas: "Overseas" };

  const S = {
    who: SOLO ? (EMBED.payer === "a" ? "a" : "b") : (store.get("who", "a") === "b" ? "b" : "a"),
    tab: SOLO ? "ask" : (["ask", "status", "spend"].includes(store.get("tab", "ask")) ? store.get("tab", "ask") : "ask"),
    today: localToday(),
    cfg: E.mergeConfig(SOLO ? EMBED.cfg : null),
    txns: [], learned: SOLO ? store.get("learned", []) : [], todos: [], extraPromos: [], points: [],
    // Private extras: { people: { a, b }, ask: { label, to, signal }, links: { heymaxKey: url } }, from the store
    // (main page) or the sealed block (solo page, once opened with the access code).
    priv: { people: {}, ask: {}, links: {} }, sealed: SOLO && EMBED.sealed ? "locked" : "none", pointRows: [],
    db: null, sample: null, uid: null,
    dbState: SOLO ? "solo" : "connecting",
    cfgExists: false,
    rawCfg: {}, // config/main as stored, without the engine's defaults
    txLoaded: false,
    quickList: null,
    readOnly: false,
    month: null,
    status: null,
    ask: { text: "", amount: "", abroad: false, country: store.get("country", "jp"), sel: null, matches: [], claude: { busy: false, msg: "" }, netFee: { mastercard: "", visa: "" }, trip: "" },
  };
  S.month = E.ym(S.today);
  if (!SOLO) E.setPeople(store.get("people", null));
  if (!SOLO && ["ask", "status", "spend"].includes(location.hash.slice(1))) S.tab = location.hash.slice(1);
  const canWrite = () => !!S.db && S.dbState === "live" && !S.readOnly;

  /* ---------- toast ---------- */
  let toastTimer = 0;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3800);
  }

  /* ---------- top-level render ---------- */
  function refresh() {
    S.status = E.status(S.txns, S.cfg, S.today);
    // The solo page has the balances its extras carry (the ones that person can use); the main page has the store's.
    S.pointRows = SOLO ? E.pointsSummary(S.priv.points || [], S.today).filter((r) => r.users.includes(S.who)) : E.pointsSummary(S.points, S.today);
    if (SOLO) {
      // The solo page sees no spending: a welcome bonus already reached is marked done at build time.
      for (const id of EMBED.welcomeDone || []) S.status.state.wel[id] = Number.MAX_SAFE_INTEGER;
      renderAskBody();
      return;
    }
    S.defAlerts = defaultAlerts();
    renderHeader();
    renderBanner();
    renderAskBody();
    renderStatus();
    renderSpend();
    renderTabs();
  }
  function renderHeader() {
    document.querySelectorAll("[data-who]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.who === S.who));
      b.textContent = nameOf(b.dataset.who) || (b.dataset.who === "a" ? "A" : "B");
    });
  }
  function renderBanner() {
    let msg = "";
    if (S.dbState === "off") msg = "Shared spending isn't available in this view. Open the page in Claude, signed in, to see and save expenses. The card advice still works.";
    else if (S.readOnly) msg = "You can see everything but not save changes. The page's owner can give you Editor access from the Share menu.";
    $("#banner").innerHTML = msg ? '<p class="banner">' + esc(msg) + "</p>" : "";
  }
  function renderTabs() {
    for (const t of ["ask", "status", "spend"]) $("#tab-" + t).hidden = S.tab !== t;
    document.querySelectorAll("[data-tab]").forEach((b) => { if (b.dataset.tab === S.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    const n = allAlerts().filter((a) => a.level !== "info").length;
    const badge = $("#badge");
    badge.hidden = !n;
    badge.textContent = n > 9 ? "9+" : String(n);
    $("#addBtn").hidden = !(S.tab === "spend" && canWrite());
  }
  function setTab(t) { S.tab = t; store.set("tab", t); renderTabs(); window.scrollTo(0, 0); }
  function setWho(w) { S.who = w; store.set("who", w); renderHeader(); renderAskBody(); renderSpend(); }

  /* ---------- Which card ---------- */
  function countryRegion() { return (E.COUNTRIES.find((c) => c.id === S.ask.country) || { region: "other" }).region; }
  function countryLabel() { return (E.COUNTRIES.find((c) => c.id === S.ask.country) || { label: "abroad" }).label; }
  function effectiveCat(sel) {
    const cat = E.CATS[sel.cat];
    if (S.ask.abroad && cat && cat.group === "hk" && cat.inPerson) return E.abroadCat(countryRegion());
    return sel.cat;
  }
  const fromMatch = (m) => ({ name: m.name, cat: m.cat, flags: m.flags || {}, source: m.source });

  function onQuery() {
    const A = S.ask;
    A.text = $("#q").value;
    $("#qClear").hidden = !A.text;
    A.matches = E.matchMerchants(A.text, S.learned);
    const [top, second] = A.matches;
    // Pick straight away on a full-word match, or when one partial match is clearly ahead.
    const sure = top && (top.score >= 75 || (top.score >= 60 && (!second || top.score - second.score >= 8)));
    A.sel = sure ? fromMatch(top) : null;
    A.claude = { busy: false, msg: "" };
    A.netFee = { mastercard: "", visa: "" };
    A.trip = "";
    renderAskBody();
  }
  // Card fees typed from a site's payment page travel with the purchase, so the advice and the check afterwards use them.
  function netFeeFlags() {
    const mc = parseAmt(S.ask.netFee.mastercard), visa = parseAmt(S.ask.netFee.visa);
    return mc || visa ? { netFee: { mastercard: mc, visa } } : {};
  }
  const askFlags = (sel) => Object.assign({}, (sel && sel.flags) || {}, netFeeFlags(), S.ask.trip === "flight" ? { flight: 1 } : {});
  // Another place picked (a suggestion, a kind of place, a quick row): the flight-or-hotel choice and the fees typed
  // for the previous one don't carry over.
  function choose(sel) {
    S.ask.sel = sel;
    S.ask.trip = "";
    S.ask.netFee = { mastercard: "", visa: "" };
    renderAskBody();
  }
  function clearAsk() {
    const A = S.ask;
    A.text = ""; A.sel = null; A.matches = []; A.claude = { busy: false, msg: "" }; A.netFee = { mastercard: "", visa: "" }; A.trip = "";
    $("#q").value = "";
    $("#qClear").hidden = true;
    renderAskBody();
  }

  function renderAskBody() {
    if (!S.status) return;
    const A = S.ask;
    const box = $("#askBody");
    let html = "";
    if (A.sel) html = suggestionsHtml(A.matches, A.sel) + resultHtml(A.sel);
    else if (A.text.trim().length < 2) html = suggestionsHtml(A.matches, null) + quickHtml();
    else html = suggestionsHtml(A.matches, null) + unknownHtml(A.text.trim());
    box.innerHTML = html;
    fitNumbers(box);
  }
  // The big HK$ figure on the card shrinks until it fits its box: narrow phones, four-figure amounts, and a wider
  // font once it has loaded.
  function fitNumbers(root) {
    for (const el of (root || document).querySelectorAll(".cp-rate")) {
      el.style.fontSize = "";
      const room = el.parentElement ? el.parentElement.clientWidth : 0;
      if (!room) continue; // hidden: nothing to measure
      let size = parseFloat(getComputedStyle(el).fontSize) || 34;
      for (let i = 0; i < 12 && el.scrollWidth > room + 0.5 && size > 16; i++) { size -= 2; el.style.fontSize = size + "px"; }
    }
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitNumbers()).catch(() => {});
  window.addEventListener("resize", () => fitNumbers());

  /* ---------- the default card in the phone wallet ---------- */
  const walletOf = (p) => (S.cfg.wallets && S.cfg.wallets[p]) || "your phone's wallet";
  const RH_WHERE = { home: "PARKnSHOP, DS Groceries and other Home shops", shopping: "Watsons, AEON and other Shopping shops", dining: "restaurants", overseas: "foreign-currency spending" };
  const cardName = (id) => E.cardName(id);
  // The solo page is one person's: no name needed in its headings.
  const forWho = (sep) => (SOLO || !nameOf(S.who) ? "" : sep + nameOf(S.who));
  function defaultReason(d) {
    const c = E.CARDS[d.id];
    const st = S.status.state;
    if (d.mode === "welcome" && d.welcome) {
      const w = d.welcome;
      const left = Math.max(0, w.target - st.welcome(w.id));
      return SOLO
        ? "Its welcome bonus runs until " + E.dayLabel(w.end) + ": " + E.hkd(w.target) + " of spending on it unlocks " + w.reward + "."
        : "Welcome bonus: " + E.hkd(left) + " more on it by " + E.dayLabel(w.end) + " unlocks " + w.reward + ".";
    }
    if (d.mode === "hsmonth") {
      const t = S.cfg.travelPlus.monthTarget;
      const so = st.hsMonth(d.id, E.ym(S.today)).spend;
      return "Hang Seng month: " + E.hkd(t) + " on it this month unlocks HK$5 back per HK$100 at restaurants" + (SOLO ? "." : " (" + E.hkd(so) + " so far).");
    }
    if (c.kind === "easy") {
      const rh = (S.cfg.redHot[c.holder] || {}).cat;
      return "A Visa, so the tram costs HK$2.30. Back per HK$100: " + (rh && RH_WHERE[rh] ? "HK$2.40 at " + RH_WHERE[rh] + ", " : "") + "HK$0.40 elsewhere, like the other cards.";
    }
    if (c.kind === "citi") return "Back per HK$100: HK$1 on everything, HK$2 at restaurants and hotels. No extra fees.";
    if (c.kind === "hs") return "HK$0.40 back per HK$100 in +FUN Dollars, more at restaurants in promo months.";
    if (c.kind === "red") return "Back per HK$100: HK$4 online, HK$8 at Red partners, HK$0.40 elsewhere.";
    return "";
  }
  function defaultHtml() {
    if (S.ask.abroad) return "";
    const d = E.defaultCard(S.who, S.today, S.status.state, S.cfg);
    if (!d) return "";
    const c = E.CARDS[d.id];
    const img = cardImg(d.id);
    const art = img
      ? '<img class="dc-img ' + img.shape + '" src="' + img.src + '" alt="' + esc(cardLabel(d.id)) + ' card" width="' + img.w + '" height="' + img.h + '">'
      : '<div class="cp-mini ' + tone(d.id) + '" aria-hidden="true"><span class="cp-mini-bank">' + esc(c.bank) + '</span><span class="cf-chip"></span><span class="cp-mini-name">' + esc(c.name) + "</span></div>";
    let foot = "";
    if (d.next) foot = "From " + E.dayLabel(d.next.from) + ": " + cardName(d.next.id) + (d.next.mode === "welcome" ? ", for its welcome bonus" : (d.next.mode === "hsmonth" ? ", for the Hang Seng month" : "")) + ". Change the default that day.";
    else if (d.coming) foot = "When the " + cardName(d.coming.id) + " arrives, it becomes the default" + (d.coming.mode === "welcome" ? " for its welcome bonus" : "") + ".";
    return '<div class="section-h"><span>Default card' + esc(forWho(" · ")) + "</span>" + (d.next ? '<span class="mono">until ' + esc(E.dayLabel(E.addDays(d.next.from, -1))) + "</span>" : "") + "</div>" +
      '<div class="dc">' +
        '<div class="dc-main">' + art + '<div class="dc-info"><span class="dc-name">' + esc(cardName(d.id)) + "</span>" +
        (d.mode === "welcome" || d.mode === "hsmonth" ? '<span class="dc-reason">' + esc(defaultReason(d)) + "</span>" : "") +
        '<span class="dc-wallet">Set it as the default card in ' + esc(walletOf(S.who)) + ".</span></div></div>" +
        (foot ? '<p class="dc-foot">' + esc(foot) + "</p>" : "") +
      "</div>";
  }

  function quickHtml() {
    const list = quickList();
    S.quickList = list;
    const amount = parseAmt(S.ask.amount);
    const rows = list.map((q, i) => {
      const r = E.recommend({ payer: S.who, date: S.today, catId: q.cat, amount, flags: q.flags || {} }, S.status.state, S.cfg);
      if (!r) return "";
      return '<button type="button" class="quick-row" data-quick="' + i + '"><span class="q-label">' + esc(q.label) + "</span>" + cardPill(r.pick.id, shortCard(r.pick.id)) + '<span class="q-rate">' + esc(r.pick.fare != null ? "HK$" + r.pick.fare.toFixed(2) : (r.pick.id === "cash" ? "cash" : money(backOf(r.pick.net, amount)))) + "</span></button>";
    }).join("");
    return defaultHtml() +
      '<div class="section-h"><span>Right now' + esc(forWho(" for ")) + (S.ask.abroad ? " in " + esc(countryLabel()) : "") + '</span><span class="mono">' + esc(amount ? "back on " + E.hkd(amount) : "back per HK$100") + "</span></div>" +
      '<div class="quick">' + rows + "</div>" +
      (SOLO
        ? '<p class="hint">Type the shop, restaurant or website above for a precise answer, and the amount for the HK$ back. After fees. Not sure? Tap ' + esc(askLabel()) + " on the answer.</p>"
        : '<p class="hint">Type a shop, restaurant or website above for a precise answer, and the amount for the HK$ back. After fees.</p>');
  }

  function suggestionsHtml(matches, sel) {
    const list = matches.filter((m) => !sel || m.name !== sel.name).slice(0, 5);
    if (!list.length) return "";
    return '<div class="chips">' + list.map((m) => '<button type="button" class="chip" data-match="' + esc(m.name) + '">' + esc(m.name) + "<small>" + esc(CAT_SHORT[m.cat] || E.CATS[m.cat].label) + "</small></button>").join("") + "</div>";
  }

  function unknownHtml(text) {
    const A = S.ask;
    const lead = A.matches.length ? "Or pick the kind of place:" : "“" + text + "” isn't in the list yet. Pick the kind of place:";
    let claude = "";
    if (S.sample) {
      claude = '<div class="actions"><button type="button" class="btn" data-act="ask-claude"' + (A.claude.busy ? " disabled" : "") + ">" +
        (A.claude.busy ? "Asking Claude…" : "Ask Claude what “" + esc(text) + "” is") + "</button></div>";
    }
    if (SOLO) claude = '<div class="actions"><button type="button" class="btn" data-act="ask-help">Not sure? ' + esc(askLabel()) + "</button></div>";
    return '<div class="result"><p class="hint">' + esc(lead) + '</p><div class="chips">' +
      PICK_CATS.map((c) => '<button type="button" class="chip" data-cat="' + c + '">' + esc(CAT_SHORT[c]) + "</button>").join("") + "</div>" +
      claude + (A.claude.msg ? '<p class="callout warn">' + esc(A.claude.msg) + "</p>" : "") + "</div>";
  }

  // The card to pull out, with what it gives back in HK$ (big) and a word on it (small).
  function cardFace(id, payer, big, small) {
    const c = E.CARDS[id];
    let holder = "";
    if (c.kind === "cash") holder = "local currency";
    else if (c.holder === payer) holder = SOLO ? "" : nameOf(payer);
    else if (c.supp === payer) holder = SOLO || !nameOf(payer) ? "extra card" : nameOf(payer) + " · extra card";
    else if (c.holder) holder = nameOf(c.holder);
    const m = /^(−?)HK\$(.*)$/.exec(big);
    const bigHtml = m ? esc(m[1]) + "<small>HK$</small>" + esc(m[2]) : esc(big);
    const img = cardImg(id);
    const art = img
      ? '<img class="cp-img ' + img.shape + '" src="' + img.src + '" alt="' + esc(cardLabel(id)) + ' card" width="' + img.w + '" height="' + img.h + '">'
      : '<div class="cp-mini ' + tone(id) + '" aria-hidden="true"><span class="cp-mini-bank">' + esc(c.kind === "cash" ? "Pay with" : c.bank) + "</span>" +
        (c.kind === "cash" ? "<span></span>" : '<span class="cf-chip"></span>') + '<span class="cp-mini-name">' + esc(c.name) + "</span></div>";
    const label = (c.kind === "cash" ? "Cash" : E.cardName(id)) + (holder ? " · " + holder : "");
    return '<div class="cardpic">' + art +
      '<div class="cp-info"><span class="cp-label">' + esc(label) + '</span><span class="cp-rate fare">' + bigHtml + '</span><span class="cp-back">' + esc(small) + "</span></div></div>";
  }
  // A card's result in words: [big, small], e.g. ["HK$120", "back"], ["HK$4", "back per HK$100"], ["HK$2.30", "a ride"].
  function cardBack(o, cat, amount) {
    if (o.fare != null) return ["HK$" + o.fare.toFixed(2), o.fare < cat.fare ? "a ride, instead of HK$" + cat.fare.toFixed(2) : "a ride, full fare"];
    if (o.id === "cash") return ["Cash", "no card fees"];
    const v = backOf(o.net, amount);
    const per = amount ? "" : " per HK$100";
    if (Math.abs(v) < 0.005) return ["HK$0", "back" + per];
    return v > 0 ? [money(v), "back" + per] : [money(v), "net cost" + per + ": the fees are bigger than the rewards"];
  }

  // The answer, in the order to act: points or miles to use, the HeyMax link, then the card.
  function resultHtml(sel) {
    const A = S.ask;
    const catId = effectiveCat(sel);
    const amount = parseAmt(A.amount);
    const rec = E.recommend({ payer: S.who, date: S.today, catId, amount, flags: askFlags(sel) }, S.status.state, S.cfg);
    if (!rec) return '<p class="empty">No card is available' + esc(forWho(" for ")) + " here.</p>";
    const p = rec.pick;
    const cat = E.CATS[catId];
    const mode = rec.mode === "welcome" ? '<span class="mode-tag">Welcome bonus first</span>' : (rec.mode === "hsmonth" ? '<span class="mode-tag hs">Hang Seng month</span>' : "");
    const src = (sel.label ? sel.label + " · " : "") + cat.label + (sel.source === "claude" ? " · identified by Claude" : (sel.source === "user" ? " · saved in your list" : ""));
    // Notes that change what to do stay in view; the rest goes under "Why this card".
    let notes = rec.notes.map((t) => ({ t, hot: /^(Welcome bonus first|You are behind)/.test(t) }));
    if (sel.source === "claude" && sel.confidence < 0.5) notes.unshift({ t: "Claude isn't sure what this place is. Check the kind of place below if the advice looks wrong.", hot: true });
    if (SOLO) {
      // No spending data here: drop the progress figures and keep the rule.
      notes = notes.filter((n) => !/^(Welcome bonus|You are behind)/.test(n.t));
      const w = rec.welcome;
      if (w) notes.unshift({ t: "Welcome bonus running: " + cardLabel(w.id) + " needs " + E.hkd(w.target) + " of spending by " + E.dayLabel(w.end) + "." + (rec.mode === "welcome" ? " Use it here." : " Here another card gives clearly more back."), hot: rec.mode === "welcome" });
      if (p.cap && E.CARDS[p.id].kind === "red") notes.push({ t: "The Red gives this on the first " + E.hkd(p.cap.of) + (cat.red8 ? " at its partner shops" : " spent online") + " each month, then much less. Already spent that much this month? Tap " + askLabel() + ".", hot: true });
    }
    const hasKind = (kind) => Object.keys(E.CARDS).some((id) => E.CARDS[id].kind === kind && E.usableBy(id, S.who, S.cfg, S.today));
    const promos = E.promosFor(sel.name, p.id, S.extraPromos).filter((x) => !x.until || x.until >= S.today);
    const promoLine = (x) => '<p class="promo"><b>' + (x.tip ? "Tip:" : "Offer:") + "</b> " + esc(x.text) + (x.until ? ' <span class="muted">Until ' + esc(E.dayLabel(x.until)) + ".</span>" : "") + "</p>";
    const usefulPromos = promos.filter((x) => x.tip || !x.card || hasKind(x.card));
    const otherPromos = promos.filter((x) => !(x.tip || !x.card || hasKind(x.card)));

    // Steps before the card: what can be used here (one step, each option a line), then HeyMax.
    const steps = [];
    const uses = pointsSteps(sel, amount);
    const fly = flyStep(sel, amount);
    if (fly && fly.step) uses.push(fly.step);
    if (uses.length === 1) steps.push(uses[0]);
    else if (uses.length > 1) steps.push('<p class="step-h">Points and miles you can use here</p><ul class="uses">' + uses.map((u) => "<li>" + u + "</li>").join("") + "</ul>");
    const hm = heymaxStep(sel, amount);
    if (hm) steps.push(hm.html);

    // The card, and a backup in case it isn't accepted.
    const [big, small] = cardBack(p, cat, amount);
    // Rent goes by FPS to Rently: no card to fall back on there.
    const backup = p.id === "fps" ? null : rec.alts.find((o) => o.id !== "cash" && E.CARDS[o.id] && E.CARDS[o.id].net !== E.CARDS[p.id].net) || rec.alts.find((o) => o.id !== "cash");
    const bk = backup ? cardBack(backup, cat, amount) : null;
    const scan = E.programsAt(sel.name).filter((id) => id === "moneyback" || id === "yuu").map((id) => E.PROGRAMS[id].name);
    const cardStep = (steps.length ? '<p class="step-h">Pay with</p>' : "") +
      cardFace(p.id, S.who, big, small) +
      (scan.length ? '<p class="hint">Scan ' + esc(scan.join(" and ")) + " at the till too.</p>" : "") +
      (backup && p.id !== "cash" ? '<p class="backup">Not accepted? ' + cardPill(backup.id, shortCard(backup.id)) + " " + esc(bk[0] === "Cash" ? "cash" : bk[0] + " " + bk[1].split(":")[0]) + "</p>" : "");
    // In all: the card, HeyMax and what the booking itself earns (Trip Coins), once the amount is known.
    const earned = E.earnAt(sel.name, amount, tripKind(sel));
    const earnedValue = earned.reduce((s, x) => s + x.value, 0);
    const hmValue = hm && hm.value > 0 ? hm.value : 0;
    const total = amount && p.net > 0 && (hmValue || earnedValue)
      ? '<p class="total">In all: about <b>' + esc(money(hmValue + earnedValue + p.net * amount)) + "</b> back" +
        esc(earned.map((x) => ", with " + money(x.value) + " in " + E.PROGRAMS[x.program].useName).join("")) + ".</p>" : "";
    const flyNote = fly && fly.note ? '<p class="hint">' + esc(fly.note) + "</p>" : "";
    const tripQ = MAYBE_FLIGHT.includes(sel.name) && !(sel.flags && sel.flags.flight)
      ? '<div class="trip-kind" role="group" aria-label="What are you buying?"><span>This is</span>' +
        '<button type="button" class="chip" data-trip="flight" aria-pressed="' + (A.trip === "flight") + '">a flight</button>' +
        '<button type="button" class="chip" data-trip="other" aria-pressed="' + (A.trip === "other") + '">a hotel or something else</button></div>' : "";

    // Details: the reasons in figures, every card, offers for cards not active yet.
    const all = [p].concat(rec.alts).map((o) => { const b = cardBack(o, cat, amount); return '<div class="alt">' + cardPill(o.id, cardLabel(o.id)) + '<span></span><span class="alt-rate">' + esc(b[0]) + '</span><span class="alt-why">' + esc(o.why[0] || "") + "</span></div>"; }).join("");
    const details = '<details class="why-more"><summary>Why this card</summary>' +
      '<ul class="why">' + p.why.map((w) => "<li>" + esc(w) + "</li>").join("") + "</ul>" +
      notes.filter((n) => !n.hot).map((n) => '<p class="hint">' + esc(n.t) + "</p>").join("") +
      otherPromos.map(promoLine).join("") +
      '<div class="section-h"><span>Every card here</span><span class="mono">' + esc(amount ? "on " + E.hkd(amount) : "per HK$100") + '</span></div><div class="alts">' + all + "</div></details>";

    // Everyday expenses come in from the bank's emails. A plane ticket is logged on the spot, so Status can follow
    // what FlyAnywhere pays back within 31 days of booking.
    let actions = "";
    if (SOLO) actions = '<div class="actions"><button type="button" class="btn" data-act="ask-help">' + esc(askLabel()) + "</button></div>";
    else if (canWrite() && tripKind(sel) === "flight") {
      actions = '<p class="hint">Log the ticket now: Status then follows its FlyAnywhere claim (31 days).</p>' + (p.id === "cash"
        ? '<div class="actions"><button type="button" class="btn" data-act="log-other">Log the ticket</button></div>'
        : '<div class="actions"><button type="button" class="btn primary" data-act="log-pick" data-card="' + p.id + '">Paid with ' + esc(shortCard(p.id)) + '</button><button type="button" class="btn" data-act="log-other">Paid another way</button></div>');
    }
    const hot = notes.filter((n) => n.hot);
    return '<div class="result">' +
      '<div class="result-for"><h2>' + esc(sel.name) + '</h2><span class="muted">' + esc(src) + "</span>" + mode + "</div>" +
      tripQ +
      (steps.length ? '<ol class="steps">' + steps.map((h) => '<li class="step">' + h + "</li>").join("") + '<li class="step">' + cardStep + "</li></ol>" : cardStep) +
      total + flyNote +
      (hot.length ? '<ul class="notes">' + hot.map((n) => '<li class="n-hot">' + esc(n.t) + "</li>").join("") + "</ul>" : "") +
      netFeeHtml(sel, catId, amount) +
      usefulPromos.map(promoLine).join("") +
      actions + details +
      (sel.source !== "quick" ? fixHtml(sel) : "") +
      '<div><button type="button" class="linkish" data-act="clear-ask">Start again</button></div>' +
      "</div>";
  }

  // Online, some sites (flight agencies) add a fee that depends on the card network. The person types the fees shown
  // on the payment page; the answer then compares the cards with them, and says how much extra the Mastercard can absorb.
  function netFeeHtml(sel, catId, amount) {
    const cat = E.CATS[catId];
    if (!cat || !cat.online || cat.wallet) return "";
    const nf = S.ask.netFee;
    const entered = parseAmt(nf.mastercard) > 0 || parseAmt(nf.visa) > 0;
    const flagged = !!(sel.flags && sel.flags.netFees);
    const g = E.networkGap({ payer: S.who, date: S.today, catId, amount, flags: sel.flags || {} }, S.status.state, S.cfg);
    let even = "";
    const extra = parseAmt(nf.mastercard) - parseAmt(nf.visa);
    if (g && g.gap > 0 && entered && amount) {
      const room = g.gap * amount;
      even = extra > room
        ? "With these fees the " + shortCard(g.visa) + " (Visa) wins: Mastercard costs " + E.hkd(extra) + " more, and the " + shortCard(g.mc) + " can only make up " + E.hkd(room) + "."
        : "With these fees the " + shortCard(g.mc) + " still wins: " + (extra > 0 ? "Mastercard costs " + E.hkd(extra) + " more, and the " + shortCard(g.mc) + " gives up to " + E.hkd(room) + " more than the " + shortCard(g.visa) + "." : "the fees don't favour Visa.");
    } else if (g && g.gap > 0) {
      even = "The " + shortCard(g.mc) + " stays the better card unless the site charges Mastercard more than " + (amount ? E.hkd(g.gap * amount) + " extra on " + E.hkd(amount) : money(g.gap * 100) + " extra per HK$100") + ", compared with Visa.";
    } else if (g) even = "The " + shortCard(g.visa) + " (Visa) is already the better card here.";
    return '<details class="netfee"' + (flagged || entered ? " open" : "") + "><summary>" + (flagged ? "Card fee at checkout" : "Different fee for Mastercard and Visa?") + "</summary>" +
      '<p class="hint">' + (flagged ? "This site often adds a fee that depends on the card, usually more for Mastercard. Enter the fees its payment page shows." : "If the payment page shows a different fee for each card, enter them here.") + "</p>" +
      '<div class="form nf-form"><div class="two"><label for="nf-mc">Mastercard fee (HK$)<input id="nf-mc" inputmode="decimal" enterkeyhint="done" placeholder="0" value="' + esc(nf.mastercard) + '"></label>' +
      '<label for="nf-visa">Visa fee (HK$)<input id="nf-visa" inputmode="decimal" enterkeyhint="done" placeholder="0" value="' + esc(nf.visa) + '"></label></div></div>' +
      (entered && !amount ? '<p class="hint">Add the amount at the top to compare the cards with these fees.</p>' : "") +
      (even ? '<p class="nf-even">' + esc(even) + "</p>" : "") + "</details>";
  }

  function fixHtml(sel) {
    const opts = Object.keys(E.CATS).filter((k) => E.CATS[k].group !== "abroad" || k === "red8_abroad")
      .map((k) => '<option value="' + k + '"' + (k === sel.cat ? " selected" : "") + ">" + esc(E.CATS[k].label) + "</option>").join("");
    return '<details class="fix"><summary>Wrong kind of place?</summary><label class="sr" for="fixCat">Kind of place</label><select id="fixCat">' + opts + "</select></details>";
  }

  /* ---------- Claude look-up for places not in the list ---------- */
  function hash(s) { let h = 5381; for (const ch of String(s)) h = ((h << 5) + h + ch.codePointAt(0)) >>> 0; return h.toString(36); }
  function slug(name) { const n = E.norm(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60); return n || "m-" + hash(name); }
  async function saveLearned(name, cat, flags, label, source) {
    if (SOLO && name) {
      // Corrections made on the solo page stay on that phone.
      const key = slug(name);
      const list = S.learned.filter((m) => slug(m.name) !== key);
      list.unshift({ name, category: cat, flags: flags || {}, label: label || "", source });
      S.learned = list.slice(0, 200);
      store.set("learned", S.learned);
      return;
    }
    if (!canWrite() || !name) return;
    try {
      await S.db.doc("merchants/" + slug(name)).set({ name, category: cat, flags: flags || {}, label: label || "", source, savedAt: nowIso(), savedBy: S.uid || null });
    } catch (e) { /* the advice still works without saving */ }
  }
  function sampleError(code) {
    switch (code) {
      case "not_granted": case "sampling_disabled": case "not_declared": case "capability_disabled": case "capability_removed":
        S.sample = null;
        return "Claude isn't available on this page for you. Pick the kind of place instead.";
      case "rate_limited": return "Claude is busy for you right now. Pick the kind of place instead, or try again in a minute.";
      case "session_expired": return "Sign in to Claude again, then try once more.";
      case "cancelled": return "";
      default: return "Claude couldn't identify it. Pick the kind of place instead.";
    }
  }
  async function askClaude() {
    const A = S.ask;
    const name = A.text.trim();
    if (!S.sample || !name || A.claude.busy) return;
    A.claude = { busy: true, msg: "" };
    renderAskBody();
    const where = A.abroad ? "The person is abroad, in " + countryLabel() + "." : "The person is in Hong Kong.";
    const prompt = [
      "Classify a place where someone is about to pay by card, for a Hong Kong credit-card rewards app.",
      "Name they typed: " + JSON.stringify(name),
      where,
      'Reply with only a JSON object: {"category": string, "label": string, "flight": boolean, "confidence": number}.',
      "category must be exactly one of:",
      "dining = restaurant, café, bar, bakery or food stall, not inside a hotel",
      "dining_hotel = restaurant or bar inside a hotel",
      "hotel_hk = paying for a hotel stay",
      "grocery = supermarket or convenience store",
      "retail = any other shop paid in person",
      "taxi = taxi paid in the car",
      "online_hk = website or app of a Hong Kong company",
      "online_fx_hkd = website or app of an overseas company that charges Hong Kong dollars (airlines, Booking.com, Agoda, Uber, Netflix)",
      "online_fx = website charging in a foreign currency",
      "wallet_buy = buying from a shop or app through AlipayHK, WeChat Pay or PayMe (Pinduoduo, for example)",
      "ewallet = topping up PayMe, AlipayHK or WeChat Pay",
      "octopus = topping up an Octopus card",
      "bills = utilities, tax, insurance or government payments",
      "telecom = mobile phone, broadband or pay-TV bill",
      "label = what the place is, at most 6 words, in English. flight = true when it sells plane tickets. confidence = 0 to 1.",
      "If you do not recognise the name, guess from its words and give a confidence below 0.5.",
    ].join("\n");
    let msg = "";
    try {
      const out = await S.sample.json(prompt, { modelTier: "quick" });
      const cat = out && typeof out.category === "string" ? out.category : "";
      if (!CLAUDE_CATS.includes(cat)) throw { code: "invalid_json" };
      if (A.text.trim() === name) {
        const flags = { flight: !!out.flight };
        const label = String(out.label || "").slice(0, 60);
        A.sel = { name, cat, flags, source: "claude", label, confidence: Number(out.confidence) || 0 };
        saveLearned(name, cat, flags, label, "claude");
      }
    } catch (e) {
      msg = sampleError(e && e.code);
    }
    A.claude = { busy: false, msg };
    renderAskBody();
  }

  /* ---------- logging a purchase ---------- */
  async function writeTxn(id, doc) {
    if (!canWrite()) { toast(S.readOnly ? "You can't save changes here." : "Open this page in Claude, signed in, to save."); return false; }
    try {
      if (id) await S.db.doc("txns/" + id).set(doc);
      else await S.db.collection("txns").add(doc);
      return true;
    } catch (e) { writeError(e); return false; }
  }
  function writeError(e) {
    const code = e && e.code;
    if (code === "invalid_argument") { S.readOnly = true; renderBanner(); renderTabs(); toast("You can't save changes here. The page's owner can give you Editor access."); }
    else if (code === "quota_exceeded") toast("The shared store is full. Delete old expenses to add new ones.");
    else toast("Couldn't save. Check your connection and try again.");
  }
  function tipFor(doc) {
    const st = S.status.state;
    const rec = E.recommend({ payer: doc.payer, date: doc.date, catId: doc.category, amount: doc.amount, flags: doc.flags || {} }, st, S.cfg);
    if (!rec || rec.pick.id === doc.card || rec.pick.id === "cash" || ["cash", "fps", "citiplus"].includes(doc.card)) return "";
    const actual = E.rateFor(doc.card, doc.category, { payer: doc.payer, date: doc.date, amount: doc.amount, flags: doc.flags || {}, cfg: S.cfg, st, assumeHs: rec.assumeHs });
    const loss = (rec.pick.net - actual.net) * doc.amount;
    if (loss < 5 && rec.mode !== "welcome") return "";
    return " Next time: " + shortWithHolder(rec.pick.id) + (rec.mode === "welcome" ? " (welcome bonus)." : " (" + E.pct(rec.pick.net) + ").");
  }
  async function logPick(cardId) {
    const A = S.ask, sel = A.sel;
    if (!sel) return;
    const amount = parseAmt(A.amount);
    const generic = sel.source === "quick";
    const preset = { date: S.today, merchant: generic ? "" : sel.name, amount: amount || "", payer: S.who, card: cardId || "", category: effectiveCat(sel), flags: Object.assign({ flight: !!askFlags(sel).flight, moneyback: !!(sel.flags && sel.flags.moneyback) }, netFeeFlags()) };
    if (!amount || !cardId || generic) { openTxnSheet(null, preset); return; }
    const doc = Object.assign({}, preset, { amount, claimed: false, claimedMiles: 0, note: "", source: "manual", ack: false, createdAt: nowIso(), createdBy: S.uid || null, updatedAt: nowIso() });
    if (await writeTxn(null, doc)) toast("Saved: " + E.hkd(amount) + " on " + cardLabel(cardId) + ".");
  }

  /* ---------- Status ---------- */
  const LEVEL = { bad: 0, warn: 1, info: 2 };
  const whoLabel = (w) => (w === "both" ? [nameOf("a"), nameOf("b")].filter(Boolean).join(" and ") || "Both" : nameOf(w));
  // To-dos due within three days join the alerts, so the urgent ones sit at the top of Status.
  function todoAlerts() {
    const soon = E.addDays(S.today, 3);
    return S.todos.filter((t) => !t.done && t.due && t.due <= soon).map((t) => ({
      level: t.due < S.today ? "bad" : "warn", kind: "todo", id: t.id, text: t.title,
      sub: [t.due < S.today ? "Overdue since " + E.dayLabel(t.due) : (t.due === S.today ? "Due today" : "Due " + E.dayLabel(t.due)), whoLabel(t.who), t.detail || ""].filter(Boolean).join(" · "),
      due: t.due, order: t.order || 0,
    }));
  }
  // A nudge on the main page when someone's default card changes (or is about to), so the phone wallets follow.
  function defaultAlerts() {
    if (SOLO || !S.status) return [];
    const out = [];
    const prevDay = E.addDays(S.today, -2);
    const prevSt = E.audit(S.txns.filter((t) => String(t.date) <= prevDay), S.cfg).state;
    for (const p of ["a", "b"]) {
      const now = E.defaultCard(p, S.today, S.status.state, S.cfg);
      if (!now) continue;
      const before = E.defaultCard(p, prevDay, prevSt, S.cfg);
      const whose = nameOf(p) ? nameOf(p) + "'s default card" : "Default card";
      if (before && before.id !== now.id) {
        out.push({ level: "warn", kind: "default", text: whose + " is now the " + cardName(now.id), sub: (p === "a" || !nameOf(p) ? "Set it as the default in " : nameOf(p) + " sets it as the default in ") + walletOf(p) + "." });
      } else if (now.next && E.addDays(S.today, 2) >= now.next.from) {
        out.push({ level: "info", kind: "default", text: whose + " changes on " + E.dayLabel(now.next.from) + ": " + cardName(now.next.id), sub: "Change it in " + walletOf(p) + " that day." });
      }
    }
    return out;
  }
  function allAlerts() {
    if (!S.status) return [];
    // Until the expenses have loaded, the rent looks unpaid: no rent alert before then.
    const fromStatus = S.txLoaded ? S.status.alerts : S.status.alerts.filter((a) => a.kind !== "rent");
    return todoAlerts().concat(S.defAlerts || [], fromStatus, pointAlerts()).map((a, i) => ({ a, i }))
      .sort((x, y) => (LEVEL[x.a.level] - LEVEL[y.a.level]) || (x.a.kind === "todo" && y.a.kind === "todo" ? String(x.a.due).localeCompare(String(y.a.due)) || x.a.order - y.a.order : x.i - y.i))
      .map((x) => x.a);
  }
  function alertHtml(a) {
    let act = "";
    if (a.kind === "todo") act = canWrite() ? '<div class="a-act"><button type="button" class="btn small" data-act="todo-done" data-id="' + esc(a.id) + '">Done</button></div>' : "";
    else if (a.kind === "txn") act = '<div class="a-act"><button type="button" class="btn small" data-act="open-tx" data-id="' + esc(a.id) + '">Details</button>' + (canWrite() ? '<button type="button" class="btn small" data-act="ack" data-id="' + esc(a.id) + '">Got it</button>' : "") + "</div>";
    else if (a.kind === "flight") act = '<div class="a-act"><button type="button" class="btn small" data-act="open-tx" data-id="' + esc(a.id) + '">Mark as claimed</button></div>';
    else if (a.kind === "card") act = '<div class="a-act"><button type="button" class="btn small" data-act="settings">Update cards</button></div>';
    else if (a.kind === "rent" && canWrite()) act = '<div class="a-act"><button type="button" class="btn small" data-act="log-rent">Log the payment</button></div>';
    else if (a.kind === "points" && a.on && canWrite()) act = '<div class="a-act"><button type="button" class="btn small" data-act="pt-seen" data-id="' + esc(a.id) + '" data-on="' + esc(a.on) + '">Got it</button></div>';
    return '<div class="alert ' + a.level + '"><span class="dot" aria-hidden="true"></span><div>' + esc(a.text) + '</div><div class="a-sub">' + esc(a.sub || "") + "</div>" + act + "</div>";
  }
  // Thresholds: what is left to spend to unlock the reward, and by when. Caps: what can still earn the bonus rate,
  // and what the spending so far has earned at that rate.
  function meterHtml(m) {
    const p = Math.max(0, Math.min(100, (m.used / m.cap) * 100));
    const stat = (v, k, cls) => '<div class="m-stat' + (cls ? " " + cls : "") + '"><b>' + esc(v) + "</b><span>" + esc(k) + "</span></div>";
    const cents = (x) => E.hkd(x, x > 0 && x < 100 ? 2 : 0);
    let a, b, foot;
    if (m.kind === "threshold") {
      if (m.reached) a = stat("Reached", "spent " + E.hkd(m.used), "good");
      else if (m.closed) a = stat(E.hkd(m.left), "short when it closed", "bad");
      else a = stat(E.hkd(m.left), "left to spend", m.state === "warn" ? "warn" : "");
      if (m.reached && m.collectedOf) b = stat(cents(m.collected), "collected of " + E.hkd(m.collectedOf), "good");
      else if (m.closed) b = stat(E.dayLabel(m.deadline), "closed");
      else b = stat(E.dayLabel(m.deadline), m.reached ? "deadline" : (m.daysLeft === 1 ? "last day" : m.daysLeft + " days left"));
      foot = (m.reached ? "Unlocked: " : "Unlocks ") + m.unlocks + ".";
    } else {
      a = m.left > 0 ? stat(E.hkd(m.left), "left at " + E.pct(m.rate)) : stat("Cap reached", E.pct(m.after) + " from now on", "warn");
      b = stat(cents(m.collected), "collected at " + E.pct(m.rate), m.collected > 0 ? "good" : "");
      foot = "Over " + E.hkd(m.cap) + ", " + E.pct(m.after) + ". Starts again on " + E.dayLabel(m.resets) + (m.resets.slice(0, 4) !== S.today.slice(0, 4) ? " " + m.resets.slice(0, 4) : "") + ".";
    }
    return '<div class="meter ' + esc(m.kind || "") + '"><div class="m-head"><span class="m-title">' + esc(m.title) + "</span>" + cardPill(m.card, shortWithHolder(m.card)) + "</div>" +
      '<div class="m-stats">' + a + b + "</div>" +
      '<div class="bar ' + tone(m.card) + '" role="progressbar" aria-valuemin="0" aria-valuemax="' + m.cap + '" aria-valuenow="' + Math.round(m.used) + '" aria-label="' + esc(m.title) + '"><span style="width:' + p.toFixed(1) + '%"></span></div>' +
      '<div class="m-nums">' + esc(E.hkd(m.used)) + " of " + esc(E.hkd(m.cap)) + " spent</div>" +
      '<div class="m-detail">' + esc(foot) + "</div></div>";
  }
  // Below the actions, one line per block, the details on tap: the Reds' caps, thresholds (Travel Guru, welcome
  // bonuses, the Hang Seng month), Red Hot, Max Miles, rent, points, cards. Open blocks stay open when the page redraws.
  function glanceHtml(s, wasOpen) {
    const rows = [];
    const head = (h, line, sub, toneCls) => '<span class="gl-h">' + h + '</span><span class="gl-l' + (toneCls ? " " + toneCls : "") + '">' + esc(line) + "</span>" +
      (sub ? '<span class="gl-s">' + esc(sub) + "</span>" : "");
    const row = (key, h, line, sub, body, toneCls) => rows.push(body
      ? '<details class="gl" data-key="' + key + '"' + (wasOpen.has(key) ? " open" : "") + "><summary>" + head(h, line, sub, toneCls) + '</summary><div class="gl-body">' + body + "</div></details>"
      : '<div class="gl"><div class="gl-row">' + head(h, line, sub, toneCls) + "</div></div>");
    const pillOf = (id) => cardPill(id, shortWithHolder(id));
    // The partner's caps show once their spending is logged.
    const unusedB = (m) => (E.CARDS[m.card] || {}).holder === "b" && !(m.used > 0);
    const resets = (m) => E.dayLabel(m.resets) + (m.resets.slice(0, 4) !== S.today.slice(0, 4) ? " " + m.resets.slice(0, 4) : "");
    for (const id of ["red_a", "red_b"]) {
      const ms = s.meters.filter((m) => m.card === id && m.kind === "cap");
      if (!ms.length || ms.every(unusedB)) continue;
      const on = ms.find((m) => m.key === id + "_on"), r8 = ms.find((m) => m.key === id + "_r8");
      const line = on.left > 0 ? E.hkd(on.left) + " left at 4% online" : "4% online used up: 0.4% until " + resets(on);
      const sub = (r8.left > 0 ? E.hkd(r8.left) + " left at 8% in partner shops" : "8% partner cap used up") + " · starts again on " + resets(on);
      row("cap_" + id, pillOf(id), line, sub, ms.map(meterHtml).join(""), on.left > 0 ? "" : "warn");
    }
    for (const m of s.meters.filter((x) => x.kind === "threshold")) {
      // Travel Guru counts every HSBC card of that person, so it is named rather than shown as one card.
      const tg = m.key.startsWith("tg_");
      const title = tg ? m.title.replace(/^Travel Guru /, "") : m.title;
      const h = tg ? "<b>" + esc("Travel Guru" + (nameOf(m.key.slice(3)) ? " · " + nameOf(m.key.slice(3)) : "")) + "</b>" : pillOf(m.card);
      const line = m.reached ? title + ": reached" : (m.closed ? title + ": closed, " + E.hkd(m.left) + " short" : title + ": " + E.hkd(m.left) + " to spend" + (tg ? " in shops abroad" : "") + " by " + E.dayLabel(m.deadline));
      row("th_" + m.key, h, line, (m.reached ? "Unlocked: " : "Unlocks ") + m.unlocks + (tg ? ", on HSBC cards" : ""), meterHtml(m), m.reached ? "good" : (m.closed ? "bad" : (m.state === "warn" ? "warn" : "")));
    }
    for (const m of s.meters.filter((x) => x.key.startsWith("rh_"))) {
      if (unusedB(m)) continue;
      const cat = (S.cfg.redHot[m.key.slice(3)] || {}).cat;
      row("rh_" + m.card, pillOf(m.card), m.title + ": " + E.hkd(m.collected, m.collected < 100 ? 2 : 0) + " this year",
        "2.4% at " + (RH_WHERE[cat] || "its category") + ", up to " + E.hkd(m.cap) + " a year", meterHtml(m), "");
    }
    // Max Miles, with the plane tickets they may pay back. Claimable or claimed tickets stay a month after the
    // deadline; the ones the miles can't cover, until it.
    const mi = s.miles;
    const flights = s.flights.filter((f) => f.daysLeft >= (f.claimed || f.canClaim ? -31 : 0)).slice(0, 8);
    const flightsHtml = flights.length
      ? '<div class="list">' + flights.map((f) => '<div class="flight"><span>' + esc(f.merchant || "Flight") + ' <span class="muted">· ' + esc(shortWithHolder(f.card)) + '</span></span><span class="mono">' + esc(E.hkd(f.amount)) + '</span><span class="fl-sub">' + esc(flightState(f)) + '</span><span><button type="button" class="linkish" data-act="open-tx" data-id="' + esc(f.id) + '">Edit</button></span></div>').join("") + "</div>"
      : '<p class="hint">Plane tickets logged from the Which card tab show here, with what FlyAnywhere can pay back.</p>';
    row("miles", "<b>Max Miles</b>", fmtCount(mi.balance) + " ≈ " + money(mi.value) + (mi.pending ? " · " + fmtCount(mi.pending) + " on the way" : ""),
      "FlyAnywhere pays back a whole ticket up to " + money(mi.value) + (flights.length ? " · " + flights.length + (flights.length === 1 ? " ticket" : " tickets") + " followed" : ""), flightsHtml, "");
    // Rent through Rently.
    const rn = s.rently, rc = S.cfg.rently;
    const nextPay = (d) => { const y = Number(d.slice(0, 4)), mo = Number(d.slice(5, 7)); return (mo === 12 ? y + 1 : y) + "-" + pad(mo === 12 ? 1 : mo + 1) + d.slice(7); };
    row("rent", "<b>Rent via Rently</b>",
      rn.paidThisCycle ? "Paid for " + E.dayLabel(rn.nextDue) + " · next FPS by " + E.dayLabel(nextPay(rn.payBy)) : "Send the FPS by " + E.dayLabel(rn.payBy),
      (rn.promoLeft > 0 ? rn.promoLeft + " promo months left: " + fmtCount(rc.promoMiles) : fmtCount(rc.standardMiles)) + " Max Miles a month",
      !rn.paidThisCycle && canWrite() ? '<div><button type="button" class="btn small" data-act="log-rent">Log the payment</button></div>' : "", rn.paidThisCycle ? "" : "warn");
    // Points and miles.
    const pr = S.pointRows;
    if (pr.length) {
      const runs = pr.filter((r) => r.next && !r.next.voucher).sort((x, y) => (x.next.on < y.next.on ? -1 : 1));
      const first = runs[0];
      row("points", "<b>Points and miles</b>", pr.filter((r) => r.usable === true).length + " of " + pr.length + " usable now",
        first ? "Next to expire: " + first.name + ", " + E.runLabel(first, first.next) + " on " + E.dayLabel(first.next.on) : "", pointsListHtml(), "");
    }
    // Cards.
    const ids = ["red_a", "easy_a", "citi", "hs_a", "citiplus", "red_b", "easy_b", "hs_b"];
    const st = (id) => (S.cfg.cards[id] || {}).status;
    const names = (status) => Array.from(new Set(ids.filter((id) => st(id) === status).map((id) => E.cardName(id)))).join(", ");
    const cardsLine = [ids.filter((id) => st(id) === "active").length + " active", names("pending") ? names("pending") + " applied" : "", names("planned") ? names("planned") + " to apply" : ""].filter(Boolean).join(" · ");
    row("cards", "<b>Cards</b>", cardsLine, "", cardsBody(), "");
    return '<div class="section-h"><span>At a glance</span><span class="mono">' + esc(E.monthLabel(E.ym(S.today))) + "</span></div>" +
      '<div class="glance">' + rows.join("") + "</div>";
  }
  function cardsBody() {
    const cardIds = ["red_a", "easy_a", "citi", "hs_a", "citiplus", "red_b", "easy_b", "hs_b"];
    const lines = cardIds.map((id) => {
      const c = S.cfg.cards[id] || {};
      const on = c.status === "active";
      const date = c.since || c.approvedOn || c.issuedOn;
      let state = STATUS_LABEL[c.status] || "Unknown";
      if (on && date) state += " since " + E.dayLabel(date);
      if (id === "citi" && on) state += c.suppCard ? " · extra card for " + (nameOf("b") || "the partner") : " · no extra card yet";
      if ((id === "hs_a" || id === "hs_b") && on) state += c.funRegistered ? " · +FUN registered" : " · register for +FUN";
      return '<div class="card-line">' + cardPill(id, cardLabel(id)) + '<span class="cl-state' + (on ? " on" : "") + '">' + esc(state) + "</span></div>";
    }).join("");
    const rh = ["a", "b"].map((p) => (nameOf(p) || (p === "a" ? "Person A" : "Person B")) + ": " + (RH_LABEL[(S.cfg.redHot[p] || {}).cat || ""] || "—")).join(" · ");
    return '<div class="cards-list">' + lines + "</div>" +
      '<p class="hint">Red Hot Rewards 5X: ' + esc(rh) + ". Rates as checked in October 2026; the banks' terms decide in the end.</p>" +
      '<div><button type="button" class="btn small" data-act="settings">Edit cards and settings</button></div>';
  }
  function todoHtml(t) {
    const late = !t.done && t.due && t.due < S.today;
    const sub = [whoLabel(t.who), t.detail || ""].filter(Boolean).join(" · ");
    return '<li class="todo' + (t.done ? " done" : "") + '"><input type="checkbox" id="todo-' + esc(t.id) + '" data-todo="' + esc(t.id) + '"' + (t.done ? " checked" : "") + (canWrite() ? "" : " disabled") + ">" +
      '<label for="todo-' + esc(t.id) + '"><span class="t-title">' + esc(t.title) + "</span>" + (sub ? '<span class="t-who">' + esc(sub) + "</span>" : "") + "</label>" +
      '<span class="t-due' + (late ? " late" : "") + '">' + (t.due ? esc(E.dayLabel(t.due)) : "") + "</span></li>";
  }
  // FlyAnywhere pays back a whole ticket or nothing: say so rather than offer a claim the miles can't cover.
  function flightState(f) {
    if (f.claimed) return "Max Miles claimed" + (f.claimedMiles ? ": " + f.claimedMiles.toLocaleString("en-US") : "");
    if (f.daysLeft < 0) return "Claim window closed";
    if (f.claimFrom) return "HeyMax can pay it back once the rent's miles land: claim in FlyAnywhere between " + E.dayLabel(f.claimFrom) + " and " + E.dayLabel(f.deadline);
    if (!f.canClaim) return "Too dear for HeyMax FlyAnywhere: it pays whole tickets only, up to " + money(S.status.miles.balance * S.cfg.miles.rate) + " now";
    return "HeyMax can pay it back: claim in FlyAnywhere by " + E.dayLabel(f.deadline) + " (" + f.daysLeft + (f.daysLeft === 1 ? " day)" : " days)");
  }
  function renderStatus() {
    if (!S.status) return;
    if (S.dbState === "off") {
      $("#tab-status").innerHTML = '<p class="empty">The to-dos, caps and balances live in the shared store. Open this page in Claude, signed in, to see them.</p>';
      return;
    }
    const s = S.status;
    const alerts = allAlerts();
    const inAlerts = new Set(alerts.filter((a) => a.kind === "todo").map((a) => a.id));
    const byDue = (a, b) => String(a.due || "9999").localeCompare(String(b.due || "9999")) || ((a.order || 0) - (b.order || 0));
    const upcoming = S.todos.filter((t) => !t.done && !inAlerts.has(t.id)).sort(byDue);
    const done = S.todos.filter((t) => t.done).sort(byDue);
    const wasOpen = new Set(Array.from(document.querySelectorAll("#tab-status details[open]"), (d) => d.dataset.key));
    const more = (key, label, items) => '<details class="more" data-key="' + key + '"' + (wasOpen.has(key) ? " open" : "") + "><summary>" + esc(label) + '</summary><ul class="list">' + items.map(todoHtml).join("") + "</ul></details>";
    // The next three to-dos; the rest folded.
    const SHOW = 3;
    const todoBlock = (upcoming.length || done.length)
      ? '<div class="section-h"><span>Coming up</span><span class="mono">' + upcoming.length + " to do</span></div>" +
        (upcoming.length ? '<ul class="list">' + upcoming.slice(0, SHOW).map(todoHtml).join("") + "</ul>" : "") +
        (upcoming.length > SHOW ? more("later", (upcoming.length - SHOW) + " more", upcoming.slice(SHOW)) : "") +
        (done.length ? more("done", "Done (" + done.length + ")", done) : "")
      : "";
    $("#tab-status").innerHTML =
      '<div class="section-h"><span>Needs attention</span>' + (alerts.length ? '<span class="mono">' + alerts.length + "</span>" : "") + "</div>" +
      '<div class="alerts">' + (alerts.length ? alerts.map(alertHtml).join("") : '<p class="empty">Nothing needs attention. Wrong-card payments and deadlines will show up here.</p>') + "</div>" +
      todoBlock +
      glanceHtml(s, wasOpen);
  }

  /* ---------- Spending ---------- */
  // One expense: where, what kind, the amount and card, and what it gave back in HK$ (card rewards minus fees, plus
  // Max Miles at their FlyAnywhere value and shop points such as Trip Coins; airline miles are not counted).
  function txRow(t) {
    const a = S.status.audit[t.id];
    const flagged = !!(a && a.flagged && !t.ack);
    const cat = E.CATS[t.category];
    let flag = "";
    if (flagged) flag = '<span class="tx-flag">' + esc(a.why) + (a.loss >= 1 ? " · " + esc(E.hkd(a.loss)) + " missed" : "") + "</span>";
    else if (a && a.flagged && t.ack) flag = '<span class="tx-flag ok">Noted: ' + esc(a.why) + "</span>";
    else if (t.flags && t.flags.flight && !t.claimed) {
      const f = S.status.flights.find((x) => x.id === t.id);
      if (f && f.canClaim && f.daysLeft >= 0) flag = '<span class="tx-flag ok">' + esc(flightState(f)) + "</span>";
    }
    const amt = Number(t.amount) || 0;
    const back = a ? a.back : null;
    const backHtml = back != null && Math.abs(back) >= 0.5
      ? '<span class="tx-back ' + (back > 0 ? "pos" : "neg") + '">' + esc(back > 0 ? money(back) + " back" : money(-back) + " in fees") + "</span>" : "";
    return '<li><button type="button" class="tx' + (flagged ? " flagged" : "") + '" data-act="open-tx" data-id="' + esc(t.id) + '">' +
      '<span><span class="tx-merchant">' + esc(t.merchant || "Purchase") + '</span><br><span class="tx-sub">' + esc(cat ? cat.label : "") + "</span></span>" +
      '<span class="tx-right"><span class="mono">' + esc(E.hkd(amt, amt % 1 ? 2 : 0)) + "</span>" + cardPill(t.card, shortCard(t.card)) + backHtml + "</span>" +
      flag + "</button></li>";
  }
  // Totals for a list of expenses: spent (rent aside), back (rewards, Max Miles, shop points such as Trip Coins), fees, missed.
  function spendTotals(list) {
    const audit = S.status.audit;
    const r = { spent: 0, rewards: 0, miles: 0, rentMiles: 0, points: 0, pointsBy: {}, fees: 0, missed: 0, back: 0 };
    for (const t of list) {
      const amt = Number(t.amount) || 0;
      if (t.category !== "rent") r.spent += amt;
      const a = audit[t.id];
      if (!a) continue;
      r.rewards += a.rewards || 0; r.miles += a.miles || 0; r.points += a.points || 0; r.fees += a.fees || 0; r.back += a.back || 0;
      for (const k of Object.keys(a.pointsBy || {})) r.pointsBy[k] = (r.pointsBy[k] || 0) + a.pointsBy[k];
      if (t.category === "rent") r.rentMiles += a.miles || 0;
      if (a.flagged) r.missed += a.loss;
    }
    return r;
  }
  const joinAnd = (parts) => (parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts[0] || "");
  // What comes back besides the card: ["Max Miles", "Trip Coins"].
  const extraNames = (r) => (r.miles ? ["Max Miles"] : []).concat(Object.keys(r.pointsBy || {}).map((k) => E.PROGRAMS[k].useName || E.PROGRAMS[k].name));
  // "card rewards, Max Miles and Trip Coins": what the Back figure is made of.
  const backParts = (r) => joinAnd(["card rewards"].concat(extraNames(r)));
  // The Spending tab follows the person chosen at the top: what their cards (or their FPS) paid, whoever it was for,
  // with the totals, and one line for both.
  function renderSpend() {
    if (!S.status) return;
    const m = S.month;
    const inMonth = S.txns.filter((t) => E.ym(t.date || "") === m);
    const rows = inMonth.filter((t) => t.payer === S.who)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const me = spendTotals(rows), all = spendTotals(inMonth);
    const byCard = {};
    for (const t of rows) byCard[t.card] = (byCard[t.card] || 0) + (Number(t.amount) || 0);
    let list = "";
    let day = "";
    for (const t of rows) {
      if (t.date !== day) { day = t.date; list += '<li><h3 class="day-h">' + esc(E.dayLabel(day)) + "</h3></li>"; }
      list += txRow(t);
    }
    const who = nameOf(S.who);
    const chips = Object.keys(byCard).sort((a, b) => byCard[b] - byCard[a]).map((id) => cardPill(id, shortCard(id) + " · " + E.hkd(byCard[id]))).join("");
    const empty = S.dbState === "off"
      ? "Open this page in Claude, signed in, to see your shared spending."
      : (!S.txLoaded ? "Loading…" : "Nothing paid" + (who ? " by " + who : "") + " in " + E.monthLabel(m) + " yet. Ask Claude to import the bank emails in the Banking label, or tap Add expense.");
    const both = all.spent !== me.spent || all.back !== me.back
      ? '<p class="hint together">Together: ' + esc(E.hkd(all.spent)) + " spent, about " + esc(money(all.back)) + " back after fees.</p>" : "";
    $("#tab-spend").innerHTML =
      '<div class="month-nav"><button type="button" class="icon-btn" data-act="month" data-step="-1" aria-label="Previous month">‹</button><h2>' + esc((who ? "Paid by " + who + " · " : "") + E.monthLabel(m)) + '</h2><button type="button" class="icon-btn" data-act="month" data-step="1" aria-label="Next month">›</button></div>' +
      '<div class="facts"><div class="fact"><div class="f-k">Spent</div><div class="f-v">' + esc(E.hkd(me.spent)) + '</div><div class="f-s">rent not included</div></div>' +
      '<div class="fact"><div class="f-k">Back, about</div><div class="f-v">' + esc(E.hkd(me.rewards + me.miles + me.points)) + '</div><div class="f-s">' + esc(backParts(me)) + (me.rentMiles ? ", " + esc(E.hkd(me.rentMiles)) + " from the rent" : "") + "</div></div>" +
      '<div class="fact"><div class="f-k">Fees, about</div><div class="f-v">' + esc(E.hkd(me.fees)) + '</div><div class="f-s">foreign currency, overseas sites, Taobao</div></div>' +
      '<div class="fact"><div class="f-k">Missed</div><div class="f-v">' + esc(E.hkd(me.missed)) + '</div><div class="f-s">by using the wrong card</div></div></div>' +
      both +
      (chips ? '<div class="by-card">' + chips + "</div>" : "") +
      (rows.length ? '<ul class="list">' + list + "</ul>" : '<p class="empty">' + esc(empty) + "</p>");
  }
  function stepMonth(step) {
    const y = Number(S.month.slice(0, 4)), mo = Number(S.month.slice(5, 7)) + step;
    const d = new Date(Date.UTC(y, mo - 1, 1));
    S.month = d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1);
    renderSpend();
  }

  /* ---------- sheets ---------- */
  let lastFocus = null;
  function openSheet(title, html, onMount) {
    lastFocus = document.activeElement;
    $("#sheetTitle").textContent = title;
    $("#sheetBody").innerHTML = html;
    $("#sheet").hidden = false;
    document.body.style.overflow = "hidden";
    if (onMount) onMount($("#sheetBody"));
    // Focus the close button rather than a field, so phones don't pop the keyboard over the form.
    const f = $("#sheet .sheet-head .icon-btn");
    if (f) f.focus({ preventScroll: true });
  }
  function closeSheet() {
    $("#sheet").hidden = true;
    $("#sheetBody").innerHTML = "";
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function cardOptions(payer, current) {
    return E.CARD_ORDER.filter((id) => id === "cash" || id === "fps" || E.holds(id, payer, S.cfg) || id === current)
      .map((id) => '<option value="' + id + '"' + (id === current ? " selected" : "") + ">" + esc(cardLabel(id)) + (S.cfg.cards[id] && S.cfg.cards[id].status !== "active" ? " (not active)" : "") + "</option>").join("");
  }

  function openTxnSheet(t, preset) {
    const d = Object.assign({ date: S.today, merchant: "", amount: "", payer: S.who, card: "", category: "dining", flags: {}, note: "", claimed: false, claimedMiles: 0 }, t || preset || {});
    const a = t ? S.status.audit[t.id] : null;
    const catOpts = Object.keys(E.CATS).map((k) => '<option value="' + k + '"' + (k === d.category ? " selected" : "") + ">" + esc(E.CATS[k].label) + "</option>").join("");
    const ro = !canWrite();
    // Besides the card: Max Miles and shop points such as Trip Coins, in HK$.
    const extraV = a ? (a.miles || 0) + (a.points || 0) : 0;
    const extra = extraV >= 0.5 ? E.hkd(extraV, extraV < 20 ? 1 : 0) + " in " + joinAnd(extraNames(a)) : "";
    const html =
      (a && a.flagged ? '<p class="callout ' + (t.ack ? "warn" : "bad") + '">' + esc(a.why) + (a.loss >= 1 ? " (" + esc(E.hkd(a.loss)) + " missed)." : ".") + (extra ? " Back besides the card: " + esc(extra) + "." : "") + "</p>" : "") +
      (a && !a.flagged && a.earned > 0 ? '<p class="callout good">Good card: about ' + esc(E.hkd(a.earned, a.earned < 20 ? 1 : 0)) + " back (" + esc(E.pct(a.net)) + ")" + (extra ? ", plus " + esc(extra) : "") + ".</p>" : "") +
      (a && !a.flagged && a.earned < 0 ? '<p class="callout warn">Fees outweigh the rewards here: about ' + esc(E.hkd(-a.earned, 1)) + " net cost (" + esc(E.pct(a.net)) + ")." + (extra ? " Back besides the card: " + esc(extra) + "." : "") + "</p>" : "") +
      (a && !a.flagged && !a.earned && extra ? '<p class="callout good">About ' + esc(extra) + " back.</p>" : "") +
      '<form id="txForm" class="form" novalidate>' +
      '<div class="two"><label for="f-date">Date<input type="date" id="f-date" value="' + esc(d.date) + '" required></label>' +
      '<label for="f-amount">Amount (HK$)<input id="f-amount" enterkeyhint="done" inputmode="decimal" value="' + esc(d.amount) + '" placeholder="0" required></label></div>' +
      '<label for="f-merchant">Where<input id="f-merchant" enterkeyhint="done" value="' + esc(d.merchant) + '" placeholder="Shop, restaurant or website" autocomplete="off"></label>' +
      '<div class="two"><label for="f-payer">Who paid<select id="f-payer"><option value="a"' + (d.payer === "a" ? " selected" : "") + ">" + esc(nameOf("a") || "Person A") + '</option><option value="b"' + (d.payer === "b" ? " selected" : "") + ">" + esc(nameOf("b") || "Person B") + "</option></select></label>" +
      '<label for="f-card">Card<select id="f-card"><option value="">Choose…</option>' + cardOptions(d.payer, d.card) + "</select></label></div>" +
      '<label for="f-category">Kind of place<select id="f-category">' + catOpts + "</select></label>" +
      '<label class="check" for="f-moneyback"><input type="checkbox" id="f-moneyback"' + (d.flags && d.flags.moneyback ? " checked" : "") + "> MoneyBack shop (PARKnSHOP, Fortress, Watsons)</label>" +
      '<label class="check" for="f-flight"><input type="checkbox" id="f-flight"' + (d.flags && d.flags.flight ? " checked" : "") + "> Plane ticket: claim Max Miles within 31 days</label>" +
      '<fieldset id="f-claimBox"' + (d.flags && d.flags.flight ? "" : " hidden") + "><legend>Max Miles claim</legend>" +
      '<label class="check" for="f-claimed"><input type="checkbox" id="f-claimed"' + (d.claimed ? " checked" : "") + "> Claimed in FlyAnywhere</label>" +
      '<label for="f-claimedMiles">Max Miles used<input id="f-claimedMiles" enterkeyhint="done" inputmode="numeric" value="' + esc(d.claimedMiles || "") + '" placeholder="0"></label></fieldset>' +
      '<label for="f-note">Note<input id="f-note" enterkeyhint="done" value="' + esc(d.note) + '" autocomplete="off"></label>' +
      '<p class="hint" id="f-error" hidden></p>' +
      (ro ? '<p class="hint">You can view this expense but not change it.</p>' :
        '<div class="form-actions"><button type="submit" class="btn primary">Save</button>' +
        (t && a && a.flagged && !t.ack ? '<button type="button" class="btn" data-act="ack" data-id="' + esc(t.id) + '">Got it</button>' : "") +
        (t ? '<button type="button" class="btn danger" id="f-delete">Delete</button>' : "") + "</div>") +
      "</form>";
    openSheet(t ? "Expense" : "Add expense", html, (root) => {
      const form = $("#txForm", root);
      $("#f-payer", root).addEventListener("change", (ev) => { $("#f-card", root).innerHTML = '<option value="">Choose…</option>' + cardOptions(ev.target.value, ""); });
      $("#f-flight", root).addEventListener("change", (ev) => { $("#f-claimBox", root).hidden = !ev.target.checked; });
      form.addEventListener("submit", (ev) => { ev.preventDefault(); saveTxnForm(root, t, d.flags); });
      const del = $("#f-delete", root);
      if (del) del.addEventListener("click", async () => {
        if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; return; }
        if (!canWrite()) return;
        try { await S.db.doc("txns/" + t.id).delete(); closeSheet(); toast("Deleted."); } catch (e) { writeError(e); }
      });
    });
  }
  async function saveTxnForm(root, t, baseFlags) {
    const v = (id) => $("#" + id, root);
    const amount = parseAmt(v("f-amount").value);
    const date = v("f-date").value, card = v("f-card").value, category = v("f-category").value;
    const err = v("f-error");
    if (!date || !amount || !card || !category) { err.hidden = false; err.textContent = "Fill in the date, the amount and the card."; return; }
    // Fields the form doesn't show (what the purchase earned, the rent's miles, import details) are kept.
    const kept = {};
    if (t) for (const k of Object.keys(t)) if (k !== "id") kept[k] = t[k];
    const doc = Object.assign(kept, {
      date, merchant: v("f-merchant").value.trim(), amount, payer: v("f-payer").value, card, category,
      // Card fees entered at checkout are kept; the two ticks come from the form.
      flags: Object.assign(baseFlags && baseFlags.netFee ? { netFee: baseFlags.netFee } : {}, { flight: v("f-flight").checked, moneyback: v("f-moneyback").checked }),
      claimed: v("f-flight").checked && v("f-claimed").checked,
      claimedMiles: v("f-flight").checked ? (parseInt(String(v("f-claimedMiles").value).replace(/[^0-9]/g, ""), 10) || 0) : 0,
      note: v("f-note").value.trim(),
      source: t ? t.source || "manual" : "manual",
      ack: t ? !!t.ack : false,
      createdAt: t ? t.createdAt || nowIso() : nowIso(),
      createdBy: t ? t.createdBy || null : S.uid || null,
      updatedAt: nowIso(),
    });
    const tip = t ? "" : tipFor(doc);
    if (await writeTxn(t ? t.id : null, doc)) { closeSheet(); toast((t ? "Saved." : "Saved: " + E.hkd(amount) + ".") + tip); }
  }

  function openSettings() {
    const c = S.cfg;
    const statusSel = (id) => '<select id="s-' + id + '-status">' + ["active", "pending", "planned", "closed"].map((s) => '<option value="' + s + '"' + (c.cards[id].status === s ? " selected" : "") + ">" + esc(STATUS_LABEL[s]) + "</option>").join("") + "</select>";
    const rhSel = (p) => '<select id="s-rh-' + p + '">' + Object.keys(RH_LABEL).map((k) => '<option value="' + k + '"' + (((c.redHot[p] || {}).cat || "") === k ? " selected" : "") + ">" + esc(RH_LABEL[k]) + "</option>").join("") + "</select>";
    const ro = !canWrite();
    const html =
      '<form id="setForm" class="form" novalidate>' +
      (c.pageUrl ? '<fieldset><legend>' + esc(nameOf("b") ? nameOf("b") + "’s page" : "The partner’s page") + '</legend><p class="hint">Card advice only, no account needed. When a card changes here, tell Claude so it updates that page too.' +
        (c.sealCode ? " The link below opens its extras (Signal button, HeyMax links) by itself; on a phone where they are locked, enter the code " + "<b class=\"mono\">" + esc(c.sealCode) + "</b> under ⓘ." : "") + "</p>" +
        '<p class="mono copyable" id="pageUrl">' + esc(pageLink()) + '</p><div><button type="button" class="btn small" data-act="copy-page">Copy link</button></div></fieldset>' : "") +
      '<p class="hint">Dates start the welcome windows: the Citi bonus counts 30 days from approval, the Hang Seng bonus 60 days from the card\'s issue.</p>' +
      '<fieldset><legend>' + esc(cardLabel("red_b")) + '</legend><div class="two"><label for="s-red_b-status">Status' + statusSel("red_b") + '</label><label for="s-red_b-date">Active since<input type="date" id="s-red_b-date" value="' + esc(c.cards.red_b.since || "") + '"></label></div></fieldset>' +
      '<fieldset><legend>Citi Cash Back</legend><div class="two"><label for="s-citi-status">Status' + statusSel("citi") + '</label><label for="s-citi-date">Approved on<input type="date" id="s-citi-date" value="' + esc(c.cards.citi.approvedOn || "") + '"></label></div>' +
      '<label class="check" for="s-citi-supp"><input type="checkbox" id="s-citi-supp"' + (c.cards.citi.suppCard ? " checked" : "") + "> " + esc(nameOf("b") || "The partner") + " has the extra (supplementary) card</label></fieldset>" +
      '<fieldset><legend>' + esc(cardLabel("hs_a")) + '</legend><div class="two"><label for="s-hs_a-status">Status' + statusSel("hs_a") + '</label><label for="s-hs_a-date">Card issued on<input type="date" id="s-hs_a-date" value="' + esc(c.cards.hs_a.issuedOn || "") + '"></label></div>' +
      '<label class="check" for="s-hs_a-fun"><input type="checkbox" id="s-hs_a-fun"' + (c.cards.hs_a.funRegistered ? " checked" : "") + "> Registered for +FUN Dollars</label></fieldset>" +
      '<fieldset><legend>' + esc(cardLabel("hs_b")) + '</legend><div class="two"><label for="s-hs_b-status">Status' + statusSel("hs_b") + '</label><label for="s-hs_b-date">Card issued on<input type="date" id="s-hs_b-date" value="' + esc(c.cards.hs_b.issuedOn || "") + '"></label></div>' +
      '<label class="check" for="s-hs_b-fun"><input type="checkbox" id="s-hs_b-fun"' + (c.cards.hs_b.funRegistered ? " checked" : "") + "> Registered for +FUN Dollars</label></fieldset>" +
      '<fieldset><legend>Red Hot Rewards 5X (HSBC easy)</legend><label for="s-rh-a">' + esc(nameOf("a") || "Person A") + rhSel("a") + '</label><label for="s-rh-b">' + esc(nameOf("b") || "Person B") + rhSel("b") + "</label>" +
      '<label class="check" for="s-mb-a"><input type="checkbox" id="s-mb-a"' + (c.moneybackVip.a ? " checked" : "") + "> " + esc(nameOf("a") || "Person A") + " is a MoneyBack VIP</label>" +
      '<label class="check" for="s-mb-b"><input type="checkbox" id="s-mb-b"' + (c.moneybackVip.b ? " checked" : "") + "> " + esc(nameOf("b") || "Person B") + " is a MoneyBack VIP</label></fieldset>" +
      '<fieldset><legend>Planning</legend><div class="two"><label for="s-promoEnd">Hang Seng 5–7% promo ends<input type="date" id="s-promoEnd" value="' + esc(c.travelPlus.promoEnd) + '"></label>' +
      '<label for="s-daily">Everyday spending per day (HK$)<input id="s-daily" enterkeyhint="done" inputmode="numeric" value="' + esc(c.dailySpend) + '"></label></div>' +
      '<label class="check" for="s-monthMode"><input type="checkbox" id="s-monthMode"' + (c.travelPlus.monthMode !== false ? " checked" : "") + "> In promo months, put in-person spending on the Hang Seng to reach HK$6,000</label>" +
      '<label for="s-milesBase">Max Miles from other sources (MoneyHero, sign-up gifts)<input id="s-milesBase" enterkeyhint="done" inputmode="numeric" value="' + esc(c.miles.base || 0) + '"></label></fieldset>' +
      (ro ? '<p class="hint">Only people with Editor access can change these.</p>' : '<div class="form-actions"><button type="submit" class="btn primary">Save</button></div>') +
      "</form>";
    openSheet("Cards and settings", html, (root) => {
      $("#setForm", root).addEventListener("submit", (ev) => { ev.preventDefault(); saveSettings(root); });
    });
  }
  async function saveSettings(root) {
    if (!canWrite()) return;
    const v = (id) => $("#" + id, root);
    const cards = JSON.parse(JSON.stringify(S.cfg.cards));
    cards.red_b.status = v("s-red_b-status").value; cards.red_b.since = v("s-red_b-date").value || "";
    cards.citi.status = v("s-citi-status").value; cards.citi.approvedOn = v("s-citi-date").value || ""; cards.citi.suppCard = v("s-citi-supp").checked;
    for (const id of ["hs_a", "hs_b"]) { cards[id].status = v("s-" + id + "-status").value; cards[id].issuedOn = v("s-" + id + "-date").value || ""; cards[id].funRegistered = v("s-" + id + "-fun").checked; }
    const redHot = {
      a: { cat: v("s-rh-a").value, since: (S.cfg.redHot.a && S.cfg.redHot.a.cat === v("s-rh-a").value && S.cfg.redHot.a.since) || S.today },
      b: { cat: v("s-rh-b").value, since: (S.cfg.redHot.b && S.cfg.redHot.b.cat === v("s-rh-b").value && S.cfg.redHot.b.since) || S.today },
    };
    // Each map is replaced whole on save, so start from what is stored. Values left as they were aren't written:
    // a default saved here would hide the engine's later updates (a promo extended, say).
    const raw = S.rawCfg || {};
    const doc = {
      cards, redHot,
      moneybackVip: { a: v("s-mb-a").checked, b: v("s-mb-b").checked },
      miles: Object.assign({}, raw.miles || {}, { base: parseInt(String(v("s-milesBase").value).replace(/[^0-9]/g, ""), 10) || 0, pending: Number(S.cfg.miles.pending) || 0 }),
      updatedAt: nowIso(),
    };
    const tp = Object.assign({}, raw.travelPlus || {});
    const promoEnd = v("s-promoEnd").value;
    if (promoEnd && promoEnd !== S.cfg.travelPlus.promoEnd) tp.promoEnd = promoEnd;
    const monthMode = v("s-monthMode").checked;
    if (monthMode !== (S.cfg.travelPlus.monthMode !== false)) tp.monthMode = monthMode;
    if (JSON.stringify(tp) !== JSON.stringify(raw.travelPlus || {})) doc.travelPlus = tp;
    const daily = parseInt(String(v("s-daily").value).replace(/[^0-9]/g, ""), 10) || 200;
    if (daily !== S.cfg.dailySpend) doc.dailySpend = daily;
    try {
      const ref = S.db.doc("config/main");
      if (S.cfgExists) await ref.update(doc); else await ref.set(doc);
      closeSheet();
      toast("Cards updated.");
    } catch (e) { writeError(e); }
  }

  /* ---------- solo page: Ask and About ---------- */
  function askText() {
    const A = S.ask;
    const place = A.sel && A.sel.source !== "quick" ? A.sel.name : (A.text.trim() || (A.sel ? A.sel.name : ""));
    const amt = parseAmt(A.amount);
    return "Which card should I use" + (place ? " at " + place : "") + (amt ? " (" + E.hkd(amt) + ")" : "") + (A.abroad ? ", in " + countryLabel() : "") + "?";
  }
  // Signal can't pre-fill a message: the question is copied first, then the Signal chat opens to paste it.
  // The chat link and the name come from the sealed block; without them the question goes through the share sheet.
  const signalLink = () => (SOLO && /^https:\/\/signal\.me\/#/.test(S.priv.ask.signal || "") ? S.priv.ask.signal : "");
  const askTo = () => S.priv.ask.to || nameOf("a");
  const askLabel = () => S.priv.ask.label || (askTo() ? "Ask " + askTo() : "Ask for help");
  function copyNow(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.readOnly = true;
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) return;
    } catch (e) { /* use the async clipboard below */ }
    try { navigator.clipboard.writeText(text).catch(() => {}); } catch (e) { /* nothing else to try */ }
  }
  async function askHelp() {
    const text = askText();
    const link = signalLink();
    const to = askTo();
    if (link) {
      copyNow(text);
      toast("Question copied. Paste it in " + (to ? to + "'s" : "the") + " Signal chat.");
      // Signal's own link scheme opens the app straight away, from Safari and from the home-screen icon.
      window.location.href = link.replace(/^https:\/\/signal\.me\//, "sgnl://signal.me/");
      return;
    }
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text); toast("Copied. Paste it in your chat" + (to ? " with " + to : "") + "."); return; } catch (e) { /* fall through to the sheet */ }
    openSheet(askLabel(), '<p class="hint">Copy this and send it' + (to ? " to " + esc(to) : "") + ':</p><p class="promo copyable">' + esc(text) + "</p>");
  }
  function openAbout() {
    const c = S.cfg;
    const line = (id, extra) => {
      const on = E.usableBy(id, S.who, c, S.today);
      const st = c.cards[id] ? c.cards[id].status : "";
      const state = on ? "In use" : (st === "pending" || st === "active" ? "Coming" : "Not yet");
      return '<div class="card-line">' + cardPill(id, cardLabel(id) + (E.CARDS[id].supp === S.who ? " (extra card)" : "")) + '<span class="cl-state' + (on ? " on" : "") + '">' + esc(state + (extra && on ? " · " + extra : "")) + "</span></div>";
    };
    const rh = (c.redHot[S.who] || {}).cat;
    const ids = S.who === "b" ? ["easy_b", "red_b", "citi", "hs_b"] : ["easy_a", "red_a", "citi", "hs_a"];
    const lock = S.sealed === "locked"
      ? '<form id="unlockForm" class="form unlock" novalidate><fieldset><legend>Extras</legend><label for="u-code">Access code<input id="u-code" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="four words"></label>' +
        '<p class="hint" id="u-msg">Adds the Signal button and the HeyMax links. The code is in the link you were sent.</p><div><button type="submit" class="btn small">Unlock</button></div></fieldset></form>'
      : (S.sealed === "open" ? '<p class="hint">Extras unlocked: ' + esc(askLabel()) + " opens Signal" + (Object.keys(S.priv.links).length ? ", HeyMax links on the shops that have them" : "") + ".</p>" : "");
    const html =
      '<div class="cards-list">' + ids.map((id) => line(id, E.CARDS[id].kind === "easy" && rh ? "Red Hot " + rh.charAt(0).toUpperCase() + rh.slice(1) + " 5X" : "")).join("") + "</div>" +
      '<p class="hint">Rules as of ' + esc(E.dayLabel(EMBED.builtOn || S.today)) + " " + esc((EMBED.builtOn || S.today).slice(0, 4)) + ". Updated when a card changes.</p>" +
      '<ul class="why"><li>Type the place. If it isn’t in the list, pick the kind of place.</li>' +
      "<li>This page doesn’t see your spending. If you’ve already spent a lot this month on the card it suggests, tap " + esc(askLabel()) + ".</li>" +
      (signalLink() ? "<li>" + esc(askLabel()) + " copies your question and opens the Signal chat: paste it and send.</li>" : "") +
      "<li>Abroad, pay in the local currency. If the terminal offers Hong Kong dollars, refuse.</li></ul>" +
      lock +
      '<p class="hint">On iPhone, add it to your home screen: Share, then Add to Home Screen. It then works without signal too.</p>';
    openSheet("About this page", html, (root) => {
      const f = $("#unlockForm", root);
      if (f) f.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const msg = $("#u-msg", root);
        msg.textContent = "Checking…";
        const ok = await unlockWith($("#u-code", root).value);
        if (ok) { closeSheet(); toast("Unlocked."); } else msg.textContent = "That code doesn't open it. Check the words and try again.";
      });
    });
  }

  /* ---------- sealed extras (solo page) ---------- */
  // The solo page's public files carry the extras encrypted (AES-GCM, key from the access code by PBKDF2).
  // The code arrives once, in the link (#code=…) or typed under ⓘ; the phone then keeps it.
  const b64 = {
    dec: (t) => Uint8Array.from(atob(t), (ch) => ch.charCodeAt(0)),
    enc: (u8) => { let t = ""; for (const x of u8) t += String.fromCharCode(x); return btoa(t); },
  };
  const normCode = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  async function deriveKey(code, sd) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normCode(code)), "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: b64.dec(sd.salt), iterations: sd.iter, hash: "SHA-256" }, base, 256));
  }
  async function openWith(raw, sd) {
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64.dec(sd.iv) }, key, b64.dec(sd.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  function applySealed(data) {
    S.priv = { people: (data && data.people) || {}, ask: (data && data.ask) || {}, links: (data && data.links) || {},
      points: (data && data.points) || [], miles: (data && data.miles) || null };
    S.sealed = "open";
    soloHeader();
    refresh();
  }
  async function unlockWith(code) {
    const sd = EMBED && EMBED.sealed;
    if (!sd || !normCode(code) || !(window.crypto && crypto.subtle)) return false;
    try {
      const raw = await deriveKey(code, sd);
      const data = await openWith(raw, sd);
      store.set("seal", { code: normCode(code), salt: sd.salt, key: b64.enc(raw) });
      applySealed(data);
      return true;
    } catch (e) { return false; }
  }
  async function openSealedOnLoad() {
    const sd = EMBED && EMBED.sealed;
    if (!sd || !(window.crypto && crypto.subtle)) return;
    const m = /(?:^#|&)code=([^&]+)/.exec(location.hash);
    if (m && (await unlockWith(decodeURIComponent(m[1])))) return;
    const kept = store.get("seal", null);
    if (!kept || !kept.code) return;
    // A rebuilt page has a new salt: derive the key again from the kept code.
    if (kept.salt === sd.salt && kept.key) {
      try { applySealed(await openWith(b64.dec(kept.key), sd)); return; } catch (e) { /* fall back to the code */ }
    }
    await unlockWith(kept.code);
  }
  // The solo header shows the person's name once the extras are open; nothing before.
  function soloHeader() {
    const slot = $(".who-slot");
    if (!slot) return;
    const name = S.priv.people[S.who] || "";
    slot.innerHTML = name ? '<span class="who-chip">' + esc(name) + "</span>" : "";
  }

  /* ---------- points, miles and HeyMax ---------- */
  const fmtCount = (n) => Math.round(n).toLocaleString("en-US");
  const pageLink = () => (S.cfg.pageUrl || "") + (S.cfg.pageUrl && S.cfg.sealCode ? "#code=" + encodeURIComponent(S.cfg.sealCode) : "");
  function pointAlerts() {
    return E.pointsAlerts(S.pointRows, 30).map((a) => Object.assign({}, a, { sub: [nameOf(a.owner), a.sub].filter(Boolean).join(" · ") }));
  }
  // Points and miles worth using at this place, before the card: only balances big enough to use, and only the
  // payer's own (or shared) ones. Each step is HTML for one line of the answer.
  function pointsSteps(sel, amount) {
    if (!sel || sel.source === "quick") return [];
    return E.pointsToUse(sel.name, S.pointRows, S.who).map((r) => {
      const prog = E.PROGRAMS[r.program];
      const whose = r.owner !== S.who && nameOf(r.owner) ? nameOf(r.owner) + "'s " : "your ";
      const use = (prog.atUse && prog.atUse[sel.name]) || r.use;
      const soon = r.next && r.next.daysLeft <= 60 ? " " + E.runLabel(r, r.next) + E.runVerb(r, r.next) + E.dayLabel(r.next.on) + "." : "";
      const head = "Use " + whose + (prog.useName || prog.name) + ":";
      if (prog.kind === "shop") {
        // Points spent in whole dollars (MoneyBack, yuu) round down; Trip Coins pay to the cent.
        const avail = r.unit === "HK$" || prog.hkdEach ? r.value : Math.floor(r.value);
        const off = amount ? Math.min(avail, amount) : avail;
        return "<b>" + esc(head) + "</b> " + esc((amount && avail > amount ? "" : "up to ") + money(off) + " off. " + use + soon);
      }
      return "<b>" + esc(head) + "</b> " + esc("worth about " + money(r.value) + ". " + use + soon);
    });
  }
  // Max Miles (HeyMax) pay a whole flight back within 31 days: suggested on flights they can cover.
  function maxMiles() {
    if (SOLO) return S.priv.miles && S.priv.miles.balance != null ? { balance: Number(S.priv.miles.balance) || 0, payments: Number(S.priv.miles.rentPayments) || 0 } : null;
    return { balance: S.status.miles.balance, payments: S.status.rently.payments };
  }
  // Travel sites sell flights and hotels: the page asks which, since HeyMax pays much less on flights.
  const MAYBE_FLIGHT = ["Trip.com", "Expedia"];
  const tripKind = (sel) => (sel && sel.flags && sel.flags.flight ? "flight" : (sel && MAYBE_FLIGHT.includes(sel.name) ? S.ask.trip : "other"));
  // HeyMax FlyAnywhere pays a whole flight back with Max Miles, claimed within 31 days of booking.
  // Returns { step } when it can pay this ticket (or any ticket up to an amount), { note } when it can't.
  function flyStep(sel, amount) {
    const kind = tripKind(sel);
    if (kind === "other") return null;
    const mm = maxMiles();
    if (!mm || mm.balance < 1000) return null;
    const fa = E.flyAnywhere(S.today, amount, mm.balance, S.cfg, mm.payments);
    const lead = kind === "flight" ? "" : "If it's a flight: ";
    const owner = nameOf("a") || "the account holder";
    const claim = SOLO ? "then ask " + owner + " to claim it in HeyMax FlyAnywhere" : "then claim it in HeyMax FlyAnywhere";
    if (amount && fa.now) return { step: "<b>" + esc(lead + "HeyMax pays this ticket back:") + "</b> " + esc(money(amount) + " back. Pay with the card below, " + claim + " by " + E.dayLabel(fa.deadline) + ".") };
    if (amount && fa.claimFrom) return { step: "<b>" + esc(lead + "HeyMax can pay this ticket back") + "</b> " + esc("once the rent's miles land on " + E.dayLabel(fa.claimFrom) + ": " + money(amount) + " back. Pay with the card below, " + claim + " between " + E.dayLabel(fa.claimFrom) + " and " + E.dayLabel(fa.deadline) + ".") };
    if (amount) {
      const credits = E.rentCredits(S.today, E.addDays(fa.deadline, -2), S.cfg, mm.payments);
      return { note: lead + "HeyMax can't pay this ticket back: FlyAnywhere pays whole tickets only, up to " + money(fa.coverNow) + " now" +
        (credits.length && fa.coverBy > fa.coverNow ? " (" + money(fa.coverBy) + " once the rent's miles land on " + E.dayLabel(credits[0].date) + ")" : "") + "." };
    }
    return { step: "<b>" + esc(lead + "HeyMax pays back a ticket up to " + money(fa.coverNow) + ".") + "</b> " + esc("Pay with the card below, " + claim + " within 31 days. Add the amount to check this one.") };
  }
  // On HeyMax's shopping list: HK$ back on top of the card, if the purchase starts from HeyMax (its app, or the link).
  function heymaxStep(sel, amount) {
    const h = sel && E.heymaxFor(sel.name);
    if (!h) return null;
    const link = /^https:\/\//.test(S.priv.links[h.k] || "") ? S.priv.links[h.k] : "";
    const rate = S.cfg.miles.rate || 0.12;
    const kind = tripKind(sel);
    const on = (per) => (amount ? money(amount / per * rate) : money(100 / per * rate) + " per HK$100");
    let what, value = 0;
    if (h.fixed) { what = money(h.fixed * rate) + " back"; value = h.fixed * rate; }
    else if ("flightPer" in h && kind === "flight") {
      what = h.flightPer ? "about " + on(h.flightPer) + " back on this flight (flights earn much less than hotels)" : "flights earn much less than hotels here: HeyMax shows the rate when you open it";
      value = amount && h.flightPer ? amount / h.flightPer * rate : 0;
    } else if ("flightPer" in h && kind === "") {
      what = "about " + on(h.per) + " back on a hotel or tour, " + (h.flightPer ? "about " + on(h.flightPer) : "much less") + " on a flight";
    } else { what = (amount ? "about " : "") + on(h.per) + " back"; value = amount ? amount / h.per * rate : 0; }
    const owner = nameOf("a");
    // The stand-alone page's owner has the HeyMax app too, signed in to the main account.
    const how = SOLO
      ? "Start from the HeyMax app" + (owner ? " (" + owner + "'s account)" : "") + (link ? " or the button below" : "") + ", then pay in the page it opens, not in the " + sel.name.replace(/\s*\(.*\)$/, "") + " app."
      : "Start from the HeyMax app before paying, or nothing is tracked.";
    const html = "<b>" + esc("Open " + sel.name + " through HeyMax:") + "</b> " + esc(what + ", on top of the card." + ("flightPer" in h && kind === "" ? " Say which it is above." : "") + " " + how + (h.note ? " " + h.note : "")) +
      (link ? '<div><a class="btn small" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Open ' + esc(sel.name) + " via HeyMax</a></div>" : "");
    return { html, value };
  }
  // Status: each balance with its HK$ value, green when it can be used, red with what is missing, grey when unknown.
  function pointsListHtml() {
    const rows = S.pointRows;
    if (!rows.length) return "";
    const line = (r) => {
      const x = r.next;
      const when = x ? E.runLabel(r, x) + E.runVerb(r, x) + E.dayLabel(x.on) + (x.on.slice(0, 4) !== S.today.slice(0, 4) ? " " + x.on.slice(0, 4) : "") : "";
      const hot = x && x.daysLeft <= 30 && !(x.value != null && x.value < 5);
      const state = r.usable === true ? "ok" : (r.usable === false ? "no" : "unk");
      const use = r.usable === true ? "Usable. " + r.use
        : (r.usable === false ? "Needs " + fmtCount(r.short) + " more " + r.word + ". " + r.use : "Value not published. " + r.use);
      const bal = r.unit === "HK$" ? E.hkd(r.balance, 2) : (r.unit === "RC" ? "$" + fmtCount(r.balance) + " RC" : fmtCount(r.balance));
      return '<div class="pt ' + state + '"><span class="pt-name">' + esc(r.name) + (nameOf(r.owner) ? ' <span class="muted">· ' + esc(nameOf(r.owner)) + "</span>" : "") + "</span>" +
        '<span class="pt-right"><span class="mono pt-bal">' + esc(bal) + "</span>" + (r.value != null && r.unit !== "HK$" ? '<span class="pt-val">≈ ' + esc(money(r.value)) + "</span>" : "") + "</span>" +
        '<span class="pt-use">' + esc(use) + "</span>" +
        (when ? '<span class="pt-sub' + (hot ? " hot" : "") + '">' + esc(when) + "</span>" : "") +
        (r.progress ? '<span class="pt-sub">' + esc(r.progress) + "</span>" : "") + "</div>";
    };
    const asOf = rows.map((r) => r.asOf).filter(Boolean).sort()[0];
    return '<div class="list pts">' + rows.map(line).join("") + "</div>" +
      '<p class="hint">' + (asOf ? "Balances as of " + esc(E.dayLabel(asOf)) + ". " : "") + "Airline miles: HK$ value estimated for their cheapest use. Send Claude a screenshot of an app to update a balance.</p>";
  }
  async function copyText(text, el) {
    try { await navigator.clipboard.writeText(text); toast("Link copied."); }
    catch (e) {
      if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
      toast("Select the link and copy it.");
    }
  }

  /* ---------- events ---------- */
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    const typing = document.activeElement;
    if (typing && typing !== b && typing.matches && typing.matches("input:not([type=checkbox])") && !b.closest(".field")) typing.blur();
    if (b.dataset.who) return setWho(b.dataset.who);
    if (b.dataset.tab) return setTab(b.dataset.tab);
    if (b.dataset.quick != null) {
      const q = (S.quickList || QUICK_HK)[Number(b.dataset.quick)];
      if (q) { choose({ name: q.label, cat: q.cat, flags: q.flags || {}, source: "quick" }); window.scrollTo(0, 0); }
      return;
    }
    if (b.dataset.trip) { S.ask.trip = S.ask.trip === b.dataset.trip ? "" : b.dataset.trip; renderAskBody(); return; }
    if (b.dataset.match != null) { const m = S.ask.matches.find((x) => x.name === b.dataset.match); if (m) choose(fromMatch(m)); return; }
    if (b.dataset.cat) {
      const name = S.ask.text.trim();
      choose({ name: name || CAT_SHORT[b.dataset.cat], cat: b.dataset.cat, flags: {}, source: name ? "user" : "quick" });
      if (name.length >= 3) saveLearned(name, b.dataset.cat, {}, "", "user");
      return;
    }
    if (b.dataset.act === "pt-seen") {
      // A balance's expiry noted: quiet until that date (the next one still alerts).
      if (canWrite() && b.dataset.id && b.dataset.on) S.db.doc("points/" + b.dataset.id).update({ seenUntil: b.dataset.on }).then(() => toast("Noted.")).catch(writeError);
      return;
    }
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case "settings": return SOLO ? openAbout() : openSettings();
      case "ask-help": return askHelp();
      case "copy-page": return copyText(pageLink(), $("#pageUrl"));
      case "close-sheet": return closeSheet();
      case "clear-ask": clearAsk(); $("#q").focus(); return;
      case "ask-claude": return askClaude();
      case "log-pick": return logPick(b.dataset.card);
      case "log-other": {
        const sel = S.ask.sel;
        return openTxnSheet(null, sel ? { date: S.today, merchant: sel.name, amount: parseAmt(S.ask.amount) || "", payer: S.who, card: "", category: effectiveCat(sel), flags: askFlags(sel) } : null);
      }
      case "add": return openTxnSheet(null, null);
      case "log-rent": return openTxnSheet(null, { date: S.today, merchant: "Rently (rent)", amount: S.cfg.rently.amount || "", payer: "a", card: "fps", category: "rent", flags: {} });
      case "open-tx": { const t = S.txns.find((x) => x.id === id); if (t) openTxnSheet(t); return; }
      case "ack": {
        if (!canWrite() || !id) return;
        S.db.doc("txns/" + id).update({ ack: true }).then(() => { if (!$("#sheet").hidden) closeSheet(); toast("Noted."); }).catch(writeError);
        return;
      }
      case "todo-done": {
        if (!canWrite() || !id) return;
        S.db.doc("todos/" + id).update({ done: true, doneAt: nowIso() }).then(() => toast("Done.")).catch(writeError);
        return;
      }
      case "month": return stepMonth(Number(b.dataset.step));
      default: return;
    }
  });
  document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (el.dataset && el.dataset.todo) {
      const t = S.todos.find((x) => x.id === el.dataset.todo);
      if (!t || !canWrite()) return;
      S.db.doc("todos/" + t.id).update({ done: el.checked, doneAt: el.checked ? nowIso() : null }).catch((e) => { el.checked = !el.checked; writeError(e); });
      return;
    }
    if (el.id === "fixCat" && S.ask.sel) {
      S.ask.sel = Object.assign({}, S.ask.sel, { cat: el.value, source: S.ask.sel.source === "quick" ? "quick" : "user" });
      if (S.ask.sel.source === "user") saveLearned(S.ask.sel.name, el.value, S.ask.sel.flags, "", "user");
      renderAskBody();
    }
  });
  // Card fees at checkout: kept while typing, applied when the person leaves the two fee fields (or presses Enter).
  // Moving from one fee field to the other doesn't redraw, so the keyboard stays open.
  const isFeeField = (el) => !!el && (el.id === "nf-mc" || el.id === "nf-visa");
  document.addEventListener("input", (ev) => {
    if (isFeeField(ev.target)) S.ask.netFee[ev.target.id === "nf-mc" ? "mastercard" : "visa"] = ev.target.value;
  });
  document.addEventListener("focusout", (ev) => {
    if (!isFeeField(ev.target) || isFeeField(ev.relatedTarget)) return;
    setTimeout(renderAskBody, 0);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !$("#sheet").hidden) { closeSheet(); return; }
    // Enter on a phone keyboard: close the keyboard. Not while an input method is still composing (Chinese, Japanese).
    if (ev.key !== "Enter" || ev.isComposing || ev.keyCode === 229) return;
    const el = ev.target;
    if (!(el instanceof HTMLInputElement) || el.type === "checkbox") return;
    ev.preventDefault(); // no surprise save of a half-filled form
    if (el.id === "q") pickFirst(); // a form with two fields never submits on Enter by itself
    if (el.id === "u-code" && el.form) el.form.requestSubmit();
    el.blur();
  });

  $("#q").addEventListener("input", onQuery);
  $("#qClear").addEventListener("click", () => { clearAsk(); $("#q").focus(); });
  $("#amt").addEventListener("input", (ev) => { S.ask.amount = ev.target.value; renderAskBody(); });
  function pickFirst() {
    const A = S.ask;
    if (!A.sel && A.matches.length) { A.sel = fromMatch(A.matches[0]); renderAskBody(); }
    else if (!A.sel && A.text.trim() && S.sample) askClaude();
  }
  $("#askForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    pickFirst();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });
  const country = $("#country");
  country.innerHTML = E.COUNTRIES.map((c) => '<option value="' + c.id + '"' + (c.id === S.ask.country ? " selected" : "") + ">" + esc(c.label) + "</option>").join("");
  country.addEventListener("change", () => { S.ask.country = country.value; store.set("country", country.value); renderAskBody(); });
  $("#abroadBtn").addEventListener("click", (ev) => {
    S.ask.abroad = !S.ask.abroad;
    ev.currentTarget.setAttribute("aria-pressed", String(S.ask.abroad));
    country.hidden = !S.ask.abroad;
    renderAskBody();
  });

  /* ---------- shared store ---------- */
  async function connect() {
    const C = window.claude;
    if (!C || typeof C.use !== "function") { S.dbState = "off"; refresh(); return; }
    const safe = (name) => { try { return Promise.resolve(C.use(name)).catch(() => null); } catch (e) { return Promise.resolve(null); } };
    const [db, user, sample] = await Promise.all([safe("db"), safe("user"), safe("sample")]);
    S.sample = sample || null;
    if (user) {
      try { S.uid = await user.id(); } catch (e) { S.uid = null; }
      try { if (typeof user.can === "function" && (await user.can("data.write")) === false) S.readOnly = true; } catch (e) { /* unknown: keep controls */ }
    }
    if (!db) { S.dbState = "off"; refresh(); return; }
    S.db = db;
    S.dbState = "live";
    const fail = (e) => {
      if (e && ["revoked", "not_granted", "capability_disabled", "capability_removed"].includes(e.code)) { S.dbState = "off"; S.db = null; }
      refresh();
    };
    db.doc("config/main").onSnapshot((snap) => {
      S.cfgExists = !!snap.exists;
      const data = snap.exists ? snap.data() : null;
      S.rawCfg = data || {};
      S.cfg = E.mergeConfig(data);
      // Private settings: names (kept on this device too, so the header has them before the store answers) and links.
      if (data && data.people) { E.setPeople(data.people); store.set("people", { a: E.PEOPLE.a, b: E.PEOPLE.b }); }
      S.priv = { people: {}, ask: (data && data.ask) || {}, links: (data && data.heymaxLinks) || {} };
      refresh();
    }, fail);
    db.collection("points").limit(100).onSnapshot((qs) => { S.points = qs.docs.map((d) => Object.assign({}, d.data(), { id: d.id })); refresh(); }, fail);
    db.collection("txns").orderBy("date", "desc").limit(1000).onSnapshot((qs) => { S.txLoaded = true; S.txns = qs.docs.map((d) => Object.assign({}, d.data(), { id: d.id })); refresh(); }, fail);
    db.collection("todos").limit(200).onSnapshot((qs) => { S.todos = qs.docs.map((d) => Object.assign({}, d.data(), { id: d.id })); renderStatus(); renderTabs(); }, fail);
    db.collection("merchants").limit(500).onSnapshot((qs) => { S.learned = qs.docs.map((d) => d.data()); }, fail);
    db.collection("promos").limit(100).onSnapshot((qs) => { S.extraPromos = qs.docs.map((d) => d.data()); }, fail);
    refresh();
  }

  // A page left open (a home-screen app can stay in memory for days) moves to the new day when it comes back.
  function checkDay() {
    const t = localToday();
    if (t === S.today) return;
    if (S.month === E.ym(S.today)) S.month = E.ym(t);
    S.today = t;
    refresh();
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkDay(); });
  window.addEventListener("focus", checkDay);
  window.addEventListener("pageshow", checkDay);
  setInterval(checkDay, 5 * 60 * 1000);

  if (SOLO) {
    document.body.classList.add("solo");
    const seg = $(".seg");
    if (seg) seg.outerHTML = '<span class="who-slot"></span>';
    $(".tabbar").hidden = true;
    const about = $('.top [data-act="settings"]');
    if (about) {
      about.setAttribute("aria-label", "About this page");
      about.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>';
    }
    refresh();
    openSealedOnLoad();
  } else {
    refresh();
    connect();
  }
})();
