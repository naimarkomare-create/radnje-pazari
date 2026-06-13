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

async function createSoapClient(wsdlUrl) {
  return soap.createClientAsync(wsdlUrl);
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

  for (const payload of payloadCandidates) {
    try {
      const response = payload === null ? await client[asyncMethodName]() : await client[asyncMethodName](payload);
      return {
        ok: true,
        payload,
        result: Array.isArray(response) ? response[0] : response
      };
    } catch (error) {
      errors.push({
        payload,
        message: error instanceof Error ? error.message : String(error)
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
  webServiceWsdlUrl,
  writeJson
};
