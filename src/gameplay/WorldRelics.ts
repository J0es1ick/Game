import { ITEM_TEMPLATES } from "../catalogs/WorldCatalog";
import { EquipmentItem, EquipmentSlot, ItemAffix, Stats, WorldRelicRecord } from "./WorldTypes";

export type WorldRelicLegacyKind = "conquest" | "blood" | "journey";

export interface WorldRelicLegacy {
  kind: WorldRelicLegacyKind;
  stage: 1 | 2 | 3;
  name: string;
  description: string;
  property: ItemAffix;
}

export interface WorldRelicPlacement {
  key: string;
  item: EquipmentItem;
  status: WorldRelicRecord["status"];
  ownerId?: string;
  ownerName?: string;
}

export interface WorldRelicRegistryIssue {
  kind: "duplicate-record" | "duplicate-placement" | "missing-record" | "missing-item" | "forbidden-item" | "owner-mismatch";
  relicId: string;
  placementKeys: string[];
}

export interface WorldRelicRegistryAudit {
  issues: WorldRelicRegistryIssue[];
  canonicalPlacementKeys: Record<string, string>;
}

export interface WorldRelicRegistryReconciliation extends WorldRelicRegistryAudit {
  records: WorldRelicRecord[];
  placements: WorldRelicPlacement[];
  removedPlacementKeys: string[];
  sanitizedPlacementKeys: string[];
}

const RELIC_STATUS = new Set<WorldRelicRecord["status"]>(["wielded", "lost", "shop"]);
const LEGACY_EPITHETS: Record<WorldRelicLegacyKind, [string, string, string]> = {
  conquest: ["Свидетель побед", "Знамя чемпионов", "Воля королей"],
  blood: ["Помнящая кровь", "Последний приговор", "Гибель героев"],
  journey: ["След прежних рук", "Странница эпох", "Вечный путь"],
};
const GENERATED_EPITHETS = new Set(Object.values(LEGACY_EPITHETS).flat());

function cloneItem(item: EquipmentItem): EquipmentItem {
  return {
    ...item,
    stats: { ...item.stats },
    allowedClasses: item.allowedClasses === "all" ? "all" : [...item.allowedClasses],
    affix: item.affix ? { ...item.affix } : undefined,
    relicHistory: [...(item.relicHistory ?? [])],
    relicFeats: [...(item.relicFeats ?? [])],
    relicProperties: (item.relicProperties ?? []).map((property) => ({ ...property })),
  };
}

function uniqueLines(lines: readonly string[]): string[] {
  return [...new Set(lines.filter((line) => typeof line === "string" && line.trim().length > 0))].slice(-40);
}

