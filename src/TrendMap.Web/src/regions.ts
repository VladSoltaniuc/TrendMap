export interface Region {
  code: string;
  name: string;
}

// Subset of the most-requested geos. Empty string = Worldwide (Google Trends convention).
export const REGIONS: Region[] = [
  { code: "", name: "Worldwide" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "IN", name: "India" },
  { code: "CN", name: "China" },
  { code: "RU", name: "Russia" },
  { code: "ZA", name: "South Africa" },
  { code: "RO", name: "Romania" },
];

export const TIMEFRAMES = [
  { value: "today 5-y", label: "Past 5 years" },
  { value: "today 12-m", label: "Past 12 months" },
];
