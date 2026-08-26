import { BattleSession } from "../src/gameplay/AdvancedBattle";
import type { CombatantSnapshot } from "../src/gameplay/WorldTypes";
import { SeededRandom } from "../src/gameplay/RandomSource";

const snapshot = (id: string, speed: number): CombatantSnapshot => ({
  id,
  name: id === "hero" ? "Герой" : "Соперник",
  classId: "Knight",
  level: 8,
  maxHealth: 380,
  health: 380,
  attack: 38,
  defense: 20,
  speed,
  crit: 5,
  equipmentScore: 80,
  skills: ["shield-bash"],
  tacticalStyle: "balanced",
  setCounts: {},
});

describe("interactive BattleSession from report snapshots", () => {
  it("uses the selected action and exposes live resources and statuses", () => {
    const session = new BattleSession(
      snapshot("hero", 70),
      snapshot("enemy", 5),
      { randomSource: new SeededRandom("interactive-ui") },
    );

    expect(session.currentActorId).toBe("hero");
    const action = session.availableActions().find((candidate) => candidate.id === "shield-bash");
    expect(action?.available).toBe(true);
    const turn = session.step({ type: "skill", skillId: "shield-bash" });
    expect(turn.skillId).toBe("shield-bash");
    expect(session.fighterState("enemy").statuses.some((status) => status.id === "staggered")).toBe(true);
    expect(session.fighterState("hero").resource.name).toBe("Стойкость");
  });
});
