import fs from 'node:fs';
import path from 'node:path';

const siteOrigin = 'https://collisionauthorityhq.com';
const contentDirectories = ['.', 'orange-county', 'los-angeles', 'guides'];
const errors = [];
const routes = new Set();

function routeFor(file) {
  const normalized = file.replace(/^\.\//, '').replace(/\.html$/, '');
  return normalized === 'index' ? '/' : `/${normalized}`;
}

const htmlFiles = contentDirectories.flatMap((directory) =>
  fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.html'))
    .map((name) => path.join(directory, name)),
);

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const route = routeFor(file);
  const expectedCanonical = `${siteOrigin}${route}`;
  routes.add(expectedCanonical);

  const canonicals = [
    ...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"\s*>/gi),
  ].map((match) => match[1]);

  if (canonicals.length !== 1 || canonicals[0] !== expectedCanonical) {
    errors.push(
      `${file}: expected one canonical for ${expectedCanonical}; found ${JSON.stringify(canonicals)}`,
    );
  }

  for (const match of html.matchAll(
    /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
  )) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      errors.push(`${file}: invalid JSON-LD (${error.message})`);
    }
  }

  const brand = ['tesla', 'rivian', 'lucid'].find((candidate) =>
    path.basename(file, '.html').includes(candidate),
  );
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '';
  if (brand && !new RegExp(brand, 'i').test(title)) {
    errors.push(`${file}: title does not match the ${brand} route`);
  }

  if (/href="\/\//i.test(html)) {
    errors.push(`${file}: contains a protocol-relative link`);
  }
}

const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
const sitemapUrls = new Set(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]),
);

for (const route of routes) {
  if (!sitemapUrls.has(route)) errors.push(`sitemap.xml: missing ${route}`);
}
for (const sitemapUrl of sitemapUrls) {
  if (!routes.has(sitemapUrl)) errors.push(`sitemap.xml: unexpected ${sitemapUrl}`);
  if (sitemapUrl.startsWith('https://www.')) {
    errors.push(`sitemap.xml: www URL conflicts with the canonical host (${sitemapUrl})`);
  }
}

const robots = fs.readFileSync('robots.txt', 'utf8');
if (!robots.includes(`Sitemap: ${siteOrigin}/sitemap.xml`)) {
  errors.push('robots.txt: missing the canonical sitemap URL');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(
  `Validated ${htmlFiles.length} pages, ${sitemapUrls.size} sitemap URLs, canonical tags, and JSON-LD.`,
);
