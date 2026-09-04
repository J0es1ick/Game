import { ARENAS } from "../../catalogs/WorldCatalog";
import { TOURNAMENT_RULES } from "../../catalogs/WorldExpansionCatalog";
import { SeededRandom } from "../core/RandomSource";
import { WorldRandomStreams } from "../core/WorldRandom";
import {
  EnemyProfile,
  GameSave,
  HeroProfile,
  WorldEvent,
} from "../core/WorldTypes";
import { createCrownSeason } from "./CrownSeason";
import { createFactionControlState } from "./LivingWorld";
import {
  advanceNpcCareerSeason,
  cleanupNpcLifeReferences,
  normalizeNpcLifeWorldState,
} from "./NpcLifeSimulation";
import { StructuredWorldEventPayload } from "./WorldEvents";
import {
  closeWorldSeason,
  createWorldSeason,
  worldSeasonRule,
} from "./WorldSeason";
interface SeasonServiceHooks {
  event(
    type: WorldEvent["type"],
    message: string,
    payload?: StructuredWorldEventPayload,
  ): void;
  fighterById(id: string): HeroProfile | EnemyProfile | undefined;
  fighterTournamentSeed(fighter: HeroProfile | EnemyProfile): number;
  recordEnemyHistory(enemy: EnemyProfile, message: string): void;
  releaseWorldRelics(enemy: EnemyProfile, history: string): void;
  createEnemy(arenaIndex: number, newcomer: boolean): EnemyProfile;
  enemyById(id: string): EnemyProfile | undefined;
  enemyWorldRating(enemy: EnemyProfile): number;
  ensurePopulations(immediately: boolean, routine: boolean): void;
}
export class SeasonService {
  constructor(
    private readonly save: GameSave,
    private readonly random: WorldRandomStreams,
    private readonly hooks: SeasonServiceHooks,
  ) {}
  public syncCrownSeason(): void {
    if (this.save.worldDay <= this.save.crownSeason.endsDay) return;
    const completed = this.save.crownSeason;
    const standings = Object.entries(completed.points)
      .map(([fighterId, points]) => ({
        fighterId,
        points,
        defenses: completed.defenses[fighterId] ?? 0,
        seed: this.hooks.fighterById(fighterId)
          ? this.hooks.fighterTournamentSeed(this.hooks.fighterById(fighterId)!)
          : 0,
      }))
      .sort(
        (first, second) =>
          second.points - first.points ||
          second.defenses - first.defenses ||
          second.seed - first.seed ||
          first.fighterId.localeCompare(second.fighterId),
      );
    const heroIndex = standings.findIndex(
      (entry) => entry.fighterId === "hero",
    );
    const heroRank = heroIndex >= 0 ? heroIndex + 1 : undefined;
    const heroPoints = heroIndex >= 0 ? standings[heroIndex].points : 0;
    const rewardGold =
      heroRank === 1
        ? 5_000
        : heroRank && heroRank <= 5
          ? 2_500
          : heroRank && heroRank <= 15
            ? 1_000
            : 0;
    const rewardTemperingMarks =
      heroRank === 1
        ? 3
        : heroRank && heroRank <= 5
          ? 2
          : heroRank && heroRank <= 15
            ? 1
            : 0;
    this.save.hero.gold += rewardGold;
    this.save.hero.temperingMarks += rewardTemperingMarks;
    const championId = standings[0]?.fighterId;
    const championName = championId
      ? this.hooks.fighterById(championId)?.name
      : undefined;
    this.save.lastCrownSeasonResult = {
      season: completed.number,
      completedDay: completed.endsDay,
      championId,
      championName,
      heroRank,
      heroPoints,
      rewardGold,
      rewardTemperingMarks,
    };
    this.hooks.event(
      "tournament",
      heroRank
        ? `Сезон ${completed.number} Лиги короны завершён. Место героя: #${heroRank}; награда: ${rewardGold} золота и ${rewardTemperingMarks} печ. закалки.`
        : `Сезон ${completed.number} Лиги короны завершён. Герой не набрал сезонных очков.`,
      {
        kind: "system",
        code: "crown-season-result",
        values: {
          season: completed.number,
          heroRank: heroRank ?? 0,
          heroPoints,
          rewardGold,
          rewardTemperingMarks,
        },
      },
    );
    const nextNumber = completed.number + 1;
    this.save.crownSeason = createCrownSeason(
      this.save.worldDay,
      nextNumber,
      TOURNAMENT_RULES.map((rule) => rule.id),
      new SeededRandom(
        `${this.save.tournamentRuleSeed}:crown-season:${nextNumber}`,
      ),
    );
    this.hooks.event(
      "tournament",
      `Начался сезон ${nextNumber} Лиги короны. Новые правила действуют до дня ${this.save.crownSeason.endsDay}.`,
      {
        kind: "system",
        code: "crown-season-start",
        values: { season: nextNumber, endsDay: this.save.crownSeason.endsDay },
      },
    );
  }

