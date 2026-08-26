import type { IEquipment } from "../equipment/IEquipment";
import type { RandomSnapshot } from "./RandomSource";
import type { StructuredWorldEventPayload } from "./WorldEvents";
import type { DungeonRoute } from "./DungeonRoute";
import type { CrownSeasonResult, CrownSeasonState } from "./CrownSeason";
import type { LootPityState, LootTarget } from "./LootProgression";
import type { EraChallengeProgressState } from "./EraChallenges";
import type { BattleSessionSnapshot } from "./AdvancedBattle";

export type HeroClass =
  | "Knight"
  | "Archer"
  | "Wizard"
  | "Monk"
  | "Gunsmith"
  | "Swordsman";

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";
export type LegacyBoonId = "masters-school" | "court-name" | "hunters-notes" | "old-map" | "forge-tradition";
export type EraLawId = "age-of-steel" | "hungry-lands" | "bloody-arenas" | "mercenary-age" | "ancient-awakening" | "crown-discord";
export type EquipmentSlot =
  | "weapon"
  | "offhand"
  | "head"
  | "chest"
  | "hands"
  | "feet";
export type SkillKind = "attack" | "heal" | "buff" | "control";
export type ActivityKind = "arena" | "dungeon" | "duel" | "boss";

export interface Stats {
  health: number;
  attack: number;
  defense: number;
  speed: number;
  crit: number;
}

export interface ClassDefinition {
  id: HeroClass;
  name: string;
  epithet: string;
  description: string;
  passive: string;
  startingStats: Stats;
  startingWeapon: string;
  startingOffhand?: string;
  accent: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  classes: HeroClass[] | "all";
  unlockLevel: number;
  kind: SkillKind;
  power: number;
  cooldown: number;
  priority: number;
  /** Навык существует только как свойство легендарной или мифической экипировки. */
  equipmentOnly?: boolean;
}

export interface ItemAffix {
  name: string;
  description: string;
  stat: keyof Stats;
  value: number;
}

export interface EquipmentItem extends IEquipment<Partial<Stats>> {
  id: string;
  templateId: string;
  name: string;
  slot: EquipmentSlot;
  rarity: Rarity;
  level: number;
  stats: Partial<Stats>;
  allowedClasses: HeroClass[] | "all";
  price: number;
  affix?: ItemAffix;
  grantedSkillId?: string;
  setId?: string;
  enhancement?: number;
  /** История предмета, которая развивается вместе с владельцем. */
  relicRenown?: number;
  relicTier?: 0 | 1 | 2 | 3;
  relicPath?: "might" | "guard" | "tempo";
  relicName?: string;
  relicHistory?: string[];
  /** Номер завершённой эпохи, из которой предмет был перенесён как наследие. */
  inheritedFromCycle?: number;
  isVisualTestItem?: boolean;
}

export type TacticalStyle = "balanced" | "aggressive" | "defensive" | "control";
export type EnemyMemoryStage = "unknown" | "observing" | "familiar" | "adapted" | "mastered";
export type HeroBehaviorPattern = "pressure" | "healing" | "control" | "burst" | "finisher";
export type EnemyCountermeasureId =
  | "guarded-opening"
  | "critical-guard"
  | "healing-denial"
  | "control-discipline"
  | "signature-parry"
  | "execution-watch";

export interface TacticalProfile {
  id: string;
  name: string;
  style: TacticalStyle;
  healThreshold: number;
  finisherThreshold: number;
  preserveStrongSkills: boolean;
  prioritizeControl: boolean;
}

/** Краткий отпечаток одного реально сыгранного стиля героя. */
export interface HeroStyleSignature {
  day: number;
  classId: HeroClass;
  tacticalStyle: TacticalStyle;
  /** Только действительно применённые в бою навыки. */
  skillIds: string[];
  dominantSkillId?: string;
  /** Нормализованные доли наблюдённых действий от 0 до 1. */
  behavior: Partial<Record<HeroBehaviorPattern, number>>;
}

/**
 * Память конкретного врага о стиле главного героя.
 * Знания разных классов и тактик не заменяют друг друга: старые стили
 * постепенно уходят в фон, но ускоряют повторное узнавание при возвращении.
 */
