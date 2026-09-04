import { ARENAS, DUNGEONS, RARITY_ORDER } from "../../catalogs/WorldCatalog";
import {
  FACTIONS,
  TOURNAMENT_RULES,
} from "../../catalogs/WorldExpansionCatalog";
import { createItem, itemPower } from "../../factories/ItemFactory";
import { resolveNpcCombat } from "../combat/NpcCombat";
import {
  BACKGROUND_LETHALITY_SCALE,
  ELITE_SIZE,
  LEGEND_COUNT,
} from "../core/WorldGameConfig";
import { WorldRandomStreams } from "../core/WorldRandom";
import {
  BattleReport,
  EnemyProfile,
  EquipmentItem,
  EquipmentSlot,
  GameSave,
  HeroProfile,
  Rarity,
  WorldEvent,
  WorldRelicRecord,
} from "../core/WorldTypes";
import { EquipmentDeedKind } from "../equipment/EquipmentEvolution";
import { considerNpcLoot } from "../equipment/NpcEquipment";
import {
  assertWorldRelicEligible,
  isWorldRelicEligible,
  releaseWorldRelic,
  synchronizeWorldRelic,
  transferWorldRelic,
} from "../equipment/WorldRelics";
import { eraLawModifiers, RewardContext } from "../progression/NewGamePlus";
import { enemyExperienceRequirement } from "../progression/ProgressionBalance";
import { TournamentEngine } from "../tournaments/TournamentEngine";
import {
  changeFactionInfluence,
  factionDungeonReward,
  factionHostility,
  resolveFactionControlCycle,
} from "./FactionEconomy";
import {
  createFactionControlState,
  createWorldRelicRecord,
} from "./LivingWorld";
import {
  chooseNpcArenaOpponent,
  createNpcPlanningContext,
  evolveNpcRelationships,
  normalizeNpcLifeWorldState,
  planNpcDay,
  recordNpcAlliance,
  recordNpcEncounter,
  recordNpcPlanOutcome,
  refreshFutureBossAvailability,
  refreshNpcIdentity,
} from "./NpcLifeSimulation";
import { StructuredWorldEventPayload } from "./WorldEvents";
import { awardWorldSeasonPoints, worldSeasonRule } from "./WorldSeason";

interface NpcSimulationServiceHooks {
  enemyWorldRating(enemy: EnemyProfile): number;
  recordEnemyHistory(enemy: EnemyProfile, message: string): void;
  event(
    type: WorldEvent["type"],
    message: string,
    payload?: StructuredWorldEventPayload,
  ): void;
  recordEquipmentDeeds(
    fighter: HeroProfile | EnemyProfile,
    kind: EquipmentDeedKind,
    witness: string,
  ): void;
  synchronizeOwnedWorldRelic(
    item: EquipmentItem,
    history?: string,
  ): WorldRelicRecord | undefined;
  enemyById(id: string): EnemyProfile | undefined;
  minimumRewardRarity(rarity: Rarity, context: RewardContext): Rarity;
  controlledDungeonMinimum(dungeonId: string, rarity: Rarity): Rarity;
  randomId(prefix: string): string;
  recordSurvivalDeed(
    fighter: HeroProfile | EnemyProfile,
    opponentName: string,
    turns: BattleReport["turns"],
  ): void;
  ensureEliteLeague(): void;
  ensurePopulations(
    fillImmediately?: boolean,
    allowRoutineRecruitment?: boolean,
  ): void;
  tournamentRules(arenaId: string, day?: number): typeof TOURNAMENT_RULES;
  recordArenaChampionship(enemy: EnemyProfile, arenaIndex: number): void;
  heroEliteRank(): number | undefined;
  awardCrownSeason(
    fighterId: string,
    result: "win" | "loss" | "defense" | "champion",
  ): void;
  swapEliteMembers(winnerId: string, loserId: string): void;
  registeredCrownLeagueDay(): number | undefined;
  syncCrownSet(): void;
  crownLeagueInterval(): number;
  enemyPower(enemy: EnemyProfile): number;
  fighterTournamentSeed(fighter: HeroProfile | EnemyProfile): number;
  adjustEliteRating(id: string, amount: number): void;
  promoteIntoElite(id: string): void;
  sortEliteByRating(): void;
  factionHunter(): EnemyProfile | undefined;
  heroPower(): number;
}

export class NpcSimulationService {
  constructor(
    private readonly save: GameSave,
    private readonly random: WorldRandomStreams,
    private readonly hooks: NpcSimulationServiceHooks,
  ) {}
  public recordNpcDuelWithHero(enemy: EnemyProfile, heroWon: boolean): void {
    if (heroWon) {
      enemy.losses += 1;
      enemy.duelLosses = (enemy.duelLosses ?? 0) + 1;
    } else {
      enemy.wins += 1;
      enemy.duelWins = (enemy.duelWins ?? 0) + 1;
    }
    enemy.rating = this.hooks.enemyWorldRating(enemy);
  }

  public updateEnemyAfterPlayerBattle(
    enemy: EnemyProfile,
    heroWon: boolean,
    died: boolean,
    arenaMatch = true,
  ): void {
    if (heroWon) {
      enemy.losses += 1;
      if (!arenaMatch) enemy.duelLosses = (enemy.duelLosses ?? 0) + 1;
      if (died) {
        enemy.alive = false;
        const mentor = this.save.mentors?.find(
          (candidate) => candidate.fighterId === enemy.id,
        );
        if (mentor) mentor.competes = false;
        this.hooks.recordEnemyHistory(
          enemy,
          `Погиб в бою с ${this.save.hero.name} на арене «${ARENAS[enemy.arenaIndex].name}».`,
        );
        this.releaseWorldRelics(
          enemy,
          `День ${this.save.worldDay}: ${enemy.name} погиб в бою с ${this.save.hero.name}.`,
        );
        this.hooks.event(
          "death",
          `${enemy.name}, когда-то ${enemy.title}, погиб и больше не появится в мире.`,
          {
            kind: "death",
            fighterId: enemy.id,
            fighterName: enemy.name,
            killerId: "hero",
            killerName: this.save.hero.name,
          },
        );
      } else {
        this.hooks.recordEnemyHistory(
          enemy,
          `Проиграл ${this.save.hero.name}, но выжил.`,
        );
        if (enemy.losses >= 2) enemy.goal = "vengeance";
      }
    } else {
      enemy.wins += 1;
      if (arenaMatch) enemy.arenaWins += 1;
      else enemy.duelWins = (enemy.duelWins ?? 0) + 1;
      enemy.experience += this.npcExperienceReward(45);
      enemy.gold = (enemy.gold ?? 0) + 45 + enemy.arenaIndex * 18;
      if (arenaMatch) this.addFactionInfluence(enemy, enemy.arenaIndex, 4);
      this.hooks.recordEnemyHistory(
        enemy,
        `Победил главного героя ${this.save.hero.name}.`,
      );
      this.progressEnemy(enemy);
    }
    enemy.rating = this.hooks.enemyWorldRating(enemy);
  }

