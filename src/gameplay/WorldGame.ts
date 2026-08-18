import { MAX_ACTIVE_SKILLS, combatantSnapshot, resolveCombat, unlockedSkills } from "./AdvancedBattle";
import {
  ARENAS,
  CLASS_DEFINITIONS,
  DUEL_BOSSES,
  DUEL_TIERS,
  DUNGEONS,
  ENDGAME_ACTIVITIES,
  EQUIPMENT_SETS,
  RARITY_LABELS,
  RARITY_ORDER,
  SKILLS,
} from "../catalogs/WorldCatalog";
import { calculateItemPrice, createItem, createStarterItems, equipmentScore, itemPower } from "../factories/ItemFactory";
import {
  ActivityAvailability,
  ActivityDefinition,
  ArenaDefinition,
  BattleReport,
  BossDefinition,
  DailyActivityReport,
  DuelDefinition,
  DungeonDefinition,
  EnemyProfile,
  EquipmentItem,
  EquipmentSlot,
  GameSave,
  HeroClass,
  HeroProfile,
  LeaderboardEntry,
  Rarity,
  ShopOffer,
  SkillDefinition,
  TournamentMatch,
  TournamentReport,
  WorldEvent,
} from "./WorldTypes";

const enemyNames = [
  "Бран", "Хельга", "Торен", "Сив", "Мартен", "Рута", "Кай", "Орса", "Флинт", "Лисса",
  "Гектор", "Нима", "Валлен", "Ингрид", "Кроу", "Мара", "Отис", "Сальма", "Рен", "Ивар",
  "Далия", "Бор", "Элин", "Стерн", "Кира", "Фарен", "Юна", "Грей", "Тиль", "Ада",
];
const enemyTitles = ["нищий с моста", "бывший стражник", "портовый стрелок", "ученик лекаря", "беглый оруженосец", "бродячий дуэлянт", "хранитель ворот", "последний из артели"];
const enemyOrigins = ["Нижний город", "Пепельная слобода", "Северный тракт", "Рыбацкий квартал", "Старые казармы", "Чёрный хребет"];
const classes = Object.keys(CLASS_DEFINITIONS) as HeroClass[];

const VISUAL_TEST_CATALOG_CLEANUP_MIGRATION = "remove-visual-test-catalog-v1";
const ELITE_SIZE = 30;
const LEGEND_COUNT = 5;
const CROWN_LEAGUE_INTERVAL = 7;
const CROWN_SET_ID = "crown-sovereign";
export const CLASS_CHANGE_GOLD_COST = 25_000;
export const CLASS_CHANGE_MARK_COST = 5;

function pick<T>(items: readonly T[]): T { return items[Math.floor(Math.random() * items.length)]; }
function randomInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function uid(prefix: string): string { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }

function starterEquipment(classId: HeroClass): { inventory: EquipmentItem[]; equipped: HeroProfile["equipped"] } {
  const inventory = createStarterItems(classId);
  const equipped: HeroProfile["equipped"] = {};
  inventory.forEach((item) => { equipped[item.slot] = item.id; });
  return { inventory, equipped };
}

export class WorldGame {
  public readonly save: GameSave;

  private constructor(save: GameSave) {
    this.save = save;
  }

  public static create(name: string, classId: HeroClass, now = Date.now()): WorldGame {
    const starter = starterEquipment(classId);
    const hero: HeroProfile = {
      id: "hero", name: name.trim() || "Безымянный", classId, level: 1, experience: 0,
      experienceToNextLevel: 100, gold: 180, temperingMarks: 0, rating: 1000, wins: 0, losses: 0,
      tournamentMatchWins: 0, tournamentMatchLosses: 0, duelWins: 0, duelLosses: 0,
      dungeonWins: 0, dungeonLosses: 0, bossWins: 0, kills: 0, rivalries: {},
      arenaWins: ARENAS.map(() => 0), highestArena: 0, inventory: starter.inventory,
      equipped: starter.equipped, autoEquipBest: false, autoSelectSkills: true, selectedSkillIds: [], combatMode: "auto",
      crownLeaguePoints: 0, crownLeagueWins: 0, legendHuntWins: 0, legendDefenses: 0, classChanges: 0,
      appearance: { hairStyle: 0, faceStyle: 0 }, createdAt: now,
    };
    const save: GameSave = {
      version: 2, migrations: [], hero, enemies: [], worldDay: 1, lastSimulatedAt: now,
      dungeonClears: {}, shopDay: 1, shopOffers: [],
      discoveredItems: starter.inventory.map((item) => item.templateId), tournamentRegistrations: {}, defeatedBosses: [],
      huntedLegendIds: [], eliteLeagueMemberIds: [], eliteRatings: {}, eliteCrownWins: {}, events: [],
    };
    const game = new WorldGame(save);
    ARENAS.forEach((_, arenaIndex) => {
      for (let index = 0; index < 19; index += 1) game.save.enemies.push(game.createEnemy(arenaIndex));
    });
    game.ensureEliteLeague();
    game.ensurePopulations();
    game.rotateShop();
    game.event("system", `${hero.name} начал путь в Нижнем городе.`);
    return game;
  }

  public static restore(save: GameSave): WorldGame {
    const game = new WorldGame(save);
    game.save.discoveredItems ??= save.hero.inventory.map((item) => item.templateId);
    game.save.migrations ??= [];
    game.save.tournamentRegistrations ??= {};
    game.save.events ??= [];
    game.save.defeatedBosses ??= [];
    game.save.huntedLegendIds ??= [];
    game.save.eliteLeagueMemberIds ??= [];
    game.save.eliteRatings ??= {};
    game.save.eliteCrownWins ??= {};
    const hero = game.save.hero;
    hero.inventory.forEach((item) => {
      item.name = item.name.replace(/^\[3D-прототип\]\s*/, "");
    });
    game.save.events.forEach((event) => {
      event.message = event.message.replace("демонстрационный 3D-комплект", "демонстрационный комплект");
    });
    hero.appearance ??= { hairStyle: 0, faceStyle: 0 };
    hero.tournamentMatchWins ??= hero.arenaWins.reduce((sum, wins, index) => sum + wins * Math.ceil(Math.log2(ARENAS[index].participants)), 0);
    hero.tournamentMatchLosses ??= 0;
    hero.duelWins ??= 0; hero.duelLosses ??= 0;
    hero.dungeonWins ??= 0; hero.dungeonLosses ??= 0; hero.bossWins ??= game.save.defeatedBosses.length;
    hero.temperingMarks ??= 0; hero.kills ??= 0; hero.rivalries ??= {};
    hero.autoEquipBest ??= false;
    hero.crownLeaguePoints ??= 0;
    hero.crownLeagueWins ??= 0;
    hero.legendHuntWins ??= 0;
    hero.legendDefenses ??= 0;
    hero.classChanges ??= 0;
    hero.autoSelectSkills ??= true;
    hero.selectedSkillIds = (hero.selectedSkillIds ?? [])
      .filter((id, index, values) => values.indexOf(id) === index && SKILLS.some((skill) => skill.id === id))
      .slice(0, MAX_ACTIVE_SKILLS);
    if (hero.combatMode !== "manual") hero.combatMode = "auto";
    hero.inventory.forEach((item) => { item.enhancement ??= 0; });
    game.save.enemies.forEach((enemy) => {
      enemy.tournamentWins ??= Math.min(enemy.wins, Math.max(0, enemy.arenaIndex * 2));
      enemy.kills ??= 0;
      enemy.equipment.forEach((item) => { item.enhancement ??= 0; });
    });
    game.save.enemies.forEach((enemy) => { enemy.rating = game.enemyWorldRating(enemy); });
    game.ensureEliteLeague();
    game.ensurePopulations();
    game.save.shopOffers.forEach((offer) => { offer.item.price = calculateItemPrice(offer.item.level, offer.item.rarity); });
    game.cleanupVisualTestCatalog();
    game.recalculateHeroRating();
    return game;
  }

  public get activities(): Array<ArenaDefinition | DungeonDefinition> { return [...ARENAS, ...DUNGEONS]; }

  public simulateElapsed(now = Date.now()): number {
    const elapsedDays = Math.min(14, Math.max(0, Math.floor((now - this.save.lastSimulatedAt) / 600_000)));
    if (elapsedDays > 0) {
      for (let index = 0; index < elapsedDays; index += 1) {
        this.simulateDailyWorld();
        this.save.worldDay += 1;
      }
      this.save.lastSimulatedAt = now;
      this.ensurePopulations();
      this.event("system", `Пока вас не было, мир прожил ${elapsedDays} дн. Все арены, данжи и турниры продолжали работать.`);
      this.refreshShopIfNeeded();
    }
    return elapsedDays;
  }

  public nextTournamentDay(arenaId: string): number {
    const arena = ARENAS.find((candidate) => candidate.id === arenaId);
    if (!arena) throw new Error("Турнир не найден.");
    return (Math.floor(this.save.worldDay / arena.tournamentInterval) + 1) * arena.tournamentInterval;
  }

  public registeredTournamentDay(arenaId: string): number | undefined {
    return this.save.tournamentRegistrations[arenaId];
  }

  public registerTournament(arenaId: string): number {
    const arena = ARENAS.find((candidate) => candidate.id === arenaId);
    if (!arena) throw new Error("Турнир не найден.");
    const availability = this.availability(arena);
    if (!availability.unlocked) throw new Error(availability.reason);
    const existing = this.save.tournamentRegistrations[arenaId];
    if (existing && existing >= this.save.worldDay) return existing;
    const day = this.nextTournamentDay(arenaId);
    this.save.tournamentRegistrations[arenaId] = day;
    this.event("tournament", `${this.save.hero.name} записался на «${arena.name}» в день ${day}.`);
    return day;
  }

