import { Player } from "../../abstract/Player";
import { ISkill } from "../../skills/ISkill";

export class SkillFabric {
  private skillsTemplate: ISkill[] = [
    {
      name: "огненные стрелы",
      usageCount: 1,
      effect: (caster: Player, opponent: Player) => {
        caster.damageUp(2);
      },
    },
    {
      name: "ледяные стрелы",
      usageCount: 1,
      turns: 3,
      effect: (caster: Player, opponent: Player) => {
        caster.damageUp(3);
      },
    },
    {
      name: "удар возмездия",
      usageCount: 1,
      damage: (caster: Player) => caster.strength * 1.3,
      effect: (caster: Player, opponent: Player) => {
        const weaponDamage = caster.weapon ? caster.weapon.damage : 0;
        opponent.takeDamage(caster.strength * 1.3 + weaponDamage);
      },
    },
    {
      name: "заворожение",
      usageCount: 1,
      effect: (caster: Player, opponent: Player) => {
        opponent.skipTurns(1);
      },
    },
  ];

  public createSkill(
    skillName: string,
    skillDamage: (caster: Player) => number | undefined,
    skillUsageCount: number,
    skillTurns: number | undefined = undefined,
    skillEffect: (caster: Player, opponent: Player) => void
  ) {
    const skill: ISkill = {
      name: skillName,
      damage: skillDamage,
      usageCount: skillUsageCount,
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
      skillTemplate.usageCount,
      skillTemplate.turns,
      skillTemplate.effect
    );
  }
}