  public simulateWorldFights(
    count: number,
    recordEvents: boolean,
    fixedArenaIndex?: number,
  ): void {
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    for (let index = 0; index < count; index += 1) {
      const arenaIndex =
        fixedArenaIndex ?? this.random.world.int(0, ARENAS.length - 1);
      const pool = this.save.enemies.filter(
        (enemy) =>
          enemy.alive &&
          enemy.arenaIndex === arenaIndex &&
          !eliteIds.has(enemy.id),
      );
      if (pool.length < 2) continue;
      const first = this.random.world.pick(pool);
      const second = this.random.world.pick(
        pool.filter((enemy) => enemy.id !== first.id),
      );
      const { winner, loser } = this.resolveNpcMatch(first, second);
      winner.wins += 1;
      winner.arenaWins += 1;
      winner.experience += this.npcExperienceReward(70 + arenaIndex * 22);
      winner.gold = (winner.gold ?? 0) + 24 + arenaIndex * 12;
      loser.losses += 1;
      this.recordNpcRivalry(winner, loser);
      this.addFactionInfluence(winner, arenaIndex, 1);
      awardWorldSeasonPoints(
        this.save.worldSeason!,
        ARENAS[arenaIndex].id,
        winner.id,
        "win",
        winner.name,
      );
      awardWorldSeasonPoints(
        this.save.worldSeason!,
        ARENAS[arenaIndex].id,
        loser.id,
        "loss",
        loser.name,
      );
      if (recordEvents)
        this.hooks.event(
          "battle",
          `${winner.name} победил ${loser.name} на арене «${ARENAS[arenaIndex].name}».`,
          {
            kind: "battle",
            actorId: winner.id,
            actorName: winner.name,
            targetId: loser.id,
            targetName: loser.name,
            outcome: "won",
          },
        );
      const lethalMultiplier =
        eraLawModifiers(this.save.legacy.activeLawIds)
          .arenaLethalityMultiplier *
        worldSeasonRule(this.save.worldSeason?.ruleId).lethalityMultiplier;
      const lethal = this.random.world.chance(
        Math.min(
          0.3,
          ARENAS[arenaIndex].lethalChance *
            BACKGROUND_LETHALITY_SCALE *
            lethalMultiplier,
        ),
      );
      if (lethal) {
        winner.kills += 1;
        this.hooks.recordEquipmentDeeds(winner, "lethal", loser.name);
        loser.alive = false;
        const mentor = this.save.mentors?.find(
          (candidate) => candidate.fighterId === loser.id,
        );
        if (mentor) mentor.competes = false;
        this.hooks.recordEnemyHistory(
          loser,
          `Погиб в фоновом бою против ${winner.name}.`,
        );
        this.releaseWorldRelics(
          loser,
          `День ${this.save.worldDay}: владелец ${loser.name} погиб на арене.`,
        );
        if (recordEvents)
          this.hooks.event(
            "death",
            `${winner.name} смертельно победил ${loser.name} на арене «${ARENAS[arenaIndex].name}».`,
            {
              kind: "death",
              fighterId: loser.id,
              fighterName: loser.name,
              killerId: winner.id,
              killerName: winner.name,
            },
          );
      }
      if (this.random.loot.chance(0.24)) {
        const item = createItem(winner.level, {
          classId: winner.classId,
          minimumRarity: arenaIndex >= 3 ? "rare" : "common",
          randomSource: this.random.loot,
        });
        const equipped = considerNpcLoot(winner, item);
        if (equipped && recordEvents)
          this.hooks.event(
            "loot",
            `${winner.name} усилил снаряжение предметом «${item.name}» после боя.`,
            {
              kind: "loot",
              fighterId: winner.id,
              fighterName: winner.name,
              itemId: item.id,
              itemName: item.name,
            },
          );
      }
      this.progressEnemy(winner, recordEvents);
      this.maybeAwakenWorldRelic(winner, false);
      winner.rating = this.hooks.enemyWorldRating(winner);
    }
  }

  public recordNpcRivalry(winner: EnemyProfile, loser: EnemyProfile): void {
    winner.relationships ??= {};
    loser.relationships ??= {};
    const respectedAlly =
      winner.factionId === loser.factionId && this.random.world.chance(0.14);
    const update = (owner: EnemyProfile, rival: EnemyProfile): void => {
      const current = owner.relationships?.[rival.id];
      owner.relationships![rival.id] = {
        fighterId: rival.id,
        kind: respectedAlly ? "ally" : "rival",
        intensity: Math.min(100, (current?.intensity ?? 0) + 6),
        lastChangedDay: this.save.worldDay,
      };
    };
    update(winner, loser);
    update(loser, winner);
    if (
      loser.relationships[winner.id]?.kind === "rival" &&
      (loser.relationships[winner.id]?.intensity ?? 0) >= 30
    ) {
      loser.goal = "vengeance";
    }
  }

