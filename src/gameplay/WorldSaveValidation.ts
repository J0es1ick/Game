import {
  EquipmentItem,
  EquipmentSlot,
  GameSave,
  HeroClass,
  Rarity,
} from "./WorldTypes";

export interface WorldSaveValidationIssue {
  path: string;
  message: string;
}

export interface WorldSaveValidationResult {
  valid: boolean;
  issues: WorldSaveValidationIssue[];
}

const HERO_CLASSES = new Set<HeroClass>(["Knight", "Archer", "Wizard", "Monk", "Gunsmith", "Swordsman"]);
const EQUIPMENT_SLOTS = new Set<EquipmentSlot>(["weapon", "offhand", "head", "chest", "hands", "feet"]);
const RARITIES = new Set<Rarity>(["common", "rare", "epic", "legendary", "mythic"]);
const PENDING_BATTLE_KINDS = new Set([
  "dungeon", "expedition", "duel", "boss", "legacy-champion", "legend-hunt", "legend-defense",
  "arena-tournament", "crown-league",
]);
const TACTICAL_STYLES = new Set(["balanced", "aggressive", "defensive", "control"]);
const BATTLE_STATUS_IDS = new Set(["guarded", "marked", "arcane-surge", "burning", "bleeding", "staggered"]);
const CLASS_RESOURCE_IDS = new Set(["resolve", "focus", "arcana", "chi", "heat", "edge"]);
const CLASS_RESOURCE_BY_CLASS: Readonly<Record<HeroClass, string>> = {
  Knight: "resolve",
  Archer: "focus",
  Wizard: "arcana",
  Monk: "chi",
  Gunsmith: "heat",
  Swordsman: "edge",
};
const MEMORY_COUNTERMEASURE_IDS = new Set([
  "guarded-opening", "critical-guard", "healing-denial", "control-discipline", "signature-parry", "execution-watch",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function validateStringList(
  value: unknown,
  path: string,
  issues: WorldSaveValidationIssue[],
  options: { unique?: boolean } = {},
): value is string[] {
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
    issues.push({ path, message: "Ожидался список непустых строк." });
    return false;
  }
  if (options.unique && new Set(value).size !== value.length) {
    issues.push({ path, message: "Список не должен содержать повторяющиеся идентификаторы." });
    return false;
  }
  return true;
}

function validateItem(value: unknown, path: string, issues: WorldSaveValidationIssue[]): value is EquipmentItem {
  if (!isRecord(value)) {
    issues.push({ path, message: "Ожидался объект предмета." });
    return false;
  }
  const stringFields = ["id", "templateId", "name"] as const;
  stringFields.forEach((field) => {
    if (typeof value[field] !== "string" || !value[field]) {
      issues.push({ path: `${path}.${field}`, message: "Ожидалась непустая строка." });
    }
  });
  if (!EQUIPMENT_SLOTS.has(value.slot as EquipmentSlot)) {
    issues.push({ path: `${path}.slot`, message: "Неизвестный слот снаряжения." });
  }
  if (!RARITIES.has(value.rarity as Rarity)) {
    issues.push({ path: `${path}.rarity`, message: "Неизвестная редкость предмета." });
  }
  if (!isFiniteNumber(value.level) || value.level < 1) {
    issues.push({ path: `${path}.level`, message: "Уровень предмета должен быть положительным числом." });
  }
  if (!isRecord(value.stats)) issues.push({ path: `${path}.stats`, message: "Характеристики предмета повреждены." });
  if (value.allowedClasses !== "all" && !(
    Array.isArray(value.allowedClasses)
    && value.allowedClasses.every((classId) => HERO_CLASSES.has(classId as HeroClass))
  )) {
    issues.push({ path: `${path}.allowedClasses`, message: "Список разрешённых классов повреждён." });
  }
  return true;
}

function validateCollection(
  owner: Record<string, unknown>,
  key: string,
  path: string,
  issues: WorldSaveValidationIssue[],
): unknown[] | undefined {
  const value = owner[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    issues.push({ path: `${path}.${key}`, message: "Ожидался список." });
    return undefined;
  }
  return value;
}

function validateCombatantSnapshot(
  value: unknown,
  path: string,
  issues: WorldSaveValidationIssue[],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    issues.push({ path, message: "Снимок бойца отсутствует." });
    return false;
  }
  ["id", "name"].forEach((field) => {
    if (!isNonEmptyString(value[field])) {
      issues.push({ path: `${path}.${field}`, message: "Ожидалась непустая строка." });
    }
  });
  if (!HERO_CLASSES.has(value.classId as HeroClass)) {
    issues.push({ path: `${path}.classId`, message: "Неизвестный класс бойца." });
  }
  if (!isFiniteNumber(value.level) || !Number.isInteger(value.level) || value.level < 1) {
    issues.push({ path: `${path}.level`, message: "Уровень бойца должен быть положительным целым числом." });
  }
  if (value.originalLevel !== undefined
    && (!isFiniteNumber(value.originalLevel) || !Number.isInteger(value.originalLevel) || value.originalLevel < 1)) {
    issues.push({ path: `${path}.originalLevel`, message: "Исходный уровень бойца повреждён." });
  }
  if (!isFiniteNumber(value.maxHealth) || value.maxHealth <= 0) {
    issues.push({ path: `${path}.maxHealth`, message: "Максимальное здоровье должно быть положительным числом." });
  }
  if (!isFiniteNumber(value.health) || value.health < 0
    || (isFiniteNumber(value.maxHealth) && value.health > value.maxHealth)) {
    issues.push({ path: `${path}.health`, message: "Текущее здоровье выходит за допустимые границы." });
  }
  ["attack", "defense", "speed", "crit", "equipmentScore"].forEach((field) => {
    if (!isFiniteNumber(value[field]) || (value[field] as number) < 0) {
      issues.push({ path: `${path}.${field}`, message: "Характеристика должна быть конечным неотрицательным числом." });
    }
  });
  validateStringList(value.skills, `${path}.skills`, issues, { unique: true });
  ["traitIds", "injuryNames"].forEach((field) => {
    if (value[field] !== undefined) validateStringList(value[field], `${path}.${field}`, issues, { unique: true });
  });
  if (value.tacticalStyle !== undefined && !TACTICAL_STYLES.has(String(value.tacticalStyle))) {
    issues.push({ path: `${path}.tacticalStyle`, message: "Неизвестный тактический стиль." });
  }
  if (value.setCounts !== undefined) {
    if (!isRecord(value.setCounts) || !Object.values(value.setCounts).every(isNonNegativeInteger)) {
      issues.push({ path: `${path}.setCounts`, message: "Счётчики комплектов повреждены." });
    }
  }
  if (value.mutationId !== undefined && !isNonEmptyString(value.mutationId)) {
    issues.push({ path: `${path}.mutationId`, message: "Идентификатор мутации повреждён." });
  }
  if (value.mutationPotency !== undefined && (!isFiniteNumber(value.mutationPotency) || value.mutationPotency < 0)) {
    issues.push({ path: `${path}.mutationPotency`, message: "Сила мутации повреждена." });
  }
  return true;
}

