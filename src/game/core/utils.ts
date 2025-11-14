export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const mulberry32 = (seed: number) => {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const hashNoise = (x: number, y: number, seed: number) => {
  const s = Math.sin((x * 374761 + y * 668265 + seed * 69069) * 0.0001);
  return s - Math.floor(s);
};
