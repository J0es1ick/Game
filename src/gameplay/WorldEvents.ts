export type StructuredWorldEventPayload =
  | { kind: "battle"; actorId: string; actorName: string; targetId: string; targetName: string; outcome: "won" | "lost"; lethal?: boolean }
  | { kind: "tournament"; tournamentId: string; tournamentName: string; championId: string; championName: string; participants: number }
  | { kind: "dungeon"; fighterId: string; fighterName: string; dungeonId: string; dungeonName?: string; outcome: "started" | "progressed" | "completed" | "retreated" }
  | { kind: "promotion"; fighterId: string; fighterName: string; fromArena?: string; toArena: string }
  | { kind: "death"; fighterId: string; fighterName: string; killerId?: string; killerName?: string }
  | { kind: "loot"; fighterId: string; fighterName: string; itemId?: string; itemName?: string; rarity?: string; source?: string }
  | { kind: "narrative"; eventId: string; choiceId: string; fighterId: string; fighterName: string }
  | { kind: "system"; code: string; values?: Record<string, string | number | boolean> };

export function eventFighterIds(payload: StructuredWorldEventPayload): string[] {
  switch (payload.kind) {
    case "battle": return [payload.actorId, payload.targetId];
    case "tournament": return [payload.championId];
    case "dungeon":
    case "promotion":
    case "death":
    case "loot":
    case "narrative": return [payload.fighterId, ...(payload.kind === "death" && payload.killerId ? [payload.killerId] : [])];
    case "system": return [];
  }
}

export function eventReferencesFighter(payload: StructuredWorldEventPayload | undefined, fighterId: string): boolean {
  return Boolean(payload && eventFighterIds(payload).includes(fighterId));
}

export function formatStructuredWorldEvent(payload: StructuredWorldEventPayload): string {
  switch (payload.kind) {
    case "battle":
      return `${payload.actorName} ${payload.outcome === "won" ? "победил" : "проиграл"} в бою против ${payload.targetName}${payload.lethal ? ". Бой оказался смертельным." : "."}`;
    case "tournament":
      return `${payload.tournamentName} завершён. Чемпион: ${payload.championName}. Участников: ${payload.participants}.`;
    case "dungeon": {
      const action = { started: "начал поход", progressed: "продвинулся в походе", completed: "завершил поход", retreated: "отступил из похода" }[payload.outcome];
      return `${payload.fighterName} ${action}${payload.dungeonName ? ` «${payload.dungeonName}»` : ""}.`;
    }
    case "promotion":
      return `${payload.fighterName} перешёл${payload.fromArena ? ` с арены «${payload.fromArena}»` : ""} на арену «${payload.toArena}».`;
    case "death":
      return payload.killerName ? `${payload.fighterName} погиб в бою с ${payload.killerName}.` : `${payload.fighterName} погиб.`;
    case "loot":
      return payload.itemName
        ? `${payload.fighterName} получил предмет «${payload.itemName}».`
        : `${payload.fighterName} получил добычу${payload.source ? ` (${payload.source})` : ""}.`;
    case "narrative":
      return `${payload.fighterName} сделал выбор в событии «${payload.eventId}»: ${payload.choiceId}.`;
    case "system":
      return payload.code;
  }
}
