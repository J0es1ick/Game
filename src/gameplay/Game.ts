import { Player } from "../abstract/Player";
import { PlayerFabric } from "../fabrics/playersFabrics";
import { Logger } from "../utils/output/Logger";

export class Game {
  private playerFabric = new PlayerFabric();
  private players: Player[] = [];
  private logger: Logger = new Logger();

  constructor(playerCount: number, player: Player | undefined = undefined) {
    this.players = this.playerFabric.createRandomPlayers(playerCount);
    if (player !== undefined) {
      this.players.push(player);
    }
  }

  public async start() {
    this.logger.messageLog("Игра началась!");
    let listOfPlayers = "Список участников: \n\n";
    listOfPlayers += this.players
      .map((player) => `(${player.className}) ${player.name}`)
      .join("\n\n");
    this.logger.messageLog(listOfPlayers);
    await this.tournament(this.players);
    this.logger.messageLog(
      `Победитель: (${this.players[0].className}) ${this.players[0].name}`
    );
  }

  private async tournament(players: Player[]): Promise<Player> {
    if (players.length === 1) {
      return players[0];
    }

    const nextRoundPlayers: Player[] = [];
    for (let i = 0; i < players.length; i += 2) {
      const player1 = players[i];
      const player2 = players[i + 1];
      const winner = await this.battle([player1, player2]);
      nextRoundPlayers.push(winner);
      player1.reset();
      player2.reset();
    }

    return this.tournament(nextRoundPlayers);
  }

  private async battle(fighters: Player[]): Promise<Player> {
    this.logger.messageLog(`(${fighters[0].name}) vs (${fighters[1].name})`);

    let turn = 0;

    while (fighters[0].health > 0 && fighters[1].health > 0) {
      const attackerIndex = turn % 2;
      const defenderIndex = (turn + 1) % 2;
      const attacker = fighters[attackerIndex];
      const defender = fighters[defenderIndex];

      if (defender.isAlive) {
        if (attacker.countOfSkipingTurns === 0) {
          attacker.attack(defender);
          this.logger.attackLog(attacker, defender);
        } else {
          attacker.attack(defender);
          this.logger.skipTurnLog(attacker, defender);
        }

        if (!defender.isAlive) {
          this.logger.deathLog(defender);
          break;
        }
      }

      if (Math.random() < 0.5 && attacker.isAlive && defender.isAlive) {
        attacker.choseSkill();
        if (attacker.currentSkill!.usageCount! > 0) {
          attacker.useSkill(defender);
          this.logger.skillLog(attacker, defender);
        }
      }

      await this.delay(200);
      turn++;
    }

    this.updatePlayersArray();
    return fighters.find((player) => player.health > 0)!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  private updatePlayersArray() {
    this.players = this.players.filter((player) => player.isAlive);
  }
}