  public addFactionInfluence(
    enemy: EnemyProfile,
    arenaIndex: number,
    amount: number,
  ): void {
    const factionId = enemy.factionId ?? FACTIONS[0].id;
    const arena = ARENAS[arenaIndex];
    const control = (this.save.factionControl ??= createFactionControlState(
      this.save.worldDay,
    ));
    control.arenaInfluence[arena.id] ??= Object.fromEntries(
      FACTIONS.map((faction) => [faction.id, 0]),
    );
    const scaled = Math.max(
      1,
      Math.round(
        amount *
          worldSeasonRule(this.save.worldSeason?.ruleId)
            .factionInfluenceMultiplier,
      ),
    );
    control.arenaInfluence[arena.id][factionId] =
      (control.arenaInfluence[arena.id][factionId] ?? 0) + scaled;
  }

  public addHeroFactionInfluence(arenaIndex: number, amount: number): void {
    const arena = ARENAS[arenaIndex];
    const control = (this.save.factionControl ??= createFactionControlState(
      this.save.worldDay,
    ));
    const preferred = FACTIONS.map((faction) => ({
      id: faction.id,
      reputation: this.save.hero.factionReputation[faction.id] ?? 0,
    })).sort((first, second) => second.reputation - first.reputation)[0];
    const factionId =
      preferred && preferred.reputation > 0
        ? preferred.id
        : (control.arenaControllers[arena.id] ?? FACTIONS[0].id);
    control.arenaInfluence[arena.id] ??= Object.fromEntries(
      FACTIONS.map((faction) => [faction.id, 0]),
    );
    const scaled = Math.max(
      1,
      Math.round(
        amount *
          worldSeasonRule(this.save.worldSeason?.ruleId)
            .factionInfluenceMultiplier,
      ),
    );
    control.arenaInfluence[arena.id][factionId] =
      (control.arenaInfluence[arena.id][factionId] ?? 0) + scaled;
  }

  public resolveFactionControl(): void {
    const control = (this.save.factionControl ??= createFactionControlState(
      this.save.worldDay,
    ));
    const interval = this.save.worldSeason?.ruleId === "faction-war" ? 4 : 7;
    const resolution = resolveFactionControlCycle(
      control,
      this.save.worldDay,
      interval,
    );
    this.save.factionControl = resolution.state;
    resolution.arenaChanges.forEach((change) => {
      const arena = ARENAS.find((candidate) => candidate.id === change.arenaId);
      const faction = FACTIONS.find(
        (candidate) => candidate.id === change.nextFactionId,
      );
      if (arena && faction)
        this.hooks.event(
          "promotion",
          `${faction.name} установила контроль над ареной «${arena.name}».`,
        );
    });
    resolution.dungeonChanges.forEach((change) => {
      const dungeon = DUNGEONS.find(
        (candidate) => candidate.id === change.dungeonId,
      );
      const faction = FACTIONS.find(
        (candidate) => candidate.id === change.nextFactionId,
      );
      if (dungeon && faction)
        this.hooks.event(
          "promotion",
          `${faction.name} взяла под контроль пути к данжу «${dungeon.name}».`,
        );
    });
    if (resolution.shopChange) {
      this.hooks.event(
        "system",
        `${FACTIONS.find((faction) => faction.id === resolution.shopChange!.nextFactionId)?.name} получила право снабжать лавку Ионы.`,
      );
    }
  }

