import { Player } from "../abstract/Player";
import { ISkill } from "../skills/ISkill";

export const SKILL_NAMES = [
  "огненные стрелы",
  "ледяные стрелы",
  "удар возмездия",
  "заворожение",
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

const templates: Record<SkillName, () => ISkill> = {
  "огненные стрелы": () => ({
    name: "огненные стрелы",
    isUsed: false,
    usageCount: 1,
    initialSkillUsage: 1,
    buff: { strength: 2 },
  }),
  "ледяные стрелы": () => ({
    name: "ледяные стрелы",
    isUsed: false,
    usageCount: 1,
    initialSkillUsage: 1,
    turns: 3,
    initialTurns: 3,
    buff: { strength: 3 },
  }),
  "удар возмездия": () => ({
    name: "удар возмездия",
    isUsed: false,
    usageCount: 1,
    initialSkillUsage: 1,
    damage: (caster: Player) => caster.strength * 1.3 + caster.weapon.damage,
    effect: (caster: Player, opponent: Player) => {
      opponent.takeDamage(caster.strength * 1.3 + caster.weapon.damage);
    },
  }),
  заворожение: () => ({
    name: "заворожение",
    isUsed: false,
    usageCount: 1,
    initialSkillUsage: 1,
    effect: (_caster: Player, opponent: Player) => opponent.skipTurns(1),
  }),
};

export function createSkill(name: string): ISkill | null {
  return name in templates ? templates[name as SkillName]() : null;
}

export function createSkills(names: readonly string[]): ISkill[] {
  return names
    .map(createSkill)
    .filter((skill): skill is ISkill => skill !== null);
}
