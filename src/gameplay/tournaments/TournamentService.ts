import { ARENAS, ENDGAME_ACTIVITIES } from "../../catalogs/WorldCatalog";
import { TOURNAMENT_RULES } from "../../catalogs/WorldExpansionCatalog";
import { ItemCreationOptions } from "../../factories/ItemFactory";
import { BattleSession, CombatOptions } from "../combat/AdvancedBattle";
import type { NpcCombatResult } from "../combat/NpcCombat";
import { ELITE_SIZE } from "../core/WorldGameConfig";
import { WorldRandomStreams } from "../core/WorldRandom";
import {
  ActivityAvailability,
  BattleReport,
  ContractObjective,
  DailyActivityReport,
  EnemyProfile,
  EquipmentItem,
  ExpeditionStepReport,
  GameSave,
  HeroProfile,
  PendingBattle,
  PendingBattleFinalization,
  PendingTournamentState,
  Rarity,
  SkillDefinition,
  TournamentMatch,
  TournamentReport,
  WorldEvent,
} from "../core/WorldTypes";
import { EquipmentDeedKind } from "../equipment/EquipmentEvolution";
import {
  eraLawModifiers,
  improveMinimumRarity,
  RewardContext,
} from "../progression/NewGamePlus";
import { StructuredWorldEventPayload } from "../world/WorldEvents";
import { awardWorldSeasonPoints, worldSeasonRule } from "../world/WorldSeason";
import { pendingOpeningRound } from "./TournamentBracket";

interface TournamentServiceHooks {
  runPendingBattleAutomatically():
    | BattleReport
    | DailyActivityReport
    | TournamentReport
    | ExpeditionStepReport
    | undefined;
  assertNoPendingBattle(): void;
  tournamentRules(arenaId: string, day?: number): typeof TOURNAMENT_RULES;
  prepareDayActivity(): void;
  enemyPower(enemy: EnemyProfile): number;
  heroPower(): number;
  latestEventId(): string | undefined;
  enemyById(id: string): EnemyProfile | undefined;
  createPendingBattle(
    kind: PendingBattle["kind"],
    activityId: string,
    enemy: EnemyProfile,
    options: CombatOptions,
    combatContext:
      "arena" | "dungeon" | "duel" | "boss" | "crown-league" | "legend-hunt",
    tournament?: PendingTournamentState,
    pendingContext?: PendingBattle["context"],
    heroOverride?: HeroProfile,
  ): PendingBattle;
  resolveNpcMatch(
    first: EnemyProfile,
    second: EnemyProfile,
    forceFull?: boolean,
    ruleIds?: string[],
  ): NpcCombatResult;
  recordHeroEncounter(
    enemy: EnemyProfile,
    heroWon: boolean,
    turns: BattleReport["turns"],
    killed?: boolean,
  ): void;
  recordMutationVictory(enemy: EnemyProfile, heroWon: boolean): void;
  updateEnemyAfterPlayerBattle(
    enemy: EnemyProfile,
    heroWon: boolean,
    died: boolean,
    arenaMatch?: boolean,
  ): void;
  adjustEliteRating(id: string, amount: number): void;
  awardCrownSeason(
    fighterId: string,
    result: "win" | "loss" | "defense" | "champion",
  ): void;
  fighterById(id: string): HeroProfile | EnemyProfile | undefined;
  npcExperienceReward(baseExperience: number): number;
  recordNpcRivalry(winner: EnemyProfile, loser: EnemyProfile): void;
  addFactionInfluence(
    enemy: EnemyProfile,
    arenaIndex: number,
    amount: number,
  ): void;
  progressEnemy(enemy: EnemyProfile, recordEvent?: boolean): void;
  recordEquipmentDeeds(
    fighter: HeroProfile | EnemyProfile,
    kind: EquipmentDeedKind,
    witness: string,
  ): void;
  controlledArenaReward(
    arenaId: string,
    reward: { experience: number; gold: number },
  ): { experience: number; gold: number };
  factionAdjustedReward(
    reward: { experience: number; gold: number },
    modifier: "tournamentReward" | "bossReward" | "contractReward",
    factionId?: string,
  ): { experience: number; gold: number };
  epochRewards(
    baseExperience: number,
    baseGold: number,
    context: RewardContext,
  ): { experience: number; gold: number };
  gainHeroExperience(amount: number, levelCap?: number): number;
  addHeroFactionInfluence(arenaIndex: number, amount: number): void;
  createRewardItem(
    level: number,
    options: Omit<ItemCreationOptions, "randomSource">,
    targetChanceBonus?: number,
  ): EquipmentItem;
  addItem(item: EquipmentItem): void;
  advanceContract(objective: ContractObjective): void;
  recordArenaChampionship(enemy: EnemyProfile, arenaIndex: number): void;
  maybeAwakenWorldRelic(enemy: EnemyProfile, force: boolean): void;
  recordEnemyHistory(enemy: EnemyProfile, message: string): void;
  enemyWorldRating(enemy: EnemyProfile): number;
  recalculateHeroRating(): void;
  event(
    type: WorldEvent["type"],
    message: string,
    payload?: StructuredWorldEventPayload,
  ): void;
  applyOfficialTournamentRecovery(): void;
  completeDay(skipTournamentArenaId?: string): void;
  eventsSince(cursor?: string): WorldEvent[];
  promoteIntoElite(id: string): void;
  sortEliteByRating(): void;
  syncCrownSet(): void;
  crownLeagueAvailability(): ActivityAvailability;
  ensureEliteLeague(): void;
  heroEliteRank(): number | undefined;
  fighterTournamentSeed(fighter: HeroProfile | EnemyProfile): number;
}