  public simulateNpcAgencyDay(): void {
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    const active = this.save.enemies.filter((enemy) => enemy.alive);
    const life = (this.save.npcLife = normalizeNpcLifeWorldState(
      this.save.npcLife,
      this.save.enemies,
      this.save.worldDay,
    ));
    const planningContext = createNpcPlanningContext(
      {
        day: this.save.worldDay,
        fighters: active,
        eliteIds,
        mentors: this.save.mentors,
        random: this.random.world,
      },
      life,
    );
    const plans = new Map(
      active.map((enemy) => [
        enemy.id,
        planNpcDay(enemy, life, planningContext),
      ]),
    );
    const resolvedFighters = new Set<string>();
    active.forEach((enemy) => {
      const plan = plans.get(enemy.id)!;
      const activity = plan.activity;
      let success = true;
      let acquiredTemplateId: string | undefined;
      let description = `${enemy.name}: ${plan.reason}`;
      if (activity === "training") {
        const mentor = this.save.mentors?.find(
          (candidate) => candidate.id === enemy.mentorId,
        );
        const season = worldSeasonRule(this.save.worldSeason?.ruleId);
        enemy.experience += Math.round(
          (20 + enemy.level * 2 + (mentor ? 18 : 0)) *
            season.npcExperienceMultiplier,
        );
        if (mentor)
          description = `${enemy.name} тренировался в школе наставника ${mentor.name}. ${plan.reason}`;
        this.progressEnemy(enemy, false);
      } else if (activity === "shopping" && (enemy.gold ?? 0) >= 120) {
        const candidate = createItem(enemy.level + this.random.loot.int(0, 1), {
          classId: enemy.classId,
          templateId: plan.targetTemplateId,
          minimumRarity:
            enemy.goal === "relic" && enemy.arenaIndex >= 3
              ? "epic"
              : enemy.arenaIndex >= 2
                ? "rare"
                : "common",
          randomSource: this.random.loot,
        });
        const price = Math.max(40, Math.round(candidate.price * 0.62));
        if ((enemy.gold ?? 0) >= price && considerNpcLoot(enemy, candidate)) {
          enemy.gold = (enemy.gold ?? 0) - price;
          acquiredTemplateId = candidate.templateId;
          description = `${enemy.name} купил в лавке предмет «${candidate.name}».`;
          if (
            RARITY_ORDER.indexOf(candidate.rarity) >=
            RARITY_ORDER.indexOf("legendary")
          ) {
            this.hooks.event("loot", description);
          }
        } else success = false;
      } else if (activity === "forging" && (enemy.gold ?? 0) >= 180) {
        const worn = enemy.equipment.filter(
          (item) =>
            Object.values(enemy.equipped).includes(item.id) &&
            (item.enhancement ?? 0) < 5,
        );
        if (worn.length > 0) {
          const item = [...worn].sort(
            (first, second) =>
              (first.enhancement ?? 0) - (second.enhancement ?? 0),
          )[0];
          const cost = 110 + (item.enhancement ?? 0) * 75;
          if ((enemy.gold ?? 0) >= cost) {
            enemy.gold = (enemy.gold ?? 0) - cost;
            item.enhancement = (item.enhancement ?? 0) + 1;
            item.stats = Object.fromEntries(
              Object.entries(item.stats).map(([stat, value]) => [
                stat,
                Math.max(1, Math.round((value ?? 0) * 1.04)),
              ]),
            );
            if (item.worldRelicId) {
              this.hooks.synchronizeOwnedWorldRelic(
                item,
                `День ${this.save.worldDay}: ${enemy.name} усилил реликвию до +${item.enhancement}.`,
              );
            }
            description = `${enemy.name} закалил предмет «${item.relicName ?? item.name}» до +${item.enhancement}.`;
          }
        } else success = false;
      } else if (activity === "rest") {
        enemy.injuries.forEach((injury) => {
          injury.remainingDays = Math.max(0, injury.remainingDays - 1);
        });
        description = `${enemy.name} взял день на восстановление.`;
      } else if (activity === "dungeon") {
        const dungeon =
          DUNGEONS[
            Math.min(DUNGEONS.length - 1, Math.max(0, enemy.arenaIndex))
          ];
        const companion = plan.companionFighterId
          ? this.hooks.enemyById(plan.companionFighterId)
          : undefined;
        const season = worldSeasonRule(this.save.worldSeason?.ruleId);
        const chance = Math.min(
          0.88,
          0.48 +
            enemy.level / Math.max(20, dungeon.enemyLevel[1] * 3) +
            (companion ? 0.08 : 0),
        );
        success = this.random.world.chance(chance);
        if (success) {
          enemy.experience += this.npcExperienceReward(
            dungeon.rewardExperience * 0.55 * season.dungeonRewardMultiplier,
          );
          enemy.gold =
            (enemy.gold ?? 0) +
            Math.round(
              dungeon.rewardGold *
                0.52 *
                season.goldMultiplier *
                season.dungeonRewardMultiplier,
            );
          const item = createItem(enemy.level + this.random.loot.int(0, 2), {
            classId: enemy.classId,
            templateId: plan.targetTemplateId,
            minimumRarity: this.hooks.minimumRewardRarity(
              this.hooks.controlledDungeonMinimum(
                dungeon.id,
                dungeon.minimumRarity,
              ),
              "dungeon",
            ),
            randomSource: this.random.loot,
          });
          if (considerNpcLoot(enemy, item))
            acquiredTemplateId = item.templateId;
          this.progressEnemy(enemy, false);
          if (companion)
            recordNpcAlliance(life, enemy, companion, this.save.worldDay, 5);
          this.save.factionControl = changeFactionInfluence(
            this.save.factionControl ??
              createFactionControlState(this.save.worldDay),
            "dungeon",
            dungeon.id,
            enemy.factionId ?? FACTIONS[0].id,
            Math.max(
              1,
              Math.round(
                (2 + dungeon.requiredArena) * season.factionInfluenceMultiplier,
              ),
            ),
          );
          description = `${enemy.name}${companion ? ` вместе с ${companion.name}` : ""} вернулся из «${dungeon.name}»${acquiredTemplateId ? ` с предметом «${item.name}»` : " без улучшения"}.`;
        } else {
          enemy.injuries.push({
            id: this.hooks.randomId("npc-dungeon-injury"),
            name: "Рана из глубин",
            description: `Получена в походе «${dungeon.name}».`,
            remainingDays: this.random.world.int(1, 3),
            stats: { health: -Math.max(4, enemy.level * 2) },
            gainedDay: this.save.worldDay,
          });
          description = `${enemy.name} не завершил поход «${dungeon.name}» и ушёл восстанавливаться.`;
        }
      } else if (activity === "arena" && !resolvedFighters.has(enemy.id)) {
        const opponent = chooseNpcArenaOpponent(
          plan,
          enemy,
          active.filter(
            (candidate) => candidate.arenaIndex === enemy.arenaIndex,
          ),
        );
        if (opponent && !resolvedFighters.has(opponent.id)) {
          const targeted =
            enemy.goal === "vengeance" && plan.targetFighterId === opponent.id;
          const result = this.resolvePlannedNpcFight(enemy, opponent, targeted);
          resolvedFighters.add(enemy.id);
          resolvedFighters.add(opponent.id);
          success = result.winner.id === enemy.id;
          description = `${result.winner.name} победил ${result.loser.name} ${targeted ? "в личной дуэли" : "в бою текущей арены"}.`;
          recordNpcPlanOutcome(life, opponent, plans.get(opponent.id) ?? plan, {
            day: this.save.worldDay,
            success: result.winner.id === opponent.id,
          });
        } else success = false;
      }
      enemy.lastActivity = { day: this.save.worldDay, activity, description };
      recordNpcPlanOutcome(life, enemy, plan, {
        day: this.save.worldDay,
        success,
        acquiredTemplateId,
      });
      const nickname = refreshNpcIdentity(life, enemy, this.save.worldDay);
      if (
        nickname &&
        enemy.title !== nickname &&
        this.save.worldDay === life.profiles[enemy.id]?.nicknameGrantedDay
      ) {
        enemy.title = nickname;
        this.hooks.recordEnemyHistory(
          enemy,
          `Получил прозвище «${nickname}» в день ${this.save.worldDay}.`,
        );
        this.hooks.event(
          "promotion",
          `${enemy.name} отныне известен как «${nickname}».`,
        );
      }
      if (enemy.arenaIndex >= ARENAS.length - 1 && enemy.tournamentWins >= 2)
        enemy.goal = "elite";
    });
    (this.save.mentors ?? []).forEach((mentor) => {
      mentor.studentIds.forEach((studentId) => {
        const student = this.hooks.enemyById(studentId);
        if (!student) return;
        student.experience += 10 + Math.round(mentor.level * 0.5);
        this.progressEnemy(student, false);
      });
    });
    evolveNpcRelationships(active, life, this.save.worldDay);
  }

