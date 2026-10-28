// Non-secret preferences (never anything from the vault). Falls back to memory when storage is blocked.
const KEY = 'mynonrev.settings';
const DEFAULTS = { theme: 'system', autoLockMin: 5, installHintDismissed: false, biometric: false, biometricLabel: 'Face ID' };

let memory = null;

function read() {
  if (memory) return memory;
  let parsed = {};
  try { parsed = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') ?? {}; } catch { /* use defaults */ }
  memory = { ...DEFAULTS, ...(typeof parsed === 'object' ? parsed : {}) };
  return memory;
}

export const get = (name) => read()[name];

export function set(name, value) {
  const next = { ...read(), [name]: value };
  memory = next;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(next)); } catch { /* the in-memory copy still applies for this session */ }
}

export const AUTO_LOCK_CHOICES = [
  { value: 0, label: 'On leave' },
  { value: 1, label: '1 min' },
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
];
