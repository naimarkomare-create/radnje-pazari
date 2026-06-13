#!/usr/bin/env node

const {
  callReadOnlyMethod,
  createSoapClient,
  findMethodName,
  helperWsdlUrl,
  loadLocalEnv,
  writeJson
} = require("./biznisoft-common");

const ITEM_TYPES = ["itArticle", "itBarcodespec"];
const METHODS = ["GetJSONFieldsDescription", "GetJSONGetItemRequest", "GetJSONGetItemsRequest"];

function payloadCandidates(itemType) {
  return [
    { ItemType: itemType },
    { itemType },
    { AItemType: itemType },
    { ItemTypeName: itemType },
    { TypeName: itemType }
  ];
}

async function main() {
  loadLocalEnv();

  const client = await createSoapClient(helperWsdlUrl());

  for (const itemType of ITEM_TYPES) {
    const output = {
      itemType,
      results: {}
    };

    for (const preferredMethod of METHODS) {
      const methodName = findMethodName(client, preferredMethod);

      if (!methodName) {
        output.results[preferredMethod] = { ok: false, message: "Method not found" };
        continue;
      }

      output.results[methodName] = await callReadOnlyMethod(client, methodName, payloadCandidates(itemType));
    }

    const filename = itemType === "itArticle" ? "itArticle-fields.json" : "itBarcodespec-fields.json";
    const outputPath = writeJson(filename, output);
    console.log(`Saved ${itemType} fields to ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
