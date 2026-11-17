import "server-only";

const SOAP_NAMESPACE = "urn:BSWebSericeIntf-IBSWebService";
const SOAP_TIMEOUT_MS = 20_000;
let insecureTransportWarningLogged = false;

export type BizniSoftCredentials = {
  soapUrl: string;
  companyId: string;
  companyYear: string;
  username: string;
  password: string;
};

type SoapMethod = "GetSessionHandle" | "GetItems" | "GetItems2" | "GetItem";
type TransportFailure = "dns" | "connection_refused" | "connection_reset" | "unreachable" | "timeout" | "tls" | "network";
type SoapFailureDiagnostic = {
  method: SoapMethod;
  kind: TransportFailure | "http" | "soap_fault" | "invalid_response";
  durationMs: number;
  transportCode?: string;
  httpStatus?: number;
};

export class BizniSoftSoapError extends Error {
  constructor(message: string, public readonly diagnostic: SoapFailureDiagnostic) {
    super(message);
    this.name = "BizniSoftSoapError";
  }
}

const TRANSPORT_FAILURES = new Map<string, TransportFailure>([
  ["ENOTFOUND", "dns"],
  ["EAI_AGAIN", "dns"],
  ["ECONNREFUSED", "connection_refused"],
  ["ECONNRESET", "connection_reset"],
  ["UND_ERR_SOCKET", "connection_reset"],
  ["ENETUNREACH", "unreachable"],
  ["EHOSTUNREACH", "unreachable"],
  ["ETIMEDOUT", "timeout"],
  ["UND_ERR_CONNECT_TIMEOUT", "timeout"],
  ["UND_ERR_HEADERS_TIMEOUT", "timeout"],
  ["UND_ERR_BODY_TIMEOUT", "timeout"],
  ["ERR_TLS_CERT_ALTNAME_INVALID", "tls"],
  ["CERT_HAS_EXPIRED", "tls"],
  ["DEPTH_ZERO_SELF_SIGNED_CERT", "tls"],
  ["SELF_SIGNED_CERT_IN_CHAIN", "tls"],
  ["UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "tls"],
  ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "tls"],
  ["ERR_SSL_WRONG_VERSION_NUMBER", "tls"]
]);

function describeTransportFailure(error: unknown): { kind: TransportFailure; transportCode?: string } {
  const pending = [error];
  // Node fetch wraps socket errors in cause, sometimes with multiple address attempts.
  for (let i = 0; i < pending.length && i < 12; i++) {
    const candidate = pending[i];
    if (!candidate || typeof candidate !== "object") continue;
    const { code, cause, errors } = candidate as { code?: unknown; cause?: unknown; errors?: unknown };
    if (typeof code === "string") {
      const kind = TRANSPORT_FAILURES.get(code);
      if (kind) return { kind, transportCode: code };
    }
    if (cause) pending.push(cause);
    if (Array.isArray(errors)) pending.push(...errors.slice(0, 4));
  }
  return { kind: "network" };
}

export function getBizniSoftCredentials(): BizniSoftCredentials {
  const soapUrl = process.env.BIZNISOFT_SOAP_URL?.trim() ?? "";
  if (!soapUrl) {
    throw new Error("BIZNISOFT_SOAP_URL must not be empty.");
  }
  assertSoapUrl(soapUrl);
  warnOnceForInsecureProductionTransport(soapUrl);
  const companyId = process.env.BIZNISOFT_COMPANY_ID || "";
  const companyYear = process.env.BIZNISOFT_COMPANY_YEAR || "2026";
  const username = process.env.BIZNISOFT_USERNAME || "";
  const password = process.env.BIZNISOFT_PASSWORD ?? "";

  if (!isIntegerString(companyId)) {
    throw new Error("BIZNISOFT_COMPANY_ID must be a valid integer.");
  }

  if (!isIntegerString(companyYear)) {
    throw new Error("BIZNISOFT_COMPANY_YEAR must be a valid integer.");
  }

  if (!username) {
    throw new Error("BIZNISOFT_USERNAME must not be empty.");
  }

  return { soapUrl, companyId, companyYear, username, password };
}

function assertSoapUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("BIZNISOFT_SOAP_URL must be a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("BIZNISOFT_SOAP_URL must use HTTP or HTTPS.");
  }
}

function warnOnceForInsecureProductionTransport(soapUrl: string) {
  if (
    process.env.NODE_ENV === "production" &&
    soapUrl.toLowerCase().startsWith("http://") &&
    !insecureTransportWarningLogged
  ) {
    insecureTransportWarningLogged = true;
    console.warn(
      "BizniSoft SOAP uses unencrypted HTTP. Use only through a trusted LAN, VPN or protected tunnel."
    );
  }
}