function historyDay(historyEntry: string | undefined): number | undefined {
  const match = historyEntry?.match(/(?:День|день)\s+(\d+)/u);
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function ownerStem(ownerName: string): string {
  return ownerName.replace(/\s+[A-ZА-ЯЁ]\.\s*$/u, "").trim() || "неизвестного владельца";
}

function relicBaseName(name: string): string {
  const parts = name.split(" · ");
  return GENERATED_EPITHETS.has(parts[parts.length - 1]) ? parts.slice(0, -1).join(" · ") : name;
}

function slotNoun(slot: EquipmentSlot): string {
  const nouns: Record<EquipmentSlot, string> = {
    weapon: "Оружие",
    offhand: "Клятва",
    head: "Лик",
    chest: "Мантия",
    hands: "Хватка",
    feet: "Шаг",
  };
  return nouns[slot];
}

function legacyKind(record: WorldRelicRecord): WorldRelicLegacyKind {
  const chronicle = record.history.join(" ").toLocaleLowerCase("ru-RU");
  const blood = (chronicle.match(/погиб|смерт|убил|кров|расправ/gu) ?? []).length;
  const conquest = (chronicle.match(/чемпион|побед|титул|легенд/gu) ?? []).length;
  const journey = (chronicle.match(/наш[её]л|лавк|продал|приобр[её]л|затерял|эпох/gu) ?? []).length
    + Math.max(0, record.formerOwners.length - 1);
  if (blood > conquest && blood >= journey) return "blood";
  if (conquest >= journey) return "conquest";
  return "journey";
}

function legacyStage(record: WorldRelicRecord): 1 | 2 | 3 {
  const renown = Math.max(0, record.item.relicRenown ?? 0);
  const memories = record.history.length + Math.max(0, record.formerOwners.length - 1) * 2 + Math.floor(renown / 6);
  return memories >= 10 ? 3 : memories >= 5 ? 2 : 1;
}

function legacyProperty(kind: WorldRelicLegacyKind, stage: 1 | 2 | 3): ItemAffix {
  if (kind === "blood") {
    return { name: "Память крови", description: "Реликвия помнит смертельные поединки прежних владельцев.", stat: "attack", value: 3 + stage * 3 };
  }
  if (kind === "journey") {
    return { name: "Память пути", description: "Смена хозяев научила реликвию отвечать на новый ритм боя.", stat: "speed", value: 2 + stage * 2 };
  }
  return { name: "Память триумфа", description: "Громкие победы укрепили волю, заключённую в реликвии.", stat: "defense", value: 3 + stage * 3 };
}

export function isWorldRelicEligible(item: EquipmentItem): boolean {
  const template = ITEM_TEMPLATES.find((candidate) => candidate.id === item.templateId);
  return Boolean(template && !template.exclusiveToBoss && !template.exclusiveToElite && item.setId !== "crown-sovereign");
}

export function assertWorldRelicEligible(item: EquipmentItem): void {
  if (!isWorldRelicEligible(item)) {
    throw new Error("Регалии короны и уникальные трофеи боссов не могут стать мировыми реликвиями.");
  }
}

export function stripWorldRelicIdentity(item: EquipmentItem): EquipmentItem {
  const stripped = cloneItem(item);
  stripped.worldRelicId = undefined;
  return stripped;
}

export function initialWorldRelicName(item: EquipmentItem, ownerName: string): string {
  return `${slotNoun(item.slot)} ${ownerStem(ownerName)}`;
}

export function deriveWorldRelicLegacy(record: WorldRelicRecord): WorldRelicLegacy {
  const kind = legacyKind(record);
  const stage = legacyStage(record);
  const property = legacyProperty(kind, stage);
  const baseName = relicBaseName(record.item.relicName ?? record.item.name);
  return {
    kind,
    stage,
    name: stage === 1 ? baseName : `${baseName} · ${LEGACY_EPITHETS[kind][stage - 1]}`,
    description: property.description,
    property,
  };
}

export function worldRelicLegacyBonus(record: WorldRelicRecord): Partial<Stats> {
  const property = record.legacyProperty ?? deriveWorldRelicLegacy(record).property;
  return { [property.stat]: property.value };
}

export function synchronizeWorldRelic(
  record: WorldRelicRecord,
  item: EquipmentItem,
  historyEntry?: string,
  day?: number,
): WorldRelicRecord {
  if (item.worldRelicId && item.worldRelicId !== record.id) throw new Error("Предмет связан с другой мировой реликвией.");
  const history = uniqueLines([...record.history, ...(item.relicHistory ?? []), ...(historyEntry ? [historyEntry] : [])]);
  const canonical = cloneItem(item);
  canonical.worldRelicId = record.id;
  canonical.relicHistory = history;
  const next: WorldRelicRecord = {
    ...record,
    item: canonical,
    formerOwners: [...new Set(record.formerOwners)],
    history,
  };
  const legacy = deriveWorldRelicLegacy(next);
  next.item.relicName = legacy.name;
  next.item.relicProperties = [
    ...(next.item.relicProperties ?? []).filter((property) => !property.name.startsWith("Память ")),
    { ...legacy.property },
  ];
  return {
    ...next,
    legacyKind: legacy.kind,
    legacyStage: legacy.stage,
    legacyProperty: { ...legacy.property },
    lastSyncedDay: day ?? historyDay(historyEntry) ?? record.lastSyncedDay,
  };
}

export function transferWorldRelic(
  record: WorldRelicRecord,
  item: EquipmentItem,
  ownerId: string,
  ownerName: string,
  historyEntry: string,
): { record: WorldRelicRecord; item: EquipmentItem } {
  const synchronized = synchronizeWorldRelic(record, item, historyEntry);
  let nextRecord: WorldRelicRecord = {
    ...synchronized,
    status: "wielded",
    currentOwnerId: ownerId,
    currentOwnerName: ownerName,
    formerOwners: [...new Set([...synchronized.formerOwners, ownerName])],
  };
  nextRecord = synchronizeWorldRelic(nextRecord, nextRecord.item, undefined, historyDay(historyEntry));
  nextRecord.item.relicHistory = [...nextRecord.history];
  return { record: nextRecord, item: cloneItem(nextRecord.item) };
}

export function releaseWorldRelic(
  record: WorldRelicRecord,
  item: EquipmentItem,
  historyEntry: string,
): { record: WorldRelicRecord; item: EquipmentItem } {
  const synchronized = synchronizeWorldRelic(record, item, historyEntry);
  const nextRecord: WorldRelicRecord = {
    ...synchronized,
    status: "lost",
    currentOwnerId: undefined,
    currentOwnerName: undefined,
  };
  nextRecord.item.relicHistory = [...nextRecord.history];
  return { record: nextRecord, item: cloneItem(nextRecord.item) };
}

export function placeWorldRelicInShop(
  record: WorldRelicRecord,
  shopName: string,
  historyEntry: string,
): { record: WorldRelicRecord; item: EquipmentItem } {
  const synchronized = synchronizeWorldRelic(record, record.item, historyEntry);
  const nextRecord: WorldRelicRecord = {
    ...synchronized,
    status: "shop",
    currentOwnerId: undefined,
    currentOwnerName: shopName,
  };
  nextRecord.item.relicHistory = [...nextRecord.history];
  return { record: nextRecord, item: cloneItem(nextRecord.item) };
}

export function normalizeWorldRelicRecord(record: WorldRelicRecord): WorldRelicRecord {
  const history = uniqueLines([...(record.history ?? []), ...(record.item?.relicHistory ?? [])]);
  const status = RELIC_STATUS.has(record.status) ? record.status : "lost";
  const wielded = status === "wielded" && Boolean(record.currentOwnerId);
  const item = cloneItem(record.item);
  item.worldRelicId = record.id;
  item.relicHistory = history;
  const normalized: WorldRelicRecord = {
    ...record,
    item,
    status: wielded ? "wielded" : status === "shop" ? "shop" : "lost",
    currentOwnerId: wielded ? record.currentOwnerId : undefined,
    currentOwnerName: wielded || status === "shop" ? record.currentOwnerName : undefined,
    formerOwners: [...new Set(record.formerOwners ?? [])],
    history,
  };
  const legacy = deriveWorldRelicLegacy(normalized);
  normalized.item.relicName = legacy.name;
  normalized.item.relicProperties = [
    ...(normalized.item.relicProperties ?? []).filter((property) => !property.name.startsWith("Память ")),
    { ...legacy.property },
  ];
  return {
    ...normalized,
    legacyKind: legacy.kind,
    legacyStage: legacy.stage,
    legacyProperty: { ...legacy.property },
    lastSyncedDay: Math.max(1, Math.floor(Number(record.lastSyncedDay) || record.createdDay || 1)),
  };
}

export function deduplicateWorldRelicRecords(records: readonly WorldRelicRecord[]): WorldRelicRecord[] {
  const byId = new Map<string, WorldRelicRecord>();
  records.forEach((source) => {
    if (!source?.id || !source.item || !isWorldRelicEligible(source.item)) return;
    const record = normalizeWorldRelicRecord(source);
    const previous = byId.get(record.id);
    if (!previous) {
      byId.set(record.id, record);
      return;
    }
    const latest = record.history.length >= previous.history.length ? record : previous;
    const merged = synchronizeWorldRelic(latest, latest.item);
    merged.createdDay = Math.min(previous.createdDay, record.createdDay);
    merged.formerOwners = [...new Set([...previous.formerOwners, ...record.formerOwners])];
    merged.history = uniqueLines([...previous.history, ...record.history]);
    merged.item.relicHistory = [...merged.history];
    byId.set(record.id, synchronizeWorldRelic(merged, merged.item));
  });
  return [...byId.values()];
}

export function auditWorldRelicRegistry(
  records: readonly WorldRelicRecord[],
  placements: readonly WorldRelicPlacement[],
): WorldRelicRegistryAudit {
  const issues: WorldRelicRegistryIssue[] = [];
  const canonicalPlacementKeys: Record<string, string> = {};
  const recordGroups = new Map<string, WorldRelicRecord[]>();
  records.forEach((record) => {
    if (!record?.id) return;
    const group = recordGroups.get(record.id) ?? [];
    group.push(record);
    recordGroups.set(record.id, group);
  });
  recordGroups.forEach((group, relicId) => {
    if (group.length > 1) issues.push({ kind: "duplicate-record", relicId, placementKeys: [] });
  });
  const placementGroups = new Map<string, WorldRelicPlacement[]>();
  placements.forEach((placement) => {
    const relicId = placement.item.worldRelicId;
    if (!relicId) return;
    const group = placementGroups.get(relicId) ?? [];
    group.push(placement);
    placementGroups.set(relicId, group);
    if (!isWorldRelicEligible(placement.item)) {
      issues.push({ kind: "forbidden-item", relicId, placementKeys: [placement.key] });
    }
  });
  placementGroups.forEach((group, relicId) => {
    const record = recordGroups.get(relicId)?.[0];
    if (!record) issues.push({ kind: "missing-record", relicId, placementKeys: group.map((placement) => placement.key) });
    const preferred = group.find((placement) => placement.status === record?.status
      && (!record?.currentOwnerId || placement.ownerId === record.currentOwnerId)) ?? group[0];
    canonicalPlacementKeys[relicId] = preferred.key;
    if (group.length > 1) issues.push({ kind: "duplicate-placement", relicId, placementKeys: group.map((placement) => placement.key) });
    if (record && (record.status !== preferred.status
      || (record.status === "wielded" && record.currentOwnerId !== preferred.ownerId))) {
      issues.push({ kind: "owner-mismatch", relicId, placementKeys: [preferred.key] });
    }
  });
  recordGroups.forEach((_, relicId) => {
    if (!placementGroups.has(relicId) && records.find((record) => record.id === relicId)?.status !== "lost") {
      issues.push({ kind: "missing-item", relicId, placementKeys: [] });
    }
  });
  return { issues, canonicalPlacementKeys };
}

export function reconcileWorldRelicRegistry(
  sourceRecords: readonly WorldRelicRecord[],
  sourcePlacements: readonly WorldRelicPlacement[],
  day: number,
): WorldRelicRegistryReconciliation {
  const audit = auditWorldRelicRegistry(sourceRecords, sourcePlacements);
  const placements = sourcePlacements.map((placement) => ({ ...placement, item: cloneItem(placement.item) }));
  const forbiddenIds = new Set(placements
    .filter((placement) => placement.item.worldRelicId && !isWorldRelicEligible(placement.item))
    .map((placement) => placement.item.worldRelicId!));
  const records = deduplicateWorldRelicRecords(sourceRecords)
    .filter((record) => !forbiddenIds.has(record.id) && isWorldRelicEligible(record.item));
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const placementGroups = new Map<string, WorldRelicPlacement[]>();
  placements.forEach((placement) => {
    const relicId = placement.item.worldRelicId;
    if (!relicId || forbiddenIds.has(relicId)) return;
    const group = placementGroups.get(relicId) ?? [];
    group.push(placement);
    placementGroups.set(relicId, group);
  });
  placementGroups.forEach((group, relicId) => {
    if (recordsById.has(relicId)) return;
    const placement = group[0];
    const ownerName = placement.ownerName ?? "неизвестный владелец";
    const recovered = createRecoveredRecord(relicId, placement, ownerName, day);
    records.push(recovered);
    recordsById.set(relicId, recovered);
  });
  const forbiddenPlacements = placements.filter((placement) => placement.item.worldRelicId
    && forbiddenIds.has(placement.item.worldRelicId));
  const sanitizedPlacementKeys = forbiddenPlacements.map((placement) => placement.key);
  const keptPlacements: WorldRelicPlacement[] = forbiddenPlacements.map((placement) => ({
    ...placement,
    item: stripWorldRelicIdentity(placement.item),
  }));
  const removedPlacementKeys: string[] = [];
  records.forEach((record, index) => {
    const group = placementGroups.get(record.id) ?? [];
    if (group.length === 0) {
      const released = releaseWorldRelic(record, record.item, `День ${Math.max(1, day)}: местонахождение реликвии было восстановлено по летописи.`).record;
      records[index] = released;
      recordsById.set(record.id, released);
      return;
    }
    const canonicalKey = audit.canonicalPlacementKeys[record.id] ?? group[0].key;
    const canonical = group.find((placement) => placement.key === canonicalKey) ?? group[0];
    group.filter((placement) => placement.key !== canonical.key).forEach((placement) => removedPlacementKeys.push(placement.key));
    let reconciled: WorldRelicRecord;
    if (canonical.status === "wielded" && canonical.ownerId) {
      reconciled = transferWorldRelic(
        record,
        canonical.item,
        canonical.ownerId,
        canonical.ownerName ?? "неизвестный владелец",
        `День ${Math.max(1, day)}: летопись подтвердила текущего владельца.`,
      ).record;
    } else if (canonical.status === "shop") {
      reconciled = placeWorldRelicInShop(
        record,
        canonical.ownerName ?? "лавка",
        `День ${Math.max(1, day)}: летопись подтвердила нахождение реликвии в лавке.`,
      ).record;
    } else {
      reconciled = releaseWorldRelic(
        record,
        canonical.item,
        `День ${Math.max(1, day)}: реликвия возвращена в мировой оборот.`,
      ).record;
    }
    records[index] = reconciled;
    recordsById.set(record.id, reconciled);
    keptPlacements.push({
      ...canonical,
      item: cloneItem(reconciled.item),
      status: reconciled.status,
      ownerId: reconciled.currentOwnerId,
      ownerName: reconciled.currentOwnerName,
    });
  });
  return {
    ...audit,
    records,
    placements: keptPlacements,
    removedPlacementKeys: [...new Set(removedPlacementKeys)],
    sanitizedPlacementKeys: [...new Set(sanitizedPlacementKeys)],
  };
}

function createRecoveredRecord(
  relicId: string,
  placement: WorldRelicPlacement,
  ownerName: string,
  day: number,
): WorldRelicRecord {
  const history = uniqueLines([
    ...(placement.item.relicHistory ?? []),
    `День ${Math.max(1, day)}: запись реликвии восстановлена по предмету «${placement.item.name}».`,
  ]);
  const item = cloneItem(placement.item);
  item.worldRelicId = relicId;
  item.relicHistory = history;
  return normalizeWorldRelicRecord({
    id: relicId,
    item,
    createdDay: Math.max(1, day),
    status: placement.status,
    currentOwnerId: placement.ownerId,
    currentOwnerName: placement.ownerName,
    formerOwners: placement.status === "wielded" ? [ownerName] : [],
    history,
  });
}
