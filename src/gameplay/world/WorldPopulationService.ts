import { ARENAS } from "../../catalogs/WorldCatalog";
import {
  DEFAULT_TACTICAL_PROFILES,
  FACTIONS,
  FIGHTER_TRAITS,
} from "../../catalogs/WorldExpansionCatalog";
import { createItem } from "../../factories/ItemFactory";
import { createEnemyStyleMemory } from "../combat/EnemyMemory";
import {
  ARENA_POPULATION_BASE_FLOOR,
  ARENA_POPULATION_RESERVE,
  ARENA_POPULATION_TARGET,
  CROSS_ERA_RETURNING_SHARE,
  ENEMY_NAMES,
  ENEMY_ORIGINS,
  ENEMY_TITLES,
  HERO_CLASSES,
} from "../core/WorldGameConfig";
import { WorldRandomStreams } from "../core/WorldRandom";
import {
  EnemyProfile,
  EquipmentSlot,
  GameSave,
  MentorRecord,
  NpcGoal,
  Rarity,
} from "../core/WorldTypes";
import { inheritArchiveStyleMemory } from "../progression/NewGamePlus";
import { enemyExperienceRequirement } from "../progression/ProgressionBalance";
import { eraChallengeFor } from "./EraChallenges";
import {
  cleanupNpcLifeReferences,
  createNpcLifeWorldState,
  normalizeNpcLifeWorldState,
  npcReferenceRetentionIds,
  type NpcLifeProfile,
} from "./NpcLifeSimulation";
import { eventReferencesFighter } from "./WorldEvents";
import { rememberWorldSeasonFighters } from "./WorldSeason";
interface WorldPopulationServiceHooks {
  randomId(prefix: string): string;
  enemyWorldRating(enemy: EnemyProfile): number;
}
export class WorldPopulationService {
  constructor(
    private readonly save: GameSave,
    private readonly random: WorldRandomStreams,
    private readonly hooks: WorldPopulationServiceHooks,
  ) {}
  public initializeCrossEraPopulation(
    previousEnemies: readonly EnemyProfile[],
    previousLife: GameSave["npcLife"],
    previousMentors: readonly MentorRecord[],
    previousCycle: number,
    notableNames: ReadonlySet<string>,
  ): void {
    const freshPopulation = [...this.save.enemies];
    const competingMentorFighterIds = new Set(
      previousMentors
        .filter((mentor) => mentor.competes === true)
        .map((mentor) => mentor.fighterId),
    );
    const selections = ARENAS.map((_, arenaIndex) => {
      const fresh = freshPopulation.filter(
        (enemy) => enemy.arenaIndex === arenaIndex,
      );
      const candidates = this.random.world
        .shuffle(
          previousEnemies.filter(
            (enemy) =>
              enemy.alive &&
              (!enemy.retiredDay || competingMentorFighterIds.has(enemy.id)) &&
              enemy.arenaIndex === arenaIndex,
          ),
        )
        .sort(
          (first, second) =>
            Number(notableNames.has(second.name)) -
            Number(notableNames.has(first.name)),
        );
      const returningCount = Math.min(
        fresh.length,
        Math.round(fresh.length * CROSS_ERA_RETURNING_SHARE),
        candidates.length,
      );
      return {
        arenaIndex,
        fresh,
        returning: candidates.slice(0, returningCount),
      };
    });
    const retainedIds = new Set(
      selections.flatMap((selection) =>
        selection.returning.map((enemy) => enemy.id),
      ),
    );
    const usedIds = new Set(retainedIds);
    const retained = selections.flatMap((selection) =>
      selection.returning.map((enemy) =>
        this.prepareCrossEraFighter(enemy, previousCycle),
      ),
    );
    const newcomers: EnemyProfile[] = [];
    selections.forEach(({ arenaIndex, fresh, returning }) => {
      const required = fresh.length - returning.length;
      const currentArenaNewcomers: EnemyProfile[] = [];
      fresh
        .filter((enemy) => !usedIds.has(enemy.id))
        .slice(0, required)
        .forEach((enemy) => {
          usedIds.add(enemy.id);
          currentArenaNewcomers.push(enemy);
        });
      while (currentArenaNewcomers.length < required) {
        const enemy = this.createEnemy(arenaIndex);
        if (usedIds.has(enemy.id)) continue;
        usedIds.add(enemy.id);
        currentArenaNewcomers.push(enemy);
      }
      newcomers.push(...currentArenaNewcomers);
    });
    const allIds = new Set(
      [...retained, ...newcomers].map((enemy) => enemy.id),
    );
    retained.forEach((enemy) => {
      enemy.relationships = Object.fromEntries(
        Object.entries(enemy.relationships ?? {})
          .filter(
            ([id, relationship]) =>
              id !== enemy.id &&
              allIds.has(id) &&
              relationship?.fighterId === id,
          )
          .map(([id, relationship]) => [
            id,
            { ...relationship, lastChangedDay: 1 },
          ]),
      );
    });
    this.save.enemies = [...retained, ...newcomers];
    this.save.eliteLeagueMemberIds = [];
    this.save.eliteRatings = {};
    this.save.eliteCrownWins = {};
    const profiles = Object.fromEntries(
      retained.map((enemy) => {
        const source = previousLife?.profiles?.[enemy.id];
        const career =
          source?.career === "legend" || enemy.legendSinceDay !== undefined
            ? "legend"
            : "active";
        return [
          enemy.id,
          {
            fighterId: enemy.id,
            career,
            nickname: source?.nickname,
            nicknameGrantedDay:
              source?.nicknameGrantedDay === undefined ? undefined : 1,
            dynastyId: source?.dynastyId,
            revengeTargetId:
              source?.revengeTargetId && allIds.has(source.revengeTargetId)
                ? source.revengeTargetId
                : undefined,
            desiredSetId: source?.desiredSetId,
            seasonsActive: Math.max(0, source?.seasonsActive ?? 0) + 1,
          } satisfies NpcLifeProfile,
        ];
      }),
    );
    this.save.npcLife = normalizeNpcLifeWorldState(
      {
        ...createNpcLifeWorldState(1),
        profiles,
      },
      this.save.enemies,
      1,
    );
  }

