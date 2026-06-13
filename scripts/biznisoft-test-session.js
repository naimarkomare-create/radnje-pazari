#!/usr/bin/env node

const {
  callReadOnlyMethod,
  createSoapClient,
  findMethodName,
  getAvailableMethods,
  loadLocalEnv,
  webServiceWsdlUrl,
  writeJson
} = require("./biznisoft-common");

function sessionPayloadCandidates(username, password) {
  return [
    { UserName: username, Password: password },
    { Username: username, Password: password },
    { username, password },
    { AUserName: username, APassword: password },
    { AUsername: username, APassword: password },
    { Login: username, Password: password },
    { login: username, password }
  ];
}

async function main() {
  loadLocalEnv();

  const wsdlUrl = webServiceWsdlUrl();
  console.log(`Connecting to ${wsdlUrl}`);
  const client = await createSoapClient(wsdlUrl);
  const methods = getAvailableMethods(client);
  const output = {
    wsdlUrl,
    methods,
    getBuild: null,
    getSessionHandle: null
  };

  console.log("\nAvailable SOAP methods:");
  for (const method of methods) console.log(`- ${method}`);

  const getBuildMethod = findMethodName(client, "GetBuild");
  if (getBuildMethod) {
    console.log(`\nCalling ${getBuildMethod}...`);
    output.getBuild = await callReadOnlyMethod(client, getBuildMethod, [{}, null]);
    console.log(output.getBuild.ok ? `${getBuildMethod}: ok` : `${getBuildMethod}: failed`);
  } else {
    console.log("\nGetBuild was not found.");
  }

  const username = process.env.BIZNISOFT_USERNAME || "";
  const password = process.env.BIZNISOFT_PASSWORD || "";
  const getSessionHandleMethod = findMethodName(client, "GetSessionHandle");

  if (!username || !password) {
    console.log("\nMissing BIZNISOFT_USERNAME or BIZNISOFT_PASSWORD");
    output.getSessionHandle = {
      ok: false,
      message: "Missing BIZNISOFT_USERNAME or BIZNISOFT_PASSWORD"
    };
  } else if (!getSessionHandleMethod) {
    console.log("\nGetSessionHandle was not found.");
    output.getSessionHandle = {
      ok: false,
      message: "GetSessionHandle was not found."
    };
  } else {
    console.log(`\nCalling ${getSessionHandleMethod} with credentials from environment...`);
    output.getSessionHandle = await callReadOnlyMethod(
      client,
      getSessionHandleMethod,
      sessionPayloadCandidates(username, password)
    );
    console.log(output.getSessionHandle.ok ? `${getSessionHandleMethod}: ok` : `${getSessionHandleMethod}: failed`);
  }

  const outputPath = writeJson("test-session.json", output);
  console.log(`\nSaved result to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
