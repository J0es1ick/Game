import {
  countermeasureDefinition,
  EnemyMemoryCombatRead,
  memoryStageDefinition,
} from "./EnemyMemory";
import type { EnemyStyleMemory, RivalryRecord } from "../core/WorldTypes";

export type RivalryDisposition =
  "acquaintance" | "fear" | "hatred" | "respect" | "nemesis";

export interface RivalryStatus {
  id: RivalryDisposition;
  name: string;
  description: string;
  milestone: number;
}

export interface RivalScoutingReport {
  headline: string;
  familiarity: number;
  observations: string[];
  countermeasures: string[];
  recommendation: string;
}

export function rivalryStatus(record: RivalryRecord): RivalryStatus {
  const meetings = record.meetings ?? record.wins + record.losses;
  const intensity = record.intensity ?? meetings * 8;
  const balance = record.wins - record.losses;
  if (meetings >= 7 || intensity >= 70) {
    return {
      id: "nemesis",
      name: "Заклятый соперник",
      description: "Эта вражда стала частью истории обоих бойцов.",
      milestone: 7,
    };
  }
  if (meetings >= 4 && Math.abs(balance) <= 1) {
    return {
      id: "respect",
      name: "Опасное уважение",
      description: "Никто не считает исход следующей встречи предрешённым.",
      milestone: 4,
    };
  }
  if (meetings >= 3 && balance >= 2) {
    return {
      id: "fear",
      name: "Запомнил поражения",
      description:
        "Соперник боится привычного натиска, но готовит отчаянный ответ.",
      milestone: 3,
    };
  }
  if (meetings >= 3 && balance <= -2) {
    return {
      id: "hatred",
      name: "Преследователь",
      description: "Соперник уверен, что разгадал героя, и ищет новой встречи.",
      milestone: 3,
    };
  }
  return {
    id: "acquaintance",
    name: meetings > 1 ? "Знакомый противник" : "Первая встреча",
    description:
      meetings > 1
        ? "История противостояния только складывается."
        : "Никто ещё не знает привычек другого.",
    milestone: 1,
  };
}

export function buildRivalScoutingReport(
  memory: EnemyStyleMemory,
  read: EnemyMemoryCombatRead,
): RivalScoutingReport {
  const stage = memoryStageDefinition(memory.stage);
  const observations: string[] = [];
  const classEntry = Object.entries(memory.classKnowledge).sort(
    (a, b) => Number(b[1]) - Number(a[1]),
  )[0];
  const tacticEntry = Object.entries(memory.tacticalKnowledge).sort(
    (a, b) => Number(b[1]) - Number(a[1]),
  )[0];
  const skillEntry = Object.entries(memory.skillKnowledge).sort(
    (a, b) => b[1] - a[1],
  )[0];
  if (classEntry)
    observations.push(
      `Лучше всего изучен класс: ${classEntry[0]} (${Math.round(Number(classEntry[1]))}%).`,
    );
  if (tacticEntry)
    observations.push(`Чаще всего ожидает стиль «${tacticEntry[0]}».`);
  if (skillEntry)
    observations.push(
      `Особенно внимательно следит за приёмом «${skillEntry[0]}».`,
    );
  if (observations.length === 0)
    observations.push("У соперника ещё нет надёжных наблюдений.");

  const countermeasures = read.countermeasureIds
    .map((id) => countermeasureDefinition(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .map((entry) => `${entry.name}: ${entry.effect}`);
  const recommendation =
    read.similarity >= 0.72
      ? "Сборка слишком узнаваема. Смените тактический профиль и хотя бы два активных навыка."
      : read.similarity >= 0.42
        ? "Соперник узнаёт отдельные элементы. Одной точечной замены может быть недостаточно."
        : "Текущий стиль заметно отличается от запомненного и способен застать соперника врасплох.";
  return {
    headline: `${stage.name} · сходство стиля ${Math.round(read.similarity * 100)}%`,
    familiarity: memory.familiarity,
    observations,
    countermeasures,
    recommendation,
  };
}
