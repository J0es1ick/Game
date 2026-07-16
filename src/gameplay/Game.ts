// src/gameplay/Game.ts
import { Player } from "../abstract/Player";
import { ArenaFabric } from "../fabrics/arenasFabric/ArenaFabric";
import type { IArena } from "../arenas/IArena";
import { PlayerFabric } from "../fabrics/playersFabrics";
import { Logger } from "../utils/output/Logger";

export interface GameOptions {
  arenaName?: string;
  arenaFabric?: ArenaFabric;
}

export class Game {
  private playerFabric = new PlayerFabric();
  private arenaFabric: ArenaFabric;
  private _players: Player[] = [];
  private logger: Logger;
  private _currentArena?: IArena;
  private fixedArenaName?: string;

  // === Новые поля для пошагового боя ===
  private _battleFighters: Player[] = [];
  private _turn: number = 0;
  private _battleActive: boolean = false;

  constructor(
    playerCountOrPlayers?: number | Player[],
    player?: Player,
    logger?: Logger,
    options: GameOptions = {},
  ) {
    this.logger = logger || new Logger();
    this.arenaFabric = options.arenaFabric ?? new ArenaFabric();
    this.fixedArenaName = options.arenaName;

    if (Array.isArray(playerCountOrPlayers)) {
      this._players = playerCountOrPlayers;
      if (player) this._players.push(player);
    } else {
      const count = playerCountOrPlayers ?? 2;
      this._players = this.playerFabric.createRandomPlayers(count);
      if (player) this._players.push(player);
    }
  }

  // --- Геттеры ---
  public get players(): Player[] {
    return this._players;
  }
  public get currentArena(): IArena | undefined {
    return this._currentArena;
  }
  public get battleFighters(): Player[] {
    return this._battleFighters;
  }
  public get turn(): number {
    return this._turn;
  }
  public get battleActive(): boolean {
    return this._battleActive;
  }

  // --- Турнир (автоматический) ---
  public async start(): Promise<Player> {
    this.logger.messageLog("Игра началась!");
    this.logger.messageLog(
      `Список участников: ${this._players
        .map((player) => `(${player.className}) ${player.name}`)
        .join(", ")}`,
    );
    const winner = await this.tournament(this._players);
    this.logger.messageLog(`Победитель: (${winner.className}) ${winner.name}`);
    return winner;
  }

  public async tournament(players: Player[]): Promise<Player> {
    if (players.length === 1) return players[0];
    const nextRound: Player[] = [];
    for (let i = 0; i < players.length; i += 2) {
      const p1 = players[i];
      const p2 = players[i + 1];
      if (!p2) {
        this.logger.messageLog(`${p1.name} проходит дальше без боя`);
        nextRound.push(p1);
        continue;
      }
      const winner = await this.battle([p1, p2]);
      winner.reset();
      nextRound.push(winner);
    }
    return this.tournament(nextRound);
  }

  // --- Полный бой (автоматический) ---
  public async battle(fighters: Player[]): Promise<Player> {
    if (fighters.length < 2) return fighters[0];
    this._currentArena = this.arenaFabric.createArena(this.fixedArenaName);
    this.logger.messageLog(
      `Арена: ${this._currentArena.name} — ${this._currentArena.description}`,
    );
    this.logger.messageLog(`${fighters[0].name} vs ${fighters[1].name}`);

    let turn = 0;
    while (fighters[0].health > 0 && fighters[1].health > 0) {
      const attacker = fighters[turn % 2];
      const defender = fighters[(turn + 1) % 2];
      this.executeTurn(attacker, defender);
      await this.delay(0);
      turn++;
    }
    const winner = fighters.find((p) => p.health > 0)!;
    const defeated = fighters.find((p) => p !== winner)!;
    const exp =
      (this._currentArena?.experienceBonus ?? 0) + defeated.level * 10;
    const levelUps = winner.gainExperience(exp);
    if (levelUps > 0) {
      this.logger.messageLog(
        `${winner.name} повышает уровень до ${winner.level}`,
      );
    }
    return winner;
  }

  // --- Пошаговое управление (новые методы) ---
  public startStepBattle(fighters: Player[]): void {
    if (fighters.length < 2) return;
    this._battleFighters = fighters;
    this._turn = 0;
    this._battleActive = true;
    this._currentArena = this.arenaFabric.createArena(this.fixedArenaName);
    this.logger.messageLog(
      `Арена: ${this._currentArena.name} — ${this._currentArena.description}`,
    );
    this.logger.messageLog(`${fighters[0].name} vs ${fighters[1].name}`);
  }

  public doStep(): boolean {
    if (!this._battleActive || this._battleFighters.length < 2) return false;
    const [f1, f2] = this._battleFighters;
    if (f1.health <= 0 || f2.health <= 0) {
      this._battleActive = false;
      return true; // бой завершён
    }
    const attacker = this._battleFighters[this._turn % 2];
    const defender = this._battleFighters[(this._turn + 1) % 2];
    this.executeTurn(attacker, defender);
    this._turn++;

    // Проверка завершения
    if (f1.health <= 0 || f2.health <= 0) {
      this._battleActive = false;
      const winner = f1.health > 0 ? f1 : f2;
      const defeated = f1.health > 0 ? f2 : f1;
      const exp =
        (this._currentArena?.experienceBonus ?? 0) + defeated.level * 10;
      const levelUps = winner.gainExperience(exp);
      if (levelUps > 0) {
        this.logger.messageLog(
          `${winner.name} повышает уровень до ${winner.level}`,
        );
      }
      this.logger.messageLog(`Победитель боя: ${winner.name}`);
      return true; // бой завершён
    }
    return false; // бой продолжается
  }

  private executeTurn(attacker: Player, defender: Player): void {
    // Используем существующую логику из battle, но без задержки
    if (defender.isAlive) {
      if (attacker.countOfSkipingTurns === 0) {
        const damage = attacker.attack(defender, this._currentArena);
        if (damage > 0) {
          this.logger.attackLog(attacker, defender, damage);
        }
      } else {
        attacker.attack(defender, this._currentArena);
        this.logger.skipTurnLog(attacker);
      }
      if (!defender.isAlive) {
        this.logger.deathLog(defender);
        return;
      }
    }
    // Шанс использовать навык
    if (Math.random() < 0.4 && attacker.isAlive && defender.isAlive) {
      attacker.choseSkill();
      if (attacker.currentSkill && attacker.useSkill(defender)) {
        this.logger.skillLog(attacker, defender);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));
  }
}
