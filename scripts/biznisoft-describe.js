#!/usr/bin/env node

const {
  callReadOnlyMethod,
  createSoapClient,
  findMethodName,
  getAvailableMethods,
  helperWsdlUrl,
  loadLocalEnv,
  safeFilePart,
  writeJson
} = require("./biznisoft-common");

const DESCRIBE_METHODS = [
  "GetItemDescription",
  "GetItemTypeFunction",
  "GetJSONFieldsDescription",
  "GetJSONGetItemsRequest",
  "GetJSONGetItemsResponse"
];

function payloadCandidates(itemType) {
  return [
    { ItemType: itemType },
    { itemType },
    { AItemType: itemType },
    { ItemTypeName: itemType },
    { itemTypeName: itemType },
    { TypeName: itemType },
    { typeName: itemType }
  ];
}

async function main() {
  loadLocalEnv();

  const itemType = process.argv[2];
  if (!itemType) {
    console.error("Usage: node scripts/biznisoft-describe.js ItemTypeName");
    process.exit(1);
  }

  const wsdlUrl = helperWsdlUrl();
  console.log(`Connecting to ${wsdlUrl}`);
  const client = await createSoapClient(wsdlUrl);
  const methods = getAvailableMethods(client);
  const output = {
    wsdlUrl,
    itemType,
    methods,
    results: {}
  };

  console.log("\nAvailable SOAP methods:");
  for (const method of methods) console.log(`- ${method}`);

  for (const preferredMethod of DESCRIBE_METHODS) {
    const methodName = findMethodName(client, preferredMethod);

    if (!methodName) {
      output.results[preferredMethod] = { ok: false, message: "Method not found" };
      console.log(`\n${preferredMethod}: not found`);
      continue;
    }

    console.log(`\nCalling ${methodName}...`);
    output.results[methodName] = await callReadOnlyMethod(client, methodName, payloadCandidates(itemType));
    console.log(output.results[methodName].ok ? `${methodName}: ok` : `${methodName}: failed`);
  }

  const outputPath = writeJson(`${safeFilePart(itemType)}-description.json`, output);
  console.log(`\nSaved result to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
