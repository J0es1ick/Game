import { DispatchTrace, Player } from "../abstract/Player";
import { ArenaPool } from "../arenas/ArenaPool";
import { IArena } from "../arenas/IArena";
import { PlayerFactory } from "../factories/PlayerFactory";
import { Logger } from "../utils/output/Logger";

export type TournamentState = "idle" | "battle" | "finished";

export interface PatternInsight {
  principle: "Template Method" | "Strategy" | "Polymorphism";
  method: string;
  description: string;
}

export interface TurnReport {
  attacker: Player;
  defender: Player;
  damage: number;
  skipped: boolean;
  skillName?: string;
  battleFinished: boolean;
  tournamentFinished: boolean;
  winner?: Player;
  defeated?: Player;
  insights: PatternInsight[];
}

export interface GameOptions {
  arenaName?: string;
  arenaPool?: ArenaPool;
  playerFactory?: PlayerFactory;
}

function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export class Game {
  private readonly playerFactory: PlayerFactory;
  private readonly arenaPool: ArenaPool;
  private readonly logger: Logger;
  private readonly fixedArenaName?: string;

  private _players: Player[] = [];
  private _currentArena?: IArena;
  private _battleFighters: Player[] = [];
  private _turn = 0;
  private _battleActive = false;
  private _state: TournamentState = "idle";
  private _round = 1;
  private _match = 0;
  private _champion?: Player;
  private _lastTurnReport?: TurnReport;
  private _eliminated = new Set<Player>();

  private roundPlayers: Player[] = [];
  private roundWinners: Player[] = [];
  private matchCursor = 0;
  private tournamentMode = false;

  constructor(
    playerCountOrPlayers: number | Player[] = 2,
    player?: Player,
    logger: Logger = new Logger(),
    options: GameOptions = {},
  ) {
    this.playerFactory = options.playerFactory ?? new PlayerFactory();
    this.arenaPool = options.arenaPool ?? new ArenaPool();
    this.fixedArenaName = options.arenaName;
    this.logger = logger;

    this._players = Array.isArray(playerCountOrPlayers)
      ? [...playerCountOrPlayers]
      : this.playerFactory.createMany(playerCountOrPlayers);
    if (player) this._players.push(player);
  }

  public get players(): Player[] { return this._players; }
  public get currentArena(): IArena | undefined { return this._currentArena; }
  public get battleFighters(): Player[] { return this._battleFighters; }
  public get turn(): number { return this._turn; }
  public get battleActive(): boolean { return this._battleActive; }
  public get state(): TournamentState { return this._state; }
  public get round(): number { return this._round; }
  public get match(): number { return this._match; }
  public get champion(): Player | undefined { return this._champion; }
  public get lastTurnReport(): TurnReport | undefined { return this._lastTurnReport; }
  public get eliminated(): Player[] { return [...this._eliminated]; }

  public async start(): Promise<Player> {
    this.logger.messageLog("Игра началась!");
    this.logger.messageLog(
      `Список участников: ${this._players.map((hero) => `(${hero.className}) ${hero.name}`).join(", ")}`,
    );
    const winner = await this.tournament(this._players);
    this.logger.messageLog(`Победитель: (${winner.className}) ${winner.name}`);
    return winner;
  }

  public async tournament(players: Player[]): Promise<Player> {
    if (players.length === 0) throw new Error("Для турнира нужен хотя бы один герой.");
    if (players.length === 1) return players[0];
    this.startTournament(players);
    while (this._state !== "finished") this.doStep();
    return this._champion!;
  }

  public startTournament(players: Player[] = this._players): void {
    if (players.length < 2) throw new Error("Для турнира нужны хотя бы два героя.");
    this.resetTournament();
    this._players = [...players];
    this._players.forEach((hero) => hero.reset());
    this.roundPlayers = shuffled(this._players);
    this.tournamentMode = true;
    this._state = "battle";
    this.logger.messageLog(`Турнир начинается: участников — ${players.length}.`);
    this.prepareNextMatch();
  }

  public resetTournament(): void {
    this._players.forEach((hero) => hero.reset());
    this._currentArena = undefined;
    this._battleFighters = [];
    this._turn = 0;
    this._battleActive = false;
    this._state = "idle";
    this._round = 1;
    this._match = 0;
    this._champion = undefined;
    this._lastTurnReport = undefined;
    this._eliminated.clear();
    this.roundPlayers = [];
    this.roundWinners = [];
    this.matchCursor = 0;
    this.tournamentMode = false;
  }

  public async battle(fighters: Player[]): Promise<Player> {
    if (fighters.length < 2) return fighters[0];
    this.startStepBattle(fighters);
    while (this._battleActive) this.doStep();
    return fighters.find((hero) => hero.isAlive)!;
  }

  public startStepBattle(fighters: Player[]): void {
    if (fighters.length < 2) return;
    this.tournamentMode = false;
    this._state = "battle";
    this.setupBattle(fighters[0], fighters[1]);
  }

  public doStep(): TurnReport | null {
    if (!this._battleActive || this._battleFighters.length < 2 || !this._currentArena) {
      return null;
    }

    const attacker = this._battleFighters[this._turn % 2];
    const defender = this._battleFighters[(this._turn + 1) % 2];
    attacker.clearDispatch();
    defender.clearDispatch();

    const healthBefore = defender.health;
    const skipped = attacker.countOfSkipingTurns > 0;
    let skillName: string | undefined;

    if (skipped) {
      attacker.attack(defender, this._currentArena);
      this.logger.skipTurnLog(attacker);
    } else {
      const damage = attacker.attack(defender, this._currentArena);
      if (damage > 0) this.logger.attackLog(attacker, defender, damage);

      if (defender.isAlive && Math.random() < 0.4) {
        attacker.choseSkill();
        if (attacker.currentSkill && attacker.useSkill(defender)) {
          skillName = attacker.currentSkill.name;
          this.logger.skillLog(attacker, defender);
        }
      }
    }

    this._turn += 1;
    const damage = Math.max(0, healthBefore - defender.health);
    const insights = this.buildInsights(attacker, defender);
    const battleFinished = !defender.isAlive;
    let winner: Player | undefined;
    let defeated: Player | undefined;

    if (battleFinished) {
      this.logger.deathLog(defender);
      winner = attacker;
      defeated = defender;
      this.finishBattle(winner, defeated);
    }

    const report: TurnReport = {
      attacker,
      defender,
      damage,
      skipped,
      skillName,
      battleFinished,
      tournamentFinished: this._state === "finished",
      winner,
      defeated,
      insights,
    };
    this._lastTurnReport = report;
    return report;
  }

  private setupBattle(first: Player, second: Player): void {
    this._battleFighters = [first, second];
    this._turn = 0;
    this._battleActive = true;
    this._currentArena = this.arenaPool.pick(this.fixedArenaName);
    this.logger.messageLog(`Арена: ${this._currentArena.name} — ${this._currentArena.description}`);
    this.logger.messageLog(`${first.name} против ${second.name}`);
  }

  private prepareNextMatch(): void {
    while (this.tournamentMode) {
      if (this.matchCursor >= this.roundPlayers.length) {
        if (this.roundWinners.length === 1) {
          this._champion = this.roundWinners[0];
          this._battleFighters = [this._champion];
          this._battleActive = false;
          this._state = "finished";
          this.tournamentMode = false;
          this.logger.messageLog(`${this._champion.name} становится победителем турнира.`);
          return;
        }
        this.roundPlayers = this.roundWinners;
        this.roundWinners = [];
        this.matchCursor = 0;
        this._round += 1;
        this.logger.messageLog(`Начинается раунд ${this._round}.`);
        continue;
      }

      const first = this.roundPlayers[this.matchCursor];
      const second = this.roundPlayers[this.matchCursor + 1];
      if (!second) {
        this.roundWinners.push(first);
        this.matchCursor += 2;
        this.logger.messageLog(`${first.name} проходит дальше без боя.`);
        continue;
      }

      this._match = Math.floor(this.matchCursor / 2) + 1;
      this.setupBattle(first, second);
      return;
    }
  }

  private finishBattle(winner: Player, defeated: Player): void {
    this._battleActive = false;
    const experience = (this._currentArena?.experienceBonus ?? 0) + defeated.level * 10;
    const levels = winner.gainExperience(experience);
    if (levels > 0) this.logger.messageLog(`${winner.name} повышает уровень до ${winner.level}.`);
    this.logger.messageLog(`Победитель боя: ${winner.name}.`);

    if (!this.tournamentMode) {
      this._champion = winner;
      this._state = "finished";
      return;
    }
    this._eliminated.add(defeated);
    winner.reset();
    this.roundWinners.push(winner);
    this.matchCursor += 2;
    this.prepareNextMatch();
  }

  private buildInsights(attacker: Player, defender: Player): PatternInsight[] {
    const insights: PatternInsight[] = [
      {
        principle: "Template Method",
        method: "Player.attack()",
        description: "Общий алгоритм: бонус навыка → классовый хук → стратегия арены → получение урона.",
      },
      {
        principle: "Strategy",
        method: `${this._currentArena?.constructor.name}.modifyDamage()`,
        description: this._currentArena?.description ?? "Арена не выбрана.",
      },
    ];

    const dispatches = [attacker.lastDispatch, defender.lastDispatch].filter(
      (trace): trace is DispatchTrace => trace !== null,
    );
    dispatches.forEach((trace) => insights.push({
      principle: "Polymorphism",
      method: trace.method,
      description: trace.message,
    }));
    return insights;
  }
}
