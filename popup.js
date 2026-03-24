let API_URL = 'http://localhost:3000';

const siteBadge      = document.getElementById('siteBadge');
const emptyState     = document.getElementById('emptyState');
const dataContent    = document.getElementById('dataContent');
const previewSection = document.getElementById('previewSection');
const previewLabel   = document.getElementById('previewLabel');
const transportPrev  = document.getElementById('transportPreview');
const hotelPrev      = document.getElementById('hotelPreview');
const storageSummary = document.getElementById('storageSummary');
const allerVal       = document.getElementById('allerVal');
const retourVal      = document.getElementById('retourVal');
const captureBtn     = document.getElementById('captureBtn');
const sendBtn        = document.getElementById('sendBtn');
const resetBtn       = document.getElementById('resetBtn');
const statusMsg      = document.getElementById('statusMsg');
const pidInput       = document.getElementById('participantId');
const serverDot      = document.getElementById('serverDot');
const serverLabel    = document.getElementById('serverLabel');

// État accumulé entre les captures
let stored = { aller: null, retour: null, hotel: null };
// Ce qui vient d'être extrait de la page courante
let currentExtracted = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  chrome.storage.local.get(['twobeevent_pid', 'twobeevent_stored', 'twobeevent_api_url'], (res) => {
    if (res.twobeevent_pid)     pidInput.value = res.twobeevent_pid;
    if (res.twobeevent_api_url)  API_URL = res.twobeevent_api_url;
    if (res.twobeevent_stored)  stored = res.twobeevent_stored;
    refreshStorageSummary();
    checkSendReady();
  });

  pingServer();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';
  detectSite(url);

  if (isSupported(url)) {
    showContent();
    await extractFromTab(tab.id);
  } else {
    showEmpty();
  }
});

// ─── SITE DETECTION ──────────────────────────────────────────────────────────
function isSupported(url) {
  return url.includes('sncf-connect.com') || url.includes('google.com/travel') ||
    url.includes('booking.com') || url.includes('thetrainline.com');
}
function detectSite(url) {
  let label = '—', cls = 'unknown';
  if (url.includes('sncf-connect.com'))    { label = 'SNCF Connect'; cls = 'sncf'; }
  else if (url.includes('google.com/travel')) { label = 'Google Flights'; cls = 'flights'; }
  else if (url.includes('booking.com'))    { label = 'Booking.com'; cls = 'booking'; }
  else if (url.includes('thetrainline.com')) { label = 'Trainline'; cls = 'trainline'; }
  siteBadge.textContent = label;
  siteBadge.className = `site-badge ${cls}`;
}

// ─── EXTRACTION ──────────────────────────────────────────────────────────────
async function extractFromTab(tabId) {
  try {
    chrome.tabs.sendMessage(tabId, { action: 'extract' }, (response) => {
      if (chrome.runtime.lastError || !response) return;
      currentExtracted = response;
      renderPreview(response);
    });
  } catch(e) { console.error('[Popup] Extraction:', e); }
}

// ─── RENDU PREVIEW ───────────────────────────────────────────────────────────
function renderPreview(data) {
  transportPrev.innerHTML = '';
  hotelPrev.innerHTML     = '';

  const hasAller  = !!(data.aller);
  const hasRetour = !!(data.retour);
  const hasHotel  = !!(data.hotel);

  if (!hasAller && !hasRetour && !hasHotel) return;

  previewSection.style.display = 'block';

  // Label résumé
  const parts = [];
  if (hasAller)  parts.push('Aller');
  if (hasRetour) parts.push('Retour');
  if (hasHotel)  parts.push('Hôtel');
  previewLabel.textContent = `Extrait — ${parts.join(' + ')}`;

  // Cards transport
  if (hasAller)  transportPrev.innerHTML += buildTransportCard(data.aller,  'aller');
  if (hasRetour) transportPrev.innerHTML += buildTransportCard(data.retour, 'retour');

  // Card hôtel
  if (hasHotel) {
    const h = data.hotel;
    hotelPrev.innerHTML = `
      <div class="hotel-card">
        <div class="hotel-name">${esc(h.name)}</div>
        ${h.address ? `<div class="hotel-address">${esc(h.address)}</div>` : ''}
        <div class="hotel-meta">
          ${h.checkIn  ? `<span class="hotel-badge">Check-in ${h.checkIn}</span>`  : ''}
          ${h.checkOut ? `<span class="hotel-badge">Check-out ${h.checkOut}</span>` : ''}
          ${h.score    ? `<span class="hotel-badge">${esc(h.score)}</span>`  : ''}
          ${h.price    ? `<span class="hotel-badge">${esc(h.price)}</span>`  : ''}
        </div>
      </div>`;
  }
}

