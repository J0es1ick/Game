import type { WorldFeatureId } from "../gameplay/WorldTypes";

export const WORLD_PAGE_IDS = [
  "map",
  "hero",
  "arsenal",
  "forge",
  "legacy",
  "skills",
  "contracts",
  "collections",
  "shop",
  "leaders",
  "elite",
  "chronicle",
] as const;

export type WorldPageId = typeof WORLD_PAGE_IDS[number];

export const WORLD_NAV_GROUPS = ["map", "hero", "equipment", "shop", "ratings", "world"] as const;
export type WorldNavGroup = typeof WORLD_NAV_GROUPS[number];

export const WORLD_PAGE_NAV_GROUP: Readonly<Record<WorldPageId, WorldNavGroup>> = {
  map: "map",
  hero: "hero",
  skills: "hero",
  arsenal: "equipment",
  forge: "equipment",
  legacy: "equipment",
  collections: "equipment",
  shop: "shop",
  leaders: "ratings",
  elite: "ratings",
  chronicle: "world",
  contracts: "world",
};

export const WORLD_PAGE_FEATURE: Readonly<Partial<Record<WorldPageId, WorldFeatureId>>> = {
  contracts: "contracts",
  legacy: "equipment-legacy",
};

export function isWorldPageAvailable(
  page: WorldPageId,
  isFeatureUnlocked: (feature: WorldFeatureId) => boolean,
): boolean {
  const feature = WORLD_PAGE_FEATURE[page];
  return !feature || isFeatureUnlocked(feature);
}