  public resolvePlannedNpcFight(
    first: EnemyProfile,
    second: EnemyProfile,
    targeted: boolean,
  ): {
    winner: EnemyProfile;
    loser: EnemyProfile;
    fullCombat: boolean;
  } {
    const { winner, loser, fullCombat } = this.resolveNpcMatch(
      first,
      second,
      targeted,
    );
    winner.wins += 1;
    if (!targeted) winner.arenaWins += 1;
    winner.experience += this.npcExperienceReward(28 + winner.arenaIndex * 9);
    winner.gold = (winner.gold ?? 0) + 12 + winner.arenaIndex * 7;
    loser.losses += 1;
    recordNpcEncounter(this.save.npcLife!, winner, loser, {
      day: this.save.worldDay,
      kind: targeted ? "duel" : "arena",
    });
    this.recordNpcRivalry(winner, loser);
    if (!targeted) {
      this.addFactionInfluence(winner, winner.arenaIndex, 1);
      awardWorldSeasonPoints(
        this.save.worldSeason!,
        ARENAS[winner.arenaIndex].id,
        winner.id,
        "win",
        winner.name,
      );
      awardWorldSeasonPoints(
        this.save.worldSeason!,
        ARENAS[loser.arenaIndex].id,
        loser.id,
        "loss",
        loser.name,
      );
    }
    this.progressEnemy(winner, false);
    if (fullCombat)
      this.hooks.event(
        "battle",
        `${winner.name} победил ${loser.name} в личной встрече, которую мир запомнил подробно.`,
      );
    return { winner, loser, fullCombat };
  }

  public resolveNpcMatch(
    first: EnemyProfile,
    second: EnemyProfile,
    forceFull = false,
    ruleIds?: string[],
  ) {
    const result = resolveNpcCombat(first, second, {
      worldRandom: this.random.world,
      combatRandom: this.random.combat,
      eliteIds: this.save.eliteLeagueMemberIds,
      forceFull,
      ruleIds,
      lawIds: this.save.legacy.activeLawIds,
    });
    if (result.fullCombat) {
      this.hooks.recordSurvivalDeed(
        result.winner,
        result.loser.name,
        result.turns,
      );
      if (
        this.save.eliteLeagueMemberIds
          .slice(0, LEGEND_COUNT)
          .includes(result.loser.id)
      ) {
        this.hooks.recordEquipmentDeeds(
          result.winner,
          "legend",
          result.loser.name,
        );
      }
      const decision = result.analysis?.decidingEffect;
      this.hooks.recordEnemyHistory(
        result.winner,
        `День ${this.save.worldDay}: победил ${result.loser.name} за ${result.turns.length} действий${decision ? `; ${decision}` : ""}.`,
      );
    }
    return result;
  }

  public maybeAwakenWorldRelic(enemy: EnemyProfile, force: boolean): void {
    if (
      (this.save.worldRelics ?? []).some(
        (record) =>
          record.currentOwnerId === enemy.id ||
          record.formerOwners.includes(enemy.name),
      )
    )
      return;
    if (!force && enemy.tournamentWins < 2 && enemy.kills < 4) return;
    if (!force && !this.random.world.chance(0.012)) return;
    const candidate = enemy.equipment
      .filter(
        (item) =>
          Object.values(enemy.equipped).includes(item.id) &&
          !item.worldRelicId &&
          isWorldRelicEligible(item) &&
          RARITY_ORDER.indexOf(item.rarity) >=
            RARITY_ORDER.indexOf("legendary"),
      )
      .sort((first, second) => itemPower(second) - itemPower(first))[0];
    if (!candidate) return;
    assertWorldRelicEligible(candidate);
    const created = createWorldRelicRecord(
      this.hooks.randomId("world-relic"),
      candidate,
      enemy.id,
      enemy.name,
      this.save.worldDay,
    );
    const record = synchronizeWorldRelic(
      created,
      created.item,
      `${enemy.name}: ${enemy.tournamentWins} турнирных побед и ${enemy.kills} смертельных побед.`,
      this.save.worldDay,
    );
    Object.assign(candidate, record.item, {
      stats: { ...record.item.stats },
      relicHistory: [...(record.item.relicHistory ?? [])],
      relicFeats: [...(record.item.relicFeats ?? [])],
      relicProperties: (record.item.relicProperties ?? []).map((property) => ({
        ...property,
      })),
    });
    this.save.worldRelics ??= [];
    this.save.worldRelics.push(record);
    this.hooks.event(
      "loot",
      `В мире появилась реликвия «${candidate.relicName}», выкованная победами ${enemy.name}.`,
    );
  }

  public releaseWorldRelics(enemy: EnemyProfile, history: string): void {
    const records = (this.save.worldRelics ?? []).filter(
      (record) => record.currentOwnerId === enemy.id,
    );
    records.forEach((record) => {
      const actualItem = enemy.equipment.find(
        (item) => item.worldRelicId === record.id,
      );
      const released = releaseWorldRelic(
        record,
        actualItem ?? record.item,
        history,
      );
      const recordIndex = this.save.worldRelics!.findIndex(
        (candidate) => candidate.id === record.id,
      );
      if (recordIndex >= 0)
        this.save.worldRelics![recordIndex] = released.record;
      enemy.equipment = enemy.equipment.filter(
        (item) => item.worldRelicId !== record.id,
      );
      (Object.keys(enemy.equipped) as EquipmentSlot[]).forEach((slot) => {
        if (!enemy.equipment.some((item) => item.id === enemy.equipped[slot]))
          delete enemy.equipped[slot];
      });
    });
  }

