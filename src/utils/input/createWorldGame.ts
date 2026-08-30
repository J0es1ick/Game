import * as path from "node:path";

import {
  ARENAS,
  CLASS_DEFINITIONS,
  DUEL_BOSSES,
  DUEL_TIERS,
  DUNGEONS,
  EQUIPMENT_SETS,
  SLOT_LABELS,
} from "../../catalogs/WorldCatalog";
import { FACTIONS } from "../../catalogs/WorldExpansionCatalog";
import { ERA_LAWS, LEGACY_BOONS } from "../../catalogs/NewGamePlusCatalog";
import {
  BattleAction,
  MAX_ACTIVE_SKILLS,
  unlockedSkills,
} from "../../gameplay/combat/AdvancedBattle";
import { unlockedFactionPerks } from "../../gameplay/world/FactionSystem";
import { WorldGame } from "../../gameplay/core/WorldGame";
import {
  BattleReport,
  EquipmentItem,
  EquipmentSlot,
  ExpeditionStepReport,
  HeroClass,
  Stats,
} from "../../gameplay/core/WorldTypes";
import { readAnswer } from "../question/readAnswer";
import { ConsoleWorldSaveRepository } from "./ConsoleWorldSaveRepository";
import {
  compatibleWithHero,
  equippedItemFor,
  itemLine,
  numberedChoice,
  numberedChoices,
  saveSourceLabel,
  sortedInventory,
} from "./worldCliHelpers";

const classIds = Object.keys(CLASS_DEFINITIONS) as HeroClass[];
const equipmentSlots: EquipmentSlot[] = [
  "weapon",
  "offhand",
  "head",
  "chest",
  "hands",
  "feet",
];
const stats: Array<keyof Stats> = [
  "health",
  "attack",
  "defense",
  "speed",
  "crit",
];
const statLabels: Record<keyof Stats, string> = {
  health: "здоровье",
  attack: "атака",
  defense: "защита",
  speed: "скорость",
  crit: "крит. шанс",
};

export function defaultConsoleSavePath(cwd = process.cwd()): string {
  return path.resolve(cwd, ".game-save", "world-save.json");
}

function printStatus(game: WorldGame): void {
  const hero = game.save.hero;
  const eliteRank = game.heroEliteRank();
  const ordinaryRank = game.heroRank();
  console.log(
    `\nДень ${game.save.worldDay} · эпоха ${game.save.legacy.cycle} · ${hero.name} · ${CLASS_DEFINITIONS[hero.classId].name} · уровень ${hero.level}`,
  );
  console.log(
    `Рейтинг ${hero.rating} (${eliteRank ? `элита #${eliteRank}` : ordinaryRank ? `мир #${ordinaryRank}` : "вне первой сотни"}) · монеты ${hero.gold} · печати ${hero.temperingMarks}`,
  );
  console.log(
    `Победы ${hero.wins} · поражения ${hero.losses} · арена ${ARENAS[hero.highestArena]?.name ?? "—"}`,
  );
  if (game.save.activeContract) {
    const contract = game.save.activeContract;
    console.log(
      `Контракт: ${contract.title} · ${contract.progress}/${contract.target} · до дня ${contract.expiresDay}`,
    );
  }
}

function printBattle(title: string, won: boolean, opponent?: string): void {
  console.log(
    `${title}: ${won ? "победа" : "поражение"}${opponent ? ` против ${opponent}` : ""}.`,
  );
}

function printRewards(report: ExpeditionStepReport): void {
  if (!report.rewards) return;
  console.log(
    `Награды: ${report.rewards.experience} опыта · ${report.rewards.gold} монет${report.rewards.temperingMarks ? ` · ${report.rewards.temperingMarks} печатей` : ""}.`,
  );
  (
    report.rewards.items ?? (report.rewards.item ? [report.rewards.item] : [])
  ).forEach((item) => console.log(`  Добыча: ${itemLine(item)}`));
}

async function chooseNewHero(): Promise<WorldGame> {
  const enteredName = (await readAnswer("Имя главного героя: ")).trim();
  const name = enteredName.length >= 2 ? enteredName : "Странник";
  classIds.forEach((id, index) =>
    console.log(
      `${index + 1}. ${CLASS_DEFINITIONS[id].name} — ${CLASS_DEFINITIONS[id].epithet}: ${CLASS_DEFINITIONS[id].description}`,
    ),
  );
  const classId =
    numberedChoice(classIds, await readAnswer("Выберите класс (1–6): ")) ??
    "Knight";
  return WorldGame.create(name, classId);
}

