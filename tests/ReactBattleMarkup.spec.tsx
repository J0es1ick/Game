import { renderToStaticMarkup } from "react-dom/server";
import { WorldGame } from "../src/gameplay/WorldGame";
import {
  BattleSkillList,
  CombatantCard,
  FeatureChanges,
  TournamentBracket,
} from "../src/web/react/battle/BattleParts";

describe("React battle presentation", () => {
  test("shows real resources and health with accessible limits", () => {
    const game = WorldGame.create("<Герой>", "Swordsman", 93108);
    const pending = game.beginDuel();
    const markup = renderToStaticMarkup(
      <CombatantCard side="hero" fighter={pending.session.hero} />,
    );
    expect(markup).toContain("&lt;Герой&gt;");
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain(
      `aria-valuemax="${pending.session.hero.maxHealth}"`,
    );
    expect(markup).toContain(pending.session.hero.resource.name);
    expect(markup).toContain("Состояния: нет");
  });

  test("disables manual skills while waiting for the opponent", () => {
    const game = WorldGame.create("Ход соперника", "Knight", 93109);
    const pending = game.beginDuel();
    const markup = renderToStaticMarkup(
      <BattleSkillList
        side="hero"
        fighter={pending.session.hero}
        actions={[]}
        active={false}
        onUse={() => undefined}
      />,
    );
    expect(markup).toContain("Обычная атака");
    expect(markup.match(/disabled=""/g)?.length).toBe(
      pending.session.hero.skills.length + 1,
    );
  });

  test("marks the currently used skill without replacing the skill panel", () => {
    const game = WorldGame.create("Навык", "Knight", 93110);
    const pending = game.beginDuel();
    const stepped = game.stepPendingBattle({ type: "basic" });
    const side = stepped.turn.actorId === "hero" ? "hero" : "enemy";
    const fighter =
      side === "hero" ? pending.session.hero : pending.session.enemy;
    const markup = renderToStaticMarkup(
      <BattleSkillList
        side={side}
        fighter={fighter}
        actions={[]}
        active={false}
        turn={stepped.turn}
      />,
    );
    expect(markup).toContain("basic used");
    expect(markup).toContain('data-skill-id="basic"');
  });

  test("does not render an empty tournament panel for a duel", () => {
    expect(
      renderToStaticMarkup(<TournamentBracket nameForId={() => "Участник"} />),
    ).toBe("");
  });

  test("explains feature effects and uses positive and negative stat colors", () => {
    const markup = renderToStaticMarkup(
      <FeatureChanges
        changes={[
          {
            fighterId: "hero",
            fighterName: "Герой",
            kind: "Травма",
            name: "Повреждение",
            description: "Защита уменьшена до восстановления.",
            stats: { defense: -3, health: 2 },
          },
        ]}
      />,
    );
    expect(markup).toContain("Защита уменьшена до восстановления.");
    expect(markup).toContain('class="negative">-3 DEF');
    expect(markup).toContain('class="positive">+2 HP');
  });
});
