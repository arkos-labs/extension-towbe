// content.js — Twobeevent Capture v2.2.1
console.error("!!! [Twobeevent] SCRIPT INJECTE SUR", window.location.hostname, "!!!");
console.log("[Twobeevent] Content script charg\u00e9.");

// --- Capture automatique des IDs Twobeevent depuis l'URL ---
const urlParams = new URLSearchParams(window.location.search);
const twbParticipantId = urlParams.get('twobeevent_participant_id');
const twbApiUrl = urlParams.get('twobeevent_api_url');

if (twbParticipantId || twbApiUrl) {
  const toSave = {};
  if (twbParticipantId) toSave.twobeevent_pid = twbParticipantId;
  if (twbApiUrl) toSave.twobeevent_api_url = twbApiUrl;
  chrome.storage.local.set(toSave, () => {
    console.log("[Twobeevent] ID Participant capturé via URL :", twbParticipantId);
  });
}

// --- D\u00e9tection dynamique sur le portail (localhost:3000) ---
const checkPortalId = () => {
    const activePid = document.body.getAttribute('data-twb-active-pid');
    if (activePid) {
      chrome.storage.local.set({ twobeevent_pid: activePid }, () => {
        console.log("[Twobeevent] ID Participant synchronis\u00e9 :", activePid);
      });
    }
};

if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.port === "3000") {
  console.log("[Twobeevent] Mode Portail activ\u00e9");
  // V\u00e9rification initiale
  checkPortalId();
  // Observer les changements
  const observer = new MutationObserver(checkPortalId);
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-twb-active-pid'] });
}

const BLACKLIST_PATTERNS = [
  /^dur[eé]e/i, /^trajet/i, /^correspondance/i, /^accueil/i,
  /^ouverture/i, /^fermeture/i, /^embarquement/i, /^placement/i,
  /^voiture/i, /^place\s+\d/i, /^restauration/i, /^wifi/i,
  /^espace/i, /^prise/i, /^toilettes/i, /^co2/i,
  /^\d+[.,]\d+\s*kg/i, /^opéré/i, /^une\s+réservation/i,
  /^2de\s+classe/i, /^seconde\s+classe/i, /^1[eè]re\s+classe/i,
  /^classe/i, /^banquette/i, /^couloir/i, /^fenêtre/i,
  /^duo/i, /^club/i, /^salle/i, /^\*/, /^ce\s+trajet/i,
  /^voir/i, /^modifier/i, /^\d+h\d*\s*(min)?$/i, /^\d+\s*min$/i,
  /^prix/i, /^tarif/i, /^billet/i, /^jusqu['']/i,
  /^avant\s+le/i, /^minutes?\s+avant/i, /^émis/i,
  /^pour\s+cet/i, /^itinéraire/i, /^en\s+détail/i,
];

const isBlacklisted = (s) => BLACKLIST_PATTERNS.some(r => r.test(s.trim()));
const isTime = (s) => /^\d{1,2}:\d{2}$/.test(s.trim());

function cleanStation(raw) {
  if (!raw) return "";
  let s = raw.split('\n')[0].trim();
  s = s.replace(/^(TGV INOUI|OUIGO|TER|INTERCITÉS?|TGV|Bus|Ligne|Train\s+li[Oo]|Train\s+Rémi\s+Exp|INTERCITES|Flixbus)\s*/i, "");
  s = s.replace(/durée.*$/i, "");
  s = s.replace(/\d{2}:\d{2}$/, "");
  s = s.replace(/\s+/g, ' ').trim();
  if (isBlacklisted(s) || s.length < 2) return "";
  return s;
}

function extractTrainNumbers(text) {
  const matches = text.match(
    /(OUIGO\s*\d+|TGV\s+INOUI\s*\d+|INTERCITÉS?\s*\d+|TER\s*\d+|Train\s+li[Oo]\s*\d+|Train\s+Rémi\s+Exp\s*\d+|INTERCITES\s*\d+)/gi
  ) || [];
  return matches.map(m => m.replace(/\s+/g, ' ').trim());
}

