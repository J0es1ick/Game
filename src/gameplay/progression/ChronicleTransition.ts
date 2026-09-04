import { ERA_LAWS, LEGACY_BOONS } from "../../catalogs/NewGamePlusCatalog";
import { CLASS_DEFINITIONS, SKILLS } from "../../catalogs/WorldCatalog";
import { FACTIONS } from "../../catalogs/WorldExpansionCatalog";
import { memoryStageFor } from "../combat/EnemyMemory";
import { RandomSource } from "../core/RandomSource";
import {
  EnemyProfile,
  EquipmentItem,
  GameSave,
  HeroClass,
  LegacyHeroRecord,
  MentorRecord,
  NewGamePlusOptions,
  WorldEvent,
} from "../core/WorldTypes";
import { transferWorldRelic } from "../equipment/WorldRelics";
import { normalizeWorldRelics } from "../world/LivingWorld";
import {
  cleanupNpcLifeReferences,
  normalizeNpcLifeWorldState,
} from "../world/NpcLifeSimulation";
import { StructuredWorldEventPayload } from "../world/WorldEvents";
import {
  buildLegacyArchive,
  describeLegacyArchiveInfluence,
  inheritArchiveStyleMemory,
  newGamePlusStatus,
  normalizeLegacyState,
  prepareInheritedItem,
} from "./NewGamePlus";
interface ChronicleDestination<T> {
  result: T;
  save: GameSave;
  random: { loot: RandomSource };
  initializeCrossEraPopulation(
    enemies: readonly EnemyProfile[],
    life: GameSave["npcLife"],
    mentors: readonly MentorRecord[],
    cycle: number,
    notableNames: ReadonlySet<string>,
  ): void;
  legacyEnemy(archive: LegacyHeroRecord): EnemyProfile;
  addItem(item: EquipmentItem): void;
  syncEraChallenge(): void;
  event(
    type: WorldEvent["type"],
    message: string,
    payload?: StructuredWorldEventPayload,
  ): void;
  ensureEliteLeague(): void;
  syncCrownSet(): void;
}
interface ChronicleHooks<T> {
  heirloomCandidates(classId: HeroClass): EquipmentItem[];
  create(
    name: string,
    classId: HeroClass,
    now: number,
  ): ChronicleDestination<T>;
}