export interface EnemyStyleMemory {
  familiarity: number;
  stage: EnemyMemoryStage;
  classKnowledge: Partial<Record<HeroClass, number>>;
  tacticalKnowledge: Partial<Record<TacticalStyle, number>>;
  skillKnowledge: Record<string, number>;
  behaviorKnowledge: Partial<Record<HeroBehaviorPattern, number>>;
  recentSignatures: HeroStyleSignature[];
  countermeasureIds: EnemyCountermeasureId[];
  lastEncounterDay: number;
  lastDecayDay: number;
  /** Сходство текущего стиля с самым узнаваемым сохранённым отпечатком, 0..1. */
  currentSimilarity: number;
}

export interface FighterInjury {
  id: string;
  name: string;
  description: string;
  remainingDays: number;
  stats: Partial<Stats>;
  gainedDay: number;
}

export interface FighterFeatureChange {
  fighterId: string;
  fighterName: string;
  kind: "Черта" | "Адаптация" | "Шрам" | "Травма" | "Наследие";
  name: string;
  description: string;
  stats: Partial<Stats>;
}

export interface RivalryRecord {
  enemyId: string;
  name: string;
  classId: HeroClass;
  wins: number;
  losses: number;
  killed: boolean;
  lastMetDay: number;
  meetings?: number;
  intensity?: number;
  adaptationId?: string;
  memoryStage?: EnemyMemoryStage;
  memoryFamiliarity?: number;
  memorySimilarity?: number;
  countermeasureIds?: EnemyCountermeasureId[];
}

export interface ItemTemplate {
  id: string;
  name: string;
  slot: EquipmentSlot;
  allowedClasses: HeroClass[] | "all";
  primaryStat: keyof Stats;
  setId?: string;
  exclusiveToBoss?: string;
  exclusiveToElite?: boolean;
}

export interface EquipmentSetDefinition {
  id: string;
  name: string;
  description: string;
  purpose: string;
  classes: HeroClass[] | "all";
  pieces: string[];
  bonuses: Array<{
    pieces: number;
    description: string;
    stats?: Partial<Stats>;
  }>;
}

export type EquipmentSet = Partial<Record<EquipmentSlot, string>>;

export interface HeroAppearance {
  hairStyle: 0 | 1 | 2;
  faceStyle: 0 | 1 | 2;
}

export interface HeroProfile {
  id: "hero";
  name: string;
  classId: HeroClass;
  level: number;
  experience: number;
  experienceToNextLevel: number;
  gold: number;
  temperingMarks: number;
  rating: number;
  wins: number;
  losses: number;
  tournamentMatchWins: number;
  tournamentMatchLosses: number;
  duelWins: number;
  duelLosses: number;
  dungeonWins: number;
  dungeonLosses: number;
  bossWins: number;
  kills: number;
  rivalries: Record<string, RivalryRecord>;
  arenaWins: number[];
  highestArena: number;
  inventory: EquipmentItem[];
  equipped: EquipmentSet;
  autoEquipBest: boolean;
  autoSelectSkills: boolean;
  selectedSkillIds: string[];
  combatMode: "auto" | "manual";
  traitIds: string[];
  scarIds: string[];
  injuries: FighterInjury[];
  tacticalProfiles: TacticalProfile[];
  activeTacticalProfileId: string;
  relicDust: number;
  factionReputation: Record<string, number>;
  crownLeaguePoints: number;
  crownLeagueWins: number;
  legendHuntWins: number;
  legendDefenses: number;
  autoResolveLegendChallenges: boolean;
  legacySkillId?: string;
  classChanges: number;
  appearance: HeroAppearance;
  createdAt: number;
}

export interface EnemyProfile {
  id: string;
  name: string;
  title: string;
  origin: string;
  classId: HeroClass;
  level: number;
  experience: number;
  rating: number;
  wins: number;
  losses: number;
  tournamentWins: number;
  /** Победы в турнирах по индексам арен. Нужны для честного расчёта мирового рейтинга. */
  arenaTournamentWins: number[];
  kills: number;
  arenaIndex: number;
  arenaWins: number;
  alive: boolean;
  equipment: EquipmentItem[];
  equipped: EquipmentSet;
  history: string[];
  traitIds: string[];
  scarIds: string[];
  injuries: FighterInjury[];
  adaptationIds: string[];
  heroMemory: EnemyStyleMemory;
  tacticalStyle: TacticalStyle;
  carriedFromCycle?: number;
  eraMutationId?: string;
  eraMutationPotency?: number;
}