// ─── Parse un bloc de texte (aller OU retour) ────────────────────────────────
function parseBloc(blocText, isReturn) {
  // Date
  const dateMatch = blocText.match(/((?:Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\.?\s+\d+\s+\w+)/i);
  const cleanDate = dateMatch ? dateMatch[1].trim() : "";

  // Numéros de trains
  const trainNumbers = extractTrainNumbers(blocText);

  // Durée totale
  const durMatch = blocText.match(/Durée\s+du\s+trajet\s*\n\s*(\d+h\d+|\d+\s*h\s*\d+)/i);
  const totalDuration = durMatch ? durMatch[1].replace(/\s+/g, '') : "";

  // Classe
  const classeMatch = blocText.match(/(1[eè]re|2de|Seconde)\s+classe/i);
  const classe = classeMatch
    ? (classeMatch[1].toLowerCase().startsWith('1') ? '1ère classe' : '2de classe')
    : '2de classe';

  // Placement
  const placementMatch = blocText.match(/(Placement\s+libre|Fenêtre|Couloir|Duo|Place\s+isolée|Banquette|Club|Salle\s+haute|Salle\s+basse)/i);
  const placement = placementMatch ? placementMatch[0] : "";

  // Voiture / Place
  const voitureMatch = blocText.match(/Voiture\s+(\d+)/i);
  const placeMatch   = blocText.match(/Place\s+(\d+)/i);

  // Correspondance durée
  const corrMatch = blocText.match(/Correspondance\s*[-–]?\s*(?:Durée\s+du\s+trajet\s*\n\s*)?(\d+h\d*|\d+\s*min|\d+\s*h\s*\d+)/i);
  const corrDuree = corrMatch ? corrMatch[1].trim() : "";

  // ── Parser les stops ──
  const lines = blocText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Identifier les horaires d'accueil/embarquement à ignorer
  const embarquementIndexes = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (/ouverture|accueil|embarquement/i.test(lines[i])) {
      for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
        if (isTime(lines[k])) { embarquementIndexes.add(k); break; }
      }
    }
  }

  const stops = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isTime(lines[i])) continue;
    if (embarquementIndexes.has(i)) continue;

    let stationName = "";
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      if (isTime(lines[j])) break;
      const candidate = cleanStation(lines[j]);
      if (candidate && candidate.length > 1) {
        stationName = candidate;
        break;
      }
    }
    if (stationName) {
      stops.push({ time: lines[i].trim(), name: stationName });
    }
  }

  // Dédupliquer gares consécutives identiques
  const deduped = [];
  for (let i = 0; i < stops.length; i++) {
    if (i === 0 || stops[i].name.toLowerCase() !== stops[i - 1].name.toLowerCase()) {
      deduped.push(stops[i]);
    }
  }

  console.log("[Twobeevent] Stops bloc", isReturn ? "RETOUR" : "ALLER", ":", deduped);
  if (deduped.length < 2) return null;

  // ── Construire segments ──
  const segments = [];
  const hasCorr = deduped.length >= 3;

  if (!hasCorr) {
    segments.push({
      depart: deduped[0].time, arrivee: deduped[1].time,
      lieuDepart: deduped[0].name, lieuArrivee: deduped[1].name,
      numero: trainNumbers[0] || "", duree: totalDuration,
    });
  } else {
    const mid    = deduped[1];
    const finale = deduped[deduped.length - 1];
    segments.push({
      depart: deduped[0].time, arrivee: mid.time,
      lieuDepart: deduped[0].name, lieuArrivee: mid.name,
      numero: trainNumbers[0] || "", duree: "",
    });
    const departCorr = deduped.length >= 4 ? deduped[2] : mid;
    segments.push({
      depart: departCorr.time, arrivee: finale.time,
      lieuDepart: mid.name, lieuArrivee: finale.name,
      numero: trainNumbers[1] || "", duree: "",
    });
  }

  const first = segments[0];
  const last  = segments[segments.length - 1];

  return {
    site: "SNCF Connect", type: "TRAIN", isReturn,
    tripType: isReturn ? "RETOUR" : "ALLER",
    numero: first.numero, date: cleanDate,
    depart: first.depart, arrivee: last.arrivee,
    lieuDepart: first.lieuDepart, lieuArrivee: last.lieuArrivee,
    duration: totalDuration, classe, placement,
    voiture: voitureMatch ? voitureMatch[1] : "",
    place:   placeMatch   ? placeMatch[1]   : "",
    correspondanceLieu:    hasCorr ? segments[0].lieuArrivee : "",
    correspondanceArrivee: hasCorr ? segments[0].arrivee     : "",
    correspondanceHeure:   hasCorr ? segments[1].depart      : "",
    correspondanceNumero:  hasCorr ? segments[1].numero      : "",
    correspondanceDuree:   corrDuree,
    segments,
  };
}

