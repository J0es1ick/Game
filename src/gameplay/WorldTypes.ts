import type { IEquipment } from "../equipment/IEquipment";
import type { RandomSnapshot } from "./RandomSource";
import type { StructuredWorldEventPayload } from "./WorldEvents";
import type { DungeonNodeKind, DungeonRoute } from "./DungeonRoute";
import type { CrownSeasonResult, CrownSeasonState } from "./CrownSeason";
import type { LootPityState, LootTarget } from "./LootProgression";
import type { EraChallengeProgressState } from "./EraChallenges";
import type { BattleSessionSnapshot } from "./AdvancedBattle";
import type { NpcLifeWorldState } from "./NpcLifeSimulation";
import type { WorldSeasonResult, WorldSeasonState } from "./WorldSeason";
import type { FactionCampaignState } from "./FactionCampaign";

export type HeroClass =
  | "Knight"
  | "Archer"
  | "Wizard"
  | "Monk"
  | "Gunsmith"
  | "Swordsman";

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic" | "relic";
export type BaseRarity = Exclude<Rarity, "relic">;
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
  relicRenown?: number;
  relicTier?: 0 | 1 | 2 | 3;
  relicPath?: "might" | "guard" | "tempo";
  relicName?: string;
  relicHistory?: string[];
  relicFeats?: string[];
  relicProperties?: ItemAffix[];
  appearanceVariant?: string;
  inheritedFromCycle?: number;
  worldRelicId?: string;
  relicBaseRarity?: BaseRarity;
  isVisualTestItem?: boolean;
}

export type NpcGoal = "champion" | "wealth" | "relic" | "vengeance" | "elite";
export type NpcActivity = "training" | "arena" | "dungeon" | "shopping" | "forging" | "rest";

export interface NpcRelationship {
  fighterId: string;
  kind: "rival" | "ally" | "mentor";
  intensity: number;
  lastChangedDay: number;
  encounters?: number;
  outcomeBalance?: number;
}

export interface NpcActivityRecord {
  day: number;
  activity: NpcActivity;
  description: string;
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
  breakGuardFirst?: boolean;
  ultimateHealthThreshold?: number;
  preferredOpeningSkillId?: string;
}

export interface HeroStyleSignature {
  day: number;
  classId: HeroClass;
  tacticalStyle: TacticalStyle;
  skillIds: string[];
  dominantSkillId?: string;
  behavior: Partial<Record<HeroBehaviorPattern, number>>;
  fingerprint?: {
    openingActionIds: string[];
    defensiveRatio: number;
    healingRatio: number;
    healingUrgency: number;
    comboPatterns: string[];
    repetitionRatio: number;
  };
}

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
  exclusiveToFaction?: string;
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

export interface EquipmentResonance {
  setId: string;
  setName: string;
  path: "might" | "guard" | "tempo";
  stage: 1 | 2 | 3;
  pieces: number;
  description: string;
}

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
  duelWins?: number;
  duelLosses?: number;
  tournamentWins: number;
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
  factionId?: string;
  gold?: number;
  goal?: NpcGoal;
  joinedDay?: number;
  lastActivity?: NpcActivityRecord;
  relationships?: Record<string, NpcRelationship>;
  mentorId?: string;
  legendSinceDay?: number;
  retiredDay?: number;
  factionLoyalty?: number;
  factionHostility?: Record<string, number>;
}

export interface MentorRecord {
  id: string;
  fighterId: string;
  name: string;
  classId: HeroClass;
  factionId: string;
  goal: NpcGoal;
  level: number;
  rating: number;
  retiredDay: number;
  studentIds: string[];
  legacy: string;
  schoolName?: string;
  competes?: boolean;
  dynastyId?: string;
  role?: "mentor" | "shop-owner" | "faction-founder";
}

export interface FactionControlState {
  arenaControllers: Record<string, string>;
  arenaInfluence: Record<string, Record<string, number>>;
  shopControllerId: string;
  lastShiftDay: number;
  dungeonControllers?: Record<string, string>;
  dungeonInfluence?: Record<string, Record<string, number>>;
  relations?: Record<string, Record<string, number>>;
  shopOwnerMentorId?: string;
  shopPriceRevision?: number;
}

export interface WorldRelicRecord {
  id: string;
  item: EquipmentItem;
  createdDay: number;
  status: "wielded" | "lost" | "shop";
  currentOwnerId?: string;
  currentOwnerName?: string;
  formerOwners: string[];
  history: string[];
  legacyKind?: "conquest" | "blood" | "journey";
  legacyStage?: 1 | 2 | 3;
  legacyProperty?: ItemAffix;
  lastSyncedDay?: number;
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
  heroMemory?: EnemyStyleMemory;
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
  worldRole?: "legend" | "boss" | "mentor" | "faction-founder";
  schoolName?: string;
  factionId?: string;
  rememberedByIds?: string[];
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
  pendingMerchantNodeId?: string;
  attackMultiplier?: number;
  defenseMultiplier?: number;
  lootChanceBonus?: number;
  daysSpent?: number;
  supplies?: number;
  maxSupplies?: number;
  discoveredNodeIds?: string[];
  encounteredFighterIds?: string[];
}

export interface DungeonDiscovery {
  dungeonId: string;
  completedRuns: number;
  discoveredNodeIds: string[];
  discoveredClueIds: string[];
  seenEncounterKinds: DungeonNodeKind[];
  alternateBossDefeated?: boolean;
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
  factionControl?: FactionControlState;
  factionCampaigns?: FactionCampaignState;
  mentors?: MentorRecord[];
  worldRelics?: WorldRelicRecord[];
  npcLife?: NpcLifeWorldState;
  worldSeason?: WorldSeasonState;
  worldSeasonHistory?: WorldSeasonResult[];
  dungeonDiscoveries?: Record<string, DungeonDiscovery>;
  pendingFactionHunterId?: string;
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
  setCounts?: Record<string, number>;
  equipmentResonance?: EquipmentResonance;
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
  decisionReason?: string;
  decisionScore?: number;
  resourceChange?: number;
  resourceTriggered?: string;
  statusComboIds?: string[];
}

export interface FighterBattleAnalytics {
  fighterId: string;
  fighterName: string;
  totalDamage: number;
  totalHealing: number;
  criticalHits: number;
  mostUsedSkillId?: string;
  decisiveSkillId?: string;
  statusComboIds: string[];
  resourceTriggers: string[];
}

export interface BattleAnalytics {
  duration: number;
  actionCount: number;
  fighters: FighterBattleAnalytics[];
  decidingEffect?: string;
  adaptationReason?: string;
  highlights: string[];
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
  analysis?: BattleAnalytics;
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
  schoolName?: string;
  mentorName?: string;
  isMentor?: boolean;
}

export type PendingBattleKind =
  | "dungeon"
  | "expedition"
  | "duel"
  | "boss"
  | "legacy-champion"
  | "world-encounter"
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

export interface PendingBattle {
  version: 1;
  id: string;
  kind: PendingBattleKind;
  activityId: string;
  enemyId: string;
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
