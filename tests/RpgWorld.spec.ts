import { MAX_ACTIVE_SKILLS, combatantSnapshot, resolveCombat, unlockedSkills } from "../src/gameplay/AdvancedBattle";
import { ARENAS, CLASS_DEFINITIONS, DUEL_BOSSES, DUEL_TIERS, DUNGEONS, ENDGAME_ACTIVITIES, EQUIPMENT_SETS, ITEM_TEMPLATES, SKILLS } from "../src/catalogs/WorldCatalog";
import { calculateItemPrice, createItem } from "../src/factories/ItemFactory";
import { WorldGame } from "../src/gameplay/WorldGame";
import { enemyExperienceRequirement, heroExperienceRequirement } from "../src/gameplay/ProgressionBalance";
import { TournamentArena } from "../src/arenas/TournamentArena";

describe("постоянный RPG-мир", () => {
  test("содержит шесть игровых классов и десятки навыков", () => {
    expect(Object.keys(CLASS_DEFINITIONS)).toHaveLength(6);
    expect(SKILLS.length).toBeGreaterThanOrEqual(40);
    expect(unlockedSkills("Monk", 1).some((skill) => skill.name === "Толчок ладонью")).toBe(true);
    expect(unlockedSkills("Gunsmith", 16).some((skill) => skill.name === "Полный барабан")).toBe(true);
  });

  test("календарные турниры являются аренами общего доменного контракта", () => {
    expect(ARENAS.every((arena) => arena instanceof TournamentArena)).toBe(true);
    expect(ARENAS[0].modifyDamage(100, {} as never, {} as never)).toBe(90);
  });

  test("обязательно создаёт главного героя со стартовым снаряжением и живым миром", () => {
    const game = WorldGame.create("Астер", "Knight", 1_000);
    expect(game.save.hero.name).toBe("Астер");
    expect(game.save.hero.inventory.length).toBeGreaterThanOrEqual(3);
    expect(game.save.hero.inventory.length).toBeLessThan(10);
    expect(game.save.hero.inventory.some((item) => item.isVisualTestItem)).toBe(false);
    expect(game.save.hero.equipped.weapon).toBeDefined();
    expect(game.save.hero.equipped.offhand).toBeDefined();
    expect(game.save.enemies.filter((enemy) => enemy.alive).length).toBeGreaterThan(100);
    expect(game.leaderboard()).toHaveLength(100);
  });

  test("проводит отдельную дуэль, не меняя мировой рейтинг", () => {
    const game = WorldGame.create("Ирис", "Archer", 1_000);
    const before = game.save.worldDay;
    const rating = game.save.hero.rating;
    const worldFighterIds = new Set(game.save.enemies.map((enemy) => enemy.id));
    const report = game.duel();
    expect(report.battle?.turns.length).toBeGreaterThan(0);
    expect(worldFighterIds.has(report.battle!.enemyBefore.id)).toBe(true);
    expect(game.save.enemies.some((enemy) => enemy.id === report.battle!.enemyBefore.id)).toBe(true);
    expect(game.save.hero.rivalries[report.battle!.enemyBefore.id]).toBeDefined();
    expect(game.save.worldDay).toBe(before + 1);
    expect(game.save.hero.wins + game.save.hero.losses).toBe(1);
    expect(game.save.hero.duelWins + game.save.hero.duelLosses).toBe(1);
    expect(game.save.hero.rating).toBe(rating);
  });

  test("не записывает хранителей данжей и разовых бойцов в список соперников", () => {
    const game = WorldGame.create("Летописец", "Knight", 1_000);
    game.save.hero.level = 2;
    game.save.worldDay = 2;
    const report = game.play(DUNGEONS[0].id);
    expect(report.enemyBefore.id).toMatch(/^dungeon-/);
    expect(game.save.hero.rivalries[report.enemyBefore.id]).toBeUndefined();
  });

  test("не отдаёт первое место за серию обычных побед без высших арен", () => {
    const game = WorldGame.create("Скороход", "Swordsman", 1_000);
    game.save.hero.level = 15;
    game.save.hero.highestArena = 3;
    game.save.hero.tournamentMatchWins = 88;
    game.save.hero.arenaWins = [2, 3, 3, 0, 0, 0];
    const restored = WorldGame.restore(game.save);
    expect(restored.heroRank()).toBeGreaterThan(1);
  });

  test("не позволяет возглавить мир до победы на последней арене", () => {
    const game = WorldGame.create("Претендент", "Swordsman", 1_000);
    game.save.hero.level = 40;
    game.save.hero.highestArena = ARENAS.length - 2;
    game.save.hero.tournamentMatchWins = 500;
    game.save.hero.tournamentMatchLosses = 0;
    game.save.hero.arenaWins = [20, 20, 20, 20, 20, 0];

    const restored = WorldGame.restore(game.save);
    const leader = restored.leaderboard()[0];

    expect(restored.heroRank()).toBeGreaterThan(1);
    expect(leader.arenaIndex).toBe(ARENAS.length - 1);
  });

  test("сводит требования опыта игрока и мира к сопоставимым кривым", () => {
    expect(heroExperienceRequirement(1)).toBe(100);
    expect(heroExperienceRequirement(30)).toBeLessThan(5_000);
    expect(enemyExperienceRequirement(30)).toBeGreaterThan(heroExperienceRequirement(30) * 0.65);

    const game = WorldGame.create("Ветеран", "Knight", 1_000);
    game.save.hero.level = 29;
    game.save.hero.experience = 50_000;
    game.save.hero.experienceToNextLevel = 100_000;
    game.save.migrations = game.save.migrations?.filter((migration) => migration !== "rebalance-progression-curves-v1");
    const restored = WorldGame.restore(game.save);

    expect(restored.save.hero.experienceToNextLevel).toBe(heroExperienceRequirement(29));
    expect(restored.save.hero.experience).toBeCloseTo(heroExperienceRequirement(29) / 2, -1);
  });

  test("держит награды активностей в масштабе новой кривой опыта", () => {
    ARENAS.forEach((arena) => {
      expect(arena.rewardExperience).toBeLessThanOrEqual(heroExperienceRequirement(arena.minLevel) * 1.4);
    });
    DUNGEONS.forEach((dungeon) => {
      expect(dungeon.rewardExperience).toBeLessThan(heroExperienceRequirement(dungeon.minLevel));
    });
    DUEL_TIERS.forEach((duel) => {
      expect(duel.rewardExperience).toBeLessThan(heroExperienceRequirement(duel.minLevel));
    });
    DUEL_BOSSES.forEach((boss) => {
      expect(boss.rewardExperience).toBeLessThanOrEqual(heroExperienceRequirement(boss.requiredLevel) * 1.05);
    });
    ENDGAME_ACTIVITIES.forEach((activity) => {
      expect(activity.rewardExperience).toBeLessThan(heroExperienceRequirement(30));
    });
  });

  test("не начисляет рейтинг только за открытие следующей арены", () => {
    const game = WorldGame.create("Проверяющий", "Knight", 1_000);
    game.save.hero.level = 24;
    game.save.hero.tournamentMatchWins = 30;
    game.save.hero.arenaWins = [2, 2, 2, 1, 0, 0];
    game.save.hero.highestArena = 3;
    const beforeUnlock = WorldGame.restore(game.save).save.hero.rating;
    game.save.hero.highestArena = 4;
    const afterUnlock = WorldGame.restore(game.save).save.hero.rating;
    expect(afterUnlock).toBe(beforeUnlock);
  });

  test("закаляет конкретный предмет только за редкие печати", () => {
    const game = WorldGame.create("Кузнец", "Knight", 1_000);
    const item = game.save.hero.inventory[0];
    const beforeLevel = item.level;
    const beforeStats = { ...item.stats };
    expect(() => game.upgradeItem(item.id)).toThrow("Нужно печатей закалки");
    game.save.hero.temperingMarks = 2;
    expect(game.upgradeItem(item.id)).toBe(item);
    expect(item.enhancement).toBe(1);
    expect(item.level).toBe(beforeLevel + 1);
    expect(game.save.hero.temperingMarks).toBe(1);
    Object.entries(beforeStats).forEach(([stat, value]) => {
      expect(item.stats[stat as keyof typeof item.stats]).toBeGreaterThan(Number(value));
    });
  });

  test("позволяет снять предмет и держит легендарные вещи дорогими", () => {
    const game = WorldGame.create("Руна", "Knight", 1_000);
    const weapon = game.save.hero.equipped.weapon;
    expect(weapon).toBeDefined();
    game.unequip("weapon");
    expect(game.save.hero.equipped.weapon).toBeUndefined();
    expect(calculateItemPrice(15, "legendary")).toBeGreaterThan(10_000);
  });

  test("уникальные боссы имеют собственные условия и эксклюзивную добычу", () => {
    expect(DUEL_BOSSES).toHaveLength(4);
    DUEL_BOSSES.forEach((boss) => {
      Object.entries(boss.lootTemplateIds).forEach(([classId, templateId]) => {
        const loot = ITEM_TEMPLATES.find((item) => item.id === templateId);
        expect(loot?.exclusiveToBoss).toBe(boss.id);
        expect(loot?.allowedClasses).toContain(classId);
      });
    });
  });

  test("не создаёт лут выше диапазона ранней активности", () => {
    const game = WorldGame.create("Ветеран", "Knight", 1_000);
    game.save.hero.level = 27;
    game.save.worldDay = 50;
    const report = game.play(DUNGEONS[0].id);
    expect(report.heroWon).toBe(true);
    expect(report.rewards.item?.level).toBeLessThanOrEqual(DUNGEONS[0].enemyLevel[1] + 1);
    expect(report.rewards.item?.level).toBeLessThan(game.save.hero.level);
  });

  test("ограничивает тренировки прогрессом текущей арены", () => {
    const game = WorldGame.create("Ученик", "Monk", 1_000);
    expect(game.trainingLevelCap()).toBe(ARENAS[0].enemyLevel[1] + 1);
    game.save.hero.level = game.trainingLevelCap();
    expect(() => game.train()).toThrow("текущий предел");
    game.save.hero.highestArena = 1;
    expect(game.trainingLevelCap()).toBe(ARENAS[1].enemyLevel[1] + 1);
  });

  test("масштабирует высокого героя под раннюю арену", () => {
    const game = WorldGame.create("Чемпион", "Swordsman", 1_000);
    game.save.hero.level = 24;
    const scaled = combatantSnapshot(game.save.hero, 5);
    expect(scaled.level).toBe(5);
    expect(scaled.originalLevel).toBe(24);
  });

  test("поздние сборки выдерживают серию ударов вместо обмена ваншотами", () => {
    const game = WorldGame.create("Чемпион", "Swordsman", 1_000);
    const hero = game.save.hero;
    hero.level = 30;
    hero.inventory = (["weapon", "offhand", "head", "chest", "hands", "feet"] as const).map((slot) =>
      createItem(30, { classId: hero.classId, slot, rarity: "mythic" }));
    hero.equipped = Object.fromEntries(hero.inventory.map((item) => [item.slot, item.id]));

    const enemy = game.save.enemies.find((candidate) => candidate.arenaIndex === ARENAS.length - 1)!;
    enemy.level = 40;
    enemy.equipment = (["weapon", "offhand", "head", "chest", "hands", "feet"] as const).map((slot) =>
      createItem(40, { classId: enemy.classId, slot, rarity: "mythic" }));
    enemy.equipped = Object.fromEntries(enemy.equipment.map((item) => [item.slot, item.id]));

    const heroSnapshot = combatantSnapshot(hero);
    const enemySnapshot = combatantSnapshot(enemy);
    const random = jest.spyOn(Math, "random").mockReturnValue(0.1);
    const combat = resolveCombat(hero, enemy);
    random.mockRestore();
    const largestHitRatio = Math.max(...combat.turns.map((turn) => turn.damage / (turn.targetId === "hero" ? heroSnapshot.maxHealth : enemySnapshot.maxHealth)));

    expect(heroSnapshot.maxHealth).toBeGreaterThan(heroSnapshot.attack * 3);
    expect(enemySnapshot.maxHealth).toBeGreaterThan(enemySnapshot.attack * 3);
    expect(largestHitRatio).toBeLessThan(0.7);
    expect(combat.turns.length).toBeGreaterThan(4);
  });

  test("поддерживает автоснаряжение и сборку максимум из четырёх навыков", () => {
    const game = WorldGame.create("Сборщик", "Knight", 1_000);
    const upgrade = createItem(20, { classId: "Knight", slot: "weapon", rarity: "legendary" });
    game.save.shopOffers = [{ item: upgrade, sold: false }];
    game.save.hero.gold = upgrade.price;
    game.save.hero.level = 30;
    game.setAutoEquipBest(true);
    game.buy(0);
    expect(game.save.hero.equipped.weapon).toBe(upgrade.id);

    const skills = unlockedSkills("Knight", 30, [upgrade]);
    game.setSelectedSkills(skills.map((skill) => skill.id));
    expect(game.save.hero.selectedSkillIds).toHaveLength(MAX_ACTIVE_SKILLS);
  });

  test("собирает отдельную элиту, запускает Лигу короны на 30 бойцов и ведёт к легендам последовательно", () => {
    const game = WorldGame.create("Регент", "Knight", 1_000);
    expect(ENDGAME_ACTIVITIES).toHaveLength(2);
    expect(game.eliteLeaderboard()).toHaveLength(30);
    expect(game.eliteLeaderboard().slice(0, 5).every((_, index) => Boolean(game.legendTitle(index + 1)))).toBe(true);
    expect(game.crownLeagueAvailability().unlocked).toBe(false);
    game.save.hero.level = 60;
    game.save.hero.highestArena = ARENAS.length - 1;
    game.save.hero.arenaWins[ARENAS.length - 1] = 1;
    game.save.hero.rating = 100_000;
    const eliteIds = new Set(game.save.eliteLeagueMemberIds);
    game.save.enemies.filter((enemy) => eliteIds.has(enemy.id)).forEach((enemy) => {
      enemy.level = 1; enemy.equipment = []; enemy.equipped = {};
    });
    const crownLeagueInterval = ARENAS[ARENAS.length - 1].tournamentInterval * 2;
    game.save.worldDay = ARENAS[ARENAS.length - 1].tournamentInterval;
    expect(game.crownLeagueAvailability().unlocked).toBe(false);
    expect(game.crownLeagueAvailability().reason).toContain(`день ${crownLeagueInterval}`);
    expect(game.crownLeagueRegistrationAvailability().unlocked).toBe(true);
    expect(game.registerCrownLeague()).toBe(crownLeagueInterval);
    expect(game.registeredCrownLeagueDay()).toBe(crownLeagueInterval);
    expect(game.crownLeagueAvailability().reason).toContain(`записаны на день ${crownLeagueInterval}`);
    game.save.worldDay = crownLeagueInterval;
    expect(game.crownLeagueAvailability().unlocked).toBe(true);
    const beforeDay = game.save.worldDay;
    const report = game.playCrownLeague();
    expect(report.participantCount).toBe(30);
    expect(report.matches).toHaveLength(29);
    expect(report.heroBattles.length).toBeGreaterThan(0);
    expect(game.save.worldDay).toBe(beforeDay + 1);
    expect(game.registeredCrownLeagueDay()).toBeUndefined();
    expect(game.heroEliteRank()).toBeDefined();
    game.save.eliteLeagueMemberIds = [
      ...game.save.eliteLeagueMemberIds.filter((id) => id !== "hero").slice(0, 5),
      "hero",
      ...game.save.eliteLeagueMemberIds.filter((id) => id !== "hero").slice(5),
    ].slice(0, 30);
    game.save.lastLegendHuntDay = undefined;
    expect(game.legendHuntAvailability().reason).toContain("Следующая ступень: #5");
  });

  test("выдаёт регалии короны только при смене владельца и не надевает их без разрешения", () => {
    const game = WorldGame.create("Регент", "Knight", 1_000);
    const equippedBefore = { ...game.save.hero.equipped };
    game.save.eliteLeagueMemberIds = ["hero", ...game.save.eliteLeagueMemberIds.filter((id) => id !== "hero")].slice(0, 30);
    game.save.crownSetOwnerId = undefined;
    game.save.hero.autoEquipBest = false;

    const restored = WorldGame.restore(JSON.parse(JSON.stringify(game.save)));
    const crownItems = restored.save.hero.inventory.filter((item) => item.setId === "crown-sovereign");
    expect(crownItems).toHaveLength(6);
    expect(restored.save.hero.equipped).toEqual(equippedBefore);
    expect(restored.heroRank()).toBeUndefined();
    expect(restored.heroEliteRank()).toBe(1);

    const inventorySize = restored.save.hero.inventory.length;
    restored.eliteLeaderboard();
    restored.eliteLeaderboard();
    expect(restored.save.hero.inventory).toHaveLength(inventorySize);
    expect(() => restored.sell(crownItems[0].id)).toThrow("нельзя продать");

    const restoredAgain = WorldGame.restore(JSON.parse(JSON.stringify(restored.save)));
    expect(restoredAgain.save.hero.inventory.filter((item) => item.setId === "crown-sovereign")).toHaveLength(6);
  });

  test("массово продаёт только ненадетые обычные предметы", () => {
    const game = WorldGame.create("Купец", "Knight", 1_000);
    const extra = createItem(3, { classId: "Knight", rarity: "rare" });
    game.save.shopOffers = [{ item: extra, sold: false }];
    game.save.hero.gold = extra.price;
    game.buy(0);
    const equippedIds = new Set(Object.values(game.save.hero.equipped));
    const expectedCount = game.save.hero.inventory.filter((item) => !equippedIds.has(item.id) && game.canSell(item.id)).length;
    const goldBefore = game.save.hero.gold;

    const result = game.sellUnequipped();
    expect(result.count).toBe(expectedCount);
    expect(result.value).toBeGreaterThan(0);
    expect(game.save.hero.gold).toBe(goldBefore + result.value);
    expect(game.save.hero.inventory.every((item) => equippedIds.has(item.id) || !game.canSell(item.id))).toBe(true);
  });

  test("позволяет позднему герою сменить класс без потери уровня и инвентаря", () => {
    const game = WorldGame.create("Перерождённый", "Knight", 1_000);
    const hero = game.save.hero;
    hero.level = 42;
    hero.highestArena = ARENAS.length - 1;
    hero.arenaWins[ARENAS.length - 1] = 1;
    hero.gold = 30_000;
    hero.temperingMarks = 8;
    const level = hero.level;
    const inventoryBefore = hero.inventory.length;
    game.changeHeroClass("Wizard");
    expect(hero.classId).toBe("Wizard");
    expect(hero.level).toBe(level);
    expect(hero.inventory.length).toBeGreaterThanOrEqual(inventoryBefore);
    expect(hero.gold).toBe(5_000);
    expect(hero.temperingMarks).toBe(3);
    expect(hero.classChanges).toBe(1);
    expect(Object.values(hero.equipped).every((id) => {
      const item = hero.inventory.find((candidate) => candidate.id === id)!;
      return item.allowedClasses === "all" || item.allowedClasses.includes("Wizard");
    })).toBe(true);
  });

  test("требует запись и проводит полноценную турнирную сетку минимум на восемь бойцов", () => {
    const game = WorldGame.create("Ирис", "Archer", 1_000);
    expect(game.registerTournament(ARENAS[0].id)).toBe(2);
    game.train();
    const report = game.playTournament(ARENAS[0].id);
    expect(report.participantCount).toBeGreaterThanOrEqual(8);
    expect(report.matches).toHaveLength(report.participantCount - 1);
    expect(report.heroBattles.length).toBeGreaterThanOrEqual(1);
    expect(game.save.worldDay).toBe(3);
  });

  test("генерирует десятки событий за каждый прожитый день", () => {
    const game = WorldGame.create("Мира", "Knight", 1_000);
    const before = game.save.events.length;
    game.train();
    expect(game.save.events.length - before).toBeGreaterThan(25);
    expect(game.save.events.some((event) => event.type === "dungeon")).toBe(true);
  });

  test("сохраняет найденные шаблоны предметов в коллекции независимо от рюкзака", () => {
    const game = WorldGame.create("Руна", "Wizard", 1_000);
    const discovered = [...game.save.discoveredItems];
    const unequipped = game.save.hero.inventory.find((item) => !Object.values(game.save.hero.equipped).includes(item.id));
    if (unequipped) game.sell(unequipped.id);
    expect(game.save.discoveredItems).toEqual(discovered);
    expect(EQUIPMENT_SETS.every((set) => set.pieces.every((piece) => ITEM_TEMPLATES.some((item) => item.id === piece)))).toBe(true);
    expect(EQUIPMENT_SETS.length).toBeGreaterThanOrEqual(20);
    expect(ITEM_TEMPLATES.length).toBeGreaterThanOrEqual(120);
  });

  test("удаляет тестовый каталог из старых сохранений, не затрагивая честный лут", () => {
    const game = WorldGame.create("Руна", "Knight", 1_000);
    const legitimateItem = game.save.hero.inventory[0];
    const testOnlyTemplate = ITEM_TEMPLATES.find((template) =>
      template.slot === "head" && !game.save.hero.inventory.some((item) => item.templateId === template.id))!;
    const unrelatedDiscovery = ITEM_TEMPLATES.find((template) =>
      template.id !== testOnlyTemplate.id && !game.save.discoveredItems.includes(template.id))!;
    const visualOnlyItem = {
      ...legitimateItem,
      id: "legacy-visual-only",
      templateId: testOnlyTemplate.id,
      name: testOnlyTemplate.name,
      slot: testOnlyTemplate.slot,
      allowedClasses: testOnlyTemplate.allowedClasses,
      isVisualTestItem: true,
    };
    const visualDuplicate = { ...legitimateItem, id: "legacy-visual-duplicate", isVisualTestItem: true };
    game.save.hero.inventory.push(visualOnlyItem, visualDuplicate);
    game.save.hero.equipped.head = visualOnlyItem.id;
    game.save.hero.equipped.weapon = visualDuplicate.id;
    game.save.discoveredItems.push(testOnlyTemplate.id, unrelatedDiscovery.id);
    game.save.migrations!.push("visual-test-catalog-all-rarities-v1");

    const restored = WorldGame.restore(game.save);
    expect(restored.save.hero.inventory.some((item) => item.isVisualTestItem)).toBe(false);
    expect(restored.save.hero.equipped.head).toBeUndefined();
    expect(restored.save.hero.equipped.weapon).toBe(legitimateItem.id);
    expect(restored.save.discoveredItems).not.toContain(testOnlyTemplate.id);
    expect(restored.save.discoveredItems).toContain(legitimateItem.templateId);
    expect(restored.save.discoveredItems).toContain(unrelatedDiscovery.id);
    expect(restored.save.migrations).toContain("remove-visual-test-catalog-v1");

    const restoredAgain = WorldGame.restore(restored.save);
    expect(restoredAgain.save.hero.inventory).toEqual(restored.save.hero.inventory);
    expect(restoredAgain.save.discoveredItems).toEqual(restored.save.discoveredItems);
    expect(restoredAgain.save.migrations!.filter((migration) => migration === "remove-visual-test-catalog-v1")).toHaveLength(1);
  });

  test("держит силу новых противников в диапазоне их арены", () => {
    const game = WorldGame.create("Вэл", "Monk", 1_000);
    game.simulateElapsed(1_000 + 600_000 * 4);
    ARENAS.forEach((arena, arenaIndex) => {
      const local = game.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex);
      expect(local.length).toBeGreaterThanOrEqual(12);
      expect(local.every((enemy) => enemy.level >= arena.enemyLevel[0] || enemy.wins > 0)).toBe(true);
    });
  });

  test("не заменяет большую часть сотни лучших после длительной фоновой симуляции", () => {
    let state = 0x2f6e2b1;
    const random = jest.spyOn(Math, "random").mockImplementation(() => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    });

    try {
      const game = WorldGame.create("Летописец", "Knight", 1_000);
      const initialEnemyIds = new Set(game.save.enemies.map((enemy) => enemy.id));
      const previousTop = new Set(game.leaderboard().map((entry) => entry.id));

      expect(game.simulateElapsed(1_000 + 600_000 * 14)).toBe(14);

      const currentTop = game.leaderboard();
      const retained = currentTop.filter((entry) => previousTop.has(entry.id)).length;
      const enteredTop = currentTop.filter((entry) => !previousTop.has(entry.id)).length;
      const recruits = game.save.enemies.filter((enemy) => !initialEnemyIds.has(enemy.id));

      expect(retained).toBeGreaterThanOrEqual(75);
      expect(enteredTop).toBeLessThanOrEqual(25);
      expect(recruits.every((enemy) => enemy.tournamentWins <= 12)).toBe(true);
    } finally {
      random.mockRestore();
    }
  });

  test("не создаёт новых бойцов только из-за перезагрузки сохранения", () => {
    const game = WorldGame.create("Хранитель", "Archer", 1_000);
    const elite = new Set(game.save.eliteLeagueMemberIds);
    ARENAS.forEach((_, arenaIndex) => {
      const fighter = game.save.enemies.find((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !elite.has(enemy.id));
      if (fighter) fighter.alive = false;
    });
    const idsBeforeRestore = game.save.enemies.map((enemy) => enemy.id);

    const restored = WorldGame.restore(game.save);

    expect(restored.save.enemies.map((enemy) => enemy.id)).toEqual(idsBeforeRestore);
  });

  test("учитывает экипировку в итоговых характеристиках", () => {
    const game = WorldGame.create("Корт", "Swordsman", 1_000);
    const snapshot = combatantSnapshot(game.save.hero);
    expect(snapshot.attack).toBeGreaterThan(CLASS_DEFINITIONS.Swordsman.startingStats.attack);
    expect(snapshot.equipmentScore).toBeGreaterThan(0);
  });

  test("задаёт отдельные условия открытия для арен и данжей", () => {
    const game = WorldGame.create("Мира", "Gunsmith", 1_000);
    expect(game.availability(ARENAS[0]).unlocked).toBe(true);
    expect(game.availability(ARENAS[1]).unlocked).toBe(false);
    expect(game.availability(DUNGEONS[DUNGEONS.length - 1]).unlocked).toBe(false);
  });
});
