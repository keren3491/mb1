const $ = id => document.getElementById(id);
const Core = TextCore;
let storageFailed = false;
function read(key, fallback) { try { const value = localStorage.getItem('textrunner_' + key); return value === null ? fallback : JSON.parse(value); } catch { return fallback; } }
function write(key, value) { try { localStorage.setItem('textrunner_' + key, JSON.stringify(value)); } catch { storageFailed = true; $('storageWarning').hidden = false; } }
let contacts = read('contacts', []);
if (!Array.isArray(contacts)) contacts = [];
contacts = contacts.filter(c => c && typeof c.phone === 'string').map(c => ({ name: String(c.name || ''), phone: c.phone }));
let savedSelected = read('selected', []);
let selected = new Set(Array.isArray(savedSelected) ? savedSelected.filter(i => Number.isInteger(i) && contacts[i] && Core.phone(contacts[i].phone)) : []);
let batchStart = Number(read('batchStart', 0)) || 0;
let session = read('session', null);
if (!session || !Array.isArray(session.queue) || !session.queue.every(c => c && Core.phone(c.phone)) || !Number.isInteger(session.index) || session.index < 0 || session.index > session.queue.length) session = null;
const template = $('template');
// Previous versions stored the template as plain text.
try { template.value = localStorage.getItem('textrunner_template') || template.value; } catch {}
template.addEventListener('input', () => { try { localStorage.setItem('textrunner_template', template.value); } catch { $('storageWarning').hidden = false; } update(); });
function save() { write('contacts', contacts); write('selected', [...selected]); write('batchStart', batchStart); write('session', session); }
function status(message) { $('statusText').textContent = message; }
function render() {
  $('contacts').replaceChildren();
  contacts.forEach((c, i) => {
    const row = document.createElement('label'); row.className = 'contact';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = selected.has(i); cb.disabled = !Core.phone(c.phone);
    cb.setAttribute('aria-label', 'Select ' + (c.name || c.phone));
    cb.onchange = () => { cb.checked ? selected.add(i) : selected.delete(i); save(); update(); };
    const meta = document.createElement('div'); meta.className = 'meta';
    const name = document.createElement('div'); name.className = 'name'; name.textContent = c.name || c.phone;
    const number = document.createElement('div'); number.className = 'phone'; number.textContent = c.phone + (cb.disabled ? ' — invalid phone number' : '');
    meta.append(name, number); row.append(cb, meta); $('contacts').append(row);
  });
  $('emptyContacts').hidden = contacts.length > 0;
  $('batchInfo').textContent = contacts.length ? `Batch ${Math.floor(batchStart / 100) + 1}: contacts ${batchStart + 1}–${Math.min(batchStart + 100, contacts.length)} of ${contacts.length}` : 'No contacts imported';
  $('prev100').disabled = batchStart === 0;
  $('next100').disabled = batchStart + 100 >= contacts.length;
  update();
}
function update() {
  const active = session && !session.done;
  const current = active ? session.queue[session.index] : null;
  $('selectedCount').textContent = selected.size;
  $('processedCount').textContent = session ? session.index : 0;
  $('start').disabled = !selected.size || !template.value.trim() || !!active;
  $('pause').disabled = !active || session.paused;
  $('resume').disabled = !active || !session.paused;
  $('stop').disabled = !active;
  $('nextNow').disabled = !current || session.paused || session.awaiting;
  $('nextNow').textContent = 'Open Message';
  $('sent').disabled = !active || !session.awaiting || session.paused;
  $('retry').disabled = !active || !session.awaiting || session.paused;
  $('skip').disabled = !current || session.paused;
  $('recipient').textContent = current ? `${current.name || 'Unnamed contact'} · ${current.phone}` : 'Choose contacts and tap Start';
  $('preview').textContent = current ? Core.personalized(session.template, current) : '';
  $('progress').textContent = active ? `Contact ${session.index + 1} of ${session.queue.length}` : session && session.done ? 'Batch completed' : '';
}
function selectBatch(start) {
  if (!contacts.length) return;
  batchStart = Math.max(0, Math.min(start, Math.floor((contacts.length - 1) / 100) * 100));
  selected = new Set(contacts.map((c, i) => i >= batchStart && i < batchStart + 100 && Core.phone(c.phone) ? i : -1).filter(i => i >= 0)); save(); render();
}
$('first100').onclick = () => selectBatch(0);
$('next100').onclick = () => selectBatch(batchStart + 100);
$('prev100').onclick = () => selectBatch(batchStart - 100);
$('selectAll').onclick = () => { selected = new Set(contacts.map((c, i) => Core.phone(c.phone) ? i : -1).filter(i => i >= 0)); save(); render(); };
$('clearAll').onclick = () => { selected.clear(); save(); render(); };
$('addManual').onclick = () => { $('manualBox').classList.toggle('hidden'); if (!$('manualBox').classList.contains('hidden')) $('manualName').focus(); };
function addContacts(incoming) {
  const existing = new Set(contacts.map(c => Core.phone(c.phone))); let added = 0, duplicates = 0, invalid = 0;
  for (const c of incoming) {
    const number = Core.phone(c.phone);
    if (!number) { invalid++; continue; }
    if (existing.has(number)) { duplicates++; continue; }
    existing.add(number); contacts.push({ name: String(c.name || '').trim(), phone: number }); selected.add(contacts.length - 1); added++;
  }
  save(); render(); status(`Added ${added} contacts. ${duplicates} duplicates and ${invalid} invalid numbers skipped.`);
}
$('saveManual').onclick = () => {
  const number = Core.phone($('manualPhone').value);
  if (!number) { status('Enter a valid phone number, including country code for international numbers.'); return; }
  addContacts([{ name: $('manualName').value, phone: number }]); $('manualName').value = ''; $('manualPhone').value = '';
};
const supportsPicker = !!(navigator.contacts && navigator.contacts.select);
$('pickContacts').disabled = !supportsPicker;
$('pickerHelp').textContent = supportsPicker ? 'Choose contacts from this device.' : 'Direct contact picking is unavailable in this browser. Import a vCard (.vcf) or CSV file below.';
$('pickContacts').onclick = async () => {
  try { const picked = await navigator.contacts.select(['name', 'tel'], { multiple: true }); addContacts(picked.flatMap(p => (p.tel || []).map(number => ({ name: (p.name || [])[0] || '', phone: number })))); }
  catch (error) { if (error.name !== 'AbortError') status('Contact picking failed. Use a vCard or CSV file instead.'); }
};
$('contactFile').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('Please use a contact file smaller than 5 MB.');
    const text = await file.text();
    const incoming = /\.vcf$/i.test(file.name) || /^\s*BEGIN:VCARD/i.test(text) ? Core.contactsFromVCF(text) : Core.contactsFromCSV(text);
    if (!incoming.length) throw new Error('No contacts found in this file.');
    addContacts(incoming);
  } catch (error) { status(error.message); }
  event.target.value = '';
};
$('start').onclick = () => {
  const queue = [...selected].sort((a, b) => a - b).map(i => contacts[i]).filter(c => c && Core.phone(c.phone));
  if (!queue.length || !template.value.trim()) { status('Select at least one contact and enter a message.'); return; }
  session = { queue, template: template.value, index: 0, awaiting: false, paused: false, done: false }; save(); update(); status('Review the message, then tap Open Message.');
};
function openMessage() {
  if (!session || session.done || session.paused) return;
  const c = session.queue[session.index]; if (!c) return;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const url = Core.smsURL(c, session.template, ios);
  session.awaiting = true; save(); update(); status('Send in Messages, return here, then tap Sent / Next. If it did not open, tap Reopen.');
  window.location.href = url;
}
$('nextNow').onclick = openMessage;
$('retry').onclick = openMessage;
function advance(skipped) {
  if (!session || session.done || session.paused || (!skipped && !session.awaiting)) return;
  session.index++; session.awaiting = false;
  session.done = session.index >= session.queue.length;
  save(); update(); status(session.done ? 'Batch completed. Progress reflects your confirmations, not delivery receipts.' : skipped ? 'Contact skipped. Review the next message.' : 'Marked sent. Review the next message.');
}
$('sent').onclick = () => advance(false);
$('skip').onclick = () => advance(true);
$('pause').onclick = () => { if (session) { session.paused = true; save(); update(); status('Paused. Your progress is saved.'); } };
$('resume').onclick = () => { if (session) { session.paused = false; save(); update(); status('Resumed. Review your current contact.'); } };
$('stop').onclick = () => { session = null; save(); update(); status('Stopped. Select contacts to start a new batch.'); };
render();
if (session && !session.done) status('Saved batch restored. Continue with the current contact.');
