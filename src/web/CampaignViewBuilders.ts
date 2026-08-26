import { FACTIONS, TOURNAMENT_RULES } from "../catalogs/WorldExpansionCatalog";
import type { CrownSeasonState } from "../gameplay/CrownSeason";
import type { DungeonRouteNode } from "../gameplay/DungeonRoute";
import type { EraChallenge, EraObjectiveProgress } from "../gameplay/EraChallenges";
import type { NarrativeEffect } from "../gameplay/NarrativeEvents";
import { normalizeExpeditionStamina } from "../gameplay/ExpeditionStamina";
import type { DungeonExpedition } from "../gameplay/WorldTypes";
import { createElement as element } from "./UiDom";

function statRow(label: string, value: string | number): HTMLElement {
  const row = element("div", "stat-row");
  row.append(element("span", "", label), element("strong", "", String(value)));
  return row;
}

export function createExpeditionConditionView(expedition: DungeonExpedition): HTMLElement {
  const stamina = Math.round(normalizeExpeditionStamina(expedition.health));
  const condition = element("div", "expedition-condition");
  const staminaRow = element("div", `expedition-stamina ${stamina <= 25 ? "critical" : stamina <= 50 ? "low" : ""}`.trim());
  staminaRow.append(element("span", "", "Запас сил"), element("strong", "", `${stamina}%`));
  const meter = element("div", "expedition-stamina-meter");
  meter.setAttribute("role", "progressbar");
  meter.setAttribute("aria-label", "Оставшийся запас сил");
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", "100");
  meter.setAttribute("aria-valuenow", String(stamina));
  const fill = element("i");
  fill.style.width = `${stamina}%`;
  meter.append(fill);
  staminaRow.append(meter);
  condition.append(
    staminaRow,
    statRow("Монеты", expedition.accumulatedGold),
    statRow("Опыт", expedition.accumulatedExperience),
    statRow("Трофеи", expedition.loot.length),
    statRow("Пройдено этапов", `${Math.min(expedition.stage, expedition.maxStages)}/${expedition.maxStages}`),
  );
  return condition;
}

export function narrativeEffectLines(effect: NarrativeEffect): string[] {
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
  const lines: string[] = [];
  if (effect.gold) lines.push(`Монеты ${signed(effect.gold)} ¤`);
  if (effect.experience) lines.push(`Опыт ${signed(effect.experience)}`);
  if (effect.temperingMarks) lines.push(`Печати ${signed(effect.temperingMarks)}`);
  if (effect.injuryRecovery) lines.push(`Восстановление травм +${effect.injuryRecovery} дн.`);
  if (effect.rivalryIntensity) lines.push(`Накал соперничества ${signed(effect.rivalryIntensity)}`);
  Object.entries(effect.reputation ?? {}).forEach(([factionId, value]) => {
    const faction = FACTIONS.find((candidate) => candidate.id === factionId);
    lines.push(`${faction?.name ?? factionId}: ${signed(value)} репутации`);
  });
  return lines.length ? lines : ["Немедленных изменений нет"];
}

export function createEraChallengePanel(challenge: EraChallenge, progress: EraObjectiveProgress[]): HTMLElement {
  const panel = element("section", "era-challenge-panel");
  const header = element("header");
  header.append(element("small", "", `ИСПЫТАНИЕ ЭПОХИ ${challenge.cycle}`), element("strong", "", challenge.name));
  const objectiveList = element("div", "era-objective-list");
  progress.forEach((entry) => {
    const objective = element("article", entry.completed ? "complete" : "");
    const heading = element("div");
    heading.append(element("b", "", entry.objective.name), element("span", "", `${entry.current}/${entry.target}`));
    const meter = element("div", "era-objective-meter");
    const fill = element("i");
    fill.style.width = `${Math.round(entry.ratio * 100)}%`;
    meter.append(fill);
    objective.append(heading, element("p", "", entry.objective.description), meter);
    objectiveList.append(objective);
  });
  panel.append(header, objectiveList);
  return panel;
}