async function chooseCampaign(
  repository: ConsoleWorldSaveRepository,
): Promise<WorldGame> {
  const loaded = repository.load();
  if (!loaded) {
    if (repository.exists())
      console.log("Файлы кампании повреждены. Будет начата новая летопись.");
    return chooseNewHero();
  }
  console.log(
    `Найдена кампания «${loaded.save.hero.name}», день ${loaded.save.worldDay} (${saveSourceLabel(loaded.source)}).`,
  );
  if (
    (await readAnswer("1. Продолжить   2. Начать новую кампанию: ")).trim() ===
    "2"
  )
    return chooseNewHero();
  const game = WorldGame.restore(loaded.save);
  const elapsed = game.simulateElapsed();
  if (elapsed > 0)
    console.log(`Пока игра была закрыта, мир прожил ${elapsed} дн.`);
  return game;
}

async function resolvePendingBattle(
  game: WorldGame,
  persist: () => void,
): Promise<void> {
  const pending = game.currentPendingBattle();
  if (!pending) return;
  console.log(`\nНезавершённый бой: ${pending.enemy.name}.`);
  const mode = await readAnswer(
    "1. Продолжить вручную   2. Рассчитать автоматически   3. Отменить до первого хода / сдаться: ",
  );
  if (mode.trim() === "3") {
    const result = game.abortPendingBattle();
    persist();
    console.log(
      result
        ? "Герой сдался: начатый бой засчитан как поражение."
        : "Бой отменён до первого хода без наград и последствий.",
    );
    return;
  }
  if (mode.trim() === "2") {
    const result = game.runPendingBattleAutomatically();
    persist();
    if (result && "kind" in result && result.kind === "duel")
      printBattle(
        result.title,
        Boolean(result.battle?.heroWon),
        result.battle?.enemyBefore.name,
      );
    if (result && "matches" in result)
      console.log(
        `${result.activity.name}: место ${result.heroPlacement}/${result.participantCount}; чемпион — ${result.championName}.`,
      );
    if (result && "winnerId" in result) {
      const battle = result as BattleReport;
      printBattle(
        battle.activity.name,
        battle.heroWon,
        battle.enemyBefore.name,
      );
    }
    if (result && "completed" in result) {
      const expedition = result as ExpeditionStepReport;
      console.log(expedition.message);
      printRewards(expedition);
    }
    return;
  }
  while (game.currentPendingBattle()) {
    while (
      game.currentPendingBattle() &&
      !game.currentPendingBattle()!.session.winnerId
    ) {
      const current = game.currentPendingBattle()!;
      let action: BattleAction | undefined;
      if (current.session.nextActorId === "hero") {
        const available = game
          .pendingBattleActions()
          .filter((option) => option.available);
        available.forEach((option, index) =>
          console.log(`${index + 1}. ${option.name}`),
        );
        const chosen =
          numberedChoice(available, await readAnswer("Приём: ")) ??
          available[0];
        if (chosen)
          action =
            chosen.kind === "basic"
              ? { type: "basic" }
              : { type: "skill", skillId: chosen.id };
      }
      const stepped = game.stepPendingBattle(action);
      persist();
      if (stepped.turn) console.log(`  ${stepped.turn.detail}`);
    }
    const final = game.finalizePendingBattle();
    persist();
    printBattle(
      final.battle.activity.name,
      final.battle.heroWon,
      final.battle.enemyBefore.name,
    );
    if (final.status === "next-battle" && final.pendingBattle)
      console.log(`Следующий бой сетки: ${final.pendingBattle.enemy.name}.`);
    if (
      final.status === "complete" &&
      final.result &&
      "matches" in final.result
    ) {
      console.log(
        `Итог: место ${final.result.heroPlacement}/${final.result.participantCount}; чемпион — ${final.result.championName}.`,
      );
    }
    if (
      final.status === "complete" &&
      final.result &&
      "completed" in final.result
    ) {
      console.log(final.result.message);
      printRewards(final.result);
    }
  }
}

async function playDuel(game: WorldGame, persist: () => void): Promise<void> {
  const mode = await readAnswer(
    "1. Постоянная дуэль   2. Уникальный противник: ",
  );
  if (mode.trim() === "2") {
    DUEL_BOSSES.forEach((boss, index) => {
      const state = game.availability(boss);
      console.log(
        `${index + 1}. ${boss.name} — ${state.unlocked ? boss.description : state.reason}`,
      );
    });
    const boss = numberedChoice(DUEL_BOSSES, await readAnswer("Противник: "));
    if (!boss) throw new Error("Такого противника нет.");
    if (game.save.hero.combatMode === "manual") {
      game.beginBoss(boss.id);
      persist();
      await resolvePendingBattle(game, persist);
      return;
    }
    const report = game.fightBoss(boss.id);
    printBattle(
      report.title,
      Boolean(report.battle?.heroWon),
      report.battle?.enemyBefore.name,
    );
    if (report.battle?.rewards.item)
      console.log(
        `Уникальная добыча: ${itemLine(report.battle.rewards.item)}.`,
      );
    return;
  }
  DUEL_TIERS.forEach((tier, index) => {
    const state = game.availability(tier);
    console.log(
      `${index + 1}. ${tier.name} — ${state.unlocked ? tier.description : state.reason}`,
    );
  });
  const tier = numberedChoice(DUEL_TIERS, await readAnswer("Ступень дуэли: "));
  if (!tier) throw new Error("Такой ступени нет.");
  if (game.save.hero.combatMode === "manual") {
    game.beginDuel(tier.id);
    persist();
    await resolvePendingBattle(game, persist);
    return;
  }
  const result = game.duel(tier.id);
  printBattle(
    result.title,
    Boolean(result.battle?.heroWon),
    result.battle?.enemyBefore.name,
  );
}

