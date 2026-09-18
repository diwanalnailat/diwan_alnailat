import test from "node:test";
import assert from "node:assert/strict";
import { whatsapp, integrationStatus } from "../lib/integrations.js";
import { GET, POST } from "../app/api/[...path]/route.js";

const env = {
  WHATSAPP_PROVIDER: "green_api", WHATSAPP_ENABLED: "true",
  GREEN_API_URL: "https://7107.api.greenapi.com", GREEN_API_INSTANCE: "1234567890",
  GREEN_API_TOKEN: "test-credential-not-a-real-token", OTP_SECRET: "x".repeat(32),
  APP_BASE_URL: "https://diwan.test",
};
test("Green OTP uses provider chat format without requiring Meta templates", async () => {
  assert.equal(integrationStatus(env).phone,true);
  assert.equal(integrationStatus(env).whatsapp,true);
  const id = await whatsapp({...env, PROVIDER_FETCH: async (url, options) => {
    assert.equal(new URL(url).hostname,"7107.api.greenapi.com");
    assert.equal(options.redirect,"error");
    const body=JSON.parse(options.body);
    assert.equal(body.chatId,"966500000000@c.us");
    assert.ok(body.message.includes("123456"));
    assert.equal(body.linkPreview,false);
    return Response.json({idMessage:"accepted-id"});
  }},"+966500000000",undefined,["123456"],true);
  assert.equal(id,"accepted-id");
});
test("Green ambiguous failures do not expose credentials or trigger duplicate retries", async () => {
  await assert.rejects(whatsapp({...env,PROVIDER_FETCH: async () => {throw Error(env.GREEN_API_TOKEN);}},"+966500000000",undefined,["123456"],true),error=>{
    assert.equal(error.status,502);assert.ok(!error.message.includes(env.GREEN_API_TOKEN));assert.ok(!error.retryable);return true;
  });
});
test("Public production API remains closed even with forged Sites identity", async () => {
  for(const method of [GET,POST]){
    const result=await method(new Request("https://diwan.test/api/state",{headers:{"oai-authenticated-user-id":"local-developer"}}));
    assert.equal(result.status,403);
    assert.equal(result.headers.get("cache-control"),"no-store");
  }
});