function validateBattleRuntime(
  value: unknown,
  path: string,
  fighterIds: Set<string>,
  issues: WorldSaveValidationIssue[],
): value is Record<string, unknown> {
  if (!validateCombatantSnapshot(value, path, issues)) return false;
  if (!isRecord(value.cooldowns)) {
    issues.push({ path: `${path}.cooldowns`, message: "Перезарядки навыков отсутствуют." });
  } else {
    Object.entries(value.cooldowns).forEach(([skillId, cooldown]) => {
      if (!isNonEmptyString(skillId) || !isNonNegativeInteger(cooldown)) {
        issues.push({ path: `${path}.cooldowns.${skillId}`, message: "Перезарядка должна быть неотрицательным целым числом." });
      }
      if (Array.isArray(value.skills) && !value.skills.includes(skillId)) {
        issues.push({ path: `${path}.cooldowns.${skillId}`, message: "Перезарядка ссылается на неизвестный бойцу навык." });
      }
    });
  }
  ["buff", "weakened"].forEach((field) => {
    if (!isFiniteNumber(value[field]) || (value[field] as number) < 0) {
      issues.push({ path: `${path}.${field}`, message: "Эффект должен быть конечным неотрицательным числом." });
    }
  });
  ["attackCounter", "combo"].forEach((field) => {
    if (!isNonNegativeInteger(value[field])) {
      issues.push({ path: `${path}.${field}`, message: "Счётчик должен быть неотрицательным целым числом." });
    }
  });
  if (!isRecord(value.tactics)) {
    issues.push({ path: `${path}.tactics`, message: "Тактический профиль отсутствует." });
  } else {
    const tactics = value.tactics;
    ["id", "name"].forEach((field) => {
      if (!isNonEmptyString(tactics[field])) {
        issues.push({ path: `${path}.tactics.${field}`, message: "Ожидалась непустая строка." });
      }
    });
    if (!TACTICAL_STYLES.has(String(value.tactics.style))) {
      issues.push({ path: `${path}.tactics.style`, message: "Неизвестный тактический стиль." });
    }
    ["healThreshold", "finisherThreshold"].forEach((field) => {
      const threshold = tactics[field];
      if (!isFiniteNumber(threshold) || threshold < 0 || threshold > 1) {
        issues.push({ path: `${path}.tactics.${field}`, message: "Порог тактики должен находиться между 0 и 1." });
      }
    });
    ["preserveStrongSkills", "prioritizeControl"].forEach((field) => {
      if (typeof tactics[field] !== "boolean") {
        issues.push({ path: `${path}.tactics.${field}`, message: "Ожидалось логическое значение." });
      }
    });
    if (value.tacticalStyle !== undefined && value.tacticalStyle !== tactics.style) {
      issues.push({ path: `${path}.tactics.style`, message: "Тактика не совпадает со стилем снимка бойца." });
    }
  }
  if (typeof value.disableHealing !== "boolean") {
    issues.push({ path: `${path}.disableHealing`, message: "Флаг запрета лечения повреждён." });
  }
  if (!Array.isArray(value.statuses)) {
    issues.push({ path: `${path}.statuses`, message: "Состояния бойца отсутствуют." });
  } else {
    value.statuses.forEach((status, index) => {
      const statusPath = `${path}.statuses[${index}]`;
      if (!isRecord(status)) {
        issues.push({ path: statusPath, message: "Состояние бойца повреждено." });
        return;
      }
      if (!BATTLE_STATUS_IDS.has(String(status.id))) {
        issues.push({ path: `${statusPath}.id`, message: "Неизвестный боевой эффект." });
      }
      ["name", "description"].forEach((field) => {
        if (!isNonEmptyString(status[field])) issues.push({ path: `${statusPath}.${field}`, message: "Ожидалась непустая строка." });
      });
      if (!isNonNegativeInteger(status.duration)) {
        issues.push({ path: `${statusPath}.duration`, message: "Длительность эффекта повреждена." });
      }
      if (!isFiniteNumber(status.stacks) || !Number.isInteger(status.stacks) || status.stacks < 1 || status.stacks > 3) {
        issues.push({ path: `${statusPath}.stacks`, message: "Число наложений эффекта должно находиться между 1 и 3." });
      }
      if (status.sourceId !== undefined && (!isNonEmptyString(status.sourceId) || !fighterIds.has(status.sourceId))) {
        issues.push({ path: `${statusPath}.sourceId`, message: "Источник эффекта не является участником боя." });
      }
    });
  }
  if (!isRecord(value.resource)) {
    issues.push({ path: `${path}.resource`, message: "Классовый ресурс отсутствует." });
  } else {
    if (!CLASS_RESOURCE_IDS.has(String(value.resource.id))) {
      issues.push({ path: `${path}.resource.id`, message: "Неизвестный классовый ресурс." });
    }
    if (HERO_CLASSES.has(value.classId as HeroClass)
      && value.resource.id !== CLASS_RESOURCE_BY_CLASS[value.classId as HeroClass]) {
      issues.push({ path: `${path}.resource.id`, message: "Классовый ресурс не соответствует классу бойца." });
    }
    if (!isNonEmptyString(value.resource.name)) {
      issues.push({ path: `${path}.resource.name`, message: "Название классового ресурса повреждено." });
    }
    if (!isFiniteNumber(value.resource.maximum) || value.resource.maximum <= 0) {
      issues.push({ path: `${path}.resource.maximum`, message: "Максимум классового ресурса должен быть положительным." });
    }
    if (!isFiniteNumber(value.resource.current) || value.resource.current < 0
      || (isFiniteNumber(value.resource.maximum) && value.resource.current > value.resource.maximum)) {
      issues.push({ path: `${path}.resource.current`, message: "Текущее значение классового ресурса выходит за допустимые границы." });
    }
  }
  if (!isFiniteNumber(value.nextActionAt) || value.nextActionAt < 0) {
    issues.push({ path: `${path}.nextActionAt`, message: "Инициатива следующего действия повреждена." });
  }
  validateStringList(value.usedMechanics, `${path}.usedMechanics`, issues, { unique: true });
  if (value.memoryRead !== undefined) {
    if (!isRecord(value.memoryRead)) {
      issues.push({ path: `${path}.memoryRead`, message: "Снимок памяти противника повреждён." });
    } else {
      const memoryRead = value.memoryRead;
      ["similarity", "strength"].forEach((field) => {
        const metric = memoryRead[field];
        if (!isFiniteNumber(metric) || metric < 0 || metric > 1) {
          issues.push({ path: `${path}.memoryRead.${field}`, message: "Метрика памяти должна находиться между 0 и 1." });
        }
      });
      if (!Array.isArray(value.memoryRead.countermeasureIds)
        || !value.memoryRead.countermeasureIds.every((id) => MEMORY_COUNTERMEASURE_IDS.has(String(id)))) {
        issues.push({ path: `${path}.memoryRead.countermeasureIds`, message: "Контрмеры памяти повреждены." });
      }
      if (value.memoryRead.signatureSkillId !== undefined && !isNonEmptyString(value.memoryRead.signatureSkillId)) {
        issues.push({ path: `${path}.memoryRead.signatureSkillId`, message: "Сигнатурный навык памяти повреждён." });
      }
    }
  }
    if (!isRecord(value.mutationState)) {
    issues.push({ path: `${path}.mutationState`, message: "Состояние мутации отсутствует." });
  } else {
    const mutationState = value.mutationState;
    if (!isNonNegativeInteger(value.mutationState.counter)) {
      issues.push({ path: `${path}.mutationState.counter`, message: "Счётчик мутации повреждён." });
    }
    ["consumed", "primed"].forEach((field) => {
      if (typeof mutationState[field] !== "boolean") {
        issues.push({ path: `${path}.mutationState.${field}`, message: "Ожидалось логическое значение." });
      }
    });
  }
  return true;
}

