/* Which Card? rules engine. Pure functions, no DOM: shared by the page and the tests. */
(function (root) {
  "use strict";

  /* ---------- dates and formatting ---------- */
  const DAY = 86400000;
  const dnum = (s) => Math.floor(Date.parse(s + "T00:00:00Z") / DAY);
  const addDays = (s, n) => new Date((dnum(s) + n) * DAY).toISOString().slice(0, 10);
  const ym = (s) => String(s).slice(0, 7);
  const yr = (s) => String(s).slice(0, 4);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayLabel = (s) => (s ? Number(s.slice(8, 10)) + " " + MONTHS[Number(s.slice(5, 7)) - 1] : "");
  const monthLabel = (m) => MONTHS[Number(m.slice(5, 7)) - 1] + " " + m.slice(0, 4);
  function pct(x) {
    const v = Math.round(x * 1000) / 10;
    const a = Math.abs(v);
    return (v < 0 ? "−" : "") + (Number.isInteger(a) ? a.toFixed(0) : a.toFixed(1)) + "%";
  }
  function hkd(x, dp) {
    const n = Number(x) || 0;
    const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
    return (n < 0 ? "−" : "") + "HK$" + s;
  }

  /* ---------- people, cards, categories ---------- */
  // Two people: "a" holds the main cards, "b" is the partner. Their names come from private settings (setPeople);
  // this public code carries none.
  const PEOPLE = { a: "", b: "" };
  function setPeople(p) {
    if (p && typeof p.a === "string" && p.a.trim()) PEOPLE.a = p.a.trim();
    if (p && typeof p.b === "string" && p.b.trim()) PEOPLE.b = p.b.trim();
  }

  // `net` is the card network: Visa-only offers (the tram fare) depend on it.
  const CARDS = {
    easy_a:   { bank: "HSBC", name: "easy", holder: "a", kind: "easy", tone: "easy", net: "visa" },
    easy_b:   { bank: "HSBC", name: "easy", holder: "b", kind: "easy", tone: "easy", net: "visa" },
    red_a:    { bank: "HSBC", name: "Red", holder: "a", kind: "red", tone: "red", net: "mastercard" },
    red_b:    { bank: "HSBC", name: "Red", holder: "b", kind: "red", tone: "red", net: "mastercard" },
    citi:     { bank: "Citi", name: "Cash Back", holder: "a", supp: "b", kind: "citi", tone: "citi", net: "mastercard" },
    hs_a:     { bank: "Hang Seng", name: "Travel+", holder: "a", kind: "hs", tone: "hs", net: "visa" },
    hs_b:     { bank: "Hang Seng", name: "Travel+", holder: "b", kind: "hs", tone: "hs", net: "visa" },
    citiplus: { bank: "Citi", name: "PLUS debit", holder: "a", kind: "debit", tone: "debit", net: "" },
    cash:     { bank: "", name: "Cash", holder: "", kind: "cash", tone: "cash" },
    fps:      { bank: "", name: "FPS transfer", holder: "", kind: "fps", tone: "cash" },
  };
  const CARD_ORDER = ["red_a", "easy_a", "citi", "hs_a", "citiplus", "red_b", "easy_b", "hs_b", "cash", "fps"];
  // Tie-break: keep the Red's monthly cap free and use the plain cards first.
  const PREF = { easy_a: 1, easy_b: 1, citi: 2, hs_a: 3, hs_b: 3, red_a: 4, red_b: 4, citiplus: 5, cash: 6 };

  // "HSBC Red" (cardName) and "HSBC Red · <holder>" (cardLabel) for the cards each person has their own of.
  function cardName(id) {
    const c = CARDS[id];
    return c ? (c.bank ? c.bank + " " : "") + c.name : String(id);
  }
  function cardLabel(id) {
    const c = CARDS[id];
    if (!c) return String(id);
    return (c.kind === "easy" || c.kind === "red" || c.kind === "hs") && PEOPLE[c.holder] ? cardName(id) + " · " + PEOPLE[c.holder] : cardName(id);
  }

  const CATS = {
    dining:        { label: "Restaurant, café or bar", group: "hk", inPerson: 1, dining: 1 },
    dining_hotel:  { label: "Restaurant inside a hotel", group: "hk", inPerson: 1, dining: 1, hotel: 1 },
    red8_dining:   { label: "Red 8% partner restaurant", group: "hk", inPerson: 1, red8: 1, dining: 1 },
    red8:          { label: "Red 8% partner shop", group: "hk", inPerson: 1, red8: 1 },
    home:          { label: "Red Hot Home shop", group: "hk", inPerson: 1, redhot: "home" },
    shopping:      { label: "Red Hot Shopping shop", group: "hk", inPerson: 1, redhot: "shopping" },
    grocery:       { label: "Supermarket or convenience store", group: "hk", inPerson: 1 },
    retail:        { label: "Other shop", group: "hk", inPerson: 1 },
    taxi:          { label: "Taxi", group: "hk", inPerson: 1 },
    // Hong Kong Tramways: HK$2.30 a ride with a Visa card, HK$3.30 with Octopus or any other card.
    tram:          { label: "Tram (Ding Ding)", group: "hk", inPerson: 1, fare: 3.3, visaFare: 2.3 },
    hotel_hk:      { label: "Hotel stay in Hong Kong", group: "hk", inPerson: 1, hotel: 1 },
    online_hk:     { label: "Online, Hong Kong site", group: "online", online: 1 },
    online_fx_hkd: { label: "Online, overseas site billing HKD", group: "online", online: 1, cbf: 1 },
    online_fx:     { label: "Online, foreign currency", group: "online", online: 1, fx: 1 },
    // Paid through AlipayHK, WeChat Pay or PayMe (e.g. Pinduoduo via AlipayHK): the Red pays nothing, the Citi 1%.
    wallet_buy:    { label: "Paid through AlipayHK, WeChat Pay or PayMe", group: "online", wallet: 1 },
    // Taobao and Tmall through AlipayHK: an e-wallet payment too, and Taobao adds its own fee when a card pays
    // (1.5%, or 1.3% with a Hang Seng card; 1% from the AlipayHK balance or a linked bank account). Rates of July 2026.
    taobao:        { label: "Taobao or Tmall, paid through AlipayHK", group: "online", wallet: 1, siteFee: 0.015, siteFeeHs: 0.013 },
    telecom:       { label: "Phone or internet bill", group: "bills", redhot: "home", telecom: 1 },
    ewallet:       { label: "PayMe, AlipayHK or WeChat Pay top-up", group: "topup", topup: 1 },
    octopus:       { label: "Octopus top-up", group: "topup", topup: 1 },
    bills:         { label: "Utilities, tax or insurance", group: "bills", bill: 1 },
    rent:          { label: "Rent", group: "bills", rent: 1 },
    red8_abroad:   { label: "Red 8% partner abroad", group: "abroad", inPerson: 1, red8: 1, fx: 1, abroad: "asia7" },
    abroad_asia7:  { label: "Shop abroad: Japan, Korea, Thailand, China, Macau, Taiwan", group: "abroad", inPerson: 1, fx: 1, abroad: "asia7" },
    abroad_eea:    { label: "Shop abroad: Europe or UK", group: "abroad", inPerson: 1, fx: 1, abroad: "eea" },
    abroad_other:  { label: "Shop abroad: elsewhere", group: "abroad", inPerson: 1, fx: 1, abroad: "other" },
  };

  const COUNTRIES = [
    { id: "jp", label: "Japan", region: "asia7" },
    { id: "kr", label: "South Korea", region: "asia7" },
    { id: "th", label: "Thailand", region: "asia7" },
    { id: "cn", label: "Mainland China", region: "asia7" },
    { id: "mo", label: "Macau", region: "asia7" },
    { id: "tw", label: "Taiwan", region: "asia7" },
    { id: "fr", label: "France", region: "eea" },
    { id: "eu", label: "Other EU country", region: "eea" },
    { id: "uk", label: "United Kingdom", region: "eea" },
    { id: "other", label: "Another country", region: "other" },
  ];
  const abroadCat = (region) => ({ asia7: "abroad_asia7", eea: "abroad_eea", other: "abroad_other" })[region] || "abroad_other";

  /* ---------- merchants (Hong Kong, as listed by the banks in 2026) ---------- */
  const MERCHANTS = [
    // HSBC Red 8% designated merchants
    { n: "Sushiro", a: ["sushiro", "壽司郎"], c: "red8_dining" },
    { n: "TamJai SamGor Mixian", a: ["tamjai samgor", "samgor", "譚仔三哥"], c: "red8_dining" },
    { n: "TamJai Yunnan Mixian", a: ["tamjai yunnan", "tamjai", "tam jai", "譚仔雲南", "譚仔"], c: "red8_dining" },
    { n: "Bakehouse", a: ["bakehouse"], c: "red8" },
    { n: "Decathlon", a: ["decathlon", "迪卡儂"], c: "red8" },
    { n: "NAMCO", a: ["namco"], c: "red8" },
    { n: "TAITO STATION", a: ["taito station", "taito"], c: "red8" },
    { n: "Sephora", a: ["sephora", "絲芙蘭"], c: "red8" },
    { n: "@cosme STORE", a: ["@cosme", "cosme"], c: "red8" },
    { n: "3COINS", a: ["3coins", "3 coins"], c: "red8" },
    { n: "FamilyMart (Japan)", a: ["familymart", "family mart", "famima"], c: "red8_abroad" },
    { n: "Suica", a: ["suica"], c: "red8_abroad" },
    { n: "Olive Young (Korea)", a: ["olive young", "oliveyoung"], c: "red8_abroad" },
    { n: "Mobile Tmoney", a: ["tmoney", "t money"], c: "red8_abroad" },
    // Red Hot Rewards: Home (HSBC's designated list, checked October 2026)
    { n: "PARKnSHOP", a: ["parknshop", "park n shop", "百佳"], c: "home", f: { moneyback: 1 } },
    { n: "Fortress", a: ["fortress", "豐澤"], c: "home", f: { moneyback: 1 } },
    { n: "Don Don Donki", a: ["don don donki", "donki", "驚安"], c: "home" },
    { n: "759 Store", a: ["759 store", "759", "阿信屋"], c: "home" },
    { n: "DS Groceries", a: ["ds groceries", "ds grocery"], c: "home" },
    { n: "TASTE", a: ["taste", "taste x fresh"], c: "home" },
    { n: "FUSION", a: ["fusion"], c: "home" },
    { n: "FRESH", a: ["fresh supermarket", "fresh 新鮮"], c: "home" },
    { n: "GreenPrice", a: ["greenprice", "green price"], c: "home" },
    { n: "Big C", a: ["big c"], c: "home" },
    { n: "Day Day Store", a: ["day day store"], c: "home" },
    { n: "Hong Kong Flavour", a: ["hong kong flavour"], c: "home" },
    { n: "food le parc", a: ["food le parc"], c: "home" },
    { n: "GREAT FOOD HALL", a: ["great food hall"], c: "home" },
    { n: "GOURMET", a: ["gourmet supermarket"], c: "home" },
    { n: "$mart", a: ["$mart", "smart supermarket"], c: "home" },
    { n: "Japan Home Centre (JHC)", a: ["jhc", "japan home centre", "japan home"], c: "home" },
    { n: "at.home", a: ["at.home", "at home"], c: "home" },
    { n: "City Life", a: ["city life"], c: "home" },
    { n: "Broadway", a: ["broadway", "百老匯"], c: "home" },
    { n: "Chung Yuen Electrical", a: ["chung yuen", "中原電器"], c: "home" },
    { n: "Wai Ming Electrical", a: ["wai ming"], c: "home" },
    { n: "Suning", a: ["suning", "蘇寧"], c: "home" },
    { n: "Q-Pets", a: ["q-pets", "qpets"], c: "home" },
    { n: "Pet Line", a: ["pet line", "petline"], c: "home" },
    { n: "Red Carrot", a: ["red carrot"], c: "home" },
    { n: "SmarTone", a: ["smartone", "數碼通"], c: "telecom" },
    { n: "csl / 1010", a: ["csl", "1010"], c: "telecom" },
    { n: "3 Hong Kong", a: ["3hk", "3 hong kong"], c: "telecom" },
    { n: "HKT / Netvigator", a: ["hkt", "netvigator", "網上行"], c: "telecom" },
    { n: "Now TV", a: ["now tv", "nowtv"], c: "telecom" },
    // Red Hot Rewards: Shopping
    { n: "Watsons", a: ["watsons", "屈臣氏"], c: "shopping", f: { moneyback: 1 } },
    { n: "AEON", a: ["aeon", "永旺"], c: "shopping" },
    { n: "YATA", a: ["yata", "一田"], c: "shopping" },
    { n: "city'super", a: ["citysuper", "city super"], c: "shopping" },
    { n: "Marks & Spencer", a: ["marks & spencer", "marks and spencer", "marks spencer", "m&s", "馬莎"], c: "shopping" },
    { n: "Uniqlo", a: ["uniqlo", "優衣庫"], c: "shopping" },
    { n: "Sasa", a: ["sasa", "莎莎"], c: "shopping" },
    // Other everyday places
    { n: "Wellcome", a: ["wellcome", "惠康"], c: "grocery" },
    { n: "Market Place", a: ["market place", "marketplace", "jasons", "3hreesixty"], c: "grocery" },
    { n: "7-Eleven", a: ["7-eleven", "7 eleven", "7eleven", "711"], c: "grocery" },
    { n: "Circle K", a: ["circle k", "ok便利店"], c: "grocery" },
    { n: "Mannings", a: ["mannings", "萬寧"], c: "retail" },
    { n: "IKEA", a: ["ikea", "宜家"], c: "retail" },
    { n: "McDonald's", a: ["mcdonalds", "mcdonald", "麥當勞"], c: "dining" },
    { n: "Starbucks", a: ["starbucks", "星巴克"], c: "dining" },
    { n: "Pacific Coffee", a: ["pacific coffee"], c: "dining" },
    { n: "Café de Coral", a: ["cafe de coral", "大家樂"], c: "dining" },
    { n: "Maxim's", a: ["maxims", "maxim", "美心"], c: "dining" },
    { n: "Taxi", a: ["taxi", "的士"], c: "taxi" },
    { n: "Hong Kong Tramways", a: ["tram", "trams", "tramway", "tramways", "ding ding", "dingding", "電車", "叮叮"], c: "tram" },
    { n: "Prizemart", a: ["prizemart", "prize mart", "kpay prizemart"], c: "grocery" },
    // Online, Hong Kong merchants
    { n: "HKTVmall", a: ["hktvmall", "hktv mall"], c: "online_hk" },
    { n: "foodpanda", a: ["foodpanda", "food panda"], c: "online_hk" },
    { n: "Deliveroo", a: ["deliveroo"], c: "online_hk" },
    { n: "Keeta", a: ["keeta"], c: "online_hk" },
    { n: "Klook", a: ["klook"], c: "online_hk" },
    { n: "Trip.com", a: ["trip.com", "tripcom", "攜程"], c: "online_hk" },
    { n: "Cathay Pacific", a: ["cathay pacific", "cathay", "國泰"], c: "online_hk", f: { flight: 1 } },
    { n: "HK Express", a: ["hk express", "hkexpress", "香港快運"], c: "online_hk", f: { flight: 1 } },
    { n: "HKTaxi app", a: ["hktaxi"], c: "online_hk" },
    // Paid through AlipayHK: it counts as an e-wallet payment, and Taobao adds its own fee.
    { n: "Taobao / Tmall (AlipayHK)", a: ["taobao", "taobao.com", "tmall", "淘寶", "天貓", "alipayhk taobao"], c: "taobao" },
    { n: "Pinduoduo (AlipayHK)", a: ["pinduoduo", "pdd", "拼多多", "alipayhk pinduoduo"], c: "wallet_buy" },
    { n: "Google Play", a: ["google play", "google tidal", "tidal"], c: "online_hk" },
    // Online, overseas merchants billing in HKD (HSBC adds a 1% fee)
    { n: "Booking.com", a: ["booking.com", "booking com"], c: "online_fx_hkd" },
    { n: "Agoda", a: ["agoda"], c: "online_fx_hkd" },
    { n: "Expedia", a: ["expedia"], c: "online_fx_hkd" },
    { n: "Hotels.com", a: ["hotels.com", "hotels com"], c: "online_fx_hkd" },
    { n: "Airbnb", a: ["airbnb"], c: "online_fx_hkd" },
    { n: "Uber", a: ["uber"], c: "online_fx_hkd" },
    { n: "Netflix", a: ["netflix"], c: "online_fx_hkd" },
    { n: "Spotify", a: ["spotify"], c: "online_fx_hkd" },
    { n: "Turkish Airlines", a: ["turkish airlines", "turkish"], c: "online_fx_hkd", f: { flight: 1 } },
    { n: "Qatar Airways", a: ["qatar airways", "qatar"], c: "online_fx_hkd", f: { flight: 1 } },
    { n: "Emirates", a: ["emirates"], c: "online_fx_hkd", f: { flight: 1 } },
    { n: "Lufthansa", a: ["lufthansa"], c: "online_fx_hkd", f: { flight: 1 } },
    { n: "SWISS", a: ["swiss international", "swiss air", "swiss"], c: "online_fx_hkd", f: { flight: 1 } },
    { n: "Air France", a: ["air france"], c: "online_fx_hkd", f: { flight: 1 } },
    { n: "Finnair", a: ["finnair"], c: "online_fx_hkd", f: { flight: 1 } },
    { n: "Etihad", a: ["etihad"], c: "online_fx_hkd", f: { flight: 1 } },
    { n: "Kiwi.com", a: ["kiwi.com", "kiwi com"], c: "online_fx_hkd", f: { flight: 1 } },
    // Flight agencies whose checkout adds a fee that depends on the card (often more for Mastercard or credit cards).
    // `netFees` makes the answer ask for those fees and say how much extra the Red can absorb.
    { n: "Mytrip", a: ["mytrip", "my trip", "mytrip.com"], c: "online_fx_hkd", f: { flight: 1, netFees: 1 } },
    { n: "Gotogate", a: ["gotogate", "goto gate", "gotogate.com"], c: "online_fx_hkd", f: { flight: 1, netFees: 1 } },
    { n: "BudgetAir", a: ["budgetair", "budget air", "budgetair.com"], c: "online_fx_hkd", f: { flight: 1, netFees: 1 } },
    { n: "Flightnetwork", a: ["flightnetwork", "flight network"], c: "online_fx_hkd", f: { flight: 1, netFees: 1 } },
    { n: "Etraveli (Mytrip, Gotogate…)", a: ["etraveli"], c: "online_fx_hkd", f: { flight: 1, netFees: 1 } },
    { n: "eDreams", a: ["edreams", "e dreams", "edreams.com"], c: "online_fx_hkd", f: { flight: 1, netFees: 1 } },
    { n: "Opodo", a: ["opodo"], c: "online_fx_hkd", f: { flight: 1, netFees: 1 } },
    { n: "GO Voyages", a: ["go voyages", "govoyages"], c: "online_fx_hkd", f: { flight: 1, netFees: 1 } },
    { n: "Amazon", a: ["amazon"], c: "online_fx" },
    // Top-ups and bills
    { n: "PayMe top-up", a: ["payme"], c: "ewallet" },
    { n: "AlipayHK top-up", a: ["alipayhk", "alipay", "支付寶"], c: "ewallet" },
    { n: "WeChat Pay HK top-up", a: ["wechat pay", "wechatpay", "微信支付"], c: "ewallet" },
    { n: "Octopus top-up", a: ["octopus", "八達通"], c: "octopus" },
    { n: "CLP Power", a: ["clp", "中電"], c: "bills" },
    { n: "HK Electric", a: ["hk electric", "港燈"], c: "bills" },
    { n: "Towngas", a: ["towngas", "煤氣"], c: "bills" },
    { n: "Water bill", a: ["water supplies", "水務署"], c: "bills" },
    { n: "Tax (IRD)", a: ["inland revenue", "ird", "稅局"], c: "bills" },
    { n: "AXA insurance", a: ["axa"], c: "bills" },
    { n: "Rently (rent)", a: ["rently"], c: "rent" },
    // More places on the HeyMax list or in the loyalty programmes below
    { n: "KFC", a: ["kfc", "肯德基"], c: "dining" },
    { n: "Pizza Hut", a: ["pizza hut", "必勝客"], c: "dining" },
    { n: "PHD (Pizza Hut Delivery)", a: ["phd", "pizza hut delivery", "薄餅博士"], c: "online_hk" },
    { n: "PNS eShop", a: ["pns eshop", "parknshop online", "parknshop eshop", "pns online"], c: "online_hk" },
    { n: "Fortress eShop", a: ["fortress eshop", "fortress online"], c: "online_hk" },
    { n: "Watson's Wine", a: ["watson's wine", "watsons wine", "watsonswine"], c: "online_hk" },
    { n: "Laithwaites Direct Wines", a: ["direct wines", "directwines", "laithwaites"], c: "online_hk" },
    { n: "iHerb", a: ["iherb"], c: "online_fx_hkd" },
    { n: "Lookfantastic", a: ["lookfantastic", "look fantastic"], c: "online_fx_hkd" },
    { n: "StrawberryNet", a: ["strawberrynet", "strawberry net"], c: "online_hk" },
    { n: "Lululemon", a: ["lululemon"], c: "online_hk" },
    { n: "Net-a-Porter", a: ["net-a-porter", "net a porter", "netaporter"], c: "online_fx_hkd" },
    { n: "Farfetch", a: ["farfetch"], c: "online_fx_hkd" },
    { n: "AliExpress", a: ["aliexpress", "ali express"], c: "online_fx_hkd" },
    { n: "JD.com", a: ["jd.com", "京東", "京东"], c: "online_fx_hkd" },
    { n: "Zalora", a: ["zalora"], c: "online_fx_hkd" },
    { n: "Olive Young Global (online)", a: ["olive young global", "oliveyoung global"], c: "online_fx" },
    { n: "Apple Store", a: ["apple store", "apple.com"], c: "online_hk" },
    { n: "Microsoft Store", a: ["microsoft store", "microsoft"], c: "online_fx_hkd" },
    { n: "Samsung", a: ["samsung"], c: "online_hk" },
    { n: "Dyson", a: ["dyson"], c: "online_hk" },
    { n: "Lenovo", a: ["lenovo"], c: "online_hk" },
    { n: "Adidas", a: ["adidas"], c: "online_hk" },
    { n: "PUMA", a: ["puma"], c: "online_hk" },
    { n: "Rentalcars.com", a: ["rentalcars", "rentalcars.com"], c: "online_fx_hkd" },
    { n: "Plaza Premium Lounge", a: ["plaza premium"], c: "online_hk" },
    { n: "Surfshark VPN", a: ["surfshark"], c: "online_fx" },
  ];

  /* ---------- loyalty programmes ---------- */
  // Shop programmes: the app to scan at the till. `perHkd` = points worth HK$1 when spent. Airline programmes and
  // HeyMax are listed so balances and expiry dates can be shown; the balances themselves live in the private store.
  const PROGRAMS = {
    moneyback: { name: "MoneyBack", kind: "shop", perHkd: 50, at: ["PARKnSHOP", "Fortress", "Watsons", "TASTE", "FUSION", "GREAT FOOD HALL", "food le parc", "3 Hong Kong", "PNS eShop", "Fortress eShop", "Watson's Wine"] },
    yuu: { name: "yuu", kind: "shop", perHkd: 200, at: ["Wellcome", "Market Place", "7-Eleven", "Mannings", "IKEA", "Maxim's", "KFC", "Pizza Hut", "PHD (Pizza Hut Delivery)"] },
    dsgroceries: { name: "DS Groceries", kind: "shop", at: ["DS Groceries"] },
    msblue: { name: "M&S (Blue app)", kind: "shop", unit: "HK$", at: ["Marks & Spencer"] },
    heymax: { name: "HeyMax Max Miles", kind: "miles", hkdEach: 0.12 },
    asiamiles: { name: "Asia Miles (Cathay)", kind: "miles" },
    qatar: { name: "Qatar Privilege Club (Avios)", kind: "miles" },
    turkish: { name: "Turkish Miles&Smiles", kind: "miles" },
    flyingblue: { name: "Flying Blue (Air France-KLM)", kind: "miles" },
    milesmore: { name: "Miles & More (Lufthansa)", kind: "miles" },
    delta: { name: "Delta SkyMiles", kind: "miles" },
  };
  const programsAt = (merchantName) => Object.keys(PROGRAMS).filter((id) => (PROGRAMS[id].at || []).includes(merchantName));

  // HeyMax shopping portal, Hong Kong (rates as listed in the app on 14 Oct 2026): `per` = HK$ spent for 1 Max Mile;
  // `fixed` = flat Max Miles. Start from the HeyMax app (or its link) before paying, or nothing is tracked.
  const HEYMAX = {
    "Trip.com": { k: "tripcom", per: 3, note: "Flights earn far less: about 1 Max Mile per HK$17 of the fare before taxes." },
    "Klook": { k: "klook", per: 0.8 },
    "Agoda": { k: "agoda", per: 2.7 },
    "Expedia": { k: "expedia", per: 4 },
    "iHerb": { k: "iherb", per: 16 },
    "Uber": { k: "uber", fixed: 200, note: "New Uber users only." },
    "Taobao / Tmall (AlipayHK)": { k: "taobao", per: 4 },
    "PNS eShop": { k: "pnseshop", per: 23.3 },
    "Fortress eShop": { k: "fortress", per: 8 },
    "Watson's Wine": { k: "watsonswine", per: 4.6 },
    "Laithwaites Direct Wines": { k: "directwines", per: 2.3 },
    "Lookfantastic": { k: "lookfantastic", per: 2.3 },
    "StrawberryNet": { k: "strawberrynet", per: 1.8 },
    "Lululemon": { k: "lululemon", per: 2.3 },
    "Sephora": { k: "sephora", per: 2.9, note: "Online only." },
    "Net-a-Porter": { k: "netaporter", per: 5.4 },
    "Farfetch": { k: "farfetch", per: 2.2 },
    "AliExpress": { k: "aliexpress", per: 5.6 },
    "JD.com": { k: "jd", per: 16.2 },
    "Zalora": { k: "zalora", per: 1.6 },
    "Olive Young Global (online)": { k: "oliveyoung", per: 4 },
    "Sasa": { k: "sasa", per: 4.6, note: "Online only." },
    "Apple Store": { k: "apple", per: 10.8 },
    "Microsoft Store": { k: "microsoft", per: 4 },
    "Samsung": { k: "samsung", per: 2.4 },
    "Dyson": { k: "dyson", per: 5.4 },
    "Lenovo": { k: "lenovo", per: 3.9 },
    "Adidas": { k: "adidas", per: 2.7 },
    "PUMA": { k: "puma", per: 2.3 },
    "Rentalcars.com": { k: "rentalcars", per: 8 },
    "Plaza Premium Lounge": { k: "plazapremium", per: 5.8 },
    "PHD (Pizza Hut Delivery)": { k: "phd", per: 3.2 },
    "Surfshark VPN": { k: "surfshark", per: 0.4 },
  };
  const heymaxFor = (merchantName) => HEYMAX[merchantName] || null;

  // Balances live in the private store (collection "points", one doc per programme and person):
  //   { program, owner: "a" | "b", balance, value (HK$, optional), expiring: [{ amount, on }], expiresOn (the whole
  //     balance, e.g. after inactivity), vouchers: [{ label, value, until, used }], progress, note, asOf }
  // Each row gets its HK$ value (when the programme has one) and what runs out first.
  function pointsValue(prog, amount) {
    if (prog.unit === "HK$") return amount;
    if (prog.perHkd) return amount / prog.perHkd;
    if (prog.hkdEach) return amount * prog.hkdEach;
    return null;
  }
  function pointsSummary(list, today) {
    const rows = [];
    for (const p of list || []) {
      const prog = p && PROGRAMS[p.program];
      if (!prog) continue;
      const balance = Number(p.balance) || 0;
      const value = p.value != null && p.value !== "" && isFinite(Number(p.value)) ? Number(p.value) : pointsValue(prog, balance);
      const runs = [];
      for (const e of p.expiring || []) {
        const amount = Number(e && e.amount) || 0;
        if (amount > 0 && e.on && e.on >= today) runs.push({ amount, on: e.on, value: pointsValue(prog, amount) });
      }
      if (p.expiresOn && p.expiresOn >= today && balance > 0) runs.push({ amount: balance, on: p.expiresOn, all: true, value });
      for (const v of p.vouchers || []) {
        if (v && !v.used && v.until && v.until >= today) runs.push({ voucher: String(v.label || "Voucher"), on: v.until, value: Number(v.value) || null });
      }
      runs.sort((x, y) => (x.on < y.on ? -1 : x.on > y.on ? 1 : 0));
      for (const r of runs) r.daysLeft = dnum(r.on) - dnum(today);
      rows.push({
        id: p.id || p.program + "_" + (p.owner || ""), program: p.program, name: prog.name, kind: prog.kind, owner: p.owner || "",
        unit: prog.unit || (prog.kind === "miles" ? "miles" : "points"), balance, value, runs, next: runs[0] || null,
        progress: p.progress || "", note: p.note || "", asOf: p.asOf || "",
      });
    }
    // Shop programmes first, then miles; within each, what runs out first.
    return rows.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === "shop" ? -1 : 1) || String(x.next ? x.next.on : "9999").localeCompare(String(y.next ? y.next.on : "9999")));
  }
  const countLabel = (n) => Math.round(n).toLocaleString("en-US");
  // "7,962 miles", "41 points", "HK$0.45 of the balance", "Lavazza coupon (HK$49)".
  function runLabel(row, x) {
    if (x.voucher) return x.voucher + (x.value ? " (" + hkd(x.value) + ")" : "");
    if (row.unit === "HK$") return (x.all ? "the balance, " : "") + hkd(x.amount, 2) + (x.all ? "" : " of the balance");
    return countLabel(x.amount) + " " + (row.kind === "miles" ? "miles" : "points");
  }
  const runVerb = (row, x) => (x.voucher ? " ends " : (row.unit === "HK$" || x.amount === 1 ? " expires " : " expire "));
  // What runs out within `horizon` days. Under HK$5 is only information.
  function pointsAlerts(rows, horizon) {
    const out = [];
    for (const r of rows || []) {
      for (const x of r.runs) {
        if (x.daysLeft > (horizon || 30)) continue;
        const small = x.value != null && x.value < 5;
        const verb = runVerb(r, x);
        out.push({ level: small ? "info" : (x.daysLeft <= 7 ? "bad" : "warn"), kind: "points", id: r.id, owner: r.owner,
          text: r.name + ": " + runLabel(r, x) + verb + (x.daysLeft === 0 ? "today" : "on " + dayLabel(x.on)), sub: r.note });
      }
    }
    return out;
  }

  /* ---------- promotions (checked October 2026) ---------- */
  const PROMOS = [
    { m: ["mcdonald"], card: "red", text: "McDonald's: a single payment of HK$30 or more on the Red earns Reward+ stamps, up to $30 RewardCash a month.", until: "2026-12-31" },
    { m: ["hk express"], card: "red", text: "HK Express flights: buy in-flight food for HK$30 or more with the physical Red card and get a free drink.", until: "" },
    { m: ["trip.com", "tripcom"], card: "hs", text: "Trip.com with the Hang Seng Travel+: 5% off hotels and 1.5% off flights.", until: "2026-12-31" },
    { m: ["expedia", "hotels.com"], card: "hs", text: "Expedia and Hotels.com with the Hang Seng Travel+: up to 8% off hotels with the card's promo code.", until: "2026-12-31" },
    { m: ["starbucks"], card: "hs", text: "Starbucks at Hong Kong airport: drink and food combo for HK$10 with the physical Travel+ card.", until: "2026-12-31" },
    { m: ["parknshop", "watsons", "fortress"], card: "easy", text: "MoneyBack member days: up to 8% off at PARKnSHOP and Watsons, 5% at Fortress, above a minimum spend.", until: "" },
    // Tips are facts about paying there, not offers.
    { m: ["taobao", "tmall"], tip: 1, text: "Paying from the AlipayHK balance or a linked bank account costs 1% instead of 1.5%, but earns no card rewards.", until: "" },
  ];

  /* ---------- configuration ---------- */
  const DEFAULT_CONFIG = {
    cards: {
      easy_a: { status: "active" },
      easy_b: { status: "active" },
      red_a: { status: "active", since: "2026-10-12" },
      red_b: { status: "active", since: "2026-10-12" },
      citi: { status: "pending", approvedOn: "", suppCard: false },
      hs_a: { status: "planned", issuedOn: "", funRegistered: false },
      hs_b: { status: "planned", issuedOn: "", funRegistered: false },
      citiplus: { status: "active" },
    },
    redHot: { a: { cat: "home", since: "2026-10-12" }, b: { cat: "home", since: "2026-10-12" } },
    moneybackVip: { a: false, b: false },
    travelPlus: { promoEnd: "2026-12-31", monthTarget: 6000, extraCap: 500, monthMode: true },
    welcome: {
      citi: { target: 4000, days: 30, reward: "25,000 Max Miles (MoneyHero)", activateBy: "2026-11-30" },
      hs_a: { target: 5000, days: 60, reward: "$700 +FUN Dollars" },
      hs_b: { target: 5000, days: 60, reward: "$700 +FUN Dollars" },
    },
    dailySpend: 200,
    // Each person's phone wallet, for the "default card" line ("" = generic wording).
    wallets: { a: "", b: "" },
    miles: { rate: 0.12, base: 0, pending: 0 },
    // Rently collects the FPS on the 12th and pays the landlord on the 16th.
    // The rent amount itself lives only in the private settings (config/main), never in these public files.
    rently: { promoPayments: 12, promoMiles: 8400, standardMiles: 5250, dueDay: 16, payDay: 12, amount: 0, creditDays: 3 },
  };

  function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function deepMerge(base, over) {
    if (!isObj(over)) return JSON.parse(JSON.stringify(base));
    const out = {};
    for (const k of new Set([...Object.keys(base), ...Object.keys(over)])) {
      if (isObj(base[k]) && isObj(over[k])) out[k] = deepMerge(base[k], over[k]);
      else if (over[k] !== undefined) out[k] = JSON.parse(JSON.stringify(over[k]));
      else out[k] = JSON.parse(JSON.stringify(base[k]));
    }
    return out;
  }
  const mergeConfig = (dbCfg) => deepMerge(DEFAULT_CONFIG, dbCfg || {});

  /* ---------- availability ---------- */
  function cardActive(id, cfg, date) {
    if (id === "cash" || id === "fps") return true;
    const c = cfg.cards[id];
    if (!c || c.status !== "active") return false;
    const from = c.since || c.approvedOn || c.issuedOn || "";
    return !from || !date || from <= date;
  }
  function holds(id, payer, cfg) {
    const def = CARDS[id];
    if (!def) return false;
    if (def.kind === "cash" || def.kind === "fps") return true;
    if (def.holder === payer) return true;
    return def.supp === payer && !!(cfg.cards[id] && cfg.cards[id].suppCard);
  }
  const usableBy = (id, payer, cfg, date) => holds(id, payer, cfg) && cardActive(id, cfg, date);

  /* ---------- merchant matching ---------- */
  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/[’'`]/g, "").replace(/[^a-z0-9&.@぀-ヿ㐀-鿿가-힯]+/g, " ").trim();
  }
  const CJK = /[぀-ヿ㐀-鿿가-힯]/;
  function scoreAlias(q, a) {
    if (!q || !a) return 0;
    if (q === a) return 100 + a.length;
    if (CJK.test(a) && q.includes(a)) return 70 + a.length * 3;
    if ((" " + q + " ").includes(" " + a + " ")) return 80 + a.length;
    if (a.length >= 3 && q.length >= 2 && a.startsWith(q)) return 60 + q.length;
    if (a.length >= 5 && q.includes(a)) return 50 + a.length;
    if (q.length >= 3 && a.includes(q)) return 30 + q.length;
    return 0;
  }
  // `learned` = merchants saved in the shared store (from Claude or from a correction): they win ties.
  function matchMerchants(query, learned) {
    const q = norm(query);
    if (!q) return [];
    const pool = [];
    for (const m of learned || []) pool.push({ name: m.name, aliases: [m.name].concat(m.aliases || []), cat: m.category, flags: m.flags || {}, source: m.source || "saved", bonus: 5 });
    for (const m of MERCHANTS) pool.push({ name: m.n, aliases: m.a, cat: m.c, flags: m.f || {}, source: "list", bonus: 0 });
    const seen = new Set();
    const hits = [];
    for (const m of pool) {
      if (!CATS[m.cat]) continue;
      let best = 0;
      for (const a of m.aliases) best = Math.max(best, scoreAlias(q, norm(a)));
      // "AlipayHK*Taobao" is a purchase at Taobao, not a top-up: wallet names lose to the merchant named with them.
      if (best && CATS[m.cat].topup && q.includes(" ") && !/top ?up|增值|充值/.test(q)) best -= 15;
      if (best > 0 && !seen.has(norm(m.name))) {
        seen.add(norm(m.name));
        hits.push({ name: m.name, cat: m.cat, flags: m.flags, source: m.source, score: best + m.bonus });
      }
    }
    return hits.sort((x, y) => y.score - x.score).slice(0, 6);
  }
  function promosFor(name, cardId, extra) {
    const q = norm(name);
    if (!q) return [];
    const kind = CARDS[cardId] ? CARDS[cardId].kind : "";
    return PROMOS.concat(extra || []).filter((p) => (p.m || []).some((k) => q.includes(norm(k))))
      .map((p) => Object.assign({}, p, { onPick: p.card === kind }));
  }

  /* ---------- rates ---------- */
  function redHotApplies(person, cat, cfg, date) {
    const r = cfg.redHot && cfg.redHot[person];
    if (!r || !r.cat) return false;
    if (r.since && date && date < r.since) return false;
    if (r.cat === "home") return cat.redhot === "home";
    if (r.cat === "shopping") return cat.redhot === "shopping";
    if (r.cat === "dining") return !!cat.dining && !cat.hotel;
    if (r.cat === "overseas") return !!cat.fx;
    return false;
  }
  function hsBonus(cat) {
    if (cat.abroad === "asia7") return 0.07;
    if (cat.abroad) return 0.05;
    if (cat.dining && !cat.hotel && !cat.online) return 0.05;
    return 0;
  }
  function blend(hi, lo, capLeft, amt) {
    if (!amt) return capLeft > 0 ? hi : lo;
    const inCap = Math.min(Math.max(capLeft, 0), amt);
    return (inCap * hi + (amt - inCap) * lo) / amt;
  }
  const welcomeEligible = (catId) => { const c = CATS[catId]; return !!c && !(c.topup || c.bill || c.rent || c.telecom || c.wallet); };

  // One card's value for one purchase: rebate and fees as fractions of the amount, plus the reason in words.
  function rateFor(cardId, catId, ctx) {
    const cat = CATS[catId];
    const def = CARDS[cardId];
    const cfg = ctx.cfg, st = ctx.st, date = ctx.date;
    const amt = ctx.amount > 0 ? Number(ctx.amount) : 0;
    const flags = ctx.flags || {};
    let rebate = 0, fee = 0, cap = null;
    const why = [];
    const feeFor = (feeOnCbf) => (cat.fx ? 0.0195 : (cat.cbf ? feeOnCbf : 0));
    switch (def.kind) {
      case "red": {
        const u = st.redUse(cardId, ym(date));
        if (catId === "ewallet") { why.push("Red earns nothing on e-wallet top-ups"); }
        else if (cat.wallet) { why.push("Red earns nothing on purchases paid through AlipayHK, WeChat Pay or PayMe"); }
        else if (cat.bill || cat.rent || catId === "octopus" || cat.telecom) { rebate = 0.004; why.push("Bills and top-ups earn the basic 0.4% on Red"); }
        else if (cat.red8) {
          const left = Math.max(0, 1250 - u.red8);
          cap = { name: "8% partner cap", left, of: 1250 };
          rebate = blend(0.08, 0.004, left, amt);
          why.push(left > 0 ? "8% at Red partner shops, " + hkd(left) + " left at 8% this month" : "This month's 8% cap (HK$1,250) is used up: 0.4% now");
          if (amt && left > 0 && amt > left) why.push("Only " + hkd(left) + " of this earns 8%, the rest 0.4%");
        } else if (cat.online) {
          const left = Math.max(0, 10000 - u.online);
          cap = { name: "4% online cap", left, of: 10000 };
          rebate = blend(0.04, 0.004, left, amt);
          why.push(left > 0 ? "4% on online spending, " + hkd(left) + " left at 4% this month" : "This month's 4% online cap (HK$10,000) is used up: 0.4% now");
          if (amt && left > 0 && amt > left) why.push("Only " + hkd(left) + " of this earns 4%, the rest 0.4%");
        } else { rebate = 0.004; why.push("Red pays only 0.4% in shops (except its partner list)"); }
        fee = feeFor(0.01);
        break;
      }
      case "easy": {
        const p = def.holder;
        if (catId === "ewallet") { why.push("No RewardCash on e-wallet top-ups"); break; }
        rebate = 0.004;
        if (redHotApplies(p, cat, cfg, date)) {
          const left = Math.max(0, 100000 - st.redHotYtd(p, yr(date)));
          rebate += blend(0.02, 0, left, amt);
          const label = { home: "Home", shopping: "Shopping", dining: "Dining", overseas: "Overseas" }[cfg.redHot[p].cat];
          why.push("Red Hot " + label + " 5X: 2.4% RewardCash");
        } else if (cat.redhot && !(cfg.redHot[p] && cfg.redHot[p].cat)) {
          why.push((PEOPLE[p] ? PEOPLE[p] + " has not registered for" : "Not registered for") + " Red Hot Rewards yet: 0.4% only");
        }
        if (flags.moneyback) {
          const vip = cfg.moneybackVip && cfg.moneybackVip[p];
          rebate += vip ? 0.024 : 0.016;
          why.push("Plus MoneyBack points: about " + (vip ? "2.4% (VIP)" : "1.6%, or 2.4% for VIP members"));
        }
        if (!why.length) why.push("Basic 0.4% RewardCash");
        fee = feeFor(0.01);
        break;
      }
      case "citi": {
        if (cat.bill || cat.rent) { why.push("Bill payments earn no cash back on Citi"); }
        else if (cat.abroad) { rebate = cat.abroad === "eea" ? 0.01 : 0.02; why.push(cat.abroad === "eea" ? "Only 1% in shops in Europe and the UK" : "2% on foreign-currency spending"); }
        else if (catId === "online_fx") { rebate = 0.02; why.push("2% on foreign-currency spending"); }
        else if (cat.dining || cat.hotel) { rebate = 0.02; why.push("2% on Hong Kong restaurants and hotels"); }
        else if (cat.wallet || cat.topup) { rebate = 0.01; why.push("1% on e-wallet payments and top-ups"); }
        else { rebate = 0.01; why.push("1% on everything else, no extra fees"); }
        fee = cat.fx ? 0.0195 : 0;
        break;
      }
      case "hs": {
        const c = cfg.cards[cardId] || {};
        rebate = (catId === "ewallet" || cat.bill || cat.rent) ? 0 : 0.004;
        const bonus = hsBonus(cat);
        const promo = !!c.funRegistered && date <= cfg.travelPlus.promoEnd;
        const mo = st.hsMonth(cardId, ym(date));
        if (bonus && promo) {
          const qualified = ctx.assumeHs || mo.spend >= cfg.travelPlus.monthTarget;
          if (qualified) {
            const extraLeft = Math.max(0, cfg.travelPlus.extraCap - mo.extra);
            const extraRate = bonus - 0.004;
            rebate += amt ? Math.min(extraRate * amt, extraLeft) / amt : (extraLeft > 0 ? extraRate : 0);
            why.push(pct(bonus) + " +FUN Dollars " + (cat.abroad ? "on foreign-currency shopping" : "on restaurants") +
              (mo.spend >= cfg.travelPlus.monthTarget ? "" : " once this card reaches " + hkd(cfg.travelPlus.monthTarget) + " this month (now " + hkd(mo.spend) + ")"));
          } else {
            why.push(pct(bonus) + " only after " + hkd(cfg.travelPlus.monthTarget) + " on this card this month (now " + hkd(mo.spend) + ")");
          }
        } else if (bonus && !c.funRegistered) {
          why.push("Register the card for +FUN Dollars to unlock " + pct(bonus));
        } else {
          why.push("Basic 0.4% +FUN Dollars");
        }
        fee = feeFor(0.01);
        break;
      }
      case "debit": { why.push("No fee when you pay from a currency balance in Global Wallet"); break; }
      case "cash": { why.push("Cash in the local currency, changed in Hong Kong at a better rate than the cards"); break; }
      default: break;
    }
    if (fee >= 0.0195) why.push("Minus 1.95% foreign-currency fee");
    else if (fee >= 0.01) why.push("Minus 1%: the bank's fee when a non-HK merchant bills HKD (\"DCC fee\" on the statement)");
    // A fee the shop adds for card payments (Taobao through AlipayHK). It applies to every card.
    if (cat.siteFee && ["easy", "red", "citi", "hs"].includes(def.kind)) {
      const f = def.kind === "hs" && cat.siteFeeHs ? cat.siteFeeHs : cat.siteFee;
      fee += f;
      why.push("Minus " + pct(f) + ": Taobao's fee when a card pays through AlipayHK");
    }
    // A fee the website adds at checkout for this card's network (e.g. flight agencies charging more for Mastercard),
    // entered by the person from the payment page: flags.netFee = { mastercard: HK$, visa: HK$ }.
    const nf = flags.netFee && def.net ? Number(flags.netFee[def.net]) || 0 : 0;
    if (nf > 0 && amt > 0) {
      fee += nf / amt;
      why.push("Minus " + hkd(nf, nf % 1 ? 2 : 0) + ": the site's fee for " + (def.net === "visa" ? "Visa" : "Mastercard"));
    }
    // A lower fare for Visa (the tram): the saving counts as a rebate on what is paid.
    let fare = null;
    if (cat.visaFare) {
      const visa = def.net === "visa";
      fare = visa ? cat.visaFare : cat.fare;
      if (visa) {
        rebate += (cat.fare - cat.visaFare) / cat.visaFare;
        why.unshift("Visa fare: HK$" + cat.visaFare.toFixed(2) + " a ride instead of HK$" + cat.fare.toFixed(2));
      } else {
        why.unshift("Full fare: HK$" + cat.fare.toFixed(2) + " a ride. Only Visa cards get HK$" + (cat.fare - cat.visaFare).toFixed(0) + " off");
      }
    }
    return { id: cardId, rebate, fee, net: rebate - fee, why, cap, fare };
  }

  /* ---------- running totals ---------- */
  function newState() {
    const red = {}, hsm = {}, rh = {}, wel = {};
    return {
      red, hsm, rh, wel,
      redUse: (acct, m) => (red[acct] && red[acct][m]) || { online: 0, red8: 0 },
      hsMonth: (card, m) => (hsm[card] && hsm[card][m]) || { spend: 0, extra: 0 },
      redHotYtd: (p, y) => (rh[p] && rh[p][y]) || 0,
      welcome: (id) => wel[id] || 0,
    };
  }
  function welcomeWindows(cfg) {
    const out = [];
    const c = cfg.cards.citi;
    if (c && c.approvedOn) out.push({ id: "citi", start: c.approvedOn, end: addDays(c.approvedOn, cfg.welcome.citi.days), target: cfg.welcome.citi.target, reward: cfg.welcome.citi.reward });
    for (const id of ["hs_a", "hs_b"]) {
      const h = cfg.cards[id];
      if (h && h.issuedOn) out.push({ id, start: h.issuedOn, end: addDays(h.issuedOn, cfg.welcome[id].days), target: cfg.welcome[id].target, reward: cfg.welcome[id].reward });
    }
    return out;
  }
  function applyTxn(st, t, cfg, windows) {
    const cat = CATS[t.category];
    const def = CARDS[t.card];
    if (!cat || !def) return;
    const amt = Number(t.amount) || 0;
    const m = ym(t.date);
    if (def.kind === "red") {
      const a = st.red[t.card] || (st.red[t.card] = {});
      const u = a[m] || (a[m] = { online: 0, red8: 0 });
      if (cat.red8) u.red8 += amt;
      else if (cat.online) u.online += amt;
    }
    if (def.kind === "easy") {
      const p = def.holder;
      if (redHotApplies(p, cat, cfg, t.date)) {
        const y = yr(t.date);
        const r = st.rh[p] || (st.rh[p] = {});
        r[y] = (r[y] || 0) + amt;
      }
    }
    if (def.kind === "hs") {
      const a = st.hsm[t.card] || (st.hsm[t.card] = {});
      const u = a[m] || (a[m] = { spend: 0, extra: 0, potential: 0 });
      if (welcomeEligible(t.category)) u.spend += amt;
      const b = hsBonus(cat);
      if (b && cfg.cards[t.card] && cfg.cards[t.card].funRegistered) {
        u.potential += (b - 0.004) * amt;
        u.extra = Math.min(cfg.travelPlus.extraCap, u.potential);
      }
    }
    for (const w of windows) {
      if (w.id === t.card && t.date >= w.start && t.date <= w.end && welcomeEligible(t.category)) st.wel[w.id] = (st.wel[w.id] || 0) + amt;
    }
  }

  /* ---------- the advice ---------- */
  function candidates(payer, catId, cfg, date) {
    const cat = CATS[catId];
    const ids = ["easy_a", "easy_b", "citi", "hs_a", "hs_b", "red_a", "red_b"].filter((id) => usableBy(id, payer, cfg, date));
    if (cat.fx && usableBy("citiplus", payer, cfg, date)) ids.push("citiplus");
    if (cat.abroad) ids.push("cash");
    return ids;
  }
  function hsMonthMode(payer, date, cfg, openW) {
    const hs = payer === "a" ? "hs_a" : "hs_b";
    const c = cfg.cards[hs];
    if (!usableBy(hs, payer, cfg, date) || !c.funRegistered || date > cfg.travelPlus.promoEnd || cfg.travelPlus.monthMode === false) return false;
    return !openW.some((w) => w.id !== hs);
  }

  // q = { payer, date, catId, amount, flags }
  function recommend(q, st, cfg) {
    const payer = q.payer, date = q.date, catId = q.catId;
    const cat = CATS[catId];
    if (!cat) return null;
    const amount = Number(q.amount) || 0;
    const flags = q.flags || {};
    const windows = welcomeWindows(cfg);
    const openW = windows
      .filter((w) => date >= w.start && date <= w.end && st.welcome(w.id) < w.target && usableBy(w.id, payer, cfg, date))
      .sort((a, b) => (a.end < b.end ? -1 : 1));
    const hsCard = payer === "a" ? "hs_a" : "hs_b";
    const monthMode = hsMonthMode(payer, date, cfg, openW);
    const assumeHs = monthMode || openW.some((w) => w.id === hsCard);
    const ctx = { payer, date, amount, flags, cfg, st, assumeHs };

    const opts = candidates(payer, catId, cfg, date).map((id) => rateFor(id, catId, ctx));
    if (!opts.length) return null;
    opts.sort((a, b) => (b.net - a.net) || ((PREF[a.id] || 9) - (PREF[b.id] || 9)));
    let pick = opts[0];
    let mode = "best";
    const notes = [];

    if (cat.abroad) {
      const cash = opts.find((o) => o.id === "cash");
      if (cash && pick.id !== "cash" && pick.net < 0.005) pick = cash;
      notes.push("Pay in the local currency. If the terminal offers to charge you in HKD, refuse.");
    }

    // A Visa fare saving beats any welcome bonus push, so those purchases stay out of it.
    const W = welcomeEligible(catId) && !cat.visaFare ? openW[0] : null;
    if (W && !(cat.abroad && pick.id === "cash")) {
      const w = opts.find((o) => o.id === W.id);
      const done = st.welcome(W.id);
      const remaining = W.target - done;
      const daysLeft = dnum(W.end) - dnum(date) + 1;
      const behind = remaining > 0.8 * daysLeft * (cfg.dailySpend || 200);
      if (w) {
        const gap = pick.net - w.net;
        if (pick.id === W.id) mode = "welcome";
        else if (behind || gap < 0.015) { pick = w; mode = "welcome"; }
        const line = hkd(remaining) + " more on " + cardLabel(W.id) + " by " + dayLabel(W.end) + " unlocks " + W.reward + ".";
        if (mode === "welcome") notes.unshift("Welcome bonus first: " + line);
        else notes.push("Welcome bonus: still " + line + " This purchase earns more elsewhere, so keep the Citi for everyday spending.");
        if (behind) notes.push("You are behind schedule for the welcome bonus: put every purchase you can on " + cardLabel(W.id) + ".");
      }
    } else if (monthMode && cat.inPerson && !cat.abroad) {
      const h = opts.find((o) => o.id === hsCard);
      const mo = st.hsMonth(hsCard, ym(date));
      if (h && pick.id !== hsCard && pick.net - h.net < 0.015) { pick = h; mode = "hsmonth"; }
      if (pick.id === hsCard) {
        mode = "hsmonth";
        notes.push("Hang Seng month: " + hkd(mo.spend) + " of " + hkd(cfg.travelPlus.monthTarget) + " so far. Reaching it pays 5% on this month's restaurants.");
      }
    }

    // A card that is on its way and would do clearly better.
    const coming = [];
    for (const id of ["red_a", "red_b", "citi", "hs_a", "hs_b"]) {
      if (!holds(id, payer, cfg) && !(id === "citi" && payer === "b")) continue;
      if (cardActive(id, cfg, date)) continue;
      const st2 = cfg.cards[id] ? cfg.cards[id].status : "";
      if (st2 !== "pending" && st2 !== "planned") continue;
      const tmp = deepMerge(cfg, { cards: { [id]: { status: "active", since: "", approvedOn: "", issuedOn: "" } } });
      if (id === "citi" && payer === "b") tmp.cards.citi.suppCard = true;
      const r = rateFor(id, catId, Object.assign({}, ctx, { cfg: tmp }));
      if (r.net - pick.net >= 0.01) coming.push({ id, net: r.net });
    }
    coming.sort((a, b) => b.net - a.net);
    if (coming.length) notes.push("Once " + cardLabel(coming[0].id) + " is active it would earn " + pct(coming[0].net) + " here.");

    const alts = opts.filter((o) => o.id !== pick.id && o.id !== "cash").slice(0, 3);
    return { pick, alts, opts, mode, notes, welcome: W, monthMode, assumeHs, amount, catId };
  }

  // Sites that charge a fee by card network: how much more the best Mastercard earns than the best Visa,
  // before any such fee. The Mastercard stays ahead while its extra fee is below `gap` (a fraction of the price).
  function networkGap(q, st, cfg) {
    const flags = Object.assign({}, q.flags || {});
    delete flags.netFee;
    const r = recommend(Object.assign({}, q, { flags }), st, cfg);
    if (!r) return null;
    const best = (net) => r.opts.filter((o) => CARDS[o.id] && CARDS[o.id].net === net).sort((a, b) => b.net - a.net)[0] || null;
    const mc = best("mastercard"), visa = best("visa");
    return mc && visa ? { mc: mc.id, visa: visa.id, gap: mc.net - visa.net } : null;
  }

  /* ---------- the default card in the phone wallet ---------- */
  // Everyday purchases in person decide the default card (the first kind breaks ties).
  const EVERYDAY = ["retail", "dining", "grocery", "taxi"];
  // The kinds of place where another card can clearly do better than the default.
  const EXCEPTIONS = [
    { key: "online", cat: "online_hk", label: "Online shopping" },
    { key: "red8", cat: "red8_dining", label: "Sushiro, TamJai, other Red partners" },
    { key: "pns", cat: "home", flags: { moneyback: 1 }, label: "PARKnSHOP, Fortress" },
    { key: "home", cat: "home", label: "DS Groceries, other Home shops" },
    { key: "watsons", cat: "shopping", flags: { moneyback: 1 }, label: "Watsons" },
    { key: "dining", cat: "dining", label: "Restaurants" },
    { key: "tram", cat: "tram", label: "Tram" },
    { key: "wallet", cat: "wallet_buy", label: "Pinduoduo, Taobao (card in AlipayHK)" },
  ];
  function pickDefault(payer, date, st, cfg) {
    const recs = EVERYDAY.map((c) => recommend({ payer, date, catId: c, amount: 0, flags: {} }, st, cfg)).filter(Boolean);
    if (!recs.length) return null;
    const votes = {};
    recs.forEach((r, i) => { votes[r.pick.id] = (votes[r.pick.id] || 0) + (i === 0 ? 1.5 : 1); });
    const id = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
    if (!CARDS[id] || ["cash", "fps"].includes(CARDS[id].kind)) return null;
    const hit = recs.find((r) => r.pick.id === id && r.mode !== "best") || recs.find((r) => r.pick.id === id);
    return { id, mode: hit.mode, welcome: hit.mode === "welcome" ? hit.welcome : null };
  }
  // { id, mode, welcome, exceptions: [{ key, label, card, net, fare }], next: { from, id, mode } | null, coming: { id, mode } | null }
  function defaultCard(payer, date, st, cfg) {
    const d = pickDefault(payer, date, st, cfg);
    if (!d) return null;
    const exceptions = [];
    for (const x of EXCEPTIONS) {
      const r = recommend({ payer, date, catId: x.cat, amount: 0, flags: x.flags || {} }, st, cfg);
      if (!r || r.pick.id === d.id || r.pick.id === "cash") continue;
      const mine = r.opts.find((o) => o.id === d.id);
      // Same fare and (almost) the same rate: not worth switching cards.
      if (mine && mine.fare === r.pick.fare && r.pick.net - mine.net < 0.002) continue;
      exceptions.push({ key: x.key, label: x.label, card: r.pick.id, net: r.pick.net, fare: r.pick.fare });
    }
    // The next change: the day after a welcome window or the Hang Seng promo ends.
    const ends = welcomeWindows(cfg).filter((w) => w.end >= date && w.start <= date).map((w) => addDays(w.end, 1));
    if (cfg.travelPlus && cfg.travelPlus.promoEnd >= date) ends.push(addDays(cfg.travelPlus.promoEnd, 1));
    let next = null;
    for (const from of Array.from(new Set(ends)).sort()) {
      const n = pickDefault(payer, from, st, cfg);
      if (n && n.id !== d.id) { next = { from, id: n.id, mode: n.mode }; break; }
    }
    // A card on its way that would take over once it is active.
    let coming = null;
    for (const id of ["citi", payer === "a" ? "hs_a" : "hs_b"]) {
      const c = cfg.cards[id];
      if (!c || !holds(id, payer, cfg) || cardActive(id, cfg, date) || !["pending", "planned"].includes(c.status)) continue;
      const patch = id === "citi" ? { status: "active", since: "", approvedOn: date } : { status: "active", since: "", issuedOn: date, funRegistered: true };
      const sim = pickDefault(payer, date, st, deepMerge(cfg, { cards: { [id]: patch } }));
      if (sim && sim.id === id) { coming = { id, mode: sim.mode }; break; }
    }
    return { id: d.id, mode: d.mode, welcome: d.welcome, exceptions, next, coming };
  }

  /* ---------- checking what was actually paid ---------- */
  function sortTxns(txns) {
    return txns.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.id).localeCompare(String(b.id)));
  }
  function audit(txns, cfg) {
    const windows = welcomeWindows(cfg);
    const st = newState();
    const byId = {};
    for (const t of sortTxns(txns || [])) {
      const cat = CATS[t.category];
      const def = CARDS[t.card];
      if (cat && def && t.payer && ["easy", "red", "citi", "hs"].includes(def.kind)) {
        const rec = recommend({ payer: t.payer, date: t.date, catId: t.category, amount: t.amount, flags: t.flags || {} }, st, cfg);
        const actual = rateFor(t.card, t.category, { payer: t.payer, date: t.date, amount: Number(t.amount) || 0, flags: t.flags || {}, cfg, st, assumeHs: rec ? rec.assumeHs : false });
        const amount = Number(t.amount) || 0;
        let loss = 0, flagged = false, best = t.card, why = "";
        if (rec && rec.pick.id !== t.card && rec.pick.id !== "cash") {
          best = rec.pick.id;
          if (cat.visaFare && actual.fare != null && rec.pick.fare != null && actual.fare > rec.pick.fare) {
            // Paid the full fare: the loss is the fare difference, flagged even though it is small.
            loss = actual.fare - rec.pick.fare;
            flagged = true;
            why = "A Visa card (" + cardLabel(best) + ") pays HK$" + rec.pick.fare.toFixed(2) + " instead of HK$" + actual.fare.toFixed(2);
          } else {
            loss = Math.max(0, (rec.pick.net - actual.net) * amount);
            flagged = loss >= 5 || (rec.mode === "welcome" && amount >= 100);
            why = rec.mode === "welcome"
              ? "Should have gone on " + cardLabel(best) + " for the welcome bonus"
              : cardLabel(best) + " would have earned " + pct(rec.pick.net) + " instead of " + pct(actual.net);
          }
        }
        // earned = net of fees; rewards and fees separately, for the Spending totals.
        byId[t.id] = { earned: actual.net * amount, rewards: actual.rebate * amount, fees: actual.fee * amount, net: actual.net, best, bestNet: rec ? rec.pick.net : actual.net, loss, flagged, why, mode: rec ? rec.mode : "best" };
      }
      applyTxn(st, t, cfg, windows);
    }
    return { byId, state: st, windows };
  }

  /* ---------- the status report ---------- */
  function nextDue(today, day) {
    const y = Number(today.slice(0, 4)), mo = Number(today.slice(5, 7));
    const thisMonth = today.slice(0, 8) + String(day).padStart(2, "0");
    if (today <= thisMonth) return thisMonth;
    const ny = mo === 12 ? y + 1 : y, nm = mo === 12 ? 1 : mo + 1;
    return ny + "-" + String(nm).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  }
  function status(txns, cfg, today) {
    const res = audit(txns, cfg);
    const st = res.state;
    const m = ym(today);
    const daysTo = (d) => dnum(d) - dnum(today);
    const meters = [];

    // Two kinds of meter. A threshold is a minimum to spend to unlock a reward (welcome bonus, Hang Seng month);
    // `left` is what remains to spend. A cap is the most spending that earns a bonus rate; `left` is what can still
    // earn it, and `collected` is what the spending so far has earned at that rate.
    const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7));
    const nextMonth = (tm === 12 ? (ty + 1) + "-01" : ty + "-" + String(tm + 1).padStart(2, "0")) + "-01";
    const monthEnd = addDays(nextMonth, -1);
    for (const w of res.windows) {
      const done = st.welcome(w.id);
      const left = daysTo(w.end);
      const reached = done >= w.target;
      meters.push({ key: "wel_" + w.id, kind: "threshold", card: w.id, title: "Welcome bonus", used: done, cap: w.target,
        left: Math.max(0, w.target - done), deadline: w.end, daysLeft: left + 1, reached, closed: left < 0 && !reached, unlocks: w.reward, collected: 0,
        detail: reached ? "Done. Reward: " + w.reward : (left >= 0 ? hkd(w.target - done) + " to go by " + dayLabel(w.end) + " (" + (left + 1) + " days)" : "Window closed on " + dayLabel(w.end)),
        reward: w.reward, state: reached ? "good" : (left < 0 ? "bad" : ((w.target - done) > 0.8 * (left + 1) * (cfg.dailySpend || 200) ? "warn" : "info")) });
    }
    for (const id of ["hs_a", "hs_b"]) {
      const c = cfg.cards[id];
      if (!cardActive(id, cfg, today) || !c.funRegistered || today > cfg.travelPlus.promoEnd) continue;
      const u = st.hsMonth(id, m);
      const target = cfg.travelPlus.monthTarget, reached = u.spend >= target;
      meters.push({ key: id + "_mo", kind: "threshold", card: id, title: "Hang Seng month target", used: u.spend, cap: target,
        left: Math.max(0, target - u.spend), deadline: monthEnd, daysLeft: daysTo(monthEnd) + 1, reached, closed: false,
        unlocks: "5% +FUN Dollars at restaurants and abroad (7% in Asia), up to " + hkd(cfg.travelPlus.extraCap) + " extra this month",
        collected: reached ? Math.min(u.extra, cfg.travelPlus.extraCap) : 0, collectedOf: cfg.travelPlus.extraCap,
        detail: reached ? "Reached: " + hkd(Math.min(u.extra, cfg.travelPlus.extraCap)) + " of " + hkd(cfg.travelPlus.extraCap) + " bonus this month" : hkd(target - u.spend) + " more this month unlocks the bonus",
        state: reached ? "good" : "info" });
    }
    for (const id of ["red_a", "red_b"]) {
      if (!cardActive(id, cfg, today)) continue;
      const u = st.redUse(id, m);
      meters.push({ key: id + "_on", kind: "cap", card: id, title: "Online at 4%", used: u.online, cap: 10000, rate: 0.04, after: 0.004,
        left: Math.max(0, 10000 - u.online), collected: 0.04 * Math.min(u.online, 10000), resets: nextMonth,
        detail: hkd(Math.max(0, 10000 - u.online)) + " left this month", state: u.online >= 8000 ? "warn" : "info" });
      meters.push({ key: id + "_r8", kind: "cap", card: id, title: "Partner shops at 8%", used: u.red8, cap: 1250, rate: 0.08, after: 0.004,
        left: Math.max(0, 1250 - u.red8), collected: 0.08 * Math.min(u.red8, 1250), resets: nextMonth,
        detail: hkd(Math.max(0, 1250 - u.red8)) + " left this month", state: u.red8 >= 1250 ? "warn" : "info" });
    }
    for (const p of ["a", "b"]) {
      const r = cfg.redHot[p];
      if (!r || !r.cat) continue;
      const card = p === "a" ? "easy_a" : "easy_b";
      const used = st.redHotYtd(p, yr(today));
      const label = { home: "Home", shopping: "Shopping", dining: "Dining", overseas: "Overseas" }[r.cat];
      meters.push({ key: "rh_" + p, kind: "cap", card, title: "Red Hot " + label + " 5X", used, cap: 100000, rate: 0.024, after: 0.004,
        left: Math.max(0, 100000 - used), collected: 0.024 * Math.min(used, 100000), resets: (Number(yr(today)) + 1) + "-01-01",
        detail: hkd(used * 0.02) + " extra RewardCash so far", state: "info" });
    }

    // Max Miles: Rently's miles arrive a few days after each rent payment; `base` holds miles from elsewhere
    // (sign-up tasks, MoneyHero), `pending` miles tracked but not confirmed yet (shopping through HeyMax).
    const rentTx = sortTxns((txns || []).filter((t) => t.category === "rent" && t.card === "fps"));
    let credited = 0, pending = Number(cfg.miles.pending) || 0;
    rentTx.forEach((t, i) => {
      const miles = Number(t.miles) || (i < cfg.rently.promoPayments ? cfg.rently.promoMiles : cfg.rently.standardMiles);
      if (today >= addDays(t.date, Number(cfg.rently.creditDays) || 3)) credited += miles; else pending += miles;
    });
    const claimed = (txns || []).reduce((s, t) => s + (Number(t.claimedMiles) || 0), 0);
    const balance = (Number(cfg.miles.base) || 0) + credited - claimed;
    const miles = { balance, pending, value: balance * cfg.miles.rate, rate: cfg.miles.rate };

    // FlyAnywhere pays back a whole ticket in Max Miles (no partial claims), within 31 days of booking.
    const flights = (txns || []).filter((t) => t.flags && t.flags.flight).map((t) => {
      const deadline = addDays(t.date, 31);
      const amount = Number(t.amount) || 0;
      const needed = Math.ceil(amount / cfg.miles.rate);
      return { id: t.id, merchant: t.merchant, date: t.date, amount, payer: t.payer, card: t.card, deadline, daysLeft: daysTo(deadline),
        claimed: !!t.claimed, claimedMiles: Number(t.claimedMiles) || 0, needed, canClaim: balance >= needed };
    }).sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
    const due = nextDue(today, cfg.rently.dueDay);
    const payDay = Number(cfg.rently.payDay) || 0;
    const payBy = payDay > 0 && payDay < cfg.rently.dueDay ? due.slice(0, 8) + String(payDay).padStart(2, "0") : addDays(due, -6);
    const rently = { payments: rentTx.length, promoLeft: Math.max(0, cfg.rently.promoPayments - rentTx.length), nextDue: due, payBy,
      paidThisCycle: rentTx.some((t) => t.date > addDays(due, -25) && t.date <= due) };

    const alerts = [];
    const recent = addDays(today, -62);
    for (const t of sortTxns(txns || []).reverse()) {
      const a = res.byId[t.id];
      if (a && a.flagged && !t.ack && t.date >= recent) {
        alerts.push({ level: "bad", kind: "txn", id: t.id, text: (t.merchant || "Purchase") + " " + hkd(t.amount) + " on " + cardLabel(t.card), sub: a.why + (a.loss >= 1 ? " (" + hkd(a.loss) + " missed)" : "") });
      }
    }
    for (const f of flights) {
      if (!f.claimed && f.canClaim && f.daysLeft >= 0 && f.daysLeft <= 14) alerts.push({ level: f.daysLeft <= 5 ? "bad" : "warn", kind: "flight", id: f.id, text: "Pay back " + (f.merchant || "a flight") + " with Max Miles by " + dayLabel(f.deadline), sub: "FlyAnywhere: " + Math.round(f.needed).toLocaleString("en-US") + " Max Miles for the whole ticket, " + Math.round(balance).toLocaleString("en-US") + " available. HK$" + cfg.miles.rate.toFixed(2) + " a mile, paid by FPS." });
    }
    for (const mt of meters) {
      if (mt.key.startsWith("wel_") && mt.state === "warn") alerts.push({ level: "warn", kind: "welcome", text: "Behind on the " + cardLabel(mt.card) + " welcome bonus", sub: mt.detail });
    }
    const citi = cfg.cards.citi;
    if (citi && citi.status !== "active" && today <= cfg.welcome.citi.activateBy) {
      alerts.push({ level: "info", kind: "card", text: "Citi Cash Back: approve and activate by " + dayLabel(cfg.welcome.citi.activateBy), sub: "Then set the approval date in Cards so the 30-day welcome window is tracked" });
    }
    if (!rently.paidThisCycle && daysTo(rently.payBy) <= 4 && daysTo(rently.nextDue) >= 0) {
      alerts.push({ level: daysTo(rently.payBy) < 0 ? "bad" : "warn", kind: "rent", text: "Rent: send the FPS transfer to Rently by " + dayLabel(rently.payBy), sub: "Use the reference in Rently's email; it changes every month" });
    }
    return { meters, flights, miles, rently, alerts, audit: res.byId, state: st };
  }

  const api = {
    PEOPLE, setPeople, cardName, PROGRAMS, programsAt, HEYMAX, heymaxFor, pointsSummary, pointsAlerts, runLabel, runVerb,
    CARDS, CARD_ORDER, CATS, COUNTRIES, MERCHANTS, PROMOS, DEFAULT_CONFIG,
    mergeConfig, deepMerge, matchMerchants, promosFor, rateFor, recommend, networkGap, defaultCard, audit, status, newState,
    cardLabel, cardActive, usableBy, holds, welcomeWindows, abroadCat, norm, pct, hkd, addDays, ym, dayLabel, monthLabel,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WC = api;
})(typeof window !== "undefined" ? window : this);