function buildTransportCard(t, direction) {
  if (!t) return '';
  const isRet    = direction === 'retour';
  const dotCls   = isRet ? 'dot-orange' : 'dot-blue';
  const trainCls = isRet ? 'orange' : 'blue';
  const segments = (t.segments && t.segments.length > 0) ? t.segments : buildFallbackSegments(t);

  let html = `<div class="trip-card">
    <div class="trip-header">
      <div class="trip-direction">
        <div class="dot ${dotCls}"></div>
        ${isRet ? 'Retour' : 'Aller'}
      </div>
      <span class="trip-date">${esc(t.date || '')}</span>
    </div>`;

  segments.forEach((seg, i) => {
    if (i > 0) {
      const corrDur = t.correspondanceDuree || '';
      html += `<div class="correspondance-label">
        <svg fill="none" viewBox="0 0 12 12" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 2v8M2 6l4-4 4 4"/>
        </svg>
        Correspondance à ${esc(seg.lieuDepart)}
        ${corrDur ? `<span class="corr-dur">${esc(corrDur)}</span>` : ''}
      </div>`;
    }
    html += `<div class="segment">`;
    if (seg.numero) {
      html += `<span class="segment-train ${trainCls}">${esc(seg.numero)}</span>`;
    }
    html += `<div class="segment-route">
      <div class="route-stop">
        <div class="route-time">${esc(seg.depart)}</div>
        <div class="route-city">${esc(seg.lieuDepart)}</div>
      </div>
      <div class="route-arrow">
        <div class="arrow-line"></div>
        ${seg.duree ? `<span class="arrow-duration">${esc(seg.duree)}</span>` : ''}
      </div>
      <div class="route-stop" style="text-align:right">
        <div class="route-time">${esc(seg.arrivee)}</div>
        <div class="route-city" style="text-align:right">${esc(seg.lieuArrivee)}</div>
      </div>
    </div></div>`;
  });

  html += `</div>`;
  return html;
}

function buildFallbackSegments(t) {
  if (t.correspondanceLieu) {
    return [
      { depart:t.depart, arrivee:t.correspondanceArrivee||'', lieuDepart:t.lieuDepart, lieuArrivee:t.correspondanceLieu, numero:t.numero, duree:'' },
      { depart:t.correspondanceHeure||'', arrivee:t.arrivee, lieuDepart:t.correspondanceLieu, lieuArrivee:t.lieuArrivee, numero:t.correspondanceNumero||'', duree:'' },
    ];
  }
  return [{ depart:t.depart, arrivee:t.arrivee, lieuDepart:t.lieuDepart, lieuArrivee:t.lieuArrivee, numero:t.numero, duree:t.duration||'' }];
}

// ─── STOCKAGE RÉSUMÉ ──────────────────────────────────────────────────────────
function refreshStorageSummary() {
  const has = !!(stored.aller || stored.retour || stored.hotel);
  storageSummary.style.display = has ? 'block' : 'none';
  allerVal.textContent  = stored.aller  ? `${stored.aller.lieuDepart} → ${stored.aller.lieuArrivee}`   : '—';
  retourVal.textContent = stored.retour ? `${stored.retour.lieuDepart} → ${stored.retour.lieuArrivee}` : '—';
  resetBtn.style.display = has ? 'flex' : 'none';
  checkSendReady();
}

