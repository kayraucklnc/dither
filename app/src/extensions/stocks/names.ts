// Short names for well-known symbols on the US exchanges (Finnhub's free plan
// covers those), so a row can say who it is. A symbol not here shows alone, or
// with the name written after it in settings.

export const NAMES: Readonly<Record<string, string>> = {
  AAPL: "Apple", MSFT: "Microsoft", NVDA: "NVIDIA", AMZN: "Amazon", GOOGL: "Alphabet", GOOG: "Alphabet",
  META: "Meta", TSLA: "Tesla", AVGO: "Broadcom", COST: "Costco", NFLX: "Netflix", AMD: "AMD",
  PEP: "PepsiCo", ADBE: "Adobe", CSCO: "Cisco", INTC: "Intel", QCOM: "Qualcomm", TXN: "Texas Instruments",
  INTU: "Intuit", AMGN: "Amgen", ISRG: "Intuitive Surgical", BKNG: "Booking", SBUX: "Starbucks", PYPL: "PayPal",
  ADP: "ADP", MU: "Micron", AMAT: "Applied Materials", LRCX: "Lam Research", KLAC: "KLA", ASML: "ASML",
  PDD: "PDD", MELI: "MercadoLibre", ABNB: "Airbnb", PANW: "Palo Alto Networks", CRWD: "CrowdStrike", MRVL: "Marvell",
  ARM: "Arm", PLTR: "Palantir", TMUS: "T-Mobile US", CMCSA: "Comcast", GILD: "Gilead", REGN: "Regeneron",
  VRTX: "Vertex", MDLZ: "Mondelez", CSX: "CSX", MAR: "Marriott", ORLY: "O'Reilly", CTAS: "Cintas",
  SNPS: "Synopsys", CDNS: "Cadence", FTNT: "Fortinet", DDOG: "Datadog", ZS: "Zscaler", TEAM: "Atlassian",
  WDAY: "Workday", ADSK: "Autodesk", EA: "Electronic Arts", TTWO: "Take-Two", DXCM: "Dexcom", IDXX: "IDEXX",
  LULU: "Lululemon", ROST: "Ross Stores", KDP: "Keurig Dr Pepper", KHC: "Kraft Heinz", MNST: "Monster Beverage",
  PCAR: "PACCAR", FAST: "Fastenal", ODFL: "Old Dominion", CPRT: "Copart", PAYX: "Paychex", CTSH: "Cognizant",
  NXPI: "NXP", MCHP: "Microchip", ON: "onsemi", ADI: "Analog Devices", BIIB: "Biogen", CEG: "Constellation Energy",
  HON: "Honeywell", COIN: "Coinbase", EXC: "Exelon", XEL: "Xcel Energy", AEP: "American Electric Power",
  QQQ: "Nasdaq-100",
  // The New York Stock Exchange, and companies from abroad listed in New York.
  "BRK.B": "Berkshire Hathaway", JPM: "JPMorgan Chase", V: "Visa", MA: "Mastercard", KO: "Coca-Cola", DIS: "Disney",
  WMT: "Walmart", XOM: "ExxonMobil", JNJ: "Johnson & Johnson", PG: "Procter & Gamble", BAC: "Bank of America",
  NKE: "Nike", MCD: "McDonald's", BA: "Boeing", GS: "Goldman Sachs", IBM: "IBM", ORCL: "Oracle", CRM: "Salesforce",
  UBER: "Uber", TSM: "TSMC", BABA: "Alibaba", SONY: "Sony", TM: "Toyota", NVO: "Novo Nordisk", SHOP: "Shopify",
  // Funds that follow an index.
  SPY: "S&P 500", VOO: "S&P 500 (Vanguard)", DIA: "Dow Jones", IWM: "Russell 2000", VTI: "US total market",
};
