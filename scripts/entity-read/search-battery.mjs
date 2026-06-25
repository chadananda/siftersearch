// Standing search-quality test for the biography meaning-search (/api/v1/people/search). A wide battery of
// questions in a *student's* voice — many we may not yet answer well — to map coverage + surface gaps over time.
// Run anywhere with network: `node scripts/entity-read/search-battery.mjs [API_BASE]`. Prints, per question,
// the result count + the first several matched names, grouped by theme. (Node 18+ for global fetch.)
const API = process.argv[2] || 'https://api.siftersearch.com';
const j = async (p) => { const r = await fetch(API + p, { headers: { 'User-Agent': 'search-battery' } }); return r.json(); };

const BATTERY = [
  ['Episodes', [
    'Who defended the fort of Shaykh Ṭabarsí?', 'Who survived the siege of Fort Ṭabarsí?',
    'Who took part in the upheaval of Zanján?', 'Who fought alongside Ḥujjat at Zanján?',
    'Who was present at the Conference of Badasht?', 'Who accompanied the Báb on His pilgrimage to Mecca?',
    'Who were imprisoned with Bahá’u’lláh in the Síyáh-Chál?', 'Who was imprisoned with the Báb at Máh-Kú and Chihríq?',
    'Who accompanied Bahá’u’lláh into exile from Baghdád?']],
  ['Roles', [
    'Who served as the Báb’s secretaries or amanuenses?', 'Who carried letters or tablets between the believers and Bahá’u’lláh?',
    'Who transcribed the writings of the Báb?', 'Who were the couriers and messengers of the early Faith?',
    'Who sheltered or hosted the believers in their homes?']],
  ['Kinship', [
    'Who were the relatives of the Báb, the Afnán?', 'Who were the sons and daughters of Bahá’u’lláh?',
    'Who were the members of Ṭáhirih’s family?', 'Who were the family of Mullá Ḥusayn?',
    'Which believers were related to their own persecutors?', 'Who were the wives of Bahá’u’lláh?']],
  ['Fate', [
    'Who were the child martyrs of the Faith?', 'Who recanted under torture and later repented?',
    'Who was martyred together with a family member?', 'Who died of grief or hardship rather than execution?',
    'Who was martyred at Iṣfahán?', 'Who walked to their execution reciting poetry or verses?',
    'Whose remains were ransomed or secretly buried?', 'Who was strangled for the Faith?',
    'Who was executed by firing squad?', 'Martyrs who died in 1850']],
  ['Recognition', [
    'Which Shaykhís became Bábís?', 'Which mujtahids or divines embraced the Cause?',
    'Who was converted to the Faith by Ṭáhirih?', 'Who recognized the Báb before ever meeting Him?',
    'Which Letters of the Living met Bahá’u’lláh?']],
  ['Geography', [
    'Who were the believers of Nayríz?', 'Who were the notable believers of Iṣfahán?',
    'Which believers came from India?', 'Who came from the province of Khurásán?']],
  ['Opposition', [
    'Which kings and princes opposed the Faith?', 'Which prime ministers persecuted the believers?',
    'Which clergy issued death sentences against the Bábís?', 'Who betrayed the believers from within?',
    'Who were the executioners of the martyrs?']],
  ['Profession', [
    'Which believers were poets?', 'Which believers were merchants?', 'Which believers were soldiers or military officers?',
    'Which believers were dervishes?', 'Which believers were physicians?', 'Which believers were of royal or princely blood?']],
  ['Western', [
    'Who were the first Western pilgrims to ‘Akká?', 'Which Americans were named Disciples of ‘Abdu’l-Bahá?',
    'Who hosted ‘Abdu’l-Bahá during His Western travels?', 'Which Hands of the Cause appear in this history?']],
  ['Titles', [
    'To whom did the Báb give titles or new names?', 'Who were the Apostles of Bahá’u’lláh?',
    'Who bore a title beginning with Ismu’lláh, a Name of God?']],
  ['Groups', [
    'the Letters of the Living', 'the Seven Martyrs of Ṭihrán', 'kings who received Bahá’u’lláh’s tablets',
    'Which Letters of the Living died at Shaykh Ṭabarsí?']],
];

const data = await j('/api/v1/people?limit=2000');
const nm = Object.fromEntries((data.people || []).map((p) => [p.id, p.name]));
let total = 0, empty = 0;
for (const [group, qs] of BATTERY) {
  console.log(`\n=== ${group} ===`);
  for (const q of qs) {
    total++;
    try {
      const d = await j('/api/v1/people/search?q=' + encodeURIComponent(q));
      const ids = d.ids || []; if (!ids.length) empty++;
      console.log(`  [${String(ids.length).padStart(2)}] ${q}\n        → ${ids.slice(0, 6).map((i) => nm[i] || '?').join(', ')}`);
    } catch (e) { console.log(`  [ERR] ${q} :: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 250));
  }
}
console.log(`\n${total} questions · ${empty} returned no results`);