export class TournamentService {
  constructor(
    private readonly save: GameSave,
    private readonly random: WorldRandomStreams,
    private readonly hooks: TournamentServiceHooks,
  ) {}
  public playTournament(arenaId: string): TournamentReport {
    this.beginTournament(arenaId);
    const result = this.hooks.runPendingBattleAutomatically();
    if (!result || !("matches" in result))
      throw new Error("Автоматический расчёт турнира не вернул результат.");
    return result;
  }

  public beginTournament(arenaId: string): PendingBattle {
    this.hooks.assertNoPendingBattle();
    const arenaIndex = ARENAS.findIndex(
      (candidate) => candidate.id === arenaId,
    );
    const arena = ARENAS[arenaIndex];
    if (!arena) throw new Error("Турнир не найден.");
    const ruleIds = this.hooks.tournamentRules(arenaId).map((rule) => rule.id);
    if (this.save.tournamentRegistrations[arenaId] !== this.save.worldDay) {
      throw new Error(
        "На этот турнир нет действующей записи или его день ещё не наступил.",
      );
    }
    this.hooks.prepareDayActivity();
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    const controllerId = this.save.factionControl?.arenaControllers[arena.id];
    const candidates = this.save.enemies.filter(
      (enemy) =>
        enemy.alive &&
        enemy.arenaIndex === arenaIndex &&
        !eliteIds.has(enemy.id),
    );
    const byComparablePower = (
      first: EnemyProfile,
      second: EnemyProfile,
    ): number =>
      Math.abs(this.hooks.enemyPower(first) - this.hooks.heroPower()) -
      Math.abs(this.hooks.enemyPower(second) - this.hooks.heroPower());
    const controlledSlots = controllerId
      ? Math.floor((arena.participants - 1) / 2)
      : 0;
    const controlled = candidates
      .filter((enemy) => enemy.factionId === controllerId)
      .sort(byComparablePower)
      .slice(0, controlledSlots);
    const controlledIds = new Set(controlled.map((enemy) => enemy.id));
    const pool = [
      ...controlled,
      ...candidates
        .filter((enemy) => !controlledIds.has(enemy.id))
        .sort(byComparablePower),
    ];
    if (pool.length < arena.participants - 1) {
      throw new Error(
        `На арене пока недостаточно бойцов: ${pool.length + 1}/${arena.participants}. Мир пополнит состав на следующий день.`,
      );
    }
    const participantIds = [
      "hero",
      ...pool.slice(0, arena.participants - 1).map((enemy) => enemy.id),
    ];
    const initialSeeds = this.random.world.shuffle(participantIds);
    const tournament: PendingTournamentState = {
      kind: "arena",
      activityId: arena.id,
      participantIds,
      initialSeeds,
      round: 1,
      pairs: pendingOpeningRound(initialSeeds),
      pairIndex: 0,
      roundWinners: [],
      matches: [],
      heroBattles: [],
      heroPlacement: arena.participants,
      ruleIds,
      eventCursor: this.hooks.latestEventId(),
    };
    const advanced = this.advancePendingTournament(tournament);
    if (!("session" in advanced))
      throw new Error("Турнир завершился без боя главного героя.");
    return advanced;
  }

