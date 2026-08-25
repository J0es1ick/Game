import { ERA_LAWS, LEGACY_BOONS } from "../src/catalogs/NewGamePlusCatalog";
import { WorldGame } from "../src/gameplay/WorldGame";
import {
  eraLawModifiers,
  epochDifficultyModifiers,
  improveMinimumRarity,
  newGamePlusStatus,
  normalizeLegacyState,
  prepareInheritedItem,
  rewardModifiers,
} from "../src/gameplay/NewGamePlus";
import { ARENAS } from "../src/catalogs/WorldCatalog";
import { GameSave, HeroClass, NewGamePlusOptions } from "../src/gameplay/WorldTypes";

function makeEligible(game: WorldGame): void {
  const last = ARENAS.length - 1;
  game.save.hero.highestArena = last;
  game.save.hero.arenaWins[last] = 1;
  game.save.hero.crownLeagueWins = 1;
  game.save.hero.legendDefenses = 1;
  game.save.eliteLeagueMemberIds = ["hero", ...game.save.eliteLeagueMemberIds.filter((id) => id !== "hero")].slice(0, 30);
  game.save.eliteRatings.hero = 4_000;
}

function transitionOptions(game: WorldGame, classId: HeroClass = game.save.hero.classId): NewGamePlusOptions {
  const status = game.newGamePlusStatus();
  return {
    name: "Наследник",
    classId,
    boonId: LEGACY_BOONS.find((boon) => boon.sealCost <= status.availableSeals)!.id,
    lawIds: ERA_LAWS.slice(0, status.lawLimit).map((law) => law.id),
    heirloomItemId: game.heirloomCandidates(classId)[0]?.id,
  };
}