async function playDungeon(
  game: WorldGame,
  persist: () => void,
): Promise<void> {
  if (!game.save.activeExpedition) {
    DUNGEONS.forEach((dungeon, index) => {
      const state = game.availability(dungeon);
      console.log(
        `${index + 1}. ${dungeon.name} — ${state.unlocked ? state.reason : `закрыт: ${state.reason}`}`,
      );
    });
    const dungeon = numberedChoice(
      DUNGEONS,
      await readAnswer("Начать экспедицию №: "),
    );
    if (!dungeon) throw new Error("Такого данжа нет.");
    game.startExpedition(dungeon.id);
    persist();
  }
  while (game.save.activeExpedition) {
    const expedition = game.save.activeExpedition;
    const dungeon = DUNGEONS.find(
      (candidate) => candidate.id === expedition.dungeonId,
    )!;
    console.log(
      `\n${dungeon.name} · запас сил ${expedition.health}% · найдено ${expedition.accumulatedGold} монет · трофеи ${expedition.loot.length}`,
    );
    const shrineChoices = game.expeditionShrineChoices();
    if (shrineChoices.length > 0) {
      shrineChoices.forEach((choice, index) =>
        console.log(
          `${index + 1}. ${choice.name} — ${choice.benefit}; цена: ${choice.cost}`,
        ),
      );
      const choice = numberedChoice(
        shrineChoices,
        await readAnswer("Клятва: "),
      );
      if (!choice) {
        console.log("Такой клятвы нет.");
        continue;
      }
      const report = game.resolveExpeditionShrine(choice.id);
      persist();
      console.log(report.message);
      continue;
    }
    const nodes = game.reachableExpeditionNodes();
    nodes.forEach((node, index) =>
      console.log(
        `${index + 1}. ${node.title} [${node.kind}] — ${node.description} · опасность ${node.danger} · награда ×${node.rewardMultiplier}`,
      ),
    );
    console.log("0. Отступить и сохранить часть накопленного");
    const answer = await readAnswer("Следующий узел: ");
    if (answer.trim() === "0") {
      const report = game.retreatExpedition();
      persist();
      console.log(report.message);
      printRewards(report);
      return;
    }
    const node = numberedChoice(nodes, answer);
    if (!node) {
      console.log("Этот путь недоступен.");
      continue;
    }
    const started =
      game.save.hero.combatMode === "manual"
        ? game.beginExpeditionNode(node.id)
        : game.advanceExpeditionNode(node.id);
    persist();
    if ("version" in started) {
      await resolvePendingBattle(game, persist);
      continue;
    }
    const report = started;
    console.log(report.message);
    if (report.battle)
      printBattle(
        node.title,
        report.battle.heroWon,
        report.battle.enemyBefore.name,
      );
    printRewards(report);
  }
}

async function tournamentsMenu(
  game: WorldGame,
  persist: () => void,
): Promise<void> {
  ARENAS.forEach((arena, index) => {
    const state = game.availability(arena);
    const day = game.registeredTournamentDay(arena.id);
    console.log(
      `${index + 1}. ${arena.name} · ${arena.participants} бойцов · ${day ? `запись на день ${day}` : state.reason}`,
    );
  });
  const mode = await readAnswer(
    "1. Записаться   2. Начать сегодняшний турнир: ",
  );
  if (mode.trim() === "1") {
    const arena = numberedChoice(ARENAS, await readAnswer("Номер турнира: "));
    if (!arena) throw new Error("Такого турнира нет.");
    console.log(
      `Место закреплено на день ${game.registerTournament(arena.id)}.`,
    );
    return;
  }
  const today = ARENAS.find(
    (arena) => game.registeredTournamentDay(arena.id) === game.save.worldDay,
  );
  if (!today) throw new Error("Сегодня нет турнира, на который записан герой.");
  if (game.save.hero.combatMode === "manual") {
    game.beginTournament(today.id);
    persist();
    await resolvePendingBattle(game, persist);
    return;
  }
  const report = game.playTournament(today.id);
  console.log(
    `${today.name}: место ${report.heroPlacement} из ${report.participantCount}. Чемпион — ${report.championName}.`,
  );
}

