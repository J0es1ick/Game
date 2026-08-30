import {
  expeditionBattleExertion,
  expeditionStaminaAfterBattle,
  normalizeExpeditionStamina,
} from "../src/gameplay/dungeons/ExpeditionStamina";

describe("expedition stamina", () => {
  test("normalizes legacy and damaged values without inverting valid stamina", () => {
    expect(normalizeExpeditionStamina(undefined)).toBe(100);
    expect(normalizeExpeditionStamina("damaged")).toBe(100);
    expect(normalizeExpeditionStamina(140)).toBe(100);
    expect(normalizeExpeditionStamina(-20)).toBe(0);
    expect(normalizeExpeditionStamina(37)).toBe(37);
  });

  test("accumulates damage and exertion instead of replacing the previous reserve", () => {
    const afterFirst = expeditionStaminaAfterBattle(80, 200, 150, expeditionBattleExertion("battle"));
    const afterSecond = expeditionStaminaAfterBattle(afterFirst, 200, 200, expeditionBattleExertion("battle"));

    expect(afterFirst).toBe(53);
    expect(afterSecond).toBe(51);
  });
});
