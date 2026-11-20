/* =====================================================================
 * MicroWave, BLR & VSAT Lab — pannes.js
 * Moteur de pannes pour le mode Dépannage et l'examen pratique.
 *
 * Deux familles :
 *   - pannes MATÉRIELLES (kind 'hw') : cachées par défaut, elles ne modifient
 *     aucun réglage visible ; leur effet physique est lu par app.js via
 *     effects() (équipement muet, perte supplémentaire, dépointage, câble
 *     coupé, facteur de bruit dégradé). Elles se corrigent par une
 *     INTERVENTION adaptée (remplacer, repointer, refaire le branchement,
 *     reprendre le câble) ;
 *   - pannes de CONFIGURATION (kind 'cfg') : elles modifient réellement un
 *     réglage (polarisation, canal, VLAN, ACM, adresse IP…) ; l'élève les
 *     corrige dans l'inspecteur. fixed() dit si le réglage est redevenu
 *     correct (même s'il a été corrigé « de l'autre côté » du bond).
 *
 * Règle pédagogique : une panne cachée n'est JAMAIS nommée (ni sur le
 * canevas, ni dans l'inspecteur, le bilan ou le journal) : seuls ses
 * SYMPTÔMES sont visibles (RSL, modulation, alarmes, ping).
 *
 * Mémorisation : objet.props.fault = { type, kind, hidden, restore, meta }
 * (restore = valeurs d'origine des réglages modifiés).
 *
 * Interface : MBV.Pannes = { CATALOG, INTERVENTIONS, def, candidates, inject,
 *   repair, fixed, effects, interventionsFor, intervene, listFaults }
 * ===================================================================== */
