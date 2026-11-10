import { randomUUID } from 'node:crypto';
export class MemoryFirestore {
  constructor(entries = []) { this.records = new Map(entries); this.tail = Promise.resolve(); }
  snapshot(path, records = this.records) {
    const value = records.get(path);
    return { exists: value !== undefined, id: path.split('/').at(-1), ref: this.doc(path), get: key => value?.[key], data: () => value };
  }
  doc(path) {
    return { path, id: path.split('/').at(-1),
      get: async () => this.snapshot(path),
      set: async (data, options) => { this.records.set(path, options?.merge ? { ...this.records.get(path), ...data } : { ...data }); },
      update: async data => { if (!this.records.has(path)) throw new Error('Missing document'); this.records.set(path, { ...this.records.get(path), ...data }); },
      delete: async () => { this.records.delete(path); },
      collection: name => this.collection(`${path}/${name}`) };
  }
  collection(path) {
    return { path, isCollection: true, doc: id => this.doc(`${path}/${id || randomUUID()}`), get: async () => this.query(path), };
  }
  query(path, records = this.records) {
    const depth = path.split('/').length + 1;
    const docs = [...records.keys()].filter(key => key.startsWith(path + '/') && key.split('/').length === depth).map(key => this.snapshot(key, records));
    return { docs, size: docs.length };
  }
  runTransaction(operation) {
    const execute = async () => {
      const working = new Map(this.records);
      const result = await operation({
        get: async ref => ref.isCollection ? this.query(ref.path, working) : this.snapshot(ref.path, working),
        set: (ref, data, options) => working.set(ref.path, options?.merge ? { ...working.get(ref.path), ...data } : { ...data }),
        update: (ref, data) => { if (!working.has(ref.path)) throw new Error('Missing document'); working.set(ref.path, { ...working.get(ref.path), ...data }); },
        delete: ref => working.delete(ref.path)
      });
      this.records = working;
      return result;
    };
    const result = this.tail.catch(() => {}).then(execute);
    this.tail = result;
    return result;
  }
  batch() { const deletes = []; return { delete: ref => deletes.push(ref), commit: async () => { for (const ref of deletes) this.records.delete(ref.path); } }; }
  async recursiveDelete(ref) { for (const key of this.records.keys()) if (key === ref.path || key.startsWith(ref.path + '/')) this.records.delete(key); }
}