export async function getSessionHandle(credentials = getBizniSoftCredentials()) {
  const sessionHandle = await callSoapMethod({
    method: "GetSessionHandle",
    params: [
      { name: "Language", type: "xsd:int", value: "0" },
      { name: "CompanyID", type: "xsd:int", value: credentials.companyId },
      { name: "CompanyYear", type: "xsd:int", value: credentials.companyYear },
      { name: "Username", type: "xsd:string", value: credentials.username },
      { name: "Password", type: "xsd:string", value: credentials.password },
      { name: "BSLiveID", type: "xsd:string", value: "" },
      { name: "BSLivePassword", type: "xsd:string", value: "" },
      { name: "compress", type: "xsd:boolean", value: "false" }
    ],
    soapUrl: credentials.soapUrl
  });
  if (!sessionHandle) {
    throw new Error("BizniSoft login returned empty session handle");
  }

  return sessionHandle;
}

export async function getItems({
  sessionHandle,
  itemType,
  jsonGetItemsRequest,
  limit = 1000,
  soapUrl
}: {
  sessionHandle: string;
  itemType: string;
  jsonGetItemsRequest: string;
  limit?: number;
  soapUrl: string;
}) {
  validateSessionHandle(sessionHandle);

  return callSoapMethod({
    method: "GetItems",
    params: [
      { name: "SessionHandle", type: "xsd:string", value: sessionHandle },
      { name: "sItemType", type: "xsd:string", value: itemType },
      { name: "JSONGetItemsRequest", type: "xsd:string", value: jsonGetItemsRequest },
      { name: "limit", type: "xsd:int", value: String(limit) }
    ],
    soapUrl
  });
}

export async function getItems2({
  sessionHandle,
  itemType,
  jsonGetItemsRequest,
  offset,
  rowcount,
  soapUrl
}: {
  sessionHandle: string;
  itemType: string;
  jsonGetItemsRequest: string;
  offset: number;
  rowcount: number;
  soapUrl: string;
}) {
  validateSessionHandle(sessionHandle);

  return callSoapMethod({
    method: "GetItems2",
    params: [
      { name: "SessionHandle", type: "xsd:string", value: sessionHandle },
      { name: "sItemType", type: "xsd:string", value: itemType },
      { name: "JSONGetItemsRequest", type: "xsd:string", value: jsonGetItemsRequest },
      { name: "offset", type: "xsd:int", value: String(offset) },
      { name: "rowcount", type: "xsd:int", value: String(rowcount) }
    ],
    soapUrl
  });
}

export async function getItem({
  sessionHandle,
  itemType,
  jsonGetItemRequest,
  soapUrl
}: {
  sessionHandle: string;
  itemType: string;
  jsonGetItemRequest: string;
  soapUrl: string;
}) {
  validateSessionHandle(sessionHandle);

  return callSoapMethod({
    method: "GetItem",
    params: [
      { name: "SessionHandle", type: "xsd:string", value: sessionHandle },
      { name: "sItemType", type: "xsd:string", value: itemType },
      { name: "JSONGetItemRequest", type: "xsd:string", value: jsonGetItemRequest }
    ],
    soapUrl
  });
}

function validateSessionHandle(sessionHandle: string) {
  if (!sessionHandle || sessionHandle.length <= 10 || !sessionHandle.startsWith("{") || !sessionHandle.endsWith("}")) {
    throw new Error("BizniSoft login returned invalid session handle.");
  }
}

function isIntegerString(value: string) {
  return /^\d+$/.test(value);
}

function tunnelAuthorization(soapUrl: string) {
  const username = process.env.BIZNISOFT_TUNNEL_USERNAME ?? "";
  const password = process.env.BIZNISOFT_TUNNEL_PASSWORD ?? "";
  if (!username && !password) return undefined;
  if (!username || !password || username.includes(":")) {
    throw new Error("BIZNISOFT_TUNNEL_USERNAME and BIZNISOFT_TUNNEL_PASSWORD must both be configured; username must not contain a colon.");
  }
  const url = new URL(soapUrl);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("BIZNISOFT_TUNNEL authentication requires HTTPS without credentials embedded in the URL.");
  }
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