  public createEnemy(
    arenaIndex: number,
    newcomer = false,
    levelOverride?: number,
  ): EnemyProfile {
    const arena = ARENAS[arenaIndex];
    const classId = this.random.world.pick(HERO_CLASSES);
    const newcomerLevelCeiling = Math.min(
      arena.enemyLevel[1],
      arena.enemyLevel[0] +
        Math.max(
          1,
          Math.ceil((arena.enemyLevel[1] - arena.enemyLevel[0]) * 0.3),
        ),
    );
    const level =
      levelOverride ??
      this.random.world.int(
        arena.enemyLevel[0],
        newcomer ? newcomerLevelCeiling : arena.enemyLevel[1],
      );
    const gearCount = Math.min(6, 2 + Math.floor(level / 5));
    const equipment = Array.from({ length: gearCount }, (_, index) =>
      createItem(level, {
        classId,
        slot: (
          [
            "weapon",
            "offhand",
            "chest",
            "head",
            "hands",
            "feet",
          ] as EquipmentSlot[]
        )[index],
        minimumRarity:
          arenaIndex >= 4 ? "epic" : arenaIndex >= 2 ? "rare" : "common",
        randomSource: this.random.loot,
      }),
    );
    const equipped: EnemyProfile["equipped"] = {};
    equipment.forEach((item) => {
      equipped[item.slot] = item.id;
    });
    const name = `${this.random.world.pick(ENEMY_NAMES)} ${String.fromCharCode(65 + this.random.world.int(0, 20))}.`;
    const wins = newcomer
      ? this.random.world.int(0, Math.max(1, arenaIndex))
      : this.random.world.int(arenaIndex * 3, arenaIndex * 9 + 5);
    const tournamentWins = newcomer
      ? 0
      : this.random.world.int(arenaIndex * 4, arenaIndex * 12 + 6);
    const enemy: EnemyProfile = {
      id: this.hooks.randomId("enemy"),
      name,
      title: this.random.world.pick(ENEMY_TITLES),
      origin: this.random.world.pick(ENEMY_ORIGINS),
      classId,
      level,
      experience: newcomer
        ? this.random.world.int(0, 35 + level * 4)
        : this.random.world.int(0, 80 + level * 20),
      rating: 0,
      wins,
      tournamentWins,
      arenaTournamentWins: ARENAS.map((_, index) =>
        index === arenaIndex ? tournamentWins : 0,
      ),
      kills: newcomer
        ? 0
        : this.random.world.int(0, Math.max(0, arenaIndex * 2)),
      losses: newcomer
        ? this.random.world.int(0, 1)
        : this.random.world.int(0, 5),
      arenaIndex,
      arenaWins: newcomer
        ? 0
        : this.random.world.int(0, Math.max(1, arenaIndex)),
      alive: true,
      equipment,
      equipped,
      history: [`Начал путь: ${arena.name}.`],
      traitIds: [
        FIGHTER_TRAITS[
          (HERO_CLASSES.indexOf(classId) + level + arenaIndex) %
            FIGHTER_TRAITS.length
        ].id,
      ],
      scarIds: [],
      injuries: [],
      adaptationIds: [],
      heroMemory: createEnemyStyleMemory(this.save.worldDay),
      tacticalStyle:
        DEFAULT_TACTICAL_PROFILES[
          (HERO_CLASSES.indexOf(classId) + arenaIndex) %
            DEFAULT_TACTICAL_PROFILES.length
        ].style,
      factionId:
        FACTIONS[
          (HERO_CLASSES.indexOf(classId) +
            arenaIndex +
            this.random.world.int(0, 2)) %
            FACTIONS.length
        ].id,
      gold: Math.max(
        40,
        level * 55 + wins * 14 + this.random.world.int(0, 180),
      ),
      goal: this.random.world.pick<NpcGoal>(
        arenaIndex >= ARENAS.length - 2
          ? ["champion", "relic", "elite", "vengeance"]
          : ["champion", "wealth", "relic", "vengeance"],
      ),
      joinedDay: this.save.worldDay,
      relationships: {},
    };
    if (this.save.legacy.cycle >= 2) {
      const mutation = eraChallengeFor(this.save.legacy.cycle).mutations[
        classId
      ];
      enemy.eraMutationId = mutation.id;
      enemy.eraMutationPotency = mutation.potency;
    }
    if (newcomer)
      enemy.history = [
        `Прибыл на арену «${arena.name}» в день ${this.save.worldDay}.`,
      ];
    enemy.rating = this.hooks.enemyWorldRating(enemy);
    return enemy;
  }