export interface LegacyFighterRecord {
  name: string;
  title: string;
  classId: HeroClass;
  level: number;
  rating: number;
  tournamentWins: number;
  wins: number;
  losses: number;
  kills: number;
}

export interface LegacyHeroRecord extends LegacyFighterRecord {
  cycle: number;
  worldDay: number;
  eliteRank?: number;
  crownLeagueWins: number;
  legendDefenses: number;
  boonId?: LegacyBoonId;
  lawIds: EraLawId[];
  inheritedItemName?: string;
  appearance: HeroAppearance;
  equipment: EquipmentItem[];
  notableFighters: LegacyFighterRecord[];
  fallenNames: string[];
  completedAt: number;
}

export interface LegacyState {
  cycle: number;
  seals: number;
  totalSealsEarned: number;
  activeBoonId?: LegacyBoonId;
  activeLawIds: EraLawId[];
  inheritedItemId?: string;
  discoveredSkillIds: string[];
  archives: LegacyHeroRecord[];
}

export interface NewGamePlusOptions {
  name: string;
  classId: HeroClass;
  boonId: LegacyBoonId;
  lawIds: EraLawId[];
  heirloomItemId?: string;
}

export interface NewGamePlusRequirement {
  id: string;
  label: string;
  met: boolean;
}

export interface NewGamePlusStatus {
  unlocked: boolean;
  targetCycle: number;
  sealsAwarded: number;
  availableSeals: number;
  lawLimit: number;
  requirements: NewGamePlusRequirement[];
  reason: string;
}

export type ContractObjective = "training" | "duel" | "dungeon" | "tournament" | "boss";

export interface ContractOffer {
  id: string;
  factionId: string;
  title: string;
  description: string;
  objective: ContractObjective;
  target: number;
  progress: number;
  rewardGold: number;
  rewardExperience: number;
  rewardReputation: number;
  createdDay: number;
  expiresDay: number;
  approach?: "honor" | "profit";
}

export interface DungeonExpedition {
  dungeonId: string;
  stage: number;
  maxStages: number;
  health: number;
  accumulatedGold: number;
  accumulatedExperience: number;
  loot: EquipmentItem[];
  path: string[];
  route?: DungeonRoute;
  visitedNodeIds?: string[];
  currentNodeId?: string;
  pendingShrineNodeId?: string;
  attackMultiplier?: number;
  defenseMultiplier?: number;
  lootChanceBonus?: number;
  daysSpent?: number;
}

export type ExpeditionShrineChoiceId = "blood-oath" | "guardian-vow";

export interface ExpeditionShrineChoice {
  id: ExpeditionShrineChoiceId;
  name: string;
  description: string;
  cost: string;
  benefit: string;
}

export interface ExpeditionChoice {
  id: "safe" | "risk" | "rest";
  name: string;
  description: string;
  danger: string;
  reward: string;
}

export interface ExpeditionStepReport {
  expedition?: DungeonExpedition;
  battle?: BattleReport;
  completed: boolean;
  retreated: boolean;
  message: string;
  rewards?: BattleRewards;
  requiresChoice?: boolean;
}

export interface ArenaDefinition {
  id: string;
  kind: "arena";
  name: string;
  place: string;
  description: string;
  minLevel: number;
  enemyLevel: [number, number];
  winsToAdvance: number;
  rewardGold: number;
  rewardExperience: number;
  lethalChance: number;
  tournamentInterval: number;
  participants: 8 | 16 | 32;
  prestige: "local" | "regional" | "grand" | "royal";
  accent: string;
}

export interface DungeonDefinition {
  id: string;
  kind: "dungeon";
  name: string;
  place: string;
  description: string;
  minLevel: number;
  requiredArena: number;
  requiredWorldDay: number;
  enemyLevel: [number, number];
  rewardGold: number;
  rewardExperience: number;
  minimumRarity: Rarity;
  cooldownDays: number;
  accent: string;
}

