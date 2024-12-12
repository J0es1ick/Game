import { Player } from "../../abstract/Player";
import { ISkill } from "../../skills/ISkill";

export class SkillFabric {
  private skillsTemplate: ISkill[] = [
    {
      name: "огненные стрелы",
      effect: (caster: Player, opponent: Player) => {
        caster.strength += 2;
      },
    },
    {
      name: "ледяные стрелы",
      turns: 3,
      effect: (caster: Player, opponent: Player) => {
        caster.strength += 3;
      },
    },
    {
      name: "удар возмездия",
      damage: (caster: Player) => caster.strength * 1.3,
      effect: (caster: Player, opponent: Player) => {
        const weaponDamage = caster.weapon ? caster.weapon.damage : 0;
        opponent.takeDamage(caster.strength * 1.3 + weaponDamage);
      },
    },
    {
      name: "заворожение",
      effect: (caster: Player, opponent: Player) => {
        opponent.skipTurns(1);
      },
    },
  ];

  public createSkill(
    skillName: string,
    skillDamage: (caster: Player) => number | undefined,
    skillTurns: number | undefined = undefined,
    skillEffect: (caster: Player, opponent: Player) => void
  ) {
    const skill: ISkill = {
      name: skillName,
      damage: skillDamage,
      turns: skillTurns,
      effect: skillEffect,
    };
    return skill;
  }

  public createSkillFromTemplate(templateName: string): ISkill | undefined {
    const skillTemplate = this.skillsTemplate.find(
      (skill) => skill.name === templateName.toLowerCase()
    );
    if (!skillTemplate) {
      return undefined;
    }

    return this.createSkill(
      skillTemplate.name,
      skillTemplate.damage!,
      skillTemplate.turns,
      skillTemplate.effect
    );
  }
}
