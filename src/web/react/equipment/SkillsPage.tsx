import { useMemo, useState } from "react";
import {
  MAX_ACTIVE_SKILLS,
  unlockedSkills,
} from "../../../gameplay/AdvancedBattle";
import { selectActiveSkills } from "../../../gameplay/SkillLoadout";
import { EQUIPMENT_SKILLS, SKILLS } from "../../../catalogs/WorldCatalog";
import type {
  SkillDefinition,
  TacticalStyle,
} from "../../../gameplay/WorldTypes";
import { PageHeading, LazyDetails } from "../components/common";
import { useGame } from "../state/GameContext";
import { pageSlice } from "./model";
import { Pagination, useEquipment } from "./shared";

const kindNames = {
  attack: "Атака",
  heal: "Лечение",
  buff: "Усиление",
  control: "Контроль",
} as const;
const profileDescriptions: Record<TacticalStyle, string> = {
  aggressive: "Раньше использует добивающие атаки и реже лечится.",
  defensive: "Сохраняет сильные навыки и раньше восстанавливается.",
  control: "Сначала нарушает темп и ослабляет противника.",
  balanced: "Универсальный порядок решений без перекоса.",
};

function SkillCard({
  skill,
  status,
  available,
  active,
  source,
  onToggle,
}: {
  skill: SkillDefinition;
  status: string;
  available: boolean;
  active: boolean;
  source?: string;
  onToggle: () => void;
}) {
  return (
    <article
      className={`skill-node ${skill.kind}${available ? " unlocked" : " locked"}${active ? " selected" : ""}${skill.equipmentOnly ? " gear-skill" : ""}`}
    >
      <span className="skill-level">{status}</span>
      <h3>{skill.name}</h3>
      <p>
        {skill.description}
        {source ? ` ${source}` : ""}
      </p>
      <div className="skill-meta">
        {kindNames[skill.kind]} · перезарядка {skill.cooldown} х.
      </div>
      {available && (
        <button
          className={`skill-select${active ? " active" : ""}`}
          type="button"
          onClick={onToggle}
        >
          {active ? "Убрать из сборки" : "Добавить в сборку"}
        </button>
      )}
    </article>
  );
}

