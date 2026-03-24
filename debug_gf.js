// ── DIAGNOSTIC TWOBEEVENT — Google Flights ──
// Colle ce script dans la console du navigateur SUR la page Google Flights
// Puis copie-colle le résultat complet ici.

(function() {
  console.clear();
  console.log("=== TWOBEEVENT DIAGNOSTIC ===\n");

  // 1. Texte brut de la page (500 premiers caractères)
  console.log("── INNERTEXT (500 chars) ──");
  console.log(document.body.innerText.substring(0, 500));
  console.log("\n");

  // 2. Chercher tous les horaires dans le DOM
  console.log("── HORAIRES TROUVÉS ──");
  const timeEls = [];
  document.querySelectorAll('*').forEach(el => {
    if (el.children.length > 0) return; // feuilles uniquement
    const t = el.innerText?.trim();
    if (t && /^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(t)) {
      timeEls.push({ tag: el.tagName, class: el.className, text: t, parent: el.parentElement?.className });
    }
  });
  console.log(JSON.stringify(timeEls.slice(0, 20), null, 2));

  // 3. Chercher les codes IATA (3 lettres maj seuls)
  console.log("\n── CODES IATA TROUVÉS ──");
  const iataEls = [];
  const ignore = ['THE','FOR','AND','NOT','EUR','USD','MIN','MON','TUE','WED','THU','FRI','SAT','SUN','AM','PM','KGS','LBS'];
  document.querySelectorAll('*').forEach(el => {
    if (el.children.length > 0) return;
    const t = el.innerText?.trim();
    if (t && /^[A-Z]{3}$/.test(t) && !ignore.includes(t)) {
      iataEls.push({ tag: el.tagName, class: el.className, text: t, parent: el.parentElement?.className });
    }
  });
  console.log(JSON.stringify(iataEls.slice(0, 20), null, 2));

  // 4. Chercher les numéros de vol
  console.log("\n── NUMÉROS DE VOL TROUVÉS ──");
  const flightEls = [];
  document.querySelectorAll('*').forEach(el => {
    if (el.children.length > 0) return;
    const t = el.innerText?.trim();
    if (t && /^[A-Z]{2}\s?\d{3,4}$/.test(t)) {
      flightEls.push({ tag: el.tagName, class: el.className, text: t, parent: el.parentElement?.className });
    }
  });
  console.log(JSON.stringify(flightEls.slice(0, 10), null, 2));

  // 5. Sélecteurs connus — lesquels matchent ?
  console.log("\n── SÉLECTEURS DOM ──");
  const selectors = [
    'li[jsname]',
    'div[jsname="IWWDBc"]',
    'div[jsname="tK0HBb"]',
    'div[jsname="FoS3if"]',
    '.gws-flights-results__leg',
    'div[data-ved]',
    'ol[jsname] li',
    'ul[jsname] li',
    '[data-iata]',
  ];
  selectors.forEach(sel => {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) {
      console.log(`✅ "${sel}" → ${els.length} élément(s)`);
      console.log("   Extrait du 1er :", els[0].innerText?.substring(0, 150).replace(/\n/g, ' | '));
    } else {
      console.log(`❌ "${sel}" → 0`);
    }
  });

  // 6. Structure du premier li avec jsname trouvé
  console.log("\n── PREMIER li[jsname] INNERHTML (si existe) ──");
  const firstLi = document.querySelector('li[jsname]');
  if (firstLi) {
    console.log("innerText complet :", firstLi.innerText);
  } else {
    console.log("Aucun li[jsname] trouvé.");
    // Afficher les 5 premiers li de la page
    const lis = document.querySelectorAll('li');
    console.log(`Total <li> sur la page : ${lis.length}`);
    lis.forEach((li, i) => {
      if (i < 5) console.log(`li[${i}] innerText:`, li.innerText?.substring(0, 100));
    });
  }

  console.log("\n=== FIN DIAGNOSTIC ===");
  console.log("👉 Copie tout ce texte et envoie-le !");
})();
