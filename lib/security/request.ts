// SameSite cookies help, but an explicit origin check also blocks sibling-site requests.
export function isSameOriginRequest(headers: Headers) {
  const site = headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  const origin = headers.get("origin");
  if (!origin) return site !== "same-site";
  try {
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && url.host === headers.get("host");
  } catch {
    return false;
  }
}