export function SkillsPage() {
  const { game, revision, act } = useGame();
  const { hero, equipped } = useEquipment();
  const [classPage, setClassPage] = useState(0);
  const [gearPage, setGearPage] = useState(0);
  const availableSkills = useMemo(
    () =>
      unlockedSkills(
        hero.classId,
        hero.level,
        equipped,
        hero.legacySkillId ? [hero.legacySkillId] : [],
      ),
    [game, revision, equipped],
  );
  const availableIds = new Set(availableSkills.map((skill) => skill.id));
  const profile = game.activeTacticalProfile();
  const build = useMemo(
    () => selectActiveSkills(hero, availableSkills, profile),
    [game, revision, availableSkills, profile],
  );
  const activeIds = new Set(build.map((skill) => skill.id));
  const relevant = useMemo(
    () =>
      SKILLS.filter(
        (skill) =>
          !skill.equipmentOnly &&
          (skill.classes === "all" ||
            skill.classes.includes(hero.classId) ||
            skill.id === hero.legacySkillId),
      ).sort((first, second) => first.unlockLevel - second.unlockLevel),
    [hero.classId, hero.legacySkillId],
  );
  const equipmentSkills = useMemo(
    () =>
      EQUIPMENT_SKILLS.filter(
        (skill) =>
          skill.classes === "all" || skill.classes.includes(hero.classId),
      ),
    [hero.classId],
  );
  const ownedSkills = useMemo(() => {
    const result = new Map<string, string>();
    hero.inventory.forEach((item) => {
      if (item.grantedSkillId && !result.has(item.grantedSkillId))
        result.set(item.grantedSkillId, item.name);
    });
    return result;
  }, [game, revision]);
  const activeSources = new Map(
    equipped
      .filter((item) => item.grantedSkillId)
      .map((item) => [item.grantedSkillId!, item.name]),
  );
  const toggleSkill = (id: string) =>
    act((world) => {
      const next = new Set(build.map((skill) => skill.id));
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= MAX_ACTIVE_SKILLS)
          throw new Error(
            `Можно выбрать не больше ${MAX_ACTIVE_SKILLS} навыков.`,
          );
        next.add(id);
      }
      world.setAutoSelectSkills(false);
      world.setSelectedSkills([...next]);
    });
  const classShown = pageSlice(relevant, classPage, 24);
  const gearShown = pageSlice(equipmentSkills, gearPage, 24);
  return (
    <section className="page active" id="page-skills">
      <PageHeading eyebrow="ТАКТИКА И БИЛД" title="Книга навыков">
        <p>
          Выберите до четырёх активных приёмов или доверьте сборку герою.
          Реликтовые навыки доступны с подходящей экипировкой.
        </p>
      </PageHeading>
      <section className="skill-tactics paper-panel" id="skill-tactics">
        <div className="skill-tactics-copy">
          <p className="eyebrow">АКТИВНАЯ СБОРКА</p>
          <h2>
            {hero.autoSelectSkills
              ? "Лучшие навыки выбираются автоматически"
              : `${build.length} из ${MAX_ACTIVE_SKILLS} навыков выбрано`}
          </h2>
          <p>
            {build.length
              ? build.map((skill) => skill.name).join(" · ")
              : "Выберите хотя бы один доступный приём ниже."}
          </p>
        </div>
        <div className="skill-tactics-controls">
          <label className="tactic-toggle">
            <input
              type="checkbox"
              checked={hero.autoSelectSkills}
              onChange={(event) =>
                act((world) => world.setAutoSelectSkills(event.target.checked))
              }
            />{" "}
            Автоматически выбирать лучшие навыки
          </label>
          <span className="tactic-label">Ведение боя</span>
          <div className="tactic-mode-buttons">
            {(["auto", "manual"] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                className={hero.combatMode === mode ? "active" : ""}
                aria-pressed={hero.combatMode === mode}
                onClick={() => act((world) => world.setCombatMode(mode))}
              >
                {mode === "auto" ? "Автоматически" : "Подтверждать ходы"}
              </button>
            ))}
          </div>
          <label className="tactical-profile-picker">
            <span className="tactic-label" data-term="tacticalStyle">
              Тактический профиль
            </span>
            <select
              value={hero.activeTacticalProfileId}
              onChange={(event) =>
                act((world) => world.setTacticalProfile(event.target.value))
              }
            >
              {hero.tacticalProfiles.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
            <small>{profileDescriptions[profile.style]}</small>
          </label>
          <LazyDetails summary="Как действует этот профиль">
            <div className="tactical-profile-details">
              <p>
                Лечение при здоровье ниже{" "}
                {Math.round(profile.healThreshold * 100)}%.
              </p>
              <p>
                Добивание при здоровье противника ниже{" "}
                {Math.round(profile.finisherThreshold * 100)}%.
              </p>
              <p>
                {profile.preserveStrongSkills
                  ? "Мощные навыки сохраняются до подходящего момента."
                  : "Мощные навыки используются при первой возможности."}
              </p>
              {profile.prioritizeControl && (
                <p>Приоритет ослаблению и контролю противника.</p>
              )}
              {profile.breakGuardFirst && (
                <p>Сначала герой пытается сломать защиту.</p>
              )}
            </div>
          </LazyDetails>
        </div>
      </section>
      <header className="skill-section-heading">
        <div>
          <p className="eyebrow">КЛАССОВЫЕ ПРИЁМЫ</p>
          <h2>Изученные и будущие навыки</h2>
        </div>
      </header>
      <div className="skill-road" id="skill-road">
        {classShown.items.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            available={availableIds.has(skill.id)}
            active={activeIds.has(skill.id)}
            status={
              skill.id === hero.legacySkillId
                ? "НАСЛЕДИЕ ПРОШЛОЙ ЭПОХИ"
                : availableIds.has(skill.id)
                  ? `УР. ${skill.unlockLevel} · ОТКРЫТО`
                  : `ОТКРОЕТСЯ НА УР. ${skill.unlockLevel}`
            }
            onToggle={() => toggleSkill(skill.id)}
          />
        ))}
      </div>
      <Pagination {...classShown} onChange={setClassPage} />
      <header className="skill-section-heading">
        <div>
          <p className="eyebrow">СВОЙСТВА СНАРЯЖЕНИЯ</p>
          <h2>Справочник реликтовых навыков</h2>
        </div>
        <p>Такие навыки встречаются на легендарных и мифических предметах.</p>
      </header>
      <div
        className="skill-road equipment-skill-book"
        id="equipment-skill-book"
      >
        {gearShown.items.map((skill) => {
          const source = activeSources.get(skill.id);
          const owned = ownedSkills.get(skill.id);
          const remembered = game.save.legacy.discoveredSkillIds.includes(
            skill.id,
          );
          const status = source
            ? "АКТИВЕН ОТ ЭКИПИРОВКИ"
            : owned
              ? "ЕСТЬ В ИНВЕНТАРЕ"
              : remembered
                ? "ЗАПИСАН В ЛЕТОПИСИ"
                : "ЕЩЁ НЕ НАЙДЕН";
          const sourceText = source
            ? `Источник: ${source}.`
            : owned
              ? `Найден на: ${owned}. Наденьте предмет для активации.`
              : remembered
                ? "Найден в прежней эпохе. Для применения требуется подходящий предмет."
                : "Ищите на легендарных и мифических предметах.";
          return (
            <SkillCard
              key={skill.id}
              skill={skill}
              status={status}
              available={Boolean(source)}
              active={activeIds.has(skill.id)}
              source={sourceText}
              onToggle={() => toggleSkill(skill.id)}
            />
          );
        })}
      </div>
      <Pagination {...gearShown} onChange={setGearPage} />
    </section>
  );
}