async function callSoapMethod({
  method,
  params,
  soapUrl
}: {
  method: SoapMethod;
  params: Array<{ name: string; type: string; value: string }>;
  soapUrl: string;
}) {
  const authorization = tunnelAuthorization(soapUrl);
  const body = buildSoapEnvelope(method, params);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOAP_TIMEOUT_MS);
  let response: Response | undefined;
  let text: string;

  try {
    response = await fetch(soapUrl, {
      body,
      cache: "no-store",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `${SOAP_NAMESPACE}#${method}`,
        ...(authorization ? { Authorization: authorization } : {})
      },
      // Do not forward tunnel credentials or SOAP bodies through redirects.
      ...(authorization ? { redirect: "error" as const } : {}),
      method: "POST",
      signal: controller.signal
    });
    text = await response.text();
  } catch (error) {
    const aborted = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
    // Never retain the raw error or URL as part of the diagnostic.
    throw new BizniSoftSoapError(
      aborted
        ? `BizniSoft SOAP ${method} timed out after ${SOAP_TIMEOUT_MS / 1000} seconds.`
        : `BizniSoft SOAP ${method} request failed.`,
      {
        method,
        durationMs: Date.now() - startedAt,
        httpStatus: response?.status,
        ...(aborted ? { kind: "timeout" } : describeTransportFailure(error))
      }
    );
  } finally {
    clearTimeout(timeout);
  }

  const faultString = extractSoapFaultString(
    text,
    params.filter((param) => /username|password|sessionhandle|bsliveid/i.test(param.name)).map((param) => param.value)
  );

  const diagnostic = { method, durationMs: Date.now() - startedAt, httpStatus: response.status };

  if (!response.ok || faultString) {
    throw new BizniSoftSoapError(
      faultString ?? `BizniSoft SOAP ${method} failed with HTTP ${response.status}`,
      { ...diagnostic, kind: faultString !== null ? "soap_fault" : "http" }
    );
  }

  try {
    return extractSoapReturn(text);
  } catch {
    throw new BizniSoftSoapError("SOAP response did not contain <return>.", { ...diagnostic, kind: "invalid_response" });
  }
}

function buildSoapEnvelope(method: string, params: Array<{ name: string; type: string; value: string }>) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="${SOAP_NAMESPACE}">
  <soapenv:Body>
    <urn:${method} soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
${params.map((param) => `      <${param.name} xsi:type="${param.type}">${escapeXml(param.value)}</${param.name}>`).join("\n")}
    </urn:${method}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export function extractSoapReturn(xml: string) {
  const faultString = extractSoapFaultString(xml);

  if (faultString) {
    throw new Error(faultString);
  }

  const match = xml.match(/<(?:\w+:)?return\b[^>]*>([\s\S]*?)<\/(?:\w+:)?return>/i);

  if (!match) {
    throw new Error("SOAP response did not contain <return>.");
  }

  return decodeXml(match[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim());
}

function extractSoapFaultString(xml: string, secrets: string[] = []) {
  if (!/<(?:\w+:)?Fault\b/i.test(xml)) {
    return null;
  }

  const match = xml.match(/<(?:\w+:)?faultstring\b[^>]*>([\s\S]*?)<\/(?:\w+:)?faultstring>/i);
  if (!match) return "BizniSoft SOAP returned a fault.";

  let message = decodeXml(match[1].trim());
  // The upstream fault may echo login parameters or a session handle.
  const tunnelUsername = process.env.BIZNISOFT_TUNNEL_USERNAME;
  const tunnelPassword = process.env.BIZNISOFT_TUNNEL_PASSWORD;
  const sensitiveValues = [
    ...secrets, process.env.BIZNISOFT_USERNAME, process.env.BIZNISOFT_PASSWORD,
    tunnelUsername, tunnelPassword,
    ...(tunnelUsername && tunnelPassword ? [Buffer.from(`${tunnelUsername}:${tunnelPassword}`, "utf8").toString("base64")] : [])
  ]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.length - left.length);
  for (const value of sensitiveValues) {
    message = message.split(value).join("[redacted]");
  }

  return message
    .replace(/<(?:\w+:)?(?:Username|Password|SessionHandle|BSLiveID|BSLivePassword)\b[^>]*>[\s\S]*?<\/(?:\w+:)?(?:Username|Password|SessionHandle|BSLiveID|BSLivePassword)>/gi, "[redacted]")
    .replace(/\{?[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\}?/gi, "[redacted]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[redacted]")
    .replace(/\bBearer\s+[^\s<"']+/gi, "Bearer [redacted]")
    .replace(/\bBasic\s+[^\s<"']+/gi, "Basic [redacted]")
    .slice(0, 500);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
