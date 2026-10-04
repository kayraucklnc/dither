import { defineExtension } from "../api";

const COINS = [
  { value: "bitcoin", label: "Bitcoin", symbol: "BTC" },
  { value: "ethereum", label: "Ethereum", symbol: "ETH" },
  { value: "solana", label: "Solana", symbol: "SOL" },
  { value: "dogecoin", label: "Dogecoin", symbol: "DOGE" },
  { value: "cardano", label: "Cardano", symbol: "ADA" },
];
const CURRENCIES = [
  { value: "usd", label: "US dollar", sign: "$" },
  { value: "eur", label: "Euro", sign: "€" },
  { value: "try", label: "Turkish lira", sign: "₺" },
  { value: "gbp", label: "Pound", sign: "£" },
];

export default defineExtension({
  id: "crypto",
  name: "Crypto price",
  description: "A coin's price and how it moved today, from CoinGecko.",
  icon: "bitcoin",
  category: "data",
  size: { min: [4, 2], default: [6, 3] },
  fields: [
    { key: "coin", label: "Coin", kind: "select", options: COINS.map(({ value, label }) => ({ value, label })) },
    { key: "currency", label: "In", kind: "select", options: CURRENCIES.map(({ value, label }) => ({ value, label })) },
  ],
  defaults: () => ({ coin: "bitcoin", currency: "usd" }),
  title: (s) => `${COINS.find((c) => c.value === s.coin)?.label ?? "Coin"} price`,
  source(s) {
    const coin = String(s.coin);
    const cur = String(s.currency);
    return {
      url: `https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=${cur}&include_24hr_change=true`,
      every: 15,
      values: { price: `${coin}.${cur}`, change: `${coin}.${cur}_24h_change` },
    };
  },
  sample: () => ({ price: 67412.5, change: 2.31 }),
  facts: () => [
    { key: "price", label: "Price", type: "number", value: "price" },
    { key: "change", label: "Change today", type: "number", value: "change", unit: "%" },
  ],
  draw(d, s) {
    const coin = COINS.find((c) => c.value === s.coin) ?? COINS[0];
    const sign = CURRENCIES.find((c) => c.value === s.currency)?.sign ?? "";
    const headH = Math.round(d.height * 0.3);
    const headSize = d.fit([`${coin.symbol}  +88.8%`], d.width, headH);
    d.text(coin.symbol, { x: 0, y: 0, w: d.width, h: headH, size: headSize, weight: 700, valign: "middle" });
    const changeW = d.measure("+88.8%", headSize) + headH;
    d.iconFor("change", { steps: { t: [0], o: ["trending-down", "trending-up"] } }, ["trending-down", "trending-up"],
      { x: d.width - changeW, y: 0, w: headH, h: headH });
    d.text([d.value("change", { num: { d: 1 } }), "%"], { x: d.width - changeW + headH, y: 0, w: changeW - headH, h: headH, size: headSize, align: "right", valign: "middle" });
    const size = d.fit([`${sign}88,888.88`], d.width, d.height - headH, { weight: 700 });
    d.text([sign, d.value("price", { num: { d: 2, sep: "," } })], { x: 0, y: headH, w: d.width, h: d.height - headH, size, weight: 700, valign: "middle" });
  },
});
