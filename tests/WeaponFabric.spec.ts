import { WeaponFabric } from "../src/fabrics/weaponsFabric/WeaponFabric";

describe("WeaponFabric", () => {
  const weaponFabric = new WeaponFabric();

  it("should create a sword with given name and damage", () => {
    const weapon = weaponFabric.createWeapon("sword", "Dragonsbane", 10);
    expect(weapon.name).toBe("Dragonsbane");
    expect(weapon.damage).toBe(10);
  });

  it("should create a stick with given name and damage", () => {
    const weapon = weaponFabric.createWeapon("stick", "Oak Staff", 5);
    expect(weapon.name).toBe("Oak Staff");
    expect(weapon.damage).toBe(5);
  });

  it("should create a bow with given name and damage", () => {
    const weapon = weaponFabric.createWeapon("bow", "Longbow", 8);
    expect(weapon.name).toBe("Longbow");
    expect(weapon.damage).toBe(8);
  });

  it("createWeapon creates a weapon with exactly the given name and damage", () => {
    const weapon = weaponFabric.createWeapon("unknown", "CustomName", 7);
    expect(weapon.name).toBe("CustomName");
    expect(weapon.damage).toBe(7);
  });

  it("createRandomWeapon falls back to fists for unknown type", () => {
    const weapon = weaponFabric.createRandomWeapon("invalidType");
    expect(weapon.name).toBe("fists");
    expect(weapon.damage).toBe(3);
  });

  it("should create a random sword", () => {
    const weapon = weaponFabric.createRandomWeapon("sword");
    expect(weapon.name).toBeDefined();
    expect(weapon.damage).toBeGreaterThanOrEqual(2);
    expect(weapon.damage).toBeLessThanOrEqual(5);
    expect(["Dragonsbane", "Stormbringer", "Aethelred"]).toContain(weapon.name);
  });

  it("should create a random stick", () => {
    const weapon = weaponFabric.createRandomWeapon("stick");
    expect(weapon.name).toBeDefined();
    expect(weapon.damage).toBeGreaterThanOrEqual(2);
    expect(weapon.damage).toBeLessThanOrEqual(5);
    expect(["Oak Staff", "Elderwood Branch", "Shepherd's Crook"]).toContain(
      weapon.name,
    );
  });

  it("should create a random bow", () => {
    const weapon = weaponFabric.createRandomWeapon("bow");
    expect(weapon.name).toBeDefined();
    expect(weapon.damage).toBeGreaterThanOrEqual(2);
    expect(weapon.damage).toBeLessThanOrEqual(5);
    expect(["Hunter's Bow", "Longbow", "Shortbow"]).toContain(weapon.name);
  });
});