function listInventory(game: WorldGame, slot?: EquipmentSlot): EquipmentItem[] {
  const equipped = new Set(Object.values(game.save.hero.equipped));
  const items = sortedInventory(game.save, slot);
  items.forEach((item, index) =>
    console.log(`${index + 1}. ${itemLine(item, equipped.has(item.id))}`),
  );
  return items;
}

async function shopMenu(game: WorldGame): Promise<void> {
  game.save.shopOffers.forEach((offer, index) =>
    console.log(
      `${index + 1}. ${offer.sold ? "[ПРОДАНО]" : ""} ${itemLine(offer.item)} · цена ${offer.item.price}`,
    ),
  );
  const index =
    Number.parseInt(await readAnswer("Купить предмет № (0 — назад): "), 10) - 1;
  if (index >= 0) console.log(`Куплено: ${game.buy(index).name}.`);
}

async function inventoryMenu(game: WorldGame): Promise<void> {
  console.log(
    "\n1. Показать всё   2. Надеть   3. Снять   4. Надеть лучшее   5. Автоэкипировка   6. Продать предмет   7. Продать неиспользуемое   8. Лавка",
  );
  const action = (await readAnswer("Действие: ")).trim();
  if (action === "1") {
    listInventory(game);
    return;
  }
  if (action === "2") {
    equipmentSlots.forEach((slot, index) =>
      console.log(`${index + 1}. ${SLOT_LABELS[slot]}`),
    );
    const slot = numberedChoice(equipmentSlots, await readAnswer("Слот: "));
    if (!slot) return;
    const candidates = sortedInventory(game.save, slot).filter((item) =>
      compatibleWithHero(item, game.save.hero.classId),
    );
    candidates.forEach((item, index) =>
      console.log(`${index + 1}. ${itemLine(item)}`),
    );
    const item = numberedChoice(candidates, await readAnswer("Предмет: "));
    if (item) {
      game.equip(item.id);
      console.log(`Надето: ${item.name}.`);
    }
    return;
  }
  if (action === "3") {
    const occupied = equipmentSlots.filter((slot) =>
      equippedItemFor(game.save, slot),
    );
    occupied.forEach((slot, index) =>
      console.log(
        `${index + 1}. ${SLOT_LABELS[slot]} — ${equippedItemFor(game.save, slot)!.name}`,
      ),
    );
    const slot = numberedChoice(occupied, await readAnswer("Снять слот: "));
    if (slot) game.unequip(slot);
    return;
  }
  if (action === "4") {
    const mode =
      (
        await readAnswer("1. Максимум силы   2. Лучший цельный комплект: ")
      ).trim() === "2"
        ? "set"
        : "power";
    console.log(`Надето предметов: ${game.equipBest(mode).length}.`);
    return;
  }
  if (action === "5") {
    game.setAutoEquipBest(!game.save.hero.autoEquipBest);
    console.log(
      `Автоматически надевать лучшее: ${game.save.hero.autoEquipBest ? "включено" : "выключено"}.`,
    );
    return;
  }
  if (action === "6") {
    const equipped = new Set(Object.values(game.save.hero.equipped));
    const items = sortedInventory(game.save).filter(
      (item) => !equipped.has(item.id) && game.canSell(item.id),
    );
    items.forEach((item, index) =>
      console.log(
        `${index + 1}. ${itemLine(item)} · продажа ${Math.max(1, Math.round(item.price * 0.45))}`,
      ),
    );
    const item = numberedChoice(items, await readAnswer("Продать №: "));
    if (item) console.log(`Получено ${game.sell(item.id)} монет.`);
    return;
  }
  if (action === "7") {
    if (
      (await readAnswer("Продать всё неиспользуемое? (да/нет): "))
        .trim()
        .toLowerCase() === "да"
    ) {
      const result = game.sellUnequipped();
      console.log(
        `Продано ${result.count} предметов за ${result.value} монет.`,
      );
    }
    return;
  }
  if (action === "8") await shopMenu(game);
}

