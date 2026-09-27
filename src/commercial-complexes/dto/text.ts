export function optionalText(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function requiredText(value: string) {
  return value.trim();
}