  public circulateWorldRelics(): void {
    const lost = (this.save.worldRelics ?? []).filter(
      (record) => record.status === "lost",
    );
    lost.forEach((record) => {
      if (!this.random.world.chance(0.045)) return;
      const candidates = this.save.enemies.filter(
        (enemy) =>
          enemy.alive &&
          (record.item.allowedClasses === "all" ||
            record.item.allowedClasses.includes(enemy.classId)) &&
          enemy.level >= Math.max(1, record.item.level - 8),
      );
      if (candidates.length === 0) return;
      const owner = this.random.world.pick(candidates);
      const item = {
        ...record.item,
        stats: { ...record.item.stats },
        relicHistory: [...record.history],
      };
      if (!considerNpcLoot(owner, item)) return;
      const line = `День ${this.save.worldDay}: реликвию нашёл ${owner.name}.`;
      const transfer = transferWorldRelic(
        record,
        item,
        owner.id,
        owner.name,
        line,
      );
      const recordIndex = this.save.worldRelics!.findIndex(
        (candidate) => candidate.id === record.id,
      );
      if (recordIndex >= 0)
        this.save.worldRelics![recordIndex] = transfer.record;
      const itemIndex = owner.equipment.findIndex(
        (candidate) => candidate.id === item.id,
      );
      if (itemIndex >= 0) owner.equipment[itemIndex] = transfer.item;
      this.hooks.event(
        "loot",
        `${owner.name} нашёл мировую реликвию «${transfer.item.relicName ?? transfer.item.name}».`,
      );
    });
  }

  public syncLegendCareers(): void {
    const legends = new Set(this.save.eliteLeagueMemberIds.slice(0, 5));
    this.save.enemies.forEach((enemy) => {
      if (legends.has(enemy.id) && !enemy.legendSinceDay) {
        enemy.legendSinceDay = this.save.worldDay;
        enemy.goal = "elite";
        this.hooks.recordEnemyHistory(
          enemy,
          `Признан легендой элиты в день ${this.save.worldDay}.`,
        );
        if (this.save.worldDay > 1)
          this.hooks.event(
            "promotion",
            `${enemy.name} вошёл в пятёрку легенд мира.`,
          );
      }
    });
  }

  public simulateDailyWorld(skipTournamentArenaId?: string): void {
    this.hooks.ensureEliteLeague();
    this.syncLegendCareers();
    this.simulateNpcAgencyDay();
    ARENAS.forEach((arena, arenaIndex) => {
      this.simulateWorldFights(10 + arenaIndex * 3, true, arenaIndex);
      if (
        arena.id !== skipTournamentArenaId &&
        this.save.worldDay % arena.tournamentInterval === 0
      )
        this.simulateBackgroundTournament(arenaIndex);
    });
    DUNGEONS.forEach((dungeon) => {
      const arenaIndex = Math.min(ARENAS.length - 1, dungeon.requiredArena);
      const eliteIds = new Set(this.save.eliteLeagueMemberIds);
      const pool = this.save.enemies.filter(
        (enemy) =>
          enemy.alive &&
          enemy.arenaIndex === arenaIndex &&
          !eliteIds.has(enemy.id),
      );
      if (pool.length === 0) return;
      const explorer = this.random.world.pick(pool);
      const succeeded = this.random.world.chance(0.68);
      if (succeeded) {
        const season = worldSeasonRule(this.save.worldSeason?.ruleId);
        const controller =
          this.save.factionControl?.dungeonControllers?.[dungeon.id] ??
          FACTIONS[0].id;
        const reward = factionDungeonReward(controller, {
          experience: this.npcExperienceReward(
            dungeon.rewardExperience * 0.7 * season.dungeonRewardMultiplier,
          ),
          gold: Math.round(
            dungeon.rewardGold *
              0.65 *
              season.goldMultiplier *
              season.dungeonRewardMultiplier,
          ),
        });
        explorer.experience += reward.experience;
        explorer.gold = (explorer.gold ?? 0) + reward.gold;
        this.save.factionControl = changeFactionInfluence(
          this.save.factionControl ??
            createFactionControlState(this.save.worldDay),
          "dungeon",
          dungeon.id,
          explorer.factionId ?? FACTIONS[0].id,
          Math.max(1, Math.round(3 * season.factionInfluenceMultiplier)),
        );
        const item = createItem(explorer.level, {
          classId: explorer.classId,
          minimumRarity: this.hooks.minimumRewardRarity(
            this.hooks.controlledDungeonMinimum(
              dungeon.id,
              dungeon.minimumRarity,
            ),
            "dungeon",
          ),
          randomSource: this.random.loot,
        });
        const equipped = considerNpcLoot(explorer, item);
        this.hooks.event(
          "dungeon",
          equipped
            ? `${explorer.name} вернулся из данжа «${dungeon.name}» и усилил снаряжение предметом «${item.name}».`
            : `${explorer.name} прошёл данж «${dungeon.name}», но не нашёл улучшения.`,
        );
        this.progressEnemy(explorer, true);
      } else {
        this.hooks.event(
          "dungeon",
          `${explorer.name} не смог пройти данж «${dungeon.name}».`,
        );
      }
    });
    this.simulateEliteDay();
    this.resolveFactionControl();
    this.circulateWorldRelics();
    this.hooks.ensurePopulations();
  }

