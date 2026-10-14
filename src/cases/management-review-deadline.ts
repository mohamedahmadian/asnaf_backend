/** مهلت پاسخ کارتابل تایید مدیریتی، هم‌تراز پیش‌فرض اداره اماکن. */
export const MANAGEMENT_RESPONSE_DAYS = 5;

const DAY_MS = 86_400_000;

export function managementResponseCutoff(now = Date.now()) {
  return now - MANAGEMENT_RESPONSE_DAYS * DAY_MS;
}