// ─── SNCF — sépare le texte en blocs Aller / Retour ─────────────────────────
function extractSNCF() {
  const panel = document.querySelector('[role="dialog"]') || document.querySelector('aside') || document.body;
  const fullText = panel.innerText;

  // Chercher les marqueurs "Aller :" et "Retour :" dans le texte
  // Pattern SNCF : "Aller : Dim. 22 mars 18:10" ou "Retour : Mer. 22 avr. 06:02"
  const allerIdx  = fullText.search(/^Aller\s*:/im);
  const retourIdx = fullText.search(/^Retour\s*:/im);

  let allerBloc  = null;
  let retourBloc = null;

  if (allerIdx !== -1 && retourIdx !== -1) {
    // Les deux blocs sont présents sur la page
    allerBloc  = fullText.substring(allerIdx, retourIdx);
    retourBloc = fullText.substring(retourIdx);
    console.log("[Twobeevent] Blocs Aller + Retour détectés");
  } else if (allerIdx !== -1) {
    allerBloc = fullText.substring(allerIdx);
    console.log("[Twobeevent] Bloc Aller uniquement");
  } else if (retourIdx !== -1) {
    retourBloc = fullText.substring(retourIdx);
    console.log("[Twobeevent] Bloc Retour uniquement");
  } else {
    // Fallback : pas de marqueur → on traite tout le texte
    // Détecter si c'est un retour via le contenu
    const isReturn = fullText.toLowerCase().includes('retour') ||
      !!document.querySelector('[aria-label^="Retour"]');
    const result = parseBloc(fullText, isReturn);
    return result ? { aller: isReturn ? null : result, retour: isReturn ? result : null } : { aller: null, retour: null };
  }

  return {
    aller:  allerBloc  ? parseBloc(allerBloc,  false) : null,
    retour: retourBloc ? parseBloc(retourBloc, true)  : null,
  };
}

// ─── GOOGLE FLIGHTS ──────────────────────────────────────────────────────────
function extractGoogleFlights() {
  const text = document.body.innerText;
  const flightMatch = text.match(/\b([A-Z]{2}\s?\d{3,4})\b/);
  const flightNumber = flightMatch ? flightMatch[1].replace(/\s/g, '') : "";
  const times = text.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)?\b/gi) || [];
  const cleanTime = (t) => {
    const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return t;
    let h = parseInt(m[1]);
    const period = m[3]?.toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  };
  const airports = text.match(/\b([A-Z]{3})\b/g)?.filter(a =>
    !['AM','PM','THE','FOR','AND','NOT','EUR','USD','KG'].includes(a)) || [];
  const durMatch = text.match(/(\d+)\s*h\s*(\d+)\s*min/);
  const duration = durMatch ? `${durMatch[1]}h${durMatch[2]}` : "";
  const dateMatch = text.match(/((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\.?\s+\w+\.?\s+\d+)/i);
  const isReturn = window.location.href.includes('return');
  const transport = {
    site:"Google Flights", type:"FLIGHT", isReturn, tripType: isReturn?"RETOUR":"ALLER",
    numero:flightNumber, date:dateMatch?dateMatch[1]:"",
    depart:times.length>0?cleanTime(times[0]):"", arrivee:times.length>1?cleanTime(times[1]):"",
    lieuDepart:airports[0]||"", lieuArrivee:airports[1]||"",
    duration, classe:"Économique", placement:"", voiture:"", place:"",
    correspondanceLieu:"", correspondanceArrivee:"", correspondanceHeure:"",
    correspondanceNumero:"", correspondanceDuree:"", segments:[],
  };
  return { aller: isReturn ? null : transport, retour: isReturn ? transport : null };
}

// ─── BOOKING.COM ─────────────────────────────────────────────────────────────
function extractBooking() {
  const nameEl = document.querySelector('h2[data-testid="title"]') ||
    document.querySelector('.hp__hotel-name') || document.querySelector('h1');
  const hotelName = nameEl?.innerText?.trim() || document.title.split('–')[0].trim();
  const addressEl = document.querySelector('[data-testid="address"]') || document.querySelector('.hp_address_subtitle');
  const address = addressEl?.innerText?.trim() || "";
  const scoreEl = document.querySelector('[data-testid="review-score-right-component"]') || document.querySelector('.bui-review-score__badge');
  const score = scoreEl?.innerText?.trim() || "";
  const priceEl = document.querySelector('[data-testid="price-and-book"] .bui-price-display__value') ||
    document.querySelector('.bui-price-display__value');
  const price = priceEl?.innerText?.trim() || "";
  const checkinMatch  = window.location.href.match(/checkin=(\d{4}-\d{2}-\d{2})/);
  const checkoutMatch = window.location.href.match(/checkout=(\d{4}-\d{2}-\d{2})/);
  return { site:"Booking.com", name:hotelName, address, score, price,
    checkIn:checkinMatch?checkinMatch[1]:"", checkOut:checkoutMatch?checkoutMatch[1]:"" };
}

