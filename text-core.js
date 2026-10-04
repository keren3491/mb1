/* Shared contact parsing and SMS formatting. */
(function (root) {
  function phone(value) {
    const raw = String(value || '').trim().replace(/^tel:/i, '');
    if (/[a-z]/i.test(raw)) return '';
    const normalized = raw.replace(/[\s().-]/g, '');
    return /^\+?\d{7,15}$/.test(normalized) ? normalized : '';
  }
  function csvRows(text) {
    const rows = []; let row = [], cell = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
        row.push(cell); cell = '';
        if (c !== ',') { if (row.some(x => x.trim())) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
      } else cell += c;
    }
    if (quoted) throw new Error('The CSV has an unclosed quote. Please export it again.');
    row.push(cell); if (row.some(x => x.trim())) rows.push(row);
    return rows;
  }
  function contactsFromCSV(text) {
    const rows = csvRows(text); if (!rows.length) return [];
    const headers = rows.shift().map(x => x.trim().toLowerCase());
    const phones = headers.map((h, i) => /phone|mobile|telephone|^tel$/.test(h) && !/type|label/.test(h) ? i : -1).filter(i => i >= 0);
    if (!phones.length) throw new Error('CSV needs a Phone or Mobile column, with a header row.');
    const nameIndex = headers.findIndex(h => /^(name|full ?name|display name)$/.test(h));
    const firstIndex = headers.findIndex(h => /^(first name|given name)$/.test(h));
    const lastIndex = headers.findIndex(h => /^(last name|family name)$/.test(h));
    return rows.flatMap(row => phones.map(i => ({ name: nameIndex >= 0 ? row[nameIndex] || '' : [row[firstIndex], row[lastIndex]].filter(Boolean).join(' '), phone: row[i] || '' })).filter(c => c.phone.trim()));
  }
  function contactsFromVCF(text) {
    text = text.replace(/\r?\n[ \t]/g, '');
    const decode = s => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
    return text.split(/BEGIN:VCARD/i).slice(1).flatMap(card => {
      const lines = card.split(/\r?\n/); let name = '', fallback = '', numbers = [];
      for (const line of lines) {
        const colon = line.indexOf(':'); if (colon < 0) continue;
        const key = line.slice(0, colon).split(';')[0].replace(/^item\d+\./i, '').toUpperCase();
        const value = line.slice(colon + 1);
        if (key === 'FN') name = decode(value);
        if (key === 'N') { const parts = value.split(';'); fallback = decode([parts[1], parts[0]].filter(Boolean).join(' ')); }
        if (key === 'TEL') numbers.push(value);
      }
      return numbers.map(number => ({ name: name || fallback, phone: number }));
    });
  }
  function personalized(template, contact) {
    const name = (contact.name || '').trim();
    return template.replaceAll('{FirstName}', name.split(/\s+/)[0] || '').replaceAll('{FullName}', name);
  }
  function smsURL(contact, template, ios) {
    const number = phone(contact.phone); if (!number) throw new Error('Invalid phone number.');
    return 'sms:' + number + (ios ? '&' : '?') + 'body=' + encodeURIComponent(personalized(template, contact));
  }
  const api = { phone, csvRows, contactsFromCSV, contactsFromVCF, personalized, smsURL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TextCore = api;
})(typeof window === 'undefined' ? globalThis : window);
