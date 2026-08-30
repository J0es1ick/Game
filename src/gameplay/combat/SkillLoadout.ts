import type {
  EnemyProfile,
  HeroProfile,
  SkillDefinition,
  TacticalStyle,
} from "../core/WorldTypes";
import { MAX_ACTIVE_SKILLS } from "../world/WorldRules";

export interface SkillRecommendationOptions {
  style?: TacticalStyle;
  maxSkills?: number;
  preferredOpeningSkillId?: string;
}

function skillValue(skill: SkillDefinition): number {
  const powerWeight =
    skill.kind === "heal" ? 0.3 : skill.kind === "buff" ? 20 : 12;
  return (
    skill.priority * 0.6 +
    skill.power * powerWeight -
    skill.cooldown * 0.75 -
    (skill.id === "execution" ? 3 : 0)
  );
}

export function recommendedSkills(
  available: readonly SkillDefinition[],
  options: SkillRecommendationOptions = {},
): SkillDefinition[] {
  const limit = Math.max(
    0,
    Math.min(MAX_ACTIVE_SKILLS, options.maxSkills ?? MAX_ACTIVE_SKILLS),
  );
  const unique = [
    ...new Map(available.map((skill) => [skill.id, skill])).values(),
  ];
  const ordered = unique.sort(
    (first, second) =>
      skillValue(second) - skillValue(first) ||
      first.id.localeCompare(second.id),
  );
  const result: SkillDefinition[] = [];
  const add = (skill: SkillDefinition | undefined): void => {
    if (
      skill &&
      result.length < limit &&
      !result.some((candidate) => candidate.id === skill.id)
    )
      result.push(skill);
  };
  const best = (kind: SkillDefinition["kind"]): SkillDefinition | undefined =>
    ordered.find(
      (skill) =>
        skill.kind === kind &&
        !result.some((candidate) => candidate.id === skill.id),
    );
  add(best("attack") ?? best("control"));
  if (options.style === "control") add(best("control") ?? best("attack"));
  else add(best("attack") ?? best("control"));
  add(best("heal"));
  if (options.style === "defensive") add(best("buff") ?? best("control"));
  else add(best("control") ?? best("buff"));
  ordered.forEach((skill) => {
    if (
      (skill.kind === "heal" || skill.kind === "buff") &&
      result.some((candidate) => candidate.kind === skill.kind)
    )
      return;
    add(skill);
  });
  const opening = ordered.find(
    (skill) => skill.id === options.preferredOpeningSkillId,
  );
  if (opening && !result.some((skill) => skill.id === opening.id)) {
    const sameKind = result.findIndex((skill) => skill.kind === opening.kind);
    if (sameKind >= 0) result[sameKind] = opening;
    else if (result.length < limit) add(opening);
  }
  return result;
}

export function selectActiveSkills(
  profile: HeroProfile | EnemyProfile,
  available: readonly SkillDefinition[],
  options: SkillRecommendationOptions = {},
): SkillDefinition[] {
  const recommended = recommendedSkills(available, options);
  if (!("selectedSkillIds" in profile) || profile.autoSelectSkills !== false)
    return recommended;
  const selectedIds = [...new Set(profile.selectedSkillIds)].slice(
    0,
    MAX_ACTIVE_SKILLS,
  );
  const selected = selectedIds.flatMap((id) => {
    const skill = available.find((candidate) => candidate.id === id);
    return skill ? [skill] : [];
  });
  if (selected.length === 0) return recommended;
  if (selected.length < selectedIds.length) {
    recommended.forEach((skill) => {
      if (
        selected.length < selectedIds.length &&
        !selected.some((candidate) => candidate.id === skill.id)
      )
        selected.push(skill);
    });
  }
  return selected;
}