export interface CrownSeasonOverviewData {
  season: CrownSeasonState;
  remainingDays: number;
  heroPoints: number;
  heroRank?: number;
  heroDefenses: number;
}

export function createCrownSeasonOverview(data: CrownSeasonOverviewData): HTMLElement {
  const panel = element("section", "crown-season-overview paper-panel");
  const copy = element("div", "crown-season-copy");
  copy.append(
    element("p", "eyebrow", `СЕЗОН ${data.season.number} · ДО ДНЯ ${data.season.endsDay}`),
    element("h3", "", "Сезон Лиги короны"),
    element("p", "", "Сезонные очки показывают стабильность в элите и не заменяют место в основной таблице. Чемпионство приносит 18 очков, защита титула — 5, победа — 3, поражение — 1."),
  );
  const summary = element("div", "crown-season-summary");
  summary.append(
    statRow("Осталось", `${data.remainingDays} дн.`),
    statRow("Ваши очки", data.heroPoints),
    statRow("Место сезона", data.heroRank ? `#${data.heroRank}` : "Без очков"),
    statRow("Защиты", data.heroDefenses),
  );
  const rules = element("div", "crown-season-rules");
  rules.append(element("strong", "", "Правила текущего сезона"));
  data.season.ruleIds.forEach((id) => {
    const rule = TOURNAMENT_RULES.find((candidate) => candidate.id === id);
    if (!rule) return;
    const row = element("article");
    row.append(element("b", "", rule.name), element("span", "", rule.description));
    rules.append(row);
  });
  panel.append(copy, summary, rules);
  return panel;
}

export interface ExpeditionRouteViewData {
  nodes: DungeonRouteNode[];
  expedition: DungeonExpedition;
  reachableIds: ReadonlySet<string>;
  onAdvance: (nodeId: string) => void;
}

export function createExpeditionRouteView(data: ExpeditionRouteViewData): HTMLElement {
  const visited = new Set(data.expedition.visitedNodeIds ?? []);
  const route = element("div", "expedition-route-map");
  route.setAttribute("aria-label", "Маршрут экспедиции");
  const depths = [...new Set(data.nodes.map((node) => node.depth))].sort((a, b) => a - b);
  const kindLabels: Record<DungeonRouteNode["kind"], string> = {
    battle: "Бой", elite: "Элита", cache: "Тайник", camp: "Лагерь", shrine: "Святилище", boss: "Хранитель",
  };
  depths.forEach((depth) => {
    const column = element("section", "expedition-route-column");
    column.append(element("small", "", depth === depths.length - 1 ? "ФИНАЛ" : `ГЛУБИНА ${depth + 1}`));
    data.nodes.filter((node) => node.depth === depth).sort((a, b) => a.lane - b.lane).forEach((node) => {
      const state = visited.has(node.id) ? "visited" : data.reachableIds.has(node.id) ? "reachable" : "locked";
      const card = element("article", `expedition-route-node ${node.kind} ${state}${data.expedition.currentNodeId === node.id ? " current" : ""}`);
      const danger = node.danger === 0 ? "без боя" : `опасность ${node.danger}/4`;
      card.append(
        element("small", "", `${kindLabels[node.kind]} · ${danger}`),
        element("strong", "", node.title),
        element("p", "", node.description),
        element("span", "", node.rewardMultiplier > 0 ? `Награда ×${node.rewardMultiplier}` : "Восстановление и передышка"),
      );
      if (data.reachableIds.has(node.id)) {
        const choose = element("button", "button", "Идти сюда");
        choose.type = "button";
        choose.addEventListener("click", () => data.onAdvance(node.id));
        card.append(choose);
      } else {
        card.append(element("b", "expedition-node-state", visited.has(node.id) ? "Пройдено" : "Путь ещё не открыт"));
      }
      column.append(card);
    });
    route.append(column);
  });
  return route;
}
