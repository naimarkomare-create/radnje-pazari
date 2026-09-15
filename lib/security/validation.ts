export class InputError extends Error {}

export function dataErrorMessage(error: unknown) {
  return error ? publicErrorMessage(error) : undefined;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const value: unknown = await request.json().catch(() => null);
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function actionError(error: unknown, fallback: string) {
  return error instanceof InputError ? error.message : fallback;
}

export function publicErrorMessage(_error: unknown) {
  return "Zahtev nije moguće izvršiti. Pokušajte ponovo.";
}
