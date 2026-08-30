import { combatantSnapshot } from "../src/gameplay/combat/AdvancedBattle";
import { WorldGame } from "../src/gameplay/core/WorldGame";
import { createItem } from "../src/factories/ItemFactory";

describe("расширение живого мира", () => {
  test("создаёт героя с чертой, тактиками и закрытой до первого чемпионства доской контрактов", () => {
    const game = WorldGame.create("Путник", "Knight", 1_000);

    expect(game.save.hero.traitIds).toHaveLength(1);
    expect(game.save.hero.tacticalProfiles).toHaveLength(4);
    expect(game.save.hero.activeTacticalProfileId).toBe("balanced");
    expect(game.featureAvailability("contracts").unlocked).toBe(false);
    expect(game.save.contractOffers).toHaveLength(0);
    expect(Object.keys(game.save.hero.factionReputation)).toHaveLength(3);
  });

  test("репутация фракции повышает награды её новых контрактов", () => {
    const base = WorldGame.create("Новичок", "Knight", 1_000);
    base.save.hero.arenaWins[0] = 1;
    WorldGame.restore(base.save);
    const baseOffer = base.save.contractOffers.find((offer) => offer.factionId === "wardens")!;
    const trusted = WorldGame.create("Союзник", "Knight", 1_000);
    trusted.save.hero.arenaWins[0] = 1;
    trusted.save.hero.factionReputation.wardens = 45;
    trusted.save.contractOffers = [];

    const refreshed = WorldGame.restore(trusted.save);
    const trustedOffer = refreshed.save.contractOffers.find((offer) => offer.factionId === "wardens")!;

    expect(trustedOffer.rewardGold).toBe(Math.round(baseOffer.rewardGold * 1.2));
    expect(trustedOffer.rewardExperience).toBe(Math.round(baseOffer.rewardExperience * 1.2));
  });

  test("восстанавливает старое сохранение без полей расширения", () => {
    const game = WorldGame.create("Старый", "Archer", 1_000);
    const legacy = game.save as unknown as Record<string, unknown>;
    delete legacy.contractOffers;
    delete legacy.completedContracts;
    delete legacy.tournamentRuleSeed;
    const hero = game.save.hero as unknown as Record<string, unknown>;
    delete hero.traitIds;
    delete hero.tacticalProfiles;
    delete hero.factionReputation;

    const restored = WorldGame.restore(game.save);

    expect(restored.save.contractOffers).toHaveLength(0);
    expect(restored.featureAvailability("contracts").unlocked).toBe(false);
    expect(restored.save.hero.traitIds.length).toBeGreaterThan(0);
    expect(restored.save.hero.tacticalProfiles).toHaveLength(4);
  });

  test("сохраняет выбранный тактический профиль в боевом снимке", () => {
    const game = WorldGame.create("Тактик", "Monk", 1_000);
    game.setTacticalProfile("control");

    expect(game.activeTacticalProfile().style).toBe("control");
    expect(combatantSnapshot(game.save.hero).tacticalStyle).toBe("control");
  });

  test("создаёт многоэтапный поход и позволяет выйти с частью награды", () => {
    const game = WorldGame.create("Следопыт", "Swordsman", 1_000);
    game.save.hero.level = 2;
    game.save.worldDay = 2;
    game.save.worldSeason!.ruleId = "bloody-month";
    game.save.factionControl!.dungeonControllers = {};
    const expedition = game.startExpedition("cellar");
    expedition.stage = 2;
    expedition.accumulatedExperience = 100;
    expedition.accumulatedGold = 80;
    expedition.loot.push(createItem(2, { classId: "Swordsman", rarity: "common" }));

    expect(expedition.maxStages).toBeGreaterThanOrEqual(3);
    expect(game.expeditionChoices().map((choice) => choice.id)).toContain("safe");

    const result = game.retreatExpedition();
    expect(result.retreated).toBe(true);
    expect(result.expedition).toMatchObject({ dungeonId: "cellar", stage: 2 });
    expect(result.rewards).toMatchObject({ experience: 55, gold: 44 });
    expect(result.rewards?.items).toHaveLength(1);
    expect(game.save.activeExpedition).toBeUndefined();
  });

  test("пробуждает заслужившую имя реликвию по выбранному пути", () => {
    const game = WorldGame.create("Хранитель", "Knight", 1_000);
    game.save.hero.arenaWins[3] = 1;
    const relic = createItem(12, { classId: "Knight", rarity: "legendary", slot: "weapon" });
    relic.relicTier = 1;
    relic.relicRenown = 5;
    game.save.hero.inventory.push(relic);
    game.save.hero.relicDust = 8;

    const awakened = game.awakenRelic(relic.id, "guard");

    expect(awakened.relicPath).toBe("guard");
    expect(awakened.relicName).toBeTruthy();
    expect(game.save.hero.relicDust).toBe(0);
  });

  test("сообщает о постоянном усилении реликвии после боя", () => {
    const game = WorldGame.create("Наследник", "Knight", 1_000);
    game.save.hero.arenaWins[3] = 1;
    game.save.hero.level = 30;
    const relic = createItem(30, { classId: "Knight", rarity: "legendary", slot: "weapon" });
    relic.relicRenown = 3;
    relic.relicTier = 0;
    relic.stats = { health: 10_000, attack: 10_000 };
    game.save.hero.inventory.push(relic);
    game.save.hero.equipped.weapon = relic.id;

    game.duel();
    const changes = game.consumeFeatureChanges();

    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ fighterId: "hero", kind: "Наследие" }),
    ]));
    expect(changes.find((change) => change.kind === "Наследие")?.stats.attack).toBeGreaterThan(0);
  });

  test("открывает системы по рубежам и сохраняет одноразовые уведомления до чтения", () => {
    const game = WorldGame.create("Первопроходец", "Knight", 1_000);

    expect(() => game.acceptContract("missing", "honor")).toThrow("Станьте чемпионом");
    expect(() => game.salvageItem(game.save.hero.inventory[0].id)).toThrow("Станьте чемпионом");

    game.save.hero.arenaWins[0] = 1;
    const withContracts = WorldGame.restore(JSON.parse(JSON.stringify(game.save)));
    expect(withContracts.isFeatureUnlocked("contracts")).toBe(true);
    expect(withContracts.save.contractOffers).toHaveLength(3);
    expect(withContracts.save.pendingFeatureUnlocks.map((entry) => entry.id)).toEqual(["contracts"]);

    const consumed = withContracts.consumeFeatureUnlocks();
    expect(consumed).toEqual([expect.objectContaining({ id: "contracts", tutorialId: "contracts" })]);
    withContracts.markTutorialSeen("contracts");
    const restored = WorldGame.restore(JSON.parse(JSON.stringify(withContracts.save)));
    expect(restored.consumeFeatureUnlocks()).toEqual([]);
    expect(restored.hasSeenTutorial("contracts")).toBe(true);

    withContracts.save.hero.arenaWins[3] = 1;
    const legacyUnlock = withContracts.consumeFeatureUnlocks();
    expect(legacyUnlock).toEqual([expect.objectContaining({ id: "equipment-legacy" })]);
    expect(withContracts.isFeatureUnlocked("equipment-legacy")).toBe(true);
  });
});