async function forgeAndLootMenu(game: WorldGame): Promise<void> {
  console.log(
    "\n1. Выбрать цель добычи   2. Сбросить цель   3. Перековать свойство   4. Закалить предмет",
  );
  const action = (await readAnswer("Действие: ")).trim();
  if (action === "1") {
    const mode = await readAnswer("1. Целевой слот   2. Целевой комплект: ");
    if (mode.trim() === "1") {
      equipmentSlots.forEach((slot, index) =>
        console.log(`${index + 1}. ${SLOT_LABELS[slot]}`),
      );
      const slot = numberedChoice(equipmentSlots, await readAnswer("Слот: "));
      if (slot) game.setLootTarget({ slot });
    } else {
      const sets = EQUIPMENT_SETS.filter(
        (set) =>
          set.classes === "all" || set.classes.includes(game.save.hero.classId),
      );
      sets.forEach((set, index) =>
        console.log(`${index + 1}. ${set.name} — ${set.purpose}`),
      );
      const set = numberedChoice(sets, await readAnswer("Комплект: "));
      if (set) game.setLootTarget({ setId: set.id });
    }
    console.log("Целевая охота обновлена.");
    return;
  }
  if (action === "2") {
    game.setLootTarget();
    console.log("Целевая охота отключена.");
    return;
  }
  const items = listInventory(game);
  const item = numberedChoice(items, await readAnswer("Предмет: "));
  if (!item) return;
  if (action === "4") {
    const cost = game.upgradeCost(item.id);
    console.log(
      `Стоимость: ${cost} печатей. Улучшено: ${game.upgradeItem(item.id).name}.`,
    );
    return;
  }
  if (action === "3") {
    const existing = stats.filter((stat) => item.stats[stat] !== undefined);
    existing.forEach((stat, index) =>
      console.log(`${index + 1}. ${statLabels[stat]} (${item.stats[stat]})`),
    );
    const sourceStat = numberedChoice(
      existing,
      await readAnswer("Заменить свойство: "),
    );
    if (!sourceStat) return;
    const available = stats.filter(
      (stat) => stat === sourceStat || item.stats[stat] === undefined,
    );
    available.forEach((stat, index) =>
      console.log(
        `${index + 1}. ${statLabels[stat]}${stat === sourceStat ? " (перебросить значение)" : ""}`,
      ),
    );
    const targetStat = numberedChoice(
      available,
      await readAnswer("Новое свойство: "),
    );
    if (!targetStat) return;
    const result = game.reforgeItem(item.id, { sourceStat, targetStat });
    console.log(
      `${statLabels[result.sourceStat]} ${result.previousValue} → ${statLabels[result.targetStat]} ${result.nextValue}; сила ${result.powerDelta >= 0 ? "+" : ""}${result.powerDelta}.`,
    );
  }
}

async function storyAndFactionsMenu(game: WorldGame): Promise<void> {
  const event = game.pendingNarrativeEvent();
  if (event) {
    console.log(`\n${event.title}\n${event.description}`);
    event.choices.forEach((choice, index) =>
      console.log(`${index + 1}. ${choice.label} — ${choice.description}`),
    );
  }
  console.log("\nФракции:");
  FACTIONS.forEach((faction) => {
    const reputation = game.save.hero.factionReputation[faction.id] ?? 0;
    const perks =
      unlockedFactionPerks(faction.id, reputation)
        .map((perk) => perk.name)
        .join(", ") || "пока нет";
    console.log(
      `• ${faction.name}: ${reputation} · привилегии: ${perks}. ${faction.description}`,
    );
  });
  if (game.save.activeContract) {
    const contract = game.save.activeContract;
    console.log(
      `Активный контракт: ${contract.title} · ${contract.progress}/${contract.target} · подход ${contract.approach === "honor" ? "честь" : "выгода"}.`,
    );
  }
  console.log(
    "1. Повествовательный выбор   2. Принять контракт   3. Отказаться от контракта   0. Назад",
  );
  const action = (await readAnswer("Действие: ")).trim();
  if (action === "1") {
    if (!event) throw new Error("События, ожидающего решения, нет.");
    const choice = numberedChoice(event.choices, await readAnswer("Решение: "));
    if (choice)
      console.log(
        `${game.resolveNarrativeChoice(choice.id).choice.label}: решение записано.`,
      );
    return;
  }
  if (action === "2") {
    const availability = game.featureAvailability("contracts");
    if (!availability.unlocked) throw new Error(availability.reason);
    game.save.contractOffers.forEach((offer, index) => {
      const faction = FACTIONS.find(
        (candidate) => candidate.id === offer.factionId,
      );
      console.log(
        `${index + 1}. ${offer.title} · ${faction?.name} · ${offer.description} · цель ${offer.target} · ${offer.rewardGold} монет/${offer.rewardExperience} опыта/${offer.rewardReputation} репутации`,
      );
    });
    const offer = numberedChoice(
      game.save.contractOffers,
      await readAnswer("Контракт: "),
    );
    if (!offer) return;
    const approach =
      (await readAnswer("1. Ради чести   2. Ради выгоды: ")).trim() === "2"
        ? "profit"
        : "honor";
    game.acceptContract(offer.id, approach);
    return;
  }
  if (action === "3") game.abandonContract();
}

