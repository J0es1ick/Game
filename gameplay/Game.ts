import { Player } from "../abstract/Player";
import { PlayerFabric } from "../fabrics/playersFabrics";
import { Logger } from "../utils/output/Logger";

export class Game {
  private playerFabric = new PlayerFabric();
  private players: Player[] = [];
  private logger: Logger = Logger._instance;

  constructor(playerCount: number, player: Player | undefined = undefined) {
    this.players = this.playerFabric.createRandomPlayers(playerCount);
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

  private async tournament(players: Player[]) {}
}