function checkSendReady() {
  const pid = pidInput.value.trim();
  const has = !!(stored.aller || stored.retour || stored.hotel);
  sendBtn.disabled = !(has && pid);
}

// ─── CAPTURE ──────────────────────────────────────────────────────────────────
captureBtn.addEventListener('click', () => {
  if (!currentExtracted) { showStatus('Rien à capturer sur cette page.', 'error'); return; }

  const { aller, retour, hotel } = currentExtracted;
  let captured = [];

  if (aller)  { stored.aller  = aller;  captured.push('Aller');  }
  if (retour) { stored.retour = retour; captured.push('Retour'); }
  if (hotel)  { stored.hotel  = hotel;  captured.push('Hôtel');  }

  if (captured.length === 0) { showStatus('Données vides, rien capturé.', 'error'); return; }

  chrome.storage.local.set({ twobeevent_stored: stored });
  refreshStorageSummary();
  showStatus(`Capturé : ${captured.join(' + ')}`, 'success');
});

// ─── ENVOI ────────────────────────────────────────────────────────────────────
sendBtn.addEventListener('click', async () => {
  const pid = pidInput.value.trim();
  if (!pid) { showStatus("Collez l'ID du participant.", 'error'); return; }

  sendBtn.disabled = true;
  sendBtn.innerHTML = `<div class="spinner"></div> Envoi…`;
  showStatus('Envoi en cours…', 'loading');

  const payload = {
    participantId: pid,
    hotel: stored.hotel || null,
    transport: {
      aller:          stored.aller  || null,
      retour:         stored.retour || null,
      segmentsAller:  stored.aller?.segments  || [],
      segmentsRetour: stored.retour?.segments || [],
    }
  };

  try {
    const res = await fetch(`${API_URL}/api/logistique/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showStatus('Envoyé avec succès vers LogiCongrès !', 'success');
      stored = { aller: null, retour: null, hotel: null };
      chrome.storage.local.remove('twobeevent_stored');
      refreshStorageSummary();
    } else {
      const err = await res.json();
      showStatus(`Erreur : ${err.error || res.statusText}`, 'error');
    }
  } catch(e) {
    showStatus('Serveur inaccessible (localhost:3000)', 'error');
  } finally {
    sendBtn.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> Envoyer vers LogiCongrès`;
    checkSendReady();
  }
});

// ─── RESET ────────────────────────────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
  stored = { aller: null, retour: null, hotel: null };
  chrome.storage.local.remove('twobeevent_stored');
  refreshStorageSummary();
  showStatus('Mémoire effacée.', 'success');
});
document.getElementById('clearAller').addEventListener('click', () => {
  stored.aller = null;
  chrome.storage.local.set({ twobeevent_stored: stored });
  refreshStorageSummary();
});
document.getElementById('clearRetour').addEventListener('click', () => {
  stored.retour = null;
  chrome.storage.local.set({ twobeevent_stored: stored });
  refreshStorageSummary();
});

// ─── PID ──────────────────────────────────────────────────────────────────────
pidInput.addEventListener('input', () => {
  chrome.storage.local.set({ twobeevent_pid: pidInput.value.trim() });
  checkSendReady();
});

// ─── PING SERVEUR ─────────────────────────────────────────────────────────────
async function pingServer() {
  try {
    const res = await fetch(`${API_URL}/api/hello`, { method: 'GET' });
    if (res.ok) { serverDot.classList.add('online'); serverLabel.textContent = 'Connecté'; }
    else        { serverDot.classList.remove('online'); serverLabel.textContent = 'Hors ligne'; }
  } catch { serverDot.classList.remove('online'); serverLabel.textContent = 'Hors ligne'; }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function showEmpty()   { emptyState.style.display='block';  dataContent.style.display='none';  }
function showContent() { emptyState.style.display='none';   dataContent.style.display='block'; }
function showStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className = `status ${type}`;
  if (type === 'success') setTimeout(() => { statusMsg.className = 'status'; }, 3500);
}
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