function validateBattleReportReference(
  value: unknown,
  path: string,
  participantIds: Set<string>,
  issues: WorldSaveValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "Отчёт турнирного боя повреждён." });
    return;
  }
  ["winnerId", "loserId"].forEach((field) => {
    if (!isNonEmptyString(value[field]) || !participantIds.has(value[field] as string)) {
      issues.push({ path: `${path}.${field}`, message: "Отчёт ссылается на неизвестного участника турнира." });
    }
  });
  if (value.winnerId === value.loserId) {
    issues.push({ path, message: "Победитель и проигравший в отчёте совпадают." });
  }
  if (!isRecord(value.heroBefore) || value.heroBefore.id !== "hero") {
    issues.push({ path: `${path}.heroBefore`, message: "Отчёт не содержит снимок главного героя." });
  }
  if (!isRecord(value.enemyBefore) || !isNonEmptyString(value.enemyBefore.id)
    || !participantIds.has(value.enemyBefore.id)) {
    issues.push({ path: `${path}.enemyBefore`, message: "Отчёт ссылается на неизвестного соперника." });
  }
  if (!Array.isArray(value.turns)) {
    issues.push({ path: `${path}.turns`, message: "История турнирного боя повреждена." });
  }
}

function validatePendingTournamentState(
  value: unknown,
  pending: Record<string, unknown>,
  issues: WorldSaveValidationIssue[],
): void {
  const path = "$.pendingBattle.tournament";
  if (!isRecord(value)) {
    issues.push({ path, message: "Состояние турнирной сетки отсутствует." });
    return;
  }
  const expectedKind = pending.kind === "arena-tournament" ? "arena" : "crown";
  if (value.kind !== expectedKind) {
    issues.push({ path: `${path}.kind`, message: "Тип сетки не соответствует виду незавершённого турнира." });
  }
  if (!isNonEmptyString(value.activityId) || value.activityId !== pending.activityId) {
    issues.push({ path: `${path}.activityId`, message: "Активность сетки не совпадает с незавершённым боем." });
  }
  const participantsValid = validateStringList(value.participantIds, `${path}.participantIds`, issues, { unique: true });
  const participants = new Set(participantsValid ? value.participantIds as string[] : []);
  if (participantsValid && participants.size < 2) {
    issues.push({ path: `${path}.participantIds`, message: "В турнирной сетке должно быть хотя бы два участника." });
  }
  ["hero", pending.enemyId].forEach((id) => {
    if (isNonEmptyString(id) && participantsValid && !participants.has(id)) {
      issues.push({ path: `${path}.participantIds`, message: `В сетке отсутствует участник ${id}.` });
    }
  });
  const seedsValid = validateStringList(value.initialSeeds, `${path}.initialSeeds`, issues, { unique: true });
  if (participantsValid && seedsValid) {
    const seeds = value.initialSeeds as string[];
    if (seeds.length !== participants.size || seeds.some((id) => !participants.has(id))) {
      issues.push({ path: `${path}.initialSeeds`, message: "Начальные посевы не совпадают с составом участников." });
    }
  }
  if (!isFiniteNumber(value.round) || !Number.isInteger(value.round) || value.round < 1) {
    issues.push({ path: `${path}.round`, message: "Номер раунда повреждён." });
  }
  const pairs: Array<[string, string?]> = [];
  if (!Array.isArray(value.pairs) || value.pairs.length === 0) {
    issues.push({ path: `${path}.pairs`, message: "Пары текущего раунда отсутствуют." });
  } else {
    const seenInRound = new Set<string>();
    value.pairs.forEach((pair, index) => {
      const pairPath = `${path}.pairs[${index}]`;
      if (!Array.isArray(pair) || pair.length < 1 || pair.length > 2
        || !isNonEmptyString(pair[0]) || (pair.length === 2 && !isNonEmptyString(pair[1]))) {
        issues.push({ path: pairPath, message: "Турнирная пара повреждена." });
        return;
      }
      const typedPair: [string, string?] = [pair[0], pair[1]];
      pairs.push(typedPair);
      typedPair.forEach((fighterId) => {
        if (!fighterId) return;
        if (participantsValid && !participants.has(fighterId)) {
          issues.push({ path: pairPath, message: `Пара ссылается на неизвестного участника ${fighterId}.` });
        }
        if (seenInRound.has(fighterId)) {
          issues.push({ path: pairPath, message: `Участник ${fighterId} повторяется в текущем раунде.` });
        }
        seenInRound.add(fighterId);
      });
      if (typedPair[1] && typedPair[0] === typedPair[1]) {
        issues.push({ path: pairPath, message: "Боец не может встретиться сам с собой." });
      }
    });
  }
  const pairIndexValid = isFiniteNumber(value.pairIndex) && Number.isInteger(value.pairIndex)
    && value.pairIndex >= 0 && value.pairIndex < pairs.length;
  if (!pairIndexValid) {
    issues.push({ path: `${path}.pairIndex`, message: "Курсор турнирной сетки выходит за границы текущего раунда." });
  }
  const winnersValid = validateStringList(value.roundWinners, `${path}.roundWinners`, issues, { unique: true });
  if (winnersValid) {
    const winners = value.roundWinners as string[];
    if (participantsValid && winners.some((id) => !participants.has(id))) {
      issues.push({ path: `${path}.roundWinners`, message: "Победители раунда ссылаются на неизвестного участника." });
    }
    if (pairIndexValid && winners.length !== value.pairIndex) {
      issues.push({ path: `${path}.roundWinners`, message: "Число победителей не совпадает с курсором обработанных пар." });
    }
  }
  if (pairIndexValid) {
    const currentPair = pairs[value.pairIndex as number];
    const pairIds = new Set(currentPair.filter(Boolean));
    if (!pairIds.has("hero") || !pairIds.has(String(pending.enemyId))) {
      issues.push({ path: `${path}.pairs[${value.pairIndex}]`, message: "Текущая пара не совпадает с участниками незавершённого боя." });
    }
  }
  if (!Array.isArray(value.matches)) {
    issues.push({ path: `${path}.matches`, message: "История матчей сетки повреждена." });
  } else {
    const matchKeys = new Set<string>();
    value.matches.forEach((match, index) => {
      const matchPath = `${path}.matches[${index}]`;
      if (!isRecord(match)) {
        issues.push({ path: matchPath, message: "Матч сетки повреждён." });
        return;
      }
      if (!isFiniteNumber(match.round) || !Number.isInteger(match.round) || match.round < 1
        || !isFiniteNumber(match.match) || !Number.isInteger(match.match) || match.match < 1) {
        issues.push({ path: matchPath, message: "Позиция матча в сетке повреждена." });
      } else {
        const key = `${match.round}:${match.match}`;
        if (matchKeys.has(key)) issues.push({ path: matchPath, message: "Позиция матча повторяется в сетке." });
        matchKeys.add(key);
      }
      ["firstId", "winnerId"].forEach((field) => {
        if (!isNonEmptyString(match[field]) || (participantsValid && !participants.has(match[field] as string))) {
          issues.push({ path: `${matchPath}.${field}`, message: "Матч ссылается на неизвестного участника." });
        }
      });
      if (match.secondId !== undefined
        && (!isNonEmptyString(match.secondId) || (participantsValid && !participants.has(match.secondId)))) {
        issues.push({ path: `${matchPath}.secondId`, message: "Матч ссылается на неизвестного второго участника." });
      }
      const ids = [match.firstId, match.secondId].filter(isNonEmptyString);
      if (isNonEmptyString(match.winnerId) && !ids.includes(match.winnerId)) {
        issues.push({ path: `${matchPath}.winnerId`, message: "Победитель не участвовал в этом матче." });
      }
      if (typeof match.bye !== "boolean" || match.bye !== (match.secondId === undefined)) {
        issues.push({ path: `${matchPath}.bye`, message: "Признак автоматического прохода не соответствует составу матча." });
      }
      const heroInvolved = ids.includes("hero");
      if (typeof match.heroInvolved !== "boolean" || match.heroInvolved !== heroInvolved) {
        issues.push({ path: `${matchPath}.heroInvolved`, message: "Признак участия героя повреждён." });
      }
      if (match.battle !== undefined) {
        validateBattleReportReference(match.battle, `${matchPath}.battle`, participants, issues);
        if (isRecord(match.battle) && match.battle.winnerId !== match.winnerId) {
          issues.push({ path: `${matchPath}.battle.winnerId`, message: "Победитель отчёта не совпадает с победителем матча." });
        }
      } else if (heroInvolved && !match.bye) {
        issues.push({ path: `${matchPath}.battle`, message: "Для сыгранного матча героя отсутствует отчёт." });
      }
    });
    if (pairIndexValid && isFiniteNumber(value.round)) {
      const processedCurrentRound = value.matches.filter((match) => isRecord(match) && match.round === value.round).length;
      if (processedCurrentRound !== value.pairIndex) {
        issues.push({ path: `${path}.matches`, message: "История матчей не совпадает с курсором текущего раунда." });
      }
    }
  }
  if (!Array.isArray(value.heroBattles)) {
    issues.push({ path: `${path}.heroBattles`, message: "История боёв героя повреждена." });
  } else {
    value.heroBattles.forEach((battle, index) => {
      validateBattleReportReference(battle, `${path}.heroBattles[${index}]`, participants, issues);
    });
  }
  if (!isFiniteNumber(value.heroPlacement) || !Number.isInteger(value.heroPlacement)
    || value.heroPlacement < 1 || (participantsValid && value.heroPlacement > participants.size)) {
    issues.push({ path: `${path}.heroPlacement`, message: "Место героя выходит за границы турнирной сетки." });
  }
  validateStringList(value.ruleIds, `${path}.ruleIds`, issues, { unique: true });
  if (value.wasElite !== undefined && typeof value.wasElite !== "boolean") {
    issues.push({ path: `${path}.wasElite`, message: "Признак участия в элите повреждён." });
  }
  if (value.eventCursor !== undefined && !isNonEmptyString(value.eventCursor)) {
    issues.push({ path: `${path}.eventCursor`, message: "Курсор мировых событий повреждён." });
  }
}

