// A short lookup code for "which gym" — distinct from curriculum/shareCode.ts
// (which encodes a curriculum's full CONTENT into a code). This code never
// carries data; it is only a unique key looked up against gyms.join_code in
// Supabase. Excludes visually-confusable characters (0/O, 1/I/L) since
// students type this on a phone.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

export function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

/** Normalizes user-typed input (trims, uppercases) before a lookup query. */
export function normalizeJoinCode(input: string): string {
  return input.trim().toUpperCase();
}