  public ensurePopulations(
    fillImmediately = false,
    allowRoutineRecruitment = true,
  ): void {
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    ARENAS.forEach((arena, arenaIndex) => {
      const alive = this.save.enemies.filter(
        (enemy) =>
          enemy.alive &&
          enemy.arenaIndex === arenaIndex &&
          !eliteIds.has(enemy.id),
      ).length;
      const floor = Math.max(ARENA_POPULATION_BASE_FLOOR, arena.participants);
      const target = Math.max(
        ARENA_POPULATION_TARGET,
        floor + ARENA_POPULATION_RESERVE,
      );
      const missing = Math.max(0, target - alive);
      const emergencyRecruitment = Math.max(0, floor - alive);
      const routineRecruitment = allowRoutineRecruitment
        ? Math.min(1, missing)
        : 0;
      const recruits = fillImmediately
        ? missing
        : Math.max(emergencyRecruitment, routineRecruitment);
      for (let index = 0; index < recruits; index += 1) {
        this.save.enemies.push(this.createEnemy(arenaIndex, !fillImmediately));
      }
    });
    if (this.save.enemies.length > 260) {
      rememberWorldSeasonFighters(this.save.worldSeason!, [
        this.save.hero,
        ...this.save.enemies,
      ]);
      const previousEnemyIds = new Set(
        this.save.enemies.map((enemy) => enemy.id),
      );
      const encounteredIds = new Set(Object.keys(this.save.hero.rivalries));
      this.save.eliteLeagueMemberIds.forEach((id) => encounteredIds.add(id));
      const life = (this.save.npcLife = normalizeNpcLifeWorldState(
        this.save.npcLife,
        this.save.enemies,
        this.save.worldDay,
      ));
      npcReferenceRetentionIds(
        this.save.enemies,
        this.save.mentors ?? [],
        life,
      ).forEach((id) => encounteredIds.add(id));
      (this.save.worldRelics ?? []).forEach((record) => {
        if (record.currentOwnerId && record.currentOwnerId !== "hero")
          encounteredIds.add(record.currentOwnerId);
      });
      ARENAS.forEach((arena, arenaIndex) => {
        this.save.enemies
          .filter(
            (enemy) =>
              enemy.alive &&
              enemy.arenaIndex === arenaIndex &&
              !eliteIds.has(enemy.id),
          )
          .sort(
            (first, second) =>
              second.rating - first.rating ||
              second.tournamentWins - first.tournamentWins ||
              second.history.length - first.history.length,
          )
          .slice(0, Math.max(ARENA_POPULATION_BASE_FLOOR, arena.participants))
          .forEach((enemy) => encounteredIds.add(enemy.id));
      });
      const encountered = this.save.enemies.filter((enemy) =>
        encounteredIds.has(enemy.id),
      );
      const retainedIds = new Set(encountered.map((enemy) => enemy.id));
      const populationLimit = Math.max(0, 260 - encountered.length);
      const population = this.save.enemies
        .filter(
          (enemy) =>
            !retainedIds.has(enemy.id) &&
            (enemy.alive ||
              enemy.history.some((line) => line.includes(this.save.hero.name))),
        )
        .sort(
          (first, second) =>
            Number(second.alive) - Number(first.alive) ||
            second.rating - first.rating ||
            second.tournamentWins - first.tournamentWins ||
            second.history.length - first.history.length,
        )
        .slice(0, populationLimit);
      this.save.enemies = [...encountered, ...population];
      const retainedEnemyIds = new Set(
        this.save.enemies.map((enemy) => enemy.id),
      );
      const removedEnemyIds = [...previousEnemyIds].filter(
        (id) => !retainedEnemyIds.has(id),
      );
      if (removedEnemyIds.length > 0) {
        this.save.events = this.save.events.filter(
          (event) =>
            !removedEnemyIds.some((fighterId) =>
              eventReferencesFighter(event.payload, fighterId),
            ),
        );
      }
    }
    cleanupNpcLifeReferences(
      this.save.enemies,
      this.save.mentors ?? [],
      this.save.npcLife!,
    );
  }