function validatePendingBattle(value: unknown, issues: WorldSaveValidationIssue[]): void {
  const path = "$.pendingBattle";
  if (!isRecord(value)) {
    issues.push({ path, message: "Незавершённый бой повреждён." });
    return;
  }
  if (value.version !== 1) issues.push({ path: `${path}.version`, message: "Неизвестная версия незавершённого боя." });
  if (!PENDING_BATTLE_KINDS.has(String(value.kind))) {
    issues.push({ path: `${path}.kind`, message: "Неизвестный вид незавершённого боя." });
  }
  ["id", "activityId", "enemyId"].forEach((field) => {
    if (!isNonEmptyString(value[field])) {
      issues.push({ path: `${path}.${field}`, message: "Ожидалась непустая строка." });
    }
  });
  if (!isFiniteNumber(value.startedDay) || !Number.isInteger(value.startedDay) || value.startedDay < 1) {
    issues.push({ path: `${path}.startedDay`, message: "День начала боя повреждён." });
  }
  if (!isRecord(value.enemy)) {
    issues.push({ path: `${path}.enemy`, message: "Данные противника отсутствуют." });
  } else if (!isNonEmptyString(value.enemy.id) || value.enemy.id !== value.enemyId) {
    issues.push({ path: `${path}.enemy.id`, message: "Данные противника не совпадают с идентификатором незавершённого боя." });
  }
  if (!isRecord(value.session)) {
    issues.push({ path: `${path}.session`, message: "Состояние пошагового боя отсутствует." });
  } else {
    const session = value.session;
    if (session.version !== 1) issues.push({ path: `${path}.session.version`, message: "Неизвестная версия пошагового боя." });
    const fighterIds = new Set(["hero", ...(isNonEmptyString(value.enemyId) ? [value.enemyId] : [])]);
    validateCombatantSnapshot(session.heroBefore, `${path}.session.heroBefore`, issues);
    validateCombatantSnapshot(session.enemyBefore, `${path}.session.enemyBefore`, issues);
    validateBattleRuntime(session.hero, `${path}.session.hero`, fighterIds, issues);
    validateBattleRuntime(session.enemy, `${path}.session.enemy`, fighterIds, issues);
    if (isRecord(session.heroBefore) && session.heroBefore.id !== "hero") {
      issues.push({ path: `${path}.session.heroBefore.id`, message: "Снимок главного героя должен иметь идентификатор hero." });
    }
    if (isRecord(session.hero) && session.hero.id !== "hero") {
      issues.push({ path: `${path}.session.hero.id`, message: "Текущее состояние главного героя должно иметь идентификатор hero." });
    }
    ["enemyBefore", "enemy"].forEach((field) => {
      if (isRecord(session[field]) && session[field].id !== value.enemyId) {
        issues.push({ path: `${path}.session.${field}.id`, message: "Снимок противника не совпадает с незавершённым боем." });
      }
    });
    if (isRecord(session.heroBefore) && isRecord(session.hero) && session.heroBefore.classId !== session.hero.classId) {
      issues.push({ path: `${path}.session.hero.classId`, message: "Класс героя изменился внутри незавершённого боя." });
    }
    if (isRecord(session.enemyBefore) && isRecord(session.enemy) && session.enemyBefore.classId !== session.enemy.classId) {
      issues.push({ path: `${path}.session.enemy.classId`, message: "Класс противника изменился внутри незавершённого боя." });
    }
    if (!Array.isArray(session.turns)) {
      issues.push({ path: `${path}.session.turns`, message: "История ходов повреждена." });
    } else {
      if (session.turns.length > 120) {
        issues.push({ path: `${path}.session.turns`, message: "История боя превышает допустимый предел в 120 ходов." });
      }
      const maxHealthById = new Map<string, number>();
      if (isRecord(session.hero) && isFiniteNumber(session.hero.maxHealth)) maxHealthById.set("hero", session.hero.maxHealth);
      if (isRecord(session.enemy) && isNonEmptyString(value.enemyId) && isFiniteNumber(session.enemy.maxHealth)) {
        maxHealthById.set(value.enemyId, session.enemy.maxHealth);
      }
      session.turns.forEach((turn, index) => {
        const turnPath = `${path}.session.turns[${index}]`;
        if (!isRecord(turn)) {
          issues.push({ path: turnPath, message: "Ход боя повреждён." });
          return;
        }
        if (!isFiniteNumber(turn.turn) || !Number.isInteger(turn.turn) || turn.turn !== index + 1) {
          issues.push({ path: `${turnPath}.turn`, message: "Нумерация ходов должна быть непрерывной." });
        }
        ["actorId", "targetId"].forEach((field) => {
          if (!isNonEmptyString(turn[field]) || !fighterIds.has(turn[field] as string)) {
            issues.push({ path: `${turnPath}.${field}`, message: "Ход ссылается на неизвестного участника боя." });
          }
        });
        ["actorName", "targetName", "action", "detail"].forEach((field) => {
          if (typeof turn[field] !== "string" || (field !== "detail" && !turn[field])) {
            issues.push({ path: `${turnPath}.${field}`, message: "Текст хода повреждён." });
          }
        });
        if (turn.skillId !== undefined && !isNonEmptyString(turn.skillId)) {
          issues.push({ path: `${turnPath}.skillId`, message: "Идентификатор применённого навыка повреждён." });
        }
        ["damage", "healing"].forEach((field) => {
          if (!isFiniteNumber(turn[field]) || (turn[field] as number) < 0) {
            issues.push({ path: `${turnPath}.${field}`, message: "Значение хода должно быть конечным неотрицательным числом." });
          }
        });
        [["actorHealth", turn.actorId], ["targetHealth", turn.targetId]].forEach(([field, fighterId]) => {
          const health = turn[field as string];
          const maximum = typeof fighterId === "string" ? maxHealthById.get(fighterId) : undefined;
          if (!isFiniteNumber(health) || health < 0 || (maximum !== undefined && health > maximum)) {
            issues.push({ path: `${turnPath}.${field}`, message: "Здоровье после хода выходит за допустимые границы." });
          }
        });
        if (typeof turn.critical !== "boolean") {
          issues.push({ path: `${turnPath}.critical`, message: "Признак критического удара повреждён." });
        }
      });
    }
    if (!isNonEmptyString(session.nextActorId) || !fighterIds.has(session.nextActorId)) {
      issues.push({ path: `${path}.session.nextActorId`, message: "Следующий участник не принадлежит этому бою." });
    }
    if (session.winnerId !== undefined && (!isNonEmptyString(session.winnerId) || !fighterIds.has(session.winnerId))) {
      issues.push({ path: `${path}.session.winnerId`, message: "Победитель не принадлежит этому бою." });
    }
    if (!isRecord(session.random)) {
      issues.push({ path: `${path}.session.random`, message: "Состояние генератора боя отсутствует." });
    } else {
      const random = session.random;
      ["seed", "state", "calls"].forEach((field) => {
        const snapshotValue = random[field];
        if (!isNonNegativeInteger(snapshotValue) || (field !== "calls" && snapshotValue > 0xffff_ffff)) {
          issues.push({ path: `${path}.session.random.${field}`, message: "Снимок генератора боя повреждён." });
        }
      });
    }
  }
  const isTournament = value.kind === "arena-tournament" || value.kind === "crown-league";
  if (isTournament) validatePendingTournamentState(value.tournament, value, issues);
  else if (value.tournament !== undefined) {
    issues.push({ path: `${path}.tournament`, message: "У нетурнирного боя не должно быть состояния сетки." });
  }
  if (value.context !== undefined) {
    if (!isRecord(value.context)) {
      issues.push({ path: `${path}.context`, message: "Контекст незавершённого боя повреждён." });
    } else {
      Object.entries(value.context).forEach(([key, contextValue]) => {
        const validPrimitive = typeof contextValue === "string" || typeof contextValue === "boolean" || isFiniteNumber(contextValue);
        const validArray = Array.isArray(contextValue)
          && (contextValue.every((entry) => typeof entry === "string") || contextValue.every(isFiniteNumber));
        if (contextValue !== undefined && !validPrimitive && !validArray) {
          issues.push({ path: `${path}.context.${key}`, message: "Значение контекста не поддерживается." });
        }
      });
    }
  }
}

