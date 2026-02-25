import { buildLead, extractAttr, extractText, extractEmail, extractFromRegex, parseBySelectorChain } from './utils.js';

export const parserVersion = 'justdial@1.0.0';

export function parseJustdial($, { maxLeads, fingerprint }) {
  return parseBySelectorChain({
    $,
    maxLeads,
    containerSelectors: ['.resultbox', '.jdgm-listing', '.store-details'],
    buildRecord: (root) => {
      const text = root.text();
      return buildLead({
        businessName: extractText($, root, ['.lng_cont_name', '.store-name', 'h2']),
        phone: extractText($, root, ['.contact-info', '.phone', '.callcontent']) || extractFromRegex(text, /(\+?\d[\d\s\-()]{8,})/),
        email: extractEmail(text),
        website: extractAttr($, root, ['a[data-link="website"]', 'a[href^="http"]']),
        location: extractText($, root, ['.cont_fl_addr', '.address']),
        category: extractText($, root, ['.rsrt', '.category']),
        profileUrl: extractAttr($, root, ['a.store-name', 'a[href*="justdial.com"]']),
      }, 'justdial', parserVersion, fingerprint);
    },
  });
}
