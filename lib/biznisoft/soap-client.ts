import "server-only";

import { DOMParser } from "@xmldom/xmldom";

const SOAP_NAMESPACE = "urn:BSWebSericeIntf-IBSWebService";
const SOAP_ENVELOPE_NAMESPACE = "http://schemas.xmlsoap.org/soap/envelope/";
const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";
const WSDL_NAMESPACE = "http://schemas.xmlsoap.org/wsdl/";
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
type InvalidResponseReason =
  | "html_response"
  | "wsdl_response"
  | "malformed_xml"
  | "not_soap_envelope"
  | "unexpected_soap_body"
  | "missing_return"
  | "invalid_return"
  | "invalid_session_handle";
type SoapFailureDiagnostic = {
  method: SoapMethod;
  kind: TransportFailure | "http" | "soap_fault" | "invalid_response";
  durationMs: number;
  transportCode?: string;
  httpStatus?: number;
  responseReason?: InvalidResponseReason;
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
  return callSoapMethod({
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
  if (!isSessionHandle(sessionHandle)) {
    throw new Error("BizniSoft login returned invalid session handle.");
  }
}

function isSessionHandle(value: string) {
  return value.length > 10 && /^\{[^{}\s<>]+\}$/.test(value);
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
        SOAPAction: `"${SOAP_NAMESPACE}#${method}"`,
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

  const diagnostic = { method, durationMs: Date.now() - startedAt, httpStatus: response.status };
  if (response.status === 401 || response.status === 403) {
    throw new BizniSoftSoapError(`BizniSoft SOAP ${method} failed with HTTP ${response.status}`, { ...diagnostic, kind: "http" });
  }
  const parsed = parseSoapResponse(text, method);

  if (parsed.kind === "soap_fault") {
    const secrets = params
      .filter((param) => /username|password|sessionhandle|bsliveid/i.test(param.name))
      .map((param) => param.value);
    throw new BizniSoftSoapError(
      redactSoapFault(parsed.message, secrets),
      { ...diagnostic, kind: "soap_fault" }
    );
  }

  if (!response.ok) {
    throw new BizniSoftSoapError(`BizniSoft SOAP ${method} failed with HTTP ${response.status}`, { ...diagnostic, kind: "http" });
  }

  if (parsed.kind === "invalid_response") {
    throw new BizniSoftSoapError(`BizniSoft SOAP ${method} returned an invalid response.`, {
      ...diagnostic, kind: "invalid_response", responseReason: parsed.reason
    });
  }

  return parsed.value;
}

function buildSoapEnvelope(method: SoapMethod, params: Array<{ name: string; type: string; value: string }>) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:xsi="${XSI_NAMESPACE}" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="${SOAP_ENVELOPE_NAMESPACE}" xmlns:urn="${SOAP_NAMESPACE}">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:${method} soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
${params.map((param) => `      <${param.name} xsi:type="${param.type}">${escapeXml(param.value)}</${param.name}>`).join("\n")}
    </urn:${method}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function childElements(node: Node): Element[] {
  return Array.from(node.childNodes).filter((child): child is Element => child.nodeType === 1);
}

function invalidResponse(reason: InvalidResponseReason) {
  return { kind: "invalid_response" as const, reason };
}

function parseSoapResponse(xml: string, method: SoapMethod) {
  if (/^\s*<(?:!doctype\s+)?html\b/i.test(xml)) return invalidResponse("html_response");

  let document: Document;
  let hasParseError = false;
  const markParseError = () => { hasParseError = true; };
  try {
    // The parser's default error handler can print snippets of the upstream XML.
    document = new DOMParser({
      errorHandler: { warning: markParseError, error: markParseError, fatalError: markParseError }
    }).parseFromString(xml, "text/xml");
  } catch {
    return invalidResponse("malformed_xml");
  }

  const envelope = document.documentElement;
  if (hasParseError || document.doctype || !envelope || childElements(document).length !== 1 ||
      Array.from(document.childNodes).some((node) => node.nodeType === 3 && node.textContent?.trim())) {
    return invalidResponse("malformed_xml");
  }
  if (envelope.localName.toLowerCase() === "html") return invalidResponse("html_response");
  if (envelope.localName === "definitions" && envelope.namespaceURI === WSDL_NAMESPACE) {
    return invalidResponse("wsdl_response");
  }
  if (envelope.localName !== "Envelope" || envelope.namespaceURI !== SOAP_ENVELOPE_NAMESPACE) {
    return invalidResponse("not_soap_envelope");
  }

  const bodies = childElements(envelope).filter(
    (child) => child.localName === "Body" && child.namespaceURI === SOAP_ENVELOPE_NAMESPACE
  );
  const payloads = bodies.length === 1 ? childElements(bodies[0]) : [];
  if (payloads.length !== 1) return invalidResponse("unexpected_soap_body");
  const [payload] = payloads;
  if (payload.localName === "Fault" && payload.namespaceURI === SOAP_ENVELOPE_NAMESPACE) {
    const fault = childElements(payload).find((child) => child.localName === "faultstring");
    const message = fault && childElements(fault).length === 0 ? fault.textContent?.trim() : null;
    return { kind: "soap_fault" as const, message: message || "BizniSoft SOAP returned a fault." };
  }
  if (payload.localName !== method + "Response" || payload.namespaceURI !== SOAP_NAMESPACE) {
    return invalidResponse("unexpected_soap_body");
  }

  const returns = childElements(payload).filter((child) => child.localName === "return");
  if (returns.length === 0) return invalidResponse("missing_return");
  const [value] = returns;
  const nil = value.getAttributeNS(XSI_NAMESPACE, "nil");
  if (returns.length !== 1 || nil === "true" || nil === "1" || value.hasAttribute("href") || childElements(value).length > 0) {
    return invalidResponse("invalid_return");
  }
  const result = value.textContent?.trim() ?? "";
  if (method === "GetSessionHandle" && !isSessionHandle(result)) return invalidResponse("invalid_session_handle");
  return { kind: "success" as const, value: result };
}

function redactSoapFault(message: string, secrets: string[]) {
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