(function (root) {
  'use strict';
  const MBV = (root.MBV = root.MBV || {});

  const RADIO_FH = ['antenna', 'fullOutdoor'];
  const ENDPOINTS = ['gnodeb', 'ruralSite', 'bankAgency', 'pc', 'server', 'internet'];
  const between = (rnd, a, b) => a + (b - a) * rnd();
  const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
  const vlanList = (v) =>
    String(v === undefined || v === null ? '' : v)
      .split(/[,\s;]+/)
      .map((x) => parseInt(x, 10))
      .filter((x) => x > 0);

  /* ------------------------------------------------------------------
   * Interventions possibles de l'élève (mode Dépannage)
   * ------------------------------------------------------------------ */
  const INTERVENTIONS = {
    replace: { label: 'Remplacer l’équipement', verb: 'remplacé' },
    repoint: { label: 'Repointer l’antenne', verb: 'repointé' },
    branch: { label: 'Refaire le branchement (connecteurs, guide d’onde)', verb: 'branchement refait' },
    cable: { label: 'Reprendre le câble (connecteurs, continuité)', verb: 'câble repris' },
  };
  /** Interventions proposées selon le type d'équipement ou de câble. */
  const INTERVENTIONS_BY_TYPE = {
    odu: ['replace', 'branch'],
    idu: ['replace'],
    fullOutdoor: ['replace', 'repoint'],
    antenna: ['repoint'],
    vsatAntenna: ['repoint'],
    buc: ['replace'],
    lnb: ['replace'],
    vsatModem: ['replace'],
    blrCpe: ['replace', 'repoint'],
    blrBts: ['replace'],
    router: ['replace'],
    switch: ['replace'],
    'link:if': ['cable'],
    'link:coax': ['cable'],
    'link:ethernet': ['cable'],
    'link:fiber': ['cable'],
  };

  /* ------------------------------------------------------------------
   * Catalogue
   *   targets : types d'équipement, ou 'link:<médium>' pour un câble
   *   can(o, ctx)  : la panne est applicable à cet objet
   *   make(o, ctx, rnd) → { patch (réglages modifiés), meta }
   *   fixed(o, ctx) : (cfg) le réglage est redevenu correct
   *   fix     : (hw) intervention qui répare
   *   effect  : (hw) effet physique lu par app.js
   * ------------------------------------------------------------------ */
  const CATALOG = {
    /* ---------- Matériel FH ---------- */
    'odu-muette': { kind: 'hw', label: 'ODU hors service (plus d’émission ni de réception)', targets: ['odu'], fix: 'replace', effect: { dead: true }, can: (o, ctx) => !!ctx.fhLinkOf(o) },
    'fo-hs': { kind: 'hw', label: 'Radio Full-Outdoor hors service', targets: ['fullOutdoor'], fix: 'replace', effect: { dead: true }, can: (o, ctx) => !!ctx.fhLinkOf(o) },
    'idu-hs': { kind: 'hw', label: 'IDU hors service (modem, alimentation de l’ODU)', targets: ['idu'], fix: 'replace', effect: { dead: true }, can: (o, ctx) => !!ctx.fhLinkOf(o) },
    'branchement-humide': {
      kind: 'hw',
      label: 'Branchement ODU – antenne humide / oxydé (pertes +18 à +25 dB)',
      targets: ['odu'],
      fix: 'branch',
      can: (o, ctx) => !!ctx.fhLinkOf(o),
      make: (o, ctx, rnd) => ({ meta: { lossDb: Math.round(between(rnd, 18, 25)) } }),
      effect: (f) => ({ extraLossDb: f.meta.lossDb }),
    },
    'antenne-depointee': {
      kind: 'hw',
      label: 'Antenne FH dépointée (coup de vent, fixation desserrée)',
      targets: RADIO_FH,
      fix: 'repoint',
      can: (o, ctx) => !!ctx.fhLinkOf(o),
      make: (o, ctx, rnd) => ({ meta: { azErrDeg: +(pick(rnd, [-1, 1]) * between(rnd, 1.6, 2.6) * ctx.beamwidthDeg(o)).toFixed(2) } }),
      effect: (f) => ({ azErrDeg: f.meta.azErrDeg }),
    },
    'cable-if-coupe': { kind: 'hw', label: 'Câble IF coupé ou connecteur arraché (ODU non alimentée)', targets: ['link:if'], fix: 'cable', effect: { cut: true }, can: (l, ctx) => !!ctx.fhLinkOfCable(l) },
    /* ---------- Matériel VSAT ---------- */
    'buc-hs': { kind: 'hw', label: 'BUC hors service (plus d’émission vers le satellite)', targets: ['buc'], fix: 'replace', effect: { dead: true }, can: (o, ctx) => !!ctx.vsatOf(o) },
    'lnb-hs': { kind: 'hw', label: 'LNB hors service (plus de réception)', targets: ['lnb'], fix: 'replace', effect: { dead: true }, can: (o, ctx) => !!ctx.vsatOf(o) },
    'lnb-degrade': {
      kind: 'hw',
      label: 'LNB dégradé (facteur de bruit +5 à +7 dB)',
      targets: ['lnb'],
      fix: 'replace',
      can: (o, ctx) => !!ctx.vsatOf(o),
      make: (o, ctx, rnd) => ({ meta: { nfAddDb: Math.round(between(rnd, 5, 7)) } }),
      effect: (f) => ({ nfAddDb: f.meta.nfAddDb }),
    },
    'modem-vsat-hs': { kind: 'hw', label: 'Modem satellite hors service', targets: ['vsatModem'], fix: 'replace', effect: { dead: true }, can: (o, ctx) => !!ctx.vsatOf(o) },
    'parabole-vsat-depointee': {
      kind: 'hw',
      label: 'Parabole VSAT dépointée (fixation desserrée)',
      targets: ['vsatAntenna'],
      fix: 'repoint',
      can: (o, ctx) => {
        const v = ctx.vsatOf(o);
        return !!v && v.fixedPointing;
      },
      make: (o, ctx, rnd) => ({ meta: { azErrDeg: +(pick(rnd, [-1, 1]) * between(rnd, 0.8, 1.5)).toFixed(2), elErrDeg: +(pick(rnd, [-1, 1]) * between(rnd, 0.4, 0.9)).toFixed(2) } }),
      effect: (f) => ({ azErrDeg: f.meta.azErrDeg, elErrDeg: f.meta.elErrDeg }),
    },
    'coax-coupe': { kind: 'hw', label: 'Câble coaxial coupé ou connecteur F oxydé', targets: ['link:coax'], fix: 'cable', effect: { cut: true }, can: (l, ctx) => !!ctx.vsatOfCable(l) },
    /* ---------- Matériel BLR et réseau ---------- */
    'cpe-depointe': {
      kind: 'hw',
      label: 'Antenne du CPE dépointée',
      targets: ['blrCpe'],
      fix: 'repoint',
      can: (o, ctx) => !!ctx.blrLinkOf(o) && o.props.install !== 'indoor',
      make: (o, ctx, rnd) => ({ meta: { azErrDeg: +(pick(rnd, [-1, 1]) * between(rnd, 25, 40)).toFixed(1) } }),
      effect: (f) => ({ azErrDeg: f.meta.azErrDeg }),
    },
    'cpe-hs': { kind: 'hw', label: 'CPE hors service', targets: ['blrCpe'], fix: 'replace', effect: { dead: true }, can: (o, ctx) => !!ctx.blrLinkOf(o) },
    'cable-reseau-coupe': { kind: 'hw', label: 'Câble réseau (cuivre ou fibre) coupé / connecteur défectueux', targets: ['link:ethernet', 'link:fiber'], fix: 'cable', effect: { cut: true }, can: () => true },

    /* ---------- Configuration ---------- */
    'polarisation-croisee': {
      kind: 'cfg',
      label: 'Polarisation de l’antenne différente de celle de l’autre extrémité',
      targets: RADIO_FH,
      can: (o, ctx) => {
        const p = ctx.fhPartnerAntenna(o);
        return !!p && ['V', 'H'].includes(o.props.polarization) && o.props.polarization === p.props.polarization;
      },
      make: (o) => ({ patch: { polarization: o.props.polarization === 'V' ? 'H' : 'V' } }),
      fixed: (o, ctx) => {
        const p = ctx.fhPartnerAntenna(o);
        return !p || o.props.polarization === p.props.polarization;
      },
    },
    'canal-different': {
      kind: 'cfg',
      label: 'Numéro de canal différent de celui de l’autre extrémité',
      targets: ['odu', 'fullOutdoor'],
      can: (o, ctx) => {
        const p = ctx.fhPartnerRf(o);
        return !!p && Number(o.props.channelNo || 1) === Number(p.props.channelNo || 1);
      },
      make: (o) => ({ patch: { channelNo: (Number(o.props.channelNo || 1) % 8) + 1 } }),
      fixed: (o, ctx) => {
        const p = ctx.fhPartnerRf(o);
        return !p || Number(o.props.channelNo || 1) === Number(p.props.channelNo || 1);
      },
    },
    'largeur-canal': {
      kind: 'cfg',
      label: 'Largeur de canal différente de celle de l’autre extrémité',
      targets: ['odu', 'fullOutdoor'],
      can: (o, ctx) => {
        const p = ctx.fhPartnerRf(o);
        return !!p && Number(o.props.channelMHz) === Number(p.props.channelMHz) && ctx.bandChannels(o).length > 1;
      },
      make: (o, ctx, rnd) => ({ patch: { channelMHz: pick(rnd, ctx.bandChannels(o).filter((c) => c !== Number(o.props.channelMHz))) } }),
      fixed: (o, ctx) => {
        const p = ctx.fhPartnerRf(o);
        return !p || Number(o.props.channelMHz) === Number(p.props.channelMHz);
      },
    },
    'acm-desactive': {
      kind: 'cfg',
      label: 'Modulation adaptative (ACM) désactivée, modulation fixe trop élevée',
      targets: ['idu', 'fullOutdoor'],
      can: (o, ctx) => o.props.acm !== false && !!ctx.fhLinkOf(o),
      make: () => ({ patch: { acm: false, maxMod: '1024QAM' } }),
      fixed: (o) => o.props.acm !== false,
    },
    'vlan-manquant': {
      kind: 'cfg',
      label: 'VLAN retiré de la liste des VLAN autorisés',
      targets: ['idu', 'switch', 'router', 'fullOutdoor', 'blrBts', 'vsatModem'],
      can: (o) => vlanList(o.props.vlans).length > 0,
      make: (o, ctx, rnd) => {
        const l = vlanList(o.props.vlans);
        const drop = pick(rnd, l);
        return { patch: { vlans: l.filter((v) => v !== drop).join(',') || 'none' }, meta: { vlan: drop } };
      },
      fixed: (o) => {
        const f = o.props.fault;
        const v = String(o.props.vlans || '').trim().toLowerCase();
        return v === 'all' || v === '' || vlanList(o.props.vlans).includes(f.meta.vlan);
      },
    },
    'vlan-acces-cpe': {
      kind: 'cfg',
      label: 'VLAN d’accès du CPE erroné',
      targets: ['blrCpe'],
      can: (o) => Number(o.props.accessVlan) > 0,
      make: (o) => ({ patch: { accessVlan: Number(o.props.accessVlan) + 10 } }),
      fixed: (o) => Number(o.props.accessVlan) === Number(o.props.fault.restore.accessVlan),
    },
    'ip-erronee': {
      kind: 'cfg',
      label: 'Adresse IP du terminal dans le mauvais réseau',
      targets: ENDPOINTS,
      can: (o) => /^\d+\.\d+\.\d+\.\d+$/.test(String(o.props.ip || '')) && Number(o.props.prefix || 24) >= 16 && Number(o.props.prefix || 24) <= 24,
      make: (o) => {
        const b = String(o.props.ip).split('.').map(Number);
        b[2] = (b[2] + 100) % 250;
        return { patch: { ip: b.join('.') } };
      },
      fixed: (o) => {
        const r = o.props.fault.restore;
        const pre = Number(o.props.prefix || 24);
        const net = (ip) => {
          const n = String(ip || '')
            .split('.')
            .reduce((a, x) => a * 256 + Number(x), 0);
          return Math.floor(n / Math.pow(2, 32 - pre));
        };
        return /^\d+\.\d+\.\d+\.\d+$/.test(String(o.props.ip || '')) && net(o.props.ip) === net(r.ip);
      },
    },
  };

  const def = (type) => CATALOG[type] || null;
  const typeKey = (o) => (o && o.medium ? 'link:' + o.medium : o && o.type);

  /** Couples (objet, type de panne) applicables dans la topologie, objets sans panne uniquement. */
  function candidates(topo, ctx, opts = {}) {
    const out = [];
    const objs = topo.nodes.concat(topo.links);
    for (const o of objs) {
      if (o.props && o.props.fault) continue;
      for (const [type, d] of Object.entries(CATALOG)) {
        if (opts.kinds && !opts.kinds.includes(d.kind)) continue;
        if (!d.targets.includes(typeKey(o))) continue;
        try {
          if (!d.can || d.can(o, ctx)) out.push({ obj: o, type });
        } catch (e) {
          /* objet incomplet : panne non applicable */
        }
      }
    }
    return out;
  }

  /** Applique une panne (cachée par défaut). Renvoie l'objet fault. */
  function inject(o, type, ctx, rnd = Math.random, hidden = true) {
    const d = def(type);
    if (!d) throw new Error('panne inconnue : ' + type);
    if (!d.targets.includes(typeKey(o))) throw new Error(`panne « ${type} » non applicable à ${typeKey(o)}`);
    o.props = o.props || {};
    if (o.props.fault) repair(o);
    const r = d.make ? d.make(o, ctx, rnd) : {};
    const patch = r.patch || {};
    const restore = {};
    for (const k of Object.keys(patch)) restore[k] = Object.prototype.hasOwnProperty.call(o.props, k) ? o.props[k] : undefined;
    Object.assign(o.props, patch);
    o.props.fault = { type, kind: d.kind, hidden: !!hidden, restore, meta: r.meta || {} };
    return o.props.fault;
  }
  /** Répare exactement : réglages d'origine restaurés, panne retirée. */
  function repair(o) {
    const f = o && o.props && o.props.fault;
    if (!f) return false;
    for (const [k, v] of Object.entries(f.restore || {})) {
      if (v === undefined) delete o.props[k];
      else o.props[k] = v;
    }
    delete o.props.fault;
    return true;
  }
  /** Panne de configuration corrigée par l'élève (le réglage est redevenu correct). */
  function fixed(o, ctx) {
    const f = o && o.props && o.props.fault;
    if (!f) return true;
    const d = def(f.type);
    if (!d || d.kind !== 'cfg') return false;
    try {
      return !!d.fixed(o, ctx);
    } catch (e) {
      return false;
    }
  }
  /** Effet physique d'une panne matérielle (lu par les calculs de app.js). */
  function effects(o) {
    const f = o && o.props && o.props.fault;
    if (!f || f.kind !== 'hw') return null;
    const d = def(f.type);
    if (!d) return null;
    return typeof d.effect === 'function' ? d.effect(f) : Object.assign({}, d.effect);
  }
  /** Interventions proposées sur un objet. */
  function interventionsFor(o) {
    return (INTERVENTIONS_BY_TYPE[typeKey(o)] || []).map((id) => Object.assign({ id }, INTERVENTIONS[id]));
  }
  /**
   * Intervention de l'élève : répare la panne matérielle si l'action est la bonne.
   * Renvoie { hit } : true si une panne a été réparée (sinon intervention inutile).
   */
  function intervene(o, action) {
    const f = o && o.props && o.props.fault;
    if (f && f.kind === 'hw' && def(f.type).fix === action) {
      repair(o);
      return { hit: true, type: f.type };
    }
    return { hit: false };
  }
  /** Liste des pannes présentes dans une topologie. */
  function listFaults(topo) {
    return topo.nodes
      .concat(topo.links)
      .filter((o) => o.props && o.props.fault)
      .map((o) => ({ obj: o, fault: o.props.fault, def: def(o.props.fault.type) }));
  }

  MBV.Pannes = { CATALOG, INTERVENTIONS, def, typeKey, candidates, inject, repair, fixed, effects, interventionsFor, intervene, listFaults, vlanList };
})(typeof window !== 'undefined' ? window : globalThis);