export function validateWorldSave(value: unknown): WorldSaveValidationResult {
  const issues: WorldSaveValidationIssue[] = [];
  const itemIds: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: [{ path: "$", message: "Сохранение должно быть объектом." }] };

  if (value.version !== 2 && value.version !== 3) {
    issues.push({ path: "$.version", message: "Поддерживаются только версии сохранений 2 и 3." });
  }
  if (!isFiniteNumber(value.worldDay) || value.worldDay < 1) {
    issues.push({ path: "$.worldDay", message: "День мира повреждён." });
  }
  if (!isFiniteNumber(value.lastSimulatedAt) || value.lastSimulatedAt < 0) {
    issues.push({ path: "$.lastSimulatedAt", message: "Время последней симуляции повреждено." });
  }

  if (!isRecord(value.hero)) {
    issues.push({ path: "$.hero", message: "Данные главного героя отсутствуют." });
  } else {
    const hero = value.hero;
    if (typeof hero.id !== "string" || typeof hero.name !== "string") {
      issues.push({ path: "$.hero", message: "Имя или идентификатор героя повреждены." });
    }
    if (!HERO_CLASSES.has(hero.classId as HeroClass)) {
      issues.push({ path: "$.hero.classId", message: "Неизвестный класс героя." });
    }
    ["level", "experience", "experienceToNextLevel", "gold", "rating", "wins", "losses", "highestArena", "createdAt"]
      .forEach((field) => {
        if (!isFiniteNumber(hero[field])) issues.push({ path: `$.hero.${field}`, message: "Ожидалось конечное число." });
      });
    const inventory = validateCollection(hero, "inventory", "$.hero", issues);
    inventory?.forEach((item, index) => {
      validateItem(item, `$.hero.inventory[${index}]`, issues);
      if (isRecord(item) && typeof item.id === "string") itemIds.push(item.id);
    });
    const arenaWins = validateCollection(hero, "arenaWins", "$.hero", issues);
    if (arenaWins && !arenaWins.every(isFiniteNumber)) {
      issues.push({ path: "$.hero.arenaWins", message: "Победы по аренам должны быть числами." });
    }
    if (!isRecord(hero.equipped)) issues.push({ path: "$.hero.equipped", message: "Экипировка героя повреждена." });
    else if (inventory) {
      const byId = new Map(inventory.filter(isRecord).map((item) => [item.id, item]));
      Object.entries(hero.equipped).forEach(([slot, itemId]) => {
        const item = byId.get(itemId);
        if (typeof itemId !== "string" || !isRecord(item) || item.slot !== slot) {
          issues.push({ path: `$.hero.equipped.${slot}`, message: "Ссылка на надетый предмет повреждена." });
        }
      });
    }
    if (hero.factionReputation !== undefined && (!isRecord(hero.factionReputation)
      || !Object.values(hero.factionReputation).every(isFiniteNumber))) {
      issues.push({ path: "$.hero.factionReputation", message: "Репутация фракций повреждена." });
    }
  }

  if (!Array.isArray(value.enemies)) {
    issues.push({ path: "$.enemies", message: "Список бойцов мира отсутствует." });
  } else {
    value.enemies.forEach((candidate, index) => {
      const path = `$.enemies[${index}]`;
      if (!isRecord(candidate)) {
        issues.push({ path, message: "Ожидался объект бойца." });
        return;
      }
      if (typeof candidate.id !== "string" || typeof candidate.name !== "string") {
        issues.push({ path, message: "Имя или идентификатор бойца повреждены." });
      }
      if (!HERO_CLASSES.has(candidate.classId as HeroClass)) {
        issues.push({ path: `${path}.classId`, message: "Неизвестный класс бойца." });
      }
      ["level", "experience", "rating", "wins", "losses", "arenaIndex", "arenaWins"]
        .forEach((field) => {
          if (!isFiniteNumber(candidate[field])) issues.push({ path: `${path}.${field}`, message: "Ожидалось конечное число." });
        });
      ["tournamentWins", "kills"].forEach((field) => {
        if (candidate[field] !== undefined && !isFiniteNumber(candidate[field])) {
          issues.push({ path: `${path}.${field}`, message: "Ожидалось конечное число." });
        }
      });
      if (candidate.arenaTournamentWins !== undefined && !(
        Array.isArray(candidate.arenaTournamentWins)
        && candidate.arenaTournamentWins.every(isFiniteNumber)
      )) {
        issues.push({ path: `${path}.arenaTournamentWins`, message: "История чемпионств по аренам повреждена." });
      }
      if (typeof candidate.alive !== "boolean") issues.push({ path: `${path}.alive`, message: "Признак жизни повреждён." });
      const equipment = validateCollection(candidate, "equipment", path, issues);
      equipment?.forEach((item, itemIndex) => {
        validateItem(item, `${path}.equipment[${itemIndex}]`, issues);
        if (isRecord(item) && typeof item.id === "string") itemIds.push(item.id);
      });
      if (!isRecord(candidate.equipped)) issues.push({ path: `${path}.equipped`, message: "Экипировка бойца повреждена." });
      else if (equipment) {
        const byId = new Map(equipment.filter(isRecord).map((item) => [item.id, item]));
        Object.entries(candidate.equipped).forEach(([slot, itemId]) => {
          const item = byId.get(itemId);
          if (typeof itemId !== "string" || !isRecord(item) || item.slot !== slot) {
            issues.push({ path: `${path}.equipped.${slot}`, message: "Ссылка на экипировку бойца повреждена." });
          }
        });
      }
      if (!Array.isArray(candidate.history)) issues.push({ path: `${path}.history`, message: "История бойца повреждена." });
    });
  }

  const optionalArrays = [
    "shopOffers", "discoveredItems", "defeatedBosses", "huntedLegendIds", "eliteLeagueMemberIds",
    "defeatedLegacyCycles", "events", "contractOffers", "seenNarrativeEventIds", "migrations",
    "seenContextualTutorialIds", "unlockedFeatureIds", "pendingFeatureUnlocks",
  ];
  optionalArrays.forEach((key) => {
    if (value[key] !== undefined && !Array.isArray(value[key])) {
      issues.push({ path: `$.${key}`, message: "Ожидался список." });
    }
  });
  ["migrations", "seenContextualTutorialIds", "unlockedFeatureIds"].forEach((key) => {
    const list = value[key];
    if (Array.isArray(list) && !list.every((entry) => typeof entry === "string")) {
      issues.push({ path: `$.${key}`, message: "Ожидался список строк." });
    }
  });
  if (Array.isArray(value.pendingFeatureUnlocks)
    && !value.pendingFeatureUnlocks.every((entry) => isRecord(entry)
      && typeof entry.id === "string" && isFiniteNumber(entry.day)
      && typeof entry.title === "string" && typeof entry.description === "string")) {
    issues.push({ path: "$.pendingFeatureUnlocks", message: "Оповещения об открытии функций повреждены." });
  }
  if (Array.isArray(value.seenNarrativeEventIds)
    && !value.seenNarrativeEventIds.every((id) => typeof id === "string")) {
    issues.push({ path: "$.seenNarrativeEventIds", message: "Идентификаторы событий должны быть строками." });
  }
  const optionalRecords = ["dungeonClears", "tournamentRegistrations", "eliteRatings", "eliteCrownWins", "reforgeAttempts"];
  optionalRecords.forEach((key) => {
    if (value[key] !== undefined && !isRecord(value[key])) {
      issues.push({ path: `$.${key}`, message: "Ожидался объект-словарь." });
    }
  });
  if (isRecord(value.reforgeAttempts)
    && !Object.values(value.reforgeAttempts).every((attempt) => isFiniteNumber(attempt) && attempt >= 0)) {
    issues.push({ path: "$.reforgeAttempts", message: "Число перековок должно быть неотрицательным." });
  }
  if (value.randomSnapshots !== undefined) {
    if (!isRecord(value.randomSnapshots)) {
      issues.push({ path: "$.randomSnapshots", message: "Состояние генератора случайности повреждено." });
    } else {
      ["world", "combat", "loot"].forEach((stream) => {
        const snapshot = value.randomSnapshots as Record<string, unknown>;
        if (!isRecord(snapshot[stream])) {
          issues.push({ path: `$.randomSnapshots.${stream}`, message: "Снимок потока отсутствует." });
          return;
        }
        const streamSnapshot = snapshot[stream] as Record<string, unknown>;
        ["seed", "state", "calls"].forEach((field) => {
          if (!isFiniteNumber(streamSnapshot[field])) {
            issues.push({ path: `$.randomSnapshots.${stream}.${field}`, message: "Ожидалось конечное число." });
          }
        });
      });
    }
  }
  if (value.crownSeason !== undefined) {
    if (!isRecord(value.crownSeason)) {
      issues.push({ path: "$.crownSeason", message: "Состояние сезона Лиги короны повреждено." });
    } else {
      const season = value.crownSeason;
      ["number", "startsDay", "endsDay"].forEach((field) => {
        if (!isFiniteNumber(season[field])) {
          issues.push({ path: `$.crownSeason.${field}`, message: "Ожидалось конечное число." });
        }
      });
      if (!Array.isArray(season.ruleIds) || !season.ruleIds.every((id) => typeof id === "string")) {
        issues.push({ path: "$.crownSeason.ruleIds", message: "Правила сезона повреждены." });
      }
      ["points", "defenses"].forEach((field) => {
        const record = season[field];
        if (!isRecord(record) || !Object.values(record).every(isFiniteNumber)) {
          issues.push({ path: `$.crownSeason.${field}`, message: "Таблица сезона повреждена." });
        }
      });
    }
  }
  if (value.lastCrownSeasonResult !== undefined) {
    if (!isRecord(value.lastCrownSeasonResult)) {
      issues.push({ path: "$.lastCrownSeasonResult", message: "Итог сезона Лиги короны повреждён." });
    } else {
      const seasonResult = value.lastCrownSeasonResult;
      ["season", "completedDay", "heroPoints", "rewardGold", "rewardTemperingMarks"].forEach((field) => {
        if (!isFiniteNumber(seasonResult[field])) {
          issues.push({ path: `$.lastCrownSeasonResult.${field}`, message: "Ожидалось конечное число." });
        }
      });
      if (seasonResult.heroRank !== undefined && !isFiniteNumber(seasonResult.heroRank)) {
        issues.push({ path: "$.lastCrownSeasonResult.heroRank", message: "Место героя повреждено." });
      }
    }
  }
  if (value.lootTarget !== undefined) {
    if (!isRecord(value.lootTarget)) {
      issues.push({ path: "$.lootTarget", message: "Цель добычи повреждена." });
    } else {
      if (value.lootTarget.slot !== undefined && !EQUIPMENT_SLOTS.has(value.lootTarget.slot as EquipmentSlot)) {
        issues.push({ path: "$.lootTarget.slot", message: "Неизвестный слот цели добычи." });
      }
      if (value.lootTarget.setId !== undefined && typeof value.lootTarget.setId !== "string") {
        issues.push({ path: "$.lootTarget.setId", message: "Комплект цели добычи повреждён." });
      }
    }
  }
  if (value.lootPity !== undefined && (!isRecord(value.lootPity)
    || typeof value.lootPity.targetKey !== "string"
    || !isFiniteNumber(value.lootPity.misses)
    || value.lootPity.misses < 0)) {
    issues.push({ path: "$.lootPity", message: "Счётчик гарантированной добычи повреждён." });
  }
  if (value.eraChallengeProgress !== undefined) {
    if (!isRecord(value.eraChallengeProgress)) {
      issues.push({ path: "$.eraChallengeProgress", message: "Прогресс испытаний эпохи повреждён." });
    } else {
      const progress = value.eraChallengeProgress;
      if (!isFiniteNumber(progress.cycle)) {
        issues.push({ path: "$.eraChallengeProgress.cycle", message: "Номер эпохи повреждён." });
      }
      ["completedObjectiveIds", "rewardedObjectiveIds", "masteredClassIds", "defeatedRivalIds"].forEach((field) => {
        const list = progress[field];
        if (field === "rewardedObjectiveIds" && list === undefined) return;
        if (!Array.isArray(list) || !list.every((entry) => typeof entry === "string")) {
          issues.push({ path: `$.eraChallengeProgress.${field}`, message: "Ожидался список идентификаторов." });
        }
      });
      if (!isRecord(progress.metrics)
        || !Object.values(progress.metrics).every(isFiniteNumber)) {
        issues.push({ path: "$.eraChallengeProgress.metrics", message: "Метрики эпохи повреждены." });
      }
    }
  }
  if (value.pendingBattle !== undefined) validatePendingBattle(value.pendingBattle, issues);
  if (value.activeExpedition !== undefined) {
    if (!isRecord(value.activeExpedition)) {
      issues.push({ path: "$.activeExpedition", message: "Активный поход повреждён." });
    } else {
      const expedition = value.activeExpedition;
      // `health` is normalized after structural validation. Older builds could
      // omit it, and a bad scalar must not discard an otherwise resumable trip.
      ["stage", "maxStages", "accumulatedGold", "accumulatedExperience"].forEach((field) => {
        if (!isFiniteNumber(expedition[field])) {
          issues.push({ path: `$.activeExpedition.${field}`, message: "Ожидалось конечное число." });
        }
      });
      ["loot", "path", "visitedNodeIds"].forEach((field) => {
        if (expedition[field] !== undefined && !Array.isArray(expedition[field])) {
          issues.push({ path: `$.activeExpedition.${field}`, message: "Ожидался список." });
        }
      });
      ["path", "visitedNodeIds"].forEach((field) => {
        const list = expedition[field];
        if (Array.isArray(list) && !list.every((entry) => typeof entry === "string")) {
          issues.push({ path: `$.activeExpedition.${field}`, message: "Ожидался список строк." });
        }
      });
      if (Array.isArray(expedition.loot)) {
        expedition.loot.forEach((item, index) => {
          validateItem(item, `$.activeExpedition.loot[${index}]`, issues);
          if (isRecord(item) && typeof item.id === "string") itemIds.push(item.id);
        });
      }
      if (expedition.route !== undefined) {
        const route = expedition.route;
        if (!isRecord(route) || !Array.isArray(route.nodes) || typeof route.bossNodeId !== "string") {
          issues.push({ path: "$.activeExpedition.route", message: "Маршрут похода повреждён." });
        } else {
          route.nodes.forEach((node, index) => {
            if (!isRecord(node) || typeof node.id !== "string" || !isFiniteNumber(node.depth)
              || !Array.isArray(node.connections) || !node.connections.every((id) => typeof id === "string")) {
              issues.push({ path: `$.activeExpedition.route.nodes[${index}]`, message: "Узел маршрута повреждён." });
            } else if (!["battle", "elite", "cache", "camp", "shrine", "boss"].includes(String(node.kind))) {
              issues.push({ path: `$.activeExpedition.route.nodes[${index}].kind`, message: "Неизвестный тип узла маршрута." });
            }
          });
        }
      }
    }
  }
  if (Array.isArray(value.shopOffers)) {
    value.shopOffers.forEach((offer, index) => {
      if (!isRecord(offer)) issues.push({ path: `$.shopOffers[${index}]`, message: "Предложение лавки повреждено." });
      else {
        validateItem(offer.item, `$.shopOffers[${index}].item`, issues);
        if (isRecord(offer.item) && typeof offer.item.id === "string") itemIds.push(offer.item.id);
      }
    });
  }
  const duplicateItemIds = itemIds.filter((id, index) => itemIds.indexOf(id) !== index);
  if (duplicateItemIds.length > 0) {
    issues.push({ path: "$.items", message: `Идентификаторы предметов должны быть уникальны: ${[...new Set(duplicateItemIds)].join(", ")}.` });
  }
  if (Array.isArray(value.enemies)) {
    const enemyIds = value.enemies.filter(isRecord).map((enemy) => enemy.id).filter((id): id is string => typeof id === "string");
    const duplicates = enemyIds.filter((id, index) => enemyIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      issues.push({ path: "$.enemies", message: `Идентификаторы бойцов должны быть уникальны: ${[...new Set(duplicates)].join(", ")}.` });
    }
    if (Array.isArray(value.eliteLeagueMemberIds)) {
      const knownFighters = new Set(["hero", ...enemyIds]);
      const eliteIds = value.eliteLeagueMemberIds;
      if (!eliteIds.every((id) => typeof id === "string" && knownFighters.has(id))) {
        issues.push({ path: "$.eliteLeagueMemberIds", message: "Элитная лига ссылается на неизвестного бойца." });
      }
      if (new Set(eliteIds).size !== eliteIds.length) {
        issues.push({ path: "$.eliteLeagueMemberIds", message: "В элитной лиге есть повторяющиеся бойцы." });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

export class InvalidWorldSaveError extends Error {
  public constructor(public readonly issues: WorldSaveValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n") || "Сохранение повреждено.");
    this.name = "InvalidWorldSaveError";
  }
}

export function assertRestorableWorldSave(value: unknown): asserts value is GameSave {
  const result = validateWorldSave(value);
  if (!result.valid) throw new InvalidWorldSaveError(result.issues);
}
