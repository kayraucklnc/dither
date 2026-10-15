// Airlines by the ICAO code that opens their callsigns ("THY1TU" is Turkish
// Airlines). Every entry is spelled out in the blob wherever a name is shown,
// so this is the airlines a panel is likely to see, not all of them. ASCII
// only: names print at sizes whose fonts carry nothing else.

export const AIRLINES: Record<string, string> = {
  // North America
  AAL: "American", DAL: "Delta", UAL: "United", SWA: "Southwest", ASA: "Alaska", JBU: "JetBlue",
  NKS: "Spirit", FFT: "Frontier", SKW: "SkyWest", ENY: "Envoy", RPA: "Republic", HAL: "Hawaiian",
  ACA: "Air Canada", WJA: "WestJet", ROU: "Air Canada Rouge", POE: "Porter", TSC: "Air Transat",
  AMX: "Aeromexico", VIV: "VivaAerobus", VOI: "Volaris",
  // Europe
  BAW: "British Airways", SHT: "British Airways", VIR: "Virgin Atlantic", EZY: "easyJet", EJU: "easyJet",
  EZS: "easyJet", EXS: "Jet2", TOM: "TUI", LOG: "Loganair", BCY: "CityJet", EIN: "Aer Lingus",
  RYR: "Ryanair", RUK: "Ryanair", LDM: "Lauda", MAY: "Malta Air", WZZ: "Wizz Air", WMT: "Wizz Air",
  WUK: "Wizz Air", WAZ: "Wizz Air", DLH: "Lufthansa", CLH: "Lufthansa", EWG: "Eurowings", EWL: "Eurowings",
  CFG: "Condor", TUI: "TUI", DLA: "Air Dolomiti", SWR: "Swiss", EDW: "Edelweiss", AUA: "Austrian",
  BEL: "Brussels Airlines", AFR: "Air France", HOP: "Air France", KLM: "KLM", KLC: "KLM", TRA: "Transavia",
  TVF: "Transavia", IBE: "Iberia", IBS: "Iberia Express", ANE: "Air Nostrum", VLG: "Vueling",
  AEA: "Air Europa", VOE: "Volotea", TAP: "TAP Air Portugal", ITY: "ITA Airways", NOS: "Neos",
  SAS: "SAS", NAX: "Norwegian", NSZ: "Norwegian", NOZ: "Norwegian", FIN: "Finnair", ICE: "Icelandair",
  BTI: "airBaltic", LOT: "LOT", CSA: "Czech Airlines", TVS: "Smartwings", ENT: "Enter Air",
  ROT: "TAROM", AEE: "Aegean", OAL: "Olympic", CTN: "Croatia Airlines", ASL: "Air Serbia",
  THY: "Turkish Airlines", PGT: "Pegasus", SXS: "SunExpress", AJA: "AJet", KZR: "Air Astana",
  AFL: "Aeroflot", AHY: "Azerbaijan Airlines",
  // Middle East and Africa
  UAE: "Emirates", QTR: "Qatar Airways", ETD: "Etihad", FDB: "flydubai", ABY: "Air Arabia",
  SVA: "Saudia", FAD: "flyadeal", KNE: "flynas", GFA: "Gulf Air", OMA: "Oman Air", KAC: "Kuwait Airways",
  RJA: "Royal Jordanian", MEA: "Middle East Airlines", ELY: "El Al", MSR: "EgyptAir",
  RAM: "Royal Air Maroc", TAR: "Tunisair", DAH: "Air Algerie", ETH: "Ethiopian", KQA: "Kenya Airways",
  SAA: "South African", RWD: "RwandAir",
  // Asia and Oceania
  AIC: "Air India", IGO: "IndiGo", AXB: "Air India Express", VTI: "Vistara", SIA: "Singapore Airlines",
  TGW: "Scoot", CPA: "Cathay Pacific", JAL: "Japan Airlines", ANA: "ANA", KAL: "Korean Air",
  AAR: "Asiana", CCA: "Air China", CES: "China Eastern", CSN: "China Southern", CHH: "Hainan",
  EVA: "EVA Air", CAL: "China Airlines", THA: "Thai", MAS: "Malaysia Airlines", AXM: "AirAsia",
  GIA: "Garuda", PAL: "Philippine Airlines", CEB: "Cebu Pacific", VJC: "VietJet", HVN: "Vietnam Airlines",
  QFA: "Qantas", ANZ: "Air New Zealand", VOZ: "Virgin Australia", JST: "Jetstar",
  // Latin America
  TAM: "LATAM", LAN: "LATAM", AVA: "Avianca", CMP: "Copa", GLO: "Gol", AZU: "Azul",
  ARG: "Aerolineas Argentinas", SKU: "Sky Airline",
  // Cargo and business
  FDX: "FedEx", UPS: "UPS", GTI: "Atlas Air", DHK: "DHL", BCS: "DHL", DHX: "DHL", CLX: "Cargolux",
  NJE: "NetJets", EJA: "NetJets", VJT: "VistaJet",
};
