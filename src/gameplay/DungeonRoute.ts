import type { RandomSource } from "./RandomSource";

export type DungeonNodeKind =
  | "battle"
  | "elite"
  | "cache"
  | "camp"
  | "shrine"
  | "trap"
  | "merchant"
  | "rival"
  | "boss"
  | "alternate-boss";

export interface DungeonTrapEvent {
  type: "trap";
  staminaLoss: number;
  goldLossPercent: number;
  clueId?: string;
}

export interface DungeonMerchantEvent {
  type: "merchant";
  priceMultiplier: number;
  healingPrice: number;
  staminaRestored: number;
}

export interface DungeonRivalEvent {
  type: "rival";
  encounterKey: string;
  opponentId?: string;
}

export interface DungeonBossEvent {
  type: "boss";
  variant: "guardian" | "hidden";
}

export type DungeonNodeEvent = DungeonTrapEvent | DungeonMerchantEvent | DungeonRivalEvent | DungeonBossEvent;

export interface DungeonRouteNode {
  id: string;
  depth: number;
  lane: number;
  kind: DungeonNodeKind;
  title: string;
  description: string;
  danger: number;
  rewardMultiplier: number;
  connections: string[];
  hidden?: boolean;
  revealAfterRuns?: number;
  requiredClueId?: string;
  revealsClueIds?: string[];
  event?: DungeonNodeEvent;
}

export interface DungeonRoute {
  dungeonId: string;
  nodes: DungeonRouteNode[];
  entryNodeIds: string[];
  bossNodeId: string;
  alternateBossNodeId?: string;
  version?: number;
}

export interface DungeonDiscoveryState {
  dungeonId: string;
  completedRuns: number;
  discoveredNodeIds: string[];
  discoveredClueIds: string[];
  seenEncounterKinds: DungeonNodeKind[];
}

export interface DungeonTrapResolution {
  staminaBefore: number;
  staminaAfter: number;
  staminaLost: number;
  goldBefore: number;
  goldAfter: number;
  goldLost: number;
  clueId?: string;
}

export interface DungeonMerchantTerms {
  priceMultiplier: number;
  healingPrice: number;
  staminaRestored: number;
}

export interface DungeonRivalCandidate {
  id: string;
  alive?: boolean;
  retiredDay?: number;
  tournamentWins?: number;
}

const NON_BOSS_COPY: Record<Exclude<DungeonNodeKind, "boss" | "alternate-boss">, Array<[string, string]>> = {
  battle: [
    ["Следы патруля", "Обычный отряд перекрывает ближайший проход."],
    ["Гул за дверью", "Впереди слышны шаги вооружённых противников."],
  ],
  elite: [
    ["Зал хранителя", "Именной страж охраняет редкую часть добычи."],
    ["Тяжёлые шаги", "Опасный противник не покидает свой пост."],
  ],
  cache: [
    ["Забытый тайник", "Здесь можно найти припасы или снаряжение без боя."],
    ["Сломанный обоз", "Часть груза пережила прежнюю экспедицию."],
  ],
  camp: [
    ["Безопасная ниша", "Можно восстановиться, но поход займёт ещё один день."],
    ["Погасший костёр", "Следы прошлого лагеря обещают короткую передышку."],
  ],
  shrine: [
    ["Старая клятва", "Святилище предлагает временную силу за постоянную цену."],
    ["Немой алтарь", "Выбор у алтаря изменит оставшуюся часть похода."],
  ],
  trap: [
    ["Ложный пол", "Каменные плиты скрывают старый механизм и уводят к тайному проходу."],
    ["Петля смотрителя", "Натянутые цепи перекрывают путь к закрытой части подземелья."],
  ],
  merchant: [
    ["Лавка под землёй", "Странствующий торговец меняет припасы на монеты прямо во время похода."],
    ["Последний меняла", "Уцелевший купец предлагает лечение и редкие товары по походной цене."],
  ],
  rival: [
    ["Знакомый герб", "Постоянный участник турниров ищет здесь ту же добычу и не уступит дорогу."],
    ["Встречный отряд", "Из темноты выходит боец, уже известный зрителям арен."],
  ],
};

const COMBAT_KINDS: readonly DungeonNodeKind[] = ["battle", "elite", "rival", "boss", "alternate-boss"];

