export const DEFAULT_COMFY_STARTUP_FLAGS =
  '--listen 127.0.0.1 --port 8188 --highvram --preview-method none';

export type ComfyVramFlagMode = 'highvram' | 'normalvram' | 'lowvram' | 'auto';

const VRAM_FLAGS = ['--highvram', '--normalvram', '--lowvram', '--novram', '--gpu-only'] as const;

const MODE_TO_FLAG: Record<Exclude<ComfyVramFlagMode, 'auto'>, string> = {
  highvram: '--highvram',
  normalvram: '--normalvram',
  lowvram: '--lowvram',
};

function tokenizeFlags(flags: string): string[] {
  return flags
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function normalizeComfyFlags(flags: string): string {
  const tokens = tokenizeFlags(flags);
  const seenSingle = new Set<string>();
  const result: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const next = tokens[i + 1];
    // Preserve flag-value pairs like --listen 127.0.0.1 or --port 8188 or --preview-method none
    if (token.startsWith('--') && next && !next.startsWith('--')) {
      result.push(token, next);
      i += 1;
      continue;
    }
    if (token.startsWith('--')) {
      if (seenSingle.has(token)) continue;
      seenSingle.add(token);
    }
    result.push(token);
  }

  return result.join(' ');
}

export function hasComfyFlag(flags: string, flag: string): boolean {
  const targetTokens = tokenizeFlags(flag);
  if (targetTokens.length === 0) return false;
  const tokens = tokenizeFlags(flags);

  if (targetTokens.length === 1) {
    return tokens.includes(targetTokens[0]);
  }

  for (let i = 0; i <= tokens.length - targetTokens.length; i += 1) {
    let matches = true;
    for (let j = 0; j < targetTokens.length; j += 1) {
      if (tokens[i + j] !== targetTokens[j]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

export function toggleComfyFlag(
  flags: string,
  flag: string,
  forceEnabled?: boolean
): string {
  const targetTokens = tokenizeFlags(flag);
  if (targetTokens.length === 0) return normalizeComfyFlags(flags);

  const tokens = tokenizeFlags(flags);
  const currentlyPresent = hasComfyFlag(flags, flag);
  const shouldEnable = forceEnabled ?? !currentlyPresent;

  if (shouldEnable) {
    if (currentlyPresent) return normalizeComfyFlags(flags);
    return normalizeComfyFlags([...tokens, ...targetTokens].join(' '));
  }

  // Remove all occurrences of single or 2-token flag
  const filtered: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (targetTokens.length === 1 && tokens[i] === targetTokens[0]) {
      continue;
    }
    if (
      targetTokens.length === 2 &&
      tokens[i] === targetTokens[0] &&
      tokens[i + 1] === targetTokens[1]
    ) {
      i += 1;
      continue;
    }
    filtered.push(tokens[i]);
  }
  return normalizeComfyFlags(filtered.join(' '));
}

export function getComfyVramMode(flags: string): ComfyVramFlagMode {
  const tokens = tokenizeFlags(flags);
  if (tokens.includes('--highvram')) return 'highvram';
  if (tokens.includes('--normalvram')) return 'normalvram';
  if (tokens.includes('--lowvram')) return 'lowvram';
  return 'auto';
}

export function setComfyVramMode(flags: string, mode: ComfyVramFlagMode): string {
  const tokens = tokenizeFlags(flags).filter(
    (token) => !(VRAM_FLAGS as readonly string[]).includes(token)
  );
  if (mode !== 'auto') {
    tokens.push(MODE_TO_FLAG[mode]);
  }
  return normalizeComfyFlags(tokens.join(' '));
}
