const fs = require('fs');
const path = require('path');

const en = JSON.parse(fs.readFileSync('messages/en.json', 'utf8'));

function getKeys(obj, prefix) {
  let keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? prefix + '.' + k : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys = keys.concat(getKeys(v, key));
    } else {
      keys.push(key);
    }
  }
  return keys;
}

const allKeys = new Set(getKeys(en, ''));

function findFiles(dir, ext) {
  let results = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory() && f.name !== 'node_modules' && f.name !== '.next' && f.name !== '.git') {
      results = results.concat(findFiles(full, ext));
    } else if (f.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

const files = [...findFiles('.', '.tsx'), ...findFiles('.', '.ts')];
const missing = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const nsMatches = [...content.matchAll(/(?:const\s+(\w+)\s*=\s*)?useTranslations\(['"](\w+)['"]\)/g)];

  for (const m of nsMatches) {
    const varName = m[1] || 't';
    const namespace = m[2];
    const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const keyRegex = new RegExp(escaped + "\\(['\"]([\\w.]+)['\"]", 'g');
    const keyMatches = [...content.matchAll(keyRegex)];

    for (const km of keyMatches) {
      const key = km[1];
      const fullKey = namespace + '.' + key;
      if (!allKeys.has(fullKey)) {
        missing.push({ namespace, key, fullKey, file: file.replace(/^\.\//, '') });
      }
    }
  }
}

const seen = new Set();
const unique = missing.filter(m => {
  if (seen.has(m.fullKey)) return false;
  seen.add(m.fullKey);
  return true;
}).sort((a, b) => a.namespace.localeCompare(b.namespace) || a.key.localeCompare(b.key));

console.log('MISSING KEYS (' + unique.length + '):');
for (const m of unique) {
  console.log(m.namespace + '.' + m.key + '  |  ' + m.file);
}
