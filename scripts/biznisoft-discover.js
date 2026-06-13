#!/usr/bin/env node

const {
  callReadOnlyMethod,
  collectStrings,
  createSoapClient,
  findMethodName,
  getAvailableMethods,
  helperWsdlUrl,
  loadLocalEnv,
  writeJson
} = require("./biznisoft-common");

const FILTER_WORDS = ["nivel", "cena", "cen", "art", "artik", "roba", "lager", "zali", "kalk", "mp", "objek", "magacin"];

async function main() {
  loadLocalEnv();

  const wsdlUrl = helperWsdlUrl();
  console.log(`Connecting to ${wsdlUrl}`);
  const client = await createSoapClient(wsdlUrl);
  const methods = getAvailableMethods(client);

  console.log("\nAvailable SOAP methods:");
  for (const method of methods) console.log(`- ${method}`);

  const getItemTypesMethod = findMethodName(client, "GetItemTypes");
  const output = {
    wsdlUrl,
    methods,
    getItemTypesMethod,
    raw: null,
    itemTypeStrings: [],
    filtered: []
  };

  if (!getItemTypesMethod) {
    console.log("\nGetItemTypes was not found on IBSServiceHelper.");
  } else {
    console.log(`\nCalling ${getItemTypesMethod}...`);
    const response = await callReadOnlyMethod(client, getItemTypesMethod, [{}, null]);
    output.raw = response;

    if (response.ok) {
      const strings = Array.from(new Set(collectStrings(response.result))).sort();
      output.itemTypeStrings = strings;
      output.filtered = strings.filter((value) => FILTER_WORDS.some((word) => value.toLowerCase().includes(word)));

      console.log("\nFiltered ItemTypes / strings:");
      if (output.filtered.length === 0) console.log("(no matches)");
      for (const itemType of output.filtered) console.log(`- ${itemType}`);
    } else {
      console.log("\nGetItemTypes call failed. See saved output for attempted payload errors.");
    }
  }

  const outputPath = writeJson("item-types.json", output);
  console.log(`\nSaved result to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