  public prepareCrossEraFighter(
    source: EnemyProfile,
    previousCycle: number,
  ): EnemyProfile {
    const arenaIndex = Math.max(
      0,
      Math.min(ARENAS.length - 1, source.arenaIndex),
    );
    const arena = ARENAS[arenaIndex];
    const level = Math.max(
      arena.enemyLevel[0],
      Math.min(source.level, arena.enemyLevel[1]),
    );
    const minimumRarity: Rarity =
      arenaIndex >= 4 ? "epic" : arenaIndex >= 2 ? "rare" : "common";
    const gearCount = Math.min(6, 2 + Math.floor(level / 5));
    const equipment = (
      ["weapon", "offhand", "chest", "head", "hands", "feet"] as EquipmentSlot[]
    )
      .slice(0, gearCount)
      .map((slot) =>
        createItem(level, {
          classId: source.classId,
          slot,
          minimumRarity,
          randomSource: this.random.loot,
        }),
      );
    const equipped: EnemyProfile["equipped"] = {};
    equipment.forEach((item) => {
      equipped[item.slot] = item.id;
    });
    const originalCycle = Number.isFinite(source.carriedFromCycle)
      ? Math.max(
          1,
          Math.min(previousCycle, Math.floor(source.carriedFromCycle!)),
        )
      : previousCycle;
    const fighter: EnemyProfile = {
      ...source,
      level,
      experience: Math.min(
        Math.max(0, source.experience),
        Math.max(0, enemyExperienceRequirement(level) - 1),
      ),
      arenaIndex,
      arenaTournamentWins: ARENAS.map((_, index) =>
        Math.max(0, source.arenaTournamentWins?.[index] ?? 0),
      ),
      alive: true,
      equipment,
      equipped,
      history: [
        ...source.history.slice(-49),
        `Пережил эпоху ${previousCycle} и продолжил путь в новой летописи.`,
      ],
      traitIds: [...source.traitIds],
      scarIds: [...source.scarIds],
      injuries: [],
      adaptationIds: [...source.adaptationIds],
      heroMemory: inheritArchiveStyleMemory(source, 1),
      carriedFromCycle: originalCycle,
      joinedDay: 1,
      lastActivity: undefined,
      relationships: Object.fromEntries(
        Object.entries(source.relationships ?? {}).map(([id, relationship]) => [
          id,
          { ...relationship },
        ]),
      ),
      factionHostility: source.factionHostility
        ? { ...source.factionHostility }
        : undefined,
      legendSinceDay: source.legendSinceDay === undefined ? undefined : 1,
      retiredDay: undefined,
      eraMutationId: undefined,
      eraMutationPotency: undefined,
    };
    fighter.rating = this.hooks.enemyWorldRating(fighter);
    return fighter;
  }
}