function dangerFor(kind: DungeonNodeKind): number {
  if (kind === "alternate-boss") return 5;
  if (kind === "boss") return 4;
  if (kind === "elite" || kind === "rival") return 3;
  if (kind === "battle" || kind === "trap") return 2;
  if (kind === "shrine") return 1;
  return 0;
}

function rewardFor(kind: DungeonNodeKind): number {
  if (kind === "alternate-boss") return 3.15;
  if (kind === "boss") return 2.4;
  if (kind === "elite") return 1.8;
  if (kind === "rival") return 1.65;
  if (kind === "cache") return 1.25;
  if (kind === "battle") return 1;
  return 0;
}

function createEvent(kind: DungeonNodeKind, dungeonId: string, depth: number, random: RandomSource): DungeonNodeEvent | undefined {
  if (kind === "trap") {
    return {
      type: "trap",
      staminaLoss: random.int(9, 17),
      goldLossPercent: random.int(5, 12),
      clueId: `${dungeonId}:seal`,
    };
  }
  if (kind === "merchant") {
    return {
      type: "merchant",
      priceMultiplier: random.int(88, 118) / 100,
      healingPrice: 70 + depth * 25,
      staminaRestored: random.int(18, 30),
    };
  }
  if (kind === "rival") return { type: "rival", encounterKey: `${dungeonId}:rival:${depth}` };
  if (kind === "boss") return { type: "boss", variant: "guardian" };
  if (kind === "alternate-boss") return { type: "boss", variant: "hidden" };
  return undefined;
}

function createNode(
  dungeonId: string,
  depth: number,
  lane: number,
  kind: Exclude<DungeonNodeKind, "boss" | "alternate-boss">,
  random: RandomSource,
): DungeonRouteNode {
  const [title, description] = random.pick(NON_BOSS_COPY[kind]);
  return {
    id: `${dungeonId}-${depth}-${lane}`,
    depth,
    lane,
    kind,
    title,
    description,
    danger: dangerFor(kind),
    rewardMultiplier: rewardFor(kind),
    connections: [],
    event: createEvent(kind, dungeonId, depth, random),
  };
}

