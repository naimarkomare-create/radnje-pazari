const fs = require("fs");
const path = require("path");
const soap = require("soap");

const OUTPUT_DIR = path.join(process.cwd(), "biznisoft-output");
const BLOCKED_METHODS = new Set(["AddItem", "AddItems", "UpdateItem", "DeleteItem", "Execute", "Upload", "ClearArticleImage"]);

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");

  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getBaseUrl() {
  return (process.env.BIZNISOFT_SOAP_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
}

function helperWsdlUrl() {
  return `${getBaseUrl()}/wsdl/IBSServiceHelper`;
}

function webServiceWsdlUrl() {
  return `${getBaseUrl()}/wsdl/IBSWebService`;
}

function safeUrl(value) {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function createSoapClient(wsdlUrl) {
  const username = process.env.BIZNISOFT_TUNNEL_USERNAME || "";
  const password = process.env.BIZNISOFT_TUNNEL_PASSWORD || "";
  if (!username && !password) return soap.createClientAsync(wsdlUrl);
  if (!username || !password || username.includes(":")) {
    throw new Error("Configure both BIZNISOFT_TUNNEL_USERNAME and BIZNISOFT_TUNNEL_PASSWORD; username cannot contain a colon.");
  }
  const target = new URL(wsdlUrl);
  if (target.protocol !== "https:" || target.username || target.password) {
    throw new Error("BizniSoft tunnel discovery requires HTTPS without embedded credentials.");
  }
  // Protect both WSDL retrieval and subsequent SOAP calls. Do not follow a WSDL's
  // advertised LAN address when the script was explicitly configured for a tunnel.
  let client;
  try {
    client = await soap.createClientAsync(wsdlUrl, {
      wsdl_headers: { Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}` },
      wsdl_options: { maxRedirects: 0, timeout: 20_000 }
    });
  } catch {
    // node-soap errors may include request headers and response bodies.
    throw new Error("BizniSoft tunnel WSDL request failed. Check connectivity and tunnel authentication.");
  }
  const locations = Object.values(client.wsdl.definitions.services)
    .flatMap((service) => Object.values(service.ports).map((port) => port.location));
  const paths = [...new Set(locations.map((location) => {
    const url = new URL(location);
    return url.pathname + url.search;
  }))];
  if (paths.length !== 1) throw new Error("Tunnel WSDL has ambiguous SOAP endpoints; configure the endpoint explicitly before discovery.");
  const endpoint = new URL(paths[0], target.origin);
  if (endpoint.origin !== target.origin) throw new Error("Tunnel WSDL endpoint must stay on the configured origin.");
  client.setEndpoint(endpoint.toString());
  client.setSecurity(new soap.BasicAuthSecurity(username, password, { maxRedirects: 0, timeout: 20_000 }));
  return client;
}

function flattenMethods(description) {
  const methods = new Set();

  function walk(node) {
    if (!node || typeof node !== "object") return;

    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === "object" && ("input" in value || "output" in value)) {
        methods.add(key);
      } else {
        walk(value);
      }
    }
  }

  walk(description);
  return Array.from(methods).sort();
}

function getAvailableMethods(client) {
  return flattenMethods(client.describe());
}

function findMethodName(client, preferredName) {
  const methods = getAvailableMethods(client);
  return methods.find((method) => method.toLowerCase() === preferredName.toLowerCase()) || null;
}

async function callReadOnlyMethod(client, methodName, payloadCandidates = [{}]) {
  if (BLOCKED_METHODS.has(methodName)) {
    throw new Error(`Blocked unsafe method: ${methodName}`);
  }

  const asyncMethodName = `${methodName}Async`;

  if (typeof client[asyncMethodName] !== "function") {
    throw new Error(`Method not found: ${methodName}`);
  }

  const errors = [];
  const isLogin = methodName.toLowerCase() === "getsessionhandle";

  for (const payload of payloadCandidates) {
    try {
      const response = payload === null ? await client[asyncMethodName]() : await client[asyncMethodName](payload);
      return {
        ok: true,
        payload: isLogin ? "[redacted]" : payload,
        result: isLogin ? "[redacted]" : Array.isArray(response) ? response[0] : response
      };
    } catch {
      errors.push({
        payload: isLogin ? "[redacted]" : payload,
        // SOAP client errors may contain complete request bodies and authorization headers.
        message: `${methodName} request failed.`
      });
    }
  }

  return { ok: false, errors };
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function writeJson(filename, data) {
  ensureOutputDir();
  const outputPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf8");
  return outputPath;
}

function collectStrings(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return output;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, output);
  }

  return output;
}

function safeFilePart(value) {
  return value.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "item-type";
}

module.exports = {
  callReadOnlyMethod,
  collectStrings,
  createSoapClient,
  findMethodName,
  getAvailableMethods,
  helperWsdlUrl,
  loadLocalEnv,
  safeFilePart,
  safeUrl,
  webServiceWsdlUrl,
  writeJson
};
