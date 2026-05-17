/** Configurable LAN file transfer caps (GB → bytes). */

export const FILE_LIMIT_GB_OPTIONS = [1, 10, 50, 100];

const GB = 1024 * 1024 * 1024;

export function normalizeFileLimitGb(value) {
  const n = Number(value);
  if (FILE_LIMIT_GB_OPTIONS.includes(n)) return n;
  return 10;
}

export function getMaxFileBytes(config) {
  return normalizeFileLimitGb(config?.maxFileTransferGb) * GB;
}

export function formatFileLimitLabel(gb, t) {
  return t('settings.file_limit_option').replace('{gb}', String(gb));
}
