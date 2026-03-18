export function extractMajor(version) {
  if (!version) {
    return null;
  }

  const match = String(version).match(/(\d+)/);
  return match ? Number(match[1]) : null;
}
