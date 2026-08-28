import { FACTIONS } from "../../../catalogs/WorldExpansionCatalog";

export const factionFor = (id?: string) =>
  FACTIONS.find((faction) => faction.id === id);
