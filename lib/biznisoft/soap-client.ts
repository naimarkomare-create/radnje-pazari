const SOAP_NAMESPACE = "urn:BSWebSericeIntf-IBSWebService";
const SOAP_TIMEOUT_MS = 20_000;

export type BizniSoftCredentials = {
  soapUrl: string;
  companyId: string;
  companyYear: string;
  username: string;
  password: string;
};

export function getBizniSoftCredentials(): BizniSoftCredentials {
  const soapUrl = process.env.BIZNISOFT_SOAP_URL || "http://79.175.71.83:58080/soap/IBSWebService";
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

export async function getSessionHandle(credentials = getBizniSoftCredentials()) {
  const xml = await callSoapMethod({
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
  const sessionHandle = extractSoapReturn(xml);

  if (!sessionHandle) {
    throw new Error("BizniSoft login returned empty session handle");
  }

  console.log("BizniSoft login returned session: yes");
  console.log(`Session length: ${sessionHandle.length}`);
  console.log(`Session has braces: ${sessionHandle.startsWith("{") && sessionHandle.endsWith("}")}`);

  return sessionHandle;
}

export async function getItems({
  sessionHandle,
  itemType,
  jsonGetItemsRequest,
  limit = 1000,
  soapUrl = process.env.BIZNISOFT_SOAP_URL || "http://79.175.71.83:58080/soap/IBSWebService"
}: {
  sessionHandle: string;
  itemType: string;
  jsonGetItemsRequest: string;
  limit?: number;
  soapUrl?: string;
}) {
  validateSessionHandle(sessionHandle);

  const xml = await callSoapMethod({
    method: "GetItems",
    params: [
      { name: "SessionHandle", type: "xsd:string", value: sessionHandle },
      { name: "sItemType", type: "xsd:string", value: itemType },
      { name: "JSONGetItemsRequest", type: "xsd:string", value: jsonGetItemsRequest },
      { name: "limit", type: "xsd:int", value: String(limit) }
    ],
    soapUrl
  });

  return extractSoapReturn(xml);
}

export async function getItems2({
  sessionHandle,
  itemType,
  jsonGetItemsRequest,
  offset,
  rowcount,
  soapUrl = process.env.BIZNISOFT_SOAP_URL || "http://79.175.71.83:58080/soap/IBSWebService"
}: {
  sessionHandle: string;
  itemType: string;
  jsonGetItemsRequest: string;
  offset: number;
  rowcount: number;
  soapUrl?: string;
}) {
  validateSessionHandle(sessionHandle);

  const xml = await callSoapMethod({
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

  return extractSoapReturn(xml);
}

export async function getItem({
  sessionHandle,
  itemType,
  jsonGetItemRequest,
  soapUrl = process.env.BIZNISOFT_SOAP_URL || "http://79.175.71.83:58080/soap/IBSWebService"
}: {
  sessionHandle: string;
  itemType: string;
  jsonGetItemRequest: string;
  soapUrl?: string;
}) {
  validateSessionHandle(sessionHandle);

  const xml = await callSoapMethod({
    method: "GetItem",
    params: [
      { name: "SessionHandle", type: "xsd:string", value: sessionHandle },
      { name: "sItemType", type: "xsd:string", value: itemType },
      { name: "JSONGetItemRequest", type: "xsd:string", value: jsonGetItemRequest }
    ],
    soapUrl
  });

  return extractSoapReturn(xml);
}

function validateSessionHandle(sessionHandle: string) {
  if (!sessionHandle || sessionHandle.length <= 10 || !sessionHandle.startsWith("{") || !sessionHandle.endsWith("}")) {
    console.log(`Session length: ${sessionHandle?.length ?? 0}`);
    console.log(`Session has braces: ${Boolean(sessionHandle?.startsWith("{") && sessionHandle?.endsWith("}"))}`);
    throw new Error("BizniSoft login returned invalid session handle.");
  }
}

function isIntegerString(value: string) {
  return /^\d+$/.test(value);
}

async function callSoapMethod({
  method,
  params,
  soapUrl
}: {
  method: string;
  params: Array<{ name: string; type: string; value: string }>;
  soapUrl: string;
}) {
  const body = buildSoapEnvelope(method, params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOAP_TIMEOUT_MS);
  let response: Response;
  let text: string;

  try {
    response = await fetch(soapUrl, {
      body,
      cache: "no-store",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `${SOAP_NAMESPACE}#${method}`
      },
      method: "POST",
      signal: controller.signal
    });
    text = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`BizniSoft SOAP ${method} timed out after ${SOAP_TIMEOUT_MS / 1000} seconds.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const faultString = extractSoapFaultString(text);

  if (!response.ok) {
    throw new Error(faultString ?? `BizniSoft SOAP ${method} failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  if (faultString) {
    throw new Error(faultString);
  }

  return text;
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
    throw new Error(`SOAP response did not contain <return>: ${xml.slice(0, 500)}`);
  }

  return decodeXml(match[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim());
}

function extractSoapFaultString(xml: string) {
  if (!/<(?:\w+:)?Fault\b/i.test(xml)) {
    return null;
  }

  const match = xml.match(/<(?:\w+:)?faultstring\b[^>]*>([\s\S]*?)<\/(?:\w+:)?faultstring>/i);
  return match ? decodeXml(match[1].trim()) : "BizniSoft SOAP returned a fault.";
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
