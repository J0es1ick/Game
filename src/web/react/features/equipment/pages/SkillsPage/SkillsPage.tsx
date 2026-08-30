import { useMemo } from "react";
import {
  MAX_ACTIVE_SKILLS,
  unlockedSkills,
} from "../../../../../../gameplay/combat/AdvancedBattle";
import { selectActiveSkills } from "../../../../../../gameplay/combat/SkillLoadout";
import {
  EQUIPMENT_SKILLS,
  SKILLS,
} from "../../../../../../catalogs/WorldCatalog";
import type {
  SkillDefinition,
  TacticalStyle,
} from "../../../../../../gameplay/core/WorldTypes";
import { PageHeading } from "../../../../shared/ui/common";
import { useGame } from "../../../../app/state/GameContext";
import { pageSlice } from "../../utils/model";
import {
  Pagination,
  useEquipment,
} from "../../components/EquipmentShared/EquipmentShared";
import { useEquipmentSessionState } from "../../utils/sessionState";

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
  const [classPage, setClassPage] = useEquipmentSessionState(
    game,
    "skills.classPage",
    0,
  );
  const [gearPage, setGearPage] = useEquipmentSessionState(
    game,
    "skills.gearPage",
    0,
  );
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
    <section className="page active equipment-page" id="page-skills">
      <PageHeading eyebrow="ТАКТИКА И БИЛД" title="Книга навыков">
        <p>
          Выберите до четырёх активных приёмов или доверьте сборку герою.
          Реликтовые навыки доступны с подходящей экипировкой.
        </p>
      </PageHeading>
      <section className="skill-tactics paper-panel" id="skill-tactics">
        <header className="skill-build-overview">
          <p className="eyebrow">АКТИВНАЯ СБОРКА</p>
          <h2>
            {hero.autoSelectSkills
              ? "Лучшие навыки выбираются автоматически"
              : `${build.length} из ${MAX_ACTIVE_SKILLS} навыков выбрано`}
          </h2>
          <div className="active-skill-chips" aria-label="Активные навыки">
            {build.length ? (
              build.map((skill) => <span key={skill.id}>{skill.name}</span>)
            ) : (
              <span className="empty">Выберите доступные приёмы ниже</span>
            )}
          </div>
        </header>
        <div className="skill-decision-grid">
          <section className="skill-decision-card">
            <span className="tactic-label">Подбор навыков</span>
            <div className="tactic-mode-buttons">
              <button
                type="button"
                className={hero.autoSelectSkills ? "active" : ""}
                aria-pressed={hero.autoSelectSkills}
                onClick={() => act((world) => world.setAutoSelectSkills(true))}
              >
                Автоподбор
              </button>
              <button
                type="button"
                className={!hero.autoSelectSkills ? "active" : ""}
                aria-pressed={!hero.autoSelectSkills}
                onClick={() => act((world) => world.setAutoSelectSkills(false))}
              >
                Своя сборка
              </button>
            </div>
            <small>
              {hero.autoSelectSkills
                ? "Герой сам собирает сильнейшее сочетание."
                : "Вы сами выбираете до четырёх приёмов."}
            </small>
          </section>
          <section className="skill-decision-card">
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
                  {mode === "auto" ? "Автобой" : "Подтверждать"}
                </button>
              ))}
            </div>
            <small>
              {hero.combatMode === "auto"
                ? "Решения принимаются без остановки боя."
                : "Игра спросит подтверждение перед каждым ходом."}
            </small>
          </section>
          <label className="skill-decision-card tactical-profile-picker">
            <span
              className="tactic-label"
              data-term="tacticalStyle"
              tabIndex={0}
            >
              Стиль боя
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
        </div>
        <div
          className="tactical-rule-grid"
          aria-label="Правила выбранного стиля"
        >
          <div>
            <span>Лечение</span>
            <strong>ниже {Math.round(profile.healThreshold * 100)}% HP</strong>
          </div>
          <div>
            <span>Добивание</span>
            <strong>
              ниже {Math.round(profile.finisherThreshold * 100)}% HP врага
            </strong>
          </div>
          <div>
            <span>Сильные приёмы</span>
            <strong>
              {profile.preserveStrongSkills ? "беречь к моменту" : "сразу"}
            </strong>
          </div>
          <div>
            <span>Первый приоритет</span>
            <strong>
              {profile.breakGuardFirst
                ? "сломать защиту"
                : profile.prioritizeControl
                  ? "ослабить врага"
                  : "лучший ход"}
            </strong>
          </div>
        </div>
      </section>
      <header className="skill-section-heading">
        <div>
          <p className="eyebrow">КЛАССОВЫЕ ПРИЁМЫ</p>
          <h2>Изученные и будущие навыки</h2>
        </div>
      </header>
      <Pagination {...classShown} onChange={setClassPage} />
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
      <Pagination {...gearShown} onChange={setGearPage} />
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