export interface DuelDefinition {
  id: string;
  kind: "duel";
  name: string;
  place: string;
  description: string;
  minLevel: number;
  requiredDuelWins: number;
  requiredArena: number;
  enemyLevelOffset: [number, number];
  rewardGold: number;
  rewardExperience: number;
  accent: string;
}

export interface BossDefinition {
  id: string;
  kind: "boss";
  name: string;
  place: string;
  description: string;
  classId: HeroClass;
  level: number;
  requiredLevel: number;
  requiredDuelWins: number;
  requiredArena: number;
  requiredDungeon?: string;
  requiredBoss?: string;
  rewardGold: number;
  rewardExperience: number;
  lootTemplateIds: Record<HeroClass, string>;
  accent: string;
}

export interface EndgameActivityDefinition {
  id: "crown-league" | "legend-hunt";
  kind: "endgame";
  name: string;
  place: string;
  description: string;
  rewardGold: number;
  rewardExperience: number;
  accent: string;
}

export type ActivityDefinition =
  | ArenaDefinition
  | DungeonDefinition
  | DuelDefinition
  | BossDefinition
  | EndgameActivityDefinition;

export interface WorldEvent {
  id: string;
  day: number;
  type:
    | "battle"
    | "tournament"
    | "dungeon"
    | "promotion"
    | "death"
    | "loot"
    | "system";
  message: string;
  /** Машиночитаемые ссылки позволяют безопасно обновлять и очищать летопись. */
  payload?: StructuredWorldEventPayload;
}

export interface WorldRandomSnapshots {
  world: RandomSnapshot;
  combat: RandomSnapshot;
  loot: RandomSnapshot;
}

export interface ShopOffer {
  item: EquipmentItem;
  sold: boolean;
}

export type WorldFeatureId = "contracts" | "equipment-legacy";
export type ContextualTutorialId = "contracts" | "equipment-legacy" | "adaptation";

/**
 * Persistent notification produced when a campaign system becomes available.
 * It deliberately lives in the save so closing the page cannot lose the
 * explanation that accompanies a newly opened system.
 */
export interface WorldFeatureUnlock {
  id: WorldFeatureId;
  day: number;
  title: string;
  description: string;
  tutorialId: Extract<ContextualTutorialId, WorldFeatureId>;
}

export interface GameSave {
  version: 2 | 3;
  migrations?: string[];
  hero: HeroProfile;
  enemies: EnemyProfile[];
  worldDay: number;
  lastSimulatedAt: number;
  dungeonClears: Record<string, number>;
  shopDay: number;
  shopOffers: ShopOffer[];
  discoveredItems: string[];
  tournamentRegistrations: Record<string, number>;
  defeatedBosses: string[];
  huntedLegendIds: string[];
  lastLegendHuntDay?: number;
  lastCrownLeagueDay?: number;
  eliteLeagueMemberIds: string[];
  eliteRatings: Record<string, number>;
  eliteCrownWins: Record<string, number>;
  crownSetOwnerId?: string;
  legacy: LegacyState;
  defeatedLegacyCycles: number[];
  tutorialCompleted?: boolean;
  seenContextualTutorialIds: ContextualTutorialId[];
  unlockedFeatureIds: WorldFeatureId[];
  pendingFeatureUnlocks: WorldFeatureUnlock[];
  pendingEliteChallengeId?: string;
  contractOffers: ContractOffer[];
  activeContract?: ContractOffer;
  completedContracts: number;
  activeExpedition?: DungeonExpedition;
  pendingNarrativeEventId?: string;
  seenNarrativeEventIds: string[];
  crownSeason: CrownSeasonState;
  lastCrownSeasonResult?: CrownSeasonResult;
  lootTarget?: LootTarget;
  lootPity?: LootPityState;
  reforgeAttempts: Record<string, number>;
  eraChallengeProgress: EraChallengeProgressState;
  /** Exact resumable combat transaction. No rewards are applied while present. */
  pendingBattle?: PendingBattle;
  tournamentRuleSeed: number;
  randomSnapshots: WorldRandomSnapshots;
  events: WorldEvent[];
}

