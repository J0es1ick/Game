import { useState } from "react";
import {
  PlayerFactory,
  type PlayerClass,
} from "../../../../../../factories/PlayerFactory";
import { createSkill } from "../../../../../../catalogs/SkillCatalog";
import { createRandomWeapon } from "../../../../../../catalogs/WeaponCatalog";
import type { Player } from "../../../../../../abstract/Player";

export const BASIC_CLASS_LABELS: Record<PlayerClass, string> = {
  Knight: "Рыцарь",
  Archer: "Лучник",
  Wizard: "Маг",
  Monk: "Монах",
  Gunsmith: "Оружейник",
  Swordsman: "Мечник",
};

const skillNames = [
  "огненные стрелы",
  "ледяные стрелы",
  "удар возмездия",
  "заворожение",
];

export function BasicPlayerForm({
  factory,
  disabled,
  onCreate,
}: {
  factory: PlayerFactory;
  disabled: boolean;
  onCreate: (player: Player) => void;
}) {
  const [name, setName] = useState("");
  const [className, setClass] = useState<PlayerClass>("Knight");
  const [health, setHealth] = useState(140);
  const [strength, setStrength] = useState(12);
  const [weapon, setWeapon] = useState("sword");
  const [selectedSkills, setSkills] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const create = () => {
    if (disabled) return;
    if (!Number.isInteger(health) || health < 125 || health > 150) {
      setMessage("HP должен быть целым числом от 125 до 150.");
      return;
    }
    if (!Number.isInteger(strength) || strength < 10 || strength > 15) {
      setMessage("Сила должна быть целым числом от 10 до 15.");
      return;
    }
    const skills = selectedSkills
      .map((value) => createSkill(value))
      .filter((skill): skill is NonNullable<typeof skill> => skill !== null);
    const player = factory.create({
      className,
      name,
      health,
      strength,
      weapon: createRandomWeapon(weapon),
      skills: skills.length ? skills : undefined,
    });
    onCreate(player);
    setMessage(`${player.name}: создан экземпляр ${player.constructor.name}.`);
  };

  return (
    <details className="basic-builder">
      <summary>
        Добавить участника вручную <b>+</b>
      </summary>
      <div>
        <label>
          Имя
          <input
            id="basic-name"
            value={name}
            maxLength={18}
            placeholder="автоматически"
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Класс
          <select
            id="basic-class"
            value={className}
            disabled={disabled}
            onChange={(event) => setClass(event.target.value as PlayerClass)}
          >
            {Object.entries(BASIC_CLASS_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          HP
          <input
            type="number"
            id="basic-health"
            value={health}
            min={125}
            max={150}
            disabled={disabled}
            onChange={(event) => setHealth(Number(event.target.value))}
          />
        </label>
        <label>
          Сила
          <input
            type="number"
            id="basic-strength"
            value={strength}
            min={10}
            max={15}
            disabled={disabled}
            onChange={(event) => setStrength(Number(event.target.value))}
          />
        </label>
        <label>
          Оружие
          <select
            id="basic-weapon"
            value={weapon}
            disabled={disabled}
            onChange={(event) => setWeapon(event.target.value)}
          >
            {[
              ["sword", "Меч"],
              ["bow", "Лук"],
              ["stick", "Посох"],
              ["fists", "Боевые бинты"],
              ["pistols", "Два пистолета"],
              ["dual-swords", "Два меча"],
            ].map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <fieldset id="basic-skills">
          <legend>Навыки · максимум 2</legend>
          {skillNames.map((skill) => (
            <label key={skill}>
              <input
                type="checkbox"
                value={skill}
                checked={selectedSkills.includes(skill)}
                disabled={
                  disabled ||
                  (!selectedSkills.includes(skill) &&
                    selectedSkills.length >= 2)
                }
                onChange={(event) =>
                  setSkills((previous) =>
                    event.target.checked
                      ? [...previous, skill]
                      : previous.filter((id) => id !== skill),
                  )
                }
              />
              {skill.charAt(0).toUpperCase() + skill.slice(1)}
            </label>
          ))}
        </fieldset>
        <button
          className="button"
          id="basic-add-manual"
          disabled={disabled}
          type="button"
          onClick={create}
        >
          Добавить участника
        </button>
        <p id="basic-form-message" role="status">
          {message}
        </p>
      </div>
    </details>
  );
}
