import { ERA_LAWS, LEGACY_BOONS } from "../src/catalogs/NewGamePlusCatalog";
import { WorldGame } from "../src/gameplay/WorldGame";
import {
  buildLegacyArchive,
  describeLegacyArchiveInfluence,
  determineLegacyWorldRole,
  eraLawModifiers,
  epochFinalGoalProfile,
  epochFinalGoalProgress,
  inheritArchiveStyleMemory,
  epochDifficultyModifiers,
  improveMinimumRarity,
  newGamePlusStatus,
  normalizeLegacyState,
  prepareInheritedItem,
  rewardModifiers,
} from "../src/gameplay/NewGamePlus";
import { ARENAS } from "../src/catalogs/WorldCatalog";
import { GameSave, HeroClass, NewGamePlusOptions } from "../src/gameplay/WorldTypes";
import { SeededRandom } from "../src/gameplay/RandomSource";
import { createWorldRelicRecord } from "../src/gameplay/LivingWorld";
import { heroLoadoutSignature, readEnemyStyleMemory } from "../src/gameplay/EnemyMemory";

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
    expect(next.save.hero.factionReputation["free-company"]).toBeGreaterThanOrEqual(11);

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

  test("посмертная роль героя определяется его реальной карьерой", () => {
    const legend = WorldGame.create("Король", "Knight", 4_210);
    legend.save.eliteLeagueMemberIds = ["hero"];
    legend.save.hero.crownLeagueWins = 5;
    legend.save.hero.legendDefenses = 5;
    legend.save.hero.rating = 5_000;
    expect(determineLegacyWorldRole(legend.save).role).toBe("legend");

    const founder = WorldGame.create("Знаменосец", "Knight", 4_220);
    founder.save.eliteLeagueMemberIds = [];
    founder.save.hero.factionReputation = { wardens: 100, "free-company": 0, "red-ledger": 0 };
    const founderRole = determineLegacyWorldRole(founder.save);
    expect(founderRole.role).toBe("faction-founder");
    expect(founderRole.factionId).toBe("wardens");

    const boss = WorldGame.create("Палач", "Swordsman", 4_230);
    boss.save.eliteLeagueMemberIds = [];
    boss.save.hero.kills = 50;
    boss.save.hero.bossWins = 10;
    expect(determineLegacyWorldRole(boss.save).role).toBe("boss");

    const mentor = WorldGame.create("Учитель", "Monk", 4_240);
    mentor.save.eliteLeagueMemberIds = [];
    mentor.save.hero.factionReputation = { wardens: 0, "free-company": 0, "red-ledger": 0 };
    mentor.save.enemies.slice(0, 5).forEach((enemy, index) => {
      mentor.save.hero.rivalries[enemy.id] = {
        enemyId: enemy.id,
        name: enemy.name,
        classId: enemy.classId,
        wins: 10,
        losses: 10,
        killed: false,
        lastMetDay: index + 1,
        meetings: 20,
        intensity: 4,
      };
    });
    const mentorRole = determineLegacyWorldRole(mentor.save);
    expect(mentorRole.role).toBe("mentor");
    expect(mentorRole.schoolName).toContain("Учитель");
    expect(mentorRole.rememberedByIds).toHaveLength(5);
  });

  test("архив сохраняет роль, свидетелей и безопасно восстанавливает старые записи", () => {
    const game = WorldGame.create("Старый мастер", "Archer", 4_250);
    game.save.eliteLeagueMemberIds = [];
    const enemy = game.save.enemies[0];
    game.save.hero.rivalries[enemy.id] = {
      enemyId: enemy.id,
      name: enemy.name,
      classId: enemy.classId,
      wins: 2,
      losses: 3,
      killed: false,
      lastMetDay: 10,
      meetings: 5,
    };
    const archive = buildLegacyArchive(game.save, 123);
    expect(archive.worldRole).toBeDefined();
    expect(archive.rememberedByIds).toContain(enemy.id);

    const oldArchive = { ...archive } as Partial<typeof archive>;
    delete oldArchive.worldRole;
    delete oldArchive.schoolName;
    delete oldArchive.factionId;
    delete oldArchive.rememberedByIds;
    const restored = normalizeLegacyState({
      ...normalizeLegacyState(undefined),
      archives: [oldArchive as typeof archive],
    });
    expect(restored.archives[0].worldRole).toBeDefined();
    expect(restored.archives[0].rememberedByIds).toEqual([]);
  });

  test("каждая роль архива даёт конкретное влияние на следующую эпоху", () => {
    const game = WorldGame.create("Предшественник", "Wizard", 4_260);
    const source = buildLegacyArchive(game.save, 456);
    const mentor = describeLegacyArchiveInfluence({ ...source, worldRole: "mentor", schoolName: "Школа молний" });
    const legend = describeLegacyArchiveInfluence({ ...source, worldRole: "legend" });
    const boss = describeLegacyArchiveInfluence({ ...source, worldRole: "boss" });
    const founder = describeLegacyArchiveInfluence({ ...source, worldRole: "faction-founder", factionId: "free-company" });

    expect(mentor.mentor?.schoolName).toBe("Школа молний");
    expect(legend.opponent?.kind).toBe("legendary-rival");
    expect(boss.opponent?.kind).toBe("legacy-boss");
    expect(boss.opponent!.powerMultiplier).toBeGreaterThan(legend.opponent!.powerMultiplier);
    expect(founder.factionTradition?.factionId).toBe("free-company");
    expect(founder.factionTradition!.contractRewardMultiplier).toBeGreaterThan(1);
  });

  test("роль прошлого героя действительно изменяет мир новой эпохи", () => {
    const legendGame = WorldGame.create("Первая корона", "Knight", 4_265);
    makeEligible(legendGame);
    legendGame.save.hero.crownLeagueWins = 6;
    legendGame.save.hero.legendDefenses = 6;
    const legendWorld = legendGame.beginNewChronicle(transitionOptions(legendGame), 4_266);
    const legendArchive = legendWorld.save.legacy.archives[0];
    const legendaryRival = legendWorld.save.enemies.find((enemy) => enemy.id === `legacy-rival-${legendArchive.cycle}`);
    expect(legendArchive.worldRole).toBe("legend");
    expect(legendaryRival?.carriedFromCycle).toBe(legendArchive.cycle);
    expect(legendWorld.save.npcLife?.profiles[legendaryRival!.id].career).toBe("legend");

    const mentorGame = WorldGame.create("Старый учитель", "Monk", 4_267);
    makeEligible(mentorGame);
    mentorGame.save.enemies.slice(0, 6).forEach((enemy, index) => {
      mentorGame.save.hero.rivalries[enemy.id] = {
        enemyId: enemy.id,
        name: enemy.name,
        classId: enemy.classId,
        wins: 100,
        losses: 100,
        killed: false,
        lastMetDay: index + 1,
        meetings: 200,
        intensity: 5,
      };
    });
    const mentorWorld = mentorGame.beginNewChronicle(transitionOptions(mentorGame), 4_268);
    const archiveMentor = mentorWorld.save.legacy.archives[0];
    const school = mentorWorld.save.mentors?.find((mentor) => mentor.id === `legacy-mentor-${archiveMentor.cycle}`);
    expect(archiveMentor.worldRole).toBe("mentor");
    expect(school?.role).toBe("mentor");
    expect(school?.studentIds).toHaveLength(3);
    expect(mentorWorld.save.npcLife?.dynasties.some((dynasty) => dynasty.id === school?.dynastyId)).toBe(true);
    expect(mentorWorld.legacyChampionAvailability(archiveMentor.cycle).reason).toContain("наставником");

    const founderGame = WorldGame.create("Основатель", "Archer", 4_269);
    makeEligible(founderGame);
    founderGame.save.hero.factionReputation = { wardens: 1_000, "free-company": 0, "red-ledger": 0 };
    const founderWorld = founderGame.beginNewChronicle(transitionOptions(founderGame), 4_270);
    const archiveFounder = founderWorld.save.legacy.archives[0];
    const tradition = founderWorld.save.mentors?.find((mentor) => mentor.role === "faction-founder");
    expect(archiveFounder.worldRole).toBe("faction-founder");
    expect(tradition?.factionId).toBe("wardens");
    expect(founderWorld.save.hero.factionReputation.wardens).toBeGreaterThanOrEqual(12);
    expect(founderWorld.save.npcLife?.dynasties.some((dynasty) => dynasty.id === tradition?.dynastyId)).toBe(true);

    const bossGame = WorldGame.create("Палач эпохи", "Swordsman", 4_271);
    makeEligible(bossGame);
    bossGame.save.hero.kills = 100;
    bossGame.save.hero.bossWins = 20;
    const bossWorld = bossGame.beginNewChronicle(transitionOptions(bossGame), 4_272);
    const archiveBoss = bossWorld.save.legacy.archives[0];
    bossWorld.save.hero.level = 30;
    bossWorld.save.hero.highestArena = ARENAS.length - 1;
    const pendingBoss = bossWorld.beginLegacyChampion(archiveBoss.cycle);
    expect(archiveBoss.worldRole).toBe("boss");
    expect(pendingBoss.enemy.id).toBe(`legacy-boss-${archiveBoss.cycle}`);
    expect(pendingBoss.enemy.title).toContain("босс эпохи");
  });

  test("закон и наследие формируют разный финал новой эпохи", () => {
    const game = WorldGame.create("Законодатель", "Knight", 4_270);
    const archive = { ...buildLegacyArchive(game.save), worldRole: "mentor" as const };
    const steel = epochFinalGoalProfile(2, ["age-of-steel"], archive);
    const hunger = epochFinalGoalProfile(2, ["hungry-lands"], archive);
    const crown = epochFinalGoalProfile(2, ["crown-discord"], { ...archive, worldRole: "legend" });

    expect(steel.name).toBe("Превзойти старую школу");
    expect(steel.supportingObjectiveIds).toContain("living-arsenal");
    expect(hunger.supportingObjectiveIds).toContain("underworld-map");
    expect(crown.name).toBe("Свергнуть память Короны");
    expect(crown.supportingObjectiveIds).toContain("unbroken-road");
    expect(new Set([steel.id, hunger.id, crown.id]).size).toBe(3);
  });

  test("финальная цель второй эпохи действительно блокирует следующую летопись", () => {
    const game = WorldGame.create("Хронист", "Knight", 4_280);
    const archive = { ...buildLegacyArchive(game.save), worldRole: "legend" as const };
    game.save.legacy.cycle = 2;
    game.save.legacy.archives = [archive];
    game.save.legacy.activeLawIds = ["hungry-lands"];
    game.save.eraChallengeProgress.cycle = 2;
    makeEligible(game);
    expect(game.newGamePlusStatus().unlocked).toBe(false);
    const goal = epochFinalGoalProgress(game.save)!;
    expect(goal.objectives.map((progress) => progress.objective.id)).toContain("underworld-map");
    goal.objectives.forEach((progress) => progress.objective.requirements.forEach((requirement) => {
      game.save.eraChallengeProgress.metrics[requirement.metric] = requirement.target;
    }));
    expect(epochFinalGoalProgress(game.save)!.completed).toBe(false);
    expect(game.newGamePlusStatus().requirements.find((requirement) => requirement.id === "epoch-goal-predecessor")?.met).toBe(false);
    game.save.defeatedLegacyCycles.push(archive.cycle);
    expect(epochFinalGoalProgress(game.save)!.completed).toBe(true);
    expect(game.newGamePlusStatus().unlocked).toBe(true);
  });

  test("старые счётчики другой эпохи не завершают новую цель", () => {
    const game = WorldGame.create("Наследник", "Knight", 4_281);
    game.save.legacy.cycle = 3;
    game.save.eraChallengeProgress.cycle = 2;
    game.save.eraChallengeProgress.metrics = { arenaChampionships: 6, uniqueDungeonsCompleted: 5 };
    expect(epochFinalGoalProgress(game.save)!.completed).toBe(false);
    game.save.legacy.cycle = 1;
    expect(epochFinalGoalProgress(game.save)).toBeUndefined();
  });

  test("архив переносит ослабленную память стиля без ссылок на старую эпоху", () => {
    const game = WorldGame.create("Мастер", "Knight", 4_283);
    const archive = buildLegacyArchive(game.save);
    const original = JSON.stringify(archive.heroMemory);
    const memory = inheritArchiveStyleMemory(archive, 1);
    expect(memory.familiarity).toBe(45);
    expect(memory.familiarity).toBeLessThan(archive.heroMemory!.familiarity);
    expect(memory.lastEncounterDay).toBe(1);
    const signature = archive.heroMemory!.recentSignatures[0];
    const same = readEnemyStyleMemory(memory, signature);
    const differentHero = WorldGame.create("Новый путь", "Wizard", 4_284).save.hero;
    differentHero.activeTacticalProfileId = "defensive";
    const changed = readEnemyStyleMemory(memory, heroLoadoutSignature(differentHero, ["fireball"], 1));
    expect(same.strength).toBeGreaterThan(0);
    expect(same.similarity).toBeGreaterThan(changed.similarity);
    memory.recentSignatures[0].skillIds.push("changed");
    expect(JSON.stringify(archive.heroMemory)).toBe(original);
    const oldArchive = { ...archive, heroMemory: undefined };
    expect(inheritArchiveStyleMemory(oldArchive).familiarity).toBe(0);
  });

  test.each(ERA_LAWS.map((law) => law.id))("цель закона %s выполнима для всех ролей архива", (lawId) => {
    const game = WorldGame.create("Наследник", "Knight", 4_282);
    const archive = buildLegacyArchive(game.save);
    game.save.legacy.cycle = 2;
    game.save.legacy.activeLawIds = [lawId];
    game.save.eraChallengeProgress.cycle = 2;
    makeEligible(game);
    for (const worldRole of ["mentor", "boss", "legend", "faction-founder"] as const) {
      game.save.legacy.archives = [{ ...archive, worldRole, factionId: "wardens" }];
      game.save.eraChallengeProgress.metrics = {};
      game.save.defeatedLegacyCycles = [];
      const goal = epochFinalGoalProgress(game.save)!;
      expect(goal.completed).toBe(false);
      expect(goal.objectives.length).toBeGreaterThan(0);
      goal.objectives.forEach((progress) => progress.objective.requirements.forEach((requirement) => {
        game.save.eraChallengeProgress.metrics[requirement.metric] = requirement.target;
      }));
      if (worldRole === "boss" || worldRole === "legend") {
        expect(game.newGamePlusStatus().unlocked).toBe(false);
        game.save.defeatedLegacyCycles.push(archive.cycle);
      }
      expect(game.newGamePlusStatus().unlocked).toBe(true);
    }
  });

  test("мировая реликвия и школа наставника переживают смену эпохи", () => {
    const game = WorldGame.create("Хранитель реликвии", "Knight", 4_300);
    makeEligible(game);
    const source = game.heirloomCandidates()[0]!;
    const relic = createWorldRelicRecord("world-relic-era", source, "hero", game.save.hero.name, game.save.worldDay);
    game.save.worldRelics = [relic];
    game.save.mentors = [{
      id: "mentor-era",
      fighterId: game.save.enemies[0].id,
      name: game.save.enemies[0].name,
      classId: game.save.enemies[0].classId,
      factionId: game.save.enemies[0].factionId!,
      goal: "champion",
      level: 24,
      rating: 2_400,
      retiredDay: 80,
      studentIds: [game.save.enemies[1].id],
      legacy: "Основал школу после побед на арене.",
    }];
    const options = transitionOptions(game);
    options.heirloomItemId = source.id;

    const next = game.beginNewChronicle(options, 4_400);
    const inherited = next.save.hero.inventory.find((item) => item.worldRelicId === relic.id)!;
    const carriedRelic = next.save.worldRelics!.find((record) => record.id === relic.id)!;

    expect(inherited).toBeDefined();
    expect(carriedRelic.currentOwnerId).toBe("hero");
    expect(carriedRelic.currentOwnerName).toBe("Наследник");
    expect(carriedRelic.history[carriedRelic.history.length - 1]).toContain("принял реликвию");
    expect(next.save.mentors![0].studentIds).toEqual([]);
    expect(next.save.mentors![0].legacy).toContain("пережила смену эпохи");
  });

  test.each(["mentor", "faction-founder"] as const)("школы и основатели роли %s переживают восстановление и три дня мира", (role) => {
    const game = WorldGame.create("Старый мастер", "Monk", 4_500);
    makeEligible(game);
    if (role === "faction-founder") game.save.hero.factionReputation.wardens = 1_000;
    else game.save.enemies.slice(0, 6).forEach((enemy) => {
      game.save.hero.rivalries[enemy.id] = {
        enemyId: enemy.id, name: enemy.name, classId: enemy.classId, wins: 100, losses: 100,
        meetings: 200, killed: false, lastMetDay: 1, intensity: 5,
      };
    });
    game.save.mentors = [{
      id: "ancient-mentor", fighterId: "ancient-founder", name: "Первый учитель", classId: "Knight",
      factionId: "wardens", goal: "champion", level: 25, rating: 2_800, retiredDay: 50,
      studentIds: [], legacy: "Древняя школа", dynastyId: "ancient-school", role: "mentor",
    }];
    game.save.npcLife!.dynasties.push({
      id: "ancient-school", name: "Древняя школа", founderId: "ancient-founder", founderName: "Первый учитель",
      factionId: "wardens", foundedDay: 50, memberIds: ["ancient-founder"], prestige: 60,
    });
    const next = game.beginNewChronicle(transitionOptions(game), 4_501);
    expect(next.save.legacy.archives[0].worldRole).toBe(role);
    let restored = WorldGame.restore(JSON.parse(JSON.stringify(next.save)));
    for (let day = 0; day < 3; day += 1) restored.train();
    restored = WorldGame.restore(JSON.parse(JSON.stringify(restored.save)));
    expect(restored.save.worldDay).toBe(4);
    expect(restored.livingMentors().some((mentor) => mentor.id === "ancient-mentor")).toBe(true);
    expect(restored.npcDynasties().some((dynasty) => dynasty.id === "ancient-school")).toBe(true);
    const currentMentor = restored.livingMentors().find((mentor) => mentor.fighterId === "legacy-hero-1")!;
    expect(currentMentor).toBeDefined();
    expect(restored.npcDynasties().find((dynasty) => dynasty.id === currentMentor.dynastyId)?.founderId).toBe(currentMentor.fighterId);
    currentMentor.studentIds.forEach((id) => {
      expect(restored.save.enemies.find((enemy) => enemy.id === id)?.mentorId).toBe(currentMentor.id);
    });
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

  test("наследие воспроизводимо через сохранённый поток добычи", () => {
    const game = WorldGame.create("Кузнец", "Knight", 5_000);
    const source = game.save.hero.inventory[0];
    const first = prepareInheritedItem(source, "Knight", 2, "Кузнец", new SeededRandom("legacy-item"));
    const second = prepareInheritedItem(source, "Knight", 2, "Кузнец", new SeededRandom("legacy-item"));
    expect(first).toEqual(second);
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
    rival.heroMemory = buildLegacyArchive(game.save).heroMemory!;
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
    const veteran = next.save.enemies.find((enemy) => enemy.carriedFromCycle === 1 && enemy.name === rival.name)!;
    expect(veteran.classId).toBe(rival.classId);
    expect(veteran.heroMemory.familiarity).toBe(45);
    expect(veteran.heroMemory.lastEncounterDay).toBe(1);
    expect(veteran.heroMemory.recentSignatures[0].classId).toBe("Knight");
    expect(veteran.equipment.length).toBeGreaterThan(0);
    veteran.equipment.forEach((item) => {
      expect(item.allowedClasses === "all" || item.allowedClasses.includes(veteran.classId)).toBe(true);
      expect(veteran.equipped[item.slot]).toBe(item.id);
    });
  });

  test("погибшие соперники остаются в некрологе и не возвращаются ветеранами", () => {
    const game = WorldGame.create("Хранитель имён", "Knight", 8_500);
    makeEligible(game);
    const [fallen, survivor] = game.save.enemies.slice(0, 2);
    fallen.alive = false;
    game.save.hero.rivalries[fallen.id] = {
      enemyId: fallen.id, name: fallen.name, classId: fallen.classId,
      wins: 8, losses: 1, killed: true, lastMetDay: game.save.worldDay, meetings: 9,
    };
    game.save.hero.rivalries[survivor.id] = {
      enemyId: survivor.id, name: survivor.name, classId: survivor.classId,
      wins: 4, losses: 3, killed: false, lastMetDay: game.save.worldDay, meetings: 7,
    };

    const next = game.beginNewChronicle(transitionOptions(game), 8_600);
    const veterans = next.save.enemies.filter((enemy) => enemy.carriedFromCycle === 1);

    expect(veterans.some((enemy) => enemy.name === fallen.name)).toBe(false);
    expect(veterans.some((enemy) => enemy.name === survivor.name)).toBe(true);
    expect(next.save.legacy.archives[0].fallenNames).toContain(fallen.name);
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
    next.save.unlockedFeatureIds.push("contracts");
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