  public advancePendingTournament(
    state: PendingTournamentState,
  ): PendingBattle | TournamentReport {
    while (true) {
      if (state.pairIndex >= state.pairs.length) {
        if (state.roundWinners.length === 1) {
          return state.kind === "arena"
            ? this.completePendingArenaTournament(state, state.roundWinners[0])
            : this.completePendingCrownTournament(state, state.roundWinners[0]);
        }
        const winners = [...state.roundWinners];
        state.round += 1;
        state.pairs = [];
        for (let index = 0; index < winners.length; index += 2)
          state.pairs.push([winners[index], winners[index + 1]]);
        state.pairIndex = 0;
        state.roundWinners = [];
      }
      const [firstId, secondId] = state.pairs[state.pairIndex];
      if (!secondId) {
        state.roundWinners.push(firstId);
        state.matches.push({
          round: state.round,
          match: state.pairIndex + 1,
          firstId,
          winnerId: firstId,
          heroInvolved: firstId === "hero",
          bye: true,
        });
        state.pairIndex += 1;
        continue;
      }
      if (firstId === "hero" || secondId === "hero") {
        const enemyId = firstId === "hero" ? secondId : firstId;
        const enemy = this.hooks.enemyById(enemyId);
        if (!enemy)
          throw new Error("Соперник из турнирной сетки больше не существует.");
        const arena = ARENAS.find(
          (candidate) => candidate.id === state.activityId,
        );
        const options: CombatOptions =
          state.kind === "arena"
            ? {
                heroLevelCap:
                  (arena?.enemyLevel[1] ?? this.save.hero.level) + 1,
                enemyLevelCap:
                  (arena?.enemyLevel[1] ?? this.save.hero.level) + 1,
                ruleIds: state.ruleIds,
              }
            : { ruleIds: state.ruleIds };
        return this.hooks.createPendingBattle(
          state.kind === "arena" ? "arena-tournament" : "crown-league",
          state.activityId,
          enemy,
          options,
          state.kind === "arena" ? "arena" : "crown-league",
          state,
        );
      }
      const first = this.hooks.enemyById(firstId);
      const second = this.hooks.enemyById(secondId);
      if (!first || !second)
        throw new Error("Участник турнирной сетки больше не существует.");
      const outcome = this.hooks.resolveNpcMatch(
        first,
        second,
        state.kind === "crown" || state.pairs.length <= 2,
        state.ruleIds,
      );
      const winnerId = outcome.winner.id;
      state.roundWinners.push(winnerId);
      state.matches.push({
        round: state.round,
        match: state.pairIndex + 1,
        firstId,
        secondId,
        winnerId,
        heroInvolved: false,
        bye: false,
      });
      state.pairIndex += 1;
    }
  }

