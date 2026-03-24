// content.js — Twobeevent Capture v2.3.1
console.error("!!! [Twobeevent] SCRIPT INJECTE SUR", window.location.hostname, "!!!");
console.log("[Twobeevent] Content script chargé.");

// --- IDs Twobeevent ---
const urlParams = new URLSearchParams(window.location.search);
const twbParticipantId = urlParams.get('twobeevent_participant_id');
const twbApiUrl = urlParams.get('twobeevent_api_url');

if (twbParticipantId || twbApiUrl) {
  const toSave = {};
  if (twbParticipantId) toSave.twobeevent_pid = twbParticipantId;
  if (twbApiUrl) toSave.twobeevent_api_url = twbApiUrl;
  chrome.storage.local.set(toSave);
}

const checkPortalId = () => {
    const activePid = document.body.getAttribute('data-twb-active-pid');
    if (activePid) chrome.storage.local.set({ twobeevent_pid: activePid });
};
if (window.location.hostname === "localhost" || window.location.port === "3000") {
  checkPortalId();
  new MutationObserver(checkPortalId).observe(document.body, { attributes: true, attributeFilter: ['data-twb-active-pid'] });
}

const isTime = (s) => /^\d{1,2}:\d{2}$/.test(s.trim());

function cleanStation(raw) {
  if (!raw) return "";
  let s = raw.split('\n')[0].trim();
  s = s.replace(/^(TGV INOUI|OUIGO|TER|INTERCITÉS?|TGV|Bus|Ligne|Train\s+li[Oo]|Train\s+Rémi\s+Exp|INTERCITES|Flixbus|ZOU\s*!?|Eurostar|Thalys|Lyria|ICE|RE|RB)\s*/i, "");
  return s.replace(/\s+/g, ' ').trim();
}

