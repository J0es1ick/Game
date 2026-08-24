import type { IEquipment } from "../equipment/IEquipment";

export type HeroClass =
  | "Knight"
  | "Archer"
  | "Wizard"
  | "Monk"
  | "Gunsmith"
  | "Swordsman";

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";
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
  isVisualTestItem?: boolean;
}

export type TacticalStyle = "balanced" | "aggressive" | "defensive" | "control";

export interface TacticalProfile {
  id: string;
  name: string;
  style: TacticalStyle;
  healThreshold: number;
  finisherThreshold: number;
  preserveStrongSkills: boolean;
  prioritizeControl: boolean;
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
  tacticalStyle: TacticalStyle;
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
}

export interface ShopOffer {
  item: EquipmentItem;
  sold: boolean;
}

export interface GameSave {
  version: 2;
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
  tutorialCompleted?: boolean;
  pendingEliteChallengeId?: string;
  contractOffers: ContractOffer[];
  activeContract?: ContractOffer;
  completedContracts: number;
  activeExpedition?: DungeonExpedition;
  tournamentRuleSeed: number;
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
}