export interface CombatantSnapshot {
  id: string;
  name: string;
  classId: HeroClass;
  level: number;
  originalLevel?: number;
  maxHealth: number;
  health: number;
  attack: number;
  defense: number;
  speed: number;
  crit: number;
  equipmentScore: number;
  skills: string[];
  traitIds?: string[];
  injuryNames?: string[];
  tacticalStyle?: TacticalStyle;
  /** Runtime-only equipment set counts used to resume an interactive battle faithfully. */
  setCounts?: Record<string, number>;
  mutationId?: string;
  mutationPotency?: number;
}

export interface BattleTurn {
  turn: number;
  actorId: string;
  targetId: string;
  actorName: string;
  targetName: string;
  action: string;
  skillId?: string;
  detail: string;
  damage: number;
  healing: number;
  actorHealth: number;
  targetHealth: number;
  critical: boolean;
}

export interface BattleRewards {
  experience: number;
  gold: number;
  item?: EquipmentItem;
  items?: EquipmentItem[];
  levelsGained: number;
  unlockedSkills: SkillDefinition[];
  temperingMarks?: number;
}

export interface BattleReport {
  activity: ActivityDefinition;
  heroBefore: CombatantSnapshot;
  enemyBefore: CombatantSnapshot;
  winnerId: string;
  loserId: string;
  heroWon: boolean;
  enemyDied: boolean;
  turns: BattleTurn[];
  rewards: BattleRewards;
  worldEvents: WorldEvent[];
  ruleIds?: string[];
}

export interface TournamentMatch {
  round: number;
  match: number;
  firstName: string;
  secondName: string;
  winnerName: string;
  heroInvolved: boolean;
  battle?: BattleReport;
  bye?: boolean;
}

export interface TournamentReport {
  activity: ArenaDefinition | EndgameActivityDefinition;
  day: number;
  participantCount: number;
  matches: TournamentMatch[];
  heroBattles: BattleReport[];
  championName: string;
  heroWon: boolean;
  heroPlacement: number;
  rewards: BattleRewards;
  worldEvents: WorldEvent[];
  ruleIds?: string[];
}

export interface DailyActivityReport {
  kind: "training" | "duel";
  title: string;
  description: string;
  battle?: BattleReport;
  experience: number;
  gold: number;
  levelsGained: number;
}

export interface ActivityAvailability {
  unlocked: boolean;
  reason: string;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  classId: HeroClass;
  level: number;
  arenaIndex: number;
  rating: number;
  tournamentWins: number;
  wins: number;
  losses: number;
  kills: number;
  isHero: boolean;
  carriedFromCycle?: number;
}

export type PendingBattleKind =
  | "dungeon"
  | "expedition"
  | "duel"
  | "boss"
  | "legacy-champion"
  | "legend-hunt"
  | "legend-defense"
  | "arena-tournament"
  | "crown-league";

export interface PendingTournamentMatchState {
  round: number;
  match: number;
  firstId: string;
  secondId?: string;
  winnerId: string;
  heroInvolved: boolean;
  battle?: BattleReport;
  bye: boolean;
}

/** Serializable bracket cursor. It pauses immediately before every hero match. */
export interface PendingTournamentState {
  kind: "arena" | "crown";
  activityId: string;
  participantIds: string[];
  initialSeeds: string[];
  round: number;
  pairs: Array<[string, string?]>;
  pairIndex: number;
  roundWinners: string[];
  matches: PendingTournamentMatchState[];
  heroBattles: BattleReport[];
  heroPlacement: number;
  ruleIds: string[];
  wasElite?: boolean;
  eventCursor?: string;
}

/**
 * A persisted battle transaction. Session state may be stepped freely, while
 * campaign rewards, ratings and injuries are only committed by finalize.
 */
export interface PendingBattle {
  version: 1;
  id: string;
  kind: PendingBattleKind;
  activityId: string;
  enemyId: string;
  /** Detached opponent data also supports bosses and dungeon guardians. */
  enemy: EnemyProfile;
  startedDay: number;
  session: BattleSessionSnapshot;
  tournament?: PendingTournamentState;
  context?: Record<string, string | number | boolean | string[] | number[] | undefined>;
}

export interface PendingBattleFinalization {
  status: "complete" | "next-battle";
  battle: BattleReport;
  result?: BattleReport | DailyActivityReport | TournamentReport | ExpeditionStepReport;
  pendingBattle?: PendingBattle;
}