  public finalizePendingTournamentBattle(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    const state = pending.tournament;
    if (!state) throw new Error("Состояние турнирной сетки отсутствует.");
    const enemy = this.hooks.enemyById(pending.enemyId);
    if (!enemy)
      throw new Error("Соперник из турнирной сетки больше не существует.");
    const combat = session.resolution();
    const heroWon = combat.winnerId === "hero";
    const arena = ARENAS.find((candidate) => candidate.id === state.activityId);
    const activity =
      state.kind === "arena"
        ? arena
        : ENDGAME_ACTIVITIES.find(
            (candidate) => candidate.id === "crown-league",
          );
    if (!activity)
      throw new Error("Активность сохранённого турнира больше не существует.");
    const enemyDied =
      state.kind === "arena" && heroWon && arena
        ? this.random.world.chance(
            Math.min(
              0.3,
              arena.lethalChance *
                eraLawModifiers(this.save.legacy.activeLawIds)
                  .arenaLethalityMultiplier *
                worldSeasonRule(this.save.worldSeason?.ruleId)
                  .lethalityMultiplier,
            ),
          )
        : false;
    const battle: BattleReport = {
      activity,
      heroBefore: combat.hero,
      enemyBefore: combat.enemy,
      winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero",
      heroWon,
      enemyDied,
      turns: combat.turns,
      analysis: combat.analysis,
      rewards: { experience: 0, gold: 0, levelsGained: 0, unlockedSkills: [] },
      worldEvents: [],
      ruleIds: state.ruleIds,
    };
    if (heroWon) {
      this.save.hero.wins += 1;
      this.save.hero.tournamentMatchWins += 1;
    } else {
      this.save.hero.losses += 1;
      this.save.hero.tournamentMatchLosses += 1;
    }
    this.hooks.recordHeroEncounter(enemy, heroWon, combat.turns, enemyDied);
    this.hooks.recordMutationVictory(enemy, heroWon);
    this.hooks.updateEnemyAfterPlayerBattle(enemy, heroWon, enemyDied);
    if (state.kind === "crown") {
      this.hooks.adjustEliteRating("hero", heroWon ? 12 : -5);
      this.hooks.adjustEliteRating(enemy.id, heroWon ? -5 : 12);
      this.hooks.awardCrownSeason(heroWon ? "hero" : enemy.id, "win");
      this.hooks.awardCrownSeason(heroWon ? enemy.id : "hero", "loss");
    } else if (arena) {
      awardWorldSeasonPoints(
        this.save.worldSeason!,
        arena.id,
        heroWon ? "hero" : enemy.id,
        "win",
        heroWon ? this.save.hero.name : enemy.name,
      );
      awardWorldSeasonPoints(
        this.save.worldSeason!,
        arena.id,
        heroWon ? enemy.id : "hero",
        "loss",
        heroWon ? enemy.name : this.save.hero.name,
      );
    }
    const [firstId, secondId] = state.pairs[state.pairIndex];
    const winnerId = heroWon ? "hero" : enemy.id;
    state.matches.push({
      round: state.round,
      match: state.pairIndex + 1,
      firstId,
      secondId,
      winnerId,
      heroInvolved: true,
      battle,
      bye: false,
    });
    state.heroBattles.push(battle);
    state.roundWinners.push(winnerId);
    if (!heroWon) {
      const size = state.kind === "arena" ? arena!.participants : ELITE_SIZE;
      state.heroPlacement = Math.max(
        2,
        Math.floor(size / 2 ** (state.round - 1)),
      );
    }
    state.pairIndex += 1;
    this.save.pendingBattle = undefined;
    const advanced = this.advancePendingTournament(state);
    if ("session" in advanced)
      return { status: "next-battle", battle, pendingBattle: advanced };
    return { status: "complete", battle, result: advanced };
  }

  public tournamentMatches(state: PendingTournamentState): TournamentMatch[] {
    return state.matches
      .filter((match) => !match.bye)
      .map((match) => {
        const first = this.hooks.fighterById(match.firstId);
        const second = match.secondId
          ? this.hooks.fighterById(match.secondId)
          : undefined;
        const winner = this.hooks.fighterById(match.winnerId);
        return {
          round: match.round,
          match: match.match,
          firstName: first?.name ?? match.firstId,
          secondName: second?.name ?? "Автоматический проход",
          winnerName: winner?.name ?? match.winnerId,
          heroInvolved: match.heroInvolved,
          battle: match.battle,
          bye: match.bye,
        };
      });
  }

