import type { DungeonNodeKind } from "../dungeons/DungeonRoute";
import {
  ARENAS,
  DUEL_BOSSES,
  DUEL_TIERS,
  DUNGEONS,
  ENDGAME_ACTIVITIES,
  ITEM_TEMPLATES,
} from "../../catalogs/WorldCatalog";
import { createItem, ItemCreationOptions } from "../../factories/ItemFactory";
import { HERO_CLASSES, LEGEND_COUNT } from "../core/WorldGameConfig";
import { WorldRandomStreams } from "../core/WorldRandom";
import {
  BattleReport,
  BossDefinition,
  ContractObjective,
  DailyActivityReport,
  DungeonExpedition,
  EnemyProfile,
  EquipmentItem,
  ExpeditionStepReport,
  GameSave,
  HeroClass,
  PendingBattle,
  PendingBattleFinalization,
  Rarity,
  WorldEvent,
} from "../core/WorldTypes";
import { recordDungeonNodeVisit } from "../dungeons/DungeonRoute";
import {
  expeditionBattleExertion,
  expeditionStaminaAfterBattle,
} from "../dungeons/ExpeditionStamina";
import {
  improveMinimumRarity,
  RewardContext,
  rewardModifiers,
} from "../progression/NewGamePlus";
import {
  applyFactionReputationChange,
  factionDungeonReward,
} from "../world/FactionEconomy";
import { factionModifier } from "../world/FactionSystem";
import { StructuredWorldEventPayload } from "../world/WorldEvents";
import { BattleSession, unlockedSkills } from "./AdvancedBattle";

interface BattleFinalizationServiceHooks {
  requirePendingBattle(): PendingBattle;
  finalizePendingTournamentBattle(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization;
  enemyById(id: string): EnemyProfile | undefined;
  epochRewards(
    baseExperience: number,
    baseGold: number,
    context: RewardContext,
  ): { experience: number; gold: number };
  gainHeroExperience(amount: number, levelCap?: number): number;
  recordNpcDuelWithHero(enemy: EnemyProfile, heroWon: boolean): void;
  recordHeroEncounter(
    enemy: EnemyProfile,
    heroWon: boolean,
    turns: BattleReport["turns"],
    killed?: boolean,
  ): void;
  recordMutationVictory(enemy: EnemyProfile, heroWon: boolean): void;
  advanceContract(objective: ContractObjective): void;
  event(
    type: WorldEvent["type"],
    message: string,
    payload?: StructuredWorldEventPayload,
  ): void;
  completeDay(skipTournamentArenaId?: string): void;
  createRewardItem(
    level: number,
    options: Omit<ItemCreationOptions, "randomSource">,
    targetChanceBonus?: number,
  ): EquipmentItem;
  minimumRewardRarity(rarity: Rarity, context: RewardContext): Rarity;
  controlledDungeonMinimum(dungeonId: string, rarity: Rarity): Rarity;
  addItem(item: EquipmentItem): void;
  eventsSince(cursor?: string): WorldEvent[];
  factionAdjustedReward(
    reward: { experience: number; gold: number },
    modifier: "tournamentReward" | "bossReward" | "contractReward",
    factionId?: string,
  ): { experience: number; gold: number };
  npcExperienceReward(baseExperience: number): number;
  progressEnemy(enemy: EnemyProfile, recordEvent?: boolean): void;
  recordEnemyHistory(enemy: EnemyProfile, message: string): void;
  worldEncounterActivity(
    id: string,
    name: string,
    description: string,
    enemy: EnemyProfile,
    rewardExperience: number,
    rewardGold: number,
  ): BossDefinition;
  swapEliteMembers(winnerId: string, loserId: string): void;
  awardCrownSeason(
    fighterId: string,
    result: "win" | "loss" | "defense" | "champion",
  ): void;
  updateEnemyAfterPlayerBattle(
    enemy: EnemyProfile,
    heroWon: boolean,
    died: boolean,
    arenaMatch?: boolean,
  ): void;
  syncCrownSet(): void;
  heroEliteRank(): number | undefined;
  adjustEliteRating(id: string, amount: number): void;
  consumeExpeditionSupply(expedition: DungeonExpedition): void;
  dungeonDiscovery(dungeonId: string): {
    alternateBossDefeated: boolean;
    dungeonId: string;
    completedRuns: number;
    discoveredNodeIds: string[];
    discoveredClueIds: string[];
    seenEncounterKinds: DungeonNodeKind[];
  };
  finishExpedition(
    retreated: boolean,
    message: string,
    battle?: BattleReport,
  ): ExpeditionStepReport;
}

export class BattleFinalizationService {
  constructor(
    private readonly save: GameSave,
    private readonly random: WorldRandomStreams,
    private readonly hooks: BattleFinalizationServiceHooks,
  ) {}
  public finalizePendingBattle(): PendingBattleFinalization {
    const pending = this.hooks.requirePendingBattle();
    const session = new BattleSession(pending.session);
    if (!session.isFinished) throw new Error("Сначала завершите все ходы боя.");
    if (pending.kind === "dungeon")
      return this.finalizePendingDungeon(pending, session);
    if (pending.kind === "duel")
      return this.finalizePendingDuel(pending, session);
    if (pending.kind === "boss")
      return this.finalizePendingBoss(pending, session);
    if (pending.kind === "legacy-champion")
      return this.finalizePendingLegacyChampion(pending, session);
    if (pending.kind === "world-encounter")
      return this.finalizePendingWorldEncounter(pending, session);
    if (pending.kind === "legend-hunt")
      return this.finalizePendingLegendHunt(pending, session);
    if (pending.kind === "legend-defense")
      return this.finalizePendingLegendDefense(pending, session);
    if (pending.kind === "expedition")
      return this.finalizePendingExpedition(pending, session);
    if (
      pending.kind === "arena-tournament" ||
      pending.kind === "crown-league"
    ) {
      return this.hooks.finalizePendingTournamentBattle(pending, session);
    }
    throw new Error(`Финализация ${pending.kind} ещё не поддержана.`);
  }