function kindsForDepth(
  depth: number,
  random: RandomSource,
): [Exclude<DungeonNodeKind, "boss" | "alternate-boss">, Exclude<DungeonNodeKind, "boss" | "alternate-boss">] {
  if (depth === 0) return random.chance(0.5) ? ["battle", "merchant"] : ["merchant", "battle"];
  if (depth === 1) return random.chance(0.5) ? ["rival", "camp"] : ["shrine", "rival"];
  const combat: Exclude<DungeonNodeKind, "boss" | "alternate-boss"> = random.chance(0.34) ? "elite" : "battle";
  const utility = random.pick<Exclude<DungeonNodeKind, "boss" | "alternate-boss">>(["cache", "camp", "shrine"]);
  return random.chance(0.5) ? [combat, utility] : [utility, combat];
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createDungeonDiscoveryState(dungeonId: string): DungeonDiscoveryState {
  return { dungeonId, completedRuns: 0, discoveredNodeIds: [], discoveredClueIds: [], seenEncounterKinds: [] };
}

export function normalizeDungeonDiscoveryState(
  dungeonId: string,
  state?: Partial<DungeonDiscoveryState>,
): DungeonDiscoveryState {
  const uniqueStrings = (values: readonly string[] | undefined) => [...new Set((values ?? []).filter(Boolean))];
  const knownKinds = new Set<DungeonNodeKind>([
    "battle", "elite", "cache", "camp", "shrine", "trap", "merchant", "rival", "boss", "alternate-boss",
  ]);
  return {
    dungeonId,
    completedRuns: Math.max(0, Math.floor(Number(state?.completedRuns) || 0)),
    discoveredNodeIds: uniqueStrings(state?.discoveredNodeIds),
    discoveredClueIds: uniqueStrings(state?.discoveredClueIds),
    seenEncounterKinds: [...new Set(state?.seenEncounterKinds ?? [])].filter((kind) => knownKinds.has(kind)),
  };
}

export function isDungeonNodeDiscovered(node: DungeonRouteNode, state: DungeonDiscoveryState): boolean {
  if (!node.hidden) return true;
  if (state.discoveredNodeIds.includes(node.id)) return true;
  if (node.requiredClueId && state.discoveredClueIds.includes(node.requiredClueId)) return true;
  return node.revealAfterRuns !== undefined && state.completedRuns >= node.revealAfterRuns;
}

export function visibleDungeonNodes(route: DungeonRoute, state: DungeonDiscoveryState): DungeonRouteNode[] {
  const normalized = normalizeDungeonDiscoveryState(route.dungeonId, state);
  return route.nodes.filter((node) => isDungeonNodeDiscovered(node, normalized));
}

export function recordDungeonNodeVisit(
  route: DungeonRoute,
  state: DungeonDiscoveryState,
  nodeId: string,
): DungeonDiscoveryState {
  const node = route.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return normalizeDungeonDiscoveryState(route.dungeonId, state);
  const normalized = normalizeDungeonDiscoveryState(route.dungeonId, state);
  const eventClues = node.event?.type === "trap" && node.event.clueId ? [node.event.clueId] : [];
  return {
    ...normalized,
    discoveredNodeIds: [...new Set([...normalized.discoveredNodeIds, node.id])],
    discoveredClueIds: [...new Set([...normalized.discoveredClueIds, ...(node.revealsClueIds ?? []), ...eventClues])],
    seenEncounterKinds: [...new Set([...normalized.seenEncounterKinds, node.kind])],
  };
}

export function completeDungeonExploration(
  route: DungeonRoute,
  state: DungeonDiscoveryState,
  visitedNodeIds: readonly string[],
): DungeonDiscoveryState {
  const visited = visitedNodeIds.reduce(
    (current, nodeId) => recordDungeonNodeVisit(route, current, nodeId),
    normalizeDungeonDiscoveryState(route.dungeonId, state),
  );
  const nextRuns = visited.completedRuns + 1;
  const revealed = route.nodes
    .filter((node) => node.hidden && node.revealAfterRuns !== undefined && node.revealAfterRuns <= nextRuns)
    .map((node) => node.id);
  return {
    ...visited,
    completedRuns: nextRuns,
    discoveredNodeIds: [...new Set([...visited.discoveredNodeIds, ...revealed])],
  };
}

export function generateDungeonRoute(
  dungeonId: string,
  stages: number,
  random: RandomSource,
): DungeonRoute {
  const depthCount = Math.max(2, stages - 1);
  const nodes: DungeonRouteNode[] = [];
  for (let depth = 0; depth < depthCount; depth += 1) {
    const kinds = kindsForDepth(depth, random);
    for (let lane = 0; lane < 2; lane += 1) nodes.push(createNode(dungeonId, depth, lane, kinds[lane], random));
  }

  const secretDepth = Math.min(1, depthCount - 1);
  const secret = createNode(dungeonId, secretDepth, 2, "trap", random);
  secret.hidden = true;
  secret.revealAfterRuns = 1;
  secret.revealsClueIds = [`${dungeonId}:seal`];
  nodes.push(secret);

  const boss: DungeonRouteNode = {
    id: `${dungeonId}-boss`,
    depth: depthCount,
    lane: 0,
    kind: "boss",
    title: "Хранитель глубин",
    description: "Последнее препятствие охраняет главную награду похода.",
    danger: dangerFor("boss"),
    rewardMultiplier: rewardFor("boss"),
    connections: [],
    event: createEvent("boss", dungeonId, depthCount, random),
  };
  const alternateBoss: DungeonRouteNode = {
    id: `${dungeonId}-alternate-boss`,
    depth: depthCount,
    lane: 1,
    kind: "alternate-boss",
    title: "Владыка тайного пути",
    description: "Скрытый хозяин подземелья хранит награду, которой нет у обычного хранителя.",
    danger: dangerFor("alternate-boss"),
    rewardMultiplier: rewardFor("alternate-boss"),
    connections: [],
    hidden: true,
    revealAfterRuns: 2,
    requiredClueId: `${dungeonId}:seal`,
    event: createEvent("alternate-boss", dungeonId, depthCount, random),
  };
  nodes.push(boss, alternateBoss);

  nodes.filter((node) => node.depth < depthCount).forEach((node) => {
    if (node.depth === depthCount - 1) {
      node.connections = [boss.id, alternateBoss.id];
      return;
    }
    const normalizedLane = Math.min(node.lane, 1);
    const straight = `${dungeonId}-${node.depth + 1}-${normalizedLane}`;
    const diagonal = `${dungeonId}-${node.depth + 1}-${normalizedLane === 0 ? 1 : 0}`;
    const choices = random.chance(0.55) ? [straight, diagonal] : [straight];
    if (node.depth + 1 === secretDepth && random.chance(0.6)) choices.push(secret.id);
    node.connections = [...new Set(choices)];
  });

  const previousDepth = secretDepth - 1;
  if (previousDepth >= 0 && !nodes.some((node) => node.depth === previousDepth && node.connections.includes(secret.id))) {
    const source = nodes.find((node) => node.depth === previousDepth);
    if (source) source.connections.push(secret.id);
  }

  return {
    dungeonId,
    nodes,
    entryNodeIds: [`${dungeonId}-0-0`, `${dungeonId}-0-1`],
    bossNodeId: boss.id,
    alternateBossNodeId: alternateBoss.id,
    version: 2,
  };
}

export function reachableDungeonNodes(
  route: DungeonRoute,
  visitedNodeIds: readonly string[],
  discovery?: DungeonDiscoveryState,
): DungeonRouteNode[] {
  const visibleIds = discovery ? new Set(visibleDungeonNodes(route, discovery).map((node) => node.id)) : undefined;
  if (visitedNodeIds.length === 0) {
    return route.entryNodeIds
      .map((id) => route.nodes.find((node) => node.id === id))
      .filter((node): node is DungeonRouteNode => Boolean(node) && (!visibleIds || visibleIds.has(node!.id)));
  }
  const current = route.nodes.find((node) => node.id === visitedNodeIds[visitedNodeIds.length - 1]);
  if (!current) return [];
  const visited = new Set(visitedNodeIds);
  return current.connections
    .map((id) => route.nodes.find((node) => node.id === id))
    .filter((node): node is DungeonRouteNode => Boolean(node)
      && !visited.has(node!.id)
      && (!visibleIds || visibleIds.has(node!.id)));
}

export function resolveDungeonTrap(node: DungeonRouteNode, stamina: number, gold: number): DungeonTrapResolution {
  if (node.event?.type !== "trap") throw new Error("Выбранный узел не содержит ловушку.");
  const staminaBefore = Math.max(0, Math.min(100, Math.round(stamina)));
  const goldBefore = Math.max(0, Math.floor(gold));
  const staminaLost = Math.min(staminaBefore, Math.max(0, Math.floor(node.event.staminaLoss)));
  const goldLost = Math.min(goldBefore, Math.floor(goldBefore * Math.max(0, node.event.goldLossPercent) / 100));
  return {
    staminaBefore,
    staminaAfter: staminaBefore - staminaLost,
    staminaLost,
    goldBefore,
    goldAfter: goldBefore - goldLost,
    goldLost,
    clueId: node.event.clueId,
  };
}

export function dungeonMerchantTerms(node: DungeonRouteNode, heroLevel = 1): DungeonMerchantTerms {
  if (node.event?.type !== "merchant") throw new Error("Выбранный узел не содержит торговца.");
  const level = Math.max(1, Math.floor(heroLevel));
  return {
    priceMultiplier: node.event.priceMultiplier,
    healingPrice: Math.round(node.event.healingPrice * (1 + (level - 1) * 0.035)),
    staminaRestored: node.event.staminaRestored,
  };
}

export function selectPersistentDungeonRival<T extends DungeonRivalCandidate>(
  node: DungeonRouteNode,
  candidates: readonly T[],
  excludedIds: readonly string[] = [],
): T | undefined {
  if (node.event?.type !== "rival") return undefined;
  const event = node.event;
  const excluded = new Set(excludedIds);
  const eligible = candidates
    .filter((candidate) => candidate.alive !== false && candidate.retiredDay === undefined && !excluded.has(candidate.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const tournamentFighters = eligible.filter((candidate) => (candidate.tournamentWins ?? 0) > 0);
  const pool = tournamentFighters.length ? tournamentFighters : eligible;
  if (!pool.length) return undefined;
  if (event.opponentId) return pool.find((candidate) => candidate.id === event.opponentId) ?? pool[0];
  return pool[stableHash(event.encounterKey) % pool.length];
}

export function dungeonNodeConsumesCombat(node: DungeonRouteNode): boolean {
  return COMBAT_KINDS.includes(node.kind);
}

export function expectedDungeonDays(route: DungeonRoute): { minimum: number; maximum: number } {
  const depths = new Set(route.nodes.map((node) => node.depth));
  const visibleCamps = route.nodes.filter((node) => node.kind === "camp" && !node.hidden).length;
  return { minimum: depths.size, maximum: depths.size + visibleCamps };
}
