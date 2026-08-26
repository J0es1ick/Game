import type { RandomSource } from "./RandomSource";

export type DungeonNodeKind = "battle" | "elite" | "cache" | "camp" | "shrine" | "boss";

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
}

export interface DungeonRoute {
  dungeonId: string;
  nodes: DungeonRouteNode[];
  entryNodeIds: string[];
  bossNodeId: string;
}

const NODE_COPY: Record<Exclude<DungeonNodeKind, "boss">, Array<[string, string]>> = {
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
};

function nodeKinds(depth: number, random: RandomSource): [Exclude<DungeonNodeKind, "boss">, Exclude<DungeonNodeKind, "boss">] {
  const combat: Exclude<DungeonNodeKind, "boss"> = depth > 1 && random.chance(0.28) ? "elite" : "battle";
  const utility = random.pick<Exclude<DungeonNodeKind, "boss">>(["cache", "camp", "shrine"]);
  return random.chance(0.5) ? [combat, utility] : [utility, combat];
}

export function generateDungeonRoute(
  dungeonId: string,
  stages: number,
  random: RandomSource,
): DungeonRoute {
  const depthCount = Math.max(2, stages - 1);
  const nodes: DungeonRouteNode[] = [];
  for (let depth = 0; depth < depthCount; depth += 1) {
    const kinds = nodeKinds(depth, random);
    for (let lane = 0; lane < 2; lane += 1) {
      const kind = kinds[lane];
      const [title, description] = random.pick(NODE_COPY[kind]);
      nodes.push({
        id: `${dungeonId}-${depth}-${lane}`,
        depth,
        lane,
        kind,
        title,
        description,
        danger: kind === "elite" ? 3 : kind === "battle" ? 2 : kind === "shrine" ? 1 : 0,
        rewardMultiplier: kind === "elite" ? 1.8 : kind === "battle" ? 1 : kind === "cache" ? 1.25 : 0,
        connections: [],
      });
    }
  }
  const boss: DungeonRouteNode = {
    id: `${dungeonId}-boss`, depth: depthCount, lane: 0, kind: "boss", title: "Хранитель глубин",
    description: "Последнее препятствие охраняет главную награду похода.", danger: 4, rewardMultiplier: 2.4, connections: [],
  };
  nodes.push(boss);

  nodes.filter((node) => node.kind !== "boss").forEach((node) => {
    if (node.depth === depthCount - 1) {
      node.connections = [boss.id];
      return;
    }
    const straight = `${dungeonId}-${node.depth + 1}-${node.lane}`;
    const diagonal = `${dungeonId}-${node.depth + 1}-${node.lane === 0 ? 1 : 0}`;
    node.connections = random.chance(0.55) ? [straight, diagonal] : [straight];
  });
  return {
    dungeonId,
    nodes,
    entryNodeIds: [`${dungeonId}-0-0`, `${dungeonId}-0-1`],
    bossNodeId: boss.id,
  };
}

export function reachableDungeonNodes(route: DungeonRoute, visitedNodeIds: readonly string[]): DungeonRouteNode[] {
  if (visitedNodeIds.length === 0) return route.entryNodeIds.map((id) => route.nodes.find((node) => node.id === id)!).filter(Boolean);
  const current = route.nodes.find((node) => node.id === visitedNodeIds[visitedNodeIds.length - 1]);
  if (!current) return [];
  const visited = new Set(visitedNodeIds);
  return current.connections.map((id) => route.nodes.find((node) => node.id === id)!).filter((node) => node && !visited.has(node.id));
}

export function expectedDungeonDays(route: DungeonRoute): { minimum: number; maximum: number } {
  const depths = new Set(route.nodes.map((node) => node.depth));
  return { minimum: depths.size, maximum: depths.size + route.nodes.filter((node) => node.kind === "camp").length };
}