  public finalizePendingDuel(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    const tier = DUEL_TIERS.find(
      (candidate) => candidate.id === pending.activityId,
    );
    if (!tier)
      throw new Error("Ступень сохранённой дуэли больше не существует.");
    const enemy = this.hooks.enemyById(pending.enemyId) ?? pending.enemy;
    const combat = session.resolution();
    const heroWon = combat.winnerId === "hero";
    const baseExperience = heroWon
      ? tier.rewardExperience + enemy.level * 4
      : Math.round(tier.rewardExperience * 0.28);
    const baseGold = heroWon ? tier.rewardGold + enemy.level * 4 : 0;
    const { experience, gold } = this.hooks.epochRewards(
      baseExperience,
      baseGold,
      "duel",
    );
    const levelsGained = this.hooks.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    if (heroWon) {
      this.save.hero.wins += 1;
      this.save.hero.duelWins += 1;
    } else {
      this.save.hero.losses += 1;
      this.save.hero.duelLosses += 1;
    }
    this.hooks.recordNpcDuelWithHero(enemy, heroWon);
    this.hooks.recordHeroEncounter(enemy, heroWon, combat.turns);
    this.hooks.recordMutationVictory(enemy, heroWon);
    if (heroWon) this.hooks.advanceContract("duel");
    this.hooks.event(
      "battle",
      `${this.save.hero.name} ${heroWon ? "победил" : "проиграл"} ${enemy.name} в дуэли «${tier.name}».`,
      {
        kind: "battle",
        actorId: "hero",
        actorName: this.save.hero.name,
        targetId: enemy.id,
        targetName: enemy.name,
        outcome: heroWon ? "won" : "lost",
      },
    );
    const battle: BattleReport = {
      activity: tier,
      heroBefore: combat.hero,
      enemyBefore: combat.enemy,
      winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero",
      heroWon,
      enemyDied: false,
      turns: combat.turns,
      analysis: combat.analysis,
      rewards: {
        experience,
        gold,
        levelsGained,
        unlockedSkills: [],
        item: undefined,
      },
      worldEvents: [],
    };
    this.save.pendingBattle = undefined;
    this.hooks.completeDay();
    const result: DailyActivityReport = {
      kind: "duel",
      title: tier.name,
      description: heroWon
        ? "Победа в подобранном по силе поединке."
        : "Поражение без риска для жизни.",
      battle,
      experience,
      gold,
      levelsGained,
    };
    return { status: "complete", battle, result };
  }

