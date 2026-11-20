/* =====================================================================
 * app.js — Interface interactive SVG
 * MicroWave, BLR & VSAT Lab
 *
 * Contenu :
 *   1. Catalogue des équipements (valeurs par défaut, catégories)
 *   2. État de l'application, historique (annuler / rétablir)
 *   3. Règles de raccordement (déduction automatique du type de lien)
 *   4. Moteur de simulation : FH, BLR, VSAT → état des liens → réseau IP
 *   5. Rendu SVG du canevas (segment spatial / terrestre, liens, faisceaux)
 *   6. Interactions (glisser-déposer, outils, zoom, clavier)
 *   7. Inspecteur : paramètres, bilan pas à pas, profil Fresnel, réseau
 *   8. Console, journal, flux de trafic, animation des paquets
 *   9. Fichiers (JSON), export SVG, TP & documentation, API pour labs.js
 *
 * Dépend de : radio_physics.js, sat_physics.js, ip_network.js (et labs.js
 * si présent). Script classique : fonctionne en double-clic (file://).
 * ===================================================================== */
(function (root) {
  'use strict';

  const MBV = (root.MBV = root.MBV || {});
  const U = MBV.Util;
  const RP = MBV.RadioPhysics;
  const SP = MBV.SatPhysics;
  const NET = MBV.IpNetwork;
  if (!U || !RP || !SP || !NET) {
    document.body.innerHTML = '<div class="noscript">Fichiers moteurs manquants (radio_physics.js, sat_physics.js, ip_network.js).</div>';
    return;
  }

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const SVGNS = 'http://www.w3.org/2000/svg';
  const fmt = U.fmt;
  const esc = (s) =>
    String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  /* ------------------------------------------------------------------
   * 1. CONSTANTES & CATALOGUE
   * ------------------------------------------------------------------ */
  /** Version de l'application (edition.js) : enseignant (complète) ou élève (paquet sans corrigés). */
  const TEACHER = !(MBV.Edition && MBV.Edition.role === 'eleve');
  const GRID = 50; // px monde par carreau
  const HORIZON_Y = 260; // séparation espace / sol
  const GROUND_MIN_Y = 310;
  const ORBIT_Y = { GEO: 60, MEO: 130, LEO: 200 };
  const REF = { lat: 12.37, lon: -1.53 }; // Ouagadougou : origine du plan
  const C_KM_MS = 299.792458; // km par ms
  const MAST_PX_PER_M = 0.9; // longueur du mât dessiné au-dessus d'un pylône (px par mètre)
  const OBST_PX_PER_M = 0.35; // jauge de hauteur d'un obstacle (px par mètre)
  const FLOOR_PX = 4; // jauge d'un immeuble (px par étage)
  const TOWER_MIN_M = 15; // hauteur minimale d'un pylône (m)
  const TOWER_MAX_M = 150; // hauteur maximale d'un pylône (m)
  const STATUS_RANK = { optimal: 0, degraded: 1, down: 2 };
  const SITE_TYPES = ['tower', 'building', 'obstacle'];
  const MOUNTABLE = ['antenna', 'odu', 'fullOutdoor', 'blrBts', 'blrCpe', 'vsatAntenna', 'buc', 'lnb'];
  const ENDPOINT_TYPES = ['gnodeb', 'ruralSite', 'bankAgency', 'pc', 'server', 'internet'];
  const RADIO_MEDIA = ['fh', 'blr', 'vsat'];

  const CATALOG = {
    tower: { label: 'Pylône', cat: 'site', size: 48, defaults: { groundM: 300, heightM: 40 } },
    building: { label: 'Immeuble', cat: 'site', size: 48, defaults: { groundM: 300, floors: 8 } },
    obstacle: { label: 'Obstacle', cat: 'site', size: 44, defaults: { kind: 'hill', heightM: 60, widthKm: 2 } },
    idu: { label: 'IDU', cat: 'fh', size: 40, defaults: { acm: true, maxMod: '256QAM', xpic: false, vlans: 'all' } },
    odu: { label: 'ODU', cat: 'fh', size: 38, defaults: { band: '18', txPowerDbm: 20, channelMHz: 28, lossDb: 0.5, channelNo: 1, txHalf: 'auto' } },
    fullOutdoor: {
      label: 'Full-Outdoor',
      cat: 'fh',
      size: 40,
      defaults: { band: '23', txPowerDbm: 18, channelMHz: 56, diameterM: 0.6, polarization: 'V', acm: true, maxMod: '512QAM', xpic: false, uplink: 'rj45', vlans: 'all', heightM: 30, azErrDeg: 0, channelNo: 1, txHalf: 'auto' },
    },
    antenna: { label: 'Antenne FH', cat: 'fh', size: 38, defaults: { diameterM: 0.6, polarization: 'V', heightM: 35, azErrDeg: 0 } },
    blrBts: {
      label: 'BTS BLR',
      cat: 'blr',
      size: 42,
      defaults: { band: '3.5', channelMHz: 20, txPowerDbm: 30, sectorDeg: 90, azimuthDeg: 90, heightM: 30, acm: true, maxMod: '256QAM 5/6', vlans: 'all' },
    },
    blrCpe: { label: 'CPE', cat: 'blr', size: 38, defaults: { install: 'outdoor', txPowerDbm: 23, heightM: 12, accessVlan: 0, azErrDeg: 0, wallLossDb: 12 } },
    satellite: { label: 'Satellite', cat: 'vsat', size: 46, defaults: { orbit: 'GEO', band: 'Ku', lonDeg: 7, elevationDeg: 60, outputBackoffDb: 1, motion: 'fixed', satsPerPlane: 24, passMaxElevDeg: 75 } },
    hub: {
      label: 'Hub',
      cat: 'vsat',
      size: 46,
      defaults: { dishM: 7.3, hpaW: 200, lnbNfDb: 0.6, coordMode: 'plan', lat: REF.lat, lon: REF.lon, groundM: 300, fwdSymbolRate: 30, fwdMaxModcod: '32APSK 9/10', localRain: false, vlans: 'all' },
    },
    vsatAntenna: {
      label: 'Antenne VSAT',
      cat: 'vsat',
      size: 40,
      defaults: { dishM: 1.8, coordMode: 'plan', lat: REF.lat, lon: REF.lon, groundM: 300, autoPoint: true, azimuthDeg: 0, elevationDeg: 0, skewDeg: 0 },
    },
    buc: { label: 'BUC', cat: 'vsat', size: 34, defaults: { powerW: 4 } },
    lnb: { label: 'LNB', cat: 'vsat', size: 34, defaults: { nfDb: 0.8 } },
    vsatModem: { label: 'Modem VSAT', cat: 'vsat', size: 40, defaults: { retSymbolRate: 2, retMaxModcod: '8PSK 3/4', acm: true, accessVlan: 0, vlans: 'all' } },
    router: { label: 'Routeur', cat: 'ip', size: 44, defaults: { loopback: '', mpls: true, frr: true, interVlan: true, vlans: 'all' } },
    switch: { label: 'Switch', cat: 'ip', size: 42, defaults: { vlans: 'all', erps: false, rplOwner: false, l3: false } },
    gnodeb: { label: 'BTS/gNodeB', cat: 'ip', size: 42, defaults: { ip: '', prefix: 24, gateway: '', vlan: 0 } },
    ruralSite: { label: 'Site rural', cat: 'ip', size: 42, defaults: { ip: '', prefix: 24, gateway: '', vlan: 0 } },
    bankAgency: { label: 'Agence', cat: 'ip', size: 42, defaults: { ip: '', prefix: 24, gateway: '', vlan: 0 } },
    pc: { label: 'PC', cat: 'ip', size: 38, defaults: { ip: '', prefix: 24, gateway: '', vlan: 0 } },
    server: { label: 'Serveur', cat: 'ip', size: 40, defaults: { ip: '', prefix: 24, gateway: '', vlan: 0 } },
    internet: { label: 'Internet', cat: 'ip', size: 46, defaults: { ip: '', prefix: 24, gateway: '', vlan: 0 } },
  };

  const MEDIUM_LABEL = {
    ethernet: 'Câble Ethernet (RJ45)',
    fiber: 'Fibre optique',
    if: 'Câble IF / montage direct',
    coax: 'Câble coaxial (bande L)',
    fh: 'Faisceau hertzien',
    blr: 'Liaison BLR (PMP)',
    vsat: 'Liaison satellite',
  };
  const CLS_LABEL = { voice: 'Voix', video: 'Vidéo', data: 'Données' };

  /* ------------------------------------------------------------------
   * 2. ÉTAT
   * ------------------------------------------------------------------ */
  const S = {
    topo: emptyTopology(),
    view: { x: 40, y: 10, k: 1 },
    mode: 'design',
    tool: 'select',
    armedType: null,
    selection: null, // { kind: 'node' | 'link', id }
    selectedFlow: null,
    pending: null,
    analysis: null,
    engine: null,
    prevLinkStatus: new Map(),
    history: [],
    future: [],
    anim: true,
    packets: [],
    lastSpawn: new Map(),
    flowPolylines: new Map(),
    budgetDir: 'ab',
    satDir: 'fwd',
    lab: null,
    labStep: 0,
    stormTimer: null,
    pointer: null,
    stats: {},
    actTab: 'tp',
    examActive: false,
    locked: false, // examen pratique : topologie verrouillée (réglages et interventions seulement)
    sim: { t: 0, playing: false, speed: 60, lastRecompute: 0 },
    satTrack: {},
    satHist: {},
    satVis: {},
    renderQueued: false,
    computeQueued: false,
  };

  /** Compte une action de l'utilisateur (vérifiée par les tutoriels). */
  function stat(key) {
    S.stats[key] = (S.stats[key] || 0) + 1;
    if (S.lab) setTimeout(evaluateLab, 0);
  }

  function emptyTopology() {
    return {
      nodes: [],
      links: [],
      flows: [],
      settings: { title: 'Topologie sans titre', scaleKm: 2, rainMmH: 0, refLat: REF.lat, refLon: REF.lon, labId: null },
    };
  }

  const kmPerPx = () => num(S.topo.settings.scaleKm, 2) / GRID;
  const nodeById = (id) => S.topo.nodes.find((n) => n.id === id);
  const linkById = (id) => S.topo.links.find((l) => l.id === id);
  const catOf = (n) => (CATALOG[n.type] ? CATALOG[n.type].cat : 'ip');
  const sizeOf = (n) => (CATALOG[n.type] ? CATALOG[n.type].size : 40) * (n.props && n.props.siteId ? 0.9 : 1);
  const isEndpoint = (n) => ENDPOINT_TYPES.includes(n.type);
  const isSite = (n) => SITE_TYPES.includes(n.type);

  function ensureDefaults(n) {
    const def = CATALOG[n.type] ? CATALOG[n.type].defaults : {};
    n.props = Object.assign({}, JSON.parse(JSON.stringify(def)), n.props || {});
    if (!n.name) n.name = nextName(n.type);
    return n;
  }

  function nextName(type) {
    const base = CATALOG[type] ? CATALOG[type].label : type;
    let i = 1;
    const names = new Set(S.topo.nodes.map((n) => n.name));
    while (names.has(base + ' ' + i)) i++;
    return base + ' ' + i;
  }

  function nextIp() {
    const used = new Set(S.topo.nodes.map((n) => n.props && n.props.ip).filter(Boolean));
    for (let i = 10; i < 250; i++) {
      const ip = '10.0.0.' + i;
      if (!used.has(ip)) return ip;
    }
    return '10.0.1.10';
  }

  /* --- Historique --- */
  function serialize() {
    return {
      format: 'mbv-lab',
      version: 1,
      settings: JSON.parse(JSON.stringify(S.topo.settings)),
      nodes: S.topo.nodes.map((n) => ({ id: n.id, type: n.type, name: n.name, x: Math.round(n.x * 10) / 10, y: Math.round(n.y * 10) / 10, props: JSON.parse(JSON.stringify(n.props)) })),
      links: S.topo.links.map((l) => ({ id: l.id, a: l.a, b: l.b, medium: l.medium, props: JSON.parse(JSON.stringify(l.props || {})) })),
      flows: JSON.parse(JSON.stringify(S.topo.flows)),
    };
  }
  /** Topologie verrouillée (examen pratique) : affiche un message et renvoie true. */
  function lockedMsg() {
    if (!S.locked) return false;
    toast('Examen pratique : la topologie est verrouillée. Seuls les réglages et les interventions sont permis.', 'warn');
    return true;
  }
  function pushHistory() {
    S.history.push(JSON.stringify(serialize()));
    if (S.history.length > 60) S.history.shift();
    S.future = [];
  }
  function undo() {
    if (lockedMsg()) return;
    if (!S.history.length) return toast('Rien à annuler.', 'info');
    stat('undo');
    S.future.push(JSON.stringify(serialize()));
    loadTopology(JSON.parse(S.history.pop()), { keepView: true, silent: true });
  }
  function redo() {
    if (lockedMsg()) return;
    if (!S.future.length) return toast('Rien à rétablir.', 'info');
    S.history.push(JSON.stringify(serialize()));
    loadTopology(JSON.parse(S.future.pop()), { keepView: true, silent: true });
  }

  /* ------------------------------------------------------------------
   * 3. GÉOMÉTRIE & RACCORDEMENTS
   * ------------------------------------------------------------------ */
  function siteOf(n) {
    return n && n.props && n.props.siteId ? nodeById(n.props.siteId) : null;
  }
  function anchorOf(n) {
    return siteOf(n) || n;
  }
  function siteHeightM(site) {
    if (!site) return 0;
    if (site.type === 'tower') return num(site.props.heightM, 40);
    if (site.type === 'building') return (num(site.props.floors, 8) + 1) * 3;
    return 0;
  }
  function groundOf(n) {
    const s = siteOf(n);
    if (s) return num(s.props.groundM, 300);
    return num(n.props.groundM, 300);
  }
  function heightOf(n) {
    const s = siteOf(n);
    let h = num(n.props.heightM, 10);
    if (s && s.type === 'tower') h = Math.min(h, siteHeightM(s));
    if (s && s.type === 'building') h = Math.min(h, siteHeightM(s) + 10);
    return Math.max(1, h);
  }
  function distKm(a, b) {
    const pa = anchorOf(a);
    const pb = anchorOf(b);
    return Math.max(0.05, Math.hypot(pb.x - pa.x, pb.y - pa.y) * kmPerPx());
  }
  function bearingDeg(a, b) {
    const pa = anchorOf(a);
    const pb = anchorOf(b);
    return U.bearingDeg({ x: pa.x, y: pa.y }, { x: pb.x, y: pb.y });
  }
  /** Coordonnées géographiques d'une station (depuis le plan ou saisies). */
  function geoOf(n) {
    if (n.props.coordMode === 'manual') return { lat: num(n.props.lat, REF.lat), lon: num(n.props.lon, REF.lon) };
    const a = anchorOf(n);
    const st = S.topo.settings;
    const lat = num(st.refLat, REF.lat) - ((a.y - HORIZON_Y) * kmPerPx()) / 111.32;
    const lon = num(st.refLon, REF.lon) + (a.x * kmPerPx()) / (111.32 * Math.cos(U.deg2rad(lat)));
    return { lat, lon };
  }
  function neighbors(n, media) {
    const out = [];
    for (const l of S.topo.links) {
      if (media && !media.includes(l.medium)) continue;
      if (l.a === n.id) out.push({ link: l, node: nodeById(l.b) });
      else if (l.b === n.id) out.push({ link: l, node: nodeById(l.a) });
    }
    return out.filter((x) => x.node);
  }
  function neighborOfType(n, type, media) {
    const x = neighbors(n, media).find((v) => v.node.type === type);
    return x ? x.node : null;
  }
  function radioLinksOf(n) {
    return S.topo.links.filter((l) => RADIO_MEDIA.includes(l.medium) && (l.a === n.id || l.b === n.id));
  }

  /** Décide du type de lien entre deux équipements, ou renvoie une erreur pédagogique. */
  function decideMedium(na, nb) {
    const ta = na.type;
    const tb = nb.type;
    const has = (t) => ta === t || tb === t;
    const pair = (x, y) => (ta === x && tb === y) || (ta === y && tb === x);
    if (isSite(na) || isSite(nb)) {
      return { error: 'Les sites et obstacles ne se relient pas : déposez les équipements SUR un pylône ou un immeuble pour les y fixer.' };
    }
    const FH = ['antenna', 'fullOutdoor'];
    if (FH.includes(ta) && FH.includes(tb)) return { medium: 'fh' };
    if (pair('blrBts', 'blrCpe')) return { medium: 'blr' };
    if (pair('blrBts', 'blrBts')) return { error: 'Une liaison BLR relie une station de base BLR à un terminal abonné (CPE).' };
    if (pair('blrCpe', 'blrCpe')) return { error: 'Deux CPE ne communiquent pas directement : chacun vise la station de base BLR.' };
    if (has('satellite')) {
      const other = ta === 'satellite' ? nb : na;
      if (other.type === 'vsatAntenna' || other.type === 'hub') return { medium: 'vsat' };
      if (other.type === 'satellite') return { error: 'Les liaisons inter-satellites ne sont pas simulées.' };
      return { error: 'Un satellite communique uniquement avec une antenne VSAT ou un Hub / Téléport.' };
    }
    if (pair('odu', 'antenna') || pair('odu', 'idu')) return { medium: 'if' };
    if (has('odu')) return { error: 'L’ODU se raccorde uniquement à son IDU (câble IF) et à son antenne parabolique.' };
    if (has('antenna')) return { error: 'L’antenne FH se raccorde à une ODU, ou vise une autre antenne FH / Full-Outdoor (faisceau).' };
    if ((has('buc') || has('lnb')) && (has('vsatAntenna') || has('vsatModem'))) return { medium: 'coax' };
    if (has('buc') || has('lnb')) return { error: 'BUC et LNB se raccordent en coaxial entre l’antenne VSAT et le modem satellite.' };
    if (pair('vsatAntenna', 'vsatModem')) return { error: 'Placez un BUC (émission) et un LNB (réception) entre le modem et l’antenne VSAT.' };
    if (has('vsatAntenna')) return { error: 'L’antenne VSAT vise un satellite et se raccorde au BUC / LNB (coaxial).' };
    if (FH.includes(ta) && (tb === 'blrBts' || tb === 'blrCpe')) return { error: 'Équipements incompatibles : une radio FH ne peut pas viser un équipement BLR.' };
    if (FH.includes(tb) && (ta === 'blrBts' || ta === 'blrCpe')) return { error: 'Équipements incompatibles : une radio FH ne peut pas viser un équipement BLR.' };
    const sel = $('#link-medium').value;
    return { medium: sel === 'fiber' ? 'fiber' : 'ethernet' };
  }

  /** Obstacles (et immeubles) qui coupent le trajet entre deux équipements. */
  function obstaclesOnPath(na, nb) {
    const A = anchorOf(na);
    const B = anchorOf(nb);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len2 = dx * dx + dy * dy;
    const D = distKm(na, nb);
    const out = [];
    if (len2 < 1) return out;
    for (const o of S.topo.nodes) {
      if (o.type !== 'obstacle' && o.type !== 'building') continue;
      if (o.id === A.id || o.id === B.id) continue;
      const t = ((o.x - A.x) * dx + (o.y - A.y) * dy) / len2;
      if (t <= 0.01 || t >= 0.99) continue;
      const px = A.x + t * dx;
      const py = A.y + t * dy;
      const dPerpKm = Math.hypot(o.x - px, o.y - py) * kmPerPx();
      const r = o.type === 'obstacle' ? num(o.props.widthKm, 2) / 2 : 0.06;
      if (dPerpKm >= r) continue;
      const chord = 2 * Math.sqrt(r * r - dPerpKm * dPerpKm);
      out.push({
        dKm: t * D,
        heightM: o.type === 'obstacle' ? num(o.props.heightM, 60) : siteHeightM(o),
        widthKm: Math.max(0.03, chord),
        type: o.type === 'obstacle' ? o.props.kind || 'hill' : 'building',
        name: o.name,
      });
    }
    return out;
  }

  /* ------------------------------------------------------------------
   * 4. MOTEUR DE SIMULATION
   * ------------------------------------------------------------------ */
  const worst = (...st) => st.reduce((w, s) => (STATUS_RANK[s] > STATUS_RANK[w] ? s : w), 'optimal');
  const rain = () => num(S.topo.settings.rainMmH, 0);

  /** Climat de propagation du projet (UIT-R P.453 / P.837) et objectif de disponibilité. */
  function climate() {
    const st = S.topo.settings;
    const c = RP.getClimate(st.climate || 'soudanien');
    const custom = c.id === 'custom';
    return { id: c.id, label: c.label, dN1: custom ? num(st.dN1, -300) : c.dN1, r001: custom ? num(st.r001, 90) : c.r001, objective: num(st.availObjective, 99.99), lat: num(st.refLat, REF.lat) };
  }
  const interferenceOn = () => !!S.topo.settings.interference;
  const angDiff = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
  const HALF_TXT = { low: 'basse', high: 'haute' };
  const oppHalf = (h) => (h === 'high' ? 'low' : 'high');
  /** Demi-bandes d'émission des deux extrémités d'un bond (null si les deux émettent dans la même). */
  function resolveHalves(a, b) {
    const ea = a === 'low' || a === 'high';
    const eb = b === 'low' || b === 'high';
    if (ea && eb) return a !== b ? { a, b } : null;
    if (ea) return { a, b: oppHalf(a) };
    if (eb) return { a: oppHalf(b), b };
    return { a: 'low', b: 'high' };
  }
  const endName = (n) => (siteOf(n) ? siteOf(n).name : n.name);
  /** Niveau de brouillage reçu par l'extrémité R (récepteur pointé vers « wanted ») sur la fréquence fRx. */
  function interferenceAt(link, R, wanted, fRxGHz, ch) {
    const list = [];
    const pr = anchorOf(R.node);
    for (const t of S.fhTx || []) {
      if (t.linkId === link.id) continue;
      const nfd = RP.nfd((t.fGHz - fRxGHz) * 1000, Math.max(ch, t.chMHz));
      if (!nfd) continue;
      const pt = anchorOf(t.node);
      const raw = Math.hypot(pt.x - pr.x, pt.y - pr.y) * kmPerPx();
      const coloc = raw < 0.06;
      const dKm = coloc ? 0.01 : raw;
      const offTx = coloc ? 90 : angDiff(bearingDeg(t.node, R.node), bearingDeg(t.node, t.partner) + t.azErr);
      const offRx = coloc ? 90 : angDiff(bearingDeg(R.node, t.node), bearingDeg(R.node, wanted) + R.ant.azErrDeg);
      const rp = R.ant.polarization;
      const xpd = t.pol === 'V+H' || rp === 'V+H' || t.pol === rp ? 0 : RP.OFFAXIS_XPD_DB;
      const lvl = RP.interferenceLevelDbm({ txDbm: t.txDbm, lossTxDb: t.lossDb, diamTxM: t.diamM, offTxDeg: offTx, dKm, fGHz: t.fGHz, diamRxM: R.ant.diameterM, offRxDeg: offRx, lossRxDb: num(R.rf.props.lossDb, 0.5), nfdDb: nfd.db, xpdDb: xpd });
      const rainDb = coloc ? 0 : RP.rainAttenuation(dKm, t.fGHz, rain(), rp === 'H' ? 'H' : 'V').total;
      list.push({ from: t.name, to: t.toName, coloc, dKm, offTx, offRx, gTx: lvl.gTx, gRx: lvl.gRx, nfd: nfd.label, nfdDb: nfd.db, xpdDb: xpd, half: t.half, ch: t.ch, iClearDbm: lvl.iDbm, iDbm: lvl.iDbm - rainDb });
    }
    list.sort((x, y) => y.iDbm - x.iDbm);
    return { list, iDbm: RP.sumDbm(list.map((x) => x.iDbm)), iClearDbm: RP.sumDbm(list.map((x) => x.iClearDbm)) };
  }
  /** Fréquences d'émission / réception d'une ODU (ou Full-Outdoor), lues dans l'état du bond. */
  function fhTxInfo(rf) {
    for (const l of S.topo.links) {
      const st = l.state;
      if (!st || st.kind !== 'fh' || !st.freq) continue;
      for (const k of ['A', 'B']) {
        if (st.ends[k].rf !== rf) continue;
        const q = st.freq[k];
        const o = st.freq[k === 'A' ? 'B' : 'A'];
        return `émission ${fmt(q.txGHz * 1000, 0)} MHz (demi-bande ${HALF_TXT[q.half]}, canal ${q.ch}) · réception ${fmt(o.txGHz * 1000, 0)} MHz`;
      }
    }
    return 'raccordez l’équipement à un bond FH valide';
  }
  const failed = (n) => !!(n && n.props && n.props.failed);

  /* --- Pannes du mode Dépannage (pannes.js) --- */
  let faultBarHook = () => {};
  const PN = () => MBV.Pannes;
  /** Effet physique d'une panne matérielle (cachée ou révélée) sur un équipement ou un câble. */
  const hw = (o) => (PN() && o && PN().effects(o)) || {};
  const deadHw = (o) => !!hw(o).dead;
  const cableCut = (l) => !!(l && hw(l).cut);
  const isDead = (n) => failed(n) || deadHw(n);
  const faultOf = (o) => (o && o.props && o.props.fault) || null;
  const isHidden = (o) => !!(faultOf(o) && faultOf(o).hidden);
  /** Message d'une panne RÉVÉLÉE (version enseignant) ; une panne cachée n'est jamais nommée. */
  function revealedIssue(o) {
    const f = faultOf(o);
    if (!f || f.hidden) return null;
    const d = PN().def(f.type);
    return { level: 'error', text: `Panne révélée : ${d ? d.label : f.type} — ${o.name || linkName(o)}.` };
  }
  /** Câbles IF de la chaîne radio d'une extrémité FH (antenne – ODU, ODU – IDU). */
  function ifCablesOf(E) {
    const ids = new Set();
    const out = [];
    for (const n of [E.node, E.rf]) {
      if (!n || n.type === 'fullOutdoor') continue;
      for (const x of neighbors(n, ['if'])) if (!ids.has(x.link.id)) ids.add(x.link.id) && out.push(x.link);
    }
    return out;
  }
  /** Extrémité FH sans émission ni réception (équipement mort, câble IF coupé). */
  const endDead = (E) => isDead(E.rf) || (E.modem && E.modem !== E.rf && isDead(E.modem)) || ifCablesOf(E).some(cableCut);
  /** Perte supplémentaire due à un dépointage caché (dB). */
  const hiddenPointDb = (azVis, azHid, bw, cap) => (azHid ? RP.pointingLossDb(azVis + azHid, bw, cap) - RP.pointingLossDb(azVis, bw, cap) : 0);
  function downState(kind, issues, extra) {
    return Object.assign({ kind, up: false, status: 'down', capacityMbps: 0, capacityDir: { ab: 0, ba: 0 }, latencyMs: 0, issues }, extra || {});
  }
  function lowerMod(table, a, b) {
    const ia = table.findIndex((m) => m.id === a);
    const ib = table.findIndex((m) => m.id === b);
    if (ia < 0) return b;
    if (ib < 0) return a;
    return table[Math.min(ia, ib)].id;
  }

  /** Résout une extrémité de faisceau FH : antenne (+ ODU + IDU) ou Full-Outdoor. */
  function fhEnd(n) {
    const r = { node: n, issues: [], equipment: [n] };
    const p = n.props;
    if (n.type === 'fullOutdoor') {
      r.rf = n;
      r.modem = n;
      r.ant = { diameterM: num(p.diameterM, 0.6), polarization: p.polarization || 'V', azErrDeg: num(p.azErrDeg, 0) };
    } else {
      r.ant = { diameterM: num(p.diameterM, 0.6), polarization: p.polarization || 'V', azErrDeg: num(p.azErrDeg, 0) };
      r.rf = neighborOfType(n, 'odu', ['if']);
      r.modem = r.rf ? neighborOfType(r.rf, 'idu', ['if']) : null;
      if (!r.rf) r.issues.push({ level: 'error', text: `« ${n.name} » n’est raccordée à aucune ODU : pas d’émetteur-récepteur.` });
      else r.equipment.push(r.rf);
      if (r.rf && !r.modem) r.issues.push({ level: 'warn', text: `ODU « ${r.rf.name} » sans IDU : réglages modem par défaut, aucun port Ethernet.` });
      if (r.modem) r.equipment.push(r.modem);
    }
    const site = siteOf(n);
    if (!site) r.issues.push({ level: 'info', text: `« ${n.name} » n’est fixée sur aucun pylône : hauteur ${fmt(heightOf(n), 0)} m au-dessus du sol.` });
    r.ground = groundOf(n);
    r.height = heightOf(n);
    // Pannes matérielles : dépointage caché, branchement dégradé (jamais affichés comme cause)
    r.hiddenAz = num(hw(n).azErrDeg, 0);
    r.extraHwLossDb = r.rf ? num(hw(r.rf).extraLossDb, 0) : 0;
    for (const o of [n, r.rf, r.modem].filter(Boolean).concat(ifCablesOf(r))) {
      const iss = revealedIssue(o);
      if (iss && !r.issues.some((x) => x.text === iss.text)) r.issues.push(iss);
    }
    return r;
  }

  function computeFh(link, opts = {}) {
    const na = nodeById(link.a);
    const nb = nodeById(link.b);
    const A = fhEnd(na);
    const B = fhEnd(nb);
    const issues = [...A.issues, ...B.issues];
    if (!A.rf || !B.rf) return downState('fh', issues);
    const bandA = RP.getFhBand(A.rf.props.band);
    const bandB = RP.getFhBand(B.rf.props.band);
    if (bandA.id !== bandB.id) {
      issues.push({ level: 'error', text: `Bandes différentes aux deux extrémités (${bandA.label} / ${bandB.label}).` });
      return downState('fh', issues);
    }
    const chA = num(A.rf.props.channelMHz, 28);
    const chB = num(B.rf.props.channelMHz, 28);
    if (chA !== chB) {
      issues.push({ level: 'error', text: `Largeurs de canal différentes (${chA} / ${chB} MHz) : les modems ne se synchronisent pas.` });
      return downState('fh', issues);
    }
    const d = distKm(na, nb);
    const f = bandA.f;
    const chNoA = Math.round(num(A.rf.props.channelNo, 1));
    const chNoB = Math.round(num(B.rf.props.channelNo, 1));
    if (chNoA !== chNoB) {
      issues.push({ level: 'error', text: `Numéros de canal différents (canal ${chNoA} / canal ${chNoB}) : les deux extrémités d’un bond doivent utiliser la même paire de canaux.` });
      return downState('fh', issues);
    }
    const halves = resolveHalves(A.rf.props.txHalf, B.rf.props.txHalf);
    if (!halves) {
      issues.push({ level: 'error', text: `Les deux extrémités émettent dans la demi-bande ${HALF_TXT[A.rf.props.txHalf]} : chaque récepteur écoute l’autre demi-bande, aucun ne reçoit rien.` });
      return downState('fh', issues);
    }
    const freq = {
      A: { half: halves.a, ch: chNoA, txGHz: RP.fhChannelGHz(bandA.id, halves.a, chNoA, chA) },
      B: { half: halves.b, ch: chNoB, txGHz: RP.fhChannelGHz(bandA.id, halves.b, chNoB, chA) },
    };
    const txA = Math.min(num(A.rf.props.txPowerDbm, 20), bandA.txMax);
    const txB = Math.min(num(B.rf.props.txPowerDbm, 20), bandB.txMax);
    if (opts.probe) {
      const tx = (E, partner, q, p) => ({ linkId: link.id, node: E.node, partner, fGHz: q.txGHz, chMHz: chA, txDbm: p, lossDb: num(E.rf.props.lossDb, 0.5), diamM: E.ant.diameterM, pol: E.ant.polarization, azErr: E.ant.azErrDeg, half: q.half, ch: q.ch, name: endName(E.node), toName: endName(partner) });
      return { tx: [endDead(A) ? null : tx(A, nb, freq.A, txA), endDead(B) ? null : tx(B, na, freq.B, txB)].filter(Boolean) };
    }
    const gA = RP.dishGainDbi(A.ant.diameterM, f);
    const gB = RP.dishGainDbi(B.ant.diameterM, f);
    const bwA = RP.dishBeamwidthDeg(A.ant.diameterM, f);
    const bwB = RP.dishBeamwidthDeg(B.ant.diameterM, f);
    const pointing = RP.pointingLossDb(A.ant.azErrDeg, bwA) + RP.pointingLossDb(B.ant.azErrDeg, bwB);
    const hiddenLoss = hiddenPointDb(A.ant.azErrDeg, A.hiddenAz, bwA) + hiddenPointDb(B.ant.azErrDeg, B.hiddenAz, bwB) + A.extraHwLossDb + B.extraHwLossDb;
    const pa = A.ant.polarization;
    const pb = B.ant.polarization;
    let dualPol = pa === 'V+H' && pb === 'V+H';
    let pol = 'V';
    let extra = 0;
    if (dualPol) pol = 'H';
    else if (pa === 'V+H' || pb === 'V+H') {
      pol = pa === 'V+H' ? pb : pa;
      issues.push({ level: 'warn', text: 'Double polarisation V+H configurée d’un seul côté : une seule polarisation exploitée.' });
    } else if (pa !== pb) {
      extra = 25;
      pol = pa;
      issues.push({ level: 'error', text: `Polarisations croisées (${pa} ≠ ${pb}) : perte de découplage ≈ 25 dB.` });
    } else pol = pa;

    const profile = RP.buildProfile({
      distanceKm: d,
      fGHz: f,
      siteA: { groundM: A.ground, antennaM: A.height },
      siteB: { groundM: B.ground, antennaM: B.height },
      obstacles: obstaclesOnPath(na, nb),
    });
    const mA = A.modem ? A.modem.props : CATALOG.idu.defaults;
    const mB = B.modem ? B.modem.props : CATALOG.idu.defaults;
    const maxMod = lowerMod(RP.FH_MODULATIONS, mA.maxMod, mB.maxMod);
    if (mA.maxMod !== mB.maxMod) issues.push({ level: 'info', text: `Modulations max différentes : la plus basse (${maxMod}) s’applique.` });
    const acm = mA.acm !== false && mB.acm !== false;
    const common = {
      kind: 'FH',
      fGHz: f,
      distanceKm: d,
      channelMHz: chA,
      rainMmH: rain(),
      polarization: pol,
      maxModulation: maxMod,
      acm,
      dualPol,
      diffractionLossDb: profile.diffractionLossDb,
      pointingLossDb: pointing,
      hiddenLossDb: hiddenLoss,
      extraLossDb: extra,
      extraLossLabel: 'Désadaptation de polarisation',
    };
    const interf = interferenceOn() ? { atB: interferenceAt(link, B, na, freq.A.txGHz, chA), atA: interferenceAt(link, A, nb, freq.B.txGHz, chA) } : null;
    const iLvl = (at) => (at && at.list.length ? at.iDbm : undefined);
    const ab = RP.computeLinkBudget(Object.assign({}, common, { txPowerDbm: txA, gTxDbi: gA, gRxDbi: gB, lossTxDb: num(A.rf.props.lossDb, 0.5), lossRxDb: num(B.rf.props.lossDb, 0.5), nfDb: bandB.nf, xpic: !!mB.xpic, interferenceDbm: iLvl(interf && interf.atB), hiddenLossDb: hiddenLoss - recetteDelta(link, A.node, B.node, 'ab') }));
    const ba = RP.computeLinkBudget(Object.assign({}, common, { txPowerDbm: txB, gTxDbi: gB, gRxDbi: gA, lossTxDb: num(B.rf.props.lossDb, 0.5), lossRxDb: num(A.rf.props.lossDb, 0.5), nfDb: bandA.nf, xpic: !!mA.xpic, interferenceDbm: iLvl(interf && interf.atA), hiddenLossDb: hiddenLoss - recetteDelta(link, B.node, A.node, 'ba') }));
    const nameA = endName(na);
    const nameB = endName(nb);
    if (interf) {
      for (const [bud, at, rxName] of [
        [ab, interf.atB, nameB],
        [ba, interf.atA, nameA],
      ]) {
        if (!at.list.length || bud.ciExtDb === null || bud.ciExtDb >= 30) continue;
        const w = at.list[0];
        issues.push({ level: bud.ciExtDb < 15 ? 'error' : 'warn', text: `Brouillage à la réception de ${rxName} : C/I = ${fmt(bud.ciExtDb, 1)} dB. Principal brouilleur : l’émetteur de ${w.from} vers ${w.to} (${w.nfd}${w.coloc ? ', même site : règle haut / bas non respectée ?' : `, ${fmt(w.offTx, 0)}° hors de son axe`}).` });
      }
    }

    // Diversité d'espace (1+1 SD) : antenne de réception supplémentaire S mètres plus bas à chaque extrémité
    const protection = String((link.props && link.props.protection) || '1+0');
    let div = null;
    if (protection === '1+1 SD') {
      const sM = num(link.props.sdSpacingM, 10);
      const dDiam = num(link.props.sdDiamM, 0);
      const obst = obstaclesOnPath(na, nb);
      const lowAtB = RP.buildProfile({ distanceKm: d, fGHz: f, siteA: { groundM: A.ground, antennaM: A.height }, siteB: { groundM: B.ground, antennaM: B.height - sM }, obstacles: obst });
      const lowAtA = RP.buildProfile({ distanceKm: d, fGHz: f, siteA: { groundM: A.ground, antennaM: A.height - sM }, siteB: { groundM: B.ground, antennaM: B.height }, obstacles: obst });
      const g2A = RP.dishGainDbi(dDiam || A.ant.diameterM, f);
      const g2B = RP.dishGainDbi(dDiam || B.ant.diameterM, f);
      if (Math.min(A.height, B.height) - sM < 5) {
        issues.push({ level: 'error', text: `Diversité d’espace inopérante : avec S = ${fmt(sM, 0)} m, l’antenne de diversité serait à moins de 5 m du sol (antennes principales à ${fmt(A.height, 0)} m et ${fmt(B.height, 0)} m).` });
      } else {
        div = {
          sM,
          diamM: dDiam || null,
          ab: { vDb: Math.abs(gB - profile.diffractionLossDb - (g2B - lowAtB.diffractionLossDb)), h2: B.height - sM, profile: lowAtB, g2: g2B },
          ba: { vDb: Math.abs(gA - profile.diffractionLossDb - (g2A - lowAtA.diffractionLossDb)), h2: A.height - sM, profile: lowAtA, g2: g2A },
        };
        for (const [k, nm] of [
          ['ab', nameB],
          ['ba', nameA],
        ]) {
          const pr = div[k].profile;
          if (pr.verdict !== 'clear') issues.push({ level: 'warn', text: `Antenne de diversité de ${nm} (${fmt(div[k].h2, 0)} m) : 1ère zone de Fresnel dégagée à ${fmt(pr.minRatio * 100, 0)} % (diffraction ${fmt(pr.diffractionLossDb, 1)} dB), l’amélioration est réduite.` });
        }
      }
    }

    // Disponibilité annuelle (UIT-R P.530)
    const cl = climate();
    const iClr = (at) => (at && at.list.length ? at.iClearDbm : undefined);
    const avail = (bud, dv, at) =>
      RP.computeAvailability({ dKm: d, fGHz: f, polarization: pol, heA: A.ground + A.height, heB: B.ground + B.height, dN1: cl.dN1, r001: cl.r001, latDeg: cl.lat, rslClearDbm: bud.rslClear, noiseDbm: bud.noise, interferenceDbm: iClr(at), thresholds: bud.thresholds, maxModulation: bud.maxModulation.id, acm, diversity: dv ? { sM: div.sM, vDb: dv.vDb } : null, objectivePct: cl.objective });
    const availability = { ab: avail(ab, div && div.ab, interf && interf.atB), ba: avail(ba, div && div.ba, interf && interf.atA) };
    if (profile.verdict === 'blocked') issues.push({ level: 'error', text: `Visibilité directe obstruée : diffraction ${fmt(profile.diffractionLossDb, 1)} dB.` });
    else if (profile.verdict === 'partial') issues.push({ level: 'warn', text: `1ère zone de Fresnel dégagée à ${fmt(profile.minRatio * 100, 0)} % seulement (objectif ≥ 60 %).` });
    if (pointing > 0.5) issues.push({ level: 'warn', text: `Dépointage d’antenne : ${fmt(pointing, 1)} dB de pertes.` });

    let status = worst(ab.status, ba.status);
    let note = '';
    const broken = [...A.equipment, ...B.equipment].filter(failed);
    const hidDead = [...A.equipment, ...B.equipment].filter((x) => deadHw(x) && !failed(x));
    const cuts = ifCablesOf(A).concat(ifCablesOf(B)).filter(cableCut);
    if (broken.length || hidDead.length || cuts.length) {
      const prot = protection.startsWith('1+1');
      const all = broken.concat(hidDead);
      if (prot && !cuts.length && all.every((x) => x.type === 'odu' || x.type === 'idu' || x.type === 'fullOutdoor')) {
        note = 'Protection 1+1 HSB : équipement de secours actif' + (broken.length ? ' (' + broken.map((b) => b.name).join(', ') + ' en panne)' : '') + '.';
        issues.push({ level: 'info', text: note + (hidDead.some(isHidden) ? ' Alarme de basculement sur l’IDU : un équipement radio est défaillant.' : '') });
      } else {
        if (broken.length) issues.push({ level: 'error', text: 'Équipement en panne : ' + broken.map((b) => b.name).join(', ') + '.' });
        if (hidDead.concat(cuts).some(isHidden)) issues.push({ level: 'error', text: 'Liaison coupée : aucun signal reçu (RSL non mesurable). Contrôlez les équipements, le câblage et l’alimentation à chaque extrémité.' });
        status = 'down';
      }
    }
    const up = status !== 'down';
    return {
      kind: 'fh',
      up,
      status,
      capacityMbps: up ? Math.min(ab.capacityMbps, ba.capacityMbps) : 0,
      capacityDir: { ab: up ? ab.capacityMbps : 0, ba: up ? ba.capacityMbps : 0 },
      latencyMs: d / C_KM_MS + 0.1,
      distanceKm: d,
      band: bandA,
      fGHz: f,
      channelMHz: chA,
      budgets: { ab, ba },
      profile,
      ends: { A, B },
      gains: { gA, gB, bwA, bwB },
      dualPol,
      freq,
      interference: interf,
      diversity: div,
      availability,
      availWorst: Math.min(availability.ab.nominal.availPct, availability.ba.nominal.availPct),
      issues,
      label: up ? `${bandA.id} GHz · ${(ab.activeModulation || ba.activeModulation || {}).id || '—'} · ${fmt(Math.min(ab.capacityMbps, ba.capacityMbps), 0)} Mb/s` : 'COUPÉ',
    };
  }

  function computeBlr(link) {
    const na = nodeById(link.a);
    const nb = nodeById(link.b);
    const bts = na.type === 'blrBts' ? na : nb;
    const cpe = bts === na ? nb : na;
    const issues = [];
    const band = RP.getBlrBand(bts.props.band);
    const ch = num(bts.props.channelMHz, band.channels[0]);
    const d = distKm(bts, cpe);
    const brg = bearingDeg(bts, cpe);
    const off = U.angleDiff(brg, num(bts.props.azimuthDeg, 0));
    const sectorDeg = num(bts.props.sectorDeg, 90);
    const offLoss = RP.sectorPatternLossDb(off, sectorDeg);
    if (Math.abs(off) > sectorDeg / 2) issues.push({ level: 'warn', text: `CPE hors du secteur de la BTS (écart ${fmt(off, 0)}° pour un secteur de ${sectorDeg}°) : ${fmt(offLoss, 1)} dB de pertes.` });
    const gBts = RP.sectorGainDbi(sectorDeg);
    const indoor = cpe.props.install === 'indoor';
    const gCpe = indoor ? 7 : band.cpeGainOutdoor;
    const cpeBw = Math.sqrt((41253 * 0.6) / Math.pow(10, gCpe / 10));
    const cpePoint = RP.pointingLossDb(num(cpe.props.azErrDeg, 0), cpeBw, 25);
    const cpeHidden = hiddenPointDb(num(cpe.props.azErrDeg, 0), num(hw(cpe).azErrDeg, 0), cpeBw, 25);
    const revCpe = revealedIssue(cpe);
    if (revCpe) issues.push(revCpe);
    const wall = indoor ? num(cpe.props.wallLossDb, 12) : 0;
    if (indoor) issues.push({ level: 'info', text: `CPE intérieur : traversée de mur ${fmt(wall, 0)} dB, gain d’antenne réduit (${gCpe} dBi).` });
    const profile = RP.buildProfile({
      distanceKm: d,
      fGHz: band.f,
      siteA: { groundM: groundOf(bts), antennaM: heightOf(bts) },
      siteB: { groundM: groundOf(cpe), antennaM: heightOf(cpe) },
      obstacles: obstaclesOnPath(bts, cpe),
    });
    const common = {
      kind: 'BLR',
      fGHz: band.f,
      distanceKm: d,
      channelMHz: ch,
      rainMmH: rain(),
      polarization: 'V',
      maxModulation: bts.props.maxMod,
      acm: bts.props.acm !== false,
      diffractionLossDb: profile.diffractionLossDb,
      pointingLossDb: offLoss + cpePoint,
      hiddenLossDb: cpeHidden,
      extraLossDb: wall,
      extraLossLabel: 'Traversée de mur (CPE intérieur)',
      lossTxDb: 0.5,
      lossRxDb: 0.5,
      nfDb: band.nf,
    };
    const dl = RP.computeLinkBudget(Object.assign({}, common, { txPowerDbm: Math.min(num(bts.props.txPowerDbm, 30), band.txMax), gTxDbi: gBts, gRxDbi: gCpe, hiddenLossDb: cpeHidden - recetteDelta(link, bts, cpe, 'dl') }));
    const ul = RP.computeLinkBudget(Object.assign({}, common, { txPowerDbm: Math.min(num(cpe.props.txPowerDbm, 23), 27), gTxDbi: gCpe, gRxDbi: gBts, hiddenLossDb: cpeHidden - recetteDelta(link, cpe, bts, 'ul') }));
    const nCpe = Math.max(1, radioLinksOf(bts).filter((l) => l.medium === 'blr').length);
    const dlCap = (dl.capacityMbps * 0.7) / nCpe;
    const ulCap = (ul.capacityMbps * 0.3) / nCpe;
    if (profile.verdict === 'blocked') issues.push({ level: 'error', text: `Trajet obstrué : diffraction ${fmt(profile.diffractionLossDb, 1)} dB.` });
    else if (profile.verdict === 'partial') issues.push({ level: 'warn', text: `Fresnel dégagée à ${fmt(profile.minRatio * 100, 0)} % seulement.` });
    let status = worst(dl.status, ul.status);
    const broken = [bts, cpe].filter(failed);
    if (broken.length) {
      status = 'down';
      issues.push({ level: 'error', text: 'Équipement en panne : ' + broken.map((b) => b.name).join(', ') + '.' });
    }
    if (deadHw(cpe) && !failed(cpe)) {
      status = 'down';
      if (isHidden(cpe)) issues.push({ level: 'error', text: 'Terminal non enregistré sur la station de base : aucun signal reçu de l’abonné.' });
    }
    const up = status !== 'down';
    const btsIsA = link.a === bts.id;
    return {
      kind: 'blr',
      up,
      status,
      capacityMbps: up ? Math.min(dlCap, ulCap) : 0,
      capacityDir: { ab: up ? (btsIsA ? dlCap : ulCap) : 0, ba: up ? (btsIsA ? ulCap : dlCap) : 0 },
      latencyMs: 2 + d / C_KM_MS,
      distanceKm: d,
      band,
      fGHz: band.f,
      channelMHz: ch,
      budgets: { dl, ul },
      dlCap,
      ulCap,
      nCpe,
      bts,
      cpe,
      offAxisDeg: off,
      offLoss,
      gains: { gBts, gCpe },
      profile,
      issues,
      label: up ? `↓${(dl.activeModulation || {}).id || '—'} ${fmt(dlCap, 1)} · ↑${fmt(ulCap, 1)} Mb/s` : 'COUPÉ',
    };
  }

  /** Chaîne d'une station VSAT distante : antenne → BUC/LNB → modem. */
  function vsatChain(ant) {
    const coax = neighbors(ant, ['coax']).map((x) => x.node);
    const buc = coax.find((x) => x.type === 'buc') || null;
    const lnb = coax.find((x) => x.type === 'lnb') || null;
    let modem = null;
    for (const c of [buc, lnb]) {
      if (!c) continue;
      const m = neighborOfType(c, 'vsatModem', ['coax']);
      if (m) {
        modem = m;
        break;
      }
    }
    return { ant, buc, lnb, modem };
  }

  function satGeometryFor(sat) {
    return { orbit: sat.props.orbit || 'GEO', band: sat.props.band || 'Ku', lon: num(sat.props.lonDeg, 7), el: num(sat.props.elevationDeg, 60) };
  }

  /** Calcule toutes les liaisons VSAT d'un satellite (distants + hub). */
  function computeSatellite(sat, states) {
    const links = radioLinksOf(sat).filter((l) => l.medium === 'vsat');
    const remoteLinks = links.filter((l) => nodeById(l.a === sat.id ? l.b : l.a).type === 'vsatAntenna');
    const hubLinks = links.filter((l) => nodeById(l.a === sat.id ? l.b : l.a).type === 'hub');
    const g = satGeometryFor(sat);
    const orbit = SP.getOrbit(g.orbit);
    // Constellation défilante : élévation du satellite servant à l'instant de simulation
    let cstate = null;
    if (orbit.id !== 'GEO' && sat.props.motion === 'moving') {
      cstate = constellationOf(sat, S.sim.t);
      trackServing(sat, cstate);
      if (cstate.serving) g.el = cstate.serving.el;
    } else {
      delete S.satVis[sat.id];
      delete S.satTrack[sat.id];
    }
    if (cstate && !cstate.serving) {
      const gap = [{ level: 'error', text: `Aucun satellite visible au-dessus de ${fmt(cstate.minEl, 0)}° : trou de couverture (${cstate.satsPerPlane} satellites par plan, un passage toutes les ${fmt(cstate.spacingMin, 1)} min pour ${fmt(cstate.passDurationMin, 1)} min de visibilité).` }];
      for (const l of links) states.set(l.id, downState('vsat', gap, { sat, constellation: cstate }));
      return;
    }
    const hubLink = hubLinks[0];
    const hub = hubLink ? nodeById(hubLink.a === sat.id ? hubLink.b : hubLink.a) : null;
    const results = [];
    for (const hl of hubLinks.slice(1)) {
      states.set(hl.id, downState('vsat', [{ level: 'warn', text: 'Un seul Hub par satellite est simulé : ce Hub supplémentaire est ignoré.' }]));
    }
    for (const rl of remoteLinks) {
      const ant = nodeById(rl.a === sat.id ? rl.b : rl.a);
      const chain = vsatChain(ant);
      const issues = [];
      if (!hub) {
        states.set(rl.id, downState('vsat', [{ level: 'error', text: 'Aucun Hub / Téléport n’est relié à ce satellite : pas de passerelle vers le réseau.' }], { chain }));
        continue;
      }
      if (!chain.buc) issues.push({ level: 'error', text: 'Pas de BUC raccordé à l’antenne VSAT : la station ne peut pas émettre (voie retour coupée).' });
      if (!chain.lnb) issues.push({ level: 'error', text: 'Pas de LNB raccordé à l’antenne VSAT : la station ne peut pas recevoir (voie aller coupée).' });
      if (!chain.modem) issues.push({ level: 'warn', text: 'Pas de modem satellite IP raccordé au BUC/LNB : aucune sortie Ethernet.' });
      const geoR = geoOf(ant);
      const geoH = geoOf(hub);
      // Pointage : idéal calculé vs valeurs réglées par l'élève
      let azErr = 0;
      let elErr = 0;
      let skewErr = 0;
      let ideal = null;
      if (orbit.id === 'GEO') {
        ideal = SP.geoLookAngles(geoR.lat, geoR.lon, g.lon);
        if (ant.props.autoPoint === false) {
          azErr = U.angleDiff(num(ant.props.azimuthDeg, 0), ideal.azimuth);
          elErr = num(ant.props.elevationDeg, 0) - ideal.elevation;
          skewErr = num(ant.props.skewDeg, 0) - ideal.skew;
        }
      }
      const modemP = chain.modem ? chain.modem.props : CATALOG.vsatModem.defaults;
      // Pannes cachées : dépointage de la parabole, LNB dégradé (pertes appliquées sans être détaillées)
      let hidUp = 0;
      let hidDown = 0;
      const hAnt = hw(ant);
      if (ideal && (hAnt.azErrDeg || hAnt.elErrDeg)) {
        const bandX = SP.getBand(g.band);
        const dish = num(ant.props.dishM, 1.8);
        const vis = SP.pointingErrorDeg(azErr, elErr, ideal.elevation);
        const tot = SP.pointingErrorDeg(azErr + num(hAnt.azErrDeg, 0), elErr + num(hAnt.elErrDeg, 0), ideal.elevation);
        const bu = RP.dishBeamwidthDeg(dish, bandX.upGHz);
        const bd = RP.dishBeamwidthDeg(dish, bandX.downGHz);
        hidUp += RP.pointingLossDb(tot, bu, 40) - RP.pointingLossDb(vis, bu, 40);
        hidDown += RP.pointingLossDb(tot, bd, 40) - RP.pointingLossDb(vis, bd, 40);
      }
      if (chain.lnb && hw(chain.lnb).nfAddDb) {
        const nf = num(chain.lnb.props.nfDb, 0.8);
        const t0 = 60;
        hidDown += 10 * Math.log10((t0 + SP.lnbNoiseTempK(nf + hw(chain.lnb).nfAddDb)) / (t0 + SP.lnbNoiseTempK(nf)));
      }
      const rcv = recetteVsat(ant, chain.buc, chain.lnb);
      const hidUp0 = hidUp;
      const hidDown0 = hidDown;
      const satArgs = (hidUp, hidDown) => ({
        orbit: orbit.id,
        band: g.band,
        satLonDeg: g.lon,
        outputBackoffDb: num(sat.props.outputBackoffDb, 1),
        acm: modemP.acm !== false,
        remote: {
          lat: geoR.lat,
          lon: geoR.lon,
          altKm: groundOf(ant) / 1000,
          elevationDeg: g.el,
          dishM: num(ant.props.dishM, 1.8),
          bucW: chain.buc ? num(chain.buc.props.powerW, 4) : 2,
          lnbNfDb: chain.lnb ? num(chain.lnb.props.nfDb, 0.8) : 0.8,
          rainMmH: rain(),
          azErrDeg: azErr,
          elErrDeg: elErr,
          skewErrDeg: skewErr,
          hiddenLossUpDb: hidUp,
          hiddenLossDownDb: hidDown,
        },
        hub: {
          lat: geoH.lat,
          lon: geoH.lon,
          altKm: groundOf(hub) / 1000,
          elevationDeg: g.el,
          dishM: num(hub.props.dishM, 7.3),
          hpaW: num(hub.props.hpaW, 200),
          lnbNfDb: num(hub.props.lnbNfDb, 0.6),
          rainMmH: hub.props.localRain ? rain() : 0,
        },
        forward: { symbolRateMsps: num(hub.props.fwdSymbolRate, 30), maxModcod: hub.props.fwdMaxModcod },
        ret: { symbolRateMsps: num(modemP.retSymbolRate, 2), maxModcod: modemP.retMaxModcod },
      });
      const res = SP.computeSatLink(satArgs(hidUp0 - rcv.up, hidDown0 - rcv.down));
      const resCalc = hidUp0 || hidDown0 || rcv.up || rcv.down ? SP.computeSatLink(satArgs(0, 0)) : res;
      if (cstate) {
        const fd = SP.dopplerKHz(SP.getBand(g.band).downGHz, cstate.serving.rangeRateKmS);
        const fu = SP.dopplerKHz(SP.getBand(g.band).upGHz, cstate.serving.rangeRateKmS);
        res.remoteGeometry.steps = res.remoteGeometry.steps.concat([
          U.step(
            `Satellite servant n° ${cstate.serving.index} sur ${cstate.satsPerPlane}`,
            'le terminal suit le satellite visible le plus haut (handover au croisement)',
            `T+${clockTxt(S.sim.t)} · ${cstate.visibleCount} satellite(s) visible(s) au-dessus de ${fmt(cstate.minEl, 0)}°`,
            cstate.serving.el,
            '°'
          ),
          U.step('Vitesse radiale (rapprochement < 0, éloignement > 0)', 'v_r = d(distance)/dt', `distance ${fmt(cstate.serving.slantKm, 0)} km`, cstate.serving.rangeRateKmS, 'km/s'),
          U.step('Décalage Doppler descendant', 'Δf = −f·v_r / c', `f = ${fmt(SP.getBand(g.band).downGHz, 2)} GHz`, fd, 'kHz', 'Le modem doit compenser ce décalage en permanence (il change de signe au passage du satellite).'),
          U.step('Décalage Doppler montant', 'Δf = −f·v_r / c', `f = ${fmt(SP.getBand(g.band).upGHz, 2)} GHz`, fu, 'kHz'),
        ]);
        issues.unshift({ level: 'info', text: `Satellite n° ${cstate.serving.index} : élévation ${fmt(cstate.serving.el, 1)}°, distance ${fmt(cstate.serving.slantKm, 0)} km, Doppler ${fmt(fd, 0)} kHz.` });
        const hist = satHist(sat);
        hist.rttMin = Math.min(hist.rttMin, res.latency.rttMs);
        hist.rttMax = Math.max(hist.rttMax, res.latency.rttMs);
        hist.elMin = Math.min(hist.elMin, cstate.serving.el);
        hist.elMax = Math.max(hist.elMax, cstate.serving.el);
        hist.dopplerMaxKHz = Math.max(hist.dopplerMaxKHz, Math.abs(fd));
      }
      let fwdUp = res.forward.status !== 'down' && !!chain.lnb;
      let retUp = res.ret.status !== 'down' && !!chain.buc;
      const broken = [sat, hub, ant, chain.buc, chain.lnb, chain.modem].filter(failed);
      if (broken.length) {
        issues.push({ level: 'error', text: 'Équipement en panne : ' + broken.map((b) => b.name).join(', ') + '.' });
        fwdUp = false;
        retUp = false;
      }
      const coaxOf = (c) => (c ? neighbors(c, ['coax']).map((x) => x.link) : []);
      const deadPath = (c) => !!c && ((deadHw(c) && !failed(c)) || coaxOf(c).some(cableCut));
      const hidOf = (c) => !!c && (isHidden(c) || coaxOf(c).some((l) => cableCut(l) && isHidden(l)));
      for (const o of [ant, chain.buc, chain.lnb, chain.modem].filter(Boolean).concat(coaxOf(chain.buc), coaxOf(chain.lnb))) {
        const iss = revealedIssue(o);
        if (iss && !issues.some((x) => x.text === iss.text)) issues.push(iss);
      }
      if (deadPath(chain.modem)) {
        fwdUp = false;
        retUp = false;
        if (hidOf(chain.modem)) issues.push({ level: 'error', text: 'Station distante muette : modem satellite sans voyant, aucune communication.' });
      }
      if (deadPath(chain.buc)) {
        retUp = false;
        if (hidOf(chain.buc)) issues.push({ level: 'error', text: 'Voie retour coupée : le Hub ne reçoit aucune porteuse de cette station.' });
      }
      if (deadPath(chain.lnb)) {
        fwdUp = false;
        if (hidOf(chain.lnb)) issues.push({ level: 'error', text: 'Voie aller coupée : le modem n’accroche pas la porteuse du satellite (alarme « Rx unlock »).' });
      }
      if (hidUp + hidDown > 0.5 && (isHidden(ant) || isHidden(chain.lnb))) {
        issues.push({ level: 'warn', text: `Niveau reçu inférieur au calcul (${fmt(hidUp, 1)} dB en montant, ${fmt(hidDown, 1)} dB en descendant) : une anomalie est à localiser.` });
      }
      if (!res.remoteGeometry.visible) issues.push({ level: 'error', text: `Satellite sous l’élévation minimale (${fmt(res.remoteGeometry.elevation, 1)}°).` });
      if (res.pointing.errorDeg > 0.05) issues.push({ level: res.pointing.lossUpDb > 3 ? 'error' : 'warn', text: `Erreur de pointage ${fmt(res.pointing.errorDeg, 2)}° : −${fmt(res.pointing.lossUpDb, 1)} dB (montant), −${fmt(res.pointing.lossDownDb, 1)} dB (descendant).` });
      if (res.pointing.skewLossDb > 0.3) issues.push({ level: 'warn', text: `Skew mal réglé : ${fmt(res.pointing.skewLossDb, 1)} dB de pertes de polarisation.` });
      let status = 'optimal';
      if (!fwdUp || !retUp) status = 'down';
      else status = worst(res.forward.status, res.ret.status);
      const up = status !== 'down';
      const fwdCap = fwdUp ? res.forward.throughputMbps : 0;
      const retCap = retUp ? res.ret.throughputMbps : 0;
      const antIsA = rl.a === ant.id;
      const st = {
        kind: 'vsat',
        role: 'remote',
        up,
        status,
        capacityMbps: up ? Math.min(fwdCap, retCap) : 0,
        capacityDir: { ab: up ? (antIsA ? retCap : fwdCap) : 0, ba: up ? (antIsA ? fwdCap : retCap) : 0 },
        latencyMs: res.remoteGeometry.slantRangeKm / C_KM_MS,
        sat,
        hub,
        chain,
        constellation: cstate,
        measure: { fwdEsn0: res.forward.esn0, fwdEsn0Calc: resCalc.forward.esn0 },
        geo: geoR,
        ideal,
        errors: { azErr, elErr, skewErr },
        result: res,
        fwdCap,
        retCap,
        issues,
        label: up
          ? `${g.band} ${orbit.id} · ↓${res.forward.modcod ? res.forward.modcod.id : '—'} · ↑${res.ret.modcod ? res.ret.modcod.id : '—'} · RTT ${fmt(res.latency.rttMs, 0)} ms`
          : 'COUPÉ',
      };
      states.set(rl.id, st);
      results.push(st);
    }
    if (hubLink) {
      const issues = [];
      const geoH = geoOf(hub);
      let visible = true;
      let slant;
      if (orbit.id === 'GEO') {
        const la = SP.geoLookAngles(geoH.lat, geoH.lon, g.lon);
        visible = la.visible;
        slant = la.slantRangeKm;
      } else slant = SP.slantRangeFromElevationKm(orbit.altitudeKm, g.el);
      if (!visible) issues.push({ level: 'error', text: 'Le Hub ne voit pas le satellite (élévation trop faible).' });
      const ups = results.filter((r) => r.up);
      let status;
      if (!visible || failed(hub) || failed(sat)) status = 'down';
      else if (!results.length) status = 'optimal';
      else if (!ups.length) status = 'down';
      else status = results.every((r) => r.status === 'optimal') ? 'optimal' : 'degraded';
      const fwd = Math.max(0, ...ups.map((r) => r.fwdCap));
      const ret = ups.reduce((s, r) => s + r.retCap, 0);
      const hubIsA = hubLink.a === hub.id;
      const up = status !== 'down';
      states.set(hubLink.id, {
        kind: 'vsat',
        role: 'hub',
        up,
        status,
        capacityMbps: up ? Math.max(fwd, ret, results.length ? 0 : 100) : 0,
        capacityDir: { ab: up ? (hubIsA ? fwd || 100 : ret || 100) : 0, ba: up ? (hubIsA ? ret || 100 : fwd || 100) : 0 },
        latencyMs: slant / C_KM_MS + orbit.processingMs / 2,
        sat,
        hub,
        remotes: results,
        issues,
        label: `${g.band} ${orbit.id} · Hub · ${results.length} station(s)`,
      });
    }
  }

  /* --- Constellations défilantes --- */
  function constellationOf(sat, t) {
    return SP.constellationState(sat.props.orbit, t, { satsPerPlane: num(sat.props.satsPerPlane, 24), maxElevationDeg: num(sat.props.passMaxElevDeg, 75) });
  }
  function satHist(sat) {
    return (S.satHist[sat.id] = S.satHist[sat.id] || { handovers: 0, gaps: 0, rttMin: Infinity, rttMax: -Infinity, elMin: Infinity, elMax: -Infinity, dopplerMaxKHz: 0 });
  }
  /** Détecte les handovers et les trous de couverture (journal + compteurs). */
  function trackServing(sat, cs) {
    const cur = cs.serving ? cs.serving.index : 0;
    const prev = S.satTrack[sat.id];
    const hist = satHist(sat);
    if (prev !== undefined && prev !== cur) {
      if (cur === 0) {
        hist.gaps++;
        stat('coverageGap');
        log(`⛔ ${sat.name} : trou de couverture à T+${clockTxt(S.sim.t)} (aucun satellite au-dessus de ${fmt(cs.minEl, 0)}°).`, 'error');
      } else if (prev === 0) {
        log(`✔ ${sat.name} : couverture rétablie par le satellite n° ${cur} à T+${clockTxt(S.sim.t)}.`, 'ok');
      } else {
        hist.handovers++;
        stat('handover');
        log(`↷ ${sat.name} : handover du satellite n° ${prev} vers le n° ${cur} à T+${clockTxt(S.sim.t)} (coupure de quelques dizaines de ms).`, 'warn');
      }
    }
    S.satTrack[sat.id] = cur;
    // Position visuelle : le satellite servant traverse la bande orbitale de droite à gauche
    S.satVis[sat.id] = cs.serving ? U.clamp(-cs.serving.alongDeg / Math.max(cs.halfVisibleDeg, 0.5), -1.3, 1.3) * 170 : 0;
  }
  function clockTxt(t) {
    const s = Math.max(0, Math.floor(t));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s % 60).padStart(2, '0');
  }
  /** Position affichée d'un équipement (un satellite défilant est décalé le long de son orbite). */
  function vpos(n) {
    return n.type === 'satellite' && S.satVis[n.id] ? { x: n.x + S.satVis[n.id], y: n.y } : { x: n.x, y: n.y };
  }
  function hasMovingSat() {
    return S.topo.nodes.some((n) => n.type === 'satellite' && n.props.orbit !== 'GEO' && n.props.motion === 'moving');
  }
  function setClock(playing) {
    S.sim.playing = playing;
    $('#btn-clock use').setAttribute('href', playing ? '#ico-pause' : '#ico-play');
    $('#btn-clock').classList.toggle('active', playing);
    if (playing) stat('clockStart');
  }
  function updateClockUi() {
    $('#clock-time').textContent = 'T+' + clockTxt(S.sim.t);
  }

  /* --- Contexte du moteur de pannes : qui est relié à quoi --- */
  function fhRadioEnd(o) {
    if (!o) return null;
    if (o.type === 'antenna' || o.type === 'fullOutdoor') return o;
    if (o.type === 'odu') return neighborOfType(o, 'antenna', ['if']);
    if (o.type === 'idu') {
      const odu = neighborOfType(o, 'odu', ['if']);
      return odu ? neighborOfType(odu, 'antenna', ['if']) : null;
    }
    return null;
  }
  function fhLinkOfNode(o) {
    const end = fhRadioEnd(o);
    return end ? radioLinksOf(end).find((l) => l.medium === 'fh') || null : null;
  }
  function faultCtx() {
    const partnerEnd = (o) => {
      const end = fhRadioEnd(o);
      const l = end && fhLinkOfNode(end);
      return l ? nodeById(l.a === end.id ? l.b : l.a) : null;
    };
    const rfOfEnd = (end) => (!end ? null : end.type === 'fullOutdoor' ? end : neighborOfType(end, 'odu', ['if']));
    const vsatOf = (o) => {
      let ant = null;
      if (o.type === 'vsatAntenna') ant = o;
      else if (o.type === 'buc' || o.type === 'lnb') ant = neighborOfType(o, 'vsatAntenna', ['coax']);
      else if (o.type === 'vsatModem') {
        const c = neighbors(o, ['coax']).map((x) => x.node).find((x) => x.type === 'buc' || x.type === 'lnb');
        ant = c ? neighborOfType(c, 'vsatAntenna', ['coax']) : null;
      }
      const link = ant && radioLinksOf(ant).find((l) => l.medium === 'vsat');
      if (!link) return null;
      const sat = nodeById(link.a === ant.id ? link.b : link.a);
      return { ant, link, sat, fixedPointing: !!sat && (sat.props.orbit || 'GEO') === 'GEO' };
    };
    return {
      fhLinkOf: fhLinkOfNode,
      fhLinkOfCable: (l) => [nodeById(l.a), nodeById(l.b)].map(fhLinkOfNode).find(Boolean) || null,
      fhPartnerAntenna: partnerEnd,
      fhPartnerRf: (o) => rfOfEnd(partnerEnd(o)),
      bandChannels: (o) => RP.getFhBand(o.props.band).channels.slice(),
      beamwidthDeg: (o) => {
        const rf = o.type === 'fullOutdoor' ? o : neighborOfType(o, 'odu', ['if']);
        const f = RP.getFhBand(rf ? rf.props.band : '18').f;
        return RP.dishBeamwidthDeg(num(o.props.diameterM, 0.6), f);
      },
      vsatOf,
      vsatOfCable: (l) => [nodeById(l.a), nodeById(l.b)].filter(Boolean).map(vsatOf).find(Boolean) || null,
      blrLinkOf: (o) => radioLinksOf(o).find((l) => l.medium === 'blr') || null,
    };
  }
  /** Signature de l'état du réseau (flux en service, état des liaisons radio) pour juger l'effet d'une panne. */
  function healthSignature() {
    computeAll();
    const rank = { optimal: 2, degraded: 1, down: 0 };
    const flows = (S.analysis ? S.analysis.flows : []).map((f) => !!(f.ok || (f.result && f.result.ok) || f.status === 'ok'));
    const radio = S.topo.links.filter((l) => RADIO_MEDIA.includes(l.medium)).map((l) => rank[(l.state || {}).status] || 0);
    return { flows, radio };
  }
  const worse = (a, b) => b.flows.some((v, i) => a.flows[i] && !v) || b.radio.some((v, i) => v < a.radio[i]);
  /**
   * Tire au hasard n pannes (cachées) qui dégradent réellement le réseau, sur des objets distincts
   * et au plus une par bond radio. opts.kinds : ['hw', 'cfg'].
   */
  function randomFaults(n, opts = {}) {
    const ctx = faultCtx();
    const rnd = opts.rnd || Math.random;
    const base = healthSignature();
    const cands = PN().candidates(S.topo, ctx, opts);
    for (let i = cands.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [cands[i], cands[j]] = [cands[j], cands[i]];
    }
    // Variété : un type de panne différent pour chaque tirage, tant que c'est possible
    const seenType = new Set();
    const firstOfType = [];
    const rest = [];
    for (const c of cands) (seenType.has(c.type) ? rest : firstOfType).push(c) && seenType.add(c.type);
    cands.splice(0, cands.length, ...firstOfType, ...rest);
    const done = [];
    const usedHops = new Set();
    for (const c of cands) {
      if (done.length >= n) break;
      if (faultOf(c.obj)) continue;
      const hop = c.obj.medium ? ctx.fhLinkOfCable(c.obj) || ctx.vsatOfCable(c.obj) : fhLinkOfNode(c.obj) || (ctx.vsatOf(c.obj) || {}).link || ctx.blrLinkOf(c.obj);
      const hopId = hop ? hop.id || (hop.link && hop.link.id) : null;
      if (hopId && usedHops.has(hopId)) continue;
      PN().inject(c.obj, c.type, ctx, rnd, opts.hidden !== false);
      if (worse(base, healthSignature())) {
        done.push({ obj: c.obj, type: c.type });
        if (hopId) usedHops.add(hopId);
      } else PN().repair(c.obj);
    }
    update({ keepInspector: true });
    return done;
  }

  

  /* --- Mode Dépannage : journal, interventions, voyants --- */
  /** Journal d'intervention (mesures, interventions) : sert aussi à l'examen pratique. */
  function journalAdd(e) {
    S.journal = S.journal || [];
    S.journal.push(Object.assign({ t: Date.now() }, e));
  }
  /** Liaison radio concernée par un objet (équipement de la chaîne ou câble). */
  function hopOf(o) {
    if (!o) return null;
    if (o.medium) {
      if (RADIO_MEDIA.includes(o.medium)) return o;
      const c = faultCtx();
      return c.fhLinkOfCable(o) || (c.vsatOfCable(o) || {}).link || o;
    }
    const c = faultCtx();
    return fhLinkOfNode(o) || (c.vsatOf(o) || {}).link || c.blrLinkOf(o) || null;
  }
  /** Mesure enregistrée : bilan ou profil d'une liaison ouvert. */
  function recordMeasure() {
    const sel = S.selection;
    if (!sel) return;
    const o = sel.kind === 'link' ? S.topo.links.find((l) => l.id === sel.id) : nodeById(sel.id);
    const hop = hopOf(o) || o;
    if (hop) journalAdd({ kind: 'mesure', target: hop.id, name: hop.medium ? linkName(hop) : hop.name });
  }
  function intervene(o, action) {
    pushHistory();
    const hop = hopOf(o);
    const measured = (S.journal || []).some((j) => (j.kind === 'mesure' && (!hop || j.target === hop.id || j.target === o.id)) || j.kind === 'ping');
    const r = PN().intervene(o, action);
    const name = o.name || linkName(o);
    journalAdd({ kind: 'intervention', target: o.id, name, action, hit: r.hit, measured });
    stat('intervention');
    log(`🔧 Intervention sur « ${name} » : ${PN().INTERVENTIONS[action].verb}. Contrôlez le résultat par une mesure.`, 'info');
    update();
  }
  /** Encadré « Intervention » de l'inspecteur (mode Dépannage). */
  function interventionBox(o) {
    const list = PN().interventionsFor(o);
    const box = document.createElement('div');
    box.className = 'fault-box intervention-box';
    box.innerHTML = `<h4>Intervention sur site</h4><p class="small-muted">${
      list.length ? 'Intervenez seulement après avoir localisé le défaut par la mesure : un déplacement inutile coûte cher (et compte dans l’examen pratique).' : 'Aucune intervention matérielle possible : vérifiez les réglages.'
    }</p>`;
    const row = document.createElement('div');
    row.className = 'btn-row';
    for (const it of list) {
      const b = document.createElement('button');
      b.className = 'btn btn-xs';
      b.textContent = '🔧 ' + it.label;
      b.dataset.intervene = it.id;
      b.onclick = () => intervene(o, it.id);
      row.appendChild(b);
    }
    box.appendChild(row);
    return box;
  }
  /** Voyants d'un équipement (symptômes observables, jamais le nom d'une panne). */
  function ledsFor(n) {
    const links = S.topo.links.filter((l) => l.a === n.id || l.b === n.id);
    const hop = hopOf(n);
    const hs = hop && hop.state ? hop.state.status : null;
    const sig = (s) => (s === 'optimal' ? 'on' : s === 'degraded' ? 'warn' : 'err');
    const leds = [];
    let power = !isDead(n);
    if (n.type === 'odu') {
      const idu = neighborOfType(n, 'idu', ['if']);
      const cable = neighbors(n, ['if']).find((x) => x.node.type === 'idu');
      if ((idu && isDead(idu)) || (cable && cableCut(cable.link))) power = false;
    }
    leds.push({ label: 'Alim.', cls: power ? 'on' : 'off' });
    if (!power) return leds.concat([{ label: 'Signal', cls: 'off' }, { label: 'Alarme', cls: 'off' }]);
    if (['odu', 'idu', 'fullOutdoor', 'antenna', 'blrCpe'].includes(n.type) && hs) {
      leds.push({ label: 'Signal reçu', cls: sig(hs) });
      leds.push({ label: 'Alarme', cls: hs === 'optimal' ? 'off' : hs === 'degraded' ? 'warn' : 'err' });
    }
    if (n.type === 'vsatModem' && hop && hop.state) {
      leds.push({ label: 'Rx (verrouillage)', cls: hop.state.fwdCap > 0 ? 'on' : 'err' });
      leds.push({ label: 'Tx', cls: hop.state.retCap > 0 ? 'on' : 'err' });
    }
    const wired = links.filter((l) => ['ethernet', 'fiber'].includes(l.medium));
    if (wired.length) {
      const up = wired.filter((l) => l.state && l.state.up).length;
      leds.push({ label: `Ports ${up}/${wired.length}`, cls: up === wired.length ? 'on' : up ? 'warn' : 'err' });
    }
    return leds;
  }
  function ledsHtml(n) {
    const leds = ledsFor(n);
    return `<div class="leds" title="Voyants de l’équipement (vert : normal, orange : dégradé, rouge : alarme, gris : éteint)">${leds.map((l) => `<span class="led ${l.cls}"><i></i>${esc(l.label)}</span>`).join('')}</div>`;
  }


  /* --- Recette réaliste : écarts de terrain reproductibles (graine), fiche et rapport de recette --- */
  const RECETTE_TOL = 3; // écart toléré entre mesure et calcul (dB)
  function recetteCfg() {
    return S.topo.settings.recette || null;
  }
  const recetteOn = () => !!(recetteCfg() && recetteCfg().actif);
  function hash32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  /** Tirage reproductible dans [a, b] pour une clé (graine de la recette). */
  function recU(key, a, b) {
    let t = (hash32(String(recetteCfg().seed) + '|' + key) + 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return a + (b - a) * u;
  }
  /**
   * Écart réel − calcul (dB, > 0 = mieux que le calcul) d'une liaison FH ou BLR, de l'émetteur tx vers le récepteur rx :
   * tolérance de puissance d'émission, gains réels des antennes, pertes de branchement, propagation par ciel clair.
   */
  function recetteDelta(link, txNode, rxNode, dir) {
    if (!recetteOn() || !txNode || !rxNode) return 0;
    const g = (n) => recU('g' + n.id, -0.6, 0.3);
    const br = (n) => recU('b' + n.id, -0.2, 0.7);
    return recU('tx' + txNode.id, -1, 1) + g(txNode) + g(rxNode) - br(txNode) - br(rxNode) + recU('air' + link.id + dir, -0.5, 0.5);
  }
  /** Écarts réels d'une station VSAT (montant : BUC et antenne ; descendant : LNB et antenne). */
  function recetteVsat(ant, buc, lnb) {
    if (!recetteOn() || !ant) return { up: 0, down: 0 };
    const g = recU('g' + ant.id, -0.6, 0.3);
    return { up: g + (buc ? recU('buc' + buc.id, -1, 0.5) : 0), down: g + (lnb ? recU('lnb' + lnb.id, -0.8, 0.4) : 0) };
  }
  /** Lignes de la fiche de recette : une grandeur mesurable par sens de chaque liaison radio. */
  function recetteRows() {
    const rc = recetteCfg() || {};
    const mes = rc.mesures || {};
    const rows = [];
    const add = (l, dir, what, unit, calc, real) => {
      const key = `${l.id}:${dir}`;
      rows.push({ key, link: linkName(l), what, unit, calc: Number.isFinite(calc) ? calc : null, real: Number.isFinite(real) ? real : null, mesure: Number.isFinite(mes[key]) ? mes[key] : null });
    };
    for (const l of S.topo.links) {
      const st = l.state;
      if (!st) continue;
      if (l.medium === 'fh' && st.budgets && st.ends) {
        add(l, 'ab', `RSL reçu à ${endName(st.ends.B.node)}`, 'dBm', st.budgets.ab.rslCalc, st.up ? st.budgets.ab.rsl : null);
        add(l, 'ba', `RSL reçu à ${endName(st.ends.A.node)}`, 'dBm', st.budgets.ba.rslCalc, st.up ? st.budgets.ba.rsl : null);
      } else if (l.medium === 'blr' && st.budgets) {
        add(l, 'dl', `RSL reçu au CPE ${st.cpe.name}`, 'dBm', st.budgets.dl.rslCalc, st.up ? st.budgets.dl.rsl : null);
        add(l, 'ul', `RSL reçu à la BTS ${st.bts.name}`, 'dBm', st.budgets.ul.rslCalc, st.up ? st.budgets.ul.rsl : null);
      } else if (l.medium === 'vsat' && st.role === 'remote' && st.measure) {
        add(l, 'fwd', `Es/N0 voie aller au modem${st.chain && st.chain.modem ? ' ' + st.chain.modem.name : ''}`, 'dB', st.measure.fwdEsn0Calc, st.up ? st.measure.fwdEsn0 : null);
      }
    }
    return rows;
  }
  /** Conclusion d'une ligne de recette : écart = mesure − calcul. */
  function recetteVerdict(r, tol = RECETTE_TOL) {
    if (r.mesure === null || r.calc === null) return { code: 'nc', ecart: null, txt: r.mesure === null ? 'à mesurer' : '—' };
    const e = r.mesure - r.calc;
    if (e < -tol) return { code: 'los', ecart: e, txt: 'Non conforme : perte anormale à localiser' };
    if (e > tol) return { code: 'weak', ecart: e, txt: 'Suspect : mesure meilleure que le calcul, vérifier la lecture' };
    return { code: 'ok', ecart: e, txt: 'Conforme' };
  }
  function recetteTol() {
    const rc = recetteCfg();
    return rc && Number.isFinite(Number(rc.tol)) ? Number(rc.tol) : RECETTE_TOL;
  }
  function ensureRecette() {
    if (!S.topo.settings.recette) S.topo.settings.recette = { actif: false, seed: Math.floor(Math.random() * 1e9), tol: RECETTE_TOL, mesures: {} };
    const rc = S.topo.settings.recette;
    rc.mesures = rc.mesures || {};
    return rc;
  }
  const parseDb = (v) => {
    const t = String(v === undefined || v === null ? '' : v).trim().replace(/\s/g, '').replace(',', '.').replace('−', '-');
    return t === '' ? null : Number.isFinite(Number(t)) ? Number(t) : NaN;
  };
  /** Fiche de recette (onglet Bilan de liaison, sans sélection). */
  function recetteFicheHtml() {
    const rows = recetteRows();
    const tol = recetteTol();
    let h = `<div class="section recette"><div class="section-title">Fiche de recette</div>`;
    if (!rows.length) return h + '<p class="small-muted">Aucune liaison radio à réceptionner.</p></div>';
    h += recetteOn()
      ? `<p class="small-muted">Mode <b>recette réaliste</b> : comme sur le terrain, chaque liaison réelle s’écarte un peu du calcul (tolérances des émetteurs, gains réels des antennes, connecteurs, propagation). Sélectionnez chaque liaison, relevez la valeur <b>mesurée</b> sur l’équipement de réception (onglet Bilan de liaison), saisissez-la ci-dessous puis concluez. Écart toléré : ± ${fmt(tol, 1)} dB.</p>`
      : `<p class="small-muted">Saisissez la valeur relevée sur l’équipement de réception (onglet Bilan de liaison de chaque liaison) : l’écart avec le calcul et la conclusion s’affichent. Écart toléré : ± ${fmt(tol, 1)} dB.</p>`;
    let teacherCol = '';
    
    h += `<table class="data-table recette-table"><thead><tr><th>Liaison · grandeur</th><th>Calcul</th><th>Mesure</th><th>Écart</th>${teacherCol}</tr></thead><tbody>`;
    rows.forEach((r) => {
      const v = recetteVerdict(r, tol);
      let realTd = '';
      
      h += `<tr><td>${esc(r.link)}<br><small>${esc(r.what)}</small></td><td class="num">${r.calc === null ? '—' : fmt(r.calc, 1) + ' ' + r.unit}</td><td><input type="text" inputmode="decimal" class="rec-in" data-recette="${esc(r.key)}" value="${r.mesure === null ? '' : fmt(r.mesure, 1)}" placeholder="—" aria-label="Mesure ${esc(r.what)}"></td><td class="num st-${v.code}">${v.ecart === null ? '' : (v.ecart > 0 ? '+' : '') + fmt(v.ecart, 1) + ' dB'}<br><small>${esc(v.txt)}</small></td>${realTd}</tr>`;
    });
    h += '</tbody></table>';
    
    h += `<div class="btn-row"><button class="btn btn-xs" id="rec-rapport" title="Rapport de recette imprimable">🖨 Rapport de recette</button></div></div>`;
    return h;
  }
  function bindRecetteFiche(host) {
    $$('[data-recette]', host).forEach((inp) =>
      inp.addEventListener('change', () => {
        const v = parseDb(inp.value);
        if (Number.isNaN(v)) {
          toast('Valeur non reconnue : saisissez un nombre (ex. −42,5).', 'warn');
          return;
        }
        const rc = ensureRecette();
        if (v === null) delete rc.mesures[inp.dataset.recette];
        else rc.mesures[inp.dataset.recette] = Math.round(v * 10) / 10;
        if (S.locked || S.mode === 'diag') journalAdd({ kind: 'recette', target: inp.dataset.recette, value: v });
        stat('recetteSaisie');
        renderBudget(null);
      })
    );
    const b = (id, fn) => {
      const el = $(id, host);
      if (el) el.addEventListener('click', fn);
    };
    b('#rec-rapport', openRecetteRapport);
    
  }
  /** Rapport de recette : document HTML imprimable (nouvelle fenêtre). */
  function recetteRapportHtml(technicien) {
    const rows = recetteRows();
    const tol = recetteTol();
    const vs = rows.map((r) => recetteVerdict(r, tol));
    const done = vs.filter((v) => v.code !== 'nc').length;
    const ko = vs.filter((v) => v.code === 'los' || v.code === 'weak').length;
    const concl = !rows.length ? 'Aucune liaison radio.' : done < rows.length ? `Recette incomplète : ${rows.length - done} mesure(s) manquante(s).` : ko ? `Recette NON CONFORME : ${ko} écart(s) hors tolérance à traiter avant la réception des travaux.` : 'Recette CONFORME : toutes les mesures sont dans la tolérance.';
    const title = S.topo.settings.title || 'Réseau';
    const body = `<h1>Rapport de recette radio</h1>
      <p class="small">Réseau : <b>${esc(title)}</b> · ${esc(new Date().toLocaleString('fr-FR'))} · Technicien : ${technicien ? esc(technicien) : '..............................'}${recetteOn() ? ' · mesures sur le réseau réel (recette réaliste)' : ''}</p>
      <p class="small">Méthode : chaque valeur mesurée sur l’équipement de réception (RSL lu sur l’IDU / l’AGC de l’ODU, Es/N0 lu sur le modem satellite), par ciel clair, est comparée au calcul du bilan de liaison. Écart toléré : ± ${fmt(tol, 1)} dB.</p>
      <table><tr><th>Liaison</th><th>Grandeur</th><th class="num">Calcul</th><th class="num">Mesure</th><th class="num">Écart</th><th>Conclusion</th></tr>
      ${rows.map((r, i) => `<tr><td>${esc(r.link)}</td><td>${esc(r.what)}</td><td class="num">${r.calc === null ? '—' : fmt(r.calc, 1) + ' ' + r.unit}</td><td class="num">${r.mesure === null ? '' : fmt(r.mesure, 1) + ' ' + r.unit}</td><td class="num">${vs[i].ecart === null ? '' : (vs[i].ecart > 0 ? '+' : '') + fmt(vs[i].ecart, 1) + ' dB'}</td><td class="st-${vs[i].code}">${esc(vs[i].code === 'nc' ? '' : vs[i].txt)}</td></tr>`).join('')}</table>
      <p class="concl"><b>${esc(concl)}</b></p>
      <p class="visas">Visa du technicien : ........................ Visa du responsable de la recette : ........................ Date : ............</p>`;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport de recette — ${esc(title)}</title><style>
      @page { size: A4; margin: 14mm 12mm; } body { font: 12px/1.45 system-ui, "Segoe UI", sans-serif; color: #111; max-width: 190mm; margin: 0 auto; padding: 10mm 0; background: #fff; }
      h1 { font-size: 20px; color: #0e7490; border-bottom: 2px solid #0e7490; padding-bottom: 4px; } table { border-collapse: collapse; width: 100%; margin: 8px 0; }
      td, th { border: 1px solid #c4ccd6; padding: 4px 6px; text-align: left; vertical-align: top; } th { background: #eef4f8; } .num { text-align: right; white-space: nowrap; }
      .small { font-size: 11px; color: #374151; } .st-ok { color: #15803d; } .st-weak { color: #b45309; } .st-los { color: #b91c1c; } .concl { font-size: 13px; margin-top: 10px; } .visas { margin-top: 12mm; }
      </style></head><body>${body}<p class="small">MicroWave, BLR &amp; VSAT Lab</p></body></html>`;
  }
  function openRecetteRapport() {
    let who = '';
    try {
      who = localStorage.getItem('mbv-auteur') || '';
    } catch (e) {
      /* stockage indisponible */
    }
    const html = recetteRapportHtml(S.examActive ? '' : who);
    const w = window.open('', '_blank');
    if (!w) return toast('Fenêtre bloquée par le navigateur : autorisez les fenêtres surgissantes.', 'error');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
    if (S.locked || S.mode === 'diag') journalAdd({ kind: 'recette', target: 'rapport' });
    stat('recetteRapport');
  }

  function computeWired(link) {
    const na = nodeById(link.a);
    const nb = nodeById(link.b);
    const broken = [na, nb].filter(failed);
    const def = NET.WIRED_CAPACITY[link.medium] || 1000;
    const cap = num(link.props && link.props.capacityMbps, def) || def;
    if (broken.length) return downState(link.medium, [{ level: 'error', text: 'Équipement en panne : ' + broken.map((b) => b.name).join(', ') + '.' }]);
    // Panne cachée sur un câble réseau ou un équipement : voyants de port éteints (le câble IF / coaxial agit sur la chaîne radio)
    if (['ethernet', 'fiber'].includes(link.medium) && (cableCut(link) || [na, nb].some(deadHw))) {
      const rev = revealedIssue(link);
      return downState(link.medium, [rev || { level: 'error', text: 'Pas de lien : voyants de port éteints.' }]);
    }
    return { kind: link.medium, up: true, status: 'optimal', capacityMbps: cap, latencyMs: NET.DEFAULT_LATENCY[link.medium] || 0.05, issues: [] };
  }

  /** Recalcule tous les liens puis la couche réseau. */
  function computeAll() {
    const states = new Map();
    for (const sat of S.topo.nodes.filter((n) => n.type === 'satellite')) computeSatellite(sat, states);
    S.fhTx = [];
    if (interferenceOn()) {
      for (const l of S.topo.links) {
        if (l.medium !== 'fh' || (l.props && l.props.cut)) continue;
        try {
          const p = computeFh(l, { probe: true });
          if (p && p.tx) S.fhTx.push(...p.tx);
        } catch (err) {
          console.error(err);
        }
      }
    }
    for (const l of S.topo.links) {
      let st;
      try {
        if (l.medium === 'fh') st = computeFh(l);
        else if (l.medium === 'blr') st = computeBlr(l);
        else if (l.medium === 'vsat') st = states.get(l.id) || downState('vsat', [{ level: 'error', text: 'Liaison satellite incomplète.' }]);
        else st = computeWired(l);
      } catch (err) {
        console.error(err);
        st = downState(l.medium, [{ level: 'error', text: 'Erreur de calcul : ' + err.message }]);
      }
      if (l.props && l.props.cut) {
        st = Object.assign({}, st, { up: false, status: 'down', capacityMbps: 0, capacityDir: { ab: 0, ba: 0 }, cut: true });
        st.issues = [{ level: 'error', text: 'Lien coupé manuellement (mode Diagnostic).' }].concat(st.issues || []);
        if (RADIO_MEDIA.includes(l.medium)) st.label = 'COUPÉ';
      }
      l.state = st;
    }
    logLinkChanges();
    // Couche réseau
    const prev = S.analysis;
    S.engine = new NET.NetworkEngine(S.topo);
    S.analysis = S.engine.analyze();
    if (prev) {
      for (const ev of NET.NetworkEngine.compare(prev, S.analysis, S.engine)) log(ev.text, ev.level);
    }
    S.flowPolylines.clear();
  }

  function logLinkChanges() {
    for (const l of S.topo.links) {
      if (!RADIO_MEDIA.includes(l.medium)) continue;
      const st = l.state;
      const key = st.status + '|' + modOf(st);
      const prev = S.prevLinkStatus.get(l.id);
      if (prev !== undefined && prev !== key) {
        const name = linkName(l);
        const r = rain();
        const ctx = r > 0 ? ` (pluie ${fmt(r, 0)} mm/h)` : '';
        if (st.status === 'down') log(`✖ ${name} : COUPURE${ctx}.`, 'error');
        else if (st.status === 'degraded') log(`▼ ${name} : repli de modulation → ${modOf(st)}${ctx}.`, 'warn');
        else log(`▲ ${name} : modulation optimale ${modOf(st)}${ctx}.`, 'ok');
      }
      S.prevLinkStatus.set(l.id, key);
    }
    for (const id of [...S.prevLinkStatus.keys()]) if (!linkById(id)) S.prevLinkStatus.delete(id);
  }
  function modOf(st) {
    if (!st || !st.up) return '—';
    if (st.kind === 'fh') return (st.budgets.ab.activeModulation || {}).id || '—';
    if (st.kind === 'blr') return (st.budgets.dl.activeModulation || {}).id || '—';
    if (st.kind === 'vsat' && st.result) return (st.result.forward.modcod || {}).id || '—';
    return '';
  }
  function linkName(l) {
    if (l.props && l.props.name) return l.props.name;
    const a = nodeById(l.a);
    const b = nodeById(l.b);
    const an = a ? (siteOf(a) ? siteOf(a).name : a.name) : '?';
    const bn = b ? (siteOf(b) ? siteOf(b).name : b.name) : '?';
    const prefix = { fh: 'FH', blr: 'BLR', vsat: 'VSAT' }[l.medium] || '';
    return (prefix ? prefix + ' ' : '') + an + ' ↔ ' + bn;
  }

  /** Point d'entrée : recalcule et redessine tout. */
  function update(opts = {}) {
    computeAll();
    render();
    if (!opts.keepInspector) renderInspector();
    else renderInspector({ keepProps: true });
    renderFlowsTable();
    updateStatusBar();
    evaluateLab();
    scheduleSessionSave();
  }
  function scheduleUpdate(opts) {
    if (S.computeQueued) return;
    S.computeQueued = true;
    requestAnimationFrame(() => {
      S.computeQueued = false;
      update(opts);
    });
  }

  /* ------------------------------------------------------------------
   * 5. RENDU SVG DU CANEVAS
   * ------------------------------------------------------------------ */
  const svg = $('#canvas');
  const wrap = $('#canvas-wrap');
  const L = {
    defs: $('#canvas-defs'),
    viewport: $('#viewport'),
    bg: $('#layer-background'),
    grid: $('#layer-grid'),
    links: $('#layer-links'),
    beams: $('#layer-beams'),
    nodes: $('#layer-nodes'),
    packets: $('#layer-packets'),
    overlay: $('#layer-overlay'),
  };

  function el(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }
  function clear(g) {
    while (g.firstChild) g.removeChild(g.firstChild);
  }

  function initDefs() {
    clear(L.defs);
    const gs = el('linearGradient', { id: 'grad-space', x1: 0, y1: 0, x2: 0, y2: 1 }, L.defs);
    el('stop', { offset: '0%', 'stop-color': cssVar('--sky-0', '#02040b') }, gs);
    el('stop', { offset: '75%', 'stop-color': cssVar('--sky-1', '#0a1033') }, gs);
    el('stop', { offset: '100%', 'stop-color': cssVar('--sky-2', '#16245a') }, gs);
    const ge = el('linearGradient', { id: 'grad-earth', x1: 0, y1: 0, x2: 0, y2: 1 }, L.defs);
    el('stop', { offset: '0%', 'stop-color': cssVar('--ground-0', '#10203a') }, ge);
    el('stop', { offset: '8%', 'stop-color': cssVar('--ground-1', '#0c1626') }, ge);
    el('stop', { offset: '100%', 'stop-color': cssVar('--ground-2', '#0a1320') }, ge);
    const pat = el('pattern', { id: 'pat-rain', width: 14, height: 14, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(15)' }, L.defs);
    el('line', { x1: 7, y1: 0, x2: 7, y2: 8, stroke: cssVar('--rain-stroke', '#93c5fd'), 'stroke-width': 1.2, 'stroke-linecap': 'round' }, pat);
  }

  /* --- Ergonomie : thème, panneaux redimensionnables, session restaurée --- */
  const cssVar = (name, def) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || def;
  };
  const lsGetE = (k) => {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  };
  const lsSetE = (k, v) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (e) {
      /* stockage indisponible : réglage non mémorisé */
    }
  };
  function currentTheme() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }
  function applyTheme(t, opts = {}) {
    if (t === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    if (!opts.temporary) lsSetE('mbv-theme', t === 'light' ? 'light' : null);
    initDefs();
    render();
    if (!opts.temporary) {
      renderInspector({ keepProps: true });
      stat('theme_' + t);
    }
  }
  /** Poignées de redimensionnement : boîte à outils, inspecteur, console. */
  const LAYOUT_VARS = { left: '--left-w', right: '--right-w', console: '--console-h' };
  const LAYOUT_LIMITS = { left: [180, 480], right: [300, 720], console: [90, 520] };
  function initResizers() {
    let saved = {};
    try {
      saved = JSON.parse(lsGetE('mbv-layout') || '{}') || {};
    } catch (e) {
      saved = {};
    }
    for (const [k, v] of Object.entries(saved)) if (LAYOUT_VARS[k] && Number.isFinite(v)) document.documentElement.style.setProperty(LAYOUT_VARS[k], v + 'px');
    const save = () => {
      const o = {};
      for (const [k, name] of Object.entries(LAYOUT_VARS)) {
        const v = document.documentElement.style.getPropertyValue(name);
        if (v) o[k] = parseFloat(v);
      }
      lsSetE('mbv-layout', Object.keys(o).length ? JSON.stringify(o) : null);
    };
    $$('.resizer').forEach((h) => {
      const k = h.dataset.resize;
      h.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try {
          h.setPointerCapture(e.pointerId);
        } catch (err) {
          /* pointeur non capturable (événement simulé) : le glisser fonctionne quand même */
        }
        h.classList.add('dragging');
        document.body.classList.add('resizing');
        const start = { x: e.clientX, y: e.clientY, w: $('#toolbox').offsetWidth, r: $('#inspector').offsetWidth, c: $('#console').offsetHeight };
        const move = (ev) => {
          const [lo, hi] = LAYOUT_LIMITS[k];
          const val = k === 'left' ? start.w + ev.clientX - start.x : k === 'right' ? start.r - (ev.clientX - start.x) : start.c - (ev.clientY - start.y);
          document.documentElement.style.setProperty(LAYOUT_VARS[k], Math.round(Math.max(lo, Math.min(hi, val))) + 'px');
          applyView();
        };
        const up = () => {
          h.classList.remove('dragging');
          document.body.classList.remove('resizing');
          h.removeEventListener('pointermove', move);
          h.removeEventListener('pointerup', up);
          save();
          applyView();
        };
        h.addEventListener('pointermove', move);
        h.addEventListener('pointerup', up);
      });
      h.addEventListener('dblclick', () => {
        document.documentElement.style.removeProperty(LAYOUT_VARS[k]);
        save();
        applyView();
      });
    });
  }
  /* Session : la topologie, la vue, le mode et le TP en cours sont mémorisés sur le poste et restaurés à l'ouverture. */
  const LS_SESSION = 'mbv-session-v1';
  let sessionTimer = null;
  function scheduleSessionSave() {
    if (S.examActive || S.restoringSession) return;
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(saveSession, 700);
  }
  function saveSession() {
    if (S.examActive) return;
    if (!S.topo.nodes.length) {
      lsSetE(LS_SESSION, null);
      return;
    }
    const data = { savedAt: Date.now(), topo: serialize(), view: S.view, mode: S.mode, labId: S.lab ? S.lab.id : null, labStep: S.labStep || 0 };
    lsSetE(LS_SESSION, JSON.stringify(data));
  }
  /** Restaure la dernière session (sauf examen en cours, repris par exam.js). */
  function restoreSession() {
    if (lsGetE('mbv-examen-en-cours-v1')) return false;
    let d = null;
    try {
      d = JSON.parse(lsGetE(LS_SESSION) || 'null');
    } catch (e) {
      d = null;
    }
    if (!d || !d.topo || !Array.isArray(d.topo.nodes) || !d.topo.nodes.length) return false;
    S.restoringSession = true;
    try {
      loadTopology(d.topo, { silent: true });
      if (d.view && Number.isFinite(d.view.k)) S.view = d.view;
      setMode(d.mode || 'design');
      const lab = d.labId ? findActivity(d.labId) : null;
      if (lab) {
        S.lab = lab;
        S.labStep = Math.min(Math.max(0, d.labStep || 0), lab.steps.length - 1);
        $('#lab-coach').hidden = false;
        renderCoach();
      }
    } finally {
      S.restoringSession = false;
    }
    update();
    applyView();
    const when = new Date(d.savedAt || Date.now()).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    log(`↺ Session restaurée (${when}) : « ${S.topo.settings.title || 'Topologie sans titre'} ». « Nouveau » pour repartir d’une page blanche.`, 'info');
    return true;
  }

  function visibleWorld() {
    const r = wrap.getBoundingClientRect();
    const k = S.view.k;
    return { x0: -S.view.x / k, y0: -S.view.y / k, x1: (r.width - S.view.x) / k, y1: (r.height - S.view.y) / k, w: r.width, h: r.height };
  }

  function renderBackground() {
    clear(L.bg);
    clear(L.grid);
    const v = visibleWorld();
    const pad = 200;
    const x0 = v.x0 - pad;
    const x1 = v.x1 + pad;
    const y0 = Math.min(v.y0 - pad, 0);
    const y1 = v.y1 + pad;
    if (y0 < HORIZON_Y) el('rect', { class: 'bg-space', x: x0, y: y0, width: x1 - x0, height: HORIZON_Y - y0 }, L.bg);
    el('rect', { class: 'bg-earth', x: x0, y: HORIZON_Y, width: x1 - x0, height: Math.max(0, y1 - HORIZON_Y) }, L.bg);
    // Étoiles déterministes par tuile de 200 px
    const tile = 200;
    const stars = el('g', { class: 'stars' }, L.bg);
    for (let tx = Math.floor(x0 / tile); tx <= Math.ceil(x1 / tile); tx++) {
      for (let ty = Math.floor(y0 / tile); ty * tile < HORIZON_Y - 20; ty++) {
        let seed = (tx * 73856093) ^ (ty * 19349663);
        for (let i = 0; i < 7; i++) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          const sx = tx * tile + (seed % tile);
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          const sy = ty * tile + (seed % tile);
          if (sy > HORIZON_Y - 15) continue;
          el('circle', { class: 'star', cx: sx, cy: sy, r: (seed % 3) * 0.35 + 0.4, opacity: 0.25 + (seed % 5) * 0.12 }, stars);
        }
      }
    }
    // Orbites
    const orbitTxt = { GEO: 'GEO · 35 786 km', MEO: 'MEO · 8 062 km', LEO: 'LEO · 550 km' };
    for (const [o, y] of Object.entries(ORBIT_Y)) {
      el('line', { class: 'orbit-line', x1: x0, y1: y, x2: x1, y2: y }, L.bg);
      const t = el('text', { class: 'orbit-label', x: v.x0 + 12 / S.view.k, y: y - 6 }, L.bg);
      t.textContent = orbitTxt[o];
    }
    el('line', { class: 'bg-horizon', x1: x0, y1: HORIZON_Y, x2: x1, y2: HORIZON_Y }, L.bg);
    const ls = el('text', { class: 'bg-zone-label', x: v.x1 - 14 / S.view.k, y: 26, 'text-anchor': 'end' }, L.bg);
    ls.textContent = 'Segment spatial';
    const le = el('text', { class: 'bg-zone-label earth', x: v.x1 - 14 / S.view.k, y: HORIZON_Y + 22, 'text-anchor': 'end' }, L.bg);
    le.textContent = 'Segment terrestre (vue en plan)';
    // Grille (sol uniquement)
    const gx0 = Math.floor(x0 / GRID) * GRID;
    const gy0 = HORIZON_Y;
    for (let x = gx0; x <= x1; x += GRID) {
      el('line', { class: Math.round(x / GRID) % 5 === 0 ? 'grid-major' : 'grid-minor', x1: x, y1: gy0, x2: x, y2: y1 }, L.grid);
    }
    for (let y = gy0; y <= y1; y += GRID) {
      el('line', { class: Math.round((y - gy0) / GRID) % 5 === 0 ? 'grid-major' : 'grid-minor', x1: x0, y1: y, x2: x1, y2: y }, L.grid);
    }
    // Barre d'échelle (5 carreaux)
    const sb = el('g', { class: 'scale-bar' }, L.grid);
    const bx = v.x1 - (5 * GRID + 30 / S.view.k);
    const by = v.y1 - 62 / S.view.k; // au-dessus de la légende
    el('line', { x1: bx, y1: by, x2: bx + 5 * GRID, y2: by }, sb);
    el('line', { x1: bx, y1: by - 4, x2: bx, y2: by + 4 }, sb);
    el('line', { x1: bx + 5 * GRID, y1: by - 4, x2: bx + 5 * GRID, y2: by + 4 }, sb);
    const st = el('text', { x: bx + 2.5 * GRID, y: by - 7, 'text-anchor': 'middle' }, sb);
    st.textContent = fmt(5 * num(S.topo.settings.scaleKm, 2), 2).replace(/,00$/, '') + ' km';
    // Pluie
    const r = rain();
    if (r > 0 && S.mode === 'weather') {
      el('rect', { x: x0, y: HORIZON_Y, width: x1 - x0, height: Math.max(0, y1 - HORIZON_Y), fill: 'url(#pat-rain)', opacity: Math.min(0.75, 0.1 + r / 130), 'pointer-events': 'none' }, L.grid);
    }
  }

  function applyView() {
    L.viewport.setAttribute('transform', `translate(${S.view.x} ${S.view.y}) scale(${S.view.k})`);
    $('#zoom-value').textContent = Math.round(S.view.k * 100) + ' %';
    renderBackground();
  }

  function nodeSubLabel(n) {
    const p = n.props;
    switch (n.type) {
      case 'tower':
        return `${fmt(p.heightM, 0)} m · alt. ${fmt(p.groundM, 0)} m`;
      case 'building':
        return `R+${p.floors} · ${fmt(siteHeightM(n), 0)} m`;
      case 'obstacle':
        return `${fmt(p.heightM, 0)} m · Ø ${fmt(p.widthKm, 1)} km`;
      case 'odu':
        return `${RP.getFhBand(p.band).id} GHz · ${fmt(p.txPowerDbm, 0)} dBm`;
      case 'fullOutdoor':
        return `${RP.getFhBand(p.band).id} GHz · ${fmt(p.diameterM, 1)} m`;
      case 'antenna':
        return `Ø ${fmt(p.diameterM, 1)} m · ${p.polarization} · ${fmt(heightOf(n), 0)} m`;
      case 'idu':
        return `${p.acm ? 'ACM' : 'Fixe'} ${p.maxMod}${p.xpic ? ' · XPIC' : ''}`;
      case 'blrBts':
        return `${p.band} GHz · ${p.sectorDeg}° · az ${fmt(p.azimuthDeg, 0)}°`;
      case 'blrCpe':
        return `${p.install === 'indoor' ? 'Indoor' : 'Outdoor'}${num(p.accessVlan) ? ' · VLAN ' + p.accessVlan : ''}`;
      case 'satellite':
        return `${p.orbit} · ${p.band}${p.orbit === 'GEO' ? ' · ' + fmt(p.lonDeg, 1) + '°' : ''}`;
      case 'hub':
        return `Ø ${fmt(p.dishM, 1)} m · ${p.hpaW} W`;
      case 'vsatAntenna':
        return `Ø ${fmt(p.dishM, 2)} m`;
      case 'buc':
        return `${p.powerW} W`;
      case 'lnb':
        return `NF ${fmt(p.nfDb, 1)} dB`;
      case 'vsatModem':
        return `DVB-S2X${num(p.accessVlan) ? ' · VLAN ' + p.accessVlan : ''}`;
      case 'router':
        return (p.mpls ? 'MPLS' : 'IP') + (p.loopback ? ' · ' + p.loopback : '');
      case 'switch':
        return [p.erps ? 'ERPS' : '', p.rplOwner ? 'RPL owner' : '', p.l3 ? 'L3' : '', p.vlans && p.vlans !== 'all' ? 'VLAN ' + p.vlans : ''].filter(Boolean).join(' · ') || 'L2';
      default:
        if (isEndpoint(n)) {
          const v = S.engine ? S.engine.endpointVlan(n.id) : num(p.vlan);
          return (p.ip || '') + (v ? ' · VLAN ' + v : '');
        }
        return '';
    }
  }

  function renderNodes() {
    clear(L.nodes);
    const storm = new Set(S.analysis ? S.analysis.stormNodes : []);
    const order = [...S.topo.nodes].sort((a, b) => (isSite(b) ? 1 : 0) - (isSite(a) ? 1 : 0));
    for (const n of order) {
      const sz = sizeOf(n);
      const cls = ['node', 'cat-' + catOf(n)];
      if (S.selection && S.selection.kind === 'node' && S.selection.id === n.id) cls.push('selected');
      if (S.pending && S.pending.id === n.id) cls.push('link-source');
      if (storm.has(n.id)) cls.push('storm');
      const vp = vpos(n);
      const g = el('g', { class: cls.join(' '), 'data-node': n.id, transform: `translate(${vp.x} ${vp.y})` }, L.nodes);
      if (n.type === 'obstacle') {
        const r = Math.max(18, (num(n.props.widthKm, 2) / 2) / kmPerPx());
        el('circle', { class: 'obstacle-shape', r, cx: 0, cy: 0 }, g);
        // Poignée d'emprise (largeur) sur le bord du disque
        const wg = el('g', { class: 'height-handle width-handle', 'data-handle': n.id, 'data-hkind': 'width', transform: `translate(${r + 30} 0)` }, g);
        el('rect', { class: 'hh-bg', x: -22, y: -9, width: 44, height: 18, rx: 9 }, wg);
        el('path', { class: 'hh-arrow', d: 'M-26 -4 L-30 0 L-26 4 M26 -4 L30 0 L26 4' }, wg);
        const wt = el('text', { class: 'hh-text', x: 0, y: 0 }, wg);
        wt.textContent = fmt(num(n.props.widthKm, 2), num(n.props.widthKm, 2) < 1 ? 2 : 1) + ' km';
        el('title', null, wg).textContent = 'Tirer vers la gauche ou la droite pour régler la largeur (emprise) de l’obstacle';
      }
      if (n.type === 'obstacle' || n.type === 'building') {
        // Jauge et poignée de hauteur (obstacle : mètres ; immeuble : nombre d'étages)
        const bld = n.type === 'building';
        const val = bld ? num(n.props.floors, 8) : num(n.props.heightM, 60);
        const base = -sz / 2;
        const top = base - 6 - (bld ? val * FLOOR_PX : val * OBST_PX_PER_M);
        el('line', { class: 'tower-mast obstacle-mast', x1: 0, y1: base, x2: 0, y2: top }, g);
        const hg = el('g', { class: 'height-handle', 'data-handle': n.id, 'data-hkind': bld ? 'floors' : 'obst', transform: `translate(0 ${top})` }, g);
        el('rect', { class: 'hh-bg', x: -19, y: -9, width: 38, height: 18, rx: 9 }, hg);
        el('path', { class: 'hh-arrow', d: 'M-4 -12 L0 -16 L4 -12 M-4 12 L0 16 L4 12' }, hg);
        const ht = el('text', { class: 'hh-text', x: 0, y: 0 }, hg);
        ht.textContent = bld ? 'R+' + val : fmt(val, 0) + ' m';
        el('title', null, hg).textContent = bld ? 'Tirer vers le haut ou le bas pour régler le nombre d’étages (R+0 à R+60)' : 'Tirer vers le haut ou le bas pour régler la hauteur de l’obstacle (5 à 400 m)';
      }
      if (n.type === 'blrBts') {
        const R = 130;
        const az = num(n.props.azimuthDeg, 0);
        const half = num(n.props.sectorDeg, 90) / 2;
        const p1 = polar(R, az - half);
        const p2 = polar(R, az + half);
        el('path', { class: 'sector-wedge', d: `M0 0 L${p1.x} ${p1.y} A${R} ${R} 0 0 1 ${p2.x} ${p2.y} Z` }, g);
      }
      if (n.type === 'tower') {
        // Mât gradué + poignée de réglage de la hauteur (à tirer à la souris)
        const hM = num(n.props.heightM, 40);
        const base = -sz / 2;
        const top = base - 6 - hM * MAST_PX_PER_M;
        el('line', { class: 'tower-mast', x1: 0, y1: base, x2: 0, y2: top }, g);
        for (let m = 10; m < hM; m += 10) {
          const yy = base - 6 - m * MAST_PX_PER_M;
          el('line', { class: 'mast-tick', x1: m % 50 === 0 ? -5 : -3, y1: yy, x2: m % 50 === 0 ? 5 : 3, y2: yy }, g);
        }
        const hg = el('g', { class: 'height-handle', 'data-handle': n.id, transform: `translate(0 ${top})` }, g);
        el('rect', { class: 'hh-bg', x: -19, y: -9, width: 38, height: 18, rx: 9 }, hg);
        el('path', { class: 'hh-arrow', d: 'M-4 -12 L0 -16 L4 -12 M-4 12 L0 16 L4 12' }, hg);
        const ht = el('text', { class: 'hh-text', x: 0, y: 0 }, hg);
        ht.textContent = fmt(hM, 0) + ' m';
        const htt = el('title', null, hg);
        htt.textContent = `Tirer vers le haut ou le bas pour régler la hauteur du pylône (${TOWER_MIN_M} à ${TOWER_MAX_M} m)`;
      }
      el('rect', { class: 'node-bg', x: -sz / 2, y: -sz / 2, width: sz, height: sz, rx: n.type === 'satellite' ? sz / 2 : 9 }, g);
      const ic = sz * 0.64;
      const ico = el('use', { class: 'node-icon', href: '#' + iconId(n), x: -ic / 2, y: -ic / 2, width: ic, height: ic }, g);
      const aim = aimTransform(n);
      if (aim) ico.setAttribute('transform', aim);
      const t = el('text', { class: 'node-label', x: 0, y: sz / 2 + 13 }, g);
      t.textContent = n.name;
      const sub = nodeSubLabel(n);
      if (sub) {
        const s2 = el('text', { class: 'node-sub', x: 0, y: sz / 2 + 25 }, g);
        s2.textContent = sub;
      }
      if (faultOf(n) && !isHidden(n)) {
        const t = el('text', { class: 'fault-mark', x: -sz / 2 + 2, y: -sz / 2 + 6 }, g);
        t.textContent = '⚠';
      }
      if (failed(n)) {
        el('circle', { class: 'node-badge-bg', cx: sz / 2 - 2, cy: -sz / 2 + 2, r: 8, fill: '#ef4444' }, g);
        const b = el('text', { class: 'node-badge', x: sz / 2 - 2, y: -sz / 2 + 5.5, 'text-anchor': 'middle', fill: '#fff' }, g);
        b.textContent = '✕';
      }
      const ttl = el('title', null, g);
      ttl.textContent = `${n.name} (${CATALOG[n.type] ? CATALOG[n.type].label : n.type})`;
    }
  }
  /** Icône d'un équipement (un obstacle prend l'icône de sa nature : relief, bâtiment, forêt). */
  function iconId(n) {
    if (n.type === 'obstacle') return n.props.kind === 'forest' ? 'ico-forest' : n.props.kind === 'building' ? 'ico-building' : 'ico-obstacle';
    return 'ico-' + n.type;
  }
  function polar(r, azDeg) {
    const a = U.deg2rad(azDeg);
    return { x: r * Math.sin(a), y: -r * Math.cos(a) };
  }

  function renderLinks() {
    clear(L.links);
    clear(L.beams);
    clear(L.overlay);
    // Lignes de fixation équipement → site
    for (const n of S.topo.nodes) {
      const s = siteOf(n);
      if (s) el('line', { class: 'mount-line', x1: s.x, y1: s.y, x2: n.x, y2: n.y }, L.links);
    }
    const blocked = new Set(S.analysis ? S.analysis.blockedLinks : []);
    for (const l of S.topo.links) {
      const na = nodeById(l.a);
      const nb = nodeById(l.b);
      if (!na || !nb) continue;
      const a = vpos(na);
      const b = vpos(nb);
      const st = l.state || {};
      const cls = ['link', 'link-' + l.medium];
      if (RADIO_MEDIA.includes(l.medium)) cls.push('st-' + (st.status || 'down'));
      if (st.cut) cls.push('cut');
      if (blocked.has(l.id)) cls.push('blocked');
      if (l.props && l.props.backup) cls.push('backup');
      if (S.selection && S.selection.kind === 'link' && S.selection.id === l.id) cls.push('selected');
      if (!RADIO_MEDIA.includes(l.medium) && st.up === false && !st.cut) cls.push('cut');
      const g = el('g', { class: cls.join(' '), 'data-link': l.id }, L.links);
      el('line', { class: 'link-hit', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, g);
      el('line', { class: 'link-line', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, g);
      const ttl = el('title', null, g);
      ttl.textContent = `${linkName(l)} — ${MEDIUM_LABEL[l.medium] || l.medium}`;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (RADIO_MEDIA.includes(l.medium)) {
        if (st.up && !st.cut) el('line', { class: 'beam st-' + st.status, x1: a.x, y1: a.y, x2: b.x, y2: b.y }, L.beams);
        if (st.label) {
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          const off = 11;
          const lx = mx + Math.sin(ang) * off * -1;
          const ly = my + Math.cos(ang) * off;
          const t = el('text', { class: 'link-label st-' + (st.status || 'down'), x: lx, y: ly }, L.overlay);
          t.textContent = S.mode === 'weather' && st.up && rain() > 0 ? st.label + weatherSuffix(st) : st.label;
        }
      } else if (l.props && l.props.backup) {
        const t = el('text', { class: 'link-label', x: mx, y: my - 7 }, L.overlay);
        t.textContent = 'SECOURS';
      }
      if (faultOf(l) && !isHidden(l)) {
        const t = el('text', { class: 'fault-mark', x: mx, y: my - 9 }, L.overlay);
        t.textContent = '⚠';
      }
      if (st.cut || (st.up === false && !RADIO_MEDIA.includes(l.medium))) {
        el('line', { class: 'cut-mark', x1: mx - 6, y1: my - 6, x2: mx + 6, y2: my + 6 }, L.overlay);
        el('line', { class: 'cut-mark', x1: mx + 6, y1: my - 6, x2: mx - 6, y2: my + 6 }, L.overlay);
      } else if (blocked.has(l.id)) {
        el('circle', { class: 'blocked-mark', cx: mx, cy: my, r: 11 }, L.overlay);
        const t = el('text', { class: 'blocked-text', x: mx, y: my }, L.overlay);
        t.textContent = 'RPL';
      }
    }
    // Chemin du flux sélectionné
    if (S.selectedFlow && S.analysis) {
      const f = S.analysis.flows.find((x) => x.id === S.selectedFlow);
      if (f && f.path) {
        const pts = f.path.nodes.map((id) => nodeById(id)).filter(Boolean).map((n) => n.x + ',' + n.y).join(' ');
        el('polyline', { class: 'flow-path', points: pts, stroke: vlanColor(f.vlan || 1) }, L.links);
      }
    }
    // Lien en cours de création
    if (S.pending && S.pointer) {
      el('line', { class: 'temp-link', x1: S.pending.x, y1: S.pending.y, x2: S.pointer.x, y2: S.pointer.y }, L.overlay);
    }
  }
  function weatherSuffix(st) {
    if (st.kind === 'fh') return ` · pluie −${fmt(Math.max(st.budgets.ab.rain, st.budgets.ba.rain), 1)} dB`;
    if (st.kind === 'blr') return ` · pluie −${fmt(st.budgets.dl.rain, 1)} dB`;
    if (st.kind === 'vsat' && st.result) return ` · pluie −${fmt(st.result.rain.remoteDown, 1)}/${fmt(st.result.rain.remoteUp, 1)} dB`;
    return '';
  }

  function render() {
    document.body.classList.toggle('has-moving-sat', hasMovingSat());
    applyView();
    renderLinks();
    renderNodes();
    $('#canvas-hint').classList.toggle('hidden', S.topo.nodes.length > 0);
  }
  function scheduleRender() {
    if (S.renderQueued) return;
    S.renderQueued = true;
    requestAnimationFrame(() => {
      S.renderQueued = false;
      render();
    });
  }

  /* --- Paquets animés --- */
  function vlanColor(v) {
    if (!v) return '#e2e8f0';
    const h = (num(v) * 137.508) % 360;
    return `hsl(${h}, 80%, 62%)`;
  }
  function flowPolyline(f) {
    if (S.flowPolylines.has(f.id)) return S.flowPolylines.get(f.id);
    const pts = f.path.nodes.map((id) => nodeById(id)).filter(Boolean).map((n) => vpos(n));
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      segs.push({ a: pts[i], b: pts[i + 1], len, start: total, hdr: f.headers[i] });
      total += len;
    }
    const poly = { segs, total };
    S.flowPolylines.set(f.id, poly);
    return poly;
  }
  let lastTs = 0;
  function animLoop(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    clear(L.packets);
    if (S.sim.playing) {
      S.sim.t += dt * S.sim.speed;
      updateClockUi();
      if (ts - S.sim.lastRecompute > 250) {
        S.sim.lastRecompute = ts;
        if (hasMovingSat()) update({ keepInspector: true });
      }
    }
    if (S.anim && S.analysis && !document.hidden) {
      const speed = 170;
      for (const f of S.analysis.flows) {
        if (!(f.status === 'ok' || f.status === 'congested') || !f.path || f.path.nodes.length < 2) continue;
        const last = S.lastSpawn.get(f.id) || 0;
        const interval = f.cls === 'voice' ? 450 : f.cls === 'video' ? 600 : 800;
        if (ts - last > interval) {
          S.packets.push({ flow: f.id, d: 0 });
          S.lastSpawn.set(f.id, ts);
        }
      }
      const alive = [];
      for (const p of S.packets) {
        const f = S.analysis.flows.find((x) => x.id === p.flow);
        if (!f || !f.path) continue;
        const poly = flowPolyline(f);
        p.d += speed * dt;
        if (p.d > poly.total) continue;
        alive.push(p);
        const seg = poly.segs.find((s) => p.d >= s.start && p.d <= s.start + s.len) || poly.segs[poly.segs.length - 1];
        if (!seg) continue;
        const t = seg.len ? (p.d - seg.start) / seg.len : 0;
        const x = seg.a.x + (seg.b.x - seg.a.x) * t;
        const y = seg.a.y + (seg.b.y - seg.a.y) * t;
        const hdr = seg.hdr || {};
        const isMpls = hdr.mpls !== undefined;
        const color = isMpls ? '#f472b6' : vlanColor(hdr.vlan);
        const label = isMpls ? (hdr.mpls ? String(hdr.mpls) : 'M') : hdr.vlan ? String(hdr.vlan) : '';
        const r = label ? Math.max(7, label.length * 3 + 2) : 4.5;
        el('circle', { class: 'packet', cx: x, cy: y, r, fill: color, opacity: f.status === 'congested' ? 0.6 : 1 }, L.packets);
        if (label) {
          const tx = el('text', { class: 'packet-tag', x, y, fill: '#0a0f1c' }, L.packets);
          tx.textContent = label;
        }
      }
      S.packets = alive.slice(-250);
    }
    requestAnimationFrame(animLoop);
  }

  /* ------------------------------------------------------------------
   * 6. INTERACTIONS
   * ------------------------------------------------------------------ */
  function toWorld(evt) {
    const r = svg.getBoundingClientRect();
    return { x: (evt.clientX - r.left - S.view.x) / S.view.k, y: (evt.clientY - r.top - S.view.y) / S.view.k };
  }
  function clampPos(n) {
    if (n.type === 'satellite') {
      n.y = ORBIT_Y[n.props.orbit] || ORBIT_Y.GEO;
    } else if (n.y < GROUND_MIN_Y) n.y = GROUND_MIN_Y;
  }
  function findSiteAt(p, excludeId) {
    let best = null;
    let bd = 40;
    for (const n of S.topo.nodes) {
      if (n.type !== 'tower' && n.type !== 'building') continue;
      if (n.id === excludeId) continue;
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }
  function mountOn(n, site) {
    n.props.siteId = site.id;
    const kids = S.topo.nodes.filter((x) => x.props && x.props.siteId === site.id && x.id !== n.id).length;
    const ang = U.deg2rad(-50 + kids * 48);
    n.x = site.x + 78 * Math.cos(ang);
    n.y = site.y + 78 * Math.sin(ang);
    if (n.y < GROUND_MIN_Y) n.y = GROUND_MIN_Y;
    const hs = siteHeightM(site);
    if (n.props.heightM !== undefined || ['antenna', 'fullOutdoor', 'blrBts', 'blrCpe'].includes(n.type)) {
      n.props.heightM = site.type === 'tower' ? Math.max(5, hs - 2) : hs + 3;
    }
    toast(`« ${n.name} » fixé sur « ${site.name} » (hauteur ${fmt(n.props.heightM || hs, 0)} m).`, 'ok');
  }

  /** Variantes de la boîte à outils : « obstacle:forest » → obstacle de nature forêt. */
  const PALETTE_VARIANTS = {
    'obstacle:hill': { label: 'Relief / Colline', props: { kind: 'hill' } },
    'obstacle:forest': { label: 'Arbres / Forêt', props: { kind: 'forest', heightM: 18, widthKm: 1.5 } },
    'obstacle:building': { label: 'Bâtiment haut', props: { kind: 'building', heightM: 45, widthKm: 0.3 } },
  };
  const paletteLabel = (t) => (PALETTE_VARIANTS[t] ? PALETTE_VARIANTS[t].label : CATALOG[t] ? CATALOG[t].label : t);
  function addNode(paletteType, pos) {
    if (lockedMsg()) return;
    const variant = PALETTE_VARIANTS[paletteType];
    const type = String(paletteType).split(':')[0];
    if (!CATALOG[type]) return;
    pushHistory();
    const n = ensureDefaults({ id: U.uid('n'), type, name: '', x: pos.x, y: pos.y, props: variant ? Object.assign({}, variant.props) : {} });
    if (variant) {
      const base = variant.label.split(' / ').pop();
      let k = 1;
      while (S.topo.nodes.some((x) => x.name === `${base} ${k}`)) k++;
      n.name = `${base} ${k}`;
    }
    if (isEndpoint(n)) n.props.ip = nextIp();
    if (type === 'router') n.props.loopback = '10.255.0.' + (S.topo.nodes.filter((x) => x.type === 'router').length + 1);
    clampPos(n);
    S.topo.nodes.push(n);
    if (MOUNTABLE.includes(type)) {
      const site = findSiteAt(pos);
      if (site) mountOn(n, site);
    }
    if (type === 'satellite') {
      const r = wrap.getBoundingClientRect();
      if (S.view.y + ORBIT_Y.GEO * S.view.k < 0 || S.view.y + ORBIT_Y.GEO * S.view.k > r.height) toast('Satellite placé sur son orbite (bande spatiale en haut du canevas).', 'info');
    }
    select({ kind: 'node', id: n.id });
    update();
  }

  function createLink(na, nb) {
    if (lockedMsg()) return;
    if (na.id === nb.id) return;
    if (S.topo.links.some((l) => (l.a === na.id && l.b === nb.id) || (l.a === nb.id && l.b === na.id))) {
      toast('Ces deux équipements sont déjà reliés.', 'warn');
      return;
    }
    const d = decideMedium(na, nb);
    if (d.error) {
      toast(d.error, 'error');
      log('Raccordement refusé : ' + d.error, 'warn');
      return;
    }
    pushHistory();
    const l = { id: U.uid('l'), a: na.id, b: nb.id, medium: d.medium, props: {} };
    if (d.medium === 'fh') l.props.protection = '1+0';
    S.topo.links.push(l);
    log(`Nouveau lien : ${MEDIUM_LABEL[d.medium]} ${na.name} ↔ ${nb.name}.`, 'info');
    select({ kind: 'link', id: l.id });
    update();
  }

  function deleteNode(id) {
    if (lockedMsg()) return;
    pushHistory();
    S.topo.nodes = S.topo.nodes.filter((n) => n.id !== id);
    S.topo.links = S.topo.links.filter((l) => l.a !== id && l.b !== id);
    S.topo.flows = S.topo.flows.filter((f) => f.src !== id && f.dst !== id);
    for (const n of S.topo.nodes) if (n.props.siteId === id) delete n.props.siteId;
    if (S.selection && S.selection.id === id) S.selection = null;
    update();
  }
  function deleteLink(id) {
    if (lockedMsg()) return;
    pushHistory();
    S.topo.links = S.topo.links.filter((l) => l.id !== id);
    if (S.selection && S.selection.id === id) S.selection = null;
    update();
  }
  function deleteSelection() {
    if (!S.selection) return;
    if (S.selection.kind === 'node') deleteNode(S.selection.id);
    else deleteLink(S.selection.id);
  }

  function select(sel) {
    S.selection = sel;
    S.budgetDir = 'ab';
  }

  function setTool(tool) {
    if (S.locked && ['link', 'delete', 'cut', 'flow'].includes(tool)) {
      lockedMsg();
      tool = 'select';
    }
    S.tool = tool;
    S.pending = null;
    $$('.tool[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
    svg.setAttribute('class', 'tool-' + tool);
    const hints = {
      link: 'Outil Lier : cliquez sur un premier équipement puis sur le second.',
      flow: 'Outil Flux : cliquez sur le terminal source puis sur le terminal destination.',
      ping: 'Outil Ping : cliquez sur le terminal source puis sur la destination.',
      cut: 'Outil Panne : cliquez sur un lien pour le couper/rétablir, ou sur un équipement pour simuler une panne.',
      delete: 'Outil Supprimer : cliquez sur un élément pour le supprimer.',
    };
    if (hints[tool]) toast(hints[tool], 'info');
    render();
  }

  function setMode(mode) {
    S.mode = mode;
    document.body.dataset.mode = mode;
    $$('.mode-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
      b.setAttribute('aria-checked', b.dataset.mode === mode ? 'true' : 'false');
    });
    const labels = { design: 'Conception RF/IP', weather: 'Météo & Propagation', diag: TEACHER ? 'Diagnostic / Pannes' : 'Dépannage' };
    $('#st-mode').textContent = 'Mode : ' + labels[mode];
    stat('mode_' + mode);
    if (mode !== 'diag' && S.tool === 'cut') setTool('select');
    if (mode === 'diag') log(TEACHER ? 'Mode Diagnostic : outil « Panne » (C), pannes cachées (🎲 barre d’outils, ou encadré « Pannes » de l’inspecteur), voyants et interventions dans l’inspecteur.' : 'Mode Dépannage : sélectionnez un équipement ou un câble pour voir ses voyants et les interventions possibles ; outil « Panne » (C).', 'info');
    if (mode === 'weather') log('Mode Météo & Propagation : réglez la pluie (curseur) ou lancez « Simuler un orage ».', 'info');
    render();
    renderInspector();
  }

  function setRain(v, opts = {}) {
    v = Math.round(U.clamp(num(v), 0, 100));
    S.topo.settings.rainMmH = v;
    $('#rain-slider').value = v;
    $('#rain-value').textContent = v + ' mm/h';
    const d = $('#rain-desc');
    let txt = 'Ciel clair';
    if (v > 0) txt = 'Bruine';
    if (v >= 5) txt = 'Pluie faible';
    if (v >= 15) txt = 'Pluie modérée';
    if (v >= 30) txt = 'Forte pluie';
    if (v >= 60) txt = 'Orage tropical';
    d.textContent = txt;
    d.className = 'rain-desc' + (v >= 60 ? ' storm' : v >= 30 ? ' heavy' : '');
    if (!opts.silent) scheduleUpdate({ keepInspector: true });
  }

  function toggleStorm() {
    const btn = $('#btn-storm');
    if (S.stormTimer) {
      clearInterval(S.stormTimer);
      S.stormTimer = null;
      btn.classList.remove('running');
      log('Simulation d’orage interrompue.', 'info');
      return;
    }
    btn.classList.add('running');
    log('⛈ Passage d’un orage tropical : 0 → 100 → 0 mm/h en 20 s.', 'info');
    let t = 0;
    S.stormTimer = setInterval(() => {
      t += 0.2;
      const v = t <= 10 ? t * 10 : Math.max(0, 200 - t * 10);
      setRain(v);
      if (t >= 20) {
        clearInterval(S.stormTimer);
        S.stormTimer = null;
        btn.classList.remove('running');
        log('Fin de l’orage.', 'ok');
      }
    }, 200);
  }

  function zoomAt(factor, cx, cy) {
    const k = U.clamp(S.view.k * factor, 0.15, 3);
    const f = k / S.view.k;
    S.view.x = cx - (cx - S.view.x) * f;
    S.view.y = cy - (cy - S.view.y) * f;
    S.view.k = k;
    S.flowPolylines.clear();
    applyView();
    stat('zoom');
  }
  function fitView(fromUser) {
    if (fromUser === true) stat('fit');
    const r = wrap.getBoundingClientRect();
    if (!S.topo.nodes.length) {
      S.view = { x: 40, y: 10, k: 1 };
      return applyView();
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of S.topo.nodes) {
      const ext = n.type === 'obstacle' ? Math.max(30, num(n.props.widthKm, 2) / 2 / kmPerPx()) : 60;
      x0 = Math.min(x0, n.x - ext);
      x1 = Math.max(x1, n.x + ext);
      y0 = Math.min(y0, n.y - (n.type === 'tower' ? Math.max(ext, sizeOf(n) / 2 + 20 + num(n.props.heightM, 40) * MAST_PX_PER_M) : ext));
      y1 = Math.max(y1, n.y + ext);
    }
    y0 = Math.min(y0, S.topo.nodes.some((n) => n.type === 'satellite') ? 20 : HORIZON_Y - 40);
    const k = U.clamp(Math.min(r.width / (x1 - x0), r.height / (y1 - y0)), 0.15, 1.6);
    S.view.k = k;
    S.view.x = (r.width - (x1 - x0) * k) / 2 - x0 * k;
    S.view.y = (r.height - (y1 - y0) * k) / 2 - y0 * k;
    applyView();
  }

  function initCanvasEvents() {
    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
      const target = e.target.closest('[data-node],[data-link]');
      const w = toWorld(e);
      try {
        svg.setPointerCapture(e.pointerId);
      } catch (err) {
        /* événement synthétique sans pointeur actif */
      }
      // Poignée de hauteur d'un pylône (outil Sélection)
      const handle = e.target.closest('[data-handle]');
      if (handle && e.button === 0 && S.tool === 'select') {
        const n = nodeById(handle.dataset.handle);
        if (n && !S.locked) {
          pushHistory();
          const hk = handle.dataset.hkind || 'tower';
          const h0 = hk === 'floors' ? num(n.props.floors, 8) : hk === 'width' ? num(n.props.widthKm, 2) : num(n.props.heightM, hk === 'obst' ? 60 : 40);
          drag = { kind: 'height', hk, node: n, sy: e.clientY, h0, moved: false };
          select({ kind: 'node', id: n.id });
          svg.classList.add('resizing');
          renderInspector();
          render();
          return;
        }
      }
      if (e.button === 1 || e.button === 2 || (!target && !S.armedType)) {
        if (!target && S.pending && e.button === 0) {
          S.pending = null;
          render();
        }
        if (!target && S.tool === 'select' && e.button === 0) {
          S.selection = null;
          S.selectedFlow = null;
          renderInspector();
          render();
        }
        drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y };
        svg.classList.add('panning');
        return;
      }
      if (!target && S.armedType) {
        addNode(S.armedType, w);
        disarm();
        return;
      }
      if (target.dataset.node) {
        const n = nodeById(target.dataset.node);
        handleNodeClick(n, e, w, (d) => (drag = d));
      } else if (target.dataset.link) {
        handleLinkClick(linkById(target.dataset.link));
      }
    });
    svg.addEventListener('pointermove', (e) => {
      const w = toWorld(e);
      const a = anchorFromWorld(w);
      $('#st-coords').textContent = `x = ${fmt(a.x, 2)} km · y = ${fmt(a.y, 2)} km`;
      if (S.pending) {
        S.pointer = w;
        scheduleRender();
      }
      if (!drag) return;
      if (drag.kind === 'pan') {
        S.view.x = drag.vx + (e.clientX - drag.sx);
        S.view.y = drag.vy + (e.clientY - drag.sy);
        applyView();
      } else if (drag.kind === 'height') {
        const n = drag.node;
        let changed = false;
        if (drag.hk === 'width') {
          const r = Math.max(0, Math.abs(w.x - n.x) - 30); // poignée placée 30 px hors du disque
          const v = U.clamp(Math.round(2 * r * kmPerPx() * 20) / 20, 0.05, 20);
          if (v !== num(n.props.widthKm)) {
            n.props.widthKm = v;
            changed = true;
          }
        } else if (drag.hk === 'obst') {
          const v = U.clamp(Math.round(drag.h0 + (drag.sy - e.clientY) / (S.view.k * OBST_PX_PER_M)), 5, 400);
          if (v !== num(n.props.heightM)) {
            n.props.heightM = v;
            changed = true;
          }
        } else if (drag.hk === 'floors') {
          const v = U.clamp(Math.round(drag.h0 + (drag.sy - e.clientY) / (S.view.k * FLOOR_PX)), 0, 60);
          if (v !== num(n.props.floors)) {
            setBuildingFloors(n, v);
            changed = true;
          }
        } else {
          const v = U.clamp(Math.round(drag.h0 + (drag.sy - e.clientY) / (S.view.k * MAST_PX_PER_M)), TOWER_MIN_M, TOWER_MAX_M);
          if (v !== num(n.props.heightM)) {
            setTowerHeight(n, v);
            changed = true;
          }
        }
        if (changed) {
          drag.moved = true;
          scheduleUpdate({ keepInspector: true });
        }
      } else if (drag.kind === 'node') {
        const n = drag.node;
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
        if (!drag.moved) {
          pushHistory();
          drag.moved = true;
        }
        const nx = w.x - drag.ox;
        const ny = w.y - drag.oy;
        const dx = nx - n.x;
        const dy = ny - n.y;
        n.x = nx;
        n.y = ny;
        clampPos(n);
        if (isSite(n)) {
          for (const c of S.topo.nodes) {
            if (c.props.siteId === n.id) {
              c.x += n.x - (nx - dx);
              c.y += n.y - (ny - dy);
            }
          }
        }
        S.flowPolylines.clear();
        scheduleUpdate({ keepInspector: true });
      }
    });
    const end = (e) => {
      if (drag && drag.kind === 'height') {
        if (drag.moved) {
          const p = drag.node.props;
          const msg = { width: `largeur ${fmt(drag.h0, 2)} → ${fmt(num(p.widthKm), 2)} km`, obst: `hauteur ${fmt(drag.h0, 0)} → ${fmt(num(p.heightM), 0)} m`, floors: `R+${drag.h0} → R+${num(p.floors)}`, tower: `hauteur ${fmt(drag.h0, 0)} m → ${fmt(num(p.heightM), 0)} m` }[drag.hk || 'tower'];
          log(`${(CATALOG[drag.node.type] || {}).label || 'Élément'} « ${drag.node.name} » : ${msg}.`, 'info');
          update();
        } else S.history.pop(); // simple clic sur la poignée : rien à annuler
      }
      if (drag && drag.kind === 'node' && drag.moved) {
        const n = drag.node;
        if (MOUNTABLE.includes(n.type)) {
          const site = findSiteAt(n, null);
          const cur = siteOf(n);
          if (site && (!cur || cur.id !== site.id)) mountOn(n, site);
          else if (cur && Math.hypot(n.x - cur.x, n.y - cur.y) > 130) {
            delete n.props.siteId;
            toast(`« ${n.name} » détaché de « ${cur.name} ».`, 'info');
          }
        }
        update();
      }
      drag = null;
      svg.classList.remove('panning');
      svg.classList.remove('resizing');
      try {
        svg.releasePointerCapture(e.pointerId);
      } catch (err) {
        /* déjà relâché */
      }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    svg.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
      },
      { passive: false }
    );
    // Glisser-déposer depuis la palette
    svg.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      svg.classList.add('drop-target');
    });
    svg.addEventListener('dragleave', () => svg.classList.remove('drop-target'));
    svg.addEventListener('drop', (e) => {
      e.preventDefault();
      svg.classList.remove('drop-target');
      const type = e.dataTransfer.getData('text/plain');
      if (CATALOG[String(type).split(':')[0]]) addNode(type, toWorld(e));
    });
    window.addEventListener('resize', () => applyView());
  }
  function anchorFromWorld(w) {
    return { x: w.x * kmPerPx(), y: (w.y - HORIZON_Y) * kmPerPx() };
  }

  function handleNodeClick(n, e, w, setDrag) {
    switch (S.tool) {
      case 'select':
        select({ kind: 'node', id: n.id });
        renderInspector();
        render();
        if (!S.locked) setDrag({ kind: 'node', node: n, ox: w.x - n.x, oy: w.y - n.y, sx: e.clientX, sy: e.clientY, moved: false });
        break;
      case 'link':
        if (!S.pending) {
          S.pending = n;
          render();
        } else {
          const a = S.pending;
          S.pending = null;
          createLink(a, n);
          render();
        }
        break;
      case 'flow':
      case 'ping':
        if (!isEndpoint(n)) {
          toast('Choisissez un terminal : BTS/gNodeB, site rural, agence, PC, serveur ou Internet.', 'warn');
          return;
        }
        if (!S.pending) {
          S.pending = n;
          render();
        } else {
          const a = S.pending;
          S.pending = null;
          if (a.id === n.id) return render();
          if (S.tool === 'flow') openFlowDialog(a, n);
          else runPing(a, n);
          render();
        }
        break;
      case 'cut':
        pushHistory();
        n.props.failed = !n.props.failed;
        log(n.props.failed ? `⚠ Panne simulée sur « ${n.name} ».` : `✔ « ${n.name} » réparé.`, n.props.failed ? 'warn' : 'ok');
        update();
        break;
      case 'delete':
        deleteNode(n.id);
        break;
      default:
        break;
    }
  }
  function handleLinkClick(l) {
    if (!l) return;
    switch (S.tool) {
      case 'cut':
        pushHistory();
        l.props.cut = !l.props.cut;
        log(l.props.cut ? `✂ Lien « ${linkName(l)} » coupé.` : `✔ Lien « ${linkName(l)} » rétabli.`, l.props.cut ? 'warn' : 'ok');
        update();
        break;
      case 'delete':
        deleteLink(l.id);
        break;
      default:
        select({ kind: 'link', id: l.id });
        renderInspector();
        render();
        break;
    }
  }

  function initPalette() {
    $$('.pal-item').forEach((it) => {
      it.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', it.dataset.type);
        e.dataTransfer.effectAllowed = 'copy';
      });
      it.addEventListener('click', () => {
        if (S.armedType === it.dataset.type) return disarm();
        disarm();
        S.armedType = it.dataset.type;
        it.classList.add('armed');
        toast(`Cliquez sur le canevas pour placer : ${paletteLabel(it.dataset.type)}.`, 'info');
      });
    });
    $('#palette-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$('.pal-item').forEach((it) => it.classList.toggle('hidden', q && !it.textContent.toLowerCase().includes(q)));
      $$('.pal-group').forEach((g) => {
        if (q) g.open = true;
      });
    });
  }
  function disarm() {
    S.armedType = null;
    $$('.pal-item.armed').forEach((x) => x.classList.remove('armed'));
  }

  function initKeyboard() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && S.examActive && MBV.Exam && MBV.Exam.active && MBV.Exam.active()) {
        e.preventDefault();
        MBV.Exam.submitAsk();
        return;
      }
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if ($$('.modal').some((m) => !m.hidden)) {
        if (e.key === 'Escape') closeModals();
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        return e.shiftKey ? redo() : undo();
      }
      if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        return redo();
      }
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        return saveFile();
      }
      if (ctrl) return;
      switch (e.key) {
        case 'v':
        case 'V':
          setTool('select');
          break;
        case 'l':
        case 'L':
          setTool('link');
          break;
        case 'f':
        case 'F':
          setTool('flow');
          break;
        case 'p':
        case 'P':
          setTool('ping');
          break;
        case 'c':
        case 'C':
          if (S.mode === 'diag') setTool('cut');
          break;
        case 'Delete':
        case 'Backspace':
          deleteSelection();
          break;
        case 'Escape':
          S.pending = null;
          disarm();
          setTool('select');
          break;
        case '+':
        case '=':
          zoomCenter(1.2);
          break;
        case '-':
          zoomCenter(1 / 1.2);
          break;
        case '0':
          fitView(true);
          break;
        default:
          break;
      }
    });
  }
  function zoomCenter(f) {
    const r = wrap.getBoundingClientRect();
    zoomAt(f, r.width / 2, r.height / 2);
  }

  /* ------------------------------------------------------------------
   * 7. INSPECTEUR
   * ------------------------------------------------------------------ */
  const ipaneProps = $('#ipane-props');
  const ipaneBudget = $('#ipane-budget');
  const ipaneProfile = $('#ipane-profile');
  const ipaneNetwork = $('#ipane-network');

  const opt = (arr) => arr.map((v) => (Array.isArray(v) ? v : [v, String(v)]));
  const fhBandOpts = () => RP.FH_BANDS.map((b) => [b.id, b.label]);
  const blrBandOpts = () => RP.BLR_BANDS.map((b) => [b.id, b.label]);
  const fhModOpts = () => RP.FH_MODULATIONS.map((m) => [m.id, m.id]);
  const blrModOpts = () => RP.BLR_MODULATIONS.map((m) => [m.id, m.id]);
  const modcodOpts = () => SP.MODCODS.map((m) => [m.id, m.id]);
  const polOpts = [['V', 'Verticale (V)'], ['H', 'Horizontale (H)'], ['V+H', 'Double V+H (XPIC)']];

  /** Schéma des champs de l'inspecteur selon le type d'équipement. */
  function fieldsFor(n) {
    const F = [];
    const p = n.props;
    const ipFields = () => [
      { key: 'ip', label: 'Adresse IP', kind: 'text', placeholder: '10.0.0.10' },
      { key: 'prefix', label: 'Masque (préfixe /n)', kind: 'number', min: 8, max: 30, step: 1, hint: '/24 = 255.255.255.0' },
      { key: 'gateway', label: 'Passerelle', kind: 'text', placeholder: '10.0.0.1' },
      { key: 'vlan', label: 'VLAN (802.1Q)', kind: 'number', min: 0, max: 4094, step: 1, hint: '0 = non tagué (le VLAN d’accès du CPE / modem s’applique)' },
      { kind: 'info', label: 'VLAN effectif', value: () => (S.engine ? S.engine.endpointVlan(n.id) || 'non tagué' : '—') },
    ];
    switch (n.type) {
      case 'tower':
        F.push(
          { key: 'heightM', label: 'Hauteur du pylône', kind: 'range', min: TOWER_MIN_M, max: TOWER_MAX_M, step: 1, unit: 'm', hint: `Réglable de ${TOWER_MIN_M} à ${TOWER_MAX_M} m (poignée sur le canevas, curseur ou saisie). Les antennes fixées au sommet suivent.` },
          { key: 'groundM', label: 'Altitude du sol', kind: 'number', min: 0, max: 3000, step: 1, unit: 'm' },
          { kind: 'info', label: 'Équipements fixés', value: () => S.topo.nodes.filter((x) => x.props.siteId === n.id).map((x) => x.name).join(', ') || 'aucun' }
        );
        break;
      case 'building':
        F.push(
          { key: 'floors', label: 'Étages (R+N)', kind: 'range', min: 0, max: 60, step: 1 },
          { key: 'groundM', label: 'Altitude du sol', kind: 'number', min: 0, max: 3000, step: 1, unit: 'm' },
          { kind: 'info', label: 'Hauteur de l’immeuble', value: () => fmt(siteHeightM(n), 0) + ' m' }
        );
        break;
      case 'obstacle':
        F.push(
          { key: 'kind', label: 'Nature', kind: 'select', options: [['hill', 'Colline / relief'], ['building', 'Bâtiment haut'], ['forest', 'Forêt']] },
          { key: 'heightM', label: 'Hauteur au-dessus du sol', kind: 'range', min: 5, max: 400, step: 1, unit: 'm' },
          { key: 'widthKm', label: 'Largeur (emprise)', kind: 'number', min: 0.05, max: 20, step: 0.05, unit: 'km' }
        );
        break;
      case 'idu':
        F.push(
          { kind: 'info', label: 'Ports', value: () => '4 × GbE RJ45 + 2 × 10 GbE SFP+' },
          { key: 'acm', label: 'Modulation adaptative (ACM)', kind: 'check' },
          { key: 'maxMod', label: p.acm ? 'Modulation maximale' : 'Modulation fixe', kind: 'select', options: fhModOpts() },
          { key: 'xpic', label: 'XPIC (annuleur de polarisation croisée)', kind: 'check', hint: 'Nécessaire si les antennes sont en double polarisation V+H.' },
          { key: 'vlans', label: 'VLAN autorisés', kind: 'text', placeholder: 'all ou 100,200,300' }
        );
        break;
      case 'odu': {
        const band = RP.getFhBand(p.band);
        F.push(
          { key: 'band', label: 'Bande de fréquence', kind: 'select', options: fhBandOpts() },
          { key: 'txPowerDbm', label: 'Puissance d’émission Tx', kind: 'range', min: -10, max: band.txMax, step: 1, unit: 'dBm' },
          { key: 'channelMHz', label: 'Largeur de canal', kind: 'select', options: band.channels.map((c) => [String(c), c + ' MHz']) },
          { key: 'lossDb', label: 'Pertes de branchement', kind: 'number', min: 0, max: 6, step: 0.1, unit: 'dB' },
          ...freqPlanFields(n),
          { kind: 'info', label: 'Puissance max de la bande', value: () => band.txMax + ' dBm' },
          { kind: 'info', label: 'Portée typique', value: () => band.typicalHopKm }
        );
        break;
      }
      case 'fullOutdoor': {
        const band = RP.getFhBand(p.band);
        F.push(
          { key: 'band', label: 'Bande de fréquence', kind: 'select', options: fhBandOpts() },
          { key: 'txPowerDbm', label: 'Puissance d’émission Tx', kind: 'range', min: -10, max: band.txMax, step: 1, unit: 'dBm' },
          { key: 'channelMHz', label: 'Largeur de canal', kind: 'select', options: band.channels.map((c) => [String(c), c + ' MHz']) },
          ...freqPlanFields(n),
          { key: 'diameterM', label: 'Antenne intégrée', kind: 'select', options: opt([0.3, 0.6, 0.9]).map(([v]) => [String(v), fmt(v, 1) + ' m']) },
          { key: 'polarization', label: 'Polarisation', kind: 'select', options: polOpts },
          { key: 'heightM', label: 'Hauteur de fixation', kind: 'range', min: 2, max: mountMaxHeight(n), step: 1, unit: 'm', hint: mountHint(n) },
          { key: 'acm', label: 'Modulation adaptative (ACM)', kind: 'check' },
          { key: 'maxMod', label: p.acm ? 'Modulation maximale' : 'Modulation fixe', kind: 'select', options: fhModOpts() },
          { key: 'xpic', label: 'XPIC', kind: 'check' },
          { key: 'uplink', label: 'Sortie réseau', kind: 'select', options: [['rj45', 'RJ45 PoE++ (2,5 GbE)'], ['fiber', 'Fibre SFP+ (10 GbE)']] },
          { key: 'vlans', label: 'VLAN autorisés', kind: 'text' },
          { kind: 'info', label: 'Gain d’antenne', value: () => fmt(RP.dishGainDbi(num(p.diameterM, 0.6), band.f), 1) + ' dBi' },
          { key: 'azErrDeg', label: 'Dépointage azimut', kind: 'range', min: -5, max: 5, step: 0.1, unit: '°', diag: true }
        );
        break;
      }
      case 'antenna': {
        const odu = neighborOfType(n, 'odu', ['if']);
        const band = odu ? RP.getFhBand(odu.props.band) : null;
        F.push(
          { key: 'diameterM', label: 'Diamètre', kind: 'select', options: RP.FH_DISH_SIZES.map((v) => [String(v), fmt(v, 1) + ' m']) },
          { key: 'polarization', label: 'Polarisation', kind: 'select', options: polOpts },
          { key: 'heightM', label: 'Hauteur de fixation', kind: 'range', min: 2, max: mountMaxHeight(n), step: 1, unit: 'm', hint: mountHint(n) },
          { kind: 'info', label: 'Gain', value: () => (band ? fmt(RP.dishGainDbi(num(p.diameterM, 0.6), band.f), 1) + ' dBi à ' + fmt(band.f, 1) + ' GHz' : 'raccordez une ODU') },
          { kind: 'info', label: 'Ouverture à −3 dB', value: () => (band ? fmt(RP.dishBeamwidthDeg(num(p.diameterM, 0.6), band.f), 2) + '°' : '—') },
          { key: 'azErrDeg', label: 'Dépointage azimut', kind: 'range', min: -5, max: 5, step: 0.1, unit: '°', diag: true }
        );
        break;
      }
      case 'blrBts': {
        const band = RP.getBlrBand(p.band);
        F.push(
          { key: 'band', label: 'Bande', kind: 'select', options: blrBandOpts() },
          { key: 'channelMHz', label: 'Largeur de canal', kind: 'select', options: band.channels.map((c) => [String(c), c + ' MHz']) },
          { key: 'txPowerDbm', label: 'Puissance Tx', kind: 'range', min: 0, max: band.txMax, step: 1, unit: 'dBm' },
          { key: 'sectorDeg', label: 'Ouverture du secteur', kind: 'select', options: [['60', '60°'], ['90', '90°'], ['120', '120°']] },
          { key: 'azimuthDeg', label: 'Azimut du secteur', kind: 'range', min: 0, max: 359, step: 1, unit: '°' },
          { key: 'heightM', label: 'Hauteur de fixation', kind: 'range', min: 2, max: mountMaxHeight(n), step: 1, unit: 'm', hint: mountHint(n) },
          { key: 'acm', label: 'Modulation adaptative', kind: 'check' },
          { key: 'maxMod', label: 'MCS maximal', kind: 'select', options: blrModOpts() },
          { key: 'vlans', label: 'VLAN autorisés', kind: 'text' },
          { kind: 'info', label: 'Gain du secteur', value: () => fmt(RP.sectorGainDbi(num(p.sectorDeg, 90)), 1) + ' dBi' },
          { kind: 'info', label: 'CPE raccordés', value: () => radioLinksOf(n).length }
        );
        break;
      }
      case 'blrCpe':
        F.push(
          { key: 'install', label: 'Installation', kind: 'select', options: [['outdoor', 'Outdoor (antenne directive en façade)'], ['indoor', 'Indoor (derrière une fenêtre / un mur)']] },
          { key: 'txPowerDbm', label: 'Puissance Tx', kind: 'range', min: 0, max: 27, step: 1, unit: 'dBm' },
          { key: 'heightM', label: 'Hauteur de fixation', kind: 'range', min: 2, max: mountMaxHeight(n), step: 1, unit: 'm', hint: mountHint(n) },
          { key: 'wallLossDb', label: 'Pertes de mur', kind: 'number', min: 0, max: 30, step: 1, unit: 'dB', when: () => p.install === 'indoor' },
          { key: 'accessVlan', label: 'VLAN d’accès (port client)', kind: 'number', min: 0, max: 4094, step: 1, hint: 'Le CPE tague le trafic de l’abonné avec ce VLAN (0 = aucun).' },
          { key: 'azErrDeg', label: 'Dépointage', kind: 'range', min: -30, max: 30, step: 1, unit: '°', diag: true }
        );
        break;
      case 'satellite': {
        const orbit = SP.getOrbit(p.orbit);
        const band = SP.getBand(p.band);
        F.push(
          { key: 'orbit', label: 'Orbite', kind: 'select', options: Object.values(SP.ORBITS).map((o) => [o.id, o.label]) },
          { key: 'band', label: 'Bande', kind: 'select', options: Object.values(SP.BANDS).map((b) => [b.id, b.label]) },
          { key: 'lonDeg', label: 'Position orbitale', kind: 'number', min: -180, max: 180, step: 0.5, unit: '° E', when: () => p.orbit === 'GEO', hint: 'Longitude du satellite géostationnaire (négatif = Ouest).' },
          { key: 'motion', label: 'Mouvement', kind: 'select', options: [['fixed', 'Position figée (élévation fixe)'], ['moving', 'Défilement réel (horloge de simulation)']], when: () => p.orbit !== 'GEO', hint: 'En défilement, lancez l’horloge (▶) dans la barre d’outils du canevas.' },
          { key: 'elevationDeg', label: 'Élévation de passage', kind: 'range', min: 10, max: 90, step: 1, unit: '°', when: () => p.orbit !== 'GEO' && p.motion !== 'moving', hint: 'Élévation du satellite servant vue depuis les stations.' },
          { key: 'satsPerPlane', label: 'Satellites par plan orbital', kind: 'number', min: 1, max: 120, step: 1, when: () => p.orbit !== 'GEO' && p.motion === 'moving', hint: 'Trop peu de satellites → trous de couverture.' },
          { key: 'passMaxElevDeg', label: 'Élévation maximale des passages', kind: 'range', min: 30, max: 90, step: 1, unit: '°', when: () => p.orbit !== 'GEO' && p.motion === 'moving' },
          { kind: 'info', label: 'Écart / visibilité d’un satellite', value: () => { const c = constellationOf(n, S.sim.t); return `un passage toutes les ${fmt(c.spacingMin, 1)} min · visible ${fmt(c.passDurationMin, 1)} min`; }, when: () => p.orbit !== 'GEO' && p.motion === 'moving' },
          { kind: 'info', label: 'Satellite servant (T+' + clockTxt(S.sim.t) + ')', value: () => { const c = constellationOf(n, S.sim.t); return c.serving ? `n° ${c.serving.index} · El ${fmt(c.serving.el, 1)}° · ${fmt(c.serving.slantKm, 0)} km` : 'aucun : trou de couverture'; }, when: () => p.orbit !== 'GEO' && p.motion === 'moving' },
          { key: 'outputBackoffDb', label: 'Recul de sortie (OBO)', kind: 'number', min: 0, max: 6, step: 0.5, unit: 'dB' },
          { kind: 'info', label: 'Altitude', value: () => orbit.altitudeKm.toLocaleString('fr-FR') + ' km' },
          { kind: 'info', label: 'Période orbitale', value: () => periodTxt(SP.orbitalPeriodMin(orbit.altitudeKm)) },
          { kind: 'info', label: 'Vitesse', value: () => fmt(SP.orbitalSpeedKmS(orbit.altitudeKm), 2) + ' km/s' },
          { kind: 'info', label: 'Fréquences ↑ / ↓', value: () => fmt(band.upGHz, 2) + ' / ' + fmt(band.downGHz, 2) + ' GHz' },
          { kind: 'info', label: 'PIRE / G/T satellite', value: () => fmt(band.satEirpDbw + orbit.eirpOffset, 0) + ' dBW / ' + fmt(band.satGtDbK + orbit.gtOffset, 0) + ' dB/K' },
          { kind: 'info', label: 'Polarisation', value: () => band.polarization },
          { kind: 'info', label: 'Remarque', value: () => orbit.description }
        );
        break;
      }
      case 'hub':
        F.push(
          { key: 'dishM', label: 'Antenne du Hub', kind: 'select', options: SP.HUB_DISHES.map((v) => [String(v), fmt(v, 1) + ' m']) },
          { key: 'hpaW', label: 'Amplificateur HPA/SSPA', kind: 'select', options: SP.HPA_POWERS.map((v) => [String(v), v + ' W']) },
          { key: 'lnbNfDb', label: 'Facteur de bruit LNB', kind: 'number', min: 0.3, max: 3, step: 0.1, unit: 'dB' },
          { key: 'fwdSymbolRate', label: 'Débit symbole voie aller', kind: 'number', min: 1, max: 200, step: 1, unit: 'Msymb/s' },
          { key: 'fwdMaxModcod', label: 'MODCOD max voie aller', kind: 'select', options: modcodOpts() },
          { key: 'coordMode', label: 'Coordonnées', kind: 'select', options: [['plan', 'Depuis la position sur le plan'], ['manual', 'Saisie manuelle']] },
          { key: 'lat', label: 'Latitude', kind: 'number', min: -80, max: 80, step: 0.01, unit: '° N', when: () => p.coordMode === 'manual' },
          { key: 'lon', label: 'Longitude', kind: 'number', min: -180, max: 180, step: 0.01, unit: '° E', when: () => p.coordMode === 'manual' },
          { kind: 'info', label: 'Position', value: () => geoTxt(geoOf(n)) },
          { key: 'localRain', label: 'Subit la pluie locale', kind: 'check', hint: 'Par défaut le téléport est supposé hors de l’orage.' },
          { key: 'vlans', label: 'VLAN autorisés', kind: 'text' }
        );
        break;
      case 'vsatAntenna': {
        const lk = radioLinksOf(n)[0];
        const st = lk && lk.state;
        F.push(
          { key: 'dishM', label: 'Diamètre', kind: 'select', options: SP.VSAT_DISHES.map((v) => [String(v), fmt(v, 2) + ' m']) },
          { key: 'coordMode', label: 'Coordonnées', kind: 'select', options: [['plan', 'Depuis la position sur le plan'], ['manual', 'Saisie manuelle']] },
          { key: 'lat', label: 'Latitude', kind: 'number', min: -80, max: 80, step: 0.01, unit: '° N', when: () => p.coordMode === 'manual' },
          { key: 'lon', label: 'Longitude', kind: 'number', min: -180, max: 180, step: 0.01, unit: '° E', when: () => p.coordMode === 'manual' },
          { kind: 'info', label: 'Position', value: () => geoTxt(geoOf(n)) },
          { key: 'groundM', label: 'Altitude du site', kind: 'number', min: 0, max: 3000, step: 1, unit: 'm' },
          { kind: 'info', label: 'Pointage calculé (Az / El / Skew)', value: () => (st && st.ideal ? `${fmt(st.ideal.azimuth, 1)}° / ${fmt(st.ideal.elevation, 1)}° / ${fmt(st.ideal.skew, 1)}°` : st && st.sat ? 'satellite défilant : poursuite automatique' : 'reliez l’antenne à un satellite GEO') },
          { key: 'autoPoint', label: 'Pointage automatique (parfait)', kind: 'check', hint: 'Décochez pour saisir vous-même l’azimut, l’élévation et le skew calculés.' },
          { key: 'azimuthDeg', label: 'Azimut réglé', kind: 'number', min: 0, max: 359.9, step: 0.1, unit: '°', when: () => p.autoPoint === false },
          { key: 'elevationDeg', label: 'Élévation réglée', kind: 'number', min: 0, max: 90, step: 0.1, unit: '°', when: () => p.autoPoint === false },
          { key: 'skewDeg', label: 'Skew (polarisation) réglé', kind: 'number', min: -90, max: 90, step: 0.5, unit: '°', when: () => p.autoPoint === false }
        );
        break;
      }
      case 'buc':
        F.push(
          { key: 'powerW', label: 'Puissance du BUC', kind: 'select', options: SP.BUC_POWERS.map((v) => [String(v), v + ' W (' + fmt(U.wattToDbw(v), 1) + ' dBW)']) },
          { kind: 'info', label: 'Rôle', value: () => 'Convertit la FI (bande L) du modem en fréquence montante et l’amplifie.' }
        );
        break;
      case 'lnb':
        F.push(
          { key: 'nfDb', label: 'Facteur de bruit (NF)', kind: 'number', min: 0.3, max: 3, step: 0.1, unit: 'dB' },
          { kind: 'info', label: 'Température de bruit', value: () => fmt(SP.lnbNoiseTempK(num(p.nfDb, 0.8)), 0) + ' K' },
          { kind: 'info', label: 'Rôle', value: () => 'Amplifie le signal descendant très faible et le convertit en bande L vers le modem.' }
        );
        break;
      case 'vsatModem':
        F.push(
          { key: 'acm', label: 'ACM (DVB-S2X)', kind: 'check' },
          { key: 'retSymbolRate', label: 'Débit symbole voie retour', kind: 'number', min: 0.25, max: 30, step: 0.25, unit: 'Msymb/s' },
          { key: 'retMaxModcod', label: 'MODCOD max voie retour', kind: 'select', options: modcodOpts() },
          { key: 'accessVlan', label: 'VLAN d’accès (port LAN)', kind: 'number', min: 0, max: 4094, step: 1 },
          { key: 'vlans', label: 'VLAN autorisés', kind: 'text' }
        );
        break;
      case 'router':
        F.push(
          { key: 'loopback', label: 'Adresse loopback', kind: 'text' },
          { key: 'mpls', label: 'MPLS (LDP) activé', kind: 'check' },
          { key: 'frr', label: 'MPLS Fast Reroute', kind: 'check', when: () => p.mpls !== false },
          { key: 'interVlan', label: 'Routage inter-VLAN', kind: 'check', hint: 'Décocher pour isoler les VLAN (clients séparés).' },
          { key: 'vlans', label: 'VLAN (sous-interfaces)', kind: 'text', placeholder: 'all ou 100,200' }
        );
        break;
      case 'switch':
        F.push(
          { key: 'vlans', label: 'VLAN autorisés (trunk)', kind: 'text', placeholder: 'all ou 100,200,300' },
          { key: 'erps', label: 'ERPS G.8032 (anneau)', kind: 'check' },
          { key: 'rplOwner', label: 'Propriétaire du RPL', kind: 'check', when: () => !!p.erps },
          { key: 'l3', label: 'Fonctions L3 (routage)', kind: 'check' }
        );
        break;
      default:
        if (isEndpoint(n)) F.push(...ipFields());
    }
    F.push({ key: 'failed', label: 'Simuler une panne', kind: 'check', diag: true });
    return F;
  }
  function periodTxt(min) {
    if (min > 120) {
      const h = Math.floor(min / 60);
      const m = Math.round(min - h * 60);
      return `${h} h ${String(m).padStart(2, '0')} min`;
    }
    return fmt(min, 1) + ' min';
  }
  function geoTxt(g) {
    return `${fmt(Math.abs(g.lat), 3)}° ${g.lat >= 0 ? 'N' : 'S'}, ${fmt(Math.abs(g.lon), 3)}° ${g.lon >= 0 ? 'E' : 'O'}`;
  }

  function freqPlanFields(n) {
    const chans = [];
    for (let c = 1; c <= RP.FH_CHANNELS_PER_HALF; c++) chans.push([String(c), 'Canal ' + c]);
    return [
      { key: 'channelNo', label: 'Canal (plan de fréquences)', kind: 'select', options: chans, hint: 'Les deux extrémités d’un bond utilisent le même numéro de canal.' },
      { key: 'txHalf', label: 'Demi-bande d’émission', kind: 'select', options: [['auto', 'Automatique (opposée à l’autre extrémité)'], ['low', 'Basse (émet en bas, reçoit en haut)'], ['high', 'Haute (émet en haut, reçoit en bas)']], hint: 'Règle du site : toutes les ODU d’un même pylône émettent dans la même demi-bande.' },
      { kind: 'info', label: 'Fréquences', value: () => fhTxInfo(n) },
    ];
  }

  function linkFieldsFor(l) {
    if ((l.medium === 'ethernet' || l.medium === 'fiber') && !l.props.capacityMbps) l.props.capacityMbps = NET.WIRED_CAPACITY[l.medium];
    if (l.medium === 'fh' && !l.props.protection) l.props.protection = '1+0';
    const F = [{ key: 'name', label: 'Nom du lien', kind: 'text', placeholder: linkName(l) }];
    if (l.medium === 'ethernet' || l.medium === 'fiber') {
      F.push({ key: 'capacityMbps', label: 'Débit du port', kind: 'select', options: l.medium === 'fiber' ? [['1000', '1 GbE'], ['10000', '10 GbE'], ['100000', '100 GbE']] : [['100', '100 Mbit/s'], ['1000', '1 GbE'], ['2500', '2,5 GbE'], ['10000', '10 GbE']] });
    }
    if (l.medium === 'fh') {
      if (l.props.sdSpacingM === undefined) l.props.sdSpacingM = 10;
      if (l.props.sdDiamM === undefined) l.props.sdDiamM = '0';
      const sd = () => l.props.protection === '1+1 SD';
      F.push(
        { key: 'protection', label: 'Configuration', kind: 'select', options: [['1+0', '1+0 (sans protection)'], ['1+1', '1+1 HSB (protection matérielle)'], ['1+1 SD', '1+1 HSB + diversité d’espace (SD)']] },
        { key: 'sdSpacingM', label: 'Écart vertical des antennes (S)', kind: 'range', min: 2, max: 30, step: 1, unit: 'm', when: sd, hint: 'À chaque extrémité, l’antenne de diversité est fixée S mètres sous l’antenne principale.' },
        { key: 'sdDiamM', label: 'Antenne de diversité', kind: 'select', options: [['0', 'Identique à l’antenne principale']].concat(RP.FH_DISH_SIZES.map((v) => [String(v), 'Ø ' + fmt(v, 1) + ' m'])), when: sd }
      );
    }
    if (!['if', 'coax'].includes(l.medium)) {
      F.push({ key: 'backup', label: 'Lien de secours (backup)', kind: 'check', hint: 'Utilisé uniquement si le chemin principal est coupé.' });
      F.push({ key: 'rpl', label: 'Lien RPL (anneau ERPS)', kind: 'check', hint: 'Lien bloqué en temps normal pour éviter la boucle.' });
    }
    F.push({ key: 'cut', label: 'Lien coupé', kind: 'check', diag: true });
    return F;
  }

  function renderForm(container, target, fields, onChange) {
    const visible = fields.filter((f) => (!f.diag || (S.mode === 'diag' && !S.locked)) && (!f.when || f.when()));
    for (const f of visible) {
      const row = document.createElement('div');
      row.className = 'field' + (f.kind === 'info' ? ' readonly' : '');
      const lab = document.createElement('label');
      lab.textContent = f.label;
      row.appendChild(lab);
      if (f.kind === 'info') {
        const v = document.createElement('div');
        v.className = 'val';
        v.textContent = f.value();
        row.appendChild(v);
      } else if (f.kind === 'check') {
        const box = document.createElement('div');
        box.className = 'inline';
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.checked = !!target[f.key];
        c.addEventListener('change', () => onChange(f, c.checked, true));
        box.appendChild(c);
        row.appendChild(box);
      } else if (f.kind === 'select') {
        const s = document.createElement('select');
        for (const [v, t] of f.options) {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = t;
          s.appendChild(o);
        }
        s.value = String(target[f.key] === undefined ? '' : target[f.key]);
        s.addEventListener('change', () => onChange(f, s.value, true));
        row.appendChild(s);
      } else if (f.kind === 'range') {
        const box = document.createElement('div');
        box.className = 'inline';
        const r = document.createElement('input');
        r.type = 'range';
        r.min = f.min;
        r.max = f.max;
        r.step = f.step;
        r.value = num(target[f.key], f.min);
        // Saisie numérique synchronisée avec le curseur
        const nb = document.createElement('input');
        nb.type = 'number';
        nb.className = 'range-num';
        nb.min = f.min;
        nb.max = f.max;
        nb.step = f.step;
        nb.value = num(target[f.key], f.min);
        r.addEventListener('input', () => {
          nb.value = r.value;
          onChange(f, num(r.value), false);
        });
        r.addEventListener('change', () => onChange(f, num(r.value), true));
        nb.addEventListener('change', () => {
          const v = U.clamp(num(nb.value, num(target[f.key], f.min)), num(f.min), num(f.max));
          nb.value = v;
          r.value = v;
          onChange(f, v, true);
        });
        box.appendChild(r);
        box.appendChild(nb);
        if (f.unit) {
          const u = document.createElement('span');
          u.className = 'unit';
          u.textContent = f.unit;
          box.appendChild(u);
        }
        row.appendChild(box);
      } else {
        const box = document.createElement('div');
        box.className = 'inline';
        const i = document.createElement('input');
        i.type = f.kind === 'number' ? 'number' : 'text';
        if (f.kind === 'number') {
          i.min = f.min;
          i.max = f.max;
          i.step = f.step;
        }
        if (f.placeholder) i.placeholder = f.placeholder;
        i.value = target[f.key] === undefined ? '' : target[f.key];
        i.addEventListener('change', () => {
          let v = i.value;
          if (f.kind === 'number') {
            v = U.clamp(num(v, num(target[f.key])), f.min, f.max);
            i.value = v;
          }
          onChange(f, v, true);
        });
        box.appendChild(i);
        if (f.unit) {
          const u = document.createElement('span');
          u.className = 'unit';
          u.textContent = f.unit;
          box.appendChild(u);
        }
        row.appendChild(box);
      }
      if (f.hint) {
        const h = document.createElement('div');
        h.className = 'hint';
        h.textContent = f.hint;
        row.appendChild(h);
      }
      container.appendChild(row);
    }
  }

  /** Règle la hauteur d'un pylône (TOWER_MIN_M à TOWER_MAX_M) ; les équipements fixés au sommet suivent. */
  function setTowerHeight(tower, value) {
    const v = U.clamp(Math.round(num(value, 40)), TOWER_MIN_M, TOWER_MAX_M);
    const old = num(tower.props.heightM, 40);
    for (const k of S.topo.nodes) {
      if (k.props.siteId === tower.id && k.props.heightM !== undefined && num(k.props.heightM) >= old - 2.01) k.props.heightM = Math.max(5, v - 2);
    }
    tower.props.heightM = v;
  }
  /** Nombre d'étages d'un immeuble : les équipements du toit suivent la terrasse. */
  function setBuildingFloors(b, floors) {
    const old = siteHeightM(b);
    b.props.floors = U.clamp(Math.round(num(floors, 8)), 0, 60);
    const dh = siteHeightM(b) - old;
    for (const k of S.topo.nodes) if (k.props.siteId === b.id && k.props.heightM !== undefined && num(k.props.heightM) >= old - 0.01) k.props.heightM = Math.max(1, num(k.props.heightM) + dh);
  }
  /**
   * Orientation de l'icône d'une antenne directive vers son correspondant (antenne FH ou Full-Outdoor
   * vers l'autre extrémité du bond, CPE vers sa station de base) : l'icône « regarde » vers la droite ;
   * vers la gauche, elle est retournée (miroir) plutôt que mise à l'envers.
   */
  function aimTransform(n) {
    if (!['antenna', 'fullOutdoor', 'blrCpe'].includes(n.type)) return null;
    const media = n.type === 'blrCpe' ? ['blr'] : ['fh'];
    const peer = neighbors(n, media)[0];
    if (!peer) return null;
    const a = vpos(n);
    const b = vpos(peer.node);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.hypot(dx, dy) < 1) return null;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    return dx >= 0 ? `rotate(${deg.toFixed(1)})` : `rotate(${(deg - 180).toFixed(1)}) scale(-1 1)`;
  }
  /** Hauteur max de fixation d'un équipement selon son support. */
  function mountMaxHeight(n) {
    const s = siteOf(n);
    if (s && s.type === 'tower') return siteHeightM(s);
    if (s && s.type === 'building') return siteHeightM(s) + 10;
    return TOWER_MAX_M + 10;
  }
  function mountHint(n) {
    const s = siteOf(n);
    if (s && s.type === 'tower') return `Limitée à la hauteur du pylône « ${s.name} » (${fmt(siteHeightM(s), 0)} m) : pour monter plus haut, augmentez la hauteur du pylône (max ${TOWER_MAX_M} m).`;
    if (s && s.type === 'building') return `Mât sur le toit de « ${s.name} » (toit à ${fmt(siteHeightM(s), 0)} m, mât de 10 m max).`;
    return 'Équipement non fixé : hauteur au-dessus du sol.';
  }

  let historyArmed = false;
  function onNodeFieldChange(n, f, value, committed) {
    if (S.locked && committed !== false) journalAdd({ kind: 'config', target: n.id, name: n.name, key: f.key });
    if (!historyArmed) {
      pushHistory();
      historyArmed = true;
    }
    if (committed) historyArmed = false;
    const numericSelect = ['diameterM', 'dishM', 'hpaW', 'powerW', 'sectorDeg'];
    if (f.kind === 'select' && numericSelect.includes(f.key)) value = num(value);
    if (f.key === 'channelMHz') value = num(value);
    if (f.key === 'prefix' || f.key === 'vlan' || f.key === 'accessVlan') value = Math.round(num(value));
    if (n.type === 'tower' && f.key === 'heightM') {
      setTowerHeight(n, value);
      value = n.props.heightM;
    }
    n.props[f.key] = value;
    // Cohérences
    if (n.type === 'odu' || n.type === 'fullOutdoor') {
      const band = RP.getFhBand(n.props.band);
      if (!band.channels.includes(num(n.props.channelMHz))) n.props.channelMHz = band.channels.includes(28) ? 28 : band.channels[0];
      if (n.props.txPowerDbm > band.txMax) n.props.txPowerDbm = band.txMax;
    }
    if (n.type === 'blrBts') {
      const band = RP.getBlrBand(n.props.band);
      if (!band.channels.includes(num(n.props.channelMHz))) n.props.channelMHz = band.channels[0];
      if (n.props.txPowerDbm > band.txMax) n.props.txPowerDbm = band.txMax;
    }
    if (n.type === 'satellite') {
      clampPos(n);
      if (['orbit', 'satsPerPlane', 'motion', 'passMaxElevDeg'].includes(f.key)) {
        delete S.satHist[n.id];
        delete S.satTrack[n.id];
      }
    }
    if (n.type === 'vsatAntenna' && f.key === 'autoPoint' && value === false) {
      // Pré-remplit les champs de pointage avec des valeurs arrondies (à corriger par l'élève)
      const lk = radioLinksOf(n)[0];
      if (lk && lk.state && lk.state.ideal && !n.props.azimuthDeg && !n.props.elevationDeg) {
        n.props.azimuthDeg = Math.round(lk.state.ideal.azimuth);
        n.props.elevationDeg = Math.round(lk.state.ideal.elevation);
        n.props.skewDeg = 0;
      }
    }
    if (f.key === 'failed') log(value ? `⚠ Panne simulée sur « ${n.name} ».` : `✔ « ${n.name} » réparé.`, value ? 'warn' : 'ok');
    if (committed && (f.kind === 'select' || f.kind === 'check')) update();
    else scheduleUpdate({ keepInspector: true });
  }
  function onLinkFieldChange(l, f, value, committed) {
    if (S.locked && committed !== false) journalAdd({ kind: 'config', target: l.id, name: linkName(l), key: f.key });
    if (!historyArmed) {
      pushHistory();
      historyArmed = true;
    }
    if (committed) historyArmed = false;
    if (f.key === 'capacityMbps' || f.key === 'sdSpacingM') value = num(value);
    l.props[f.key] = value;
    if (f.key === 'cut') log(value ? `✂ Lien « ${linkName(l)} » coupé.` : `✔ Lien « ${linkName(l)} » rétabli.`, value ? 'warn' : 'ok');
    update();
  }

  function renderInspector(opts = {}) {
    const sel = S.selection;
    const title = $('#insp-title');
    const sub = $('#insp-subtitle');
    let node = null;
    let link = null;
    if (sel && sel.kind === 'node') node = nodeById(sel.id);
    if (sel && sel.kind === 'link') link = linkById(sel.id);
    if (!node && !link) {
      S.selection = null;
      title.textContent = 'Inspecteur';
      sub.textContent = 'Aucune sélection';
      if (!opts.keepProps) {
        ipaneProps.innerHTML = `<div class="empty-state"><svg><use href="#ico-select"/></svg><p>Sélectionnez un équipement ou un lien sur le canevas pour afficher et modifier ses paramètres.</p></div>${projectSettingsHtml()}`;
        bindProjectSettings();
      }
    } else if (node) {
      title.textContent = node.name;
      sub.textContent = (CATALOG[node.type] ? CATALOG[node.type].label : node.type) + (siteOf(node) ? ' · sur ' + siteOf(node).name : '');
      if (!opts.keepProps) renderNodeProps(node);
      else refreshInfoFields();
    } else {
      title.textContent = linkName(link);
      sub.textContent = MEDIUM_LABEL[link.medium] || link.medium;
      if (!opts.keepProps) renderLinkProps(link);
    }
    const rl = node ? primaryRadioLink(node) : link && RADIO_MEDIA.includes(link.medium) ? link : null;
    renderBudget(rl, node);
    renderProfile(rl);
    renderNetworkPane();
    $$('.itab').forEach((t) => {
      if (t.dataset.itab === 'budget' || t.dataset.itab === 'profile') t.classList.toggle('has-data', !!rl);
    });
  }
  function primaryRadioLink(n) {
    if (['antenna', 'fullOutdoor', 'blrBts', 'blrCpe', 'vsatAntenna', 'hub', 'satellite'].includes(n.type)) return radioLinksOf(n)[0] || null;
    if (n.type === 'odu') {
      const ant = neighborOfType(n, 'antenna', ['if']);
      return ant ? radioLinksOf(ant)[0] || null : null;
    }
    if (n.type === 'idu') {
      const odu = neighborOfType(n, 'odu', ['if']);
      const ant = odu ? neighborOfType(odu, 'antenna', ['if']) : null;
      return ant ? radioLinksOf(ant)[0] || null : null;
    }
    if (n.type === 'buc' || n.type === 'lnb') {
      const ant = neighborOfType(n, 'vsatAntenna', ['coax']);
      return ant ? radioLinksOf(ant)[0] || null : null;
    }
    if (n.type === 'vsatModem') {
      for (const c of neighbors(n, ['coax'])) {
        const ant = neighborOfType(c.node, 'vsatAntenna', ['coax']);
        if (ant && radioLinksOf(ant)[0]) return radioLinksOf(ant)[0];
      }
    }
    if (isSite(n)) {
      const kid = S.topo.nodes.find((x) => x.props.siteId === n.id && radioLinksOf(x).length);
      return kid ? radioLinksOf(kid)[0] : null;
    }
    return null;
  }

  function renderNodeProps(n) {
    ipaneProps.innerHTML = '';
    const site = siteOf(n);
    if (site) {
      const m = document.createElement('div');
      m.className = 'mount-info';
      m.innerHTML = `<span>Fixé sur <b>${esc(site.name)}</b> (${site.type === 'tower' ? 'pylône ' + fmt(siteHeightM(site), 0) + ' m' : 'immeuble ' + fmt(siteHeightM(site), 0) + ' m'})</span>`;
      const b = document.createElement('button');
      b.className = 'btn btn-xs';
      b.textContent = 'Détacher';
      b.onclick = () => {
        pushHistory();
        delete n.props.siteId;
        n.x += 60;
        update();
      };
      m.appendChild(b);
      ipaneProps.appendChild(m);
    } else if (MOUNTABLE.includes(n.type)) {
      const m = document.createElement('div');
      m.className = 'small-muted';
      m.style.marginBottom = '10px';
      m.textContent = 'Astuce : glissez cet équipement sur un pylône ou un immeuble pour l’y fixer.';
      ipaneProps.appendChild(m);
    }
    const sec = document.createElement('div');
    sec.className = 'section';
    sec.innerHTML = '<div class="section-title">Identification</div>';
    renderForm(sec, n, [{ key: 'name', label: 'Nom', kind: 'text' }], (f, v) => {
      pushHistory();
      n.name = String(v).trim() || n.name;
      update();
    });
    ipaneProps.appendChild(sec);
    const sec2 = document.createElement('div');
    sec2.className = 'section';
    sec2.innerHTML = '<div class="section-title">Paramètres</div>';
    sec2.dataset.infoHost = '1';
    renderForm(sec2, n.props, fieldsFor(n), (f, v, c) => onNodeFieldChange(n, f, v, c));
    ipaneProps.appendChild(sec2);
    // Problèmes détectés sur les liens de l'équipement
    const issues = [];
    for (const l of S.topo.links.filter((x) => x.a === n.id || x.b === n.id)) for (const i of (l.state && l.state.issues) || []) issues.push(i);
    if (issues.length) ipaneProps.appendChild(issuesBlock(issues));
    if (S.mode === 'diag' && !isSite(n) && n.type !== 'satellite') {
      const lw = document.createElement('div');
      lw.className = 'section';
      lw.innerHTML = `<div class="section-title">Voyants</div>${ledsHtml(n)}`;
      ipaneProps.appendChild(lw);
      if (PN().interventionsFor(n).length) ipaneProps.appendChild(interventionBox(n));
    }
    
    const actions = document.createElement('div');
    actions.className = 'btn-row';
    const del = document.createElement('button');
    del.className = 'btn btn-xs btn-danger';
    del.textContent = 'Supprimer';
    del.onclick = () => deleteNode(n.id);
    actions.appendChild(del);
    if (isEndpoint(n)) {
      const pf = document.createElement('button');
      pf.className = 'btn btn-xs';
      pf.textContent = 'Ping depuis ce terminal…';
      pf.onclick = () => {
        setTool('ping');
        S.pending = n;
        render();
      };
      actions.appendChild(pf);
    }
    ipaneProps.appendChild(actions);
  }
  function refreshInfoFields() {
    // Mise à jour légère : on ne reconstruit pas le formulaire pendant une saisie
    const n = S.selection && nodeById(S.selection.id);
    if (!n) return;
    const host = ipaneProps.querySelector('[data-info-host]');
    if (!host) return;
    const infos = fieldsFor(n).filter((f) => f.kind === 'info' && (!f.when || f.when()));
    const rows = host.querySelectorAll('.field.readonly .val');
    infos.forEach((f, i) => {
      if (rows[i]) rows[i].textContent = f.value();
    });
  }
  function issuesBlock(issues) {
    const ul = document.createElement('ul');
    ul.className = 'issue-list';
    const seen = new Set();
    for (const i of issues) {
      if (seen.has(i.text)) continue;
      seen.add(i.text);
      const li = document.createElement('li');
      li.className = i.level || 'warn';
      li.textContent = i.text;
      ul.appendChild(li);
    }
    return ul;
  }

  function renderLinkProps(l) {
    ipaneProps.innerHTML = '';
    const st = l.state || {};
    const head = document.createElement('div');
    head.className = 'section';
    const a = nodeById(l.a);
    const b = nodeById(l.b);
    head.innerHTML = `<div class="section-title">Liaison</div>
      <div class="field readonly"><label>Type</label><div class="val">${esc(MEDIUM_LABEL[l.medium] || l.medium)}</div></div>
      <div class="field readonly"><label>Extrémités</label><div class="val">${esc(a.name)} ↔ ${esc(b.name)}</div></div>
      ${RADIO_MEDIA.includes(l.medium) ? `<div class="field readonly"><label>État</label><div class="val"><span class="status-pill ${st.status}">${esc(RP.statusLabel(st.status))}</span></div></div>` : `<div class="field readonly"><label>État</label><div class="val"><span class="status-pill ${st.up ? 'ok' : 'err'}">${st.up ? 'En service' : 'Hors service'}</span></div></div>`}
      ${st.distanceKm ? `<div class="field readonly"><label>Distance</label><div class="val">${fmt(st.distanceKm, 2)} km</div></div>` : ''}
      <div class="field readonly"><label>Débit disponible</label><div class="val">${fmt(st.capacityMbps || 0, 1)} Mbit/s${st.capacityDir && Math.abs(st.capacityDir.ab - st.capacityDir.ba) > 0.5 ? ` (${fmt(st.capacityDir.ab, 1)} / ${fmt(st.capacityDir.ba, 1)})` : ''}</div></div>`;
    ipaneProps.appendChild(head);
    const load = S.analysis && S.analysis.linkLoads[l.id];
    if (load) {
      const u = document.createElement('div');
      u.className = 'section';
      const pct = Math.min(100, load.utilisation * 100);
      u.innerHTML = `<div class="section-title">Charge</div><div class="gauge ${pct > 95 ? 'err' : pct > 75 ? 'warn' : ''}"><span style="width:${pct}%"></span></div><div class="small-muted" style="margin-top:4px">${fmt(load.utilisation * 100, 0)} % · ${fmt(load.ab, 1)} Mbit/s →, ${fmt(load.ba, 1)} Mbit/s ←</div>`;
      ipaneProps.appendChild(u);
    }
    const sec = document.createElement('div');
    sec.className = 'section';
    sec.innerHTML = '<div class="section-title">Paramètres</div>';
    renderForm(sec, l.props, linkFieldsFor(l), (f, v, c) => onLinkFieldChange(l, f, v, c));
    ipaneProps.appendChild(sec);
    if (st.issues && st.issues.length) ipaneProps.appendChild(issuesBlock(st.issues));
    if (S.mode === 'diag' && PN().interventionsFor(l).length) ipaneProps.appendChild(interventionBox(l));
    
    const actions = document.createElement('div');
    actions.className = 'btn-row';
    const del = document.createElement('button');
    del.className = 'btn btn-xs btn-danger';
    del.textContent = 'Supprimer le lien';
    del.onclick = () => deleteLink(l.id);
    actions.appendChild(del);
    if (S.mode === 'diag') {
      const cut = document.createElement('button');
      cut.className = 'btn btn-xs';
      cut.textContent = l.props.cut ? 'Rétablir le lien' : 'Couper le lien';
      cut.onclick = () => handleLinkClickTool(l);
      actions.appendChild(cut);
    }
    ipaneProps.appendChild(actions);
  }
  function handleLinkClickTool(l) {
    pushHistory();
    l.props.cut = !l.props.cut;
    log(l.props.cut ? `✂ Lien « ${linkName(l)} » coupé.` : `✔ Lien « ${linkName(l)} » rétabli.`, l.props.cut ? 'warn' : 'ok');
    update();
  }

  function projectSettingsHtml() {
    const st = S.topo.settings;
    let teacherHtml = '';
    
    return `<div class="section" style="margin-top:6px"><div class="section-title">Projet</div>
      <div class="field"><label>Titre</label><input type="text" id="set-title" value="${esc(st.title)}"></div>
      <div class="field"><label>Origine du plan (lat.)</label><div class="inline"><input type="number" id="set-lat" step="0.01" value="${num(st.refLat, REF.lat)}"><span class="unit">° N</span></div></div>
      <div class="field"><label>Origine du plan (long.)</label><div class="inline"><input type="number" id="set-lon" step="0.01" value="${num(st.refLon, REF.lon)}"><span class="unit">° E</span></div></div>
      <div class="hint small-muted">L’origine (x = 0, horizon) sert à calculer les coordonnées des stations VSAT placées sur le plan. Par défaut : Ouagadougou.</div></div>
      ${propagationSettingsHtml()}
      ${teacherHtml}
      <div class="section"><div class="section-title">Raccourcis clavier</div>
      <div class="small-muted">V sélection · L lier · F flux · P ping · C panne (Diagnostic) · Suppr supprimer · Ctrl+Z / Ctrl+Y annuler / rétablir · Ctrl+S sauvegarder · + / − / 0 zoom · Échap annuler · molette = zoom · glisser le fond = déplacer la vue</div></div>`;
  }
  function propagationSettingsHtml() {
    const st = S.topo.settings;
    const cl = climate();
    const obj = [99.9, 99.95, 99.99, 99.995, 99.999];
    return `<div class="section"><div class="section-title">Propagation et plan de fréquences</div>
      <div class="field"><label>Climat (disponibilité UIT-R P.530)</label><select id="set-climate">${RP.CLIMATES.map((c) => `<option value="${c.id}" ${c.id === cl.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
      ${
        cl.id === 'custom'
          ? `<div class="field"><label>Gradient de réfractivité dN1</label><div class="inline"><input type="number" id="set-dn1" step="10" value="${cl.dN1}"><span class="unit">N/km</span></div></div>
      <div class="field"><label>Intensité de pluie R0,01</label><div class="inline"><input type="number" id="set-r001" step="5" value="${cl.r001}"><span class="unit">mm/h</span></div></div>`
          : `<div class="hint small-muted">dN1 = ${cl.dN1} N/km · R0,01 = ${cl.r001} mm/h (valeurs indicatives).</div>`
      }
      <div class="field"><label>Objectif de disponibilité</label><select id="set-objective">${obj.map((v) => `<option value="${v}" ${v === cl.objective ? 'selected' : ''}>${fmt(v, 3)} % (${RP.downtimeText(((100 - v) / 100) * 365.25 * 86400)} de coupure / an)</option>`).join('')}</select></div>
      <div class="field"><label>Interférences entre bonds FH</label><div class="inline"><input type="checkbox" id="set-interf" ${st.interference ? 'checked' : ''}><span class="small-muted">calculer le brouillage (plan de fréquences)</span></div></div></div>`;
  }
  function bindProjectSettings() {
    const t = $('#set-title');
    if (!t) return;
    const set = (k, v) => {
      pushHistory();
      S.topo.settings[k] = v;
      update();
    };
    
    $('#set-climate').addEventListener('change', (e) => {
      stat('climate_' + e.target.value);
      set('climate', e.target.value);
    });
    $('#set-objective').addEventListener('change', (e) => set('availObjective', num(e.target.value, 99.99)));
    $('#set-interf').addEventListener('change', (e) => {
      set('interference', e.target.checked);
      log(e.target.checked ? 'Calcul des interférences activé : chaque récepteur FH tient compte des autres émetteurs.' : 'Calcul des interférences désactivé.', 'info');
    });
    if ($('#set-dn1')) $('#set-dn1').addEventListener('change', (e) => set('dN1', num(e.target.value, -300)));
    if ($('#set-r001')) $('#set-r001').addEventListener('change', (e) => set('r001', num(e.target.value, 90)));
    t.addEventListener('change', () => {
      S.topo.settings.title = t.value.trim() || 'Topologie sans titre';
      updateStatusBar();
    });
    $('#set-lat').addEventListener('change', (e) => {
      S.topo.settings.refLat = num(e.target.value, REF.lat);
      update();
    });
    $('#set-lon').addEventListener('change', (e) => {
      S.topo.settings.refLon = num(e.target.value, REF.lon);
      update();
    });
  }

  /* --- Bilan de liaison --- */
  function fmtVal(v, unit) {
    let d = 2;
    if (unit === 'Mbit/s' || unit === 'K' || unit === 'm' || unit === '%') d = 1;
    if (unit === 'bit/symbole') d = 2;
    return `${fmt(v, d)} <small>${esc(unit || '')}</small>`;
  }
  function stepsHtml(steps) {
    return (
      '<div class="calc-steps">' +
      steps
        .map(
          (s) => `<div class="calc-step"><div class="cs-head"><span class="cs-label">${esc(s.label)}</span><span class="cs-value">${fmtVal(s.value, s.unit)}</span></div>${s.formula ? `<div class="cs-formula">${esc(s.formula)}</div>` : ''}${s.substituted ? `<div class="cs-subst">${esc(s.substituted)}</div>` : ''}${s.note ? `<div class="cs-note">${esc(s.note)}</div>` : ''}</div>`
        )
        .join('') +
      '</div>'
    );
  }
  function kpi(label, value, unit, cls = '', wide = false) {
    return `<div class="kpi ${cls} ${wide ? 'wide' : ''}"><div class="k-label">${esc(label)}</div><div class="k-value">${value}${unit ? ` <small>${esc(unit)}</small>` : ''}</div></div>`;
  }
  const marginCls = (m) => (m >= 25 ? 'ok' : m >= 10 ? 'warn' : 'err');

  function renderBudget(l, selNode) {
    if (!l || !l.state) {
      const radio = S.topo.links.some((x) => RADIO_MEDIA.includes(x.medium));
      ipaneBudget.innerHTML = '<div class="empty-state"><p>Sélectionnez une liaison radio (FH, BLR ou VSAT), ou un équipement qui en fait partie, pour afficher son bilan détaillé pas à pas.</p></div>' + (radio ? recetteFicheHtml() : '');
      if (radio) bindRecetteFiche(ipaneBudget);
      return;
    }
    const st = l.state;
    if (st.kind === 'fh' && st.budgets) return renderFhBudget(l, st);
    if (st.kind === 'blr' && st.budgets) return renderBlrBudget(l, st);
    if (st.kind === 'vsat' && st.role === 'remote' && st.result) return renderVsatBudget(l, st);
    if (st.kind === 'vsat' && st.role === 'hub') return renderHubBudget(l, st);
    ipaneBudget.innerHTML = `<p><span class="status-pill down">Coupure</span></p>`;
    if (st.issues && st.issues.length) ipaneBudget.appendChild(issuesBlock(st.issues));
  }

  function dirSwitch(options, current, onPick) {
    const d = document.createElement('div');
    d.className = 'dir-switch';
    for (const [v, t] of options) {
      const b = document.createElement('button');
      b.textContent = t;
      b.className = v === current ? 'active' : '';
      b.onclick = () => onPick(v);
      d.appendChild(b);
    }
    return d;
  }

  function renderFhBudget(l, st) {
    const A = st.ends.A.node;
    const B = st.ends.B.node;
    const nA = siteOf(A) ? siteOf(A).name : A.name;
    const nB = siteOf(B) ? siteOf(B).name : B.name;
    const bud = S.budgetDir === 'ba' ? st.budgets.ba : st.budgets.ab;
    const av = st.availability ? st.availability[S.budgetDir === 'ba' ? 'ba' : 'ab'] : null;
    ipaneBudget.innerHTML = '';
    ipaneBudget.appendChild(
      dirSwitch(
        [
          ['ab', `${nA} → ${nB}`],
          ['ba', `${nB} → ${nA}`],
        ],
        S.budgetDir,
        (v) => {
          S.budgetDir = v;
          renderBudget(l);
        }
      )
    );
    const box = document.createElement('div');
    const act = bud.activeModulation;
    box.innerHTML =
      `<p><span class="status-pill ${st.status}">${esc(RP.statusLabel(st.status))}</span> <span class="small-muted">${esc(st.band.label)} · canal ${st.channelMHz} MHz${st.dualPol ? ' · V+H' : ''}</span></p>` +
      '<div class="kpi-grid">' +
      kpi('Distance', fmt(st.distanceKm, 2), 'km') +
      kpi('Fréquence', fmt(st.fGHz, 1), 'GHz') +
      kpi('RSL', fmt(bud.rsl, 1), 'dBm', bud.status === 'down' ? 'err' : '') +
      kpi('Marge au fading', fmt(bud.fadeMarginRef, 1), 'dB', marginCls(bud.fadeMarginRef)) +
      kpi('Modulation active', act ? act.id : 'COUPÉ', '', bud.status === 'optimal' ? 'ok' : bud.status === 'degraded' ? 'warn' : 'err') +
      kpi('Capacité', fmt(bud.capacityMbps, 0), 'Mbit/s') +
      kpi('Atténuation pluie', fmt(bud.rain, 1), 'dB', bud.rain > 10 ? 'warn' : '') +
      kpi('Marge avant coupure', fmt(bud.marginToCut, 1), 'dB', marginCls(bud.marginToCut + 15)) +
      (av ? kpi('Disponibilité ' + av.nominal.id, fmt(av.nominal.availPct, 4), '%', av.meets ? 'ok' : 'err') + kpi('Coupure du débit nominal', RP.downtimeText(av.nominal.downtimeS), 'par an', av.meets ? 'ok' : 'err') : '') +
      (bud.ciExtDb !== null && bud.ciExtDb !== undefined ? kpi('C/I (brouillage)', fmt(bud.ciExtDb, 1), 'dB', bud.ciExtDb >= 30 ? 'ok' : bud.ciExtDb >= 15 ? 'warn' : 'err') : '') +
      '</div>';
    ipaneBudget.appendChild(box);
    if (st.issues.length) ipaneBudget.appendChild(issuesBlock(st.issues));
    const g = document.createElement('div');
    g.innerHTML = `<div class="calc-group-title">Calcul pas à pas</div>${stepsHtml([RP.dishGainStep(st.ends.A.ant.diameterM, st.fGHz)].concat(bud.steps))}<div class="calc-group-title">Seuils de réception & ACM (canal ${st.channelMHz} MHz)</div>${modTable(bud)}`;
    ipaneBudget.appendChild(g);
    if (av) {
      const h = document.createElement('div');
      h.innerHTML = availabilityHtml(st, av, S.budgetDir === 'ba' ? 'ba' : 'ab', nA, nB);
      ipaneBudget.appendChild(h);
    }
    if (st.freq) {
      const h = document.createElement('div');
      h.innerHTML = freqPlanHtml(st, S.budgetDir === 'ba' ? 'ba' : 'ab', nA, nB, bud);
      ipaneBudget.appendChild(h);
    }
  }
  /** Disponibilité annuelle par modulation (UIT-R P.530). */
  function availabilityHtml(st, av, dir, nA, nB) {
    const cl = climate();
    const dv = st.diversity ? st.diversity[dir] : null;
    const pct = (v) => (v >= 99.99 ? '100' : v < 1e-5 ? '< 0,00001' : v < 0.001 ? v.toExponential(1).replace('.', ',') : fmt(v, 4));
    const rows = av.rows
      .slice()
      .reverse()
      .map((r) => `<tr class="${r === av.nominal ? 'active-row' : ''} ${r.availPct < av.objective ? 'ko' : ''}"><td>${r.id}</td><td class="num">${fmt(r.margin, 1)}</td><td class="num">${r.margin <= 0 ? '—' : pct(r.multipathPct)}</td><td class="num">${r.margin <= 0 ? '—' : pct(r.rainPct)}</td><td class="num">${fmt(r.availPct, 4)}</td><td class="num">${r.margin <= 0 ? 'jamais disponible' : RP.downtimeText(r.downtimeS)}</td></tr>`)
      .join('');
    return `<div class="calc-group-title">Disponibilité annuelle (UIT-R P.530)</div>
      <p class="small-muted">Climat : ${esc(cl.label)} · dN1 = ${cl.dN1} N/km · R0,01 = ${cl.r001} mm/h · objectif ${fmt(cl.objective, 3)} %${dv ? ` · <b>diversité d’espace</b> S = ${fmt(st.diversity.sM, 0)} m (antenne basse à ${fmt(dv.h2, 0)} m, I = ${fmt(av.nominal.div ? av.nominal.div.I : 1, 1)})` : ''}.</p>
      <div class="verdict ${av.meets ? 'ok' : 'err'}">${esc(dir === 'ba' ? nB + ' → ' + nA : nA + ' → ' + nB)} : débit nominal (${av.nominal.id}) disponible ${fmt(av.nominal.availPct, 4)} % du temps, soit ${RP.downtimeText(av.nominal.downtimeS)} de dégradation par an. ${av.meets ? 'Objectif atteint.' : 'Objectif non atteint.'}${av.link !== av.nominal ? ` Coupure totale (sous le seuil ${av.link.id}) : ${RP.downtimeText(av.link.downtimeS)} par an.` : ''}</div>
      <table class="data-table"><thead><tr><th>Modulation</th><th>Marge (dB)</th><th>Trajets multiples (%)</th><th>Pluie (%)</th><th>Disponibilité (%)</th><th>Coupure / an</th></tr></thead><tbody>${rows}</tbody></table>
      ${stepsHtml(av.steps)}`;
  }
  /** Plan de fréquences du bond et brouilleurs reçus. */
  function freqPlanHtml(st, dir, nA, nB, bud) {
    const fq = st.freq;
    let h = `<div class="calc-group-title">Plan de fréquences</div><table class="data-table"><thead><tr><th>Extrémité</th><th>Demi-bande</th><th>Canal</th><th>Émission</th><th>Réception</th></tr></thead><tbody>
      <tr><td>${esc(nA)}</td><td>${HALF_TXT[fq.A.half]}</td><td class="num">${fq.A.ch}</td><td class="num">${fmt(fq.A.txGHz * 1000, 0)} MHz</td><td class="num">${fmt(fq.B.txGHz * 1000, 0)} MHz</td></tr>
      <tr><td>${esc(nB)}</td><td>${HALF_TXT[fq.B.half]}</td><td class="num">${fq.B.ch}</td><td class="num">${fmt(fq.B.txGHz * 1000, 0)} MHz</td><td class="num">${fmt(fq.A.txGHz * 1000, 0)} MHz</td></tr></tbody></table>`;
    if (!st.interference) return h + '<p class="small-muted">Calcul des interférences désactivé (réglages du projet : cliquez sur le fond du canevas).</p>';
    const at = dir === 'ba' ? st.interference.atA : st.interference.atB;
    const rx = dir === 'ba' ? nA : nB;
    if (!at.list.length) return h + `<div class="verdict ok">Aucun émetteur sur la fréquence reçue par ${esc(rx)} ni sur les canaux adjacents : pas de brouillage.</div>`;
    h += `<div class="calc-group-title">Brouilleurs reçus par ${esc(rx)}</div><table class="data-table"><thead><tr><th>Émetteur</th><th>Géométrie</th><th>Discrimination</th><th>C/I</th></tr></thead><tbody>`;
    for (const x of at.list.slice(0, 6)) {
      const ci = bud.rsl - x.iDbm;
      h += `<tr class="${ci < 30 ? 'ko' : ''}"><td>${esc(x.from)} → ${esc(x.to)}<br><small>${HALF_TXT[x.half]}, canal ${x.ch}</small></td><td>${x.coloc ? 'même pylône' : fmt(x.dKm, 1) + ' km'}<br><small>Tx ${fmt(x.offTx, 0)}° · Rx ${fmt(x.offRx, 0)}° hors axe</small></td><td>${esc(x.nfd)}${x.nfdDb ? ' −' + x.nfdDb + ' dB' : ''}${x.xpdDb ? `<br><small>polar. croisée −${x.xpdDb} dB</small>` : ''}</td><td class="num">${fmt(ci, 1)} dB<br><small>I ${fmt(x.iDbm, 1)} dBm</small></td></tr>`;
    }
    h += `</tbody></table><div class="verdict ${bud.ciExtDb >= 30 ? 'ok' : bud.ciExtDb >= 15 ? 'warn' : 'err'}">Brouillage total I = ${fmt(at.iDbm, 1)} dBm · C/I = ${fmt(bud.ciExtDb, 1)} dB ${bud.ciExtDb >= 30 ? '(suffisant)' : '(trop faible : changez de canal, de polarisation, ou respectez la règle haut / bas)'}.</div>
      <p class="small-muted">I = Ptx − pertes + G_Tx(angle) − FSL − pluie + G_Rx(angle) − discrimination de filtrage − découplage de polarisation. Diagramme d’antenne de référence UIT-R F.699 ; antennes d’un même pylône : couplage latéral (90°) à 10 m.</p>`;
    return h;
  }
  function modTable(bud) {
    const act = bud.activeModulation;
    const maxIdx = bud.thresholds.findIndex((t) => t.id === bud.maxModulation.id);
    return (
      '<table class="data-table"><thead><tr><th>Modulation</th><th>C/N requis</th><th>Seuil</th><th>Débit</th></tr></thead><tbody>' +
      bud.thresholds
        .map((t, i) => {
          const cls = act && t.id === act.id ? 'active-row' : i > maxIdx || bud.sinr < t.snr ? 'ko' : '';
          return `<tr class="${cls}"><td>${t.id}</td><td class="num">${fmt(t.snr, 1)} dB</td><td class="num">${fmt(t.thresholdDbm, 1)} dBm</td><td class="num">${fmt(t.capacityMbps * (bud.capacityMbps && act ? bud.capacityMbps / act.capacityMbps : 1), 0)}</td></tr>`;
        })
        .join('') +
      '</tbody></table>'
    );
  }

  function renderBlrBudget(l, st) {
    const bud = S.budgetDir === 'ba' ? st.budgets.ul : st.budgets.dl;
    ipaneBudget.innerHTML = '';
    ipaneBudget.appendChild(
      dirSwitch(
        [
          ['ab', `Descendant (BTS → ${st.cpe.name})`],
          ['ba', 'Montant (CPE → BTS)'],
        ],
        S.budgetDir,
        (v) => {
          S.budgetDir = v;
          renderBudget(l);
        }
      )
    );
    const box = document.createElement('div');
    const act = bud.activeModulation;
    box.innerHTML =
      `<p><span class="status-pill ${st.status}">${esc(RP.statusLabel(st.status))}</span> <span class="small-muted">${esc(st.band.label)} · ${st.channelMHz} MHz · TDD 70/30 · ${st.nCpe} CPE sur la BTS</span></p>` +
      '<div class="kpi-grid">' +
      kpi('Distance', fmt(st.distanceKm, 2), 'km') +
      kpi('Écart au secteur', fmt(st.offAxisDeg, 0), '°', Math.abs(st.offAxisDeg) > num(st.bts.props.sectorDeg) / 2 ? 'warn' : '') +
      kpi('RSL', fmt(bud.rsl, 1), 'dBm') +
      kpi('Marge (MCS réf.)', fmt(bud.fadeMarginRef, 1), 'dB', marginCls(bud.fadeMarginRef + 10)) +
      kpi('MCS actif', act ? act.id : 'COUPÉ', '', bud.status === 'optimal' ? 'ok' : bud.status === 'degraded' ? 'warn' : 'err') +
      kpi('Débit par abonné', fmt(S.budgetDir === 'ba' ? st.ulCap : st.dlCap, 1), 'Mbit/s') +
      kpi('Gain BTS / CPE', fmt(st.gains.gBts, 1) + ' / ' + fmt(st.gains.gCpe, 0), 'dBi', '', true) +
      '</div>';
    ipaneBudget.appendChild(box);
    if (st.issues.length) ipaneBudget.appendChild(issuesBlock(st.issues));
    const g = document.createElement('div');
    g.innerHTML = `<div class="calc-group-title">Calcul pas à pas</div>${stepsHtml(bud.steps)}<div class="calc-group-title">Partage de la cellule</div>${stepsHtml([
      U.step('Débit radio du MCS actif', 'D = débit symbole OFDM × bits utiles', '', bud.capacityMbps, 'Mbit/s'),
      U.step(
        'Débit par abonné (' + (S.budgetDir === 'ba' ? 'montant' : 'descendant') + ')',
        'D_abonné = D × part TDD / nombre de CPE',
        `D = ${fmt(bud.capacityMbps, 1)} × ${S.budgetDir === 'ba' ? '0,3' : '0,7'} / ${st.nCpe}`,
        S.budgetDir === 'ba' ? st.ulCap : st.dlCap,
        'Mbit/s',
        'La BLR est point-à-multipoint : la capacité du secteur est partagée entre les abonnés.'
      ),
    ])}<div class="calc-group-title">Seuils & MCS</div>${modTable(bud)}`;
    ipaneBudget.appendChild(g);
  }

  function renderVsatBudget(l, st) {
    const r = st.result;
    const dir = S.satDir === 'ret' ? r.ret : r.forward;
    ipaneBudget.innerHTML = '';
    ipaneBudget.appendChild(
      dirSwitch(
        [
          ['fwd', 'Aller : Hub → VSAT'],
          ['ret', 'Retour : VSAT → Hub'],
        ],
        S.satDir,
        (v) => {
          S.satDir = v;
          renderBudget(l);
        }
      )
    );
    const box = document.createElement('div');
    box.innerHTML =
      `<p><span class="status-pill ${st.status}">${esc(RP.statusLabel(st.status))}</span> <span class="small-muted">${esc(r.band.label)} · ${esc(r.orbit.label)}</span></p>` +
      '<div class="kpi-grid">' +
      kpi('PIRE VSAT', fmt(r.remoteRf.eirp, 1), 'dBW') +
      kpi('G/T VSAT', fmt(r.remoteGt.gt, 1), 'dB/K') +
      kpi('Eb/N0 aller', r.forward.ebn0 !== null ? fmt(r.forward.ebn0, 1) : '—', 'dB', r.forward.status === 'down' ? 'err' : r.forward.status === 'degraded' ? 'warn' : 'ok') +
      kpi('Eb/N0 retour', r.ret.ebn0 !== null ? fmt(r.ret.ebn0, 1) : '—', 'dB', r.ret.status === 'down' ? 'err' : r.ret.status === 'degraded' ? 'warn' : 'ok') +
      kpi('MODCOD aller', r.forward.modcod ? r.forward.modcod.id : 'COUPÉ', '') +
      kpi('MODCOD retour', r.ret.modcod ? r.ret.modcod.id : 'COUPÉ', '') +
      kpi('Débit ↓ / ↑', fmt(st.fwdCap, 1) + ' / ' + fmt(st.retCap, 1), 'Mbit/s') +
      kpi('Latence RTT', fmt(r.latency.rttMs, 0), 'ms', r.latency.rttMs > 400 ? 'warn' : 'ok') +
      '</div>';
    ipaneBudget.appendChild(box);
    if (st.issues.length) ipaneBudget.appendChild(issuesBlock(st.issues));
    const g = document.createElement('div');
    let html = '';
    if (!r.remoteGeometry.tracking) html += `<div class="calc-group-title">Pointage de l’antenne VSAT</div>${stepsHtml(r.remoteGeometry.steps.concat(r.pointing.steps))}`;
    else html += `<div class="calc-group-title">Géométrie (satellite défilant)</div>${stepsHtml(r.remoteGeometry.steps)}`;
    html += `<div class="calc-group-title">Bilan ${S.satDir === 'ret' ? 'retour (VSAT → satellite → Hub)' : 'aller (Hub → satellite → VSAT)'}</div>${stepsHtml(dir.steps)}`;
    html += `<div class="calc-group-title">Latence</div>${stepsHtml(r.latency.steps)}`;
    g.innerHTML = html;
    ipaneBudget.appendChild(g);
  }
  function renderHubBudget(l, st) {
    ipaneBudget.innerHTML =
      `<p><span class="status-pill ${st.status}">${esc(RP.statusLabel(st.status))}</span> <span class="small-muted">Liaison Hub ↔ satellite</span></p>` +
      (st.remotes.length
        ? '<table class="data-table"><thead><tr><th>Station</th><th>Aller</th><th>Retour</th><th>RTT</th></tr></thead><tbody>' +
          st.remotes
            .map(
              (r) =>
                `<tr><td>${esc(r.chain.ant.name)}</td><td>${r.result.forward.modcod ? r.result.forward.modcod.id : 'COUPÉ'}</td><td>${r.result.ret.modcod ? r.result.ret.modcod.id : 'COUPÉ'}</td><td class="num">${fmt(r.result.latency.rttMs, 0)} ms</td></tr>`
            )
            .join('') +
          '</tbody></table><p class="small-muted">Sélectionnez la liaison d’une station distante pour son bilan détaillé.</p>'
        : '<p class="small-muted">Aucune station VSAT distante n’est reliée à ce satellite.</p>');
    if (st.issues.length) ipaneBudget.appendChild(issuesBlock(st.issues));
  }

  /* --- Profil de terrain & Fresnel / pointage VSAT --- */
  function renderProfile(l) {
    if (!l || !l.state) {
      ipaneProfile.innerHTML = '<div class="empty-state"><p>Sélectionnez une liaison FH ou BLR pour afficher le profil de terrain et la 1ère zone de Fresnel, ou une liaison VSAT pour l’aide au pointage.</p></div>';
      return;
    }
    const st = l.state;
    if ((st.kind === 'fh' || st.kind === 'blr') && st.profile) {
      const pr = st.profile;
      const a = st.kind === 'fh' ? st.ends.A.node : st.bts;
      const b = st.kind === 'fh' ? st.ends.B.node : st.cpe;
      const nA = siteOf(a) ? siteOf(a).name : a.name;
      const nB = siteOf(b) ? siteOf(b).name : b.name;
      const verdicts = {
        clear100: ['ok', `1ère zone de Fresnel dégagée à 100 % (minimum ${fmt(pr.minRatio * 100, 0)} %). Visibilité directe parfaite.`],
        clear60: ['ok', `Dégagement minimum ${fmt(pr.minRatio * 100, 0)} % de F1 : critère des 60 % respecté. Pour 100 % : surélever les deux antennes de ${fmt(pr.requiredRaise100M, 1)} m.`],
        partial: ['warn', `Dégagement minimum ${fmt(pr.minRatio * 100, 0)} % de F1 (< 60 %) : perte de diffraction ${fmt(pr.diffractionLossDb, 1)} dB. Surélever les antennes de ${fmt(pr.requiredRaise60M, 1)} m (60 %) ou ${fmt(pr.requiredRaise100M, 1)} m (100 %).`],
        blocked: ['err', `Visibilité directe OBSTRUÉE${pr.worst && pr.worst.obstacleName ? ' par « ' + pr.worst.obstacleName + ' »' : ''} : perte de diffraction ${fmt(pr.diffractionLossDb, 1)} dB. Surélever les antennes de ${fmt(pr.requiredRaise60M, 1)} m (60 %) ou ${fmt(pr.requiredRaise100M, 1)} m (100 %).`],
      };
      const v = verdicts[pr.verdict];
      const topHtml =
        `<div class="chart-box">${profileChartSvg(pr, nA, nB)}</div>` +
        `<div class="chart-legend"><span><i style="background:rgba(146,113,62,.7)"></i>Sol + courbure (k = 4/3)</span><span><svg width="16" height="10" style="vertical-align:middle;margin-right:4px"><use href="#art-relief" width="16" height="10"/></svg>Obstacle (relief, immeuble, forêt)</span><span><svg width="8" height="12" style="vertical-align:middle;margin-right:4px;color:#fbbf24"><use href="#art-pylone" width="8" height="12"/></svg>Pylône et antenne</span><span><i style="background:rgba(34,211,238,.25);border:1px solid #22d3ee"></i>1ère zone de Fresnel</span><span><i style="border-top:2px dashed #e2e8f0;height:0"></i>Ligne de visée</span></div>`;
      const bottomHtml =
        `<div class="verdict ${v[0]}">${esc(v[1])}</div>` +
        '<div class="kpi-grid">' +
        kpi('Hauteur antenne A', fmt(pr.hA - pr.points[0].ground, 0), 'm') +
        kpi('Hauteur antenne B', fmt(pr.hB - pr.points[pr.points.length - 1].ground, 0), 'm') +
        kpi('Rayon F1 (milieu)', fmt(RP.fresnelRadiusM(pr.distanceKm / 2, pr.distanceKm / 2, pr.fGHz), 1), 'm') +
        kpi('Renflement (milieu)', fmt(RP.earthBulgeM(pr.distanceKm / 2, pr.distanceKm / 2), 1), 'm') +
        '</div>' +
        `<div class="calc-group-title">Calcul au point critique</div>${stepsHtml(pr.steps)}`;
      mountProfilePane(l, [a, b], topHtml, bottomHtml);
      return;
    }
    if (st.kind === 'vsat' && st.role === 'remote' && st.result) {
      const r = st.result;
      if (r.remoteGeometry.tracking && st.constellation) {
        ipaneProfile.innerHTML = constellationPaneHtml(st.sat, r);
        return;
      }
      if (r.remoteGeometry.tracking) {
        ipaneProfile.innerHTML = `<div class="verdict ok">Satellite ${esc(r.orbit.id)} défilant : l’antenne (motorisée ou plate à balayage électronique) poursuit automatiquement le satellite. Élévation de passage : ${fmt(r.remoteGeometry.elevation, 0)}°, distance ${fmt(r.remoteGeometry.slantRangeKm, 0)} km, période orbitale ${periodTxt(r.periodMin)}.</div>${stepsHtml(r.remoteGeometry.steps)}`;
        return;
      }
      const ideal = st.ideal;
      const ant = st.chain.ant;
      const set = ant.props.autoPoint === false ? { az: num(ant.props.azimuthDeg), el: num(ant.props.elevationDeg), skew: num(ant.props.skewDeg) } : { az: ideal.azimuth, el: ideal.elevation, skew: ideal.skew };
      ipaneProfile.innerHTML =
        `<div class="pointing-box">${compassSvg(ideal.azimuth, set.az)}${elevationSvg(ideal.elevation, set.el)}</div>` +
        `<div class="chart-legend"><span><i style="background:#22c55e"></i>Direction calculée</span><span><i style="background:#f59e0b"></i>Direction réglée</span></div>` +
        '<table class="data-table"><thead><tr><th></th><th>Calculé</th><th>Réglé</th><th>Écart</th></tr></thead><tbody>' +
        `<tr><td>Azimut</td><td class="num">${fmt(ideal.azimuth, 1)}°</td><td class="num">${fmt(set.az, 1)}°</td><td class="num">${fmt(st.errors.azErr, 1)}°</td></tr>` +
        `<tr><td>Élévation</td><td class="num">${fmt(ideal.elevation, 1)}°</td><td class="num">${fmt(set.el, 1)}°</td><td class="num">${fmt(st.errors.elErr, 1)}°</td></tr>` +
        `<tr><td>Skew</td><td class="num">${fmt(ideal.skew, 1)}°</td><td class="num">${fmt(set.skew, 1)}°</td><td class="num">${fmt(st.errors.skewErr, 1)}°</td></tr>` +
        '</tbody></table>' +
        `<p class="small-muted">Station : ${esc(geoTxt(st.geo))} · Satellite : ${fmt(num(st.sat.props.lonDeg), 1)}° E. Pertes de pointage : ${fmt(r.pointing.lossUpDb, 1)} dB (montant), ${fmt(r.pointing.lossDownDb, 1)} dB (descendant), ${fmt(r.pointing.skewLossDb, 1)} dB (skew).</p>` +
        `<div class="calc-group-title">Calcul du pointage</div>${stepsHtml(ideal.steps)}`;
      return;
    }
    ipaneProfile.innerHTML = '<div class="empty-state"><p>Pas de profil disponible pour cette liaison.</p></div>';
  }

  /** Monte l'onglet Profil : graphique, réglage direct des hauteurs, verdict et calculs. */
  function mountProfilePane(l, ends, topHtml, bottomHtml) {
    let top = $('#profile-top', ipaneProfile);
    if (ipaneProfile.dataset.link !== l.id || !top) {
      ipaneProfile.dataset.link = l.id;
      ipaneProfile.innerHTML =
        '<div id="profile-top"></div><div class="section height-ctrls"><div class="section-title">Ajuster les hauteurs</div><div id="profile-ctrls"></div></div><div id="profile-bottom"></div>';
      top = $('#profile-top', ipaneProfile);
    }
    top.innerHTML = topHtml;
    $('#profile-bottom', ipaneProfile).innerHTML = bottomHtml;
    if (!S.heightDrag) buildHeightControls($('#profile-ctrls', ipaneProfile), l, ends);
  }

  /** Curseurs de hauteur (pylône, mât ou antenne) pour chaque extrémité du bond. */
  function buildHeightControls(host, l, ends) {
    host.innerHTML = '';
    const seen = new Set();
    for (const n of ends) {
      const site = siteOf(n);
      const tower = !!site && site.type === 'tower';
      const target = tower ? site : n;
      if (seen.has(target.id)) continue;
      seen.add(target.id);
      const min = tower ? TOWER_MIN_M : 1;
      const max = tower ? TOWER_MAX_M : mountMaxHeight(n);
      const cur = tower ? num(site.props.heightM, 40) : Math.min(num(n.props.heightM, 10), max);
      const label = tower ? `Pylône « ${site.name} »` : site ? `Mât de « ${n.name} » (toit de ${site.name})` : `Hauteur de « ${n.name} »`;
      const row = document.createElement('div');
      row.className = 'field';
      row.innerHTML = `<label>${esc(label)}</label><div class="inline"><input type="range" min="${min}" max="${max}" step="1" value="${cur}"><input type="number" class="range-num" min="${min}" max="${max}" step="1" value="${cur}"><span class="unit">m</span></div>`;
      const [r, nb] = row.querySelectorAll('input');
      const apply = (val, commit) => {
        const v = U.clamp(Math.round(num(val, cur)), min, max);
        if (!S.heightDrag) pushHistory();
        S.heightDrag = !commit;
        if (tower) setTowerHeight(site, v);
        else n.props.heightM = v;
        r.value = v;
        nb.value = v;
        if (commit) update({ keepInspector: true });
        else {
          computeAll();
          render();
          renderProfile(l);
          renderBudget(l);
          updateStatusBar();
        }
      };
      r.addEventListener('input', () => apply(r.value, false));
      r.addEventListener('change', () => apply(r.value, true));
      nb.addEventListener('change', () => apply(nb.value, true));
      host.appendChild(row);
    }
    const tip = document.createElement('div');
    tip.className = 'small-muted';
    tip.textContent = 'Faites glisser un curseur ou saisissez une valeur : le profil, le dégagement de Fresnel et le bilan se mettent à jour en direct. Les antennes fixées au sommet d’un pylône suivent sa hauteur.';
    host.appendChild(tip);
  }

  /** Volet « Profil » d'une liaison LEO/MEO défilante : graphique élévation / RTT dans le temps. */
  function constellationPaneHtml(sat, r) {
    const orbit = r.orbit;
    const c0 = constellationOf(sat, S.sim.t);
    const win = Math.min(Math.max(3.2 * c0.spacingMin * 60, 900), 4 * 3600);
    const t0 = S.sim.t - win * 0.2;
    const n = 260;
    const W = 360;
    const H = 210;
    const m = { l: 34, r: 36, t: 14, b: 26 };
    const samples = [];
    let rttMax = 0;
    for (let i = 0; i <= n; i++) {
      const t = t0 + (win * i) / n;
      const c = constellationOf(sat, t);
      const rtt = c.serving ? (4 * c.serving.slantKm) / C_KM_MS + orbit.processingMs : null;
      if (rtt) rttMax = Math.max(rttMax, rtt);
      samples.push({ t, el: c.serving ? c.serving.el : null, idx: c.serving ? c.serving.index : 0, rtt });
    }
    rttMax = Math.ceil((rttMax * 1.15) / 10) * 10 || 50;
    const X = (t) => m.l + ((t - t0) / win) * (W - m.l - m.r);
    const Yel = (e) => H - m.b - (e / 90) * (H - m.t - m.b);
    const Yr = (v) => H - m.b - (v / rttMax) * (H - m.t - m.b);
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="${SVGNS}" role="img" aria-label="Élévation et latence dans le temps">`;
    for (let e = 0; e <= 90; e += 30) s += `<line class="chart-gridline" x1="${m.l}" x2="${W - m.r}" y1="${Yel(e)}" y2="${Yel(e)}"/><text x="${m.l - 4}" y="${Yel(e) + 3}" text-anchor="end" style="fill:#22d3ee;font-size:9px">${e}°</text>`;
    for (let k = 0; k <= 4; k++) {
      const v = (rttMax * k) / 4;
      s += `<text x="${W - m.r + 4}" y="${Yr(v) + 3}" style="fill:#f59e0b;font-size:9px">${Math.round(v)}</text>`;
    }
    // Trous de couverture et handovers
    let gapStart = null;
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      if (!p.idx && gapStart === null) gapStart = p.t;
      if ((p.idx || i === samples.length - 1) && gapStart !== null) {
        s += `<rect x="${X(gapStart)}" y="${m.t}" width="${Math.max(1, X(p.t) - X(gapStart))}" height="${H - m.t - m.b}" fill="rgba(239,68,68,.22)"/>`;
        gapStart = null;
      }
      if (i && p.idx && samples[i - 1].idx && p.idx !== samples[i - 1].idx) s += `<line x1="${X(p.t)}" x2="${X(p.t)}" y1="${m.t}" y2="${H - m.b}" stroke="#a78bfa" stroke-dasharray="3 3"/>`;
    }
    const path = (key, Y) => {
      let d = '';
      let pen = false;
      for (const p of samples) {
        if (p[key] === null) {
          pen = false;
          continue;
        }
        d += `${pen ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p[key]).toFixed(1)} `;
        pen = true;
      }
      return d;
    };
    s += `<path d="${path('el', Yel)}" fill="none" stroke="#22d3ee" stroke-width="1.8"/><path d="${path('rtt', Yr)}" fill="none" stroke="#f59e0b" stroke-width="1.4"/>`;
    s += `<line x1="${X(S.sim.t)}" x2="${X(S.sim.t)}" y1="${m.t - 4}" y2="${H - m.b}" stroke="#e2e8f0" stroke-width="1.2"/><text x="${X(S.sim.t)}" y="${m.t - 5}" text-anchor="middle" style="fill:#e2e8f0;font-size:9px">maintenant</text>`;
    const tick = niceStep(win / 60 / 5);
    for (let mn = Math.ceil(t0 / 60 / tick) * tick; mn * 60 <= t0 + win; mn += tick) s += `<text x="${X(mn * 60)}" y="${H - m.b + 12}" text-anchor="middle" style="fill:#7587a8;font-size:9px">${fmt(mn, 0)}</text>`;
    s += `<text x="${W - m.r}" y="${H - 3}" text-anchor="end" style="fill:#7587a8;font-size:9px">temps de simulation (min)</text></svg>`;
    // Prochain handover
    let next = null;
    const stepT = Math.max(1, c0.spacingMin * 60 / 400);
    for (let t = S.sim.t + stepT; t < S.sim.t + c0.spacingMin * 60 * 2; t += stepT) {
      const c = constellationOf(sat, t);
      const idx = c.serving ? c.serving.index : 0;
      if (idx !== (c0.serving ? c0.serving.index : 0)) {
        next = { t, idx };
        break;
      }
    }
    const h = S.satHist[sat.id];
    return `<div class="chart-box">${s}</div>
      <div class="chart-legend"><span><i style="background:#22d3ee"></i>Élévation du satellite servant</span><span><i style="background:#f59e0b"></i>RTT (ms)</span><span><i style="border-top:2px dashed #a78bfa;height:0"></i>Handover</span><span><i style="background:rgba(239,68,68,.35)"></i>Trou de couverture</span></div>
      <div class="verdict ${c0.serving ? 'ok' : 'err'}">${
        c0.serving
          ? `T+${clockTxt(S.sim.t)} : satellite n° ${c0.serving.index} sur ${c0.satsPerPlane}, élévation ${fmt(c0.serving.el, 1)}°, distance ${fmt(c0.serving.slantKm, 0)} km, RTT ${fmt(r.latency.rttMs, 1)} ms.`
          : `T+${clockTxt(S.sim.t)} : aucun satellite visible, trou de couverture.`
      } ${next ? (next.idx ? `Prochain handover (satellite n° ${next.idx}) dans ${fmt((next.t - S.sim.t) / 60, 1)} min.` : `Trou de couverture dans ${fmt((next.t - S.sim.t) / 60, 1)} min.`) : ''}</div>
      <div class="kpi-grid">
        ${kpi('Période orbitale', fmt(c0.periodMin, 1), 'min')}
        ${kpi('Écart entre satellites', fmt(c0.spacingMin, 1), 'min')}
        ${kpi('Durée de visibilité', fmt(c0.passDurationMin, 1), 'min', c0.passDurationMin < c0.spacingMin ? 'err' : 'ok')}
        ${kpi('Vitesse orbitale', fmt(c0.speedKmS, 2), 'km/s')}
        ${kpi('Handovers / trous', (h ? h.handovers : 0) + ' / ' + (h ? h.gaps : 0), '')}
        ${kpi('RTT min → max', h && Number.isFinite(h.rttMin) ? fmt(h.rttMin, 1) + ' → ' + fmt(h.rttMax, 1) : '—', 'ms')}
      </div>
      <p class="small-muted">Lancez l’horloge (▶ dans la barre d’outils du canevas) pour faire défiler les satellites. Couverture continue si la durée de visibilité (${fmt(c0.passDurationMin, 1)} min) dépasse l’écart entre deux satellites (${fmt(c0.spacingMin, 1)} min).</p>
      <div class="calc-group-title">Géométrie et Doppler</div>${stepsHtml(r.remoteGeometry.steps)}`;
  }

  function profileChartSvg(pr, nameA, nameB) {
    const W = 360;
    const H = 220;
    const m = { l: 40, r: 10, t: 14, b: 28 };
    const pts = pr.points;
    let ymin = Infinity;
    let ymax = -Infinity;
    for (const p of pts) {
      ymin = Math.min(ymin, p.baseGround);
      ymax = Math.max(ymax, p.los + p.r1, p.terrain);
    }
    ymin = Math.floor((ymin - 10) / 10) * 10;
    ymax = Math.ceil((ymax + 10) / 10) * 10;
    const X = (x) => m.l + (x / pr.distanceKm) * (W - m.l - m.r);
    const Y = (y) => H - m.b - ((y - ymin) / (ymax - ymin)) * (H - m.t - m.b);
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="${SVGNS}" role="img" aria-label="Profil de terrain et zone de Fresnel">`;
    // Graduations
    const ystep = niceStep((ymax - ymin) / 5);
    for (let y = Math.ceil(ymin / ystep) * ystep; y <= ymax; y += ystep) {
      s += `<line class="chart-gridline" x1="${m.l}" x2="${W - m.r}" y1="${Y(y)}" y2="${Y(y)}"/><text class="chart-axis" x="${m.l - 4}" y="${Y(y) + 3}" text-anchor="end" style="fill:#7587a8;font-size:9px">${Math.round(y)}</text>`;
    }
    const xstep = niceStep(pr.distanceKm / 5);
    for (let x = 0; x <= pr.distanceKm + 1e-9; x += xstep) {
      s += `<line class="chart-gridline" x1="${X(x)}" x2="${X(x)}" y1="${m.t}" y2="${H - m.b}"/><text x="${X(x)}" y="${H - m.b + 12}" text-anchor="middle" style="fill:#7587a8;font-size:9px">${fmt(x, xstep < 1 ? 1 : 0)}</text>`;
    }
    s += `<text x="${W - m.r}" y="${H - 3}" text-anchor="end" style="fill:#7587a8;font-size:9px">distance (km)</text><text x="4" y="${m.t - 3}" style="fill:#7587a8;font-size:9px">altitude (m)</text>`;
    // Fresnel
    const up = pts.map((p) => `${X(p.x)},${Y(p.los + p.r1)}`);
    const lo = pts.map((p) => `${X(p.x)},${Y(p.los - p.r1)}`).reverse();
    const blockedCls = pr.verdict === 'blocked' || pr.verdict === 'partial' ? ' blocked' : '';
    s += `<polygon class="chart-fresnel${blockedCls}" points="${up.concat(lo).join(' ')}"/>`;
    s += `<polyline class="chart-fresnel60" points="${pts.map((p) => `${X(p.x)},${Y(p.los - 0.6 * p.r1)}`).join(' ')}"/>`;
    // Terrain (sol + renflement)
    const terr = pts.map((p) => `${X(p.x)},${Y(p.terrain)}`);
    s += `<polygon class="chart-terrain" points="${X(0)},${Y(ymin)} ${terr.join(' ')} ${X(pr.distanceKm)},${Y(ymin)}"/>`;
    // Obstacles dessinés à l'échelle selon leur nature (relief, immeuble, forêt)
    const segs = [];
    let curSeg = null;
    for (const p of pts) {
      if (p.obstacle > 0.5) {
        if (!curSeg || curSeg.name !== p.obstacleName) {
          curSeg = { name: p.obstacleName, type: p.obstacleType, x0: p.x, x1: p.x, top: p.terrain, base: p.terrain - p.obstacle };
          segs.push(curSeg);
        }
        curSeg.x1 = p.x;
        curSeg.top = Math.max(curSeg.top, p.terrain);
        curSeg.base = Math.min(curSeg.base, p.terrain - p.obstacle);
      } else curSeg = null;
    }
    const artOf = { hill: 'art-relief', building: 'art-immeuble', forest: 'art-arbre' };
    for (const g of segs) {
      const x0 = X(g.x0);
      const w = Math.max(6, X(g.x1) - x0);
      const yTop = Y(g.top);
      const hgt = Math.max(4, Y(g.base) - yTop);
      s += `<use href="#${artOf[g.type] || 'art-relief'}" x="${x0}" y="${yTop}" width="${w}" height="${hgt}" opacity="0.95"><title>${esc(g.name || 'Obstacle')}</title></use>`;
    }
    s += `<polyline class="chart-bulge" points="${pts.map((p) => `${X(p.x)},${Y(p.baseGround + p.bulge)}`).join(' ')}"/>`;
    // Pylônes & visée
    const g0 = pts[0].ground;
    const g1 = pts[pts.length - 1].ground;
    const tower = (xk, g, h, mirror) => {
      const xc = X(xk);
      const top = Y(h) - 4;
      const bot = Y(g);
      const ant = `<use href="#art-antenne" x="${mirror ? -(xc + 1) : xc - 1}" y="${Y(h) - 7}" width="16" height="14" ${mirror ? 'transform="scale(-1,1)"' : ''} style="color:#22d3ee"/>`;
      return `<use href="#art-pylone" x="${xc - 6}" y="${top}" width="12" height="${Math.max(6, bot - top)}" style="color:#fbbf24"/>${ant}`;
    };
    s += tower(0, g0, pr.hA, false) + tower(pr.distanceKm, g1, pr.hB, true);
    s += `<line class="chart-los" x1="${X(0)}" y1="${Y(pr.hA)}" x2="${X(pr.distanceKm)}" y2="${Y(pr.hB)}"/>`;

    if (pr.worst) s += `<circle class="chart-worst" cx="${X(pr.worst.x)}" cy="${Y(pr.worst.terrain)}" r="3.5"/><text x="${X(pr.worst.x)}" y="${Y(pr.worst.terrain) - 7}" text-anchor="middle" style="fill:#fca5a5;font-size:9px;font-weight:700">${fmt(pr.worst.ratio * 100, 0)} % F1</text>`;
    s += `<text x="${X(0) + 4}" y="${m.t + 9}" style="fill:#a9b8d3;font-size:10px">${esc(nameA)}</text><text x="${X(pr.distanceKm) - 4}" y="${m.t + 9}" text-anchor="end" style="fill:#a9b8d3;font-size:10px">${esc(nameB)}</text>`;
    s += '</svg>';
    return s;
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
    const n = raw / p;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
  }
  function compassSvg(target, actual) {
    const c = 80;
    const r = 62;
    let s = `<svg viewBox="0 0 160 170" xmlns="${SVGNS}"><text x="80" y="164" text-anchor="middle" style="fill:#a9b8d3;font-size:10px">Azimut</text><circle class="compass-ring" cx="${c}" cy="${c}" r="${r}"/>`;
    for (let a = 0; a < 360; a += 15) {
      const p1 = polar(r, a);
      const p2 = polar(a % 90 === 0 ? r - 9 : r - 4, a);
      s += `<line class="compass-tick" x1="${c + p1.x}" y1="${c + p1.y}" x2="${c + p2.x}" y2="${c + p2.y}"/>`;
    }
    for (const [t, a] of [
      ['N', 0],
      ['E', 90],
      ['S', 180],
      ['O', 270],
    ]) {
      const p = polar(r - 18, a);
      s += `<text class="compass-text" x="${c + p.x}" y="${c + p.y}">${t}</text>`;
    }
    const pt = polar(r - 4, target);
    const pa = polar(r - 12, actual);
    s += `<line class="compass-target" x1="${c}" y1="${c}" x2="${c + pt.x}" y2="${c + pt.y}"/><line class="compass-actual" x1="${c}" y1="${c}" x2="${c + pa.x}" y2="${c + pa.y}"/><circle cx="${c}" cy="${c}" r="3" fill="#a9b8d3"/></svg>`;
    return s;
  }
  function elevationSvg(target, actual) {
    const ox = 20;
    const oy = 140;
    const r = 118;
    let s = `<svg viewBox="0 0 160 170" xmlns="${SVGNS}"><text x="80" y="164" text-anchor="middle" style="fill:#a9b8d3;font-size:10px">Élévation</text><path class="compass-ring" d="M${ox + r} ${oy} A${r} ${r} 0 0 0 ${ox} ${oy - r}"/><line class="compass-tick" x1="${ox}" y1="${oy}" x2="${ox + r}" y2="${oy}"/><line class="compass-tick" x1="${ox}" y1="${oy}" x2="${ox}" y2="${oy - r}"/>`;
    for (let a = 0; a <= 90; a += 15) {
      const x1 = ox + r * Math.cos(U.deg2rad(a));
      const y1 = oy - r * Math.sin(U.deg2rad(a));
      const x2 = ox + (r - 7) * Math.cos(U.deg2rad(a));
      const y2 = oy - (r - 7) * Math.sin(U.deg2rad(a));
      s += `<line class="compass-tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      if (a % 30 === 0) s += `<text class="compass-text" x="${ox + (r + 9) * Math.cos(U.deg2rad(a))}" y="${oy - (r + 9) * Math.sin(U.deg2rad(a))}">${a}°</text>`;
    }
    const line = (a, len, cls) => `<line class="${cls}" x1="${ox}" y1="${oy}" x2="${ox + len * Math.cos(U.deg2rad(a))}" y2="${oy - len * Math.sin(U.deg2rad(a))}"/>`;
    s += line(U.clamp(target, 0, 90), r - 4, 'compass-target') + line(U.clamp(actual, 0, 90), r - 14, 'compass-actual') + '</svg>';
    return s;
  }

  /* --- Vue réseau --- */
  function renderNetworkPane() {
    const an = S.analysis;
    if (!an) {
      ipaneNetwork.innerHTML = '';
      return;
    }
    let h = '';
    if (an.warnings.length) {
      h += '<ul class="issue-list">' + an.warnings.map((w) => `<li class="${w.level}">${esc(w.text)}</li>`).join('') + '</ul>';
    }
    h += '<div class="section-title">Flux de trafic</div>';
    if (!an.flows.length) h += '<p class="small-muted">Aucun flux. Utilisez l’outil Flux (F) : cliquez une source puis une destination.</p>';
    else {
      h += '<table class="data-table"><thead><tr><th>Flux</th><th>État</th><th>RTT</th><th>Débit</th></tr></thead><tbody>';
      for (const f of an.flows) {
        h += `<tr class="flow-row ${S.selectedFlow === f.id ? 'selected' : ''}" data-flow="${esc(f.id)}"><td>${esc(f.name)}</td><td><span class="status-pill ${f.status}">${{ ok: 'OK', congested: 'Saturé', down: 'Échec', storm: 'Tempête' }[f.status] || f.status}</span></td><td class="num">${f.path ? fmt(f.rttMs, f.rttMs < 10 ? 1 : 0) + ' ms' : '—'}</td><td class="num">${fmt(f.deliveredMbps, 1)}/${fmt(f.rateMbps, 1)}</td></tr>`;
      }
      h += '</tbody></table>';
    }
    if (S.selectedFlow) {
      const f = an.flows.find((x) => x.id === S.selectedFlow);
      if (f) h += flowDetailHtml(f);
    }
    h += '<div class="section-title" style="margin-top:14px">Anneaux (ERPS G.8032)</div>';
    if (!an.rings.length) h += '<p class="small-muted">Aucun anneau Ethernet détecté (les anneaux de routeurs IP/MPLS sont protégés par le routage).</p>';
    for (const r of an.rings) {
      const cls = r.state === 'idle' ? 'ok' : r.state === 'protection' ? 'warn' : r.state === 'loop' ? 'err' : '';
      h += `<div class="ring-card"><div class="rc-title"><span>Anneau ${r.index}${r.rplAuto ? ' (RPL choisi automatiquement)' : ''}</span><span class="status-pill ${cls}">${{ idle: 'IDLE', protection: 'PROTECTION', loop: 'BOUCLE', open: 'OUVERT' }[r.state]}</span></div><div>${esc(r.stateLabel)}</div><div class="rc-path">${r.nodes.map((id) => esc(nodeName(id))).join(' → ')}</div></div>`;
    }
    // VLAN
    const vl = new Map();
    for (const n of S.topo.nodes) {
      if (!isEndpoint(n) || !S.engine) continue;
      const v = S.engine.endpointVlan(n.id);
      if (!vl.has(v)) vl.set(v, []);
      vl.get(v).push(n.name);
    }
    if (vl.size) {
      h += '<div class="section-title" style="margin-top:14px">VLAN des terminaux</div>';
      for (const [v, names] of [...vl.entries()].sort((a, b) => a[0] - b[0])) {
        h += `<div style="margin-bottom:5px"><span class="vlan-chip" style="background:${vlanColor(v)}">${v ? 'VLAN ' + v : 'non tagué'}</span> <span class="small-muted">${names.map(esc).join(', ')}</span></div>`;
      }
    }
    // Charges
    const loads = Object.entries(an.linkLoads)
      .map(([id, ld]) => ({ l: linkById(id), ld }))
      .filter((x) => x.l)
      .sort((a, b) => b.ld.utilisation - a.ld.utilisation)
      .slice(0, 8);
    if (loads.length) {
      h += '<div class="section-title" style="margin-top:14px">Liens les plus chargés</div>';
      for (const { l, ld } of loads) {
        const pct = Math.min(100, ld.utilisation * 100);
        h += `<div style="margin-bottom:6px"><div class="small-muted">${esc(linkName(l))} — ${fmt(ld.utilisation * 100, 0)} %</div><div class="gauge ${pct > 95 ? 'err' : pct > 75 ? 'warn' : ''}"><span style="width:${pct}%"></span></div></div>`;
      }
    }
    ipaneNetwork.innerHTML = h;
    $$('.flow-row', ipaneNetwork).forEach((tr) =>
      tr.addEventListener('click', () => {
        S.selectedFlow = S.selectedFlow === tr.dataset.flow ? null : tr.dataset.flow;
        if (S.selectedFlow) stat('flowSelected');
        renderNetworkPane();
        render();
      })
    );
  }
  function nodeName(id) {
    const n = nodeById(id);
    return n ? n.name : id;
  }
  function flowDetailHtml(f) {
    let h = `<div class="flow-card"><b>${esc(f.name)}</b> · ${esc(f.clsLabel)} · ${fmt(f.rateMbps, 1)} Mbit/s`;
    if (!f.path) return h + `<div class="verdict err" style="margin:6px 0 0">${esc(f.reason)}</div></div>`;
    h += `<div class="fc-path" style="margin:4px 0">${f.path.nodes.map((id) => esc(nodeName(id))).join(' → ')}</div>`;
    if (f.reason) h += `<div class="small-muted">${esc(f.reason)}</div>`;
    if (f.lsps.length) {
      h += '<div class="calc-group-title">LSP MPLS</div><ul style="margin:0;padding-left:18px">';
      for (const lsp of f.lsps) for (const o of lsp.ops) h += `<li style="font-size:11.5px">${esc(o.text)}</li>`;
      h += '</ul>';
    }
    if (f.path.routedAt.length) {
      h += `<div class="small-muted" style="margin-top:4px">Routage IP sur : ${f.path.routedAt.map((r) => esc(nodeName(r.node)) + (r.fromVlan !== r.toVlan ? ` (VLAN ${r.fromVlan || '—'} → ${r.toVlan || '—'})` : '')).join(', ')}</div>`;
    }
    h += '<div class="calc-group-title">En-têtes sur chaque tronçon</div>';
    for (const hd of f.headers) {
      h += `<div class="hdr-seg">${esc(nodeName(hd.from))} → ${esc(nodeName(hd.to))}</div><div class="hdr-stack">${hd.stack
        .map((x) => `<span class="${x.startsWith('802.1Q') ? 'h-vlan' : x.startsWith('MPLS') ? 'h-mpls' : x.startsWith('IP') ? 'h-ip' : ''}">${esc(x)}</span>`)
        .join('')}</div>`;
    }
    return h + '</div>';
  }

  /* ------------------------------------------------------------------
   * 8. CONSOLE, JOURNAL, FLUX, PING
   * ------------------------------------------------------------------ */
  function log(text, level = 'info') {
    const ul = $('#log-list');
    const li = document.createElement('li');
    const t = new Date();
    li.innerHTML = `<time>${t.toLocaleTimeString('fr-FR')}</time><span class="${level}">${esc(text)}</span>`;
    ul.appendChild(li);
    while (ul.children.length > 400) ul.removeChild(ul.firstChild);
    ul.parentElement.scrollTop = ul.parentElement.scrollHeight;
  }
  function toast(text, level = 'info') {
    const z = $('#toast-zone');
    const d = document.createElement('div');
    d.className = 'toast ' + level;
    d.textContent = text;
    z.appendChild(d);
    while (z.children.length > 4) z.removeChild(z.firstChild);
    setTimeout(() => d.classList.add('fade'), 3200);
    setTimeout(() => d.remove(), 3700);
  }
  function term(text, cls) {
    const pre = $('#terminal');
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = text + '\n';
    pre.appendChild(span);
    pre.parentElement.scrollTop = pre.parentElement.scrollHeight;
  }
  function showConsoleTab(name) {
    $$('.ctab').forEach((t) => t.classList.toggle('active', t.dataset.ctab === name));
    $$('.cpane').forEach((p) => p.classList.toggle('active', p.id === 'cpane-' + name));
    $('#console').classList.remove('collapsed');
  }
  function runPing(a, b) {
    if (!S.engine) computeAll();
    showConsoleTab('term');
    const target = b.props.ip || b.name;
    term(`\nC:\\${a.name.replace(/\s+/g, '_')}> ping ${target}`, 't-cmd');
    const res = S.engine.ping(a.id, b.id, 4);
    res.lines.forEach((ln) => term(ln, !res.success && ln.startsWith('Diagnostic') ? 't-err' : ''));
    term(`\nC:\\${a.name.replace(/\s+/g, '_')}> tracert ${target}`, 't-cmd');
    const tr = S.engine.traceroute(a.id, b.id);
    tr.lines.forEach((ln) => term(ln));
    log(res.success ? `Ping ${a.name} → ${b.name} : succès (${fmt(res.rttMs, 0)} ms).` : `Ping ${a.name} → ${b.name} : échec — ${res.reason}`, res.success ? 'ok' : 'error');
    S.lastPing = { src: a.id, dst: b.id, success: res.success, rttMs: res.rttMs };
    journalAdd({ kind: 'ping', src: a.name, dst: b.name, success: res.success });
    evaluateLab();
  }

  function openFlowDialog(a, b, existing) {
    const f = existing || { name: `${a.name} → ${b.name}`, rateMbps: 10, cls: 'data' };
    openDialog(
      existing ? 'Modifier le flux' : 'Nouveau flux de trafic',
      `<div class="dialog-form">
        <p class="small-muted">De <b>${esc(a.name)}</b> (${esc(a.props.ip || '')}) vers <b>${esc(b.name)}</b> (${esc(b.props.ip || '')}).</p>
        <div class="field"><label>Nom</label><input type="text" id="fl-name" value="${esc(f.name)}"></div>
        <div class="field"><label>Débit demandé</label><div class="inline"><input type="number" id="fl-rate" min="0.01" max="100000" step="0.1" value="${f.rateMbps}"><span class="unit">Mbit/s</span></div></div>
        <div class="field"><label>Classe de service (QoS)</label><select id="fl-cls"><option value="voice">Voix (EF, priorité maximale)</option><option value="video">Vidéo (AF41)</option><option value="data">Données (Best Effort)</option></select></div>
      </div>`,
      [
        { label: 'Annuler', cls: 'btn-ghost' },
        {
          label: existing ? 'Enregistrer' : 'Créer le flux',
          cls: 'btn-accent',
          action: () => {
            pushHistory();
            const data = { name: $('#fl-name').value.trim() || f.name, rateMbps: Math.max(0.01, num($('#fl-rate').value, 10)), cls: $('#fl-cls').value };
            if (existing) Object.assign(existing, data);
            else S.topo.flows.push(Object.assign({ id: U.uid('f'), src: a.id, dst: b.id }, data));
            update();
            showConsoleTab('flows');
          },
        },
      ]
    );
    $('#fl-cls').value = f.cls;
  }

  function renderFlowsTable() {
    const host = $('#flows-table');
    const an = S.analysis;
    if (!S.topo.flows.length) {
      host.innerHTML = '<div class="flows-tbl-wrap small-muted">Aucun flux défini. Outil Flux (F) : cliquez un terminal source puis un terminal destination.</div>';
      return;
    }
    let h = '<div class="flows-tbl-wrap"><table class="data-table"><thead><tr><th>Nom</th><th>Source → Destination</th><th>Classe</th><th>Demandé</th><th>Acheminé</th><th>RTT</th><th>État / cause</th><th></th></tr></thead><tbody>';
    for (const f of S.topo.flows) {
      const r = an ? an.flows.find((x) => x.id === f.id) : null;
      h += `<tr class="flow-row ${S.selectedFlow === f.id ? 'selected' : ''}" data-flow="${esc(f.id)}"><td>${esc(f.name)}</td><td>${esc(nodeName(f.src))} → ${esc(nodeName(f.dst))}</td><td>${CLS_LABEL[f.cls] || f.cls}</td><td class="num">${fmt(f.rateMbps, 1)}</td><td class="num">${r ? fmt(r.deliveredMbps, 1) : '—'}</td><td class="num">${r && r.path ? fmt(r.rttMs, 1) + ' ms' : '—'}</td><td>${r ? `<span class="status-pill ${r.status}">${{ ok: 'OK', congested: 'Saturé', down: 'Échec', storm: 'Tempête' }[r.status]}</span> <span class="small-muted">${esc(r.reason || '')}</span>` : ''}</td><td style="white-space:nowrap"><button class="btn btn-xs" data-edit="${esc(f.id)}">Modifier</button> <button class="btn btn-xs btn-danger" data-del="${esc(f.id)}">✕</button></td></tr>`;
    }
    h += '</tbody></table></div>';
    host.innerHTML = h;
    $$('[data-del]', host).forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        pushHistory();
        S.topo.flows = S.topo.flows.filter((f) => f.id !== b.dataset.del);
        if (S.selectedFlow === b.dataset.del) S.selectedFlow = null;
        update();
      })
    );
    $$('[data-edit]', host).forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const f = S.topo.flows.find((x) => x.id === b.dataset.edit);
        if (f) openFlowDialog(nodeById(f.src), nodeById(f.dst), f);
      })
    );
    $$('.flow-row', host).forEach((tr) =>
      tr.addEventListener('click', () => {
        S.selectedFlow = S.selectedFlow === tr.dataset.flow ? null : tr.dataset.flow;
        if (S.selectedFlow) stat('flowSelected');
        renderFlowsTable();
        renderNetworkPane();
        render();
        activateInspectorTab('network');
      })
    );
  }

  function updateStatusBar() {
    faultBarHook();
    const n = S.topo.nodes.length;
    const l = S.topo.links.length;
    $('#st-counts').textContent = `${n} équipement${n > 1 ? 's' : ''} · ${l} lien${l > 1 ? 's' : ''} · ${S.topo.flows.length} flux`;
    const radio = S.topo.links.filter((x) => RADIO_MEDIA.includes(x.medium));
    const down = radio.filter((x) => x.state && x.state.status === 'down').length;
    const deg = radio.filter((x) => x.state && x.state.status === 'degraded').length;
    const fl = S.analysis ? S.analysis.flows : [];
    const flOk = fl.filter((f) => f.status === 'ok').length;
    const h = $('#st-health');
    h.textContent = radio.length || fl.length ? `Radio : ${radio.length - down - deg} OK / ${deg} dégradé(s) / ${down} coupé(s) · Flux : ${flOk}/${fl.length} OK` : '';
    h.className = down || (fl.length && flOk < fl.length) ? 'error' : deg ? 'warn' : 'ok';
    $('#st-file').textContent = S.topo.settings.title;
    document.title = S.topo.settings.title + ' — MicroWave, BLR & VSAT Lab' + (TEACHER ? ' (enseignant)' : ' (élève)');
  }

  /* ------------------------------------------------------------------
   * 9. FICHIERS, EXPORT, MODALES, TP, DOCUMENTATION
   * ------------------------------------------------------------------ */
  function loadTopology(json, opts = {}) {
    if (!json || !Array.isArray(json.nodes) || !Array.isArray(json.links)) throw new Error('Format de fichier invalide (nodes / links manquants).');
    const topo = emptyTopology();
    Object.assign(topo.settings, json.settings || {});
    S.topo = topo;
    // Résolution des références par nom (TP) ou par id
    const byKey = new Map();
    for (const raw of json.nodes) {
      const n = ensureDefaults({ id: raw.id || U.uid('n'), type: raw.type, name: raw.name, x: num(raw.x), y: num(raw.y), props: JSON.parse(JSON.stringify(raw.props || {})) });
      if (!CATALOG[n.type]) continue;
      S.topo.nodes.push(n);
      byKey.set(n.id, n);
      if (n.name) byKey.set(n.name, n);
    }
    const ref = (k) => (byKey.get(k) ? byKey.get(k).id : null);
    for (const n of S.topo.nodes) {
      if (n.props.siteId) n.props.siteId = ref(n.props.siteId) || undefined;
      if (!n.props.siteId) delete n.props.siteId;
      clampPos(n);
    }
    for (const raw of json.links) {
      const a = ref(raw.a);
      const b = ref(raw.b);
      if (!a || !b) continue;
      let medium = raw.medium;
      if (!medium) {
        const d = decideMedium(nodeById(a), nodeById(b));
        if (d.error) {
          console.warn('Lien ignoré :', d.error);
          continue;
        }
        medium = d.medium;
      }
      S.topo.links.push({ id: raw.id || U.uid('l'), a, b, medium, props: JSON.parse(JSON.stringify(raw.props || {})) });
    }
    for (const raw of json.flows || []) {
      const src = ref(raw.src);
      const dst = ref(raw.dst);
      if (!src || !dst) continue;
      S.topo.flows.push({ id: raw.id || U.uid('f'), name: raw.name || nodeName(src) + ' → ' + nodeName(dst), src, dst, rateMbps: num(raw.rateMbps, 10), cls: raw.cls || 'data' });
    }
    S.selection = null;
    S.selectedFlow = null;
    S.pending = null;
    S.packets = [];
    S.analysis = null;
    S.prevLinkStatus.clear();
    S.satTrack = {};
    S.satHist = {};
    S.satVis = {};
    S.sim.t = 0;
    setClock(false);
    updateClockUi();
    setRain(num(S.topo.settings.rainMmH, 0), { silent: true });
    $('#scale-select').value = String(S.topo.settings.scaleKm);
    if (!$('#scale-select').value) {
      const o = document.createElement('option');
      o.value = String(S.topo.settings.scaleKm);
      o.textContent = `1 carreau = ${fmt(num(S.topo.settings.scaleKm), 2)} km`;
      $('#scale-select').appendChild(o);
      $('#scale-select').value = String(S.topo.settings.scaleKm);
    }
    computeAll();
    if (!opts.keepView) fitView();
    render();
    renderInspector();
    renderFlowsTable();
    updateStatusBar();
    evaluateLab();
    if (!opts.silent) log(`Topologie « ${S.topo.settings.title} » chargée (${S.topo.nodes.length} équipements, ${S.topo.links.length} liens).`, 'ok');
  }

  function newTopology() {
    if (lockedMsg()) return;
    if (S.topo.nodes.length && !confirm('Créer une nouvelle topologie vide ? Les modifications non sauvegardées seront perdues.')) return;
    pushHistory();
    closeLab();
    loadTopology({ nodes: [], links: [], flows: [], settings: { title: 'Topologie sans titre', scaleKm: 2 } });
    lsSetE(LS_SESSION, null);
    S.view = { x: 40, y: 10, k: 1 };
    applyView();
  }
  function saveFile() {
    const data = serialize();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (S.topo.settings.title || 'topologie').replace(/[^\p{L}\p{N}_-]+/gu, '_') + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
    log('Topologie sauvegardée : ' + a.download, 'ok');
    stat('save');
  }
  function openFile(file) {
    if (lockedMsg()) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const json = JSON.parse(r.result);
        if (MBV.Exam && typeof MBV.Exam.openJson === 'function' && MBV.Exam.openJson(json)) return;
        if (json.format && json.format !== 'mbv-lab') throw new Error('Ce fichier n’est pas une topologie MicroWave, BLR & VSAT Lab.');
        pushHistory();
        closeLab();
        loadTopology(json);
        toast('Topologie ouverte : ' + file.name, 'ok');
      } catch (err) {
        toast('Ouverture impossible : ' + err.message, 'error');
        log('Erreur à l’ouverture de ' + file.name + ' : ' + err.message, 'error');
      }
    };
    r.readAsText(file, 'utf-8');
  }

  /** Export SVG autonome (styles calculés intégrés, icônes incluses). */
  /** Image SVG autonome du canevas tel qu'affiché (styles calculés intégrés, icônes incluses). */
  function svgString() {
    const clone = svg.cloneNode(true);
    const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'color', 'paint-order', 'stroke-linecap', 'letter-spacing', 'dominant-baseline'];
    const src = svg.querySelectorAll('*');
    const dst = clone.querySelectorAll('*');
    src.forEach((e, i) => {
      const cs = getComputedStyle(e);
      const st = props.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
      dst[i].setAttribute('style', st);
      dst[i].removeAttribute('class');
    });
    const used = new Set();
    clone.querySelectorAll('use').forEach((u) => used.add((u.getAttribute('href') || '').slice(1)));
    const defs = clone.querySelector('defs');
    used.forEach((id) => {
      const sym = document.getElementById(id);
      if (sym) defs.appendChild(sym.cloneNode(true));
    });
    const r = wrap.getBoundingClientRect();
    clone.setAttribute('width', r.width);
    clone.setAttribute('height', r.height);
    clone.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    clone.setAttribute('xmlns', SVGNS);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  }
  function exportSvg() {
    const data = svgString();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml' }));
    a.download = (S.topo.settings.title || 'schema').replace(/[^\p{L}\p{N}_-]+/gu, '_') + '.svg';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
    log('Schéma exporté en image SVG : ' + a.download, 'ok');
    stat('exportSvg');
  }

  
  /* --- Modales --- */
  function openModal(id) {
    $('#' + id).hidden = false;
  }
  function closeModals() {
    $$('.modal').forEach((m) => (m.hidden = true));
  }
  function openDialog(title, bodyHtml, buttons) {
    $('#dialog-title').textContent = title;
    $('#dialog-body').innerHTML = bodyHtml;
    const foot = $('#dialog-foot');
    foot.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.cls || '');
      btn.textContent = b.label;
      btn.onclick = () => {
        $('#modal-dialog').hidden = true;
        if (b.action) b.action();
      };
      foot.appendChild(btn);
    }
    openModal('modal-dialog');
    const first = $('#dialog-body input');
    if (first) first.focus();
  }

  /* --- Activités : tutoriels, TP, exercices --- */
  function labsList() {
    return MBV.Labs && Array.isArray(MBV.Labs.list) ? MBV.Labs.list : [];
  }
  function tutoList() {
    return MBV.Tutorials && Array.isArray(MBV.Tutorials.list) ? MBV.Tutorials.list : [];
  }
  const ACT_TABS = [
    { id: 'tuto', label: 'Tutoriels', list: tutoList },
    { id: 'tp', label: 'Travaux pratiques', list: labsList },
    { id: 'ex', label: 'Exemples', list: () => (MBV.Labs && Array.isArray(MBV.Labs.examples) && !S.examActive ? MBV.Labs.examples : []) },
    {
      id: 'exo',
      label: 'Exercices corrigés',
      list: () => (MBV.Exercises && Array.isArray(MBV.Exercises.series) && typeof MBV.Exercises.render === 'function' && !S.examActive ? MBV.Exercises.series : []),
    },
    { id: 'exam', label: 'Examen', list: () => (MBV.Exam && typeof MBV.Exam.render === 'function' ? [MBV.Exam] : []), noCount: true },
  ];
  /** Retrouve une activité (tutoriel ou TP) par son identifiant. */
  function findActivity(id) {
    return tutoList().find((t) => t.id === id) || labsList().find((l) => l.id === id) || null;
  }
  function isTutorial(act) {
    return !!act && tutoList().includes(act);
  }

  /** Ouvre la fenêtre « Activités » sur un onglet et une activité. */
  function openLabs(id, tab) {
    if (!tab) tab = id && tutoList().some((t) => t.id === id) ? 'tuto' : id && labsList().some((l) => l.id === id) ? 'tp' : S.actTab || 'tp';
    const tabs = ACT_TABS.filter((t) => t.list().length);
    if (!tabs.some((t) => t.id === tab)) tab = tabs.length ? tabs[0].id : 'tp';
    if (tab !== 'exam') S.actTab = tab;
    $('#labs-title').textContent = tab === 'exam' ? 'Examen' : 'Activités pédagogiques';
    const nav = $('#labs-list');
    const det = $('#labs-detail');
    const tabsHtml = `<div class="act-tabs">${tabs
      .filter((t) => t.id !== 'exam')
      .map((t) => `<button class="act-tab ${t.id === tab ? 'active' : ''}" data-acttab="${t.id}">${esc(t.label)} ${t.noCount ? (S.examActive && t.id === 'exam' ? '<span class="act-count exam-live">en cours</span>' : '') : `<span class="act-count">${t.list().length}</span>`}</button>`)
      .join('')}</div>`;
    if (!tabs.length) {
      nav.innerHTML = '';
      det.innerHTML = '<p>Aucune activité disponible : les fichiers <code>tutorials.js</code> et <code>labs.js</code> ne sont pas chargés.</p>';
      openModal('modal-labs');
      return;
    }
    if (tab === 'exam' && MBV.Exam) {
      nav.innerHTML = '<div id="exam-nav"></div>';
      MBV.Exam.render({ nav: $('#exam-nav'), detail: det, api: API });
      openModal('modal-labs');
      return;
    }
    if (tab === 'exo' && MBV.Exercises && typeof MBV.Exercises.render === 'function') {
      nav.innerHTML = tabsHtml + '<div id="exo-nav"></div>';
      bindActTabs(nav);
      MBV.Exercises.render({ nav: $('#exo-nav'), detail: det, id, api: API });
      openModal('modal-labs');
      return;
    }
    const list = ACT_TABS.find((t) => t.id === tab).list();
    const cur = list.find((l) => l.id === id) || list[0];
    nav.innerHTML =
      tabsHtml +
      list
        .map((l) => `<button class="nav-item ${l.id === cur.id ? 'active' : ''}" data-lab="${esc(l.id)}"><span class="nav-num">${esc(l.num)}</span>${esc(l.title)}<small>${esc(l.subtitle || '')}</small></button>`)
        .join('');
    if (tab === 'tp') nav.insertAdjacentHTML('beforeend', '<button class="btn btn-xs" id="lab-sheets-all" style="margin-top:8px;width:100%" title="Une fiche élève par TP, chacune sur une nouvelle page">📄 Imprimer toutes les fiches élèves</button>');
    bindActTabs(nav);
    $$('[data-lab]', nav).forEach((b) => b.addEventListener('click', () => openLabs(b.dataset.lab, tab)));
    if ($('#lab-sheets-all')) $('#lab-sheets-all').addEventListener('click', () => printStudentSheets(labsList()));
    if (tab === 'ex') {
      det.innerHTML = `<div class="lab-header"><div><div class="small-muted">Exemple ${esc(cur.num)} · réseau prêt à explorer, sans consignes</div><h3>${esc(cur.title)}</h3><div class="lab-tags">${(cur.tags || []).map((t) => `<span class="tag ${t}">${esc(t.toUpperCase())}</span>`).join('')}</div></div><div class="btn-row" style="margin:0"><button class="btn btn-accent" id="ex-load">Charger l’exemple</button></div></div>
        <p class="small-muted">${esc(cur.subtitle || '')}</p><div class="doc">${cur.desc || ''}</div>
        <div class="tip">L’exemple remplace la topologie du canevas : sauvegardez d’abord votre travail. Vous pouvez ensuite le modifier librement et l’enregistrer sous un autre nom.</div>`;
      $('#ex-load').addEventListener('click', () => startExample(cur.id));
      openModal('modal-labs');
      return;
    }
    if (tab === 'tuto') {
      det.innerHTML = `<div class="lab-header"><div><div class="small-muted">Tutoriel ${esc(cur.num)} · durée ${esc(cur.duration || '15 min')} · ${cur.steps.length} étapes</div><h3>${esc(cur.title)}</h3><div class="lab-tags">${(cur.tags || []).map((t) => `<span class="tag ${t}">${esc(t.toUpperCase())}</span>`).join('')}</div></div><div class="btn-row" style="margin:0"><button class="btn btn-accent" id="lab-start">▶ Démarrer le tutoriel</button></div></div>
        ${cur.context ? `<div class="doc">${cur.context}</div>` : ''}
        ${cur.objectives ? `<h4>Vous allez apprendre à</h4><ul>${cur.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
        <h4>Étapes</h4><ol class="lab-steps">${cur.steps.map((st) => `<li><b>${esc(st.title)}</b><div class="doc" style="font-size:13px">${st.html || ''}</div></li>`).join('')}</ol>
        <div class="tip">Chaque geste est vérifié automatiquement dans le panneau de consignes : le bouton « Étape suivante » s’illumine quand l’étape est réussie.</div>`;
      $('#lab-start').addEventListener('click', () => startLab(cur.id));
      openModal('modal-labs');
      return;
    }
    let solBtn = '';
    
    det.innerHTML = `<div class="lab-header"><div><div class="small-muted">${esc(cur.num)} · durée ${esc(cur.duration || '2 h')} · niveau ${esc(cur.level || 'Bac Pro')}</div><h3>${esc(cur.title)}</h3><div class="lab-tags">${(cur.tags || []).map((t) => `<span class="tag ${t}">${esc(t.toUpperCase())}</span>`).join('')}</div></div><div class="btn-row" style="margin:0"><button class="btn btn-accent" id="lab-start">Charger la topologie du TP</button>${solBtn}${hasAnswerKeys() ? `<button class="btn ${S.teacher ? 'btn-teacher-on' : ''}" id="lab-teacher" title="Afficher / masquer le corrigé (réservé à l’enseignant)">${S.teacher ? '🔓 Masquer le corrigé' : '🔒 Corrigé enseignant'}</button>` : ''}<button class="btn" id="lab-sheet" title="Fiche à distribuer aux élèves : en-tête nominatif, relevés de mesures, questions avec lignes de réponse (jamais de corrigé)">📄 Fiche élève</button><button class="btn" id="lab-print" title="Imprimer cette page${S.teacher ? ' avec le corrigé' : ''}">🖨 Imprimer</button></div></div>
      ${S.teacher ? '<div class="teacher-banner">Mode enseignant : le corrigé est affiché sous chaque question. Pensez à le masquer avant de laisser le poste aux élèves.</div>' : ''}
      ${cur.context ? `<h4>Contexte</h4><div class="doc">${cur.context}</div>` : ''}
      ${cur.objectives ? `<h4>Objectifs</h4><ul>${cur.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
      <h4>Déroulement pas à pas</h4><ol class="lab-steps">${cur.steps.map((st) => `<li><b>${esc(st.title)}</b><div class="doc" style="font-size:13px">${st.html || ''}</div>${st.question ? `<div class="question">❓ ${st.question}</div>` : ''}${S.teacher && st.answer ? `<div class="answer"><div class="answer-title">✔ Corrigé</div>${st.answer}</div>` : ''}</li>`).join('')}</ol>
      ${cur.conclusion ? `<h4>Synthèse</h4><div class="doc">${cur.conclusion}</div>` : ''}
      ${S.teacher && cur.answerKey ? `<h4>Corrigé — fiche de synthèse attendue</h4><div class="answer">${cur.answerKey}</div>` : ''}`;
    $('#lab-start').addEventListener('click', () => startLab(cur.id));
    
    $('#lab-print').addEventListener('click', () => window.print());
    $('#lab-sheet').addEventListener('click', () => printStudentSheets([cur]));
    openModal('modal-labs');
  }
  /* --- Fiches élèves imprimables (jamais de corrigé) --- */
  function sheetLines(n) {
    let h = '';
    for (let i = 0; i < n; i++) h += '<span></span>';
    return `<div class="sh-lines">${h}</div>`;
  }
  function studentSheetHtml(lab) {
    const rel = (lab.releves || [])
      .map((r) => `<tr><td>${esc(r[0])}</td><td class="sh-val"></td><td class="sh-unit">${esc(r[1] || '')}</td></tr>`)
      .join('');
    const steps = lab.steps
      .map(
        (st) =>
          `<li><h3>${esc(st.title)}</h3><div class="sh-text">${st.html || ''}</div>${st.question ? `<div class="sh-q"><b>Question.</b> ${st.question}</div>${sheetLines(4)}` : ''}</li>`
      )
      .join('');
    return `<section class="sheet">
      <header class="sh-head"><span>MicroWave, BLR &amp; VSAT Lab — Fiche élève</span><span>${esc(lab.num)} · ${esc(lab.duration || '2 h')}</span></header>
      <h1>${esc(lab.num)} — ${esc(lab.title)}</h1>
      ${lab.subtitle ? `<p class="sh-sub">${esc(lab.subtitle)}</p>` : ''}
      <table class="sh-id"><tr><td>Nom :</td><td></td><td>Prénom :</td><td></td></tr><tr><td>Classe :</td><td></td><td>Date :</td><td></td></tr><tr><td>Fichier sauvegardé :</td><td></td><td>Note :</td><td class="sh-note">/ 20</td></tr></table>
      ${lab.context ? `<h2>Contexte</h2><div class="sh-text">${lab.context}</div>` : ''}
      ${lab.objectives ? `<h2>Objectifs</h2><ul>${lab.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
      ${rel ? `<h2>Relevés de mesures</h2><p class="sh-hint">Complétez ce tableau au fur et à mesure du TP (valeurs lues dans l’inspecteur du simulateur).</p><table class="sh-rel"><thead><tr><th>Grandeur</th><th>Valeur mesurée</th><th>Unité</th></tr></thead><tbody>${rel}</tbody></table>` : ''}
      <h2>Travail demandé</h2><ol class="sh-steps">${steps}</ol>
      <h2>Synthèse</h2><p class="sh-hint">Rédigez en quelques lignes ce que vous retenez de ce TP.</p>${sheetLines(6)}
    </section>`;
  }
  /** Imprime une ou plusieurs fiches élèves (une par page), puis restaure l'affichage. */
  function printStudentSheets(labs) {
    if (!labs || !labs.length) return;
    let area = document.getElementById('print-sheets');
    if (!area) {
      area = document.createElement('div');
      area.id = 'print-sheets';
      document.body.appendChild(area);
    }
    area.innerHTML = labs.map(studentSheetHtml).join('');
    document.body.classList.add('printing-sheets');
    const done = () => {
      document.body.classList.remove('printing-sheets');
      area.innerHTML = '';
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    stat('printSheet');
    log(`Fiche${labs.length > 1 ? 's' : ''} élève prête${labs.length > 1 ? 's' : ''} à imprimer (${labs.map((l) => l.num).join(', ')}).`, 'info');
    window.print();
  }

  /** Vrai si des corrigés enseignant sont présents (absents dans la version élève). */
  function hasAnswerKeys() {
    return TEACHER && labsList().some((l) => l.answerKey || (l.steps || []).some((st) => st.answer));
  }
  function bindActTabs(nav) {
    $$('[data-acttab]', nav).forEach((b) => b.addEventListener('click', () => openLabs(undefined, b.dataset.acttab)));
  }
  

  function startLab(id, opts = {}) {
    if (lockedMsg()) return;
    const lab = findActivity(id);
    if (!lab) return;
    const tuto = isTutorial(lab);
    const sol = !!opts.solution && typeof lab.solution === 'function';
    const what = tuto ? `le tutoriel ${lab.num}` : sol ? `la correction du ${lab.num}` : `la topologie du ${lab.num}`;
    if (S.topo.nodes.length && !confirm(`Démarrer ${what} ? La topologie actuelle sera remplacée (pensez à la sauvegarder).`)) return;
    S.stats = {};
    S.lastPing = null;
    pushHistory();
    let topo = typeof lab.build === 'function' ? lab.build(API) : lab.topology;
    if (sol) topo = lab.solution(topo) || topo;
    topo.settings = Object.assign({ title: `${lab.num} — ${lab.title}${sol ? ' (correction)' : ''}`, labId: lab.id }, topo.settings || {});
    loadTopology(topo);
    if (lab.mode) setMode(lab.mode);
    else setMode('design');
    S.lab = lab;
    S.labStep = 0;
    S.journal = [];
    if (lab.faults && !sol) {
      const done = randomFaults(lab.faults.count || 3, { kinds: lab.faults.kinds || null });
      log(`🚨 Centre de supervision : ${done.length} incident(s) en cours sur le réseau. À vous de les localiser et de les corriger.`, 'error');
    }
    closeModals();
    $('#lab-coach').hidden = false;
    $('#lab-coach').classList.remove('minimized');
    renderCoach();
    log(`▶ ${tuto ? 'Tutoriel ' : ''}${lab.num} démarré : ${lab.title}`, 'ok');
    if (sol) log(`🔑 Topologie de correction du ${lab.num} : ${lab.solutionNote || 'état attendu en fin de TP'}`, 'warn');
  }
  /** Charge un exemple de la bibliothèque (réseau prêt à explorer, sans consignes). */
  function startExample(id) {
    if (lockedMsg()) return;
    const ex = ((MBV.Labs && MBV.Labs.examples) || []).find((e) => e.id === id);
    if (!ex) return;
    if (S.topo.nodes.length && !confirm(`Charger l’exemple « ${ex.title} » ? La topologie actuelle sera remplacée (pensez à la sauvegarder).`)) return;
    pushHistory();
    closeLab();
    const topo = ex.build();
    topo.settings = Object.assign({ title: `Exemple — ${ex.title}` }, topo.settings || {}, { labId: null });
    loadTopology(topo);
    setMode(ex.mode || 'design');
    S.journal = [];
    closeModals();
    log(`📂 Exemple chargé : ${ex.title}.`, 'ok');
    stat('example_' + ex.id);
  }
  function closeLab() {
    S.lab = null;
    $('#lab-coach').hidden = true;
  }
  function renderCoach() {
    const lab = S.lab;
    if (!lab) return;
    const step = lab.steps[S.labStep];
    $('#coach-badge').textContent = lab.num;
    $('#coach-title').textContent = lab.title;
    $('#coach-progress').textContent = `Étape ${S.labStep + 1} / ${lab.steps.length}`;
    $('#coach-prev').disabled = S.labStep === 0;
    $('#coach-next').textContent = S.labStep === lab.steps.length - 1 ? 'Terminer ✔' : 'Étape suivante ▶';
    let h = `<h4>${esc(step.title)}</h4>${step.html || ''}`;
    if (step.question) h += `<div class="question">❓ ${step.question}</div>`;
    if (S.teacher && step.answer) h += `<div class="answer"><div class="answer-title">✔ Corrigé (enseignant)</div>${step.answer}</div>`;
    if (S.examActive) {
      $('#coach-next').classList.remove('ready');
      h += '<div class="check ko">Examen en cours : la vérification automatique est masquée. Vos résultats seront évalués à la remise de la copie.</div>';
    } else if (typeof step.check === 'function') {
      let res;
      try {
        res = step.check(API);
      } catch (err) {
        res = { ok: false, msg: 'Vérification impossible : ' + err.message };
      }
      if (typeof res === 'boolean') res = { ok: res, msg: res ? 'Objectif atteint.' : 'Objectif non atteint pour le moment.' };
      h += `<div class="check ${res.ok ? 'ok' : 'ko'}">${res.ok ? '✔' : '…'} ${esc(res.msg || '')}</div>`;
      $('#coach-next').classList.toggle('ready', !!res.ok);
    } else $('#coach-next').classList.remove('ready');
    $('#coach-body').innerHTML = h;
  }
  function evaluateLab() {
    // Examen : les étapes atteintes sont enregistrées en silence (acquises définitivement)
    if (S.examActive && S.lab && MBV.Exam && typeof MBV.Exam.onProgress === 'function') {
      const r = API.evaluateSteps(S.lab.id, { topology: false });
      if (r) MBV.Exam.onProgress(S.lab.id, r.steps);
    }
    if (S.lab && !$('#lab-coach').hidden) renderCoach();
  }
  function initCoach() {
    $('#coach-prev').addEventListener('click', () => {
      if (S.labStep > 0) S.labStep--;
      renderCoach();
    });
    $('#coach-next').addEventListener('click', () => {
      if (!S.lab) return;
      if (S.labStep < S.lab.steps.length - 1) {
        S.labStep++;
        const st = S.lab.steps[S.labStep];
        if (st.onEnter) {
          try {
            st.onEnter(API);
          } catch (err) {
            console.error(err);
          }
        }
        renderCoach();
      } else {
        if (isTutorial(S.lab)) {
          log(`✔ Tutoriel ${S.lab.num} terminé : ${S.lab.title}.`, 'ok');
          toast(`Tutoriel ${S.lab.num} terminé : bravo !`, 'ok');
        } else {
          log(`✔ ${S.lab.num} terminé. Pensez à sauvegarder votre topologie et à répondre aux questions dans votre compte rendu.`, 'ok');
          toast('TP terminé : bravo !', 'ok');
        }
        closeLab();
      }
    });
    $('#coach-close').addEventListener('click', closeLab);
    $('#coach-min').addEventListener('click', () => $('#lab-coach').classList.toggle('minimized'));
    // Déplacement du panneau
    const head = $('.coach-head');
    let d = null;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = $('#lab-coach').getBoundingClientRect();
      d = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      head.setPointerCapture(e.pointerId);
      head.classList.add('dragging');
    });
    head.addEventListener('pointermove', (e) => {
      if (!d) return;
      const c = $('#lab-coach');
      c.style.left = U.clamp(e.clientX - d.dx, 0, window.innerWidth - 120) + 'px';
      c.style.top = U.clamp(e.clientY - d.dy, 0, window.innerHeight - 60) + 'px';
    });
    head.addEventListener('pointerup', () => {
      d = null;
      head.classList.remove('dragging');
    });
  }

  /* --- Documentation (docs.js : guide, instruments, fiches ; labs.js : cours) --- */
  let docState = { chap: null, q: '' };
  function docChapters() {
    if (MBV.Docs && Array.isArray(MBV.Docs.chapters)) return MBV.Docs.chapters;
    return MBV.Course && Array.isArray(MBV.Course.chapters) ? MBV.Course.chapters : [];
  }
  const docText = (c) => [c.title, c.intro || ''].concat((c.sections || []).map((s) => s.title + ' ' + s.html)).join(' ').replace(/<[^>]+>/g, ' ');
  const docNorm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  /** Ouvre la documentation sur un chapitre (et éventuellement une section). */
  function openDocs(chapterId, sectionId) {
    const chapters = docChapters();
    const nav = $('#docs-toc');
    const content = $('#docs-content');
    if (!chapters.length) {
      nav.innerHTML = '';
      content.innerHTML = '<p>La documentation n’est pas chargée (fichiers <code>labs.js</code> / <code>docs.js</code> absents).</p>';
      openModal('modal-docs');
      return;
    }
    const cur = chapters.find((c) => c.id === chapterId) || chapters.find((c) => c.id === docState.chap) || chapters[0];
    docState.chap = cur.id;
    renderDocsNav();
    content.innerHTML = `<div class="small-muted doc-group">${esc(cur.group || '')}</div><h2>${esc(cur.title)}</h2>${cur.intro || ''}` + (cur.sections || []).map((s) => `<section id="doc-${esc(s.id)}"><h3>${esc(s.title)}</h3>${s.html}</section>`).join('');
    content.scrollTop = 0;
    $$('a[data-doc]', content).forEach((x) =>
      x.addEventListener('click', (e) => {
        e.preventDefault();
        openDocs(x.dataset.doc, x.dataset.sec);
      })
    );
    openModal('modal-docs');
    if (sectionId) {
      const t = document.getElementById('doc-' + sectionId);
      if (t) t.scrollIntoView({ block: 'start' });
    }
    stat('doc_' + cur.id);
  }
  /** Sommaire par rubriques ; filtré par la recherche. */
  function renderDocsNav() {
    const chapters = docChapters();
    const nav = $('#docs-toc');
    const q = docNorm(docState.q.trim());
    const list = q ? chapters.filter((c) => docNorm(docText(c)).includes(q)) : chapters;
    const groups = [];
    for (const c of list) {
      const g = c.group || 'Documentation';
      let e = groups.find((x) => x.g === g);
      if (!e) groups.push((e = { g, items: [] }));
      e.items.push(c);
    }
    nav.innerHTML = groups.length
      ? groups
          .map(
            (e) =>
              `<div class="nav-group">${esc(e.g)}</div>` +
              e.items
                .map((c) => {
                  const active = c.id === docState.chap;
                  const secs = (c.sections || []).filter((s) => !q || docNorm(s.title + ' ' + s.html.replace(/<[^>]+>/g, ' ')).includes(q));
                  return `<button class="nav-item ${active ? 'active' : ''}" data-chap="${esc(c.id)}">${esc(c.title)}</button>` + (active || q ? secs.map((s) => `<button class="nav-item nav-sub" data-chap="${esc(c.id)}" data-sec="${esc(s.id)}">${esc(s.title)}</button>`).join('') : '');
                })
                .join('')
          )
          .join('')
      : '<p class="small-muted">Aucun résultat.</p>';
    $$('[data-chap]', nav).forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.sec && b.dataset.chap === docState.chap) {
          const t = document.getElementById('doc-' + b.dataset.sec);
          if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else openDocs(b.dataset.chap, b.dataset.sec);
      })
    );
  }

  /* ------------------------------------------------------------------
   * 10. API PUBLIQUE (utilisée par labs.js pour vérifier les objectifs)
   * ------------------------------------------------------------------ */
  const API = {
    fmt,
    node(q) {
      return S.topo.nodes.find((n) => n.id === q || n.name === q) || null;
    },
    nodes(type) {
      return type ? S.topo.nodes.filter((n) => n.type === type) : S.topo.nodes.slice();
    },
    links(medium) {
      return medium ? S.topo.links.filter((l) => l.medium === medium) : S.topo.links.slice();
    },
    /** Lien entre deux équipements (ou leurs sites) désignés par nom ou id. */
    link(qa, qb) {
      const match = (id, q) => {
        const n = nodeById(id);
        if (!n) return false;
        const s = siteOf(n);
        return n.id === q || n.name === q || (s && (s.id === q || s.name === q));
      };
      return S.topo.links.find((l) => (match(l.a, qa) && match(l.b, qb)) || (match(l.a, qb) && match(l.b, qa))) || null;
    },
    siteOf,
    heightOf,
    rain,
    setRain(v) {
      setRain(v);
    },
    mode: () => S.mode,
    analysis: () => S.analysis,
    settings: () => S.topo.settings,
    /* --- Pannes (mode Dépannage) --- */
    faultCtx: () => faultCtx(),
    injectFault(q, type, hidden = true) {
      const o = API.node(q) || S.topo.links.find((l) => l.id === q) || (Array.isArray(q) ? API.link(q[0], q[1]) : null);
      if (!o) return null;
      const f = PN().inject(o, type, faultCtx(), Math.random, hidden);
      update({ keepInspector: true });
      return f;
    },
    randomFaults: (n, opts) => randomFaults(n, opts),
    repairFault(o) {
      const r = PN().repair(o);
      update({ keepInspector: true });
      return r;
    },
    listFaults: () => PN().listFaults(S.topo),
    journal: () => (S.journal || []).slice(),
    /* --- Examen pratique de dépannage --- */
    setMode: (m) => setMode(m),
    setLocked(on) {
      S.locked = !!on;
      document.body.classList.toggle('topo-locked', S.locked);
      if (S.locked) setTool('select');
      renderInspector();
    },
    isLocked: () => S.locked,
    journalSet(list) {
      S.journal = (list || []).slice();
    },
    /** État des pannes d'une liste (sujet) dans la topologie courante : réparée / corrigée ou non. */
    faultStatus(list) {
      const ctx = faultCtx();
      return (list || []).map((f) => {
        const o = nodeById(f.id) || S.topo.links.find((l) => l.id === f.id);
        const cur = o && faultOf(o);
        let repaired;
        if (!o) repaired = false;
        else if (!cur || cur.type !== f.type) repaired = true;
        else repaired = cur.kind === 'cfg' ? PN().fixed(o, ctx) : false;
        return Object.assign({}, f, { repaired });
      });
    },
    /** Services (flux) de la topologie courante. */
    flowStatus() {
      computeAll();
      return (S.analysis ? S.analysis.flows : []).map((f) => ({ name: f.name, status: f.status }));
    },
    /** Services rendus quand toutes les pannes sont réparées (la topologie courante n'est pas modifiée). */
    healthyFlows() {
      const list = PN().listFaults(S.topo);
      const backup = list.map((x) => ({ o: x.obj, props: JSON.parse(JSON.stringify(x.obj.props)) }));
      list.forEach((x) => PN().repair(x.obj));
      computeAll();
      const flows = (S.analysis ? S.analysis.flows : []).map((f) => ({ name: f.name, status: f.status }));
      backup.forEach((b) => (b.o.props = b.props));
      computeAll();
      return flows;
    },
    /** Ping entre deux terminaux (comme l'outil Ping). */
    ping(qa, qb) {
      const a = API.node(qa);
      const b = API.node(qb);
      if (a && b) runPing(a, b);
    },
    intervene(q, action) {
      const o = API.node(q) || S.topo.links.find((l) => l.id === q);
      if (o) intervene(o, action);
    },
    leds: (q) => ledsFor(API.node(q)),
    healthSignature: () => healthSignature(),
    climate: () => climate(),
    flow(q) {
      return S.analysis ? S.analysis.flows.find((f) => f.id === q || f.name === q) || null : null;
    },
    lastPing: () => S.lastPing || null,
    /** Compteurs d'actions : save, exportSvg, tab_props/budget/profile/network, mode_*, zoom, fit, undo, flowSelected. */
    stats: () => Object.assign({}, S.stats),
    /** Distance (km) entre deux équipements (centres de leurs sites). */
    distanceKm(a, b) {
      const na = typeof a === 'string' ? API.node(a) : a;
      const nb = typeof b === 'string' ? API.node(b) : b;
      return na && nb ? distKm(na, nb) : 0;
    },
    /** Équipements voisins d'un équipement (optionnellement par type de lien). */
    neighbors(n, media) {
      const node = typeof n === 'string' ? API.node(n) : n;
      return node ? neighbors(node, media).map((x) => x.node) : [];
    },
    isTutorial: () => isTutorial(S.lab),
    /* --- Horloge de simulation (satellites défilants) --- */
    simTime: () => S.sim.t,
    setSimTime(t) {
      S.sim.t = Math.max(0, num(t, 0));
      updateClockUi();
      update({ keepInspector: true });
    },
    /** Fait avancer l'horloge de dt secondes par pas (comme si elle tournait). */
    advanceClock(dt, step = 5) {
      const end = S.sim.t + num(dt, 0);
      while (S.sim.t < end) {
        S.sim.t = Math.min(end, S.sim.t + step);
        computeAll();
      }
      updateClockUi();
      update({ keepInspector: true });
    },
    playClock: (on) => setClock(on !== false),
    /** Statistiques d'un satellite défilant : handovers, trous, RTT et élévations extrêmes, Doppler maximal. */
    satHistory(q) {
      const n = API.node(q);
      return n ? Object.assign({ handovers: 0, gaps: 0 }, S.satHist[n.id] || {}) : null;
    },
    /** Sélectionne un équipement (nom ou id) et ouvre un onglet de l'inspecteur. */
    focusNode(qn, tab) {
      const n = API.node(qn);
      if (!n) return false;
      closeModals();
      select({ kind: 'node', id: n.id });
      render();
      renderInspector();
      if (tab) activateInspectorTab(tab);
      return true;
    },
    /** Sélectionne une liaison (désignée par ses équipements ou sites) et ouvre un onglet de l'inspecteur. */
    focusLink(qa, qb, tab) {
      const l = API.link(qa, qb);
      if (!l) return false;
      closeModals();
      select({ kind: 'link', id: l.id });
      render();
      renderInspector();
      if (tab) activateInspectorTab(tab);
      return true;
    },
    closeModals,
    /* --- Mode examen (utilisé par exam.js) --- */
    examActive: () => S.examActive,
    /** Active / désactive les restrictions d'examen (vérifications, exercices, corrigé, documentation). */
    setExamActive(on, opts = {}) {
      S.examActive = !!on;
      if (on) S.teacher = false;
      document.body.classList.toggle('exam-mode', S.examActive);
      const docs = $('#btn-docs');
      docs.disabled = S.examActive && opts.docAllowed === false;
      docs.title = docs.disabled ? 'Documentation non autorisée pendant cet examen' : '';
      evaluateLab();
    },
    /** Identifiant du TP chargé (ou null). */
    currentLabId: () => (S.topo.settings && S.topo.settings.labId) || null,
    /** Évalue les vérifications automatiques d'un TP sur la topologie courante (null si ce TP n'est pas chargé). */
    evaluateSteps(labId, opts = {}) {
      const lab = findActivity(labId);
      if (!lab || !S.topo.settings || S.topo.settings.labId !== labId) return null;
      const steps = lab.steps.map((st) => {
        if (typeof st.check !== 'function') return false;
        try {
          const r = st.check(API);
          return typeof r === 'boolean' ? r : !!(r && r.ok);
        } catch (err) {
          return false;
        }
      });
      return { steps, topology: opts.topology === false ? null : serialize() };
    },
    findActivity,
    hasAnswerKeys: () => hasAnswerKeys(),
    /** Version de l'application : true pour la version enseignant. */
    isTeacherEdition: () => TEACHER,
    /** Vérifie le code enseignant (insensible à la casse) ; toujours faux dans la version élève. */
    checkTeacherCode: (code) => false,
    
    /** Imprime les fiches élèves des TP désignés (identifiants ou objets). */
    printStudentSheets: (ids) => printStudentSheets((ids || []).map((x) => (typeof x === 'string' ? findActivity(x) : x)).filter(Boolean)),
    studentSheetHtml: (id) => {
      const lab = typeof id === 'string' ? findActivity(id) : id;
      return lab ? studentSheetHtml(lab) : '';
    },
    selection: () => S.selection,
    settings: () => S.topo.settings,
    log,
    toast,
    update: () => update(),
    load: (json) => loadTopology(json),
    /** Fiche de recette : lignes (calcul, réel, mesure saisie) et conclusions. */
    recetteRows: () => recetteRows().map((r) => Object.assign({}, r, { tol: recetteTol(), verdict: recetteVerdict(r, recetteTol()) })),
    recetteOn: () => recetteOn(),
    recetteSet(cfg) {
      Object.assign(ensureRecette(), cfg || {});
      update();
    },
    recetteRapportHtml: (who) => recetteRapportHtml(who),
    theme: () => currentTheme(),
    setTheme: (t) => applyTheme(t),
    saveSession: () => saveSession(),
    /** Charge une topologie sans recadrer la vue ni l'annoncer (sujets individuels). */
    loadQuiet: (json) => loadTopology(json, { keepView: true, silent: true }),
    /** Fenêtre d'information (titre, HTML) avec un bouton Fermer. */
    dialog: (title, html) => openDialog(title, html, [{ label: 'Fermer', cls: 'btn-accent' }]),
    
    serialize,
    startLab,
    startExample,
    openLabs,
    openDocs,
    catalog: CATALOG,
    HORIZON_Y,
    ORBIT_Y,
    GRID,
  };
  MBV.App = API;

  /* ------------------------------------------------------------------
   * 11. INITIALISATION
   * ------------------------------------------------------------------ */
  function activateInspectorTab(name) {
    stat('tab_' + name);
    if (name === 'budget' || name === 'profile') recordMeasure();
    $$('.itab').forEach((t) => t.classList.toggle('active', t.dataset.itab === name));
    $$('.ipane').forEach((p) => p.classList.toggle('active', p.id === 'ipane-' + name));
  }

  function initUi() {
    $('#btn-new').addEventListener('click', newTopology);
    $('#btn-open').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', (e) => {
      if (e.target.files[0]) openFile(e.target.files[0]);
      e.target.value = '';
    });
    $('#btn-save').addEventListener('click', saveFile);
    $('#btn-export-svg').addEventListener('click', exportSvg);
    $$('.mode-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    $('#rain-slider').addEventListener('input', (e) => setRain(e.target.value));
    $('#btn-labs').addEventListener('click', () => openLabs(S.lab ? S.lab.id : undefined));
    $('#btn-docs').addEventListener('click', () => openDocs());
    $('#btn-theme').addEventListener('click', () => applyTheme(currentTheme() === 'light' ? 'dark' : 'light'));
    $('#btn-exam').addEventListener('click', () => openLabs(undefined, 'exam'));
    
    $('#docs-search').addEventListener('input', (e) => {
      docState.q = e.target.value;
      renderDocsNav();
    });
    $$('[data-close]').forEach((b) => b.addEventListener('click', () => ($('#' + b.dataset.close).hidden = true)));
    $$('.modal').forEach((m) =>
      m.addEventListener('pointerdown', (e) => {
        if (e.target === m) m.hidden = true;
      })
    );
    $$('.tool[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
    $('#btn-zoom-in').addEventListener('click', () => zoomCenter(1.2));
    $('#btn-zoom-out').addEventListener('click', () => zoomCenter(1 / 1.2));
    $('#btn-zoom-fit').addEventListener('click', () => fitView(true));
    $('#btn-storm').addEventListener('click', toggleStorm);
    $('#btn-clock').addEventListener('click', () => {
      setClock(!S.sim.playing);
      log(S.sim.playing ? `▶ Horloge de simulation lancée (×${S.sim.speed}).` : `⏸ Horloge arrêtée à T+${clockTxt(S.sim.t)}.`, 'info');
    });
    $('#clock-speed').addEventListener('change', (e) => (S.sim.speed = num(e.target.value, 60)));
    $('#btn-anim').addEventListener('click', () => {
      S.anim = !S.anim;
      document.body.classList.toggle('anim-off', !S.anim);
      $('#btn-anim use').setAttribute('href', S.anim ? '#ico-pause' : '#ico-play');
      if (!S.anim) S.packets = [];
    });
    $('#scale-select').addEventListener('change', (e) => {
      pushHistory();
      S.topo.settings.scaleKm = num(e.target.value, 2);
      log(`Échelle : 1 carreau = ${fmt(S.topo.settings.scaleKm, 2)} km (les distances radio sont recalculées).`, 'info');
      update();
    });
    $$('.ctab').forEach((t) => t.addEventListener('click', () => showConsoleTab(t.dataset.ctab)));
    $$('.itab').forEach((t) => t.addEventListener('click', () => activateInspectorTab(t.dataset.itab)));
    $('#btn-console-clear').addEventListener('click', () => {
      const active = $('.ctab.active').dataset.ctab;
      if (active === 'log') $('#log-list').innerHTML = '';
      if (active === 'term') $('#terminal').textContent = '';
    });
    $('#btn-console-toggle').addEventListener('click', () => {
      const c = $('#console');
      c.classList.toggle('collapsed');
      $('#btn-console-toggle').textContent = c.classList.contains('collapsed') ? '▴' : '▾';
      setTimeout(applyView, 220);
    });
    window.addEventListener('beforeunload', (e) => {
      if (S.history.length) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  function init() {
    initDefs();
    initUi();
    initPalette();
    initCanvasEvents();
    initKeyboard();
    initCoach();
    setTool('select');
    setMode('design');
    setRain(0, { silent: true });
    initResizers();
    update();
    applyView();
    log('Bienvenue dans MicroWave, BLR & VSAT Lab. Glissez des équipements sur le canevas ou ouvrez un TP.', 'info');
    restoreSession();
    if (labsList().length) log(`${labsList().length} TP disponibles : bouton « Travaux Pratiques (TP) ».`, 'info');
    document.body.classList.add(TEACHER ? 'ed-enseignant' : 'ed-eleve');
    if (!TEACHER) {
      const mb = $('.mode-btn[data-mode="diag"]');
      mb.textContent = 'Dépannage';
      mb.title = 'Mesurer, localiser et réparer les pannes : voyants, interventions, outil « Panne »';
    }
    
    $('#st-edition').textContent = TEACHER ? 'Version enseignant' : 'Version élève';
    
    $('#st-edition').title = TEACHER ? 'Version complète : corrigés des TP (code enseignant), création et correction des examens. Ne pas distribuer aux élèves.' : 'Version élève : sans corrigés des TP ni outils de l’examinateur.';
    requestAnimationFrame(animLoop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
