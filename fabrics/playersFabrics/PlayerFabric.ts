import { Player } from "../../abstract/Player";
import { ArcherFabric } from "./ArcherFabric";
import { KnightFabric } from "./KnightFabric";
import { WizardFabric } from "./WizardFabric";

export class PlayerFabric {
  private archerFabric = new ArcherFabric();
  private knightFabric = new KnightFabric();
  private wizardFabric = new WizardFabric();

  public createPlayer(
    playerClass: string,
    playerHealth: number,
    playerStrength: number
  ): Player | undefined {
    const names: string[] = [
      "Эльдар",
      "Артур",
      "Гэндальф",
      "Вильямс",
      "Агатон",
      "Аполлон",
      "Артемида",
      "Зевс",
      "Персей",
      "Феникс",
      "Элита",
      "Ирида",
      "Медея",
      "Орион",
      "Рафаэль",
      "Себастиан",
      "Эмиль",
      "Аврора",
      "Веста",
      "Лилия",
      "Мира",
    ];
    switch (playerClass) {
      case "Knight":
        return this.knightFabric.createKnight(
          names,
          playerHealth,
          playerStrength
        );
      case "Archer":
        return this.archerFabric.createArcher(
          names,
          playerHealth,
          playerStrength
        );
      case "Wizard":
        return this.wizardFabric.createWizard(
          names,
          playerHealth,
          playerStrength
        );
    }
  }
}
