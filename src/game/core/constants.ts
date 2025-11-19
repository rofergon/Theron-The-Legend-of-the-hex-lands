import type { PriorityMark } from "./types";

export const WORLD_SIZE = 64;
export const HOURS_PER_SECOND = 0.25;
export const TICK_HOURS = 0.25;

export const PRIORITY_KEYMAP: Record<string, PriorityMark> = {
  Digit1: "explore",
  Digit2: "defend",
  Digit3: "farm",
  Digit4: "mine",
  Digit0: "none",
};