function gfCleanTime(raw) {
  if (!raw) return "";
  const m = raw.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return raw.trim();
  let h = parseInt(m[1]);
  const period = (m[3] || "").toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

// ─── EXTRACTION DES RÉFÉRENCES DE VOL ───
// Cible le pattern "Compagnie · Classe · Avion · REFVOL" visible sur Google Flights
// ex: "Transavia · Classe économique · Airbus A320neo · TO 3010"
function extractFlightReferences(containerEl) {
  if (!containerEl) return { numero: '', compagnie: '' };

  const flightRefs = [];
  const companies = [];

  // Pattern ligne complète avec séparateurs "·"
  const dotLinePattern = /^(.+?)\s*·.+·\s*([A-Z]{2,3})\s?(\d{3,5})\s*$/;

  const allEls = Array.from(containerEl.querySelectorAll('*'));

  allEls.forEach(el => {
    const text = (el.innerText || '').trim();
    if (!text || text.length > 200) return;

    // Test 1 : ligne "Compagnie · Classe · Avion · REF"
    const m = text.match(dotLinePattern);
    if (m) {
      const compagnie = m[1].trim();
      const ref = (m[2] + m[3]).toUpperCase();
      // Exclure les modèles d'avion mal classés (A320, B737, E190...)
      if (!/^(A3|B7|E1|E7|CRJ|ATR)/i.test(ref)) {
        flightRefs.push(ref);
        companies.push(compagnie);
      }
      return;
    }

    // Test 2 : référence seule sur sa ligne ex: "TO 3010" ou "AF1234"
    const soloRef = text.match(/^([A-Z]{2,3})\s?(\d{3,5})$/);
    if (soloRef) {
      const ref = (soloRef[1] + soloRef[2]).toUpperCase();
      if (!/^(A3|B7|E1|E7|CRJ|ATR)/i.test(ref)) {
        flightRefs.push(ref);
      }
    }
  });

  // Fallback : chercher "· XX 1234" dans le texte brut du conteneur
  if (flightRefs.length === 0) {
    const fullText = containerEl.innerText || '';
    const fallbackMatches = [...fullText.matchAll(/·\s*([A-Z]{2,3})\s?(\d{3,5})(?:\s|$)/gm)];
    fallbackMatches.forEach(m => {
      const ref = (m[1] + m[2]).toUpperCase();
      if (!/^(A3|B7|E1|E7|CRJ|ATR)/i.test(ref)) {
        flightRefs.push(ref);
      }
    });

    if (companies.length === 0) {
      const compMatch = fullText.match(/^([A-Za-zÀ-ÿ ]+?)\s*·/m);
      if (compMatch) companies.push(compMatch[1].trim());
    }
  }

  const uniqueRefs = [...new Set(flightRefs)];
  const uniqueCompanies = [...new Set(companies)];

  console.log('[Twobeevent GF] Refs extraites :', uniqueRefs, '| Compagnies :', uniqueCompanies);

  return {
    numero: uniqueRefs.join(' + '),
    compagnie: uniqueCompanies[0] || ''
  };
}

// ─── GOOGLE FLIGHTS ───
function extractGoogleFlights() {
  console.log("[Twobeevent GF] Extraction v2.3.1...");
  const parsedTransports = [];

  const infoButtons = Array.from(document.querySelectorAll(
    'button[aria-label*="Informations sur le vol"], button[aria-label*="Flight information"], [aria-label^="Flight information"]'
  ));

  console.log(`[Twobeevent GF] Boutons info trouvés : ${infoButtons.length}`);

  infoButtons.forEach((btn, idx) => {
    const label = btn.getAttribute('aria-label') || "";
    const isReturn = /retour|return/i.test(label);

    const depMatch = label.match(/(?:Départ de|Departure from)\s+(.*?)\s+à\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?)/i);
    const arrMatch = label.match(/(?:arrivée à|arrival at)\s+(.*?)\s+à\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?)/i);

    if (depMatch && arrMatch) {
      const lieuDep = depMatch[1].trim();
      const depTime = gfCleanTime(depMatch[2]);
      const lieuArr = arrMatch[1].trim();
      const arrTime = gfCleanTime(arrMatch[2]);

      // Date — remonte dans le DOM
      let date = "";
      let container = btn.parentElement;
      for (let i = 0; i < 10; i++) {
        if (!container) break;
        const dpRegex = /((?:Lun|Mar|Mer|Jeu|Ven|Sam|Dim|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\.?\s+\d+\s+(?:janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*(?:\s+\d{4})?)/i;
        const m = container.innerText.match(dpRegex);
        if (m) { date = m[1].trim(); break; }
        container = container.parentElement;
      }

      // Conteneur du segment — on remonte jusqu'à trouver la ligne "Compagnie · ... · REF"
      let legBox = btn;
      for (let i = 0; i < 8; i++) {
        if (!legBox.parentElement) break;
        legBox = legBox.parentElement;
        const text = legBox.innerText || '';
        // On est dans le bon conteneur quand on voit "·" avec un code de vol potentiel
        if (/[A-Z]{2,3}\s?\d{3,5}/.test(text) && text.includes('·')) break;
      }

      const { numero, compagnie } = extractFlightReferences(legBox);

      console.log(`[Twobeevent GF] Vol ${idx} — ${lieuDep}→${lieuArr} | num:"${numero}" cie:"${compagnie}" date:"${date}"`);

      parsedTransports.push({
        site: "Google Flights",
        type: "FLIGHT",
        isReturn,
        tripType: isReturn ? "RETOUR" : "ALLER",
        numero,
        compagnie,
        date,
        depart: depTime,
        arrivee: arrTime,
        lieuDepart: lieuDep,
        lieuArrivee: lieuArr,
        duration: "",
        segments: []
      });
    }
  });

  const finalResult = { aller: null, retour: null };
  parsedTransports.forEach(t => {
    if (t.isReturn) { if (!finalResult.retour) finalResult.retour = t; }
    else            { if (!finalResult.aller)  finalResult.aller  = t; }
  });

  if (parsedTransports.length >= 2 && !finalResult.retour) {
    finalResult.aller  = parsedTransports[0];
    finalResult.retour = parsedTransports[1];
    finalResult.retour.isReturn = true;
    finalResult.retour.tripType = "RETOUR";
  }

  console.log("[Twobeevent GF] Résultat final :", finalResult);
  return finalResult;
}

// ─── DISPATCH ───
function extractAllDetails() {
  const url = window.location.href;
  const data = { hotel: null, aller: null, retour: null };
  try {
    if (url.includes("google.com/travel") || url.includes("google.com/flights")) {
      const r = extractGoogleFlights();
      data.aller  = r.aller;
      data.retour = r.retour;
    } else if (url.includes("booking.com")) {
      // Booking logic...
    }
  } catch(e) { console.error("[Twobeevent] Erreur:", e); }
  return data;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract") sendResponse(extractAllDetails());
  return true;
});
