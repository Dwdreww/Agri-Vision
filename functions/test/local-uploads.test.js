"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { readImages } = require("../local-uploads");

async function upload(parts) {
  const form = new FormData();
  for (const [name, type = "image/jpeg"] of parts) {
    form.append(name, new Blob([Buffer.from([255, 216, 255, 0])], { type }), `${name}.jpg`);
  }
  const request = new Request("http://localhost/", { method: "POST", body: form });
  const stream = Readable.from([Buffer.from(await request.arrayBuffer())]);
  stream.headers = Object.fromEntries(request.headers);
  return readImages(stream);
}

test("accepts exactly the two prepared and annotated JPEG parts", async () => {
  const images = await upload([["prepared"], ["annotated"]]);
  assert.equal(images.prepared.length, 4);
  assert.equal(images.annotated.length, 4);
});

test("rejects missing, repeated, extra, unexpected, and non-JPEG parts", async () => {
  for (const parts of [
    [["prepared"]], [["prepared"], ["prepared"]],
    [["prepared"], ["annotated"], ["extra"]],
    [["prepared"], ["extra"]], [["prepared", "image/png"], ["annotated"]]
  ]) await assert.rejects(upload(parts), error => error.status === 400);
});