  public finalizePendingDungeon(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    const activity = DUNGEONS.find(
      (candidate) => candidate.id === pending.activityId,
    );
    if (!activity)
      throw new Error("Сохранённое подземелье больше не существует.");
    const enemy = pending.enemy;
    const combat = session.resolution();
    const heroWon = combat.winnerId === "hero";
    const baseExperience = heroWon
      ? activity.rewardExperience + enemy.level * 4
      : Math.round(activity.rewardExperience * 0.2);
    const baseGold = heroWon
      ? activity.rewardGold +
        this.random.loot.int(0, Math.round(activity.rewardGold * 0.25))
      : 0;
    const epochReward = this.hooks.epochRewards(
      baseExperience,
      baseGold,
      "dungeon",
    );
    const dungeonController =
      this.save.factionControl?.dungeonControllers?.[activity.id];
    const controlledReward = dungeonController
      ? factionDungeonReward(dungeonController, epochReward)
      : { ...epochReward, raritySteps: 0 };
    const { experience, gold } = controlledReward;
    const levelsGained = this.hooks.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    if (heroWon) {
      this.save.hero.wins += 1;
      this.save.hero.dungeonWins += 1;
    } else {
      this.save.hero.losses += 1;
      this.save.hero.dungeonLosses += 1;
    }
    this.hooks.recordHeroEncounter(enemy, heroWon, combat.turns);
    this.hooks.recordMutationVictory(enemy, heroWon);

    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      item = this.hooks.createRewardItem(
        Math.min(this.save.hero.level + 2, activity.enemyLevel[1] + 1),
        {
          classId: this.save.hero.classId,
          minimumRarity: this.hooks.minimumRewardRarity(
            this.hooks.controlledDungeonMinimum(
              activity.id,
              activity.minimumRarity,
            ),
            "dungeon",
          ),
        },
        factionModifier(this.save.hero.factionReputation, "dungeonLootChance"),
      );
      this.hooks.addItem(item);
      this.hooks.event(
        "loot",
        `${this.save.hero.name} получил предмет: ${item.name}.`,
        {
          kind: "loot",
          fighterId: "hero",
          fighterName: this.save.hero.name,
          itemId: item.id,
          itemName: item.name,
        },
      );
      if (
        activity.requiredArena >= ARENAS.length - 2 &&
        this.random.loot.chance(0.22)
      ) {
        temperingMarks = 1;
        this.save.hero.temperingMarks += 1;
        this.hooks.event(
          "loot",
          `${this.save.hero.name} нашёл редкую печать закалки.`,
        );
      }
      this.save.dungeonClears[activity.id] = this.save.worldDay;
      this.hooks.advanceContract("dungeon");
    }
    this.hooks.event(
      "dungeon",
      `${this.save.hero.name} ${heroWon ? "завершил" : "не прошёл"} вылазку «${activity.name}».`,
      {
        kind: "dungeon",
        fighterId: "hero",
        fighterName: this.save.hero.name,
        dungeonId: activity.id,
        dungeonName: activity.name,
        outcome: heroWon ? "completed" : "retreated",
      },
    );
    const beforeSkillIds = new Set(
      Array.isArray(pending.context?.skillIds)
        ? (pending.context!.skillIds as string[])
        : [],
    );
    const equippedIds = new Set(Object.values(this.save.hero.equipped));
    const unlockedNow = unlockedSkills(
      this.save.hero.classId,
      this.save.hero.level,
      this.save.hero.inventory.filter((candidate) =>
        equippedIds.has(candidate.id),
      ),
      this.save.hero.legacySkillId ? [this.save.hero.legacySkillId] : [],
    ).filter((skill) => !beforeSkillIds.has(skill.id));
    const battle: BattleReport = {
      activity,
      heroBefore: combat.hero,
      enemyBefore: combat.enemy,
      winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero",
      heroWon,
      enemyDied: false,
      turns: combat.turns,
      analysis: combat.analysis,
      rewards: {
        experience,
        gold,
        item,
        levelsGained,
        unlockedSkills: unlockedNow,
        temperingMarks,
      },
      worldEvents: [],
    };
    const eventCursor =
      typeof pending.context?.eventCursor === "string"
        ? pending.context.eventCursor
        : undefined;
    this.save.pendingBattle = undefined;
    this.hooks.completeDay();
    battle.worldEvents = this.hooks.eventsSince(eventCursor);
    return { status: "complete", battle, result: battle };
  }

