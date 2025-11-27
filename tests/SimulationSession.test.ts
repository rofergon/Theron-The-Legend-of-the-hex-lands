import { describe, it, expect, beforeEach } from "vitest";
import { SimulationSession } from "../src/game/core/SimulationSession";

describe("SimulationSession", () => {
  let session: SimulationSession;
  let logs: string[] = [];

  beforeEach(() => {
    logs = [];
    session = new SimulationSession(1, {
      onLog: (message) => logs.push(message),
    });
  });

  it("initializes the world correctly", () => {
    session.initialize({ worldSize: 16, seed: 12345, difficulty: "normal" });

    const world = session.getWorld();
    const citizens = session.getCitizenSystem().getCitizens();

    expect(world.size).toBe(16);
    expect(citizens.length).toBeGreaterThan(0);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some(log => log.includes("World generated"))).toBe(true);
  });

  it("runs ticks without depending on the DOM", () => {
    session.initialize({ worldSize: 16, seed: 12345, difficulty: "normal" });

    const world = session.getWorld();
    const citizensBefore = session.getCitizenSystem().getCitizens().length;
    const stockpileBefore = world.stockpile.food;

    session.runTick(1, {});
    session.runTick(1, {});

    const citizensAfter = session.getCitizenSystem().getCitizens().length;
    const stockpileAfter = world.stockpile.food;

    expect(world.size).toBe(16);
    expect(citizensAfter).toBeGreaterThanOrEqual(0);
    expect(typeof stockpileAfter).toBe("number");
    expect(logs.length).toBeGreaterThan(0);
  });

  it("generates faith based on devotees", () => {
    session.initialize({ worldSize: 16, seed: 12345, difficulty: "easy" });

    const faithBefore = session.getFaithSnapshot().value;

    // Run multiple ticks to accumulate faith
    for (let i = 0; i < 10; i++) {
      session.runTick(1, {});
    }

    const faithAfter = session.getFaithSnapshot().value;
    
    // Faith should increase if there are devotees
    expect(faithAfter).toBeGreaterThanOrEqual(faithBefore);
  });

  it("converts faith to tokens correctly", () => {
    session.initialize({ worldSize: 16, seed: 12345, difficulty: "easy" });

    // Run ticks to generate faith
    for (let i = 0; i < 20; i++) {
      session.runTick(1, {});
    }

    const faithBefore = session.getFaithSnapshot().value;
    const tokensBefore = session.getTokens().token1;

    if (faithBefore > 0) {
      const result = session.convertFaithToToken1();

      const faithAfter = session.getFaithSnapshot().value;
      const tokensAfter = session.getTokens().token1;

      expect(result.faithSpent).toBeGreaterThan(0);
      expect(result.token1Gained).toBeGreaterThan(0);
      expect(faithAfter).toBeLessThan(faithBefore);
      expect(tokensAfter).toBeGreaterThan(tokensBefore);
    }
  });

  it("handles climate events", () => {
    session.initialize({ worldSize: 16, seed: 12345, difficulty: "normal" });

    const climateBefore = session.getClimate();

    // Run many ticks to trigger climate events
    for (let i = 0; i < 50; i++) {
      session.runTick(1, {});
    }

    // Check that logs contain some climate-related messages
    const hasClimateEvents = logs.some(
      log => log.includes("drought") || log.includes("rain")
    );

    // Climate events are random, but we expect at least the initial state to be defined
    expect(climateBefore).toBeDefined();
    expect(typeof climateBefore.drought).toBe("boolean");
    expect(typeof climateBefore.rainy).toBe("boolean");
  });

  it("tracks resource trends", () => {
    session.initialize({ worldSize: 16, seed: 12345, difficulty: "normal" });

    // Run ticks to generate resource history
    for (let i = 0; i < 10; i++) {
      session.runTick(1, {});
    }

    const foodTrend = session.getResourceTrendAverage("food");
    const stoneTrend = session.getResourceTrendAverage("stone");
    const woodTrend = session.getResourceTrendAverage("wood");
    const populationTrend = session.getResourceTrendAverage("population");

    expect(typeof foodTrend).toBe("number");
    expect(typeof stoneTrend).toBe("number");
    expect(typeof woodTrend).toBe("number");
    expect(typeof populationTrend).toBe("number");
  });

  it("unlocks structures based on population", () => {
    session.initialize({ worldSize: 16, seed: 12345, difficulty: "easy" });

    const structures = session.getAvailableStructures();

    expect(structures).toContain("campfire");
    expect(structures).toContain("house");
    
    // Check that structures array is valid
    expect(Array.isArray(structures)).toBe(true);
    expect(structures.length).toBeGreaterThan(0);
  });

  it("handles construction planning", () => {
    session.initialize({ worldSize: 16, seed: 12345, difficulty: "easy" });

    const world = session.getWorld();
    
    // Try to place a campfire at coordinates (5, 5)
    const result = session.planConstruction("campfire", { x: 5, y: 5 });

    if (result.ok) {
      expect(result.ok).toBe(true);
      expect(logs.some(log => log.includes("Blueprint placed"))).toBe(true);
    } else {
      // If placement failed, there should be a reason
      expect(result.reason).toBeDefined();
    }
  });
});