describe("Новая летопись", () => {
  test("старое сохранение получает метапрогресс первой эпохи", () => {
    const current = WorldGame.create("Хронист", "Knight", 1_000).save;
    const legacySave = { ...current, version: 2, legacy: undefined, defeatedLegacyCycles: undefined } as unknown as GameSave;
    const restored = WorldGame.restore(legacySave);
    expect(restored.save.version).toBe(3);
    expect(restored.save.legacy).toEqual(normalizeLegacyState(undefined));
    expect(restored.save.defeatedLegacyCycles).toEqual([]);
  });

  test("переход закрыт до полного завершения эндгейма", () => {
    const game = WorldGame.create("Хронист", "Knight", 2_000);
    const initial = newGamePlusStatus(game.save);
    expect(initial.unlocked).toBe(false);
    expect(initial.requirements.some((requirement) => !requirement.met)).toBe(true);
    makeEligible(game);
    expect(game.newGamePlusStatus().unlocked).toBe(true);
  });

  test("новая эпоха сбрасывает мир и сохраняет архив с коллекцией", () => {
    const game = WorldGame.create("Хронист", "Knight", 3_000);
    makeEligible(game);
    game.save.hero.level = 30;
    game.save.hero.gold = 99_000;
    game.save.hero.appearance = { hairStyle: 2, faceStyle: 1 };
    game.save.hero.autoEquipBest = true;
    game.save.hero.factionReputation["free-company"] = 55;
    game.save.worldDay = 240;
    const oldInventoryIds = new Set(game.save.hero.inventory.map((item) => item.id));
    const oldDiscovered = [...game.save.discoveredItems];
    const options = transitionOptions(game);
    const sourceBefore = JSON.stringify(game.save);
    const next = game.beginNewChronicle(options, 4_000);

    expect(JSON.stringify(game.save)).toBe(sourceBefore);
    expect(next.save.legacy.cycle).toBe(2);
    expect(next.save.worldDay).toBe(1);
    expect(next.save.hero.level).toBe(1);
    expect(next.save.hero.experience).toBe(0);
    expect(next.save.hero.rating).toBe(1000);
    expect(next.save.hero.gold).toBe(180);
    expect(next.save.hero.crownLeagueWins).toBe(0);
    expect(next.save.eliteLeagueMemberIds).not.toContain("hero");
    expect(next.save.legacy.archives).toHaveLength(1);
    expect(next.save.legacy.archives[0].name).toBe("Хронист");
    expect(oldDiscovered.every((id) => next.save.discoveredItems.includes(id))).toBe(true);
    expect(next.save.hero.inventory.some((item) => oldInventoryIds.has(item.id))).toBe(false);
    expect(next.save.enemies.some((enemy) => enemy.id.startsWith("legacy-hero-"))).toBe(false);
    expect(next.save.hero.appearance).toEqual({ hairStyle: 2, faceStyle: 1 });
    expect(next.save.hero.autoEquipBest).toBe(true);
    expect(next.save.hero.factionReputation["free-company"]).toBe(11);

    const restored = WorldGame.restore(JSON.parse(JSON.stringify(next.save)) as GameSave);
    expect(restored.save.legacy).toEqual(next.save.legacy);
    expect(restored.save.legacy.inheritedItemId).toBe(next.save.legacy.inheritedItemId);
  });

  test("архив наружу отдаётся глубокой копией", () => {
    const game = WorldGame.create("Архивариус", "Knight", 4_100);
    makeEligible(game);
    const equipped = game.save.hero.inventory.find((item) => Object.values(game.save.hero.equipped).includes(item.id))!;
    equipped.allowedClasses = ["Knight"];
    equipped.affix = { name: "Закалка", description: "Проверка архива", stat: "defense", value: 7 };
    equipped.relicHistory = ["Первая запись"];
    const next = game.beginNewChronicle(transitionOptions(game), 4_200);

    const publicArchive = next.legacyArchives()[0];
    const publicItem = publicArchive.equipment.find((item) => item.templateId === equipped.templateId)!;
    if (publicItem.allowedClasses !== "all") publicItem.allowedClasses.push("Wizard");
    publicItem.stats.health = 99_999;
    publicItem.affix!.value = 99_999;
    publicItem.relicHistory!.push("Подменённая запись");

    const storedItem = next.save.legacy.archives[0].equipment.find((item) => item.templateId === equipped.templateId)!;
    expect(storedItem.allowedClasses).toEqual(["Knight"]);
    expect(storedItem.stats.health).not.toBe(99_999);
    expect(storedItem.affix?.value).toBe(7);
    expect(storedItem.relicHistory).toEqual(["Первая запись"]);
  });

  test("предмет-наследие пересоздаётся на первом уровне без поздних чисел", () => {
    const game = WorldGame.create("Кузнец", "Knight", 5_000);
    const source = game.save.hero.inventory[0];
    source.level = 35;
    source.rarity = "mythic";
    source.enhancement = 5;
    source.relicTier = 3;
    source.relicRenown = 900;
    source.stats = { attack: 999, health: 9999 };
    source.grantedSkillId = "execution";
    const inherited = prepareInheritedItem(source, "Knight", 1, "Кузнец");
    expect(inherited.id).not.toBe(source.id);
    expect(inherited.templateId).toBe(source.templateId);
    expect(inherited.level).toBe(1);
    expect(inherited.rarity).toBe("rare");
    expect(inherited.enhancement).toBe(0);
    expect(inherited.relicTier).toBe(0);
    expect(inherited.relicRenown).toBe(0);
    expect(inherited.stats.attack).not.toBe(999);
    expect(inherited.grantedSkillId).toBe("execution");
  });

  test("переход атомарно отклоняет неизвестный закон", () => {
    const game = WorldGame.create("Хронист", "Knight", 6_000);
    makeEligible(game);
    const before = JSON.stringify(game.save);
    const options = transitionOptions(game);
    options.lawIds = ["unknown-law" as never];
    expect(() => game.beginNewChronicle(options, 7_000)).toThrow();
    expect(JSON.stringify(game.save)).toBe(before);
  });

  test("сложность эпохи усиливает runtime без роста уровней", () => {
    expect(epochDifficultyModifiers(1)).toEqual({
      enemyHealthMultiplier: 1,
      enemyAttackMultiplier: 1,
      enemyDefenseMultiplier: 1,
      experienceMultiplier: 1,
    });
    expect(epochDifficultyModifiers(6)).toEqual({
      enemyHealthMultiplier: 1.4,
      enemyAttackMultiplier: 1.15,
      enemyDefenseMultiplier: 1.15,
      experienceMultiplier: 1.15,
    });
  });

  test("законы эпохи независимо и предсказуемо меняют бой, награды и редкость", () => {
    const lawIds = ERA_LAWS.map((law) => law.id);
    expect(eraLawModifiers(lawIds)).toEqual({
      allFighterDefenseFlat: 6,
      enemyDefenseFlat: 3,
      goldMultiplier: 0.7,
      dungeonRaritySteps: 1,
      arenaLethalityMultiplier: 1.25,
      arenaRewardMultiplier: 1.25,
      contractRewardMultiplier: 1.25,
      duelRewardMultiplier: 1.2,
      bossPowerMultiplier: 1.22,
      bossMinimumRarity: "mythic",
      bossBonusTemperingMarks: 1,
      eliteChallengeChanceMultiplier: 2,
    });
    expect(rewardModifiers(2, lawIds, "arena")).toMatchObject({
      goldMultiplier: 0.875,
      experienceMultiplier: 1.288,
    });
    expect(rewardModifiers(2, lawIds, "dungeon")).toMatchObject({
      goldMultiplier: 0.7,
      experienceMultiplier: 1.03,
      minimumRaritySteps: 1,
    });
    expect(rewardModifiers(2, lawIds, "boss")).toMatchObject({
      forcedMinimumRarity: "mythic",
      bonusTemperingMarks: 1,
    });
    expect(improveMinimumRarity("legendary", 1)).toBe("mythic");
    expect(improveMinimumRarity("mythic", 10)).toBe("mythic");
  });

  test("ветераны эпохи сохраняют класс и получают только совместимую экипировку", () => {
    const game = WorldGame.create("Летописец", "Knight", 8_000);
    makeEligible(game);
    const rival = game.save.enemies.find((enemy) => enemy.classId !== "Knight")!;
    game.save.hero.rivalries[rival.id] = {
      enemyId: rival.id,
      name: rival.name,
      classId: rival.classId,
      wins: 3,
      losses: 2,
      killed: false,
      lastMetDay: game.save.worldDay,
      meetings: 5,
    };

    const next = game.beginNewChronicle(transitionOptions(game), 8_100);
    const veteran = next.save.enemies.find((enemy) => enemy.carriedFromCycle === 1)!;
    expect(veteran.classId).toBe(rival.classId);
    expect(veteran.equipment.length).toBeGreaterThan(0);
    veteran.equipment.forEach((item) => {
      expect(item.allowedClasses === "all" || item.allowedClasses.includes(veteran.classId)).toBe(true);
      expect(veteran.equipped[item.slot]).toBe(item.id);
    });
  });

  test("исторический чемпион побеждается один раз и учитывает закон древних", () => {
    const game = WorldGame.create("Предок", "Knight", 9_000);
    makeEligible(game);
    const options = transitionOptions(game);
    options.lawIds = ["ancient-awakening"];
    const next = game.beginNewChronicle(options, 9_100);
    next.save.hero.level = 24;
    next.save.hero.highestArena = ARENAS.length - 2;
    const equippedId = Object.values(next.save.hero.equipped).find(Boolean)!;
    const equipped = next.save.hero.inventory.find((item) => item.id === equippedId)!;
    equipped.stats = { health: 1_000_000, attack: 1_000_000, defense: 1_000_000, speed: 1_000, crit: 60 };
    next.save.activeContract = {
      id: "legacy-boss-contract",
      factionId: "free-company",
      title: "Герой прошлого",
      description: "Победить особого противника.",
      objective: "boss",
      target: 2,
      progress: 0,
      rewardGold: 100,
      rewardExperience: 100,
      rewardReputation: 1,
      createdDay: next.save.worldDay,
      expiresDay: next.save.worldDay + 5,
    };

    const report = next.fightLegacyChampion(1);
    expect(report.heroWon).toBe(true);
    expect(report.rewards.temperingMarks).toBe(3);
    expect(next.save.defeatedLegacyCycles).toContain(1);
    expect(next.save.activeContract?.progress).toBe(1);
    expect(next.legacyChampionAvailability(1).unlocked).toBe(false);
    expect(() => next.fightLegacyChampion(1)).toThrow("уже побеждён");

    const restored = WorldGame.restore(JSON.parse(JSON.stringify(next.save)) as GameSave);
    expect(restored.save.defeatedLegacyCycles).toContain(1);
    expect(restored.legacyChampionAvailability(1).unlocked).toBe(false);
  });
});
