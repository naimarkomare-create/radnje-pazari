const definitions = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", group: "public", kind: "https-url" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", group: "public", kind: "text" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", group: "server", kind: "text" },
  { name: "CRON_SECRET", group: "server", kind: "text" },
  { name: "CLEANUP_SECRET", group: "server", kind: "text" },
  { name: "BIZNISOFT_SOAP_URL", group: "biznisoft", kind: "http-url" },
  { name: "BIZNISOFT_COMPANY_ID", group: "biznisoft", kind: "integer" },
  { name: "BIZNISOFT_COMPANY_YEAR", group: "biznisoft", kind: "integer" },
  { name: "BIZNISOFT_USERNAME", group: "biznisoft", kind: "text" },
  { name: "BIZNISOFT_PASSWORD", group: "biznisoft", kind: "present" },
  { name: "AUTO_CREATE_PRICE_TASKS", group: "config", kind: "boolean" },
  { name: "BIZNISOFT_SOAP_BASE_URL", group: "optional", kind: "http-url", optional: true }
];

const live = process.argv.includes("--live");

if (!live) {
  console.log("CONFIGURATION CHECK: schema is valid.");
  for (const definition of definitions) {
    console.log(`${definition.optional ? "OPTIONAL" : "REQUIRED"} [${definition.group}] ${definition.name}`);
  }
  console.log("Run `npm run check:env -- --live` in the target environment to verify presence and format.");
  process.exit(0);
}

const errors = [];
const warnings = [];

for (const definition of definitions) {
  const present = Object.prototype.hasOwnProperty.call(process.env, definition.name);
  const value = process.env[definition.name] ?? "";

  if (!present) {
    if (!definition.optional) errors.push(`${definition.name}: missing`);
    continue;
  }

  if (definition.kind !== "present" && value.trim() === "") {
    if (!definition.optional) errors.push(`${definition.name}: empty`);
    continue;
  }

  if (definition.kind === "boolean" && !["true", "false"].includes(value)) {
    errors.push(`${definition.name}: must be true or false`);
  }

  if (definition.kind === "integer" && !/^\d+$/.test(value)) {
    errors.push(`${definition.name}: must be an integer`);
  }

  if (definition.kind === "https-url" || definition.kind === "http-url") {
    try {
      const url = new URL(value);
      const allowed = definition.kind === "https-url" ? ["https:"] : ["http:", "https:"];
      if (!allowed.includes(url.protocol)) errors.push(`${definition.name}: unsupported URL protocol`);
      if (definition.name === "BIZNISOFT_SOAP_URL" && url.protocol === "http:") {
        warnings.push(`${definition.name}: HTTP requires a trusted LAN, VPN or protected tunnel`);
      }
    } catch {
      errors.push(`${definition.name}: invalid URL`);
    }
  }
}

const forbiddenPublicNames = Object.keys(process.env).filter(
  (name) =>
    name.startsWith("NEXT_PUBLIC_") &&
    /(SECRET|PASSWORD|SERVICE_ROLE|PRIVATE|CRON|CLEANUP|BIZNISOFT)/i.test(name)
);
for (const name of forbiddenPublicNames) errors.push(`${name}: secret-like variable must not be public`);

for (const warning of warnings) console.warn(`WARNING ${warning}`);
if (errors.length > 0) {
  console.error("LIVE ENVIRONMENT CHECK: failed.");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("LIVE ENVIRONMENT CHECK: required variable names and formats are valid.");