  public simulateBackgroundTournament(arenaIndex: number): void {
    const arena = ARENAS[arenaIndex];
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    const candidates = this.random.world.shuffle(
      this.save.enemies.filter(
        (enemy) =>
          enemy.alive &&
          enemy.arenaIndex === arenaIndex &&
          !eliteIds.has(enemy.id),
      ),
    );
    const controllerId = this.save.factionControl?.arenaControllers[arena.id];
    const controlled = candidates
      .filter((enemy) => enemy.factionId === controllerId)
      .slice(0, Math.floor(arena.participants / 2));
    const controlledIds = new Set(controlled.map((enemy) => enemy.id));
    const pool = [
      ...controlled,
      ...candidates.filter((enemy) => !controlledIds.has(enemy.id)),
    ].slice(0, arena.participants);
    if (pool.length < arena.participants) return;
    const ruleIds = this.hooks
      .tournamentRules(arena.id, this.save.worldDay)
      .map((rule) => rule.id);
    const bracket = TournamentEngine.run(
      pool,
      (first, second, round) => {
        const { winner, loser } = this.resolveNpcMatch(
          first,
          second,
          round >= Math.ceil(Math.log2(pool.length)) - 1,
          ruleIds,
        );
        winner.wins += 1;
        winner.arenaWins += 1;
        winner.experience += this.npcExperienceReward(55 + arenaIndex * 18);
        winner.gold = (winner.gold ?? 0) + 20 + arenaIndex * 10;
        loser.losses += 1;
        this.recordNpcRivalry(winner, loser);
        this.addFactionInfluence(winner, arenaIndex, 1);
        recordNpcEncounter(this.save.npcLife!, winner, loser, {
          day: this.save.worldDay,
          kind: "tournament",
        });
        awardWorldSeasonPoints(
          this.save.worldSeason!,
          arena.id,
          winner.id,
          "win",
          winner.name,
        );
        awardWorldSeasonPoints(
          this.save.worldSeason!,
          arena.id,
          loser.id,
          "loss",
          loser.name,
        );
        return { winner };
      },
      { seeded: true },
    );
    const champion = bracket.champion;
    this.hooks.recordArenaChampionship(champion, arenaIndex);
    awardWorldSeasonPoints(
      this.save.worldSeason!,
      arena.id,
      champion.id,
      "champion",
      champion.name,
    );
    champion.gold = (champion.gold ?? 0) + arena.rewardGold;
    this.addFactionInfluence(champion, arenaIndex, 14 + arenaIndex * 2);
    champion.rating = this.hooks.enemyWorldRating(champion);
    const prize = createItem(champion.level, {
      classId: champion.classId,
      minimumRarity:
        arenaIndex >= 4 ? "legendary" : arenaIndex >= 2 ? "epic" : "rare",
      randomSource: this.random.loot,
    });
    considerNpcLoot(champion, prize);
    this.hooks.recordEnemyHistory(
      champion,
      `Стал чемпионом турнира «${arena.name}» в день ${this.save.worldDay}.`,
    );
    this.progressEnemy(champion, true);
    this.maybeAwakenWorldRelic(champion, false);
    this.hooks.event(
      "tournament",
      `Фоновый турнир «${arena.name}» завершён: ${champion.name} победил сетку из ${pool.length} бойцов.`,
      {
        kind: "tournament",
        tournamentId: arena.id,
        tournamentName: arena.name,
        championId: champion.id,
        championName: champion.name,
        participants: pool.length,
      },
    );
  }

  public simulateEliteDay(): void {
    this.hooks.ensureEliteLeague();
    const heroRank = this.hooks.heroEliteRank();
    const challengeMultiplier = eraLawModifiers(
      this.save.legacy.activeLawIds,
    ).eliteChallengeChanceMultiplier;
    if (
      heroRank &&
      heroRank <= LEGEND_COUNT &&
      !this.save.pendingEliteChallengeId &&
      this.save.lastLegendHuntDay !== this.save.worldDay &&
      this.random.world.chance(Math.min(0.24, 0.08 * challengeMultiplier))
    ) {
      const challengerId =
        this.save.eliteLeagueMemberIds[Math.min(ELITE_SIZE - 1, heroRank)];
      if (challengerId && challengerId !== "hero") {
        this.save.pendingEliteChallengeId = challengerId;
        this.hooks.event(
          "battle",
          `${this.hooks.enemyById(challengerId)?.name ?? "Претендент"} вызвал ${this.save.hero.name} на защиту титула легенды.`,
        );
      }
    } else if (
      this.random.world.chance(Math.min(0.35, 0.16 * challengeMultiplier))
    ) {
      const defenderIndex = this.random.world.int(0, LEGEND_COUNT - 1);
      const challengerIndex = defenderIndex + 1;
      const defenderId = this.save.eliteLeagueMemberIds[defenderIndex];
      const challengerId = this.save.eliteLeagueMemberIds[challengerIndex];
      if (
        defenderId &&
        challengerId &&
        defenderId !== "hero" &&
        challengerId !== "hero"
      ) {
        const defender = this.hooks.enemyById(defenderId);
        const challenger = this.hooks.enemyById(challengerId);
        if (defender && challenger) {
          const result = this.resolveNpcMatch(challenger, defender, true);
          result.winner.wins += 1;
          result.loser.losses += 1;
          recordNpcEncounter(this.save.npcLife!, result.winner, result.loser, {
            day: this.save.worldDay,
            kind: "duel",
          });
          this.hooks.awardCrownSeason(
            result.winner.id,
            result.winner.id === defender.id ? "defense" : "win",
          );
          this.hooks.awardCrownSeason(result.loser.id, "loss");
          if (result.winner.id === challenger.id) {
            this.hooks.swapEliteMembers(challenger.id, defender.id);
            this.hooks.event(
              "battle",
              `${challenger.name} победил легенду ${defender.name} и занял место #${defenderIndex + 1}.`,
            );
          }
        }
      }
    }

    if (this.hooks.registeredCrownLeagueDay() === this.save.worldDay) {
      this.hooks.syncCrownSet();
      return;
    }
    const lastLeague = this.save.lastCrownLeagueDay ?? 0;
    if (
      this.save.worldDay % this.hooks.crownLeagueInterval() !== 0 ||
      this.save.worldDay === lastLeague
    ) {
      this.hooks.syncCrownSet();
      return;
    }
    const elite = new Set(this.save.eliteLeagueMemberIds);
    const candidate = this.save.enemies
      .filter(
        (enemy) =>
          enemy.alive &&
          !elite.has(enemy.id) &&
          enemy.arenaIndex === ARENAS.length - 1 &&
          enemy.tournamentWins > 0,
      )
      .sort(
        (a, b) =>
          b.rating - a.rating ||
          this.hooks.enemyPower(b) - this.hooks.enemyPower(a),
      )[0];
    if (!candidate) return;
    const contestants = [
      candidate,
      ...this.save.eliteLeagueMemberIds
        .filter((id) => id !== "hero")
        .slice(0, ELITE_SIZE - 1)
        .map((id) => this.hooks.enemyById(id))
        .filter((enemy): enemy is EnemyProfile => Boolean(enemy)),
    ].sort(
      (first, second) =>
        this.hooks.fighterTournamentSeed(second) -
        this.hooks.fighterTournamentSeed(first),
    );
    if (contestants.length !== ELITE_SIZE) return;
    const bracket = TournamentEngine.run(
      contestants,
      (first, second) => {
        const { winner, loser } = this.resolveNpcMatch(
          first,
          second,
          true,
          this.save.crownSeason.ruleIds,
        );
        winner.wins += 1;
        loser.losses += 1;
        this.hooks.adjustEliteRating(winner.id, 8);
        this.hooks.adjustEliteRating(loser.id, -3);
        this.hooks.awardCrownSeason(winner.id, "win");
        this.hooks.awardCrownSeason(loser.id, "loss");
        return { winner };
      },
      { seeded: true },
    );
    const champion = bracket.champion;
    this.hooks.awardCrownSeason(champion.id, "champion");
    this.hooks.recordEquipmentDeeds(
      champion,
      "championship",
      `Лига короны, день ${this.save.worldDay}`,
    );
    champion.tournamentWins += 1;
    this.save.eliteCrownWins[champion.id] =
      (this.save.eliteCrownWins[champion.id] ?? 0) + 1;
    if (champion.id === candidate.id) this.hooks.promoteIntoElite(candidate.id);
    else this.hooks.sortEliteByRating();
    this.save.lastCrownLeagueDay = this.save.worldDay;
    this.hooks.event(
      "tournament",
      `Фоновую Лигу короны выиграл ${champion.name}. ${candidate.name} ${champion.id === candidate.id ? "вошёл в элиту" : "остался в обычном рейтинге"}.`,
      {
        kind: "tournament",
        tournamentId: "crown-league",
        tournamentName: "Лига короны",
        championId: champion.id,
        championName: champion.name,
        participants: contestants.length,
      },
    );
    this.hooks.syncCrownSet();
  }

