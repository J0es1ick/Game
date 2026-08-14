import { combatantSnapshot, unlockedSkills } from "../src/gameplay/AdvancedBattle";
import { ARENAS, CLASS_DEFINITIONS, DUEL_BOSSES, DUNGEONS, EQUIPMENT_SETS, ITEM_TEMPLATES, SKILLS } from "../src/catalogs/WorldCatalog";
import { calculateItemPrice } from "../src/factories/ItemFactory";
import { WorldGame } from "../src/gameplay/WorldGame";
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

  test("не отдаёт первое место за серию обычных побед без высших арен", () => {
    const game = WorldGame.create("Скороход", "Swordsman", 1_000);
    game.save.hero.level = 15;
    game.save.hero.highestArena = 3;
    game.save.hero.tournamentMatchWins = 88;
    game.save.hero.arenaWins = [2, 3, 3, 0, 0, 0];
    const restored = WorldGame.restore(game.save);
    expect(restored.heroRank()).toBeGreaterThan(1);
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
      const loot = ITEM_TEMPLATES.find((item) => item.id === boss.lootTemplateId);
      expect(loot?.exclusiveToBoss).toBe(boss.id);
    });
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
      expect(local.length).toBeGreaterThanOrEqual(16);
      expect(local.every((enemy) => enemy.level >= arena.enemyLevel[0] || enemy.wins > 0)).toBe(true);
    });
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
