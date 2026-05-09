export const NEW_PROJECT_ID = "new-project";

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isLocalProjectId(value: string): boolean {
  return /^local-[a-z0-9-]{8,80}$/i.test(value);
}

export function isRoutableProjectId(value: string): boolean {
  return value === NEW_PROJECT_ID || isUuid(value) || isLocalProjectId(value);
}