  public syncFutureBosses(): void {
    const life = (this.save.npcLife = normalizeNpcLifeWorldState(
      this.save.npcLife,
      this.save.enemies,
      this.save.worldDay,
    ));
    refreshFutureBossAvailability(life, this.save.worldDay).forEach((boss) => {
      this.hooks.event(
        "promotion",
        `${boss.name} появился среди особых противников. ${boss.reason}`,
      );
    });
  }

  public syncFactionHunter(): void {
    const current = this.hooks.factionHunter();
    if (current?.alive) return;
    this.save.pendingFactionHunterId = undefined;
    if (this.save.worldDay < 10 || this.save.hero.highestArena < 1) return;
    const relations = this.save.factionControl?.relations;
    const hostile = FACTIONS.map((faction) => ({
      faction,
      hostility: factionHostility(
        this.save.hero.factionReputation,
        faction.id,
        relations,
      ),
    })).sort((first, second) => second.hostility - first.hostility)[0];
    if (!hostile || hostile.hostility < 35) return;
    const interval = Math.max(5, 11 - Math.floor(hostile.hostility / 14));
    if (
      this.save.worldDay % interval !== 0 ||
      !this.random.world.chance(Math.min(0.9, 0.38 + hostile.hostility / 160))
    )
      return;
    const heroPower = this.hooks.heroPower();
    const candidates = this.save.enemies
      .filter(
        (enemy) =>
          enemy.alive &&
          enemy.factionId === hostile.faction.id &&
          !this.save.eliteLeagueMemberIds.includes(enemy.id),
      )
      .sort((first, second) => {
        const firstVengeance = first.goal === "vengeance" ? -250 : 0;
        const secondVengeance = second.goal === "vengeance" ? -250 : 0;
        return (
          Math.abs(this.hooks.enemyPower(first) - heroPower) +
          firstVengeance -
          (Math.abs(this.hooks.enemyPower(second) - heroPower) +
            secondVengeance)
        );
      });
    if (candidates.length === 0) return;
    const hunter =
      candidates[this.random.world.int(0, Math.min(3, candidates.length - 1))];
    this.save.pendingFactionHunterId = hunter.id;
    hunter.goal = "vengeance";
    const profile = this.save.npcLife?.profiles[hunter.id];
    if (profile) profile.revengeTargetId = "hero";
    this.hooks.recordEnemyHistory(
      hunter,
      `${hostile.faction.name} отправила его охотиться на ${this.save.hero.name}.`,
    );
    this.hooks.event(
      "battle",
      `${hostile.faction.name} выставила охотника ${hunter.name} против ${this.save.hero.name}.`,
    );
  }

  public npcExperienceReward(baseExperience: number): number {
    return Math.max(
      0,
      Math.round(
        baseExperience *
          worldSeasonRule(this.save.worldSeason?.ruleId)
            .npcExperienceMultiplier,
      ),
    );
  }

  public progressEnemy(enemy: EnemyProfile, recordEvent = true): void {
    while (enemy.experience >= enemyExperienceRequirement(enemy.level)) {
      enemy.experience -= enemyExperienceRequirement(enemy.level);
      enemy.level += 1;
    }
    const nextArena = ARENAS[enemy.arenaIndex + 1];
    if (
      nextArena &&
      enemy.arenaWins >= ARENAS[enemy.arenaIndex].winsToAdvance &&
      enemy.level >= nextArena.minLevel
    ) {
      const old = ARENAS[enemy.arenaIndex].name;
      enemy.arenaIndex += 1;
      enemy.arenaWins = 0;
      this.hooks.recordEnemyHistory(
        enemy,
        `Перешёл с арены «${old}» на «${nextArena.name}».`,
      );
      if (recordEvent)
        this.hooks.event(
          "promotion",
          `${enemy.name} покинул арену «${old}» и поднялся на «${nextArena.name}».`,
          {
            kind: "promotion",
            fighterId: enemy.id,
            fighterName: enemy.name,
            fromArena: old,
            toArena: nextArena.name,
          },
        );
    }
    enemy.rating = this.hooks.enemyWorldRating(enemy);
  }
}
