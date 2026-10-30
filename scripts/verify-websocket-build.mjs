/** Verify the production trace ships a usable native ws transport, including frame masking. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const route = new URL(
  "../.next/server/app/api/sessions/route.js",
  import.meta.url,
);
const trace = JSON.parse(
  await readFile(new URL(route.href + ".nft.json"), "utf8"),
);
assert(
  trace.files.some((file) =>
    file.replaceAll("\\", "/").endsWith("/ws/lib/websocket.js"),
  ),
  "Production route must trace the native ws runtime, rather than bundle its optional native modules",
);
const { WebSocket, WebSocketServer } = createRequire(route)("ws");
const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
let client;
try {
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const payload = "Syrka fictional transport verification. ".repeat(80);
  server.on("connection", (socket) =>
    socket.on("message", (data) => socket.send(data)),
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Native frame test timed out")),
      5000,
    );
    client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
      perMessageDeflate: false,
    });
    client.once("error", reject);
    client.once("open", () => client.send(payload));
    client.once("message", (data) => {
      clearTimeout(timer);
      try {
        assert.equal(data.toString(), payload);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
  console.log(
    "Production trace and native WebSocket masked-frame round trip: PASS",
  );
} finally {
  client?.terminate();
  for (const socket of server.clients) socket.terminate();
  await new Promise((resolve) => server.close(resolve));
}
