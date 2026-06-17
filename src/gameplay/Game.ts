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

  constructor(
    playerCount: number,
    player: Player | undefined = undefined,
    logger: Logger,
    options: GameOptions = {},
  ) {
    this._players = this.playerFabric.createRandomPlayers(playerCount);
    this.logger = logger;
    this.arenaFabric = options.arenaFabric ?? new ArenaFabric();
    this.fixedArenaName = options.arenaName;
    if (player !== undefined) {
      this._players.push(player);
    }
  }

  public get players(): Player[] {
    return this._players;
  }

  public get currentArena(): IArena | undefined {
    return this._currentArena;
  }

  public async start(): Promise<Player> {
    this.logger.messageLog("Игра началась!");
    let listOfPlayers = "Список участников: \n\n";
    listOfPlayers += this._players
      .map((player) => `(${player.className}) ${player.name}`)
      .join("\n\n");
    this.logger.messageLog(listOfPlayers);
    const winner = await this.tournament(this._players);
    this.logger.messageLog(`Победитель: (${winner.className}) ${winner.name}`);
    return winner;
  }

  public async tournament(players: Player[]): Promise<Player> {
    if (players.length === 1) {
      return players[0];
    }

    const nextRoundPlayers: Player[] = [];
    for (let i = 0; i < players.length; i += 2) {
      const player1 = players[i];
      const player2 = players[i + 1];

      if (player2 === undefined) {
        this.logger.messageLog(
          `(${player1.className}) ${player1.name} проходит в следующий раунд без боя`,
        );
        nextRoundPlayers.push(player1);
        continue;
      }

      const winner = await this.battle([player1, player2]);
      winner.reset();
      nextRoundPlayers.push(winner);
    }

    return this.tournament(nextRoundPlayers);
  }

  public async battle(fighters: Player[]): Promise<Player> {
    if (fighters.length < 2) {
      return fighters[0];
    }

    this._currentArena = this.arenaFabric.createArena(this.fixedArenaName);
    this.logger.messageLog(
      `Арена: ${this._currentArena.name} — ${this._currentArena.description}`,
    );
    this.logger.messageLog(`(${fighters[0].name}) vs (${fighters[1].name})`);

    const arena = this._currentArena;
    let turn = 0;

    while (fighters[0].health > 0 && fighters[1].health > 0) {
      const attackerIndex = turn % 2;
      const defenderIndex = (turn + 1) % 2;
      const attacker = fighters[attackerIndex];
      const defender = fighters[defenderIndex];

      if (defender.isAlive) {
        if (attacker.countOfSkipingTurns === 0) {
          const damage = attacker.attack(defender, arena);
          if (damage > 0) {
            this.logger.attackLog(attacker, defender, damage);
          }
        } else {
          attacker.attack(defender, arena);
          this.logger.skipTurnLog(attacker);
        }

        if (!defender.isAlive) {
          this.logger.deathLog(defender);
          break;
        }
      }

      if (Math.random() < 0.4 && attacker.isAlive && defender.isAlive) {
        attacker.choseSkill();
        const isUsed: boolean = attacker.useSkill(defender);
        if (isUsed) {
          this.logger.skillLog(attacker, defender);
        }
      }

      await this.delay(0);
      turn++;
    }

    this.updatePlayersArray();
    const winner = fighters.find((player) => player.health > 0)!;
    const defeated = fighters.find((player) => player !== winner);
    const experienceReward =
      (arena?.experienceBonus ?? 0) + (defeated?.level ?? 1) * 10;
    const levelUps = winner.gainExperience(experienceReward);
    if (levelUps > 0) {
      this.logger.messageLog(
        `(${winner.className}) ${winner.name} повышает уровень до ${winner.level}`,
      );
    }
    return winner;
  }

  private delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private updatePlayersArray() {
    this._players = this._players.filter((player) => player.isAlive);
  }
}
