import fs from 'node:fs';

export function parseAiEnvironment(text) {
  const fields = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(GEMINI_API_KEY|AGRI_VISION_AI_OWNER_DAILY_LIMIT|AGRI_VISION_AI_GLOBAL_DAILY_LIMIT|AGRI_VISION_AI_COOLDOWN_SECONDS)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || Object.hasOwn(fields, match[1])) throw new Error('The private AI config contains an unknown or repeated setting.');
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (match[1] === 'GEMINI_API_KEY' ? !/^[A-Za-z0-9_-]{1,256}$/.test(value) : !/^[1-9]\d{0,4}$/.test(value)) throw new Error('The private AI config contains an invalid setting.');
    fields[match[1]] = value;
  }
  return fields;
}

export function loadAiEnvironment(file, environment = process.env) {
  let fileEnvironment = {};
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 4096 || (stat.mode & 0o077) !== 0) {
      throw new Error('Protect the private AI config with chmod 600 before starting the pilot.');
    }
    fileEnvironment = parseAiEnvironment(fs.readFileSync(file, 'utf8'));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const inherited = environment.GEMINI_API_KEY?.trim();
  if (inherited) {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(inherited)) throw new Error('GEMINI_API_KEY has an invalid format.');
    return { ...fileEnvironment, GEMINI_API_KEY: inherited };
  }
  return fileEnvironment;
}

export function withoutAiSecrets(environment) {
  const result = { ...environment };
  for (const name of Object.keys(result)) {
    if (name === 'GEMINI_API_KEY' || name === 'GOOGLE_API_KEY' || /^VITE_.*(?:GEMINI|GOOGLE_AI)/i.test(name)) delete result[name];
  }
  return result;
}