  public finalizePendingBoss(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    const boss = DUEL_BOSSES.find(
      (candidate) => candidate.id === pending.activityId,
    );
    if (!boss)
      throw new Error("Сохранённый особый противник больше не существует.");
    const enemy = pending.enemy;
    const combat = session.resolution();
    const heroWon = combat.winnerId === "hero";
    const baseExperience = heroWon
      ? boss.rewardExperience
      : Math.round(boss.rewardExperience * 0.16);
    const baseGold = heroWon ? boss.rewardGold : 0;
    const { experience, gold } = this.hooks.factionAdjustedReward(
      this.hooks.epochRewards(baseExperience, baseGold, "boss"),
      "bossReward",
    );
    const levelsGained = this.hooks.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      this.save.hero.wins += 1;
      this.save.hero.bossWins += 1;
      if (!this.save.defeatedBosses.includes(boss.id))
        this.save.defeatedBosses.push(boss.id);
      temperingMarks =
        1 +
        rewardModifiers(
          this.save.legacy.cycle,
          this.save.legacy.activeLawIds,
          "boss",
        ).bonusTemperingMarks;
      this.save.hero.temperingMarks += temperingMarks;
      const rarity = this.hooks.minimumRewardRarity(
        boss.id === "nameless-duke" ? "mythic" : "legendary",
        "boss",
      );
      item = createItem(Math.min(this.save.hero.level + 2, boss.level + 2), {
        classId: this.save.hero.classId,
        templateId: boss.lootTemplateIds[this.save.hero.classId],
        rarity,
        randomSource: this.random.loot,
      });
      this.hooks.addItem(item);
      this.hooks.event(
        "loot",
        `${this.save.hero.name} победил ${boss.name} и получил уникальный предмет «${item.name}».`,
        {
          kind: "loot",
          fighterId: "hero",
          fighterName: this.save.hero.name,
          itemId: item.id,
          itemName: item.name,
        },
      );
      this.hooks.advanceContract("boss");
    } else {
      this.save.hero.losses += 1;
    }
    this.hooks.recordHeroEncounter(enemy, heroWon, combat.turns);
    this.hooks.recordMutationVictory(enemy, heroWon);
    const battle: BattleReport = {
      activity: boss,
      heroBefore: combat.hero,
      enemyBefore: combat.enemy,
      winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero",
      heroWon,
      enemyDied: false,
      turns: combat.turns,
      analysis: combat.analysis,
      rewards: {
        experience,
        gold,
        item,
        levelsGained,
        unlockedSkills: [],
        temperingMarks,
      },
      worldEvents: [],
    };
    this.save.pendingBattle = undefined;
    this.hooks.completeDay();
    const result: DailyActivityReport = {
      kind: "duel",
      title: boss.name,
      description: heroWon
        ? "Уникальный противник побеждён навсегда."
        : "Босс останется доступен для новой попытки.",
      battle,
      experience,
      gold,
      levelsGained,
    };
    return { status: "complete", battle, result };
  }

  public finalizePendingLegacyChampion(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    const cycle =
      typeof pending.context?.cycle === "number"
        ? pending.context.cycle
        : Number(pending.activityId.replace(/^legacy-/, ""));
    const archive = this.save.legacy.archives.find(
      (candidate) => candidate.cycle === cycle,
    );
    if (!archive)
      throw new Error("Архив сохранённого героя эпохи больше не существует.");
    const enemy = pending.enemy;
    const combat = session.resolution();
    const heroWon = combat.winnerId === "hero";
    const baseExperience = heroWon ? 720 + archive.level * 14 : 120;
    const baseGold = heroWon ? 4_800 + archive.rating : 0;
    const { experience, gold } = this.hooks.factionAdjustedReward(
      this.hooks.epochRewards(baseExperience, baseGold, "boss"),
      "bossReward",
    );
    const levelsGained = this.hooks.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      this.save.hero.wins += 1;
      this.save.hero.bossWins += 1;
      if (!this.save.defeatedLegacyCycles.includes(archive.cycle))
        this.save.defeatedLegacyCycles.push(archive.cycle);
      this.save.legacy.seals += 2;
      this.save.legacy.totalSealsEarned += 2;
      temperingMarks =
        2 +
        rewardModifiers(
          this.save.legacy.cycle,
          this.save.legacy.activeLawIds,
          "boss",
        ).bonusTemperingMarks;
      this.save.hero.temperingMarks += temperingMarks;
      item = createItem(Math.min(this.save.hero.level + 2, archive.level), {
        classId: this.save.hero.classId,
        minimumRarity: "mythic",
        randomSource: this.random.loot,
      });
      this.hooks.addItem(item);
      this.hooks.event(
        "loot",
        `${this.save.hero.name} получил реликвию после победы над героем эпохи ${archive.cycle}.`,
        {
          kind: "loot",
          fighterId: "hero",
          fighterName: this.save.hero.name,
          itemId: item.id,
          itemName: item.name,
        },
      );
      this.hooks.advanceContract("boss");
    } else {
      this.save.hero.losses += 1;
    }
    this.hooks.recordHeroEncounter(enemy, heroWon, combat.turns);
    this.hooks.recordMutationVictory(enemy, heroWon);
    const activity: BossDefinition = {
      id: `legacy-${archive.cycle}`,
      kind: "boss",
      name: `${archive.name}, герой эпохи ${archive.cycle}`,
      place: "Зал отзвуков",
      description: "Архивный поединок с завершившим прежнюю летопись героем.",
      classId: archive.classId,
      level: archive.level,
      requiredLevel: 24,
      requiredDuelWins: 0,
      requiredArena: ARENAS.length - 2,
      rewardGold: baseGold,
      rewardExperience: baseExperience,
      lootTemplateIds: Object.fromEntries(
        HERO_CLASSES.map((classId) => [
          classId,
          ITEM_TEMPLATES.find(
            (template) =>
              template.allowedClasses === "all" ||
              template.allowedClasses.includes(classId),
          )!.id,
        ]),
      ) as Record<HeroClass, string>,
      accent: "#715063",
    };
    this.hooks.event(
      "battle",
      heroWon
        ? `${this.save.hero.name} превзошёл ${archive.name}, героя эпохи ${archive.cycle}.`
        : `${archive.name} сохранил своё место в Зале отзвуков.`,
      {
        kind: "battle",
        actorId: "hero",
        actorName: this.save.hero.name,
        targetId: enemy.id,
        targetName: enemy.name,
        outcome: heroWon ? "won" : "lost",
      },
    );
    const battle: BattleReport = {
      activity,
      heroBefore: combat.hero,
      enemyBefore: combat.enemy,
      winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero",
      heroWon,
      enemyDied: false,
      turns: combat.turns,
      analysis: combat.analysis,
      rewards: {
        experience,
        gold,
        item,
        levelsGained,
        unlockedSkills: [],
        temperingMarks,
      },
      worldEvents: [],
    };
    this.save.pendingBattle = undefined;
    this.hooks.completeDay();
    battle.worldEvents = this.hooks.eventsSince(
      typeof pending.context?.eventCursor === "string"
        ? pending.context.eventCursor
        : undefined,
    );
    return { status: "complete", battle, result: battle };
  }

  public finalizePendingWorldEncounter(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    const encounterType =
      pending.context?.encounterType === "future-boss"
        ? "future-boss"
        : "faction-hunter";
    const combat = session.resolution();
    const enemy = pending.enemy;
    const persistentEnemy = this.hooks.enemyById(pending.enemyId);
    const heroWon = combat.winnerId === "hero";
    const bossRecord =
      encounterType === "future-boss"
        ? this.save.npcLife?.futureBosses.find(
            (candidate) => candidate.id === pending.context?.futureBossId,
          )
        : undefined;
    const baseExperience =
      encounterType === "future-boss"
        ? heroWon
          ? 520 + enemy.level * 16
          : 110 + enemy.level * 2
        : heroWon
          ? 210 + enemy.level * 8
          : 65 + enemy.level * 2;
    const baseGold = heroWon
      ? encounterType === "future-boss"
        ? 2_400 + enemy.level * 95
        : 650 + enemy.level * 38
      : 0;
    const { experience, gold } = this.hooks.epochRewards(
      baseExperience,
      baseGold,
      encounterType === "future-boss" ? "boss" : "duel",
    );
    const levelsGained = this.hooks.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      this.save.hero.wins += 1;
      if (encounterType === "future-boss") this.save.hero.bossWins += 1;
      else this.save.hero.duelWins += 1;
      item = this.hooks.createRewardItem(
        Math.min(enemy.level + 2, this.save.hero.level + 4),
        {
          classId: this.save.hero.classId,
          minimumRarity:
            encounterType === "future-boss"
              ? "mythic"
              : this.save.hero.highestArena >= 3
                ? "legendary"
                : "epic",
        },
      );
      temperingMarks = encounterType === "future-boss" ? 2 : 1;
      this.save.hero.temperingMarks += temperingMarks;
      this.hooks.addItem(item);
      this.hooks.advanceContract(
        encounterType === "future-boss" ? "boss" : "duel",
      );
    } else {
      this.save.hero.losses += 1;
      if (encounterType === "faction-hunter") this.save.hero.duelLosses += 1;
    }
    if (persistentEnemy) {
      this.hooks.recordNpcDuelWithHero(persistentEnemy, heroWon);
      if (!heroWon) {
        if (encounterType === "faction-hunter") {
          persistentEnemy.experience += this.hooks.npcExperienceReward(
            60 + this.save.hero.level * 3,
          );
          persistentEnemy.gold =
            (persistentEnemy.gold ?? 0) + 120 + this.save.hero.level * 12;
          this.hooks.progressEnemy(persistentEnemy, false);
        }
      }
      this.hooks.recordEnemyHistory(
        persistentEnemy,
        `${heroWon ? "Проиграл" : "Победил"} ${this.save.hero.name} в личном событии мира.`,
      );
    }
    this.hooks.recordHeroEncounter(
      persistentEnemy ?? enemy,
      heroWon,
      combat.turns,
    );
    if (encounterType === "future-boss" && bossRecord && heroWon) {
      bossRecord.status = "defeated";
      const profile = this.save.npcLife?.profiles[bossRecord.fighterId];
      if (profile) {
        profile.futureBossId = undefined;
        if (profile.career === "future-boss") {
          profile.career =
            persistentEnemy?.legendSinceDay !== undefined ? "legend" : "active";
        }
      }
      this.hooks.event(
        "promotion",
        `${this.save.hero.name} завершил историю особого противника ${bossRecord.name}.`,
      );
    }
    if (encounterType === "faction-hunter") {
      const factionId =
        typeof pending.context?.factionId === "string"
          ? pending.context.factionId
          : enemy.factionId;
      if (factionId) {
        this.save.hero.factionReputation = applyFactionReputationChange(
          this.save.hero.factionReputation,
          factionId,
          heroWon ? 5 : -3,
        ).reputation;
      }
      this.save.pendingFactionHunterId = undefined;
    }
    const activity = this.hooks.worldEncounterActivity(
      pending.activityId,
      encounterType === "future-boss"
        ? (bossRecord?.name ?? enemy.name)
        : `Охотник: ${enemy.name}`,
      encounterType === "future-boss"
        ? (bossRecord?.reason ?? enemy.title)
        : "Расплата за вражду с одной из фракций мира.",
      enemy,
      baseExperience,
      baseGold,
    );
    this.hooks.recordMutationVictory(enemy, heroWon);
    this.hooks.event(
      "battle",
      `${this.save.hero.name} ${heroWon ? "победил" : "проиграл"} в событии «${activity.name}».`,
      {
        kind: "battle",
        actorId: "hero",
        actorName: this.save.hero.name,
        targetId: enemy.id,
        targetName: enemy.name,
        outcome: heroWon ? "won" : "lost",
      },
    );
    const battle: BattleReport = {
      activity,
      heroBefore: combat.hero,
      enemyBefore: combat.enemy,
      winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero",
      heroWon,
      enemyDied: false,
      turns: combat.turns,
      analysis: combat.analysis,
      rewards: {
        experience,
        gold,
        item,
        levelsGained,
        unlockedSkills: [],
        temperingMarks,
      },
      worldEvents: [],
    };
    this.save.pendingBattle = undefined;
    this.hooks.completeDay();
    battle.worldEvents = this.hooks.eventsSince(
      typeof pending.context?.eventCursor === "string"
        ? pending.context.eventCursor
        : undefined,
    );
    return { status: "complete", battle, result: battle };
  }

  public finalizePendingLegendHunt(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    const activity = ENDGAME_ACTIVITIES.find(
      (candidate) => candidate.id === "legend-hunt",
    )!;
    const enemy = this.hooks.enemyById(pending.enemyId);
    if (!enemy)
      throw new Error("Легенда из сохранённого вызова больше не существует.");
    const combat = session.resolution();
    const heroWon = combat.winnerId === "hero";
    const baseExperience = heroWon
      ? activity.rewardExperience + enemy.level * 18
      : Math.round(activity.rewardExperience * 0.18);
    const baseGold = heroWon
      ? activity.rewardGold + enemy.tournamentWins * 120
      : 0;
    const { experience, gold } = this.hooks.factionAdjustedReward(
      this.hooks.epochRewards(baseExperience, baseGold, "legend-hunt"),
      "bossReward",
    );
    const levelsGained = this.hooks.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    this.save.lastLegendHuntDay = this.save.worldDay;
    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      this.save.hero.wins += 1;
      this.save.hero.legendHuntWins += 1;
      this.hooks.swapEliteMembers("hero", enemy.id);
      temperingMarks = 4;
      this.save.hero.temperingMarks += temperingMarks;
      item = this.hooks.createRewardItem(this.save.hero.level + 2, {
        classId: this.save.hero.classId,
        minimumRarity: "mythic",
      });
      this.hooks.addItem(item);
    } else {
      this.save.hero.losses += 1;
    }
    this.hooks.awardCrownSeason(heroWon ? "hero" : enemy.id, "win");
    this.hooks.awardCrownSeason(heroWon ? enemy.id : "hero", "loss");
    this.hooks.recordHeroEncounter(enemy, heroWon, combat.turns);
    this.hooks.recordMutationVictory(enemy, heroWon);
    this.hooks.updateEnemyAfterPlayerBattle(enemy, heroWon, false, false);
    this.hooks.syncCrownSet();
    this.hooks.event(
      "battle",
      `${this.save.hero.name} ${heroWon ? `занял место ${this.hooks.heroEliteRank()} в элите` : "не смог подняться"} после боя с ${enemy.name}.`,
      {
        kind: "battle",
        actorId: "hero",
        actorName: this.save.hero.name,
        targetId: enemy.id,
        targetName: enemy.name,
        outcome: heroWon ? "won" : "lost",
      },
    );
    const battle: BattleReport = {
      activity,
      heroBefore: combat.hero,
      enemyBefore: combat.enemy,
      winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero",
      heroWon,
      enemyDied: false,
      turns: combat.turns,
      analysis: combat.analysis,
      rewards: {
        experience,
        gold,
        item,
        levelsGained,
        unlockedSkills: [],
        temperingMarks,
      },
      worldEvents: [],
    };
    this.save.pendingBattle = undefined;
    this.hooks.completeDay();
    battle.worldEvents = this.hooks.eventsSince(
      typeof pending.context?.eventCursor === "string"
        ? pending.context.eventCursor
        : undefined,
    );
    return { status: "complete", battle, result: battle };
  }

  public finalizePendingLegendDefense(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    const activity = ENDGAME_ACTIVITIES.find(
      (candidate) => candidate.id === "legend-hunt",
    )!;
    const enemy = this.hooks.enemyById(pending.enemyId);
    const rank = this.hooks.heroEliteRank();
    if (!enemy || !rank || rank > LEGEND_COUNT)
      throw new Error("Сохранённый вызов легенде больше не действителен.");
    const combat = session.resolution();
    const heroWon = combat.winnerId === "hero";
    if (heroWon) {
      this.save.hero.wins += 1;
      this.save.hero.legendDefenses += 1;
      this.hooks.adjustEliteRating("hero", 10);
    } else {
      this.save.hero.losses += 1;
      this.hooks.swapEliteMembers("hero", enemy.id);
    }
    this.hooks.recordHeroEncounter(enemy, heroWon, combat.turns);
    this.hooks.recordMutationVictory(enemy, heroWon);
    this.hooks.updateEnemyAfterPlayerBattle(enemy, heroWon, false, false);
    this.save.pendingEliteChallengeId = undefined;
    this.hooks.awardCrownSeason(
      heroWon ? "hero" : enemy.id,
      heroWon ? "defense" : "win",
    );
    this.hooks.awardCrownSeason(heroWon ? enemy.id : "hero", "loss");
    this.save.lastLegendHuntDay = this.save.worldDay;
    this.hooks.syncCrownSet();
    this.hooks.event(
      "battle",
      heroWon
        ? `${this.save.hero.name} защитил титул легенды.`
        : `${enemy.name} отобрал у ${this.save.hero.name} место легенды.`,
      {
        kind: "battle",
        actorId: "hero",
        actorName: this.save.hero.name,
        targetId: enemy.id,
        targetName: enemy.name,
        outcome: heroWon ? "won" : "lost",
      },
    );
    const battle: BattleReport = {
      activity,
      heroBefore: combat.hero,
      enemyBefore: combat.enemy,
      winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero",
      heroWon,
      enemyDied: false,
      turns: combat.turns,
      analysis: combat.analysis,
      rewards: { experience: 0, gold: 0, levelsGained: 0, unlockedSkills: [] },
      worldEvents: [],
    };
    this.save.pendingBattle = undefined;
    if (pending.context?.advanceDay !== false) this.hooks.completeDay();
    battle.worldEvents = this.hooks.eventsSince(
      typeof pending.context?.eventCursor === "string"
        ? pending.context.eventCursor
        : undefined,
    );
    return { status: "complete", battle, result: battle };
  }

  public finalizePendingExpedition(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    const expedition = this.save.activeExpedition;
    if (!expedition || expedition.dungeonId !== pending.activityId) {
      throw new Error("Сохранённый поход больше не существует.");
    }
    const dungeon = DUNGEONS.find(
      (candidate) => candidate.id === expedition.dungeonId,
    );
    if (!dungeon)
      throw new Error("Подземелье сохранённого похода больше не существует.");
    const combat = session.resolution();
    const enemy = pending.enemy;
    const heroWon = combat.winnerId === "hero";
    const lastTurn = combat.turns[combat.turns.length - 1];
    const remainingHealth = heroWon
      ? lastTurn?.actorId === "hero"
        ? lastTurn.actorHealth
        : (lastTurn?.targetHealth ?? combat.hero.maxHealth)
      : 0;
    const mode = pending.context?.expeditionMode;
    const routeNode =
      mode === "route-node"
        ? expedition.route?.nodes.find(
            (candidate) => candidate.id === pending.context?.nodeId,
          )
        : undefined;
    const rawChoiceId =
      mode === "choice" ? pending.context?.choiceId : undefined;
    const choiceId =
      rawChoiceId === "safe" || rawChoiceId === "risk"
        ? rawChoiceId
        : undefined;
    if (mode === "route-node" && !routeNode)
      throw new Error("Узел сохранённого похода больше не существует.");
    if (mode === "choice" && choiceId !== "safe" && choiceId !== "risk") {
      throw new Error("Выбор сохранённого похода больше не существует.");
    }
    if (mode !== "route-node" && mode !== "choice")
      throw new Error("Неизвестный этап сохранённого похода.");
    const combatKind =
      routeNode?.kind === "boss" || routeNode?.kind === "alternate-boss"
        ? "boss"
        : routeNode?.kind === "elite" || routeNode?.kind === "rival"
          ? "elite"
          : choiceId === "risk"
            ? "elite"
            : "battle";
    expedition.health = expeditionStaminaAfterBattle(
      expedition.health,
      combat.hero.maxHealth,
      remainingHealth,
      expeditionBattleExertion(combatKind),
    );
    let item: EquipmentItem | undefined;
    let completedByBoss = false;
    let successMessage = "Этап похода пройден.";
    const persistentEnemyId =
      typeof pending.context?.persistentEnemyId === "string"
        ? pending.context.persistentEnemyId
        : undefined;
    const persistentEnemy = persistentEnemyId
      ? this.hooks.enemyById(persistentEnemyId)
      : undefined;
    if (persistentEnemy) {
      this.hooks.recordNpcDuelWithHero(persistentEnemy, heroWon);
      if (!heroWon) {
        persistentEnemy.experience += 35 + persistentEnemy.level * 2;
        persistentEnemy.gold = (persistentEnemy.gold ?? 0) + 45;
        this.hooks.progressEnemy(persistentEnemy, false);
      }
      this.hooks.recordEnemyHistory(
        persistentEnemy,
        `${heroWon ? "Проиграл" : "Победил"} ${this.save.hero.name} во время встречи в данже «${dungeon.name}».`,
      );
    }

    if (mode === "route-node") {
      const node = routeNode!;
      this.hooks.consumeExpeditionSupply(expedition);
      const discovery = recordDungeonNodeVisit(
        expedition.route!,
        this.hooks.dungeonDiscovery(expedition.dungeonId),
        node.id,
      );
      this.save.dungeonDiscoveries![expedition.dungeonId] = {
        ...discovery,
        alternateBossDefeated:
          this.save.dungeonDiscoveries?.[expedition.dungeonId]
            ?.alternateBossDefeated ?? false,
      };
      expedition.discoveredNodeIds = [...discovery.discoveredNodeIds];
      expedition.visitedNodeIds = [
        ...(expedition.visitedNodeIds ?? []),
        node.id,
      ];
      expedition.currentNodeId = node.id;
      expedition.stage = expedition.visitedNodeIds.length;
      expedition.path.push(`node:${node.kind}:${node.id}`);
      const elite = node.kind === "elite" || node.kind === "rival";
      const boss = node.kind === "boss" || node.kind === "alternate-boss";
      const alternateBoss = node.kind === "alternate-boss";
      completedByBoss = boss;
      if (heroWon) {
        const multiplier = node.rewardMultiplier || 1;
        expedition.accumulatedExperience += Math.round(
          (dungeon.rewardExperience / expedition.maxStages) * multiplier,
        );
        expedition.accumulatedGold += Math.round(
          (dungeon.rewardGold / expedition.maxStages) * multiplier,
        );
        const lootChance = boss ? 1 : elite ? 0.88 : 0.34;
        if (
          this.random.loot.chance(
            Math.min(1, lootChance + (expedition.lootChanceBonus ?? 0)),
          )
        ) {
          item = this.hooks.createRewardItem(
            Math.min(
              this.save.hero.level + (boss ? 3 : 2),
              dungeon.enemyLevel[1] + (boss ? 3 : 1),
            ),
            {
              classId: this.save.hero.classId,
              minimumRarity: this.hooks.minimumRewardRarity(
                this.hooks.controlledDungeonMinimum(
                  dungeon.id,
                  alternateBoss
                    ? improveMinimumRarity(dungeon.minimumRarity, 3)
                    : boss
                      ? improveMinimumRarity(dungeon.minimumRarity, 2)
                      : elite
                        ? improveMinimumRarity(dungeon.minimumRarity, 1)
                        : dungeon.minimumRarity,
                ),
                "dungeon",
              ),
            },
            (boss ? 0.35 : elite ? 0.2 : 0) + (expedition.lootChanceBonus ?? 0),
          );
          expedition.loot.push(item);
        }
      }
      successMessage = boss
        ? `${alternateBoss ? "Тайный владыка" : "Хранитель"} «${dungeon.name}» повержен. Маршрут завершён, все трофеи сохранены.`
        : `${node.kind === "rival" ? "Соперник с арены" : elite ? "Элитный страж" : "Патруль"} повержен. Выберите следующий связанный узел маршрута.`;
    } else if (mode === "choice" && choiceId) {
      expedition.path.push(choiceId);
      if (heroWon) {
        expedition.accumulatedExperience += Math.round(
          (dungeon.rewardExperience / expedition.maxStages) *
            (choiceId === "risk" ? 1.55 : 1),
        );
        expedition.accumulatedGold += Math.round(
          (dungeon.rewardGold / expedition.maxStages) *
            (choiceId === "risk" ? 1.7 : 1),
        );
        if (this.random.loot.chance(choiceId === "risk" ? 0.72 : 0.34)) {
          item = this.hooks.createRewardItem(
            Math.min(this.save.hero.level + 2, dungeon.enemyLevel[1] + 1),
            {
              classId: this.save.hero.classId,
              minimumRarity: this.hooks.minimumRewardRarity(
                this.hooks.controlledDungeonMinimum(
                  dungeon.id,
                  dungeon.minimumRarity,
                ),
                "dungeon",
              ),
            },
            factionModifier(
              this.save.hero.factionReputation,
              "dungeonLootChance",
            ),
          );
          expedition.loot.push(item);
        }
        expedition.stage += 1;
      }
      successMessage =
        expedition.stage >= expedition.maxStages
          ? `Поход «${dungeon.name}» завершён. Все накопленные трофеи сохранены.`
          : `Этап ${expedition.stage}/${expedition.maxStages} пройден. Можно углубиться или отступить.`;
    }

    const battle: BattleReport = {
      activity: dungeon,
      heroBefore: combat.hero,
      enemyBefore: combat.enemy,
      winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero",
      heroWon,
      enemyDied: false,
      turns: combat.turns,
      analysis: combat.analysis,
      rewards: {
        experience: 0,
        gold: 0,
        item,
        levelsGained: 0,
        unlockedSkills: [],
      },
      worldEvents: [],
    };
    this.hooks.recordHeroEncounter(enemy, heroWon, combat.turns);
    this.hooks.recordMutationVictory(enemy, heroWon);
    this.save.pendingBattle = undefined;
    let result: ExpeditionStepReport;
    if (!heroWon) {
      result = this.hooks.finishExpedition(
        true,
        "Раненый герой отступил. Часть найденного удалось вынести.",
        battle,
      );
    } else if (
      completedByBoss ||
      (expedition.stage >= expedition.maxStages && mode === "choice")
    ) {
      result = this.hooks.finishExpedition(false, successMessage, battle);
    } else if (expedition.health <= 0) {
      result = this.hooks.finishExpedition(
        true,
        "Герой исчерпал запас сил и вынужден отступить. Часть найденного удалось вынести.",
        battle,
      );
    } else {
      result = {
        expedition,
        battle,
        completed: false,
        retreated: false,
        message: successMessage,
      };
    }
    return { status: "complete", battle, result };
  }
}