async function endgameMenu(
  game: WorldGame,
  persist: () => void,
): Promise<void> {
  console.log(`Лига короны: ${game.crownLeagueAvailability().reason}`);
  console.log(`Охота на легенд: ${game.legendHuntAvailability().reason}`);
  const challenge = game.pendingLegendChallenge();
  if (challenge)
    console.log(
      `Вызов титулу: ${challenge.name}. Его нельзя просто пропустить.`,
    );
  console.log(
    "1. Записаться в Лигу   2. Начать Лигу сегодня   3. Охота на легенду   4. Защитить титул   5. Автоответ на вызовы",
  );
  const action = (await readAnswer("Действие: ")).trim();
  if (action === "1")
    console.log(`Запись подтверждена на день ${game.registerCrownLeague()}.`);
  if (action === "2") {
    if (game.save.hero.combatMode === "manual") {
      game.beginCrownLeague();
      persist();
      await resolvePendingBattle(game, persist);
    } else {
      const report = game.playCrownLeague();
      console.log(
        `Чемпион — ${report.championName}; место героя ${report.heroPlacement}.`,
      );
    }
  }
  if (action === "3") {
    if (game.save.hero.combatMode === "manual") {
      game.beginLegendHunt();
      persist();
      await resolvePendingBattle(game, persist);
    } else {
      const report = game.huntLegend();
      printBattle(
        report.activity.name,
        report.heroWon,
        report.enemyBefore.name,
      );
    }
  }
  if (action === "4") {
    if (game.save.hero.combatMode === "manual") {
      game.beginLegendDefense(true);
      persist();
      await resolvePendingBattle(game, persist);
    } else {
      const report = game.defendLegendTitle();
      printBattle("Защита титула", report.heroWon, report.enemyBefore.name);
    }
  }
  if (action === "5") {
    game.setAutoResolveLegendChallenges(
      !game.save.hero.autoResolveLegendChallenges,
    );
    console.log(
      `Автоответ: ${game.save.hero.autoResolveLegendChallenges ? "включён" : "выключен"}.`,
    );
  }
}

async function tacticsAndClassMenu(game: WorldGame): Promise<void> {
  const hero = game.save.hero;
  console.log(
    `\nРежим боя: ${hero.combatMode === "manual" ? "ручной" : "автоматический"}. Подбор навыков: ${hero.autoSelectSkills ? "автоматический" : "ручной"}.`,
  );
  console.log(
    "1. Переключить режим боя   2. Переключить автоподбор навыков   3. Собрать набор навыков   4. Сменить класс",
  );
  const action = (await readAnswer("Действие: ")).trim();
  if (action === "1") {
    const mode = hero.combatMode === "auto" ? "manual" : "auto";
    game.setCombatMode(mode);
    console.log(
      `Режим боя: ${mode === "manual" ? "ручной" : "автоматический"}.`,
    );
    return;
  }
  if (action === "2") {
    game.setAutoSelectSkills(!hero.autoSelectSkills);
    console.log(
      `Автоматически выбирать лучшие навыки: ${hero.autoSelectSkills ? "включено" : "выключено"}.`,
    );
    return;
  }
  if (action === "3") {
    const equippedIds = new Set(Object.values(hero.equipped));
    const available = unlockedSkills(
      hero.classId,
      hero.level,
      hero.inventory.filter((item) => equippedIds.has(item.id)),
      hero.legacySkillId ? [hero.legacySkillId] : [],
    );
    available.forEach((skill, index) => {
      const selected = hero.selectedSkillIds.includes(skill.id)
        ? " [В СБОРКЕ]"
        : "";
      console.log(
        `${index + 1}. ${skill.name}${selected} — ${skill.description} · перезарядка ${skill.cooldown} х.`,
      );
    });
    const chosen = numberedChoices(
      available,
      await readAnswer(
        `Выберите до ${MAX_ACTIVE_SKILLS} номеров через пробел: `,
      ),
      MAX_ACTIVE_SKILLS,
    );
    if (chosen.length === 0)
      throw new Error("Нужно выбрать хотя бы один доступный навык.");
    game.setAutoSelectSkills(false);
    const selected = game.setSelectedSkills(chosen.map((skill) => skill.id));
    console.log(
      `Активная сборка: ${selected.map((skill) => skill.name).join(" · ")}.`,
    );
    return;
  }
  if (action === "4") {
    const availability = game.classChangeAvailability();
    if (!availability.unlocked) throw new Error(availability.reason);
    const classes = classIds.filter((classId) => classId !== hero.classId);
    classes.forEach((classId, index) =>
      console.log(
        `${index + 1}. ${CLASS_DEFINITIONS[classId].name} — ${CLASS_DEFINITIONS[classId].description}`,
      ),
    );
    const classId = numberedChoice(classes, await readAnswer("Новый класс: "));
    if (!classId) throw new Error("Такого класса нет.");
    if (
      (await readAnswer(`${availability.reason} Подтвердить смену? (да/нет): `))
        .trim()
        .toLowerCase() !== "да"
    )
      return;
    const equipped = game.changeHeroClass(classId);
    console.log(
      `Новый класс: ${CLASS_DEFINITIONS[classId].name}. Подходящих предметов надето: ${equipped.length}.`,
    );
  }
}

