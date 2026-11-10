import { createHash } from 'node:crypto';
import * as blob from '@vercel/blob';
import { getVercelOidcToken } from '@vercel/oidc';

export const PHOTO_PROVIDER = 'vercel-blob';
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function photoPath(uid, scanId, imageName) {
  if (!validId(uid) || !validId(scanId) || !['prepared.jpg', 'annotated.jpg'].includes(imageName)) {
    throw Object.assign(new Error('Invalid photo.'), { status: 400 });
  }
  return `users/${uid}/scans/${scanId}/${imageName}`;
}

export function createPhotoStore({ sdk = blob, token, storeId = process.env.BLOB_STORE_ID, oidcToken } = {}) {
  async function options() {
    if (token) return { token };
    if (storeId) return { storeId, oidcToken: oidcToken || await getVercelOidcToken() };
    if (process.env.BLOB_READ_WRITE_TOKEN) return { token: process.env.BLOB_READ_WRITE_TOKEN };
    throw Object.assign(new Error('Photo storage is not configured.'), { status: 503 });
  }
  async function read(pathname, { useCache = true } = {}) {
    return sdk.get(pathname, { ...await options(), access: 'private', useCache });
  }
  async function ensureFile(pathname, bytes) {
    const previous = await read(pathname, { useCache: false });
    if (previous?.statusCode === 200) {
      const existing = Buffer.from(await new Response(previous.stream).arrayBuffer());
      if (sha256(existing) !== sha256(bytes)) throw Object.assign(new Error('This photo already exists with different contents.'), { status: 409 });
      return { created: false, sha256: sha256(bytes) };
    }
    await sdk.put(pathname, bytes, { ...await options(), access: 'private', contentType: 'image/jpeg', addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 60 });
    return { created: true, sha256: sha256(bytes) };
  }
  return {
    supports: provider => provider === PHOTO_PROVIDER,
    read: (uid, id, name, options) => read(photoPath(uid, id, name), options),
    async verify(uid, id, name, expected) {
      const result = await read(photoPath(uid, id, name), { useCache: false });
      if (result?.statusCode !== 200) throw new Error('Uploaded photo could not be verified.');
      const actual = Buffer.from(await new Response(result.stream).arrayBuffer());
      if (sha256(actual) !== expected) throw new Error('Uploaded photo checksum mismatch.');
      return true;
    },
    async save(uid, id, images) {
      for (const name of ['prepared', 'annotated']) {
        const bytes = images[name];
        if (!Buffer.isBuffer(bytes) || bytes.length < 3 || bytes.length > MAX_UPLOAD_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
          throw Object.assign(new Error('Choose valid JPEG photos smaller than 4 MB.'), { status: 400 });
        }
      }
      if (images.prepared.length + images.annotated.length > MAX_UPLOAD_BYTES) throw Object.assign(new Error('The photo pair is too large. Choose a smaller photo.'), { status: 413 });
      const created = [];
      const checksums = {};
      try {
        for (const name of ['prepared', 'annotated']) {
          const pathname = photoPath(uid, id, `${name}.jpg`);
          const result = await ensureFile(pathname, images[name]);
          if (result.created) created.push(pathname);
          checksums[name] = result.sha256;
        }
        return checksums;
      } catch (error) {
        if (created.length) await sdk.del(created, await options()).catch(() => {});
        throw error;
      }
    },
    async removePrefix(prefix) {
      if (!/^users\/[A-Za-z0-9_-]{1,128}\/scans\/(?:[A-Za-z0-9_-]{1,128}\/)?$/.test(prefix)) throw new Error('Invalid private photo prefix.');
      const files = [];
      let cursor;
      do {
        const page = await sdk.list({ ...await options(), prefix, ...(cursor ? { cursor } : {}), limit: 1000 });
        files.push(...page.blobs.map(item => item.url));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      for (let start = 0; start < files.length; start += 100) await sdk.del(files.slice(start, start + 100), await options());
    }
  };
}