export function beginNewChronicle<T>(
  save: GameSave,
  options: NewGamePlusOptions,
  now: number,
  hooks: ChronicleHooks<T>,
): T {
  const status = newGamePlusStatus(save);
  if (!status.unlocked) throw new Error(status.reason);
  const name = options.name.trim();
  if (name.length < 2)
    throw new Error("Имя наследника должно состоять минимум из двух символов.");
  if (!CLASS_DEFINITIONS[options.classId])
    throw new Error("Неизвестный класс наследника.");
  const boon = LEGACY_BOONS.find(
    (candidate) => candidate.id === options.boonId,
  );
  if (!boon) throw new Error("Неизвестное наследие эпохи.");
  if (boon.sealCost > status.availableSeals)
    throw new Error("Недостаточно печатей летописи для выбранного наследия.");
  const laws = [...new Set(options.lawIds)];
  if (
    laws.length !== status.lawLimit ||
    laws.some((id) => !ERA_LAWS.some((law) => law.id === id))
  ) {
    throw new Error(
      `Для эпохи ${status.targetCycle} нужно выбрать законов: ${status.lawLimit}.`,
    );
  }
  const sourceItem = options.heirloomItemId
    ? save.hero.inventory.find((item) => item.id === options.heirloomItemId)
    : undefined;
  if (options.heirloomItemId && !sourceItem)
    throw new Error("Выбранный предмет-наследие не найден.");
  if (
    sourceItem &&
    !hooks
      .heirloomCandidates(options.classId)
      .some((item) => item.id === sourceItem.id)
  ) {
    throw new Error("Этот предмет нельзя передать герою выбранного класса.");
  }

  const archive = buildLegacyArchive(save, now);
  const previousLegacy = normalizeLegacyState(save.legacy);
  const next = hooks.create(name, options.classId, now);
  const nextSave = next.save;
  nextSave.legacy = {
    cycle: status.targetCycle,
    seals: status.availableSeals - boon.sealCost,
    totalSealsEarned: previousLegacy.totalSealsEarned + status.sealsAwarded,
    activeBoonId: boon.id,
    activeLawIds: laws,
    discoveredSkillIds: [
      ...new Set([
        ...previousLegacy.discoveredSkillIds,
        ...save.hero.inventory
          .map((item) => item.grantedSkillId)
          .filter((id): id is string => Boolean(id)),
        ...(save.hero.legacySkillId ? [save.hero.legacySkillId] : []),
      ]),
    ],
    archives: [...previousLegacy.archives, archive],
  };
  next.initializeCrossEraPopulation(
    save.enemies,
    save.npcLife,
    save.mentors ?? [],
    previousLegacy.cycle,
    new Set(archive.notableFighters.map((fighter) => fighter.name)),
  );
  nextSave.defeatedLegacyCycles = [...save.defeatedLegacyCycles];
  nextSave.discoveredItems = [
    ...new Set([...save.discoveredItems, ...nextSave.discoveredItems]),
  ];
  nextSave.tutorialCompleted = true;
  nextSave.seenContextualTutorialIds = [...save.seenContextualTutorialIds];
  nextSave.hero.appearance = { ...save.hero.appearance };
  nextSave.hero.autoEquipBest = save.hero.autoEquipBest;
  nextSave.hero.autoSelectSkills = save.hero.autoSelectSkills;
  nextSave.hero.combatMode = save.hero.combatMode;
  nextSave.hero.autoResolveLegendChallenges =
    save.hero.autoResolveLegendChallenges;
  nextSave.hero.tacticalProfiles = save.hero.tacticalProfiles.map(
    (profile) => ({ ...profile }),
  );
  nextSave.hero.activeTacticalProfileId = save.hero.activeTacticalProfileId;
  nextSave.hero.factionReputation = Object.fromEntries(
    FACTIONS.map((faction) => [
      faction.id,
      Math.floor((save.hero.factionReputation[faction.id] ?? 0) * 0.2) +
        (boon.id === "court-name" ? 8 : 0),
    ]),
  );
  nextSave.factionControl = {
    arenaControllers: {
      ...(save.factionControl?.arenaControllers ?? {}),
    },
    arenaInfluence: Object.fromEntries(
      Object.entries(save.factionControl?.arenaInfluence ?? {}).map(
        ([arenaId, influence]) => [arenaId, { ...influence }],
      ),
    ),
    dungeonControllers: {
      ...(save.factionControl?.dungeonControllers ?? {}),
    },
    dungeonInfluence: Object.fromEntries(
      Object.entries(save.factionControl?.dungeonInfluence ?? {}).map(
        ([dungeonId, influence]) => [dungeonId, { ...influence }],
      ),
    ),
    relations: Object.fromEntries(
      Object.entries(save.factionControl?.relations ?? {}).map(
        ([factionId, relations]) => [factionId, { ...relations }],
      ),
    ),
    shopControllerId: save.factionControl?.shopControllerId ?? FACTIONS[0].id,
    shopOwnerMentorId: save.factionControl?.shopOwnerMentorId,
    shopPriceRevision: save.factionControl?.shopPriceRevision ?? 0,
    lastShiftDay: 1,
  };
  const retainedFighterIds = new Set(nextSave.enemies.map((enemy) => enemy.id));
  const eraMentors: MentorRecord[] = (save.mentors ?? [])
    .slice(0, 12)
    .map((mentor) => ({
      ...mentor,
      retiredDay: 1,
      studentIds: [],
      legacy: `${mentor.legacy} Его школа пережила смену эпохи.`,
      competes:
        mentor.competes === true && retainedFighterIds.has(mentor.fighterId),
    }));
  nextSave.mentors = eraMentors;
  const carriedMentors = new Map(
    eraMentors.map((mentor) => [mentor.id, mentor]),
  );
  nextSave.enemies.forEach((enemy) => {
    if (!enemy.mentorId) return;
    const mentor = carriedMentors.get(enemy.mentorId);
    if (!mentor) {
      enemy.mentorId = undefined;
      return;
    }
    mentor.studentIds.push(enemy.id);
  });
  eraMentors.forEach((mentor) => {
    mentor.studentIds = [...new Set(mentor.studentIds)];
  });
  const survivingSchools = new Set(
    eraMentors.map((mentor) => mentor.dynastyId).filter(Boolean),
  );
  nextSave.npcLife!.dynasties = (save.npcLife?.dynasties ?? [])
    .filter((dynasty) => survivingSchools.has(dynasty.id))
    .map((dynasty) => ({
      ...dynasty,
      foundedDay: 1,
      memberIds: [
        ...new Set([
          dynasty.founderId,
          ...eraMentors
            .filter((mentor) => mentor.dynastyId === dynasty.id)
            .flatMap((mentor) => mentor.studentIds),
        ]),
      ],
    }));
  eraMentors.forEach((mentor) => {
    if (
      mentor.dynastyId &&
      !nextSave.npcLife!.dynasties.some(
        (dynasty) => dynasty.id === mentor.dynastyId,
      )
    )
      mentor.dynastyId = undefined;
  });
  Object.values(nextSave.npcLife!.profiles).forEach((profile) => {
    if (profile.dynastyId && !survivingSchools.has(profile.dynastyId))
      profile.dynastyId = undefined;
  });
  if (
    !eraMentors.some(
      (mentor) => mentor.id === nextSave.factionControl?.shopOwnerMentorId,
    )
  ) {
    nextSave.factionControl.shopOwnerMentorId = undefined;
  }
  const carriedMentorFighterIds = new Set(
    eraMentors.map((mentor) => mentor.fighterId),
  );
  const canJoinNewSchool = (fighter: EnemyProfile) =>
    !fighter.mentorId &&
    !carriedMentorFighterIds.has(fighter.id) &&
    !nextSave.npcLife!.profiles[fighter.id]?.dynastyId;
  const archiveInfluence = describeLegacyArchiveInfluence(archive);
  const influenceFactionId =
    archiveInfluence.factionTradition?.factionId ??
    FACTIONS[Math.max(0, archive.cycle - 1) % FACTIONS.length].id;
  if (archiveInfluence.mentor) {
    const students = nextSave.enemies
      .filter(
        (enemy) =>
          enemy.alive &&
          enemy.classId === archiveInfluence.mentor!.classId &&
          canJoinNewSchool(enemy),
      )
      .sort(
        (first, second) =>
          second.level - first.level || first.id.localeCompare(second.id),
      )
      .slice(0, 3);
    const mentor: MentorRecord = {
      id: archiveInfluence.mentor.id,
      fighterId: `legacy-hero-${archive.cycle}`,
      name: archiveInfluence.mentor.name,
      classId: archiveInfluence.mentor.classId,
      factionId: influenceFactionId,
      goal: "champion",
      level: archiveInfluence.mentor.level,
      rating: archiveInfluence.mentor.rating,
      retiredDay: 1,
      studentIds: students.map((student) => student.id),
      legacy: `${archiveInfluence.summary} ${archiveInfluence.mentor.schoolName}.`,
      schoolName: archiveInfluence.mentor.schoolName,
      competes: false,
      dynastyId: `legacy-school-${archive.cycle}`,
      role: "mentor",
    };
    nextSave.mentors.unshift(mentor);
    nextSave.npcLife!.dynasties.unshift({
      id: mentor.dynastyId!,
      name: archiveInfluence.mentor.schoolName,
      founderId: mentor.fighterId,
      founderName: mentor.name,
      factionId: mentor.factionId,
      foundedDay: 1,
      memberIds: [mentor.fighterId, ...mentor.studentIds],
      prestige: Math.max(
        20,
        Math.round(archive.rating / 75) + archive.tournamentWins * 4,
      ),
    });
    students.forEach((student) => {
      student.mentorId = mentor.id;
      student.heroMemory = inheritArchiveStyleMemory(archive, 1);
      student.heroMemory.familiarity *= 0.5;
      student.heroMemory.stage = memoryStageFor(student.heroMemory.familiarity);
      student.relationships ??= {};
      student.relationships[mentor.fighterId] = {
        fighterId: mentor.fighterId,
        kind: "mentor",
        intensity: 80,
        lastChangedDay: 1,
      };
      student.history.push(
        `С начала эпохи обучается в школе «${archiveInfluence.mentor!.schoolName}».`,
      );
      const profile = nextSave.npcLife!.profiles[student.id];
      if (profile) profile.dynastyId = mentor.dynastyId;
    });
  } else if (archiveInfluence.factionTradition) {
    const tradition = archiveInfluence.factionTradition;
    const followers = nextSave.enemies
      .filter(
        (enemy) =>
          enemy.alive &&
          enemy.factionId === tradition.factionId &&
          canJoinNewSchool(enemy),
      )
      .sort(
        (first, second) =>
          second.rating - first.rating || first.id.localeCompare(second.id),
      )
      .slice(0, 4);
    const founder: MentorRecord = {
      id: `legacy-founder-${archive.cycle}`,
      fighterId: `legacy-hero-${archive.cycle}`,
      name: archive.name,
      classId: archive.classId,
      factionId: tradition.factionId,
      goal: "elite",
      level: archive.level,
      rating: archive.rating,
      retiredDay: 1,
      studentIds: followers.map((fighter) => fighter.id),
      legacy: `${archiveInfluence.summary} Поручения этой традиции дают наследнику больше доверия и влияния.`,
      schoolName: tradition.name,
      competes: false,
      dynastyId: `legacy-tradition-${archive.cycle}`,
      role: "faction-founder",
    };
    nextSave.mentors.unshift(founder);
    nextSave.npcLife!.dynasties.unshift({
      id: founder.dynastyId!,
      name: tradition.name,
      founderId: founder.fighterId,
      founderName: founder.name,
      factionId: founder.factionId,
      foundedDay: 1,
      memberIds: [founder.fighterId, ...founder.studentIds],
      prestige: Math.max(
        35,
        Math.round(archive.rating / 55) + archive.crownLeagueWins * 15,
      ),
    });
    nextSave.hero.factionReputation[tradition.factionId] = Math.max(
      nextSave.hero.factionReputation[tradition.factionId] ?? 0,
      tradition.inheritedReputation,
    );
    Object.values(nextSave.factionControl.arenaInfluence).forEach(
      (influence) => {
        influence[tradition.factionId] =
          (influence[tradition.factionId] ?? 0) + 12;
      },
    );
    Object.values(nextSave.factionControl.dungeonInfluence ?? {}).forEach(
      (influence) => {
        influence[tradition.factionId] =
          (influence[tradition.factionId] ?? 0) + 8;
      },
    );
    followers.forEach((fighter) => {
      fighter.mentorId = founder.id;
      fighter.heroMemory = inheritArchiveStyleMemory(archive, 1);
      fighter.heroMemory.familiarity *= 0.5;
      fighter.heroMemory.stage = memoryStageFor(fighter.heroMemory.familiarity);
      fighter.history.push(`Продолжает традицию «${tradition.name}».`);
      const profile = nextSave.npcLife!.profiles[fighter.id];
      if (profile) profile.dynastyId = founder.dynastyId;
    });
  } else if (archiveInfluence.opponent?.kind === "legendary-rival") {
    const rival = next.legacyEnemy(archive);
    rival.id = archiveInfluence.opponent.id;
    rival.title = `${archive.title} · легендарный соперник эпохи ${archive.cycle}`;
    rival.origin = "Дорога между эпохами";
    rival.goal = "elite";
    rival.carriedFromCycle = archive.cycle;
    rival.joinedDay = 1;
    rival.history.push(archiveInfluence.summary);
    nextSave.enemies.push(rival);
    nextSave.npcLife!.profiles[rival.id] = {
      fighterId: rival.id,
      career: "legend",
      nickname: archive.title,
      nicknameGrantedDay: 1,
      seasonsActive: 0,
    };
  }
  nextSave.worldRelics = normalizeWorldRelics(
    (save.worldRelics ?? []).map((record) => ({
      ...record,
      item: {
        ...record.item,
        stats: { ...record.item.stats },
        relicHistory: [...(record.item.relicHistory ?? [])],
      },
      status: "lost",
      currentOwnerId: undefined,
      currentOwnerName: undefined,
      formerOwners: [...record.formerOwners],
      history: [
        ...record.history,
        `Эпоха ${status.targetCycle}: реликвия пережила смену летописи и вновь затерялась в мире.`,
      ],
    })),
  );

  if (boon.id === "masters-school") {
    nextSave.hero.legacySkillId = SKILLS.filter(
      (skill) =>
        !skill.equipmentOnly &&
        (skill.classes === "all" || skill.classes.includes(options.classId)) &&
        skill.unlockLevel > 1,
    ).sort(
      (first, second) =>
        second.priority - first.priority ||
        first.unlockLevel - second.unlockLevel,
    )[0]?.id;
  }

  if (sourceItem) {
    let inherited = prepareInheritedItem(
      sourceItem,
      options.classId,
      previousLegacy.cycle,
      save.hero.name,
      next.random.loot,
    );
    inherited.worldRelicId = sourceItem.worldRelicId;
    const inheritedRelicIndex = nextSave.worldRelics.findIndex(
      (record) => record.id === inherited.worldRelicId,
    );
    if (inheritedRelicIndex >= 0) {
      const transfer = transferWorldRelic(
        nextSave.worldRelics[inheritedRelicIndex],
        inherited,
        "hero",
        name,
        `Эпоха ${status.targetCycle}: ${name} принял реликвию как наследие.`,
      );
      nextSave.worldRelics[inheritedRelicIndex] = transfer.record;
      inherited = transfer.item;
    }
    next.addItem(inherited);
    nextSave.hero.equipped[inherited.slot] = inherited.id;
    nextSave.legacy.inheritedItemId = inherited.id;
  }

  next.syncEraChallenge();
  next.event(
    "system",
    `Началась эпоха ${status.targetCycle}. ${name} принял наследие «${boon.name}».`,
  );
  next.event("system", archiveInfluence.summary);
  next.ensureEliteLeague();
  nextSave.npcLife = normalizeNpcLifeWorldState(
    nextSave.npcLife,
    nextSave.enemies,
    1,
  );
  cleanupNpcLifeReferences(
    nextSave.enemies,
    nextSave.mentors ?? [],
    nextSave.npcLife!,
  );
  next.syncCrownSet();
  return next.result;
}
