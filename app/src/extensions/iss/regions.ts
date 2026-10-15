// Rough boxes for saying what the station is over, first match wins: land
// before the oceans around it. [name, south, north, west, east] in degrees.
// The ISS never goes beyond 52° north or south.

export const REGIONS: [string, number, number, number, number][] = [
  ["the Mediterranean", 31, 45, -5, 36],
  ["Europe", 36, 60, -10, 40],
  ["the Middle East", 12, 37, 34, 60],
  ["Central Asia", 37, 60, 40, 90],
  ["India", 6, 30, 68, 90],
  ["Japan", 30, 46, 129, 146],
  ["East Asia", 20, 60, 90, 130],
  ["Southeast Asia", -10, 20, 95, 130],
  ["Australia", -40, -10, 113, 154],
  ["New Zealand", -48, -34, 166, 179],
  ["North Africa", 15, 37, -17, 34],
  ["Africa", -35, 15, -17, 51],
  ["the United States", 25, 49, -125, -67],
  ["Canada", 49, 60, -140, -55],
  ["Mexico", 14, 25, -117, -87],
  ["the Caribbean", 10, 25, -87, -60],
  ["South America", -56, 12, -81, -35],
  ["the North Atlantic", 0, 60, -80, -5],
  ["the South Atlantic", -60, 0, -70, 20],
  ["the Indian Ocean", -60, 25, 20, 120],
  ["the North Pacific", 0, 60, 120, 180],
  ["the North Pacific", 0, 60, -180, -80],
  ["the South Pacific", -60, 0, 120, 180],
  ["the South Pacific", -60, 0, -180, -70],
];
