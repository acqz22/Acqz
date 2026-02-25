import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parsePlatformHtml } from '../src/parsers.js';

function readFixture(platform) {
  return fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', platform, 'sample.html'), 'utf8');
}

test('google adapter extracts key fields and selector version', () => {
  const html = readFixture('google_search');
  const result = parsePlatformHtml('google_search', html, { maxLeads: 10 });

  assert.equal(result.adapter, 'google');
  assert.equal(result.selectorSetVersion, 'google-v2026.01');
  assert.ok(result.leads.length >= 2);
  assert.equal(result.leads[0].title, 'Acme Dental Clinic');
  assert.equal(result.leads[0].link, 'https://acme.example');
  assert.match(result.leads[0].phone, /555/);
  assert.equal(result.leads[0].address, '123 Main Street');
  assert.equal(result.leads[0].selectorSetVersion, 'google-v2026.01');
});

test('directory adapter extracts key fields with fallback selectors', () => {
  const html = readFixture('yellowpages');
  const result = parsePlatformHtml('yellowpages', html, { maxLeads: 10 });

  assert.equal(result.adapter, 'directory');
  assert.equal(result.selectorSetVersion, 'directory-v2026.01');
  assert.equal(result.leads.length, 2);
  assert.equal(result.leads[0].title, 'North Star Plumbing');
  assert.equal(result.leads[0].phone, '(212) 555-1000');
  assert.equal(result.leads[0].address, '77 River Road');
});

test('social adapter extracts contact-like tokens', () => {
  const html = readFixture('instagram');
  const result = parsePlatformHtml('instagram', html, { maxLeads: 10 });

  assert.equal(result.adapter, 'social');
  assert.equal(result.selectorSetVersion, 'social-v2026.01');
  assert.ok(result.leads.some((lead) => lead.name.includes('@acmeagency')));
  assert.ok(result.leads.some((lead) => lead.name.includes('9998887776')));
});