  public availability(activity: ActivityDefinition): ActivityAvailability {
    const hero = this.save.hero;
    if (activity.kind === "endgame") {
      return activity.id === "crown-league" ? this.crownLeagueAvailability() : this.legendHuntAvailability();
    }
    if (activity.kind === "arena") {
      const index = ARENAS.findIndex((arena) => arena.id === activity.id);
      if (index > hero.highestArena) return { unlocked: false, reason: `Победите на арене «${ARENAS[index - 1].name}».` };
      if (hero.level < activity.minLevel) return { unlocked: false, reason: `Требуется ${activity.minLevel} уровень.` };
      const registered = this.save.tournamentRegistrations[activity.id];
      if (registered === this.save.worldDay) return { unlocked: true, reason: `Турнир проходит сегодня. Место в сетке подтверждено.` };
      if (registered && registered > this.save.worldDay) return { unlocked: true, reason: `Вы записаны на день ${registered}. До события: ${registered - this.save.worldDay} дн.` };
      return { unlocked: true, reason: `${hero.arenaWins[index]}/${activity.winsToAdvance} побед в турнирах для продвижения.` };
    }
    if (activity.kind === "duel") return this.duelAvailability(activity);
    if (activity.kind === "boss") return this.bossAvailability(activity);
    if (hero.level < activity.minLevel) return { unlocked: false, reason: `Требуется ${activity.minLevel} уровень.` };
    if (hero.highestArena < activity.requiredArena) return { unlocked: false, reason: `Сначала откройте арену ${activity.requiredArena + 1}.` };
    if (this.save.worldDay < activity.requiredWorldDay) return { unlocked: false, reason: `Откроется на ${activity.requiredWorldDay}-й день мира.` };
    const lastClear = this.save.dungeonClears[activity.id];
    if (lastClear && this.save.worldDay - lastClear < activity.cooldownDays) {
      return { unlocked: false, reason: `Восстановится через ${activity.cooldownDays - (this.save.worldDay - lastClear)} дн.` };
    }
    return { unlocked: true, reason: `Гарантирована добыча: ${RARITY_LABELS[activity.minimumRarity].toLowerCase()}.` };
  }

  public play(activityId: string): BattleReport {
    const activity = this.activities.find((candidate) => candidate.id === activityId);
    if (!activity) throw new Error("Активность не найдена.");
    const availability = this.availability(activity);
    if (!availability.unlocked) throw new Error(availability.reason);

    if (activity.kind === "arena") throw new Error("На арене проводится турнир. Сначала запишитесь через календарь.");
    const enemy = this.createDungeonEnemy(activity.enemyLevel, activity.name);
    const activeItemIds = new Set(Object.values(this.save.hero.equipped));
    const activeItemsBefore = this.save.hero.inventory.filter((item) => activeItemIds.has(item.id));
    const heroSkillsBefore = new Set(unlockedSkills(this.save.hero.classId, this.save.hero.level, activeItemsBefore).map((skill) => skill.id));
    const combat = resolveCombat(this.save.hero, enemy);
    const heroWon = combat.winnerId === "hero";
    const enemyDied = false;
    const exp = heroWon ? activity.rewardExperience + enemy.level * 7 : Math.round(activity.rewardExperience * 0.2);
    const gold = heroWon ? activity.rewardGold + randomInt(0, Math.round(activity.rewardGold * 0.25)) : 0;
    const levelsGained = this.gainHeroExperience(exp);
    this.save.hero.gold += gold;
    if (heroWon) { this.save.hero.wins += 1; this.save.hero.dungeonWins += 1; }
    else { this.save.hero.losses += 1; this.save.hero.dungeonLosses += 1; }
    this.recordHeroEncounter(enemy, heroWon);

    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      const rewardLevel = Math.min(this.save.hero.level + 2, activity.enemyLevel[1] + 1);
      item = createItem(rewardLevel, {
        classId: this.save.hero.classId,
        minimumRarity: activity.minimumRarity,
      });
      this.addItem(item);
      this.event("loot", `${this.save.hero.name} получил предмет: ${item.name}.`);
      if (activity.requiredArena >= ARENAS.length - 2 && Math.random() < 0.22) {
        temperingMarks = 1;
        this.save.hero.temperingMarks += temperingMarks;
        this.event("loot", `${this.save.hero.name} нашёл редкую печать закалки.`);
      }
    }