async function legacyBattleMenu(
  game: WorldGame,
  persist: () => void,
): Promise<void> {
  const archives = game.legacyArchives();
  if (archives.length === 0)
    throw new Error("В архиве ещё нет завершённых эпох.");
  archives.forEach((archive, index) =>
    console.log(
      `${index + 1}. Эпоха ${archive.cycle}: ${archive.name}, ${CLASS_DEFINITIONS[archive.classId].name}, ур. ${archive.level} — ${game.legacyChampionAvailability(archive.cycle).reason}`,
    ),
  );
  const archive = numberedChoice(
    archives,
    await readAnswer("Герой прошлой эпохи: "),
  );
  if (!archive) throw new Error("Такой записи в архиве нет.");
  if (game.save.hero.combatMode === "manual") {
    game.beginLegacyChampion(archive.cycle);
    persist();
    await resolvePendingBattle(game, persist);
  } else {
    const report = game.fightLegacyChampion(archive.cycle);
    printBattle(report.activity.name, report.heroWon, report.enemyBefore.name);
  }
}

async function newGamePlusMenu(
  game: WorldGame,
  persist: () => void,
): Promise<WorldGame> {
  printNewGamePlus(game);
  console.log(
    "1. Начать новую эпоху   2. Сразиться с героем прошлой эпохи   0. Назад",
  );
  const action = (await readAnswer("Действие: ")).trim();
  if (action === "2") {
    await legacyBattleMenu(game, persist);
    return game;
  }
  if (action !== "1") return game;
  const status = game.newGamePlusStatus();
  if (!status.unlocked) throw new Error(status.reason);

  const boons = LEGACY_BOONS.filter(
    (boon) => boon.sealCost <= status.availableSeals,
  );
  boons.forEach((boon, index) =>
    console.log(
      `${index + 1}. ${boon.name} (${boon.sealCost} печ.) — ${boon.effect}`,
    ),
  );
  const boon = numberedChoice(boons, await readAnswer("Наследие эпохи: "));
  if (!boon) throw new Error("Такого наследия нет.");

  const enteredName = (await readAnswer("Имя наследника: ")).trim();
  if (enteredName.length < 2)
    throw new Error("Имя наследника должно состоять минимум из двух символов.");
  classIds.forEach((classId, index) =>
    console.log(
      `${index + 1}. ${CLASS_DEFINITIONS[classId].name} — ${CLASS_DEFINITIONS[classId].description}`,
    ),
  );
  const classId = numberedChoice(
    classIds,
    await readAnswer("Класс наследника: "),
  );
  if (!classId) throw new Error("Такого класса нет.");

  ERA_LAWS.forEach((law, index) =>
    console.log(`${index + 1}. ${law.name} — ${law.effect}`),
  );
  const laws = numberedChoices(
    ERA_LAWS,
    await readAnswer(
      `Выберите ровно ${status.lawLimit} законов через пробел: `,
    ),
    status.lawLimit,
  );
  if (laws.length !== status.lawLimit)
    throw new Error(`Нужно выбрать законов: ${status.lawLimit}.`);

  const heirlooms = game.heirloomCandidates(classId);
  heirlooms.forEach((item, index) =>
    console.log(`${index + 1}. ${itemLine(item)}`),
  );
  const heirloomAnswer = await readAnswer(
    "Предмет-наследие (0 — без предмета): ",
  );
  const heirloom =
    heirloomAnswer.trim() === "0"
      ? undefined
      : numberedChoice(heirlooms, heirloomAnswer);
  if (heirloomAnswer.trim() !== "0" && !heirloom)
    throw new Error("Такого предмета-наследия нет.");
  if (
    (
      await readAnswer(
        `Завершить текущую эпоху и начать эпоху ${status.targetCycle}? (да/нет): `,
      )
    )
      .trim()
      .toLowerCase() !== "да"
  )
    return game;

  const next = game.beginNewChronicle({
    name: enteredName,
    classId,
    boonId: boon.id,
    lawIds: laws.map((law) => law.id),
    heirloomItemId: heirloom?.id,
  });
  console.log(
    `Началась эпоха ${next.save.legacy.cycle}. Архив героя «${game.save.hero.name}» сохранён.`,
  );
  return next;
}

async function saveTransferMenu(
  game: WorldGame,
  repository: ConsoleWorldSaveRepository,
): Promise<WorldGame> {
  console.log(
    "1. Экспортировать кампанию   2. Импортировать кампанию   0. Назад",
  );
  const action = (await readAnswer("Действие: ")).trim();
  const defaultPath = path.resolve(
    path.dirname(repository.primaryPath),
    "world-save-export.json",
  );
  if (action === "1") {
    const entered = (
      await readAnswer(`Файл экспорта (Enter — ${defaultPath}): `)
    ).trim();
    console.log(
      `Кампания экспортирована: ${repository.exportTo(entered || defaultPath)}`,
    );
    return game;
  }
  if (action === "2") {
    const entered = (await readAnswer("Путь к файлу импорта: ")).trim();
    if (!entered) throw new Error("Путь к файлу импорта не указан.");
    if (
      (
        await readAnswer(
          "Текущая кампания будет заменена. Продолжить? (да/нет): ",
        )
      )
        .trim()
        .toLowerCase() !== "да"
    )
      return game;
    const imported = WorldGame.restore(repository.importFrom(entered));
    console.log(
      `Загружена кампания «${imported.save.hero.name}», день ${imported.save.worldDay}.`,
    );
    return imported;
  }
  return game;
}

