import type { WorldFeatureId } from "../../../../gameplay/core/WorldTypes";

export const WORLD_PAGE_IDS = [
  "map",
  "hero",
  "career",
  "class-change",
  "arsenal",
  "skills",
  "forge",
  "legacy",
  "collections",
  "shop",
  "leaders",
  "elite",
  "chronicle",
  "fighters",
  "relics",
  "contracts",
  "history",
] as const;

export type WorldPageId = (typeof WORLD_PAGE_IDS)[number];

export const WORLD_NAV_GROUPS = [
  "map",
  "hero",
  "equipment",
  "shop",
  "ratings",
  "world",
] as const;
export type WorldNavGroup = (typeof WORLD_NAV_GROUPS)[number];

export const WORLD_PAGE_NAV_GROUP: Readonly<
  Record<WorldPageId, WorldNavGroup>
> = {
  map: "map",
  hero: "hero",
  career: "hero",
  "class-change": "hero",
  arsenal: "equipment",
  skills: "equipment",
  forge: "equipment",
  legacy: "equipment",
  collections: "equipment",
  shop: "shop",
  leaders: "ratings",
  elite: "ratings",
  chronicle: "world",
  fighters: "world",
  relics: "world",
  history: "world",
  contracts: "world",
};

export const WORLD_PAGE_FEATURE: Readonly<
  Partial<Record<WorldPageId, WorldFeatureId>>
> = {
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