    if (heroWon) {
      this.save.dungeonClears[activity.id] = this.save.worldDay;
    }
    const eventsBefore = this.save.events.length;
    this.event("dungeon", `${this.save.hero.name} ${heroWon ? "завершил" : "не прошёл"} вылазку «${activity.name}».`);
    this.completeDay();
    const equippedAfterBattle = new Set(Object.values(this.save.hero.equipped));
    const unlockedNow = unlockedSkills(this.save.hero.classId, this.save.hero.level, this.save.hero.inventory.filter((item) => equippedAfterBattle.has(item.id)))
      .filter((skill) => !heroSkillsBefore.has(skill.id));
    return {
      activity, heroBefore: combat.hero, enemyBefore: combat.enemy,
      winnerId: combat.winnerId, loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied,
      turns: combat.turns,
      rewards: { experience: exp, gold, item, levelsGained, unlockedSkills: unlockedNow, temperingMarks },
      worldEvents: this.save.events.slice(eventsBefore),
    };
  }

  public train(): DailyActivityReport {
    const levelCap = this.trainingLevelCap();
    if (this.save.hero.level >= levelCap) {
      throw new Error(`Тренировки больше не дают уровень. Сначала продвиньтесь на следующую арену; текущий предел — ${levelCap}.`);
    }
    const experience = 34 + this.save.hero.level * 5;
    const levelsGained = this.gainHeroExperience(experience, levelCap);
    this.event("system", `${this.save.hero.name} провёл день на тренировочной площадке и получил ${experience} опыта.`);
    this.completeDay();
    return { kind: "training", title: "Тренировка завершена", description: "Безопасная практика без добычи и рейтингового риска.", experience, gold: 0, levelsGained };
  }

  public trainingLevelCap(): number {
    const arena = ARENAS[Math.min(this.save.hero.highestArena, ARENAS.length - 1)];
    return arena.enemyLevel[1] + 1;
  }

  public duel(tierId = DUEL_TIERS[0].id): DailyActivityReport {
    const tier = DUEL_TIERS.find((candidate) => candidate.id === tierId);
    if (!tier) throw new Error("Ступень дуэлей не найдена.");
    const availability = this.duelAvailability(tier);
    if (!availability.unlocked) throw new Error(availability.reason);
    const arenaIndex = Math.min(Math.max(tier.requiredArena, this.save.hero.highestArena), ARENAS.length - 1);
    const enemy = this.matchDuelEnemy(tier, arenaIndex);
    const combat = resolveCombat(this.save.hero, enemy);
    const heroWon = combat.winnerId === "hero";
    const experience = heroWon ? tier.rewardExperience + enemy.level * 6 : Math.round(tier.rewardExperience * 0.28);
    const gold = heroWon ? tier.rewardGold + enemy.level * 4 : 0;
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    if (heroWon) { this.save.hero.wins += 1; this.save.hero.duelWins += 1; }
    else { this.save.hero.losses += 1; this.save.hero.duelLosses += 1; }
    heroWon ? enemy.losses += 1 : enemy.wins += 1;
    this.recordHeroEncounter(enemy, heroWon);
    this.event("battle", `${this.save.hero.name} ${heroWon ? "победил" : "проиграл"} ${enemy.name} в дуэли «${tier.name}».`);
    const battle: BattleReport = {
      activity: tier, heroBefore: combat.hero, enemyBefore: combat.enemy,
      winnerId: combat.winnerId, loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false,
      turns: combat.turns, rewards: { experience, gold, levelsGained, unlockedSkills: [], item: undefined }, worldEvents: [],
    };
    this.completeDay();
    return { kind: "duel", title: tier.name, description: heroWon ? "Победа в подобранном по силе поединке." : "Поражение без риска для жизни.", battle, experience, gold, levelsGained };
  }

  public fightBoss(bossId: string): DailyActivityReport {
    const boss = DUEL_BOSSES.find((candidate) => candidate.id === bossId);
    if (!boss) throw new Error("Особый противник не найден.");
    const availability = this.bossAvailability(boss);
    if (!availability.unlocked) throw new Error(availability.reason);
    const enemy = this.createBossEnemy(boss);
    const combat = resolveCombat(this.save.hero, enemy);
    const heroWon = combat.winnerId === "hero";
    const experience = heroWon ? boss.rewardExperience : Math.round(boss.rewardExperience * 0.16);
    const gold = heroWon ? boss.rewardGold : 0;
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    if (heroWon) {
      this.save.hero.wins += 1; this.save.hero.bossWins += 1; this.save.defeatedBosses.push(boss.id);
      this.save.hero.temperingMarks += 1;
      const rewardLevel = Math.min(this.save.hero.level + 2, boss.level + 2);
      item = createItem(rewardLevel, { classId: this.save.hero.classId, templateId: boss.lootTemplateIds[this.save.hero.classId], rarity: boss.id === "nameless-duke" ? "mythic" : "legendary" });
      this.addItem(item);
      this.event("loot", `${this.save.hero.name} победил ${boss.name} и получил уникальный предмет «${item.name}».`);
    } else this.save.hero.losses += 1;
    this.recordHeroEncounter(enemy, heroWon);
    const battle: BattleReport = {
      activity: boss, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns,
      rewards: { experience, gold, item, levelsGained, unlockedSkills: [], temperingMarks: heroWon ? 1 : 0 }, worldEvents: [],
    };
    this.completeDay();
    return { kind: "duel", title: boss.name, description: heroWon ? "Уникальный противник побеждён навсегда." : "Босс останется доступен для новой попытки.", battle, experience, gold, levelsGained };
  }

  public playTournament(arenaId: string): TournamentReport {
    const arenaIndex = ARENAS.findIndex((candidate) => candidate.id === arenaId);
    const arena = ARENAS[arenaIndex];
    if (!arena) throw new Error("Турнир не найден.");
    if (this.save.tournamentRegistrations[arenaId] !== this.save.worldDay) {
      throw new Error("На этот турнир нет действующей записи или его день ещё не наступил.");
    }

    const eventsBefore = this.save.events.length;
    const pool = this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex)
      .sort((a, b) => Math.abs(this.enemyPower(a) - this.heroPower()) - Math.abs(this.enemyPower(b) - this.heroPower()));
    while (pool.length < arena.participants - 1) { const enemy = this.createEnemy(arenaIndex); this.save.enemies.push(enemy); pool.push(enemy); }
    const selected = this.shuffle(pool.slice(0, arena.participants - 1));
    let participants: Array<HeroProfile | EnemyProfile> = this.shuffle([this.save.hero, ...selected]);
    const matches: TournamentMatch[] = [];
    const heroBattles: BattleReport[] = [];
    let round = 1;
    let heroPlacement: number = arena.participants;

    while (participants.length > 1) {
      const winners: Array<HeroProfile | EnemyProfile> = [];
      for (let cursor = 0; cursor < participants.length; cursor += 2) {
        const first = participants[cursor];
        const second = participants[cursor + 1];
        if (!second) { winners.push(first); continue; }
        const heroInvolved = first.id === "hero" || second.id === "hero";
        let winner: HeroProfile | EnemyProfile;
        let battle: BattleReport | undefined;
        if (heroInvolved) {
          const enemy = (first.id === "hero" ? second : first) as EnemyProfile;
          const combat = resolveCombat(this.save.hero, enemy, { heroLevelCap: arena.enemyLevel[1] + 1 });
          const heroWon = combat.winnerId === "hero";
          winner = heroWon ? this.save.hero : enemy;
          const enemyDied = heroWon && Math.random() < arena.lethalChance;
          battle = {
            activity: arena, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
            loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied, turns: combat.turns,
            rewards: { experience: 0, gold: 0, levelsGained: 0, unlockedSkills: [] }, worldEvents: [],
          };
          heroBattles.push(battle);
          if (heroWon) { this.save.hero.wins += 1; this.save.hero.tournamentMatchWins += 1; }
          else { this.save.hero.losses += 1; this.save.hero.tournamentMatchLosses += 1; }
          this.recordHeroEncounter(enemy, heroWon, enemyDied);
          this.updateEnemyAfterPlayerBattle(enemy, heroWon, enemyDied);
          if (!heroWon) heroPlacement = Math.max(2, Math.floor(arena.participants / (2 ** (round - 1))));
        } else {
          const firstEnemy = first as EnemyProfile;
          const secondEnemy = second as EnemyProfile;
          const chance = this.enemyPower(firstEnemy) / (this.enemyPower(firstEnemy) + this.enemyPower(secondEnemy));
          winner = Math.random() < chance ? firstEnemy : secondEnemy;
          const loser = winner.id === firstEnemy.id ? secondEnemy : firstEnemy;
          winner.wins += 1; winner.arenaWins += 1; winner.experience += 65 + arenaIndex * 24;
          loser.losses += 1;
          this.progressEnemy(winner, false);
        }
        winners.push(winner);
        matches.push({ round, match: cursor / 2 + 1, firstName: first.name, secondName: second.name, winnerName: winner.name, heroInvolved, battle });
      }
      participants = winners;
      round += 1;
    }

    const champion = participants[0];
    const heroWon = champion.id === "hero";
    if (heroWon) heroPlacement = 1;
    const roundsWon = heroBattles.filter((battle) => battle.heroWon).length;
    const experience = heroWon ? arena.rewardExperience : Math.round(arena.rewardExperience * (0.12 + roundsWon * 0.13));
    const gold = heroWon ? arena.rewardGold : Math.round(arena.rewardGold * roundsWon * 0.04);
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      this.save.hero.arenaWins[arenaIndex] += 1;
      if (this.save.hero.arenaWins[arenaIndex] >= arena.winsToAdvance && arenaIndex < ARENAS.length - 1) this.save.hero.highestArena = Math.max(this.save.hero.highestArena, arenaIndex + 1);
      const minimum: Rarity = arenaIndex >= 4 ? "legendary" : arenaIndex >= 2 ? "epic" : "rare";
      const rewardLevel = Math.min(this.save.hero.level + 2, arena.enemyLevel[1] + 1);
      item = createItem(rewardLevel, { classId: this.save.hero.classId, minimumRarity: minimum });
      this.addItem(item);
      this.event("loot", `Чемпионский приз ${this.save.hero.name}: ${item.name}.`);
      if (arenaIndex >= 2) {
        temperingMarks = arenaIndex === ARENAS.length - 1 ? 2 : 1;
        this.save.hero.temperingMarks += temperingMarks;
        this.event("loot", `${this.save.hero.name} получил ${temperingMarks} печ. закалки за чемпионство.`);
      }
    }
    this.recalculateHeroRating();
    this.event("tournament", `«${arena.name}» завершён. Чемпион: ${champion.name}. Участников: ${arena.participants}.`);
    delete this.save.tournamentRegistrations[arenaId];
    this.completeDay(arenaId);
    return {
      activity: arena, day: this.save.worldDay - 1, participantCount: arena.participants, matches,
      heroBattles, championName: champion.name, heroWon, heroPlacement,
      rewards: { experience, gold, item, levelsGained, unlockedSkills: [], temperingMarks }, worldEvents: this.save.events.slice(eventsBefore),
    };
  }

  public equip(itemId: string): void {
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Предмет не найден.");
    if (item.allowedClasses !== "all" && !item.allowedClasses.includes(this.save.hero.classId)) throw new Error("Этот класс не может использовать предмет.");
    this.save.hero.equipped[item.slot] = item.id;
  }

  public crownLeagueAvailability(): ActivityAvailability {
    const hero = this.save.hero;
    const finalArenaIndex = ARENAS.length - 1;
    if (hero.highestArena < finalArenaIndex || (hero.arenaWins[finalArenaIndex] ?? 0) < 1) {
      return { unlocked: false, reason: `Сначала станьте чемпионом турнира «${ARENAS[finalArenaIndex].name}».` };
    }
    const eliteRank = this.heroEliteRank();
    if (eliteRank) return { unlocked: true, reason: `Место в элите: #${eliteRank}. Вы входите в сетку из ${ELITE_SIZE} бойцов.` };
    const ordinaryRank = this.heroRank();
    if (ordinaryRank < 1 || ordinaryRank > 2) {
      return { unlocked: false, reason: `Для квалификации нужно место #1–2 обычного рейтинга. Сейчас: #${ordinaryRank || "—"}.` };
    }
    return { unlocked: true, reason: `Квалификация с места #${ordinaryRank}: только чемпион турнира войдёт в элиту.` };
  }

  public legendHuntAvailability(): ActivityAvailability {
    const eliteRank = this.heroEliteRank();
    if (!eliteRank) return { unlocked: false, reason: "Сначала войдите в элитную тридцатку через Лигу короны." };
    if (eliteRank > LEGEND_COUNT + 1) return { unlocked: false, reason: `Поднимитесь до #${LEGEND_COUNT + 1} в элите. Сейчас: #${eliteRank}.` };
    if (eliteRank === 1) return { unlocked: false, reason: "Вы — первая легенда. Осталось защищать корону от претендентов." };
    const lastHunt = this.save.lastLegendHuntDay;
    if (lastHunt !== undefined && this.save.worldDay - lastHunt < 4) {
      return { unlocked: false, reason: `Новая легенда появится через ${4 - (this.save.worldDay - lastHunt)} дн.` };
    }
    const target = this.currentLegendTarget();
    if (!target) return { unlocked: false, reason: "Следующий соперник в элите пока не определён." };
    return { unlocked: true, reason: `Следующая ступень: #${eliteRank - 1} ${target.name}. Перепрыгнуть через неё нельзя.` };
  }

  public crownLeagueTier(): { name: string; index: number; nextAt?: number } {
    const rank = this.heroEliteRank();
    if (!rank) return { name: "Претендент", index: 0 };
    if (rank === 1) return { name: "Первая легенда", index: 3 };
    if (rank <= LEGEND_COUNT) return { name: `Легенда #${rank}`, index: 2 };
    return { name: `Элита #${rank}`, index: 1, nextAt: LEGEND_COUNT };
  }

  public eliteLeaderboard(): LeaderboardEntry[] {
    this.ensureEliteLeague();
    return this.save.eliteLeagueMemberIds
      .map((id) => this.leaderboardEntry(id, true))
      .filter((entry): entry is LeaderboardEntry => Boolean(entry));
  }

  public heroEliteRank(): number | undefined {
    const index = this.save.eliteLeagueMemberIds.indexOf("hero");
    return index >= 0 ? index + 1 : undefined;
  }

  public legendTitle(rank: number): string | undefined {
    return ["Первая корона", "Правая рука короны", "Железное имя", "Четвёртое знамя", "Последняя легенда"][rank - 1];
  }

  public currentLegendTarget(): EnemyProfile | undefined {
    const rank = this.heroEliteRank();
    if (!rank || rank <= 1 || rank > LEGEND_COUNT + 1) return undefined;
    return this.enemyById(this.save.eliteLeagueMemberIds[rank - 2]);
  }

  public pendingLegendChallenge(): EnemyProfile | undefined {
    return this.save.pendingEliteChallengeId ? this.enemyById(this.save.pendingEliteChallengeId) : undefined;
  }

  public playCrownLeague(): TournamentReport {
    const activity = ENDGAME_ACTIVITIES.find((candidate) => candidate.id === "crown-league")!;
    const availability = this.crownLeagueAvailability();
    if (!availability.unlocked) throw new Error(availability.reason);
    this.ensureEliteLeague();
    const eventsBefore = this.save.events.length;
    const wasElite = Boolean(this.heroEliteRank());
    const rosterIds = wasElite
      ? [...this.save.eliteLeagueMemberIds]
      : ["hero", ...this.save.eliteLeagueMemberIds.slice(0, ELITE_SIZE - 1)];
    let participants = this.shuffle(rosterIds.map((id) => this.fighterById(id)).filter((fighter): fighter is HeroProfile | EnemyProfile => Boolean(fighter)));
    if (participants.length !== ELITE_SIZE) throw new Error("Элитная сетка ещё не собрана.");
    const matches: TournamentMatch[] = [];
    const heroBattles: BattleReport[] = [];
    let round = 1;
    let heroPlacement = ELITE_SIZE;

    while (participants.length > 1) {
      const winners: Array<HeroProfile | EnemyProfile> = [];
      for (let cursor = 0; cursor < participants.length; cursor += 2) {
        const first = participants[cursor]; const second = participants[cursor + 1];
        if (!second) { winners.push(first); continue; }
        const heroInvolved = first.id === "hero" || second.id === "hero";
        let winner: HeroProfile | EnemyProfile; let battle: BattleReport | undefined;
        if (heroInvolved) {
          const enemy = (first.id === "hero" ? second : first) as EnemyProfile;
          const combat = resolveCombat(this.save.hero, enemy);
          const heroWon = combat.winnerId === "hero";
          winner = heroWon ? this.save.hero : enemy;
          battle = { activity, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
            loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns,
            rewards: { experience: 0, gold: 0, levelsGained: 0, unlockedSkills: [] }, worldEvents: [] };
          heroBattles.push(battle);
          if (heroWon) { this.save.hero.wins += 1; this.save.hero.tournamentMatchWins += 1; }
          else { this.save.hero.losses += 1; this.save.hero.tournamentMatchLosses += 1; }
          this.recordHeroEncounter(enemy, heroWon); this.updateEnemyAfterPlayerBattle(enemy, heroWon, false);
          this.adjustEliteRating("hero", heroWon ? 12 : -5); this.adjustEliteRating(enemy.id, heroWon ? -5 : 12);
          if (!heroWon) heroPlacement = Math.max(2, Math.floor(ELITE_SIZE / (2 ** (round - 1))));
        } else {
          const firstEnemy = first as EnemyProfile; const secondEnemy = second as EnemyProfile;
          const chance = this.enemyPower(firstEnemy) / (this.enemyPower(firstEnemy) + this.enemyPower(secondEnemy));
          winner = Math.random() < chance ? firstEnemy : secondEnemy;
          const loser = winner.id === firstEnemy.id ? secondEnemy : firstEnemy;
          winner.wins += 1; winner.experience += 150; loser.losses += 1;
          this.adjustEliteRating(winner.id, 12); this.adjustEliteRating(loser.id, -5); this.progressEnemy(winner, false);
        }
        winners.push(winner);
        matches.push({ round, match: cursor / 2 + 1, firstName: first.name, secondName: second.name, winnerName: winner.name, heroInvolved, battle });
      }
      participants = winners; round += 1;
    }

    const champion = participants[0];
    const heroWon = champion.id === "hero";
    if (heroWon) heroPlacement = 1;
    if (champion.id !== "hero") {
      const npc = champion as EnemyProfile; npc.tournamentWins += 1;
      this.save.eliteCrownWins[npc.id] = (this.save.eliteCrownWins[npc.id] ?? 0) + 1;
    }
    const roundsWon = heroBattles.filter((battle) => battle.heroWon).length;
    const experience = heroWon ? activity.rewardExperience : Math.round(activity.rewardExperience * (0.12 + roundsWon * 0.12));
    const gold = heroWon ? activity.rewardGold : Math.round(activity.rewardGold * roundsWon * 0.05);
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    let temperingMarks = roundsWon > 0 ? 1 : 0;
    if (heroWon) {
      this.save.hero.crownLeagueWins += 1;
      this.save.hero.crownLeaguePoints += 20;
      temperingMarks = 4;
      item = createItem(this.save.hero.level + 2, { classId: this.save.hero.classId, minimumRarity: "mythic" });
      this.addItem(item);
      if (!wasElite) this.promoteIntoElite("hero");
      else this.adjustEliteRating("hero", 28);
    } else if (wasElite) {
      this.save.hero.crownLeaguePoints += roundsWon * 3;
    }
    this.save.hero.temperingMarks += temperingMarks;
    this.save.lastCrownLeagueDay = this.save.worldDay;
    if (wasElite || !heroWon) this.sortEliteByRating();
    this.syncCrownSet();
    this.event("tournament", `Лига короны завершена. Чемпион: ${champion.name}. Сетка: ${ELITE_SIZE} бойцов.`);
    this.completeDay();
    this.recalculateHeroRating();
    return {
      activity, day: this.save.worldDay - 1, participantCount: ELITE_SIZE, matches, heroBattles,
      championName: champion.name, heroWon, heroPlacement,
      rewards: { experience, gold, item, levelsGained, unlockedSkills: [], temperingMarks },
      worldEvents: this.save.events.slice(eventsBefore),
    };
  }

  public huntLegend(): BattleReport {
    const activity = ENDGAME_ACTIVITIES.find((candidate) => candidate.id === "legend-hunt")!;
    const availability = this.legendHuntAvailability();
    if (!availability.unlocked) throw new Error(availability.reason);
    const enemy = this.currentLegendTarget()!;
    const combat = resolveCombat(this.save.hero, enemy);
    const heroWon = combat.winnerId === "hero";
    const experience = heroWon ? activity.rewardExperience + enemy.level * 35 : Math.round(activity.rewardExperience * 0.18);
    const gold = heroWon ? activity.rewardGold + enemy.tournamentWins * 120 : 0;
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    this.save.lastLegendHuntDay = this.save.worldDay;
    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      this.save.hero.wins += 1;
      this.save.hero.legendHuntWins += 1;
      this.swapEliteMembers("hero", enemy.id);
      temperingMarks = 4;
      this.save.hero.temperingMarks += temperingMarks;
      item = createItem(this.save.hero.level + 2, { classId: this.save.hero.classId, minimumRarity: "mythic" });
      this.addItem(item);
    } else this.save.hero.losses += 1;
    this.recordHeroEncounter(enemy, heroWon);
    this.updateEnemyAfterPlayerBattle(enemy, heroWon, false);
    this.syncCrownSet();
    this.event("battle", `${this.save.hero.name} ${heroWon ? `занял место ${this.heroEliteRank()} в элите` : "не смог подняться"} после боя с ${enemy.name}.`);
    this.completeDay();
    return {
      activity, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns,
      rewards: { experience, gold, item, levelsGained, unlockedSkills: [], temperingMarks }, worldEvents: [],
    };
  }

  public defendLegendTitle(): BattleReport {
    const activity = ENDGAME_ACTIVITIES.find((candidate) => candidate.id === "legend-hunt")!;
    const enemy = this.pendingLegendChallenge();
    const rank = this.heroEliteRank();
    if (!enemy || !rank || rank > LEGEND_COUNT) throw new Error("Активного вызова легенде нет.");
    const combat = resolveCombat(this.save.hero, enemy);
    const heroWon = combat.winnerId === "hero";
    if (heroWon) { this.save.hero.wins += 1; this.save.hero.legendDefenses += 1; this.adjustEliteRating("hero", 10); }
    else { this.save.hero.losses += 1; this.swapEliteMembers("hero", enemy.id); }
    this.recordHeroEncounter(enemy, heroWon); this.updateEnemyAfterPlayerBattle(enemy, heroWon, false);
    this.save.pendingEliteChallengeId = undefined;
    this.save.lastLegendHuntDay = this.save.worldDay;
    this.syncCrownSet();
    this.event("battle", heroWon ? `${this.save.hero.name} защитил титул легенды.` : `${enemy.name} отобрал у ${this.save.hero.name} место легенды.`);
    this.completeDay();
    return { activity, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns,
      rewards: { experience: 0, gold: 0, levelsGained: 0, unlockedSkills: [] }, worldEvents: [] };
  }

  public equipBest(mode: "power" | "set" = "power"): EquipmentItem[] {
    const hero = this.save.hero;
    const compatible = hero.inventory.filter((item) =>
      item.allowedClasses === "all" || item.allowedClasses.includes(hero.classId));
    let preferredSetId: string | undefined;

    if (mode === "set") {
      const candidates = EQUIPMENT_SETS
        .map((set) => {
          const items = compatible.filter((item) => item.setId === set.id);
          const slots = new Set(items.map((item) => item.slot)).size;
          const power = items.reduce((sum, item) => sum + itemPower(item), 0);
          return { id: set.id, slots, power };
        })
        .filter((set) => set.slots > 0)
        .sort((a, b) => b.slots - a.slots || b.power - a.power);
      preferredSetId = candidates[0]?.id;
    }

    const equipped: EquipmentItem[] = [];
    const slots: EquipmentSlot[] = ["weapon", "offhand", "head", "chest", "hands", "feet"];
    slots.forEach((slot) => {
      const inSlot = compatible.filter((item) => item.slot === slot);
      const preferred = preferredSetId ? inSlot.filter((item) => item.setId === preferredSetId) : [];
      const pool = preferred.length > 0 ? preferred : inSlot;
      const best = [...pool].sort((a, b) => itemPower(b) - itemPower(a) || b.level - a.level)[0];
      if (!best) return;
      hero.equipped[slot] = best.id;
      equipped.push(best);
    });
    return equipped;
  }

  public setAutoEquipBest(enabled: boolean): void {
    this.save.hero.autoEquipBest = enabled;
    if (enabled) this.equipBest();
  }

  public setAutoSelectSkills(enabled: boolean): void {
    this.save.hero.autoSelectSkills = enabled;
  }

  public setSelectedSkills(skillIds: string[]): SkillDefinition[] {
    const hero = this.save.hero;
    const equippedIds = new Set(Object.values(hero.equipped));
    const available = unlockedSkills(hero.classId, hero.level, hero.inventory.filter((item) => equippedIds.has(item.id)));
    const availableById = new Map(available.map((skill) => [skill.id, skill]));
    const selected = skillIds
      .filter((id, index, values) => values.indexOf(id) === index && availableById.has(id))
      .slice(0, MAX_ACTIVE_SKILLS);
    hero.selectedSkillIds = selected;
    return selected.map((id) => availableById.get(id)!);
  }

  public setCombatMode(mode: "auto" | "manual"): void {
    this.save.hero.combatMode = mode;
  }

  public classChangeAvailability(): ActivityAvailability {
    const hero = this.save.hero;
    const finalArenaIndex = ARENAS.length - 1;
    if (hero.highestArena < finalArenaIndex || (hero.arenaWins[finalArenaIndex] ?? 0) < 1) {
      return { unlocked: false, reason: `Смена класса откроется после чемпионства на арене «${ARENAS[finalArenaIndex].name}».` };
    }
    if (hero.gold < CLASS_CHANGE_GOLD_COST) return { unlocked: false, reason: `Нужно ${CLASS_CHANGE_GOLD_COST.toLocaleString("ru-RU")} монет.` };
    if (hero.temperingMarks < CLASS_CHANGE_MARK_COST) return { unlocked: false, reason: `Нужно печатей закалки: ${CLASS_CHANGE_MARK_COST}.` };
    return { unlocked: true, reason: `Стоимость: ${CLASS_CHANGE_GOLD_COST.toLocaleString("ru-RU")} ¤ и ${CLASS_CHANGE_MARK_COST} печатей.` };
  }

  public changeHeroClass(classId: HeroClass): EquipmentItem[] {
    const hero = this.save.hero;
    if (classId === hero.classId) throw new Error("Этот класс уже выбран.");
    const availability = this.classChangeAvailability();
    if (!availability.unlocked) throw new Error(availability.reason);
    hero.gold -= CLASS_CHANGE_GOLD_COST;
    hero.temperingMarks -= CLASS_CHANGE_MARK_COST;
    hero.classId = classId;
    hero.classChanges += 1;
    hero.selectedSkillIds = [];
    (Object.keys(hero.equipped) as EquipmentSlot[]).forEach((slot) => {
      const item = hero.inventory.find((candidate) => candidate.id === hero.equipped[slot]);
      if (item && item.allowedClasses !== "all" && !item.allowedClasses.includes(classId)) delete hero.equipped[slot];
    });
    createStarterItems(classId).forEach((starter) => {
      const hasCompatibleSlot = hero.inventory.some((item) => item.slot === starter.slot
        && (item.allowedClasses === "all" || item.allowedClasses.includes(classId)));
      if (!hasCompatibleSlot) this.addItem(starter);
    });
    const equipped = this.equipBest();
    this.event("system", `${hero.name} сменил класс и теперь следует пути «${CLASS_DEFINITIONS[classId].name}».`);
    return equipped;
  }

  public unequip(slot: EquipmentSlot): void {
    delete this.save.hero.equipped[slot];
  }

  public sell(itemId: string): number {
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item) return 0;
    if (Object.values(this.save.hero.equipped).includes(itemId)) throw new Error("Сначала снимите предмет.");
    const value = Math.max(1, Math.round(item.price * 0.45));
    this.save.hero.inventory = this.save.hero.inventory.filter((candidate) => candidate.id !== itemId);
    this.save.hero.gold += value;
    return value;
  }

  public buy(index: number): EquipmentItem {
    const offer = this.save.shopOffers[index];
    if (!offer || offer.sold) throw new Error("Предмет уже продан.");
    if (this.save.hero.gold < offer.item.price) throw new Error("Недостаточно монет.");
    this.save.hero.gold -= offer.item.price;
    offer.sold = true;
    this.addItem(offer.item);
    return offer.item;
  }

  public upgradeCost(itemId: string): number {
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Предмет не найден.");
    const costs = [1, 2, 3, 5, 8];
    return costs[item.enhancement ?? 0] ?? 0;
  }

  public upgradeItem(itemId: string): EquipmentItem {
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Предмет не найден.");
    const current = item.enhancement ?? 0;
    if (current >= 5) throw new Error("Предмет уже достиг максимальной закалки.");
    const cost = this.upgradeCost(itemId);
    if (this.save.hero.temperingMarks < cost) throw new Error(`Нужно печатей закалки: ${cost}.`);
    this.save.hero.temperingMarks -= cost;
    item.enhancement = current + 1;
    item.level += 1;
    item.stats = Object.fromEntries(Object.entries(item.stats).map(([stat, value]) => [stat, Math.max(Number(value) + 1, Math.ceil(Number(value) * 1.08))]));
    item.price = calculateItemPrice(item.level, item.rarity);
    this.event("loot", `${item.name} улучшен в кузнице до +${item.enhancement}.`);
    return item;
  }

  public leaderboard(): LeaderboardEntry[] {
    return this.leaderboardAll().slice(0, 100);
  }

  public heroRank(): number {
    return this.leaderboardAll().findIndex((entry) => entry.id === "hero") + 1;
  }

  private leaderboardAll(): LeaderboardEntry[] {
    const hero = this.save.hero;
    const championships = hero.arenaWins.reduce((total, wins) => total + wins, 0);
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    return [
      ...(!eliteIds.has("hero") ? [{ id: hero.id, name: hero.name, classId: hero.classId, level: hero.level, arenaIndex: hero.highestArena, rating: hero.rating, tournamentWins: championships, wins: hero.wins, losses: hero.losses, kills: hero.kills, isHero: true }] : []),
      ...this.save.enemies.filter((enemy) => enemy.alive && !eliteIds.has(enemy.id)).map((enemy) => ({
        id: enemy.id, name: enemy.name, classId: enemy.classId, level: enemy.level,
        arenaIndex: enemy.arenaIndex, rating: enemy.rating, tournamentWins: enemy.tournamentWins,
        wins: enemy.wins, losses: enemy.losses, kills: enemy.kills, isHero: false,
      })),
    ].sort((a, b) => b.rating - a.rating || b.tournamentWins - a.tournamentWins || b.level - a.level);
  }

  private fighterById(id: string): HeroProfile | EnemyProfile | undefined {
    return id === "hero" ? this.save.hero : this.enemyById(id);
  }

  private enemyById(id: string): EnemyProfile | undefined {
    return this.save.enemies.find((enemy) => enemy.id === id && enemy.alive);
  }

  private leaderboardEntry(id: string, elite = false): LeaderboardEntry | undefined {
    if (id === "hero") {
      const hero = this.save.hero;
      return { id, name: hero.name, classId: hero.classId, level: hero.level, arenaIndex: hero.highestArena,
        rating: elite ? (this.save.eliteRatings[id] ?? hero.rating) : hero.rating,
        tournamentWins: hero.arenaWins.reduce((sum, wins) => sum + wins, 0) + hero.crownLeagueWins,
        wins: hero.wins, losses: hero.losses, kills: hero.kills, isHero: true };
    }
    const enemy = this.enemyById(id);
    if (!enemy) return undefined;
    return { id, name: enemy.name, classId: enemy.classId, level: enemy.level, arenaIndex: enemy.arenaIndex,
      rating: elite ? (this.save.eliteRatings[id] ?? enemy.rating) : enemy.rating,
      tournamentWins: enemy.tournamentWins + (this.save.eliteCrownWins[id] ?? 0), wins: enemy.wins,
      losses: enemy.losses, kills: enemy.kills, isHero: false };
  }

  private ensureEliteLeague(): void {
    const finalArenaIndex = ARENAS.length - 1;
    const valid = new Set(this.save.enemies.filter((enemy) => enemy.alive).map((enemy) => enemy.id));
    if (this.save.eliteLeagueMemberIds.includes("hero")) valid.add("hero");
    this.save.eliteLeagueMemberIds = this.save.eliteLeagueMemberIds
      .filter((id, index, values) => valid.has(id) && values.indexOf(id) === index)
      .slice(0, ELITE_SIZE);

    const current = new Set(this.save.eliteLeagueMemberIds);
    let eligible = this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === finalArenaIndex && enemy.tournamentWins > 0 && !current.has(enemy.id));
    while (this.save.eliteLeagueMemberIds.length + eligible.length < ELITE_SIZE) {
      const recruit = this.createEnemy(finalArenaIndex);
      recruit.tournamentWins = Math.max(1, recruit.tournamentWins);
      recruit.rating = this.enemyWorldRating(recruit);
      this.save.enemies.push(recruit); eligible.push(recruit);
    }
    eligible.sort((a, b) => (this.enemyPower(b) + b.rating) - (this.enemyPower(a) + a.rating));
    this.save.eliteLeagueMemberIds.push(...eligible.slice(0, ELITE_SIZE - this.save.eliteLeagueMemberIds.length).map((enemy) => enemy.id));
    this.save.eliteLeagueMemberIds.forEach((id, index) => {
      const fighter = this.fighterById(id);
      this.save.eliteRatings[id] ??= 6200 - index * 45 + (fighter ? Math.round((fighter.level + (id === "hero" ? this.heroPower() : this.enemyPower(fighter as EnemyProfile))) / 8) : 0);
      this.save.eliteCrownWins[id] ??= 0;
    });
    this.syncCrownSet();
  }

  private adjustEliteRating(id: string, amount: number): void {
    if (!this.save.eliteLeagueMemberIds.includes(id) && id !== "hero") return;
    const fallback = id === "hero" ? this.save.hero.rating : this.enemyById(id)?.rating ?? 1000;
    this.save.eliteRatings[id] = Math.max(1000, (this.save.eliteRatings[id] ?? fallback) + amount);
  }

  private sortEliteByRating(): void {
    this.save.eliteLeagueMemberIds.sort((first, second) =>
      (this.save.eliteRatings[second] ?? 0) - (this.save.eliteRatings[first] ?? 0));
  }

  private swapEliteMembers(winnerId: string, loserId: string): void {
    const winnerIndex = this.save.eliteLeagueMemberIds.indexOf(winnerId);
    const loserIndex = this.save.eliteLeagueMemberIds.indexOf(loserId);
    if (winnerIndex < 0 || loserIndex < 0) return;
    [this.save.eliteLeagueMemberIds[winnerIndex], this.save.eliteLeagueMemberIds[loserIndex]] =
      [this.save.eliteLeagueMemberIds[loserIndex], this.save.eliteLeagueMemberIds[winnerIndex]];
    const high = Math.max(this.save.eliteRatings[winnerId] ?? 0, this.save.eliteRatings[loserId] ?? 0) + 1;
    this.save.eliteRatings[winnerId] = high;
    this.save.eliteRatings[loserId] = Math.max(1000, high - 12);
  }

  private promoteIntoElite(id: string): void {
    if (this.save.eliteLeagueMemberIds.includes(id)) return;
    const demoted = this.save.eliteLeagueMemberIds.pop();
    if (demoted) {
      delete this.save.eliteRatings[demoted]; delete this.save.eliteCrownWins[demoted];
      this.event("promotion", `${this.fighterById(demoted)?.name ?? "Последний участник"} покинул элиту и вернулся в обычный рейтинг.`);
    }
    const tailRating = this.save.eliteLeagueMemberIds.length
      ? this.save.eliteRatings[this.save.eliteLeagueMemberIds[this.save.eliteLeagueMemberIds.length - 1]] ?? 4200
      : 4200;
    this.save.eliteLeagueMemberIds.push(id);
    this.save.eliteRatings[id] = Math.max(1000, tailRating - 1);
    this.save.eliteCrownWins[id] ??= 0;
    this.event("promotion", `${this.fighterById(id)?.name ?? "Претендент"} выиграл квалификацию и вошёл в элитную тридцатку.`);
  }

  private syncCrownSet(): void {
    const leaderId = this.save.eliteLeagueMemberIds[0];
    if (!leaderId) return;
    const templateIds = new Set(EQUIPMENT_SETS.find((set) => set.id === CROWN_SET_ID)?.pieces ?? []);
    const strip = (fighter: HeroProfile | EnemyProfile) => {
      const removed = new Set<string>();
      const equipment = fighter.id === "hero" ? (fighter as HeroProfile).inventory : (fighter as EnemyProfile).equipment;
      equipment.filter((item) => templateIds.has(item.templateId)).forEach((item) => removed.add(item.id));
      if (fighter.id === leaderId) return;
      if (fighter.id === "hero") (fighter as HeroProfile).inventory = equipment.filter((item) => !removed.has(item.id));
      else (fighter as EnemyProfile).equipment = equipment.filter((item) => !removed.has(item.id));
      (Object.keys(fighter.equipped) as EquipmentSlot[]).forEach((slot) => {
        if (removed.has(fighter.equipped[slot]!)) delete fighter.equipped[slot];
      });
    };
    strip(this.save.hero); this.save.enemies.forEach(strip);
    const leader = this.fighterById(leaderId);
    if (!leader) return;
    const owned = leader.id === "hero" ? (leader as HeroProfile).inventory : (leader as EnemyProfile).equipment;
    templateIds.forEach((templateId) => {
      if (owned.some((item) => item.templateId === templateId)) return;
      const item = createItem(leader.level + 4, { classId: leader.classId, templateId, rarity: "mythic" });
      owned.push(item); leader.equipped[item.slot] = item.id;
      if (leader.id === "hero" && !this.save.discoveredItems.includes(templateId)) this.save.discoveredItems.push(templateId);
    });
  }

  private recalculateHeroRating(): void {
    const hero = this.save.hero;
    const championships = hero.arenaWins.reduce((sum, count, index) => sum + count * (45 + index * 18), 0);
    const hasProvedCurrentArena = (hero.arenaWins[hero.highestArena] ?? 0) > 0;
    const provenArena = Math.max(0, hero.highestArena - (hasProvedCurrentArena ? 0 : 1));
    hero.rating = 1000 + provenArena * 650 + Math.min(560, hero.tournamentMatchWins * 12)
      + Math.min(360, championships) + Math.min(120, hero.level * 4) - Math.min(180, hero.tournamentMatchLosses * 8);
    hero.rating += Math.min(900, hero.crownLeaguePoints * 15);
  }

  private enemyWorldRating(enemy: EnemyProfile): number {
    return 1000 + enemy.arenaIndex * 650 + Math.min(620, enemy.tournamentWins * 12) + Math.min(160, enemy.level * 4);
  }

  private addItem(item: EquipmentItem): void {
    this.save.hero.inventory.push(item);
    if (!this.save.discoveredItems.includes(item.templateId)) this.save.discoveredItems.push(item.templateId);
    const compatible = item.allowedClasses === "all" || item.allowedClasses.includes(this.save.hero.classId);
    if (!this.save.hero.autoEquipBest || !compatible) return;
    const currentId = this.save.hero.equipped[item.slot];
    const current = this.save.hero.inventory.find((candidate) => candidate.id === currentId);
    if (!current || itemPower(item) > itemPower(current)) this.save.hero.equipped[item.slot] = item.id;
  }

  private recordHeroEncounter(enemy: EnemyProfile, heroWon: boolean, killed = false): void {
    const hero = this.save.hero;
    const record = hero.rivalries[enemy.id] ?? {
      enemyId: enemy.id, name: enemy.name, classId: enemy.classId,
      wins: 0, losses: 0, killed: false, lastMetDay: this.save.worldDay,
    };
    record.name = enemy.name;
    record.classId = enemy.classId;
    record.lastMetDay = this.save.worldDay;
    if (heroWon) record.wins += 1;
    else record.losses += 1;
    if (killed && !record.killed) {
      record.killed = true;
      hero.kills += 1;
    }
    hero.rivalries[enemy.id] = record;
  }

  private cleanupVisualTestCatalog(): void {
    this.save.migrations ??= [];
    const visualItems = this.save.hero.inventory.filter((item) => item.isVisualTestItem);

    if (visualItems.length > 0) {
      const visualItemIds = new Set(visualItems.map((item) => item.id));
      const pollutedTemplateIds = new Set(visualItems.map((item) => item.templateId));
      this.save.hero.inventory = this.save.hero.inventory.filter((item) => !visualItemIds.has(item.id));

      (Object.keys(this.save.hero.equipped) as EquipmentSlot[]).forEach((slot) => {
        const equippedId = this.save.hero.equipped[slot];
        if (!equippedId || !visualItemIds.has(equippedId)) return;
        delete this.save.hero.equipped[slot];
        const replacement = this.save.hero.inventory.find((item) =>
          item.slot === slot
          && (item.allowedClasses === "all" || item.allowedClasses.includes(this.save.hero.classId)));
        if (replacement) this.save.hero.equipped[slot] = replacement.id;
      });

      const legitimatelyOwnedTemplates = new Set(this.save.hero.inventory.map((item) => item.templateId));
      this.save.discoveredItems = this.save.discoveredItems.filter((templateId) =>
        !pollutedTemplateIds.has(templateId) || legitimatelyOwnedTemplates.has(templateId));
    }

    if (!this.save.migrations.includes(VISUAL_TEST_CATALOG_CLEANUP_MIGRATION)) {
      this.save.migrations.push(VISUAL_TEST_CATALOG_CLEANUP_MIGRATION);
    }
  }

  private gainHeroExperience(amount: number, levelCap = Number.POSITIVE_INFINITY): number {
    const hero = this.save.hero;
    if (hero.level >= levelCap) {
      hero.experience = Math.min(hero.experience + amount, Math.max(0, hero.experienceToNextLevel - 1));
      return 0;
    }
    hero.experience += amount;
    let levels = 0;
    while (hero.experience >= hero.experienceToNextLevel && hero.level < levelCap) {
      hero.experience -= hero.experienceToNextLevel;
      hero.level += 1; levels += 1;
      hero.experienceToNextLevel = Math.round(hero.experienceToNextLevel * 1.28);
    }
    if (hero.level >= levelCap) hero.experience = Math.min(hero.experience, Math.max(0, hero.experienceToNextLevel - 1));
    return levels;
  }

  private createEnemy(arenaIndex: number): EnemyProfile {
    const arena = ARENAS[arenaIndex];
    const classId = pick(classes);
    const level = randomInt(arena.enemyLevel[0], arena.enemyLevel[1]);
    const gearCount = Math.min(6, 2 + Math.floor(level / 5));
    const equipment = Array.from({ length: gearCount }, (_, index) => createItem(level, {
      classId, slot: (["weapon", "offhand", "chest", "head", "hands", "feet"] as EquipmentSlot[])[index],
      minimumRarity: arenaIndex >= 4 ? "epic" : arenaIndex >= 2 ? "rare" : "common",
    }));
    const equipped: EnemyProfile["equipped"] = {};
    equipment.forEach((item) => { equipped[item.slot] = item.id; });
    const name = `${pick(enemyNames)} ${String.fromCharCode(65 + randomInt(0, 20))}.`;
    const enemy: EnemyProfile = {
      id: uid("enemy"), name, title: pick(enemyTitles), origin: pick(enemyOrigins), classId, level,
      experience: randomInt(0, 80 + level * 20), rating: 0, wins: randomInt(arenaIndex * 3, arenaIndex * 9 + 5),
      tournamentWins: randomInt(arenaIndex * 4, arenaIndex * 12 + 6), kills: randomInt(0, Math.max(0, arenaIndex * 2)),
      losses: randomInt(0, 5), arenaIndex, arenaWins: randomInt(0, Math.max(1, arenaIndex)), alive: true,
      equipment, equipped, history: [`Начал путь: ${arena.name}.`],
    };
    enemy.rating = this.enemyWorldRating(enemy);
    return enemy;
  }

  private createDungeonEnemy(levels: [number, number], dungeonName: string): EnemyProfile {
    const enemy = this.createEnemy(Math.min(this.save.hero.highestArena, ARENAS.length - 1));
    enemy.id = uid("dungeon"); enemy.level = randomInt(levels[0], levels[1]); enemy.name = `Хранитель: ${pick(enemyNames)}`;
    enemy.title = `страж локации «${dungeonName}»`; enemy.rating += 100; return enemy;
  }

  private matchDuelEnemy(tier: DuelDefinition, arenaIndex: number): EnemyProfile {
    const [minOffset, maxOffset] = tier.enemyLevelOffset;
    const minLevel = Math.max(1, this.save.hero.level + minOffset);
    const maxLevel = Math.max(minLevel, this.save.hero.level + maxOffset);
    const localFighters = this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex);
    const eligible = localFighters.filter((enemy) => enemy.level >= minLevel && enemy.level <= maxLevel);
    const pool = eligible.length > 0 ? eligible : localFighters;
    if (pool.length === 0) {
      const enemy = this.createEnemy(arenaIndex);
      this.save.enemies.push(enemy);
      return enemy;
    }
    const heroPower = this.heroPower();
    const closest = [...pool].sort((a, b) => Math.abs(this.enemyPower(a) - heroPower) - Math.abs(this.enemyPower(b) - heroPower));
    return closest[randomInt(0, Math.min(4, closest.length - 1))];
  }

  private createBossEnemy(boss: BossDefinition): EnemyProfile {
    const enemy = this.createEnemy(Math.min(boss.requiredArena, ARENAS.length - 1));
    enemy.id = `boss-${boss.id}`; enemy.name = boss.name; enemy.classId = boss.classId; enemy.level = boss.level;
    enemy.title = "уникальный дуэльный противник"; enemy.origin = boss.place;
    enemy.equipment = (["weapon", "offhand", "head", "chest", "hands", "feet"] as EquipmentSlot[]).map((slot) =>
      createItem(boss.level + 4, { classId: boss.classId, slot, rarity: boss.id === "nameless-duke" ? "mythic" : "legendary" }));
    enemy.equipped = {}; enemy.equipment.forEach((item) => { enemy.equipped[item.slot] = item.id; });
    return enemy;
  }

  private duelAvailability(duel: DuelDefinition): ActivityAvailability {
    const hero = this.save.hero;
    if (hero.level < duel.minLevel) return { unlocked: false, reason: `Требуется ${duel.minLevel} уровень.` };
    if (hero.duelWins < duel.requiredDuelWins) return { unlocked: false, reason: `Нужно побед в дуэлях: ${hero.duelWins}/${duel.requiredDuelWins}.` };
    if (hero.highestArena < duel.requiredArena) return { unlocked: false, reason: `Нужно открыть арену «${ARENAS[duel.requiredArena].name}».` };
    return { unlocked: true, reason: `Подбор: уровень героя ${duel.enemyLevelOffset[0] >= 0 ? "+" : ""}${duel.enemyLevelOffset[0]}…+${duel.enemyLevelOffset[1]}.` };
  }

  private bossAvailability(boss: BossDefinition): ActivityAvailability {
    const hero = this.save.hero;
    if (this.save.defeatedBosses.includes(boss.id)) return { unlocked: false, reason: "Побеждён. Повторный бой невозможен." };
    if (hero.level < boss.requiredLevel) return { unlocked: false, reason: `Требуется ${boss.requiredLevel} уровень.` };
    if (hero.duelWins < boss.requiredDuelWins) return { unlocked: false, reason: `Нужно побед в дуэлях: ${hero.duelWins}/${boss.requiredDuelWins}.` };
    if (hero.highestArena < boss.requiredArena) return { unlocked: false, reason: `Нужно открыть арену «${ARENAS[boss.requiredArena].name}».` };
    if (boss.requiredDungeon && !this.save.dungeonClears[boss.requiredDungeon]) {
      return { unlocked: false, reason: `Нужно пройти данж «${DUNGEONS.find((dungeon) => dungeon.id === boss.requiredDungeon)?.name}».` };
    }
    if (boss.requiredBoss && !this.save.defeatedBosses.includes(boss.requiredBoss)) {
      return { unlocked: false, reason: `Сначала победите: ${DUEL_BOSSES.find((candidate) => candidate.id === boss.requiredBoss)?.name}.` };
    }
    return { unlocked: true, reason: `Одноразовая награда: уникальный предмет. Уровень босса ${boss.level}.` };
  }

  private enemyPower(enemy: EnemyProfile): number {
    return enemy.level * 35 + equipmentScore(enemy.equipment.filter((item) => Object.values(enemy.equipped).includes(item.id)));
  }

  private heroPower(): number {
    return this.save.hero.level * 35 + equipmentScore(this.save.hero.inventory.filter((item) => Object.values(this.save.hero.equipped).includes(item.id)));
  }

  private shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  private updateEnemyAfterPlayerBattle(enemy: EnemyProfile, heroWon: boolean, died: boolean): void {
    if (heroWon) {
      enemy.losses += 1;
      if (died) {
        enemy.alive = false; enemy.history.push(`Погиб в бою с ${this.save.hero.name} на арене «${ARENAS[enemy.arenaIndex].name}».`);
        this.event("death", `${enemy.name}, когда-то ${enemy.title}, погиб и больше не появится в мире.`);
      } else enemy.history.push(`Проиграл ${this.save.hero.name}, но выжил.`);
    } else {
      enemy.wins += 1; enemy.arenaWins += 1; enemy.experience += 45;
      enemy.history.push(`Победил главного героя ${this.save.hero.name}.`); this.progressEnemy(enemy);
    }
    enemy.rating = this.enemyWorldRating(enemy);
  }

  private simulateWorldFights(count: number, recordEvents: boolean, fixedArenaIndex?: number): void {
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    for (let index = 0; index < count; index += 1) {
      const arenaIndex = fixedArenaIndex ?? randomInt(0, ARENAS.length - 1);
      const pool = this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !eliteIds.has(enemy.id));
      if (pool.length < 2) continue;
      const first = pick(pool); let second = pick(pool);
      while (second.id === first.id) second = pick(pool);
      const firstChance = this.enemyPower(first) / (this.enemyPower(first) + this.enemyPower(second));
      const winner = Math.random() < firstChance ? first : second;
      const loser = winner.id === first.id ? second : first;
      winner.wins += 1; winner.arenaWins += 1; winner.experience += 70 + arenaIndex * 22;
      loser.losses += 1;
      if (recordEvents) this.event("battle", `${winner.name} победил ${loser.name} на арене «${ARENAS[arenaIndex].name}».`);
      const lethal = Math.random() < ARENAS[arenaIndex].lethalChance * 0.45;
      if (lethal) {
        winner.kills += 1;
        loser.alive = false; loser.history.push(`Погиб в фоновом бою против ${winner.name}.`);
        if (recordEvents) this.event("death", `${winner.name} смертельно победил ${loser.name} на арене «${ARENAS[arenaIndex].name}».`);
      }
      if (Math.random() < 0.24) {
        const item = createItem(winner.level, { classId: winner.classId, minimumRarity: arenaIndex >= 3 ? "rare" : "common" });
        winner.equipment.push(item); winner.equipped[item.slot] = item.id;
        if (recordEvents) this.event("loot", `${winner.name} получил предмет «${item.name}» после боя.`);
      }
      this.progressEnemy(winner, recordEvents);
      winner.rating = this.enemyWorldRating(winner);
    }
  }

  private simulateDailyWorld(skipTournamentArenaId?: string): void {
    this.ensureEliteLeague();
    ARENAS.forEach((arena, arenaIndex) => {
      this.simulateWorldFights(10 + arenaIndex * 3, true, arenaIndex);
      if (arena.id !== skipTournamentArenaId && this.save.worldDay % arena.tournamentInterval === 0) this.simulateBackgroundTournament(arenaIndex);
    });
    DUNGEONS.forEach((dungeon) => {
      const arenaIndex = Math.min(ARENAS.length - 1, dungeon.requiredArena);
      const eliteIds = new Set(this.save.eliteLeagueMemberIds);
      const pool = this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !eliteIds.has(enemy.id));
      if (pool.length === 0) return;
      const explorer = pick(pool);
      const succeeded = Math.random() < 0.68;
      if (succeeded) {
        explorer.experience += dungeon.rewardExperience * 0.7;
        const item = createItem(explorer.level, { classId: explorer.classId, minimumRarity: dungeon.minimumRarity });
        explorer.equipment.push(item); explorer.equipped[item.slot] = item.id;
        this.event("dungeon", `${explorer.name} вернулся из данжа «${dungeon.name}» с предметом «${item.name}».`);
        this.progressEnemy(explorer, true);
      } else {
        this.event("dungeon", `${explorer.name} не смог пройти данж «${dungeon.name}».`);
      }
    });
    this.simulateEliteDay();
    this.ensurePopulations();
  }

  private simulateBackgroundTournament(arenaIndex: number): void {
    const arena = ARENAS[arenaIndex];
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    const pool = this.shuffle(this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !eliteIds.has(enemy.id))).slice(0, arena.participants);
    if (pool.length < 8) return;
    let contestants = pool;
    while (contestants.length > 1) {
      const winners: EnemyProfile[] = [];
      for (let cursor = 0; cursor < contestants.length; cursor += 2) {
        const first = contestants[cursor]; const second = contestants[cursor + 1];
        if (!second) { winners.push(first); continue; }
        const chance = this.enemyPower(first) / (this.enemyPower(first) + this.enemyPower(second));
        const winner = Math.random() < chance ? first : second;
        const loser = winner.id === first.id ? second : first;
        winner.wins += 1; winner.arenaWins += 1; winner.experience += 55 + arenaIndex * 18;
        loser.losses += 1; winners.push(winner);
      }
      contestants = winners;
    }
    const champion = contestants[0];
    champion.tournamentWins += 1;
    champion.rating = this.enemyWorldRating(champion);
    const prize = createItem(champion.level, { classId: champion.classId, minimumRarity: arenaIndex >= 4 ? "legendary" : arenaIndex >= 2 ? "epic" : "rare" });
    champion.equipment.push(prize); champion.equipped[prize.slot] = prize.id;
    champion.history.push(`Стал чемпионом турнира «${arena.name}» в день ${this.save.worldDay}.`);
    this.progressEnemy(champion, true);
    this.event("tournament", `Фоновый турнир «${arena.name}» завершён: ${champion.name} победил сетку из ${pool.length} бойцов.`);
  }

  private simulateEliteDay(): void {
    this.ensureEliteLeague();
    const heroRank = this.heroEliteRank();
    if (heroRank && heroRank <= LEGEND_COUNT && !this.save.pendingEliteChallengeId
      && this.save.lastLegendHuntDay !== this.save.worldDay && Math.random() < 0.08) {
      const challengerId = this.save.eliteLeagueMemberIds[Math.min(ELITE_SIZE - 1, heroRank)];
      if (challengerId && challengerId !== "hero") {
        this.save.pendingEliteChallengeId = challengerId;
        this.event("battle", `${this.enemyById(challengerId)?.name ?? "Претендент"} вызвал ${this.save.hero.name} на защиту титула легенды.`);
      }
    } else if (Math.random() < 0.16) {
      const defenderIndex = randomInt(0, LEGEND_COUNT - 1);
      const challengerIndex = defenderIndex + 1;
      const defenderId = this.save.eliteLeagueMemberIds[defenderIndex];
      const challengerId = this.save.eliteLeagueMemberIds[challengerIndex];
      if (defenderId && challengerId && defenderId !== "hero" && challengerId !== "hero") {
        const defender = this.enemyById(defenderId); const challenger = this.enemyById(challengerId);
        if (defender && challenger) {
          const chance = this.enemyPower(challenger) / (this.enemyPower(challenger) + this.enemyPower(defender));
          if (Math.random() < chance) {
            this.swapEliteMembers(challenger.id, defender.id);
            this.event("battle", `${challenger.name} победил легенду ${defender.name} и занял место #${defenderIndex + 1}.`);
          }
        }
      }
    }

    const lastLeague = this.save.lastCrownLeagueDay ?? 0;
    if (this.save.worldDay % CROWN_LEAGUE_INTERVAL !== 0 || this.save.worldDay === lastLeague) {
      this.syncCrownSet(); return;
    }
    const elite = new Set(this.save.eliteLeagueMemberIds);
    const candidate = this.save.enemies
      .filter((enemy) => enemy.alive && !elite.has(enemy.id) && enemy.arenaIndex === ARENAS.length - 1 && enemy.tournamentWins > 0)
      .sort((a, b) => b.rating - a.rating || this.enemyPower(b) - this.enemyPower(a))[0];
    if (!candidate) return;
    let contestants = this.shuffle([candidate, ...this.save.eliteLeagueMemberIds.filter((id) => id !== "hero").slice(0, ELITE_SIZE - 1)
      .map((id) => this.enemyById(id)).filter((enemy): enemy is EnemyProfile => Boolean(enemy))]);
    if (contestants.length !== ELITE_SIZE) return;
    while (contestants.length > 1) {
      const winners: EnemyProfile[] = [];
      for (let cursor = 0; cursor < contestants.length; cursor += 2) {
        const first = contestants[cursor]; const second = contestants[cursor + 1];
        if (!second) { winners.push(first); continue; }
        const chance = this.enemyPower(first) / (this.enemyPower(first) + this.enemyPower(second));
        const winner = Math.random() < chance ? first : second;
        const loser = winner.id === first.id ? second : first;
        winner.wins += 1; loser.losses += 1; winners.push(winner);
        this.adjustEliteRating(winner.id, 8); this.adjustEliteRating(loser.id, -3);
      }
      contestants = winners;
    }
    const champion = contestants[0];
    champion.tournamentWins += 1;
    this.save.eliteCrownWins[champion.id] = (this.save.eliteCrownWins[champion.id] ?? 0) + 1;
    if (champion.id === candidate.id) this.promoteIntoElite(candidate.id);
    else this.sortEliteByRating();
    this.save.lastCrownLeagueDay = this.save.worldDay;
    this.event("tournament", `Фоновую Лигу короны выиграл ${champion.name}. ${candidate.name} ${champion.id === candidate.id ? "вошёл в элиту" : "остался в обычном рейтинге"}.`);
    this.syncCrownSet();
  }

  private completeDay(skipTournamentArenaId?: string): void {
    this.simulateDailyWorld(skipTournamentArenaId);
    this.save.worldDay += 1;
    this.ensurePopulations();
    this.refreshShopIfNeeded();
    this.save.lastSimulatedAt = Date.now();
    Object.entries(this.save.tournamentRegistrations).forEach(([arenaId, day]) => {
      if (day < this.save.worldDay) {
        const arena = ARENAS.find((candidate) => candidate.id === arenaId);
        this.event("tournament", `${this.save.hero.name} пропустил запись на «${arena?.name ?? arenaId}» в день ${day}.`);
        delete this.save.tournamentRegistrations[arenaId];
      }
    });
  }

  private progressEnemy(enemy: EnemyProfile, recordEvent = true): void {
    while (enemy.experience >= 85 + enemy.level * 28) { enemy.experience -= 85 + enemy.level * 28; enemy.level += 1; }
    const nextArena = ARENAS[enemy.arenaIndex + 1];
    if (nextArena && enemy.arenaWins >= ARENAS[enemy.arenaIndex].winsToAdvance && enemy.level >= nextArena.minLevel) {
      const old = ARENAS[enemy.arenaIndex].name; enemy.arenaIndex += 1; enemy.arenaWins = 0;
      enemy.history.push(`Перешёл с арены «${old}» на «${nextArena.name}».`);
      if (recordEvent) this.event("promotion", `${enemy.name} покинул арену «${old}» и поднялся на «${nextArena.name}».`);
    }
    enemy.rating = this.enemyWorldRating(enemy);
  }

  private ensurePopulations(): void {
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    ARENAS.forEach((_, arenaIndex) => {
      const alive = this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !eliteIds.has(enemy.id)).length;
      for (let index = alive; index < 16; index += 1) this.save.enemies.push(this.createEnemy(arenaIndex));
    });
    if (this.save.enemies.length > 260) {
      const encounteredIds = new Set(Object.keys(this.save.hero.rivalries));
      this.save.eliteLeagueMemberIds.forEach((id) => encounteredIds.add(id));
      const encountered = this.save.enemies.filter((enemy) => encounteredIds.has(enemy.id));
      const retainedIds = new Set(encountered.map((enemy) => enemy.id));
      const population = this.save.enemies
        .filter((enemy) => !retainedIds.has(enemy.id) && (enemy.alive || enemy.history.some((line) => line.includes(this.save.hero.name))))
        .slice(-240);
      this.save.enemies = [...encountered, ...population];
    }
  }

  private refreshShopIfNeeded(): void {
    if (this.save.worldDay - this.save.shopDay >= 2) this.rotateShop();
  }

  private rotateShop(): void {
    const minimum: Rarity = this.save.hero.highestArena >= 4 ? "epic" : this.save.hero.highestArena >= 2 ? "rare" : "common";
    this.save.shopOffers = Array.from({ length: 8 }, () => ({ item: createItem(this.save.hero.level + randomInt(0, 2), { classId: this.save.hero.classId, minimumRarity: Math.random() < 0.35 ? minimum : "common" }), sold: false }));
    this.save.shopDay = this.save.worldDay;
  }

  private event(type: WorldEvent["type"], message: string): void {
    this.save.events.unshift({ id: uid("event"), day: this.save.worldDay, type, message });
    this.save.events = this.save.events.slice(0, 500);
  }
}

export function rarityAtLeast(rarity: Rarity, minimum: Rarity): boolean {
  return RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf(minimum);
}

export function skillById(id: string): SkillDefinition | undefined { return SKILLS.find((skill) => skill.id === id); }
