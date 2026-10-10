"use strict";

const Busboy = require("busboy");

function readImages(req) {
  return new Promise((resolve, reject) => {
    let parser;
    try { parser = Busboy({ headers: req.headers, limits: { files: 2, fields: 0, parts: 3, fileSize: 10 * 1024 * 1024 } }); }
    catch { return reject(Object.assign(new Error("Upload two JPEG photos."), { status: 400 })); }
    const images = {};
    let issue;
    parser.on("file", (name, stream, info) => {
      if (!["prepared", "annotated"].includes(name) || images[name] || info.mimeType !== "image/jpeg") {
        issue = "Upload two different JPEG photos."; stream.resume(); return;
      }
      const chunks = [];
      images[name] = chunks;
      stream.on("data", chunk => chunks.push(chunk));
      stream.on("limit", () => { issue = "Each photo must be no larger than 10 MiB."; });
      stream.on("error", reject);
      stream.on("end", () => { images[name] = Buffer.concat(chunks); });
    });
    for (const event of ["filesLimit", "fieldsLimit", "partsLimit"]) parser.on(event, () => { issue = "Upload exactly two JPEG photos."; });
    parser.on("error", reject);
    req.on("aborted", () => reject(Object.assign(new Error("The upload was interrupted."), { status: 400 })));
    parser.on("close", () => {
      if (issue || !Buffer.isBuffer(images.prepared) || !Buffer.isBuffer(images.annotated)) {
        reject(Object.assign(new Error(issue || "Both photos are required."), { status: 400 }));
      } else resolve(images);
    });
    req.pipe(parser);
  });
}


module.exports = { readImages };
