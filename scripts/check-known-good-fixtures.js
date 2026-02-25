import fs from 'node:fs';
import path from 'node:path';
import { parsePlatformHtml } from '../src/parsers.js';

const knownGood = [
  { platform: 'google_search', fixture: 'tests/fixtures/google_search/sample.html' },
  { platform: 'yellowpages', fixture: 'tests/fixtures/yellowpages/sample.html' },
  { platform: 'instagram', fixture: 'tests/fixtures/instagram/sample.html' }
];

let failed = false;

for (const item of knownGood) {
  const fullPath = path.join(process.cwd(), item.fixture);
  const html = fs.readFileSync(fullPath, 'utf8');
  const parsed = parsePlatformHtml(item.platform, html, { maxLeads: 50 });
  const leadCount = parsed.leads.length;

  console.log(
    `[fixture-check] platform=${item.platform} adapter=${parsed.adapter} selectors=${parsed.selectorSetVersion} leads=${leadCount}`
  );

  if (leadCount === 0) {
    failed = true;
    console.error(`[fixture-check] FAILED: parser returned zero leads for known-good fixture ${item.fixture}`);
  }
}

if (failed) {
  process.exit(1);
}