  public applyPendingNpcArenaMatches(
    state: PendingTournamentState,
    arenaIndex: number,
  ): void {
    state.matches
      .filter((match) => !match.heroInvolved && !match.bye && match.secondId)
      .forEach((match) => {
        const winner = this.hooks.enemyById(match.winnerId);
        const loserId =
          match.winnerId === match.firstId ? match.secondId! : match.firstId;
        const loser = this.hooks.enemyById(loserId);
        if (!winner || !loser) return;
        winner.wins += 1;
        winner.arenaWins += 1;
        winner.experience += this.hooks.npcExperienceReward(
          65 + arenaIndex * 24,
        );
        winner.gold = (winner.gold ?? 0) + 24 + arenaIndex * 12;
        loser.losses += 1;
        this.hooks.recordNpcRivalry(winner, loser);
        this.hooks.addFactionInfluence(winner, arenaIndex, 1);
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
        this.hooks.progressEnemy(winner, false);
      });
  }

  public completePendingArenaTournament(
    state: PendingTournamentState,
    championId: string,
  ): TournamentReport {
    const arenaIndex = ARENAS.findIndex(
      (candidate) => candidate.id === state.activityId,
    );
    const arena = ARENAS[arenaIndex];
    if (!arena)
      throw new Error("Арена сохранённого турнира больше не существует.");
    this.applyPendingNpcArenaMatches(state, arenaIndex);
    const champion = this.hooks.fighterById(championId);
    if (!champion)
      throw new Error("Чемпион сохранённого турнира больше не существует.");
    const heroWon = championId === "hero";
    if (heroWon) {
      state.heroPlacement = 1;
      this.hooks.recordEquipmentDeeds(
        this.save.hero,
        "championship",
        `${arena.name}, день ${this.save.worldDay}`,
      );
    }
    const roundsWon = state.heroBattles.filter(
      (battle) => battle.heroWon,
    ).length;
    const baseExperience = heroWon
      ? arena.rewardExperience
      : Math.round(arena.rewardExperience * (0.12 + roundsWon * 0.13));
    const baseGold = heroWon
      ? arena.rewardGold
      : Math.round(arena.rewardGold * roundsWon * 0.04);
    const controlledReward = this.hooks.controlledArenaReward(
      arena.id,
      this.hooks.factionAdjustedReward(
        this.hooks.epochRewards(baseExperience, baseGold, "arena"),
        "tournamentReward",
      ),
    );
    const { experience, gold } = controlledReward;
    const levelsGained = this.hooks.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      this.save.hero.arenaWins[arenaIndex] += 1;
      this.hooks.addHeroFactionInfluence(arenaIndex, 8 + arenaIndex * 2);
      if (
        this.save.hero.arenaWins[arenaIndex] >= arena.winsToAdvance &&
        arenaIndex < ARENAS.length - 1
      ) {
        this.save.hero.highestArena = Math.max(
          this.save.hero.highestArena,
          arenaIndex + 1,
        );
      }
      const baseMinimum: Rarity =
        arenaIndex >= 4 ? "legendary" : arenaIndex >= 2 ? "epic" : "rare";
      const minimum =
        this.save.factionControl?.arenaControllers[arena.id] === "red-ledger"
          ? improveMinimumRarity(baseMinimum, 1)
          : baseMinimum;
      item = this.hooks.createRewardItem(
        Math.min(this.save.hero.level + 2, arena.enemyLevel[1] + 1),
        { classId: this.save.hero.classId, minimumRarity: minimum },
      );
      this.hooks.addItem(item);
      if (arenaIndex >= 2) {
        temperingMarks = arenaIndex === ARENAS.length - 1 ? 2 : 1;
        this.save.hero.temperingMarks += temperingMarks;
      }
      this.hooks.advanceContract("tournament");
    } else {
      const npcChampion = champion as EnemyProfile;
      this.hooks.recordArenaChampionship(npcChampion, arenaIndex);
      npcChampion.gold = (npcChampion.gold ?? 0) + arena.rewardGold;
      this.hooks.addFactionInfluence(
        npcChampion,
        arenaIndex,
        14 + arenaIndex * 2,
      );
      this.hooks.maybeAwakenWorldRelic(npcChampion, false);
      this.hooks.recordEnemyHistory(
        npcChampion,
        `Стал чемпионом турнира «${arena.name}» в день ${this.save.worldDay}.`,
      );
      npcChampion.rating = this.hooks.enemyWorldRating(npcChampion);
    }
    awardWorldSeasonPoints(
      this.save.worldSeason!,
      arena.id,
      championId,
      "champion",
      champion.name,
    );
    this.hooks.recalculateHeroRating();
    this.hooks.event(
      "tournament",
      `«${arena.name}» завершён. Чемпион: ${champion.name}. Участников: ${arena.participants}.`,
      {
        kind: "tournament",
        tournamentId: arena.id,
        tournamentName: arena.name,
        championId: champion.id,
        championName: champion.name,
        participants: arena.participants,
      },
    );
    this.hooks.applyOfficialTournamentRecovery();
    delete this.save.tournamentRegistrations[arena.id];
    this.save.pendingBattle = undefined;
    this.hooks.completeDay(arena.id);
    return {
      activity: arena,
      day: this.save.worldDay - 1,
      participantCount: arena.participants,
      matches: this.tournamentMatches(state),
      heroBattles: state.heroBattles,
      championName: champion.name,
      heroWon,
      heroPlacement: state.heroPlacement,
      rewards: {
        experience,
        gold,
        item,
        levelsGained,
        unlockedSkills: [],
        temperingMarks,
      },
      worldEvents: this.hooks.eventsSince(state.eventCursor),
      ruleIds: state.ruleIds,
    };
  }

  public completePendingCrownTournament(
    state: PendingTournamentState,
    championId: string,
  ): TournamentReport {
    const activity = ENDGAME_ACTIVITIES.find(
      (candidate) => candidate.id === "crown-league",
    )!;
    const wasElite = Boolean(state.wasElite);

    state.matches
      .filter((match) => !match.heroInvolved && !match.bye && match.secondId)
      .forEach((match) => {
        const winner = this.hooks.enemyById(match.winnerId);
        const loserId =
          match.winnerId === match.firstId ? match.secondId! : match.firstId;
        const loser = this.hooks.enemyById(loserId);
        if (!winner || !loser) return;
        winner.wins += 1;
        winner.experience += 150;
        loser.losses += 1;
        this.hooks.adjustEliteRating(winner.id, 12);
        this.hooks.adjustEliteRating(loser.id, -5);
        this.hooks.awardCrownSeason(winner.id, "win");
        this.hooks.awardCrownSeason(loser.id, "loss");
        this.hooks.progressEnemy(winner, false);
      });

    const champion = this.hooks.fighterById(championId);
    if (!champion)
      throw new Error("Чемпион сохранённой Лиги короны больше не существует.");
    this.hooks.recordEquipmentDeeds(
      champion,
      "championship",
      `Лига короны, день ${this.save.worldDay}`,
    );
    this.hooks.awardCrownSeason(champion.id, "champion");
    const heroWon = championId === "hero";
    if (heroWon) state.heroPlacement = 1;
    if (!heroWon) {
      const npc = champion as EnemyProfile;
      npc.tournamentWins += 1;
      this.save.eliteCrownWins[npc.id] =
        (this.save.eliteCrownWins[npc.id] ?? 0) + 1;
    }

    const roundsWon = state.heroBattles.filter(
      (battle) => battle.heroWon,
    ).length;
    const baseExperience = heroWon
      ? activity.rewardExperience
      : Math.round(activity.rewardExperience * (0.12 + roundsWon * 0.12));
    const baseGold = heroWon
      ? activity.rewardGold
      : Math.round(activity.rewardGold * roundsWon * 0.05);
    const { experience, gold } = this.hooks.factionAdjustedReward(
      this.hooks.epochRewards(baseExperience, baseGold, "crown-league"),
      "tournamentReward",
    );
    const levelsGained = this.hooks.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    let temperingMarks = roundsWon > 0 ? 1 : 0;
    if (heroWon) {
      this.save.hero.crownLeagueWins += 1;
      this.save.hero.crownLeaguePoints += 20;
      temperingMarks = 4;
      item = this.hooks.createRewardItem(this.save.hero.level + 2, {
        classId: this.save.hero.classId,
        minimumRarity: "mythic",
      });
      this.hooks.addItem(item);
      if (!wasElite) this.hooks.promoteIntoElite("hero");
      else this.hooks.adjustEliteRating("hero", 28);
      this.hooks.advanceContract("tournament");
    } else if (wasElite) {
      this.save.hero.crownLeaguePoints += roundsWon * 3;
    }
    this.save.hero.temperingMarks += temperingMarks;
    this.save.lastCrownLeagueDay = this.save.worldDay;
    delete this.save.tournamentRegistrations["crown-league"];
    if (wasElite || !heroWon) this.hooks.sortEliteByRating();
    this.hooks.syncCrownSet();
    this.hooks.event(
      "tournament",
      `Лига короны завершена. Чемпион: ${champion.name}. Сетка: ${ELITE_SIZE} бойцов.`,
      {
        kind: "tournament",
        tournamentId: activity.id,
        tournamentName: activity.name,
        championId: champion.id,
        championName: champion.name,
        participants: ELITE_SIZE,
      },
    );
    this.hooks.applyOfficialTournamentRecovery();
    this.save.pendingBattle = undefined;
    this.hooks.completeDay();
    this.hooks.recalculateHeroRating();
    const rewards = {
      experience,
      gold,
      item,
      levelsGained,
      unlockedSkills: [] as SkillDefinition[],
      temperingMarks,
    };
    const finalBattle = state.heroBattles[state.heroBattles.length - 1];
    if (finalBattle) finalBattle.rewards = rewards;
    return {
      activity,
      day: this.save.worldDay - 1,
      participantCount: ELITE_SIZE,
      matches: this.tournamentMatches(state),
      heroBattles: state.heroBattles,
      championName: champion.name,
      heroWon,
      heroPlacement: state.heroPlacement,
      rewards,
      worldEvents: this.hooks.eventsSince(state.eventCursor),
      ruleIds: state.ruleIds,
    };
  }

  public playCrownLeague(): TournamentReport {
    this.beginCrownLeague();
    const result = this.hooks.runPendingBattleAutomatically();
    if (!result || !("matches" in result))
      throw new Error("Автоматический расчёт Лиги короны не вернул результат.");
    return result;
  }

  public beginCrownLeague(): PendingBattle {
    this.hooks.assertNoPendingBattle();
    const availability = this.hooks.crownLeagueAvailability();
    if (!availability.unlocked) throw new Error(availability.reason);
    this.hooks.prepareDayActivity();
    this.hooks.ensureEliteLeague();
    const wasElite = Boolean(this.hooks.heroEliteRank());
    const rosterIds = wasElite
      ? [...this.save.eliteLeagueMemberIds]
      : ["hero", ...this.save.eliteLeagueMemberIds.slice(0, ELITE_SIZE - 1)];
    const initialSeeds = rosterIds
      .map((id) => this.hooks.fighterById(id))
      .filter((fighter): fighter is HeroProfile | EnemyProfile =>
        Boolean(fighter),
      )
      .sort(
        (first, second) =>
          this.hooks.fighterTournamentSeed(second) -
          this.hooks.fighterTournamentSeed(first),
      )
      .map((fighter) => fighter.id);
    if (
      initialSeeds.length !== ELITE_SIZE ||
      new Set(initialSeeds).size !== ELITE_SIZE
    ) {
      throw new Error("Элитная сетка ещё не собрана.");
    }
    const tournament: PendingTournamentState = {
      kind: "crown",
      activityId: "crown-league",
      participantIds: [...initialSeeds],
      initialSeeds,
      round: 1,
      pairs: pendingOpeningRound(initialSeeds),
      pairIndex: 0,
      roundWinners: [],
      matches: [],
      heroBattles: [],
      heroPlacement: ELITE_SIZE,
      ruleIds: [...this.save.crownSeason.ruleIds],
      wasElite,
      eventCursor: this.hooks.latestEventId(),
    };
    const advanced = this.advancePendingTournament(tournament);
    if (!("session" in advanced))
      throw new Error("Лига короны завершилась без боя главного героя.");
    return advanced;
  }
}
