export const CANTON_ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function normalizeCantonAccountKey(account: string | undefined): string {
  return account || "canton-session";
}

export function stableHexHash(input: string): `0x${string}` {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f, 0x165667b1, 0xd3a2646c, 0xfd7046c5];

  const hex = seeds
    .map((seed) => {
      let hash = seed;

      for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
      }

      return (hash >>> 0).toString(16).padStart(8, "0");
    })
    .join("");

  return `0x${hex}`;
}
