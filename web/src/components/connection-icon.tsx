import { Calendar, ChartCandlestick, CreditCard, House, Link2 } from "lucide-react";

const ICONS: Record<string, typeof Link2> = {
  calendar: Calendar,
  card: CreditCard,
  chart: ChartCandlestick,
  home: House,
};

/** The provider's own glyph, so the list is scannable by shape not by reading. */
export function ConnectionIcon({ name }: { name: string }) {
  const Icon = ICONS[name] ?? Link2;
  return <Icon size={18} />;
}