  public syncWorldSeason(): void {
    const season = this.save.worldSeason!;
    if (this.save.worldDay <= season.endsDay) return;
    const life = (this.save.npcLife = normalizeNpcLifeWorldState(
      this.save.npcLife,
      this.save.enemies,
      this.save.worldDay,
    ));
    const mentors = (this.save.mentors ??= []);
    const seasonLength = Math.max(7, season.endsDay - season.startsDay + 1);
    const career = advanceNpcCareerSeason(this.save.enemies, mentors, life, {
      day: this.save.worldDay,
      eliteIds: this.save.eliteLeagueMemberIds,
      random: this.random.world,
      seasonLength,
      maxRetirements: 2,
    });
    career.transitions.forEach((transition) => {
      const fighter = this.save.enemies.find(
        (candidate) => candidate.id === transition.fighterId,
      );
      if (fighter)
        this.hooks.recordEnemyHistory(fighter, transition.description);
      this.hooks.event("promotion", transition.description);
      const mentor = transition.mentorId
        ? mentors.find((candidate) => candidate.id === transition.mentorId)
        : undefined;
      if (transition.kind === "became-mentor" && fighter && !mentor?.competes) {
        this.hooks.releaseWorldRelics(
          fighter,
          `День ${this.save.worldDay}: ${fighter.name} завершил карьеру и передал реликвии следующему поколению.`,
        );
      }
    });
    career.mentorsCreated.forEach((mentor, index) => {
      const dynasty = career.dynastiesCreated.find(
        (candidate) => candidate.founderId === mentor.fighterId,
      );
      mentor.dynastyId = dynasty?.id;
      mentor.role =
        !mentor.competes && index === 0 && season.number % 3 === 0
          ? "shop-owner"
          : !mentor.competes && index === 0 && season.number % 3 === 2
            ? "faction-founder"
            : "mentor";
      if (mentor.role === "shop-owner") {
        const control = (this.save.factionControl ??= createFactionControlState(
          this.save.worldDay,
        ));
        control.shopOwnerMentorId = mentor.id;
        control.shopControllerId = mentor.factionId;
        control.shopPriceRevision = (control.shopPriceRevision ?? 0) + 1;
        this.hooks.event(
          "promotion",
          `${mentor.name} принял управление лавкой и открыл поставки своей школы.`,
        );
      }
      if (mentor.role === "faction-founder") {
        const control = (this.save.factionControl ??= createFactionControlState(
          this.save.worldDay,
        ));
        ARENAS.forEach((arena) => {
          control.arenaInfluence[arena.id] ??= {};
          control.arenaInfluence[arena.id][mentor.factionId] =
            (control.arenaInfluence[arena.id][mentor.factionId] ?? 0) + 6;
        });
        this.hooks.event(
          "promotion",
          `${mentor.name} превратил свою школу в новую силу внутри фракции.`,
        );
      }
    });

    const newcomerIds: string[] = [];
    const generationSize = season.ruleId === "new-blood" ? 2 : 1;
    ARENAS.forEach((arena, arenaIndex) => {
      for (let index = 0; index < generationSize; index += 1) {
        const newcomer = this.hooks.createEnemy(arenaIndex, true);
        const mentor = mentors
          .filter(
            (candidate) =>
              candidate.classId === newcomer.classId ||
              candidate.factionId === newcomer.factionId,
          )
          .sort((first, second) => second.rating - first.rating)[0];
        if (mentor) {
          newcomer.mentorId = mentor.id;
          mentor.studentIds = [...new Set([...mentor.studentIds, newcomer.id])];
          newcomer.relationships ??= {};
          newcomer.relationships[mentor.fighterId] = {
            fighterId: mentor.fighterId,
            kind: "mentor",
            intensity: 72,
            lastChangedDay: this.save.worldDay,
          };
          const profile = (life.profiles[newcomer.id] ??= {
            fighterId: newcomer.id,
            career: "active",
            seasonsActive: 0,
          });
          profile.dynastyId = mentor.dynastyId;
          const dynasty = life.dynasties.find(
            (candidate) => candidate.id === mentor.dynastyId,
          );
          if (dynasty)
            dynasty.memberIds = [
              ...new Set([...dynasty.memberIds, newcomer.id]),
            ];
          newcomer.history.push(`Принят в школу наставника ${mentor.name}.`);
        }
        this.save.enemies.push(newcomer);
        newcomerIds.push(newcomer.id);
      }
    });

    const result = closeWorldSeason(
      season,
      this.save.enemies,
      mentors,
      this.save.hero.name,
      newcomerIds,
    );
    const promotedIds: string[] = [];
    const demotedIds: string[] = [];
    const promoted = new Set(result.promotedIds);
    result.promotedIds.forEach((fighterId) => {
      const fighter = this.hooks.enemyById(fighterId);
      if (
        !fighter?.alive ||
        this.save.eliteLeagueMemberIds.includes(fighter.id) ||
        fighter.arenaIndex >= ARENAS.length - 1
      )
        return;
      const previous = ARENAS[fighter.arenaIndex];
      fighter.arenaIndex += 1;
      fighter.arenaWins = 0;
      fighter.rating = this.hooks.enemyWorldRating(fighter);
      promotedIds.push(fighter.id);
      this.hooks.recordEnemyHistory(
        fighter,
        `Повышен по итогам сезона ${season.number}: «${previous.name}» → «${ARENAS[fighter.arenaIndex].name}».`,
      );
    });
    result.demotedIds.forEach((fighterId) => {
      const fighter = this.hooks.enemyById(fighterId);
      if (
        !fighter?.alive ||
        promoted.has(fighter.id) ||
        this.save.eliteLeagueMemberIds.includes(fighter.id) ||
        fighter.arenaIndex <= 0
      )
        return;
      const previous = ARENAS[fighter.arenaIndex];
      fighter.arenaIndex -= 1;
      fighter.arenaWins = 0;
      fighter.rating = this.hooks.enemyWorldRating(fighter);
      demotedIds.push(fighter.id);
      this.hooks.recordEnemyHistory(
        fighter,
        `Понижен по итогам сезона ${season.number}: «${previous.name}» → «${ARENAS[fighter.arenaIndex].name}».`,
      );
    });
    result.promotedIds = promotedIds;
    result.demotedIds = demotedIds;
    result.retiredIds = career.transitions
      .filter((transition) => transition.kind === "became-mentor")
      .map((transition) => transition.fighterId);
    result.mentorIds = career.mentorsCreated.map((mentor) => mentor.id);
    result.summary = `Сезон ${season.number} завершён: чемпионов арен — ${result.champions.length}, повышений — ${promotedIds.length}, понижений — ${demotedIds.length}, наставников — ${result.mentorIds.length}, новых бойцов — ${newcomerIds.length}.`;
    this.save.worldSeasonHistory ??= [];
    this.save.worldSeasonHistory.push(result);
    this.save.worldSeasonHistory = this.save.worldSeasonHistory.slice(-12);
    this.hooks.event("tournament", result.summary, {
      kind: "system",
      code: "world-season-result",
      values: {
        season: season.number,
        promotions: promotedIds.length,
        demotions: demotedIds.length,
        newcomers: newcomerIds.length,
      },
    });
    const nextNumber = season.number + 1;
    this.save.worldSeason = createWorldSeason(
      this.save.worldDay,
      nextNumber,
      new SeededRandom(
        `${this.save.tournamentRuleSeed}:world-season:${nextNumber}`,
      ),
    );
    const rule = worldSeasonRule(this.save.worldSeason.ruleId);
    this.hooks.event(
      "system",
      `Начался мировой сезон ${nextNumber}: «${rule.name}». ${rule.description}`,
    );
    cleanupNpcLifeReferences(this.save.enemies, mentors, life);
    this.hooks.ensurePopulations(false, false);
  }
}
