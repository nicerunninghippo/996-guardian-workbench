import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = new URL('https://guardian-workbench-s4.lucky-crane-6426.chatgpt.site/');
const directory = new URL('../dist/', import.meta.url);
const files = (await readdir(directory, { withFileTypes: true })).filter(e => e.isFile()).map(e => e.name).sort();
const normalize = text => text.replace(/\r\n/g, '\n');
// Sites' CDN appends this specific Cloudflare bootstrap to HTML responses.
// Ignore only its known script bytes with the per-response r/t values normalized.
// Unknown scripts, changed page markup, and changed assets still fail closed.
const digest = text => createHash('sha256').update(text).digest('hex');
function removeKnownCdnFooter(text) {
  const match = text.match(/<script>\(function\(\)\{function c\(\)\{[\s\S]*?<\/script>(?=<\/body><\/html>\n?$)/);
  if (!match) return text;
  const canonical = match[0].replace(/r:'[a-f0-9]+',t:'[A-Za-z0-9+/=]+'/g, "r:'REDACTED',t:'REDACTED'");
  if (digest(canonical) !== 'dbb33f7ec9fa64e612d3bbbf780e0866548d5a31e759328d31623507fce5ee4b') return text;
  return text.slice(0, match.index) + text.slice(match.index + match[0].length);
}
for (const name of files) {
  const expected = normalize(await readFile(new URL(name, directory), 'utf8'));
  const deployedPath = name === 'index.html' ? '' : name.endsWith('.html') ? name.slice(0, -5) : name;
  const response = await fetch(new URL(deployedPath, base), {
    cache: 'no-store', signal: AbortSignal.timeout(15000), redirect: 'error'
  });
  if (!response.ok) throw new Error(`${name}: preview returned HTTP ${response.status}`);
  let actual = normalize(await response.text());
  if (name.endsWith('.html')) actual = removeKnownCdnFooter(actual);
  if (actual !== expected) throw new Error(`${name}: published preview differs from this commit. Publish the updated Sites runtime before rerunning this check.`);
  console.log(`${name}: matches ${digest(expected)}`);
}
console.log(`Preview ready: ${base.href} matches every dist asset in this checkout.`);
