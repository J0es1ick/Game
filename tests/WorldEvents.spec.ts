import { eventReferencesFighter, formatStructuredWorldEvent } from "../src/gameplay/world/WorldEvents";

describe("structured world events", () => {
  test("finds fighters by stable id rather than by text", () => {
    const payload = { kind: "battle" as const, actorId: "a", actorName: "Отис", targetId: "b", targetName: "Бран", outcome: "won" as const };
    expect(eventReferencesFighter(payload, "b")).toBe(true);
    expect(eventReferencesFighter(payload, "Отис")).toBe(false);
  });

  test("keeps Russian presentation outside the stored payload", () => {
    expect(formatStructuredWorldEvent({ kind: "loot", fighterId: "hero", fighterName: "Даун", itemId: "sword", itemName: "Клинок" }))
      .toBe("Даун получил предмет «Клинок».");
  });
});