// ─── TRAINLINE ───────────────────────────────────────────────────────────────
function extractTrainline() {
  const text = document.body.innerText;
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const emIdx = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (/ouverture|accueil|embarquement/i.test(lines[i])) {
      for (let k = i-1; k >= Math.max(0,i-3); k--) { if (isTime(lines[k])) { emIdx.add(k); break; } }
    }
  }
  const stops = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isTime(lines[i]) || emIdx.has(i)) continue;
    let name = "";
    for (let j = i+1; j < Math.min(i+5,lines.length); j++) {
      if (isTime(lines[j])) break;
      const c = cleanStation(lines[j]);
      if (c && c.length>1) { name = c; break; }
    }
    if (name) stops.push({ time:lines[i].trim(), name });
  }
  const deduped = [];
  for (let i = 0; i < stops.length; i++) {
    if (i===0 || stops[i].name.toLowerCase() !== stops[i-1].name.toLowerCase()) deduped.push(stops[i]);
  }
  if (deduped.length < 2) return { aller: null, retour: null };
  const trainNumbers = extractTrainNumbers(text);
  const durMatch = text.match(/(\d+h\d+|\d+\s*h\s*\d+\s*min)/i);
  const duration = durMatch ? durMatch[1].replace(/\s/g,'') : "";
  const dateMatch = text.match(/((?:Lun|Mar|Mer|Jeu|Ven|Sam|Dim|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.?\s+\d+\s+\w+)/i);
  const isReturn = window.location.href.toLowerCase().includes('inward');
  const hasCorr = deduped.length >= 3;
  const segments = !hasCorr
    ? [{ depart:deduped[0].time, arrivee:deduped[1].time, lieuDepart:deduped[0].name, lieuArrivee:deduped[1].name, numero:trainNumbers[0]||"", duree:duration }]
    : [
        { depart:deduped[0].time, arrivee:deduped[1].time, lieuDepart:deduped[0].name, lieuArrivee:deduped[1].name, numero:trainNumbers[0]||"", duree:"" },
        { depart:deduped[deduped.length-2].time, arrivee:deduped[deduped.length-1].time, lieuDepart:deduped[1].name, lieuArrivee:deduped[deduped.length-1].name, numero:trainNumbers[1]||"", duree:"" },
      ];
  const first = segments[0], last = segments[segments.length-1];
  const t = {
    site:"Trainline", type:"TRAIN", isReturn, tripType:isReturn?"RETOUR":"ALLER",
    numero:first.numero, date:dateMatch?dateMatch[1]:"",
    depart:first.depart, arrivee:last.arrivee,
    lieuDepart:first.lieuDepart, lieuArrivee:last.lieuArrivee,
    duration, classe:"2de classe", placement:"", voiture:"", place:"",
    correspondanceLieu: hasCorr?segments[0].lieuArrivee:"", correspondanceArrivee:hasCorr?segments[0].arrivee:"",
    correspondanceHeure:hasCorr?segments[1].depart:"", correspondanceNumero:hasCorr?segments[1].numero:"", correspondanceDuree:"",
    segments,
  };
  return { aller: isReturn ? null : t, retour: isReturn ? t : null };
}

// ─── DISPATCH PRINCIPAL ──────────────────────────────────────────────────────
// Retourne toujours { aller, retour, hotel }
function extractAllDetails() {
  const url  = window.location.href;
  const data = { hotel: null, aller: null, retour: null };
  try {
    if (url.includes("sncf-connect.com")) {
      const result = extractSNCF();
      data.aller  = result.aller;
      data.retour = result.retour;
    } else if (url.includes("google.com/travel")) {
      const result = extractGoogleFlights();
      data.aller  = result.aller;
      data.retour = result.retour;
    } else if (url.includes("booking.com")) {
      data.hotel = extractBooking();
    } else if (url.includes("thetrainline.com")) {
      const result = extractTrainline();
      data.aller  = result.aller;
      data.retour = result.retour;
    }
  } catch(e) { console.error("[Twobeevent] Erreur:", e); }

  console.log("[Twobeevent] Résultat final:", data);
  return data;
}

// ─── LISTENER ────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract") {
    sendResponse(extractAllDetails());
  }
  return true;
});
