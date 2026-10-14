import { readFileSync } from "node:fs";

// The place catalogue both the server and the browser read (src/web/regions.json):
// canonical ids, display names, aliases, and approximate centres. A label is
// whatever the visitor chose, never a claim about where they are.
interface City {
  id: string;
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
}
interface Country extends Omit<City, "id"> {
  id: string;
  cities: City[];
}

export interface Place {
  country: string;
  city: string | null;
  label: string;
  lat: number;
  lng: number;
}

const catalogue = JSON.parse(readFileSync(new URL("./web/regions.json", import.meta.url), "utf8")) as {
  countries: Country[];
};

export const COUNTRIES = catalogue.countries;
const byId = new Map(COUNTRIES.map((c) => [c.id, c]));

// A country alone is valid; a city has to belong to the country it's sent with.
export function place(country: unknown, city: unknown): Place | undefined {
  if (typeof country !== "string") return undefined;
  const c = byId.get(country);
  if (!c) return undefined;
  if (city === undefined || city === null || city === "") {
    return { country: c.id, city: null, label: c.name, lat: c.lat, lng: c.lng };
  }
  const ct = typeof city === "string" ? c.cities.find((x) => x.id === city) : undefined;
  if (!ct) return undefined;
  return { country: c.id, city: ct.id, label: `${ct.name}, ${c.name}`, lat: ct.lat, lng: ct.lng };
}