function printNewGamePlus(game: WorldGame): void {
  const status = game.newGamePlusStatus();
  console.log(
    `\nНовая летопись · эпоха ${status.targetCycle} · ${status.reason}`,
  );
  status.requirements.forEach((requirement) =>
    console.log(`${requirement.met ? "[✓]" : "[ ]"} ${requirement.label}`),
  );
  console.log(
    `Печатей: +${status.sealsAwarded}; доступно ${status.availableSeals}; законов эпохи ${status.lawLimit}.`,
  );
  const challenge = game.currentEraChallenge();
  if (challenge) {
    console.log(`Испытание: ${challenge.name}`);
    game
      .eraObjectiveProgress()
      .forEach((progress) =>
        console.log(
          `  ${progress.completed ? "[✓]" : "[ ]"} ${progress.objective.name}: ${progress.current}/${progress.target} · ${progress.objective.description}`,
        ),
      );
  }
  game
    .legacyArchives()
    .forEach((archive) =>
      console.log(
        `Архив эпохи ${archive.cycle}: ${archive.name}, ур. ${archive.level}, рейтинг ${archive.rating}.`,
      ),
    );
}

function printLeaderboards(game: WorldGame): void {
  console.log("\nПервая сотня (первые 20):");
  game
    .leaderboard()
    .slice(0, 20)
    .forEach((entry, index) =>
      console.log(
        `${index + 1}. ${entry.name}${entry.isHero ? " [ВЫ]" : ""} · ${CLASS_DEFINITIONS[entry.classId].name} · ур. ${entry.level} · рейтинг ${entry.rating}`,
      ),
    );
  console.log("\nЭлита:");
  game
    .eliteLeaderboard()
    .forEach((entry, index) =>
      console.log(
        `${index + 1}. ${entry.name}${entry.isHero ? " [ВЫ]" : ""} · ${game.legendTitle(index + 1) ?? "элита"} · ${entry.rating}`,
      ),
    );
}

export async function createWorldGame(
  savePath = defaultConsoleSavePath(),
): Promise<void> {
  console.log("\nЖИВОЙ МИР — постоянная RPG-кампания\n");
  const repository = new ConsoleWorldSaveRepository(savePath);
  let game = await chooseCampaign(repository);
  const persist = () => repository.save(game.save);
  persist();
  let running = true;
  while (running) {
    if (game.currentPendingBattle()) {
      await resolvePendingBattle(game, persist);
      continue;
    }
    printStatus(game);
    console.log(
      "\n1. Тренировка   2. Дуэли и боссы   3. Маршрут данжа   4. Турниры   5. Инвентарь",
    );
    console.log(
      "6. Кузня и целевая добыча   7. История, фракции и контракты   8. Лига короны и легенды",
    );
    console.log(
      "9. Рейтинги   10. Новая игра+   11. События мира   12. Тактика, навыки и класс   13. Экспорт/импорт   0. Сохранить и выйти",
    );
    const action = (await readAnswer("Действие: ")).trim();
    try {
      if (action === "1") {
        const result = game.train();
        console.log(`${result.title}: +${result.experience} опыта.`);
      } else if (action === "2") await playDuel(game, persist);
      else if (action === "3") await playDungeon(game, persist);
      else if (action === "4") await tournamentsMenu(game, persist);
      else if (action === "5") await inventoryMenu(game);
      else if (action === "6") await forgeAndLootMenu(game);
      else if (action === "7") await storyAndFactionsMenu(game);
      else if (action === "8") await endgameMenu(game, persist);
      else if (action === "9") printLeaderboards(game);
      else if (action === "10") game = await newGamePlusMenu(game, persist);
      else if (action === "11")
        game.save.events
          .slice(0, 30)
          .forEach((event) =>
            console.log(`День ${event.day}: ${event.message}`),
          );
      else if (action === "12") await tacticsAndClassMenu(game);
      else if (action === "13") game = await saveTransferMenu(game, repository);
      else if (action === "0") running = false;
      else console.log("Неизвестное действие.");
    } catch (error) {
      console.log(`Ошибка: ${(error as Error).message}`);
    } finally {
      persist();
    }
  }
  console.log(`Кампания сохранена: ${repository.primaryPath}`);
}
