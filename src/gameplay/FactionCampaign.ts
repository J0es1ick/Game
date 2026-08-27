export type FactionCampaignEventKind = "contract" | "tournament" | "dungeon" | "boss";

export interface FactionCampaignProgress {
  stage: number;
  progress: number;
  claimedStageIds: string[];
}

export type FactionCampaignState = Record<string, FactionCampaignProgress>;

export interface FactionCampaignReward {
  gold: number;
  seals: number;
  setId: string;
  slots: Array<"weapon" | "offhand" | "head" | "chest" | "hands" | "feet">;
  rarity: "legendary" | "mythic";
  mentorAccess: boolean;
}

export interface FactionCampaignStage {
  id: string;
  factionId: string;
  title: string;
  description: string;
  reputation: number;
  event: FactionCampaignEventKind;
  required: number;
  reward: FactionCampaignReward;
}

const definitions = [
  { id: "wardens", setId: "faction-wardens", titles: ["Допуск к внутреннему кругу", "Знамя распорядителя", "Хранитель арены"], events: ["contract", "tournament", "tournament"] },
  { id: "free-company", setId: "faction-company", titles: ["Проверка проводника", "За дальней чертой", "Первый среди вольных"], events: ["contract", "dungeon", "boss"] },
  { id: "red-ledger", setId: "faction-ledger", titles: ["Имя в красной книге", "Долг сильнейших", "Закрыть последнюю запись"], events: ["contract", "boss", "boss"] },
] as const;

const objectives: Record<FactionCampaignEventKind, string> = {
  contract: "Выполните контракты этой фракции", tournament: "Победите в турнирах", dungeon: "Завершите данжи", boss: "Победите особых противников",
};

export const FACTION_CAMPAIGN_STAGES: FactionCampaignStage[] = definitions.flatMap((faction) =>
  faction.titles.map((title, index) => ({
    id: `${faction.id}-campaign-${index + 1}`,
    factionId: faction.id,
    title,
    description: objectives[faction.events[index]],
    reputation: [20, 45, 75][index],
    event: faction.events[index],
    required: [3, 4, 3][index],
    reward: {
      gold: [800, 1800, 3600][index], seals: [1, 2, 4][index], setId: faction.setId,
      slots: index === 0 ? ["hands", "feet"] : index === 1 ? ["head", "chest"] : ["weapon", "offhand"],
      rarity: index === 2 ? "mythic" : "legendary",
      mentorAccess: index === 0,
    },
  })),
);

export function normalizeFactionCampaigns(value: unknown): FactionCampaignState {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(definitions.map(({ id }) => {
    const raw = source[id] && typeof source[id] === "object" ? source[id] as Partial<FactionCampaignProgress> : {};
    const stages = FACTION_CAMPAIGN_STAGES.filter((stage) => stage.factionId === id);
    const claimed = Array.isArray(raw.claimedStageIds) ? raw.claimedStageIds : [];
    let stage = 0;
    while (stage < stages.length && claimed.includes(stages[stage].id)) stage += 1;
    return [id, {
      stage,
      progress: stage === stages.length ? 0 : Math.min(stages[stage].required, Math.max(0, Math.floor(Number(raw.progress) || 0))),
      claimedStageIds: stages.slice(0, stage).map((entry) => entry.id),
    }];
  }));
}

export function factionCampaignViews(state: FactionCampaignState, reputation: Record<string, number>) {
  const normalized = normalizeFactionCampaigns(state);
  return definitions.map(({ id }) => {
    const progress = normalized[id];
    const stages = FACTION_CAMPAIGN_STAGES.filter((stage) => stage.factionId === id);
    const current = stages[progress.stage];
    const unlocked = !!current && (reputation[id] ?? 0) >= current.reputation;
    return { factionId: id, current, progress: progress.progress, completedStages: progress.stage,
      completed: !current, unlocked, claimable: unlocked && progress.progress >= current.required };
  });
}

export function recordFactionCampaignEvent(
  state: FactionCampaignState,
  reputation: Record<string, number>,
  event: { kind: FactionCampaignEventKind; factionId?: string; amount?: number },
): FactionCampaignState {
  const next = normalizeFactionCampaigns(state);
  for (const view of factionCampaignViews(next, reputation)) {
    if (!view.unlocked || view.current?.event !== event.kind) continue;
    if (event.kind === "contract" && event.factionId !== view.factionId) continue;
    const amount = Math.max(0, Math.floor(Number(event.amount ?? 1) || 0));
    next[view.factionId].progress = Math.min(view.current.required, view.progress + amount);
  }
  return next;
}

export function claimFactionCampaignReward(
  state: FactionCampaignState,
  reputation: Record<string, number>,
  factionId: string,
): { state: FactionCampaignState; reward: FactionCampaignReward; stageId: string } {
  const next = normalizeFactionCampaigns(state);
  const view = factionCampaignViews(next, reputation).find((entry) => entry.factionId === factionId);
  if (!view?.claimable || !view.current) throw new Error("Условия фракционного поручения ещё не выполнены.");
  next[factionId].claimedStageIds.push(view.current.id);
  next[factionId].stage += 1;
  next[factionId].progress = 0;
  return { state: next, reward: { ...view.current.reward, slots: [...view.current.reward.slots] }, stageId: view.current.id };
}

export function factionMentorAccess(state: FactionCampaignState, reputation: Record<string, number>) {
  return definitions.filter(({ id }) => normalizeFactionCampaigns(state)[id].stage > 0 && (reputation[id] ?? 0) >= 20)
    .map(({ id }) => ({ factionId: id, experienceMultiplier: 1.2, description: "Наставник даёт на 20% больше опыта за тренировку. Ограничение уровня арены сохраняется." }));
}
