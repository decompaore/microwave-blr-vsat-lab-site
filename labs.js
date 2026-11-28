/* =====================================================================
 * labs.js — Travaux Pratiques & Cours embarqués
 * MicroWave, BLR & VSAT Lab
 *
 * Contenu :
 *   - MBV.Labs.list : TP prêts à l'emploi (topologie + consignes pas à pas
 *                     + vérification automatique des objectifs ; topologie de
 *                     correction `solution`, version enseignant)
 *   - MBV.Labs.examples : exemples prêts à explorer (sans étapes)
 *   - MBV.Course    : cours « FH, BLR, VSAT & Microwave IP » (assemblé avec le guide par docs.js)
 *
 * Les topologies référencent les équipements par leur NOM (liens, flux,
 * fixation sur site). Les vérifications utilisent l'API MBV.App (app.js).
 * ===================================================================== */
(function (root) {
  'use strict';

  const MBV = (root.MBV = root.MBV || {});
  const f = (v, d = 1) => (MBV.Util ? MBV.Util.fmt(v, d) : String(v));

  /* ------------------------------------------------------------------
   * 1. OUTILS DE CONSTRUCTION DES TOPOLOGIES
   * ------------------------------------------------------------------ */
  const N = (type, name, x, y, props) => ({ type, name, x, y, props: props || {} });
  const Lk = (a, b, props, medium) => ({ a, b, props: props || {}, medium });
  const Fl = (src, dst, rateMbps, cls, name) => ({ src, dst, rateMbps, cls: cls || 'data', name });

  /** Chaîne FH complète sur un pylône : antenne + ODU fixées en haut, IDU au pied (local technique). */
  function fhSite(nodes, links, site, suffix, x, y, side, odu, ant, idu) {
    const dx = side === 'left' ? 1 : -1;
    nodes.push(N('antenna', 'ANT-' + suffix, x + dx * 70, y - 60, Object.assign({ siteId: site }, ant)));
    nodes.push(N('odu', 'ODU-' + suffix, x + dx * 70, y - 140, Object.assign({ siteId: site }, odu)));
    nodes.push(N('idu', 'IDU-' + suffix, x - dx * 95, y - 30, idu || {}));
    links.push(Lk('ANT-' + suffix, 'ODU-' + suffix), Lk('ODU-' + suffix, 'IDU-' + suffix));
  }

  /**
   * Modifie une topologie construite : réglages d'équipements { nom: props }, réglages de liens
   * [[a, b, props]] et liens ajoutés [[a, b]]. Lève une erreur si un nom est introuvable.
   */
  function fix(t, nodes, links, add) {
    for (const [name, props] of Object.entries(nodes || {})) {
      const n = t.nodes.find((x) => x.name === name);
      if (!n) throw new Error('équipement introuvable : ' + name);
      Object.assign(n.props, props);
    }
    for (const [a, b, props] of links || []) {
      const l = t.links.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
      if (!l) throw new Error('lien introuvable : ' + a + ' — ' + b);
      l.props = Object.assign(l.props || {}, props);
    }
    for (const [a, b] of add || []) t.links.push(Lk(a, b));
    return t;
  }
  /* --- Petites fonctions de vérification --- */
  const st = (api, a, b) => {
    const l = api.link(a, b);
    return l ? l.state : null;
  };
  const fhMargin = (s) => (s && s.budgets && s.budgets.ab ? Math.min(s.budgets.ab.fadeMarginRef, s.budgets.ba.fadeMarginRef) : -Infinity);
  const fhMod = (s) => (s && s.budgets && s.budgets.ab && s.budgets.ab.activeModulation ? s.budgets.ab.activeModulation.id : 'COUPÉ');
  const allFlows = (api) => (api.analysis() ? api.analysis().flows : []);
  const statusTxt = (s) => (!s ? 'inconnu' : s.status === 'optimal' ? 'ACM optimal (vert)' : s.status === 'degraded' ? 'repli de modulation (orange)' : 'COUPÉ (rouge)');

  /* ------------------------------------------------------------------
   * 2. LES 6 TRAVAUX PRATIQUES
   * ------------------------------------------------------------------ */
  const LABS = [];

  /* =================== TP 1 =================== */
  LABS.push({
    id: 'tp1',
    
    num: 'TP 1',
    title: 'Dimensionnement d’un Faisceau Hertzien point-à-point (25 km)',
    subtitle: 'Bande 7 GHz vs 18 GHz, diamètre des paraboles, marge > 25 dB',
    duration: '2 h',
    level: 'Bac Pro SN / Télécoms',
    tags: ['fh'],
    mode: 'design',
    context:
      '<p>Un opérateur mobile doit raccorder une nouvelle station <b>gNodeB</b> (site B, relais Est) à son cœur de réseau (site A, Ouagadougou) situé à <b>25 km</b>. Aucune fibre n’est disponible : on installe un <b>faisceau hertzien</b> en architecture <i>split-mount</i> (IDU au pied du pylône, ODU + antenne en haut).</p><p>Le cahier des charges impose une <b>marge au fading ≥ 25 dB</b> par ciel clair pour la modulation de référence <b>256QAM</b> (canal 28 MHz), et une liaison qui résiste aux pluies tropicales.</p>',
    objectives: [
      'Lire et interpréter un bilan de liaison : PIRE, FSL, RSL, seuil, marge au fading.',
      'Mesurer l’influence du diamètre d’antenne (gain) sur le RSL.',
      'Comparer une bande basse (7 GHz) et une bande haute (18 GHz) face à la pluie.',
      'Choisir la configuration la plus économique respectant le cahier des charges.',
    ],
    releves: [["PIRE (18 GHz, 24 dBm, antenne 0,6 m)", "dBm"], ["FSL à 18 GHz sur 25 km", "dB"], ["RSL initial (18 GHz, 0,6 m)", "dBm"], ["Marge au fading initiale", "dB"], ["Gain d’une antenne de 1,2 m à 18 GHz", "dBi"], ["Marge avec antennes de 1,2 m", "dB"], ["Atténuation de pluie à 40 mm/h (18 GHz)", "dB"], ["Modulation à 40 mm/h (18 GHz)", ""], ["Marge en 7 GHz (antennes 1,2 m)", "dB"], ["Atténuation de pluie à 40 mm/h (7 GHz)", "dB"], ["Diamètre d’antenne retenu (7 GHz)", "m"], ["Marge finale", "dB"]],
    steps: [
      {
        title: 'Observer la configuration initiale (18 GHz, paraboles 0,6 m)',
        html: '<p>Cliquez sur le faisceau entre les deux pylônes, puis ouvrez l’onglet <b>Bilan de liaison</b> de l’inspecteur. Relevez la PIRE, l’affaiblissement en espace libre (FSL), le RSL et la <b>marge au fading</b>.</p>',
        question: 'Calculez à la main FSL = 92,45 + 20·log(25) + 20·log(18). Retrouvez-vous la valeur du simulateur ? La marge respecte-t-elle le cahier des charges ?',
        check: (api) => {
          const s = st(api, 'Site A', 'Site B');
          if (!s || !s.budgets) return { ok: false, msg: 'Faisceau introuvable ou incomplet.' };
          return { ok: true, msg: `RSL = ${f(s.budgets.ab.rsl)} dBm · marge = ${f(fhMargin(s))} dB (${fhMargin(s) >= 25 ? 'conforme' : 'insuffisante'}).` };
        },
      },
      {
        title: 'Augmenter le gain : paraboles de 1,2 m',
        html: '<p>Sélectionnez <b>ANT-A</b> puis <b>ANT-B</b> et passez leur diamètre à <b>1,2 m</b> (onglet Paramètres). Observez le gain d’antenne (dBi) et la nouvelle marge.</p><p class="small-muted">Rappel : doubler le diamètre multiplie la surface par 4, soit +6 dB de gain par antenne.</p>',
        question: 'De combien de dB la marge a-t-elle augmenté ? Justifiez avec la formule du gain G = 10·log(η·(π·D/λ)²).',
        check: (api) => {
          const s = st(api, 'Site A', 'Site B');
          const m = fhMargin(s);
          const okD = ['ANT-A', 'ANT-B'].every((n) => Number(api.node(n).props.diameterM) >= 1.2);
          return { ok: okD && m >= 25, msg: okD ? `Marge au fading = ${f(m)} dB ${m >= 25 ? '≥ 25 dB ✔' : '< 25 dB'}` : 'Réglez les deux antennes sur 1,2 m.' };
        },
      },
      {
        title: 'Tester la liaison 18 GHz sous une forte pluie',
        html: '<p>Passez en mode <b>Météo &amp; Propagation</b> et réglez le curseur de pluie sur <b>40 mm/h</b> (forte pluie tropicale). Observez la couleur du faisceau et l’atténuation due à la pluie dans le bilan.</p>',
        question: 'Que vaut l’atténuation par la pluie ? Pourquoi la bande 18 GHz est-elle si sensible ?',
        check: (api) => {
          const s = st(api, 'Site A', 'Site B');
          if (api.rain() < 40) return { ok: false, msg: `Pluie actuelle : ${api.rain()} mm/h (objectif 40 mm/h).` };
          return { ok: true, msg: `A_pluie = ${f(s.budgets ? s.budgets.ab.rain : 0)} dB → liaison ${statusTxt(s)}.` };
        },
      },
      {
        title: 'Passer en bande 7 GHz',
        html: '<p>Gardez la pluie à 40 mm/h. Sélectionnez <b>ODU-A</b> et <b>ODU-B</b> et choisissez la bande <b>7 GHz</b> (la puissance maximale passe à 30 dBm). Comparez l’atténuation de pluie et la marge.</p>',
        question: 'Comparez les FSL à 7 et 18 GHz. Quel est l’avantage décisif de la bande 7 GHz sur 25 km en climat tropical ?',
        check: (api) => {
          const s = st(api, 'Site A', 'Site B');
          const band = ['ODU-A', 'ODU-B'].every((n) => api.node(n).props.band === '7');
          if (!band) return { ok: false, msg: 'Les deux ODU doivent être en 7 GHz.' };
          return { ok: api.rain() >= 40 && s.status === 'optimal' && fhMargin(s) >= 25, msg: `Marge ${f(fhMargin(s))} dB · A_pluie ${f(s.budgets.ab.rain)} dB · ${statusTxt(s)}.` };
        },
      },
      {
        title: 'Optimiser le coût : la plus petite antenne possible',
        html: '<p>Une parabole plus petite est moins chère, plus légère et offre moins de prise au vent. En <b>7 GHz</b>, trouvez le <b>plus petit diamètre</b> (identique aux deux extrémités) qui garantit encore une marge ≥ 25 dB.</p>',
        question: 'Quel diamètre retenez-vous ? Rédigez la fiche de configuration finale (bande, puissance, diamètres, marge, modulation, débit).',
        check: (api) => {
          const s = st(api, 'Site A', 'Site B');
          const dA = Number(api.node('ANT-A').props.diameterM);
          const dB = Number(api.node('ANT-B').props.diameterM);
          const band = api.node('ODU-A').props.band === '7' && api.node('ODU-B').props.band === '7';
          const m = fhMargin(s);
          const ok = band && m >= 25 && Math.max(dA, dB) <= 0.9;
          return { ok, msg: `7 GHz : ${band ? 'oui' : 'non'} · antennes ${f(dA)} / ${f(dB)} m · marge ${f(m)} dB${ok ? ' → configuration optimale ✔' : ''}.` };
        },
      },
    ],
    conclusion:
      '<p>Sur un bond long (≥ 20 km) en zone tropicale, on privilégie les <b>bandes basses (6–8 GHz)</b> : l’affaiblissement en espace libre et surtout l’atténuation par la pluie y sont bien plus faibles. Les bandes hautes (18–23 GHz, E-Band) sont réservées aux bonds courts en ville. Le diamètre d’antenne est le levier principal pour gagner de la marge : chaque doublement apporte +6 dB par antenne, soit +12 dB sur le bond.</p>',
    build() {
      const nodes = [];
      const links = [];
      nodes.push(N('tower', 'Site A', 100, 560, { heightM: 40, groundM: 305 }), N('tower', 'Site B', 725, 560, { heightM: 40, groundM: 300 }));
      fhSite(nodes, links, 'Site A', 'A', 100, 560, 'left', { band: '18', txPowerDbm: 24, channelMHz: 28 }, { diameterM: 0.6, polarization: 'V', heightM: 38 }, { maxMod: '256QAM' });
      fhSite(nodes, links, 'Site B', 'B', 725, 560, 'right', { band: '18', txPowerDbm: 24, channelMHz: 28 }, { diameterM: 0.6, polarization: 'V', heightM: 38 }, { maxMod: '256QAM' });
      links.push(Lk('ANT-A', 'ANT-B'));
      nodes.push(N('server', 'Cœur réseau', 40, 700, { ip: '10.0.0.1' }), N('gnodeb', 'gNodeB Est', 790, 700, { ip: '10.0.0.20' }));
      links.push(Lk('IDU-A', 'Cœur réseau'), Lk('IDU-B', 'gNodeB Est'));
      return { settings: { scaleKm: 2, rainMmH: 0 }, nodes, links, flows: [Fl('gNodeB Est', 'Cœur réseau', 100, 'data', 'Données 4G/5G'), Fl('gNodeB Est', 'Cœur réseau', 10, 'voice', 'Voix sur IP')] };
    },
  });

  /* =================== TP 2 =================== */
  LABS.push({
    id: 'tp2',
    
    num: 'TP 2',
    title: 'Dégagement de la zone de Fresnel et hauteur de pylône',
    subtitle: 'Une colline obstrue le faisceau : profil topographique et surélévation',
    duration: '2 h',
    tags: ['fh'],
    mode: 'design',
    context:
      '<p>Un bond de <b>20 km à 13 GHz</b> doit relier deux pylônes de 30 m. Une <b>colline de 55 m</b> se trouve sur le trajet, à environ 9 km du site A. Le sol est plus haut côté A (320 m) que côté B (300 m).</p><p>Pour une propagation sans perte, l’ellipsoïde de la <b>1ère zone de Fresnel</b> doit être dégagé d’au moins <b>60 %</b> (règle d’ingénierie), idéalement <b>100 %</b>, en tenant compte de la <b>courbure terrestre</b> (facteur k = 4/3).</p>',
    objectives: [
      'Lire un profil de terrain : sol, renflement terrestre, ligne de visée, zone de Fresnel.',
      'Calculer le rayon de la 1ère zone de Fresnel et le renflement terrestre.',
      'Déterminer la hauteur de pylône nécessaire pour dégager 60 % puis 100 % de F1.',
      'Relier le dégagement à la perte de diffraction dans le bilan de liaison.',
    ],
    releves: [["Dégagement minimal initial", "% de F1"], ["Perte de diffraction initiale", "dB"], ["Distance d1 du point critique", "km"], ["Rayon r1 au point critique", "m"], ["Renflement terrestre au point critique", "m"], ["Hauteur des pylônes pour 60 %", "m"], ["Hauteur des pylônes pour 100 % (symétrique)", "m"], ["Solution dissymétrique : pylône A / pylône B", "m / m"], ["RSL final", "dBm"], ["Marge finale", "dB"]],
    steps: [
      {
        title: 'Constater l’obstruction',
        html: '<p>Sélectionnez le faisceau et ouvrez l’onglet <b>Profil &amp; Fresnel</b>. Repérez la colline (en rouge), la ligne de visée (pointillés blancs) et la 1ère zone de Fresnel (en bleu, ou rouge si obstruée).</p>',
        question: 'Quel est le taux de dégagement au point critique ? Quelle perte de diffraction en résulte ?',
        check: (api) => {
          const s = st(api, 'Pylône A', 'Pylône B');
          if (!s || !s.profile) return { ok: false, msg: 'Faisceau introuvable.' };
          return { ok: true, msg: `Dégagement minimal : ${f(s.profile.minRatio * 100, 0)} % de F1 · diffraction ${f(s.profile.diffractionLossDb)} dB.` };
        },
      },
      {
        title: 'Calculer à la main au point critique',
        html: '<p>Relevez dans l’onglet Profil la distance d1 du point critique. Calculez :</p><ul><li>le rayon de Fresnel r1 = 17,32·√(d1·d2 / (f·d)) ;</li><li>le renflement terrestre h = d1·d2 / (12,74·k) avec k = 4/3.</li></ul><p>Comparez avec le calcul pas à pas affiché.</p>',
        question: 'Pourquoi doit-on ajouter le renflement terrestre à la hauteur du sol ?',
        check: (api) => {
          const s = st(api, 'Pylône A', 'Pylône B');
          if (!s || !s.profile || !s.profile.worst) return { ok: false, msg: '—' };
          const w = s.profile.worst;
          return { ok: true, msg: `d1 = ${f(w.x, 2)} km · r1 = ${f(w.r1)} m · renflement = ${f(w.bulge)} m.` };
        },
      },
      {
        title: 'Dégager 60 % de la zone de Fresnel',
        html: '<p>Augmentez la <b>hauteur des pylônes</b> (15 à 150 m) en <b>tirant la poignée</b> au sommet de chaque pylône sur le canevas, ou avec les curseurs <b>« Ajuster les hauteurs »</b> situés sous le profil : le dégagement se met à jour en direct. Vous pouvez aussi saisir une valeur précise, ou passer par l’onglet Paramètres de chaque pylône. Les antennes fixées au sommet suivent. Atteignez au moins <b>60 %</b> de dégagement.</p>',
        question: 'Quelle perte de diffraction reste-t-il à 60 % de dégagement ? Pourquoi accepte-t-on ce critère ?',
        check: (api) => {
          const s = st(api, 'Pylône A', 'Pylône B');
          const r = s && s.profile ? s.profile.minRatio : -1;
          return { ok: r >= 0.6, msg: `Dégagement actuel : ${f(r * 100, 0)} % (objectif ≥ 60 %).` };
        },
      },
      {
        title: 'Dégager 100 % de la zone de Fresnel',
        html: '<p>Continuez à surélever pour obtenir un dégagement de <b>100 %</b>. Limite : 150 m par pylône.</p>',
        question: 'La colline étant plus proche du site A, vaut-il mieux surélever A ou B ? Essayez une solution dissymétrique et comparez la somme des hauteurs.',
        check: (api) => {
          const s = st(api, 'Pylône A', 'Pylône B');
          const r = s && s.profile ? s.profile.minRatio : -1;
          const hA = Number(api.node('Pylône A').props.heightM);
          const hB = Number(api.node('Pylône B').props.heightM);
          return { ok: r >= 1, msg: `Dégagement ${f(r * 100, 0)} % · pylônes ${hA} m + ${hB} m = ${hA + hB} m de structure.` };
        },
      },
      {
        title: 'Vérifier le bilan de liaison',
        html: '<p>Ouvrez l’onglet <b>Bilan de liaison</b> : la ligne « Perte de diffraction » a disparu et le RSL a augmenté. Notez la marge finale.</p>',
        question: 'De combien de dB le RSL a-t-il progressé entre la situation initiale et la situation finale ?',
        check: (api) => {
          const s = st(api, 'Pylône A', 'Pylône B');
          return { ok: !!s && s.profile.minRatio >= 1 && s.status === 'optimal', msg: s && s.budgets ? `RSL = ${f(s.budgets.ab.rsl)} dBm · marge ${f(fhMargin(s))} dB · ${statusTxt(s)}.` : '—' };
        },
      },
    ],
    conclusion:
      '<p>La visibilité optique ne suffit pas : l’onde occupe un volume (l’ellipsoïde de Fresnel), d’autant plus large que la fréquence est basse et le bond long. Le dimensionnement des pylônes se fait sur le <b>profil en long</b> en tenant compte de la courbure terrestre et de la réfraction (facteur k). Surélever l’extrémité la plus proche de l’obstacle est généralement plus efficace.</p>',
    build() {
      const nodes = [];
      const links = [];
      nodes.push(N('tower', 'Pylône A', 120, 560, { heightM: 30, groundM: 320 }), N('tower', 'Pylône B', 620, 560, { heightM: 30, groundM: 300 }));
      nodes.push(N('obstacle', 'Colline', 345, 565, { kind: 'hill', heightM: 55, widthKm: 3 }));
      fhSite(nodes, links, 'Pylône A', 'A', 120, 560, 'left', { band: '13', txPowerDbm: 24, channelMHz: 28 }, { diameterM: 0.6, heightM: 28 }, { maxMod: '256QAM' });
      fhSite(nodes, links, 'Pylône B', 'B', 620, 560, 'right', { band: '13', txPowerDbm: 24, channelMHz: 28 }, { diameterM: 0.6, heightM: 28 }, { maxMod: '256QAM' });
      links.push(Lk('ANT-A', 'ANT-B'));
      nodes.push(N('server', 'Cœur réseau', 60, 700, { ip: '10.0.0.1' }), N('gnodeb', 'gNodeB B', 690, 700, { ip: '10.0.0.20' }));
      links.push(Lk('IDU-A', 'Cœur réseau'), Lk('IDU-B', 'gNodeB B'));
      return { settings: { scaleKm: 2 }, nodes, links, flows: [Fl('gNodeB B', 'Cœur réseau', 80, 'data', 'Backhaul gNodeB B')] };
    },
  });

  /* =================== TP 3 =================== */
  LABS.push({
    id: 'tp3',
    num: 'TP 3',
    title: 'Pluie tropicale, modulation adaptative (ACM) et XPIC',
    subtitle: 'Lien 15 GHz 256QAM V+H : la liaison s’adapte sans couper jusqu’à 80 mm/h',
    duration: '2 h',
    tags: ['fh', 'ip'],
    mode: 'weather',
    context:
      '<p>Un bond de <b>12 km à 15 GHz</b> transporte le trafic d’une agglomération. Pour doubler la capacité, il fonctionne en <b>double polarisation co-canal (V+H)</b> avec un annuleur <b>XPIC</b>, en <b>256QAM</b> sur un canal de 56 MHz.</p><p>En saison des pluies, les orages dépassent <b>80 mm/h</b>. Grâce à la <b>modulation adaptative (ACM)</b>, la liaison réduit sa modulation (donc son débit) au lieu de couper. La <b>QoS</b> protège la voix lorsque le débit diminue.</p>',
    objectives: [
      'Observer l’effet de la pluie sur le RSL et le rapport signal/bruit.',
      'Comprendre le fonctionnement de l’ACM (paliers de modulation, débit).',
      'Montrer l’intérêt du XPIC en double polarisation sous la pluie.',
      'Vérifier la priorité de la voix (QoS) quand la capacité baisse.',
    ],
    releves: [["Modulation et débit par ciel clair", "— / Mbit/s"], ["À 10 mm/h : modulation / débit", "— / Mbit/s"], ["À 30 mm/h : modulation / débit", "— / Mbit/s"], ["À 50 mm/h : modulation / débit", "— / Mbit/s"], ["À 70 mm/h : modulation / débit", "— / Mbit/s"], ["À 80 mm/h : modulation / débit", "— / Mbit/s"], ["Atténuation de pluie à 80 mm/h", "dB"], ["XPD à 80 mm/h", "dB"], ["Débit acheminé voix / données à 80 mm/h", "Mbit/s"], ["Sans ACM à 80 mm/h : état de la liaison", ""], ["Sans XPIC à 80 mm/h : modulation", ""]],
    steps: [
      {
        title: 'Ciel clair : relever la configuration nominale',
        html: '<p>Sélectionnez le faisceau. Relevez la modulation, le débit (2 polarisations), le RSL et le C/(N+I) dans l’onglet <b>Bilan de liaison</b>. Vérifiez dans l’onglet <b>Réseau</b> que les deux flux passent.</p>',
        question: 'Pourquoi le débit est-il doublé par rapport à une liaison en polarisation simple ?',
        check: (api) => {
          const s = st(api, 'Site Nord', 'Site Sud');
          return { ok: !!s && s.dualPol && s.status === 'optimal', msg: s && s.up ? `${fhMod(s)} · ${f(s.capacityMbps, 0)} Mbit/s · ${s.dualPol ? 'V+H actif' : 'polarisation simple'}.` : 'Liaison coupée.' };
        },
      },
      {
        title: 'Monter progressivement la pluie jusqu’à 80 mm/h',
        html: '<p>Déplacez le curseur de pluie : 10, 30, 50 puis <b>80 mm/h</b>. À chaque palier, notez l’atténuation de pluie, le XPD, la modulation et le débit. Le journal d’événements trace chaque changement de modulation.</p>',
        question: 'Tracez la courbe « débit en fonction de l’intensité de pluie ». La liaison est-elle coupée à 80 mm/h ?',
        check: (api) => {
          const s = st(api, 'Site Nord', 'Site Sud');
          const r = api.rain();
          if (r < 80) return { ok: false, msg: `Pluie : ${r} mm/h (objectif 80 mm/h).` };
          return { ok: s.up, msg: `À ${r} mm/h : A_pluie ${f(s.budgets.ab.rain)} dB · ${fhMod(s)} · ${f(s.capacityMbps, 0)} Mbit/s · ${statusTxt(s)}.` };
        },
      },
      {
        title: 'Observer la QoS : la voix est prioritaire',
        html: '<p>Toujours à 80 mm/h, ouvrez l’onglet <b>Flux de trafic</b> de la console. Le flux de données demande plus que la capacité restante.</p>',
        question: 'Quel flux est dégradé ? Pourquoi la voix (classe EF) n’est-elle pas affectée ?',
        check: (api) => {
          const fl = allFlows(api);
          const v = fl.find((x) => x.cls === 'voice');
          const d = fl.find((x) => x.cls === 'data');
          if (!v || !d) return { ok: false, msg: 'Flux introuvables.' };
          return { ok: v.status === 'ok' && d.status === 'congested', msg: `Voix : ${v.status === 'ok' ? 'intacte' : v.status} · Données : ${f(d.deliveredMbps, 0)}/${f(d.rateMbps, 0)} Mbit/s.` };
        },
      },
      {
        title: 'Sans ACM : modulation fixe 256QAM',
        html: '<p>Toujours à 80 mm/h, sélectionnez <b>IDU-Nord</b> et <b>IDU-Sud</b> et décochez <b>Modulation adaptative (ACM)</b>.</p>',
        question: 'Que se passe-t-il ? Quel serait l’impact pour les abonnés pendant toute la durée de l’orage ?',
        check: (api) => {
          const s = st(api, 'Site Nord', 'Site Sud');
          const noAcm = api.node('IDU-Nord').props.acm === false || api.node('IDU-Sud').props.acm === false;
          return { ok: noAcm && api.rain() >= 60 && !s.up, msg: noAcm ? `Modulation fixe : ${statusTxt(s)}.` : 'Désactivez l’ACM sur une IDU.' };
        },
      },
      {
        title: 'Rôle du XPIC',
        html: '<p>Réactivez l’ACM sur les deux IDU. Puis décochez <b>XPIC</b> sur les deux IDU (les antennes restent en V+H) et comparez la modulation à 80 mm/h, puis à 30 mm/h.</p>',
        question: 'La pluie dépolarise l’onde : expliquez pourquoi le C/I de polarisation croisée s’effondre sans XPIC.',
        check: (api) => {
          const s = st(api, 'Site Nord', 'Site Sud');
          const acm = api.node('IDU-Nord').props.acm !== false && api.node('IDU-Sud').props.acm !== false;
          const noXpic = !api.node('IDU-Nord').props.xpic && !api.node('IDU-Sud').props.xpic;
          return { ok: acm && noXpic, msg: acm && noXpic ? `Sans XPIC à ${api.rain()} mm/h : C/I = ${f(s.budgets.ab.ciXpolDb)} dB · ${fhMod(s)}.` : 'ACM activé et XPIC désactivé sur les deux IDU.' };
        },
      },
      {
        title: 'Simuler un orage complet',
        html: '<p>Réactivez le XPIC. Remettez la pluie à 0 puis cliquez sur <b>Simuler un orage</b> (barre d’outils du canevas). Observez les changements de couleur du faisceau et le journal.</p>',
        question: 'Rédigez une synthèse : ACM + XPIC permettent-ils de garantir la disponibilité du service ? À quel prix ?',
        check: (api) => {
          const ok = api.node('IDU-Nord').props.xpic && api.node('IDU-Sud').props.xpic;
          return { ok, msg: ok ? 'XPIC réactivé. Lancez l’orage et observez le journal.' : 'Réactivez le XPIC sur les deux IDU.' };
        },
      },
    ],
    conclusion:
      '<p>L’ACM échange du <b>débit</b> contre de la <b>robustesse</b> : on dimensionne la liaison pour que la modulation la plus robuste (QPSK) tienne au pire de la pluie, tout en profitant du très haut débit le reste du temps. En double polarisation, le <b>XPIC</b> est indispensable car la pluie dégrade le découplage de polarisation (XPD).</p>',
    build() {
      const nodes = [];
      const links = [];
      nodes.push(N('tower', 'Site Nord', 150, 560, { heightM: 40, groundM: 300 }), N('tower', 'Site Sud', 450, 560, { heightM: 40, groundM: 295 }));
      const odu = { band: '15', txPowerDbm: 26, channelMHz: 56 };
      const ant = { diameterM: 0.9, polarization: 'V+H', heightM: 38 };
      const idu = { maxMod: '256QAM', acm: true, xpic: true };
      nodes.push(N('antenna', 'ANT-Nord', 220, 500, Object.assign({ siteId: 'Site Nord' }, ant)), N('odu', 'ODU-Nord', 220, 420, Object.assign({ siteId: 'Site Nord' }, odu)), N('idu', 'IDU-Nord', 55, 530, idu));
      nodes.push(N('antenna', 'ANT-Sud', 380, 500, Object.assign({ siteId: 'Site Sud' }, ant)), N('odu', 'ODU-Sud', 380, 420, Object.assign({ siteId: 'Site Sud' }, odu)), N('idu', 'IDU-Sud', 545, 530, Object.assign({}, idu)));
      links.push(Lk('ANT-Nord', 'ODU-Nord'), Lk('ODU-Nord', 'IDU-Nord'), Lk('ANT-Sud', 'ODU-Sud'), Lk('ODU-Sud', 'IDU-Sud'), Lk('ANT-Nord', 'ANT-Sud'));
      nodes.push(N('router', 'Routeur agrégation', 80, 700, { loopback: '10.255.0.1' }), N('internet', 'Cœur / Internet', 80, 830, { ip: '10.10.0.1' }), N('gnodeb', 'gNodeB Ville', 520, 700, { ip: '10.30.0.10' }));
      links.push(Lk('IDU-Nord', 'Routeur agrégation', { capacityMbps: 10000 }, 'fiber'), Lk('Routeur agrégation', 'Cœur / Internet', { capacityMbps: 10000 }, 'fiber'), Lk('IDU-Sud', 'gNodeB Ville', { capacityMbps: 10000 }, 'fiber'));
      return {
        settings: { scaleKm: 2, rainMmH: 0 },
        nodes,
        links,
        flows: [Fl('gNodeB Ville', 'Cœur / Internet', 60, 'voice', 'Voix (VoLTE)'), Fl('gNodeB Ville', 'Cœur / Internet', 520, 'data', 'Données mobiles')],
      };
    },
  });

  /* =================== TP 4 =================== */
  LABS.push({
    id: 'tp4',
    
    num: 'TP 4',
    title: 'Boucle Locale Radio urbaine avec VLAN',
    subtitle: 'Raccorder 3 entreprises à une BTS 3,5 GHz et isoler leur trafic (VLAN 100/200/300)',
    duration: '2 h',
    tags: ['blr', 'ip'],
    mode: 'design',
    context:
      '<p>Un fournisseur d’accès déploie une <b>BLR point-à-multipoint à 3,5 GHz</b> (LTE-TDD / 5G FWA, petite cellule de 23 dBm) depuis le toit de la <b>Tour Centre</b>. Trois entreprises (A, B, C) sont équipées d’un <b>CPE outdoor</b> sur leur immeuble, entre 2 et 4,5 km.</p><p>Chaque entreprise doit joindre <b>uniquement son siège</b> (serveur sur le réseau de l’opérateur) : le trafic est séparé par des <b>VLAN 802.1Q</b> — 100 pour A, 200 pour B, 300 pour C. Le CPE tague le trafic du client sur son port d’accès.</p>',
    objectives: [
      'Comprendre l’architecture point-à-multipoint (secteur, CPE, partage de capacité).',
      'Orienter un secteur pour couvrir tous les abonnés.',
      'Configurer des VLAN d’accès sur les CPE et vérifier l’isolation du trafic.',
      'Restreindre les VLAN autorisés sur un trunk.',
    ],
    releves: [["Écart au secteur : CPE A / B / C", "°"], ["État initial de la liaison du CPE C", ""], ["Azimut retenu pour le secteur", "°"], ["Ouverture retenue pour le secteur", "°"], ["Gain du secteur retenu", "dBi"], ["Débit par abonné descendant / montant", "Mbit/s"], ["VLAN d’accès : CPE A / B / C", ""], ["Résultat du ping PC Ent. A → Siège B", ""], ["VLAN autorisés sur le trunk", ""]],
    steps: [
      {
        title: 'Analyser la couverture radio',
        html: '<p>Le secteur de la BTS (en vert pointillé) est orienté plein Sud (180°) avec une ouverture de 90°. Sélectionnez chaque liaison BLR et consultez le bilan (onglet Bilan de liaison, sens descendant et montant).</p>',
        question: 'Quel CPE est mal desservi ? Pourquoi ? (regardez « Écart au secteur »)',
        check: (api) => {
          const ls = api.links('blr');
          const msg = ls.map((l) => `${l.state.cpe ? l.state.cpe.name : '?'} : ${l.state.status === 'optimal' ? 'OK' : l.state.status === 'degraded' ? 'dégradé' : 'coupé'} (écart ${f(l.state.offAxisDeg || 0, 0)}°)`).join(' · ');
          return { ok: true, msg };
        },
      },
      {
        title: 'Orienter le secteur pour couvrir les trois entreprises',
        html: '<p>Sélectionnez la <b>BTS BLR</b> et modifiez l’<b>azimut</b> et/ou l’<b>ouverture du secteur</b> (90° ou 120°) pour que les trois CPE soient dans le secteur et en modulation optimale.</p>',
        question: 'Un secteur plus large couvre plus d’abonnés : quel est l’inconvénient sur le gain d’antenne ?',
        check: (api) => {
          const ls = api.links('blr');
          const ok = ls.length === 3 && ls.every((l) => l.state.up && Math.abs(l.state.offAxisDeg) <= Number(l.state.bts.props.sectorDeg) / 2);
          return { ok, msg: ok ? 'Les 3 CPE sont dans le secteur ✔' : 'Au moins un CPE est encore hors secteur ou coupé.' };
        },
      },
      {
        title: 'Constater l’absence de service (VLAN non configurés)',
        html: '<p>Ouvrez l’onglet <b>Flux de trafic</b> de la console : les flux vers les sièges échouent. Lisez la cause indiquée.</p>',
        question: 'Les sièges sont dans les VLAN 100, 200, 300 mais les PC ne taguent pas leurs trames. Où faut-il configurer le VLAN ?',
        check: (api) => {
          const fl = allFlows(api);
          return { ok: true, msg: fl.map((x) => `${x.name} : ${x.status === 'ok' ? 'OK' : 'échec'}`).join(' · ') };
        },
      },
      {
        title: 'Configurer les VLAN d’accès sur les CPE',
        html: '<p>Sélectionnez chaque CPE et réglez le <b>VLAN d’accès</b> : CPE Ent. A = <b>100</b>, CPE Ent. B = <b>200</b>, CPE Ent. C = <b>300</b>. Observez les paquets animés : leur couleur et leur étiquette indiquent le VLAN.</p>',
        question: 'Dessinez la trame Ethernet entre la BTS et le switch pour l’entreprise B (position et contenu du tag 802.1Q).',
        check: (api) => {
          const v = ['CPE Ent. A', 'CPE Ent. B', 'CPE Ent. C'].map((n) => Number(api.node(n).props.accessVlan));
          const fl = allFlows(api);
          const ok = v[0] === 100 && v[1] === 200 && v[2] === 300 && fl.every((x) => x.status === 'ok');
          return { ok, msg: `VLAN : ${v.join(' / ')} · flux OK : ${fl.filter((x) => x.status === 'ok').length}/${fl.length}.` };
        },
      },
      {
        title: 'Vérifier l’isolation entre clients',
        html: '<p>Avec l’outil <b>Ping</b> (touche P), cliquez sur <b>PC Ent. A</b> puis sur <b>Siège B</b>. Lisez la réponse dans la console.</p>',
        question: 'Pourquoi l’entreprise A ne peut-elle pas joindre le siège de B ? Cette isolation est-elle souhaitable ?',
        check: (api) => {
          const p = api.lastPing();
          const a = api.node('PC Ent. A');
          const b = api.node('Siège B');
          if (!p || p.src !== a.id || p.dst !== b.id) return { ok: false, msg: 'Faites un ping de PC Ent. A vers Siège B.' };
          return { ok: !p.success, msg: p.success ? 'Le ping a réussi : l’isolation n’est pas assurée !' : 'Ping échoué : isolation VLAN vérifiée ✔' };
        },
      },
      {
        title: 'Sécuriser le trunk du switch',
        html: '<p>Sélectionnez le <b>Switch agrégation</b> et limitez les VLAN autorisés à <code>100,200,300</code>. Vérifiez que tous les flux restent OK. Testez ensuite en retirant le VLAN 300 de la liste.</p>',
        question: 'Pourquoi n’autorise-t-on que les VLAN nécessaires sur un trunk ?',
        check: (api) => {
          const v = String(api.node('Switch agrégation').props.vlans || '').replace(/\s/g, '');
          const fl = allFlows(api);
          return { ok: v === '100,200,300' && fl.every((x) => x.status === 'ok'), msg: `VLAN autorisés : « ${v || 'all'} » · flux OK ${fl.filter((x) => x.status === 'ok').length}/${fl.length}.` };
        },
      },
    ],
    conclusion:
      '<p>La BLR mutualise un secteur radio entre plusieurs abonnés : la capacité est partagée (et répartie entre voie descendante et montante en TDD). Les <b>VLAN 802.1Q</b> permettent de transporter sur la même infrastructure des clients totalement isolés au niveau 2 ; seul un routeur configuré pour cela pourrait les faire communiquer.</p>',
    build() {
      const nodes = [
        N('building', 'Tour Centre', 500, 420, { floors: 15, groundM: 300 }),
        N('blrBts', 'BTS BLR', 560, 380, { siteId: 'Tour Centre', band: '3.5', channelMHz: 20, txPowerDbm: 23, sectorDeg: 90, azimuthDeg: 180, heightM: 51, maxMod: '256QAM 5/6' }),
        N('building', 'Immeuble A', 418, 646, { floors: 5, groundM: 302 }),
        N('building', 'Immeuble B', 596, 683, { floors: 5, groundM: 298 }),
        N('building', 'Immeuble C', 943, 498, { floors: 4, groundM: 300 }),
        N('blrCpe', 'CPE Ent. A', 360, 620, { siteId: 'Immeuble A', heightM: 21, accessVlan: 0 }),
        N('blrCpe', 'CPE Ent. B', 660, 650, { siteId: 'Immeuble B', heightM: 21, accessVlan: 0 }),
        N('blrCpe', 'CPE Ent. C', 900, 440, { siteId: 'Immeuble C', heightM: 18, accessVlan: 0 }),
        N('pc', 'PC Ent. A', 340, 740, { ip: '10.1.100.10', prefix: 24, gateway: '10.1.100.1' }),
        N('pc', 'PC Ent. B', 680, 780, { ip: '10.1.200.10', prefix: 24, gateway: '10.1.200.1' }),
        N('pc', 'PC Ent. C', 1010, 590, { ip: '10.1.30.10', prefix: 24, gateway: '10.1.30.1' }),
        N('switch', 'Switch agrégation', 320, 400, { vlans: 'all' }),
        N('server', 'Siège A', 160, 330, { ip: '10.1.100.1', prefix: 24, vlan: 100 }),
        N('server', 'Siège B', 160, 430, { ip: '10.1.200.1', prefix: 24, vlan: 200 }),
        N('server', 'Siège C', 160, 530, { ip: '10.1.30.1', prefix: 24, vlan: 300 }),
      ];
      const links = [
        Lk('BTS BLR', 'CPE Ent. A'),
        Lk('BTS BLR', 'CPE Ent. B'),
        Lk('BTS BLR', 'CPE Ent. C'),
        Lk('CPE Ent. A', 'PC Ent. A'),
        Lk('CPE Ent. B', 'PC Ent. B'),
        Lk('CPE Ent. C', 'PC Ent. C'),
        Lk('BTS BLR', 'Switch agrégation', { capacityMbps: 1000 }, 'fiber'),
        Lk('Switch agrégation', 'Siège A'),
        Lk('Switch agrégation', 'Siège B'),
        Lk('Switch agrégation', 'Siège C'),
      ];
      return {
        settings: { scaleKm: 0.5 },
        nodes,
        links,
        flows: [Fl('PC Ent. A', 'Siège A', 8, 'data', 'Ent. A → Siège A'), Fl('PC Ent. B', 'Siège B', 8, 'data', 'Ent. B → Siège B'), Fl('PC Ent. C', 'Siège C', 4, 'voice', 'Ent. C → Siège C (VoIP)')],
      };
    },
  });

  /* =================== TP 5 =================== */
  LABS.push({
    id: 'tp5',
    
    num: 'TP 5',
    title: 'Liaison VSAT d’un site minier isolé (GEO vs LEO)',
    subtitle: 'Pointage, Eb/N0, latence ~550 ms, orage en Ka vs C, bascule LEO',
    duration: '3 h',
    tags: ['vsat', 'ip'],
    mode: 'design',
    context:
      '<p>Un <b>site minier</b> au nord du Burkina Faso (14,20° N ; 0,40° O) n’a ni fibre ni couverture hertzienne. Il est raccordé au <b>téléport de Ouagadougou</b> (12,37° N ; 1,53° O) par un satellite <b>géostationnaire en bande Ku</b> positionné à <b>7° Est</b>.</p><p>La station distante comprend une parabole de <b>1,8 m</b>, un <b>BUC de 4 W</b>, un <b>LNB</b> et un <b>modem DVB-S2X</b>. Le technicien doit d’abord <b>pointer l’antenne</b> (azimut, élévation, skew) avant de mettre en service la liaison.</p>',
    objectives: [
      'Calculer et régler l’azimut, l’élévation et le skew d’une antenne VSAT.',
      'Lire un bilan satellite : PIRE, G/T, C/N0, Eb/N0, MODCOD.',
      'Mesurer la latence d’un satellite GEO et l’expliquer.',
      'Comparer les bandes C, Ku, Ka face à un orage et les orbites GEO / LEO.',
    ],
    releves: [["Azimut calculé", "°"], ["Élévation calculée", "°"], ["Skew calculé", "°"], ["Pertes de pointage initiales (montant)", "dB"], ["PIRE de la station VSAT", "dBW"], ["G/T de la station VSAT", "dB/K"], ["Eb/N0 aller / MODCOD", "dB / —"], ["Eb/N0 retour / MODCOD", "dB / —"], ["RTT mesuré (GEO)", "ms"], ["Atténuation de pluie en Ka à 50 mm/h (descendant / montant)", "dB"], ["État de la liaison en bande C à 50 mm/h", ""], ["RTT mesuré (LEO)", "ms"]],
    steps: [
      {
        title: 'Pointer l’antenne VSAT',
        html: '<p>L’antenne est réglée « à l’œil » (Az 150°, El 70°, skew 0°). Sélectionnez la liaison <b>satellite ↔ Antenne VSAT Mine</b> et ouvrez <b>Profil &amp; Fresnel</b> : la boussole compare le pointage calculé (vert) et réglé (orange).</p><p>Calculez vous-même l’azimut, l’élévation et le skew (formules dans l’onglet), puis saisissez-les dans les paramètres de <b>Antenne VSAT Mine</b>.</p>',
        question: 'Quelle perte provoque une erreur de 1° pour une antenne de 1,8 m en bande Ku (θ3dB ≈ 0,8°) ?',
        check: (api) => {
          const l = api.link('GEO 7°E', 'Antenne VSAT Mine');
          const s = l && l.state;
          if (!s || !s.errors) return { ok: false, msg: 'Liaison introuvable.' };
          const e = s.errors;
          const ok = Math.abs(e.azErr) <= 0.3 && Math.abs(e.elErr) <= 0.3 && Math.abs(e.skewErr) <= 3;
          return { ok, msg: `Écarts : Az ${f(e.azErr)}° · El ${f(e.elErr)}° · skew ${f(e.skewErr)}° → pertes ${f(s.result.pointing.lossUpDb)} dB (montant).` };
        },
      },
      {
        title: 'Relever le bilan de liaison',
        html: '<p>Onglet <b>Bilan de liaison</b> : relevez la PIRE de la station VSAT, son G/T, l’Eb/N0 et le MODCOD de la voie <b>aller</b> puis de la voie <b>retour</b>.</p>',
        question: 'Pourquoi la voie retour (VSAT → Hub) a-t-elle un débit bien plus faible que la voie aller ?',
        check: (api) => {
          const s = api.link('GEO 7°E', 'Antenne VSAT Mine').state;
          if (!s.result) return { ok: false, msg: '—' };
          const r = s.result;
          return { ok: s.up, msg: `PIRE ${f(r.remoteRf.eirp)} dBW · G/T ${f(r.remoteGt.gt)} dB/K · Eb/N0 aller ${f(r.forward.ebn0)} dB / retour ${f(r.ret.ebn0)} dB.` };
        },
      },
      {
        title: 'Mesurer la latence GEO',
        html: '<p>Outil <b>Ping</b> (P) : cliquez sur <b>Site minier</b> puis sur <b>Internet</b>. Lisez le temps de réponse et le traceroute.</p>',
        question: 'Calculez le temps de propagation : 4 × 36 000 km / 300 000 km/s. Comparez avec le RTT mesuré. Quelles applications sont gênées ?',
        check: (api) => {
          const p = api.lastPing();
          const ok = p && p.success && p.rttMs > 480;
          return { ok: !!ok, msg: p ? (p.success ? `RTT mesuré : ${f(p.rttMs, 0)} ms.` : 'Ping échoué : vérifiez le pointage.') : 'Faites un ping Site minier → Internet.' };
        },
      },
      {
        title: 'Orage : bande Ku, puis Ka',
        html: '<p>Passez en mode <b>Météo</b> et réglez la pluie à <b>50 mm/h</b> sur le site. Observez la liaison en Ku. Sélectionnez ensuite le satellite et passez en <b>bande Ka</b>.</p>',
        question: 'Que vaut l’atténuation en Ka (montant 30 GHz / descendant 20 GHz) ? Pourquoi les opérateurs Ka prévoient-ils des marges et de l’ACM importants ?',
        check: (api) => {
          const sat = api.node('GEO 7°E');
          const s = api.link('GEO 7°E', 'Antenne VSAT Mine').state;
          if (api.rain() < 50) return { ok: false, msg: `Pluie : ${api.rain()} mm/h (objectif 50).` };
          if (sat.props.band !== 'Ka') return { ok: false, msg: 'Passez le satellite en bande Ka.' };
          return { ok: !s.up, msg: `Bande Ka à ${api.rain()} mm/h : ${statusTxt(s)}${s.result ? ` (pluie −${f(s.result.rain.remoteDown)} / −${f(s.result.rain.remoteUp)} dB)` : ''}.` };
        },
      },
      {
        title: 'Orage : bande C',
        html: '<p>Gardez 50 mm/h et passez le satellite en <b>bande C</b>.</p>',
        question: 'Pourquoi la bande C est-elle privilégiée en Afrique tropicale pour les liaisons critiques ? Quel est son inconvénient (taille d’antenne) ?',
        check: (api) => {
          const sat = api.node('GEO 7°E');
          const s = api.link('GEO 7°E', 'Antenne VSAT Mine').state;
          return { ok: sat.props.band === 'C' && api.rain() >= 50 && s.up, msg: `Bande ${sat.props.band} à ${api.rain()} mm/h : ${statusTxt(s)}.` };
        },
      },
      {
        title: 'Comparer avec une constellation LEO',
        html: '<p>Remettez la pluie à 0 et la bande Ku. Sélectionnez le satellite et choisissez l’orbite <b>LEO</b> (550 km). Refaites un ping Site minier → Internet.</p>',
        question: 'Quel est le nouveau RTT ? Pourquoi une constellation de centaines de satellites est-elle nécessaire en LEO ?',
        check: (api) => {
          const sat = api.node('GEO 7°E');
          const p = api.lastPing();
          const ok = sat.props.orbit === 'LEO' && p && p.success && p.rttMs < 60;
          return { ok: !!ok, msg: sat.props.orbit !== 'LEO' ? 'Passez le satellite en orbite LEO.' : p && p.success ? `RTT : ${f(p.rttMs, 0)} ms.` : 'Refaites le ping.' };
        },
      },
    ],
    conclusion:
      '<p>Le satellite GEO apporte une couverture immédiate des zones isolées mais impose une <b>latence d’environ 550 ms</b>. La bande <b>C</b> résiste aux pluies tropicales (au prix de grandes antennes), la bande <b>Ka</b> offre un très haut débit mais s’effondre sous l’orage. Les constellations <b>LEO</b> divisent la latence par 20, avec des terminaux à poursuite électronique.</p>',
    build() {
      const nodes = [
        N('satellite', 'GEO 7°E', 470, 60, { orbit: 'GEO', band: 'Ku', lonDeg: 7, elevationDeg: 60 }),
        N('hub', 'Téléport Ouaga', 220, 560, { coordMode: 'manual', lat: 12.37, lon: -1.53, dishM: 7.3, hpaW: 200, lnbNfDb: 0.6 }),
        N('router', 'Routeur cœur', 120, 690, { loopback: '10.255.0.1' }),
        N('internet', 'Internet', 120, 830, { ip: '10.10.0.1', prefix: 24 }),
        N('vsatAntenna', 'Antenne VSAT Mine', 720, 540, { coordMode: 'manual', lat: 14.2, lon: -0.4, dishM: 1.8, groundM: 280, autoPoint: false, azimuthDeg: 150, elevationDeg: 70, skewDeg: 0 }),
        N('buc', 'BUC 4 W', 660, 640, { powerW: 4 }),
        N('lnb', 'LNB', 780, 640, { nfDb: 0.8 }),
        N('vsatModem', 'Modem VSAT', 720, 740, { retSymbolRate: 2, retMaxModcod: '8PSK 3/4' }),
        N('ruralSite', 'Site minier', 860, 830, { ip: '10.20.0.10', prefix: 24, gateway: '10.20.0.1' }),
      ];
      const links = [
        Lk('GEO 7°E', 'Téléport Ouaga'),
        Lk('GEO 7°E', 'Antenne VSAT Mine'),
        Lk('Antenne VSAT Mine', 'BUC 4 W'),
        Lk('Antenne VSAT Mine', 'LNB'),
        Lk('BUC 4 W', 'Modem VSAT'),
        Lk('LNB', 'Modem VSAT'),
        Lk('Modem VSAT', 'Site minier'),
        Lk('Téléport Ouaga', 'Routeur cœur', { capacityMbps: 10000 }, 'fiber'),
        Lk('Routeur cœur', 'Internet', { capacityMbps: 10000 }, 'fiber'),
      ];
      return { settings: { scaleKm: 2, rainMmH: 0 }, nodes, links, flows: [Fl('Site minier', 'Internet', 2, 'data', 'Données exploitation'), Fl('Site minier', 'Internet', 0.2, 'voice', 'Téléphonie IP')] };
    },
  });

  /* =================== TP 6 =================== */
  LABS.push({
    id: 'tp6',
    num: 'TP 6',
    title: 'Anneau hertzien IP/MPLS avec secours satellitaire VSAT',
    subtitle: 'Résilience : Fast Reroute MPLS puis bascule sur le lien VSAT de secours',
    duration: '3 h',
    tags: ['fh', 'ip', 'vsat'],
    mode: 'diag',
    context:
      '<p>Quatre villes sont reliées par un <b>anneau de faisceaux hertziens</b> (radios Full-Outdoor 11 GHz) portant un réseau <b>IP/MPLS</b>. L’<b>hôpital régional</b>, site critique, est raccordé à Ville Est par un bond FH en antenne (« spur »), et dispose d’un <b>lien VSAT de secours</b> vers le téléport de Ville Nord, marqué comme <i>backup</i> (coût de routage élevé).</p><p>Vous êtes en mode <b>Diagnostic / Pannes</b> : l’outil <b>Panne</b> (touche C) coupe un lien ou met un équipement en panne.</p>',
    objectives: [
      'Identifier les chemins MPLS (LSP) et les opérations sur les labels.',
      'Simuler la coupure d’un bond de l’anneau et observer le re-routage (FRR).',
      'Simuler l’isolement du site critique et la bascule sur le secours VSAT.',
      'Analyser l’impact sur la latence et sur la QoS (voix prioritaire).',
    ],
    releves: [["Chemin nominal Hôpital → Internet", ""], ["Opérations MPLS (PUSH / SWAP / POP)", ""], ["RTT nominal", "ms"], ["Chemin après coupure Ville Nord ↔ Ville Est", ""], ["RTT après coupure", "ms"], ["RTT via le secours VSAT", "ms"], ["Débit des données via le VSAT", "Mbit/s"], ["Mécanisme et temps de bascule (FRR / secours)", ""]],
    steps: [
      {
        title: 'État nominal : chemins et labels MPLS',
        html: '<p>Ouvrez l’onglet <b>Réseau</b> de l’inspecteur et cliquez sur le flux <b>Hôpital → Internet (voix)</b>. Relevez le chemin, les opérations MPLS (PUSH / SWAP / POP) et la pile d’en-têtes sur chaque tronçon.</p>',
        question: 'Quel routeur ajoute le label ? Lequel le retire (PHP) ? Pourquoi les routeurs P n’apparaissent-ils pas dans un traceroute ?',
        check: (api) => {
          const fl = allFlows(api);
          const ok = fl.length && fl.every((x) => x.status === 'ok' && !x.usesBackup);
          return { ok: !!ok, msg: `${fl.filter((x) => x.status === 'ok').length}/${fl.length} flux OK, ${fl.filter((x) => x.usesBackup).length} via le secours.` };
        },
      },
      {
        title: 'Couper un bond de l’anneau',
        html: '<p>Avec l’outil <b>Panne</b>, coupez le faisceau <b>Ville Nord ↔ Ville Est</b>. Lisez le journal d’événements : mécanisme de protection et temps de bascule.</p>',
        question: 'Par quel chemin passe maintenant le trafic de l’hôpital ? Combien de temps dure l’interruption avec MPLS Fast Reroute ?',
        check: (api) => {
          const l = api.link('Pylône Nord', 'Pylône Est');
          const fl = allFlows(api);
          const ok = l && l.props.cut && fl.every((x) => x.status === 'ok' && !x.usesBackup);
          return { ok: !!ok, msg: l && l.props.cut ? `Bond coupé · flux OK ${fl.filter((x) => x.status === 'ok').length}/${fl.length} (via l’anneau).` : 'Coupez le bond Ville Nord ↔ Ville Est.' };
        },
      },
      {
        title: 'Isoler le site critique : bascule VSAT',
        html: '<p>Coupez maintenant le bond <b>Ville Est ↔ Hôpital</b>. L’hôpital n’a plus de chemin terrestre : le routage bascule sur le <b>lien VSAT de secours</b>.</p>',
        question: 'Comparez le RTT avant / après. Quel flux est dégradé et pourquoi la voix reste-t-elle intacte ?',
        check: (api) => {
          const v = allFlows(api).find((x) => x.name === 'Hôpital → Internet (voix)');
          if (!v) return { ok: false, msg: '—' };
          return { ok: v.status === 'ok' && v.usesBackup, msg: v.usesBackup ? `Voix via VSAT : RTT ${f(v.rttMs, 0)} ms, ${v.status === 'ok' ? 'intacte' : v.status}.` : 'Coupez le bond Ville Est ↔ Hôpital.' };
        },
      },
      {
        title: 'Panne d’équipement',
        html: '<p>Rétablissez le bond Ville Est ↔ Hôpital (re-cliquez avec l’outil Panne). Puis cliquez sur le <b>routeur R-Est</b> pour simuler sa panne.</p>',
        question: 'Le secours VSAT prend-il le relais ? Quelle est la différence entre la panne d’un lien et celle d’un nœud ?',
        check: (api) => {
          const r = api.node('R-Est');
          const v = allFlows(api).find((x) => x.name === 'Hôpital → Internet (voix)');
          return { ok: !!r.props.failed && v && v.status === 'ok', msg: r.props.failed ? `R-Est en panne · voix hôpital : ${v ? (v.usesBackup ? 'via VSAT' : 'terrestre') + ', ' + v.status : '—'}.` : 'Mettez R-Est en panne avec l’outil Panne.' };
        },
      },
      {
        title: 'Retour à la normale',
        html: '<p>Réparez R-Est et rétablissez tous les liens. Vérifiez dans le journal que le trafic revient sur l’anneau hertzien (le lien de secours est libéré).</p>',
        question: 'Proposez une amélioration pour que l’hôpital reste raccordé par voie terrestre même si R-Est tombe en panne.',
        check: (api) => {
          const cut = api.links().some((l) => l.props.cut);
          const failed = api.nodes().some((n) => n.props.failed);
          const fl = allFlows(api);
          const ok = !cut && !failed && fl.every((x) => x.status === 'ok' && !x.usesBackup);
          return { ok, msg: ok ? 'Réseau nominal rétabli ✔' : 'Il reste des liens coupés, des équipements en panne ou du trafic sur le secours.' };
        },
      },
    ],
    conclusion:
      '<p>Un anneau offre deux chemins vers chaque site : la coupure d’un bond est absorbée en quelques dizaines de millisecondes (MPLS FRR, ou ERPS G.8032 pour un anneau Ethernet). Un site en antenne (spur) reste un point de fragilité : un <b>secours satellite</b> garantit la continuité, avec une latence élevée et un débit limité — la <b>QoS</b> doit alors protéger les services critiques.</p>',
    build() {
      const nodes = [];
      const links = [];
      const cities = [
        { key: 'Nord', x: 450, y: 360 },
        { key: 'Est', x: 700, y: 547 },
        { key: 'Sud', x: 450, y: 734 },
        { key: 'Ouest', x: 200, y: 547 },
      ];
      const fo = { band: '11', txPowerDbm: 27, channelMHz: 56, diameterM: 0.9, polarization: 'V', maxMod: '256QAM', heightM: 48 };
      for (const c of cities) {
        nodes.push(N('tower', 'Pylône ' + c.key, c.x, c.y, { heightM: 50, groundM: 300 }));
        nodes.push(N('router', 'R-' + c.key, c.x + 80, c.y + 60, { mpls: true, frr: true, loopback: '10.255.0.' + (cities.indexOf(c) + 1) }));
      }
      const hop = (a, b) => {
        const na = 'FO ' + a.key + '→' + b.key;
        const nb = 'FO ' + b.key + '→' + a.key;
        const ox = (b.x - a.x) * 0.22;
        const oy = (b.y - a.y) * 0.22;
        nodes.push(N('fullOutdoor', na, a.x + ox, a.y + oy, Object.assign({ siteId: 'Pylône ' + a.key }, fo)));
        nodes.push(N('fullOutdoor', nb, b.x - ox, b.y - oy, Object.assign({ siteId: 'Pylône ' + b.key }, fo)));
        links.push(Lk(na, nb), Lk(na, 'R-' + a.key), Lk(nb, 'R-' + b.key));
      };
      hop(cities[0], cities[1]);
      hop(cities[1], cities[2]);
      hop(cities[2], cities[3]);
      hop(cities[3], cities[0]);
      // Site critique en antenne sur Ville Est
      const H = { key: 'Hôpital', x: 1030, y: 640 };
      nodes.push(N('tower', 'Pylône Hôpital', H.x, H.y, { heightM: 40, groundM: 305 }));
      nodes.push(N('router', 'R-Hôpital', H.x + 40, H.y + 110, { mpls: true, frr: true, loopback: '10.255.0.9' }));
      hop(cities[1], H);
      nodes.push(N('ruralSite', 'Hôpital régional', H.x + 140, H.y + 190, { ip: '10.50.0.10', prefix: 24, gateway: '10.50.0.1' }));
      links.push(Lk('R-Hôpital', 'Hôpital régional'));
      // Secours VSAT
      nodes.push(N('satellite', 'Satellite GEO', 880, 60, { orbit: 'GEO', band: 'Ku', lonDeg: 7 }));
      nodes.push(N('vsatAntenna', 'VSAT Hôpital', 1190, 560, { dishM: 1.8, autoPoint: true }));
      nodes.push(N('buc', 'BUC Hôpital', 1140, 670, { powerW: 8 }), N('lnb', 'LNB Hôpital', 1240, 670, { nfDb: 0.8 }), N('vsatModem', 'Modem Hôpital', 1190, 770, { retSymbolRate: 2 }));
      links.push(
        Lk('VSAT Hôpital', 'BUC Hôpital'),
        Lk('VSAT Hôpital', 'LNB Hôpital'),
        Lk('BUC Hôpital', 'Modem Hôpital'),
        Lk('LNB Hôpital', 'Modem Hôpital'),
        Lk('Modem Hôpital', 'R-Hôpital', { backup: true, name: 'Secours VSAT (LAN)' }),
        Lk('Satellite GEO', 'VSAT Hôpital', { backup: true }),
        Lk('Satellite GEO', 'Téléport Nord', { backup: true })
      );
      nodes.push(N('hub', 'Téléport Nord', 640, 330, { dishM: 7.3, hpaW: 200 }));
      links.push(Lk('Téléport Nord', 'R-Nord', { backup: true }));
      // Cœur et terminaux
      nodes.push(N('internet', 'Internet', 320, 330, { ip: '10.10.0.1', prefix: 24 }));
      links.push(Lk('R-Nord', 'Internet', { capacityMbps: 10000 }, 'fiber'));
      nodes.push(N('gnodeb', 'gNodeB Sud', 580, 850, { ip: '10.30.0.10', prefix: 24 }));
      links.push(Lk('R-Sud', 'gNodeB Sud'));
      return {
        settings: { scaleKm: 4, rainMmH: 0 },
        nodes,
        links,
        flows: [
          Fl('Hôpital régional', 'Internet', 1, 'voice', 'Hôpital → Internet (voix)'),
          Fl('Hôpital régional', 'Internet', 15, 'data', 'Hôpital → Internet (données)'),
          Fl('gNodeB Sud', 'Internet', 150, 'data', 'gNodeB Sud → Internet'),
        ],
      };
    },
  });

  /* =================== TP 7 =================== */
  LABS.push({
    id: 'tp7',
    
    num: 'TP 7',
    title: 'Faisceau E-Band 80 GHz en ville, secours 23 GHz',
    subtitle: 'Très haut débit sur 2 km, canaux larges, effondrement sous l’orage, bascule multibande',
    duration: '2 h',
    tags: ['fh', 'ip'],
    mode: 'design',
    context:
      '<p>Un opérateur raccorde le <b>campus universitaire</b> (gNodeB 5G) à son cœur de réseau, situé sur la <b>Tour Opérateur</b> à <b>2 km</b>. Il faut plusieurs <b>Gbit/s</b> : seule la bande <b>E-Band (71–86 GHz)</b> offre des canaux assez larges (jusqu’à 2 GHz).</p><p>Problème : à 80 GHz, la pluie tropicale atténue très fortement l’onde. L’opérateur a donc installé en parallèle un faisceau <b>23 GHz</b> marqué comme <b>lien de secours</b> (backup) : c’est une liaison <b>multibande</b>.</p>',
    objectives: [
      'Mesurer le débit d’un faisceau E-Band et l’effet de la largeur de canal.',
      'Comparer l’atténuation par la pluie à 80 GHz et à 23 GHz.',
      'Observer la bascule automatique du trafic sur le lien de secours.',
      'Justifier l’architecture multibande (E-Band + bande basse).',
    ],
    releves: [["Débit E-Band, canal 500 MHz", "Gbit/s"], ["Marge, canal 500 MHz", "dB"], ["Débit E-Band, canal 2000 MHz", "Gbit/s"], ["Marge, canal 2000 MHz", "dB"], ["Atténuation de pluie à 30 mm/h : 80 GHz / 23 GHz", "dB"], ["Modulation E-Band à 30 mm/h", ""], ["État E-Band à 80 mm/h", ""], ["Débit des données via le 23 GHz", "Mbit/s"], ["E-Band 0,6 m / 500 MHz à 80 mm/h : modulation / débit", "— / Mbit/s"]],
    steps: [
      {
        title: 'Relever les performances du faisceau E-Band',
        html: '<p>Sélectionnez le faisceau <b>80 GHz</b> (entre FO-80 A et FO-80 B). Dans l’onglet <b>Bilan de liaison</b>, relevez la largeur de canal, la modulation, le débit, le RSL et la marge.</p>',
        question: 'Comparez la largeur de canal utilisée (500 MHz) à celle d’un faisceau classique à 18 GHz (28 ou 56 MHz). Pourquoi l’E-Band permet-il des débits de plusieurs Gbit/s ?',
        check: (api) => {
          const s = st(api, 'FO-80 A', 'FO-80 B');
          if (!s || !s.budgets) return { ok: false, msg: 'Faisceau E-Band introuvable.' };
          return { ok: s.up, msg: `Canal ${s.channelMHz} MHz · ${fhMod(s)} · ${f(s.capacityMbps / 1000, 2)} Gbit/s · marge ${f(fhMargin(s))} dB.` };
        },
      },
      {
        title: 'Élargir le canal à 2 000 MHz',
        html: '<p>Sélectionnez <b>FO-80 A</b> et <b>FO-80 B</b> et réglez la <b>largeur de canal</b> sur <b>2000 MHz</b> (identique aux deux extrémités). Comparez le débit et la marge avec l’étape précédente.</p>',
        question: 'Le débit a été multiplié par combien ? Pourquoi la marge a-t-elle diminué d’environ 6 dB (pensez au bruit thermique N = −174 + 10·log(B) + NF) ?',
        check: (api) => {
          const s = st(api, 'FO-80 A', 'FO-80 B');
          const ok = ['FO-80 A', 'FO-80 B'].every((n) => Number(api.node(n).props.channelMHz) === 2000);
          return { ok: ok && s.up, msg: ok ? `2000 MHz : ${fhMod(s)} · ${f(s.capacityMbps / 1000, 2)} Gbit/s · marge ${f(fhMargin(s))} dB.` : 'Réglez les deux FO-80 sur 2000 MHz.' };
        },
      },
      {
        title: 'Pluie modérée : 30 mm/h',
        html: '<p>Passez en mode <b>Météo</b> et réglez la pluie sur <b>30 mm/h</b>. Relevez l’atténuation de pluie sur chacun des deux faisceaux (80 GHz et 23 GHz) et la modulation de l’E-Band.</p>',
        question: 'Comparez l’atténuation par la pluie à 80 GHz et à 23 GHz sur ce même bond de 2 km. Que fait l’ACM sur le faisceau E-Band ?',
        check: (api) => {
          if (api.rain() < 30) return { ok: false, msg: `Pluie : ${api.rain()} mm/h (objectif 30).` };
          const e = st(api, 'FO-80 A', 'FO-80 B');
          const b = st(api, 'FO-23 A', 'FO-23 B');
          return { ok: true, msg: `80 GHz : −${f(e.budgets.ab.rain)} dB, ${fhMod(e)} · 23 GHz : −${f(b.budgets.ab.rain)} dB, ${fhMod(b)}.` };
        },
      },
      {
        title: 'Orage tropical : 80 mm/h',
        html: '<p>Montez la pluie à <b>80 mm/h</b>. Observez le faisceau E-Band, le journal d’événements et l’onglet <b>Réseau</b> : par où passe maintenant le trafic du campus ?</p>',
        question: 'Que devient le faisceau E-Band ? Le service est-il interrompu ? Quel flux est dégradé et pourquoi la voix ne l’est-elle pas ?',
        check: (api) => {
          if (api.rain() < 80) return { ok: false, msg: `Pluie : ${api.rain()} mm/h (objectif 80).` };
          const e = st(api, 'FO-80 A', 'FO-80 B');
          const v = allFlows(api).find((x) => x.cls === 'voice');
          const ok = !e.up && v && v.status === 'ok' && v.usesBackup;
          return { ok, msg: `E-Band : ${statusTxt(e)} · voix ${v ? (v.usesBackup ? 'via le 23 GHz de secours, ' : 'via l’E-Band, ') + v.status : '—'}.` };
        },
      },
      {
        title: 'Chercher la parade : antennes de 0,6 m',
        html: '<p>Toujours à 80 mm/h, passez les antennes intégrées des deux <b>FO-80</b> à <b>0,6 m</b>. Puis revenez à un canal de <b>500 MHz</b>. L’E-Band revient-il ?</p>',
        question: 'Quel gain apporte le passage de 0,3 à 0,6 m ? Est-ce suffisant pour un orage de 80 mm/h ? Concluez sur l’intérêt du secours 23 GHz en Afrique de l’Ouest.',
        check: (api) => {
          const e = st(api, 'FO-80 A', 'FO-80 B');
          const d = ['FO-80 A', 'FO-80 B'].every((n) => Number(api.node(n).props.diameterM) >= 0.6);
          const c = ['FO-80 A', 'FO-80 B'].every((n) => Number(api.node(n).props.channelMHz) === 500);
          return { ok: d && c && api.rain() >= 80, msg: d && c ? `0,6 m · 500 MHz à ${api.rain()} mm/h : E-Band ${statusTxt(e)}${e.up ? ' — ' + f(e.capacityMbps, 0) + ' Mbit/s' : ''}.` : 'Antennes 0,6 m et canal 500 MHz sur les deux FO-80.' };
        },
      },
    ],
    conclusion:
      '<p>L’E-Band apporte des <b>débits de fibre</b> (plusieurs Gbit/s) grâce à des canaux très larges, sur des bonds <b>courts</b> (quelques km). En climat tropical, un orage peut le couper : on l’associe à une <b>bande basse</b> (18 ou 23 GHz) en secours ou en agrégation (« multiband »), et la <b>QoS</b> protège les services prioritaires pendant la bascule.</p>',
    build() {
      const fo80 = { band: '80', txPowerDbm: 15, channelMHz: 500, diameterM: 0.3, polarization: 'V', acm: true, maxMod: '512QAM', uplink: 'fiber', heightM: 66 };
      const fo23 = { band: '23', txPowerDbm: 18, channelMHz: 112, diameterM: 0.6, polarization: 'V', acm: true, maxMod: '512QAM', uplink: 'fiber', heightM: 66 };
      const nodes = [
        N('building', 'Tour Opérateur', 150, 560, { floors: 20, groundM: 300 }),
        N('building', 'Tour Campus', 550, 560, { floors: 20, groundM: 300 }),
        N('fullOutdoor', 'FO-80 A', 230, 500, Object.assign({ siteId: 'Tour Opérateur' }, fo80)),
        N('fullOutdoor', 'FO-23 A', 230, 620, Object.assign({ siteId: 'Tour Opérateur' }, fo23)),
        N('fullOutdoor', 'FO-80 B', 470, 500, Object.assign({ siteId: 'Tour Campus' }, fo80)),
        N('fullOutdoor', 'FO-23 B', 470, 620, Object.assign({ siteId: 'Tour Campus' }, fo23)),
        N('router', 'R-Opérateur', 80, 740, { loopback: '10.255.0.1' }),
        N('router', 'R-Campus', 620, 740, { loopback: '10.255.0.2' }),
        N('internet', 'Cœur / Internet', 80, 870, { ip: '10.10.0.1' }),
        N('gnodeb', 'gNodeB Campus', 620, 870, { ip: '10.40.0.10' }),
      ];
      const fib = { capacityMbps: 10000 };
      const links = [
        Lk('FO-80 A', 'FO-80 B', { name: 'E-Band 80 GHz' }),
        Lk('FO-23 A', 'FO-23 B', { name: 'Secours 23 GHz', backup: true }),
        Lk('FO-80 A', 'R-Opérateur', fib, 'fiber'),
        Lk('FO-23 A', 'R-Opérateur', fib, 'fiber'),
        Lk('FO-80 B', 'R-Campus', fib, 'fiber'),
        Lk('FO-23 B', 'R-Campus', fib, 'fiber'),
        Lk('R-Opérateur', 'Cœur / Internet', fib, 'fiber'),
        Lk('R-Campus', 'gNodeB Campus', fib, 'fiber'),
      ];
      return {
        settings: { scaleKm: 0.25, rainMmH: 0 },
        nodes,
        links,
        flows: [Fl('gNodeB Campus', 'Cœur / Internet', 2500, 'data', 'Données 5G campus'), Fl('gNodeB Campus', 'Cœur / Internet', 100, 'voice', 'Voix 5G (VoNR)')],
      };
    },
  });

  /* =================== TP 8 =================== */
  LABS.push({
    id: 'tp8',
    
    num: 'TP 8',
    title: 'Protection 1+1 HSB d’un faisceau critique',
    subtitle: 'Pannes d’ODU, d’IDU et d’antenne : 1+0 contre 1+1, disponibilité',
    duration: '1 h 30',
    tags: ['fh', 'ip'],
    mode: 'diag',
    context:
      '<p>Une <b>agence bancaire</b> isolée est reliée à son siège par un faisceau hertzien de <b>15 km à 7 GHz</b>. Le déplacement d’un technicien sur ce site prend une journée : une panne d’équipement priverait l’agence de service (paiements, téléphonie) pendant au moins 24 h.</p><p>Vous comparez la configuration <b>1+0</b> (sans protection) et la configuration <b>1+1 HSB</b> (<i>Hot Stand-By</i> : un second ODU/IDU sous tension prend le relais automatiquement).</p>',
    objectives: [
      'Simuler la panne d’un équipement et en lire les symptômes.',
      'Configurer une protection 1+1 HSB et vérifier son effet.',
      'Identifier ce que la protection 1+1 ne couvre pas.',
      'Calculer une disponibilité à partir du MTBF et du MTTR.',
    ],
    releves: [["État de la liaison : panne d’ODU en 1+0", ""], ["État de la liaison : panne d’ODU en 1+1 HSB", ""], ["État : ODU + IDU en panne en 1+1", ""], ["État : antenne en panne en 1+1", ""], ["Indisponibilité d’une extrémité U = MTTR / (MTBF + MTTR)", ""], ["Indisponibilité annuelle en 1+0", "h/an"], ["Indisponibilité annuelle en 1+1", "s/an"]],
    steps: [
      {
        title: 'Panne d’ODU en configuration 1+0',
        html: '<p>Vous êtes en mode <b>Diagnostic</b>. Avec l’outil <b>Panne</b> (C), cliquez sur <b>ODU-Agence</b>. Observez le faisceau, les flux (console → Flux de trafic) et le journal.</p>',
        question: 'Quels services sont perdus ? Combien de temps l’agence resterait-elle sans liaison si le technicien met 24 h à intervenir ?',
        check: (api) => {
          const o = api.node('ODU-Agence');
          const s = st(api, 'Site Agence', 'Site Siège');
          return { ok: !!o.props.failed && !s.up, msg: o.props.failed ? `ODU en panne → liaison ${statusTxt(s)} · flux OK : ${allFlows(api).filter((x) => x.status === 'ok').length}/${allFlows(api).length}.` : 'Mettez ODU-Agence en panne.' };
        },
      },
      {
        title: 'Configurer la protection 1+1 HSB',
        html: '<p>Laissez l’ODU en panne. Sélectionnez le faisceau (outil Sélection, V) et réglez <b>Configuration</b> sur <b>1+1 HSB</b>.</p>',
        question: 'Le service est-il rétabli ? Combien de temps dure la bascule HSB dans la réalité (quelques dizaines de ms) ? Que doit faire le technicien ensuite ?',
        check: (api) => {
          const l = api.link('Site Agence', 'Site Siège');
          const o = api.node('ODU-Agence');
          return { ok: l.props.protection === '1+1' && !!o.props.failed && l.state.up, msg: l.props.protection === '1+1' ? `1+1 HSB : liaison ${statusTxt(l.state)} malgré la panne de l’ODU.` : 'Réglez la configuration en 1+1 HSB.' };
        },
      },
      {
        title: 'Double panne ODU + IDU',
        html: '<p>Toujours en 1+1, mettez aussi <b>IDU-Agence</b> en panne.</p>',
        question: 'La liaison tient-elle ? Pourquoi la protection 1+1 HSB couvre-t-elle à la fois l’ODU et l’IDU ?',
        check: (api) => {
          const s = st(api, 'Site Agence', 'Site Siège');
          const ok = api.node('IDU-Agence').props.failed && api.node('ODU-Agence').props.failed;
          return { ok: ok && s.up, msg: ok ? `ODU + IDU en panne, 1+1 : liaison ${statusTxt(s)}.` : 'Mettez aussi IDU-Agence en panne.' };
        },
      },
      {
        title: 'Panne de l’antenne',
        html: '<p>Réparez l’ODU et l’IDU (re-clic avec l’outil Panne). Simulez maintenant une panne de l’antenne <b>ANT-Agence</b> (câble arraché par une tempête, choc…).</p>',
        question: 'La protection 1+1 HSB agit-elle ? Quelle configuration faudrait-il pour être protégé contre ce type de panne (diversité d’espace, second chemin) ?',
        check: (api) => {
          const s = st(api, 'Site Agence', 'Site Siège');
          const a = api.node('ANT-Agence');
          const rep = !api.node('ODU-Agence').props.failed && !api.node('IDU-Agence').props.failed;
          return { ok: rep && !!a.props.failed && !s.up, msg: !rep ? 'Réparez d’abord l’ODU et l’IDU.' : a.props.failed ? `Antenne en panne : liaison ${statusTxt(s)} malgré le 1+1.` : 'Mettez ANT-Agence en panne.' };
        },
      },
      {
        title: 'Calculer la disponibilité',
        html: '<p>Réparez l’antenne. Données constructeur : <b>MTBF</b> (temps moyen entre pannes) d’un ensemble ODU + IDU = <b>60 000 h</b> ; <b>MTTR</b> (temps moyen de réparation, déplacement compris) = <b>24 h</b>.</p><div class="formula">Indisponibilité U = MTTR / (MTBF + MTTR) · Disponibilité A = 1 − U</div><p>Une liaison 1+0 comporte deux ensembles ODU + IDU (un par extrémité).</p>',
        question: 'Calculez l’indisponibilité annuelle (en heures) d’une liaison 1+0 due aux pannes d’équipements. En 1+1, une coupure exige la panne simultanée des deux équipements d’une même extrémité : que devient l’indisponibilité ?',
        check: (api) => {
          const ok = !api.nodes().some((n) => n.props.failed) && allFlows(api).every((x) => x.status === 'ok');
          return { ok, msg: ok ? 'Liaison rétablie : faites le calcul de disponibilité.' : 'Réparez tous les équipements.' };
        },
      },
    ],
    conclusion:
      '<p>La protection <b>1+1 HSB</b> double les équipements actifs (ODU, IDU) et bascule en quelques dizaines de millisecondes : elle supprime l’essentiel des coupures dues aux pannes matérielles, surtout sur les sites difficiles d’accès. Elle ne protège ni contre la panne de l’antenne ou du guide d’onde, ni contre la propagation (pluie, évanouissements) : on utilise alors la <b>diversité d’espace</b> (1+1 SD, deux antennes) ou un <b>chemin alternatif</b> (anneau, secours satellite).</p>',
    build() {
      const nodes = [
        N('tower', 'Site Siège', 120, 560, { heightM: 40, groundM: 310 }),
        N('tower', 'Site Agence', 495, 560, { heightM: 40, groundM: 300 }),
        N('antenna', 'ANT-Siège', 190, 500, { siteId: 'Site Siège', diameterM: 1.2, heightM: 38 }),
        N('odu', 'ODU-Siège', 190, 420, { siteId: 'Site Siège', band: '7', txPowerDbm: 27, channelMHz: 28 }),
        N('idu', 'IDU-Siège', 25, 530, { maxMod: '256QAM' }),
        N('antenna', 'ANT-Agence', 425, 500, { siteId: 'Site Agence', diameterM: 1.2, heightM: 38 }),
        N('odu', 'ODU-Agence', 425, 420, { siteId: 'Site Agence', band: '7', txPowerDbm: 27, channelMHz: 28 }),
        N('idu', 'IDU-Agence', 590, 530, { maxMod: '256QAM' }),
        N('server', 'Siège banque', 40, 700, { ip: '10.60.0.1' }),
        N('bankAgency', 'Agence bancaire', 580, 700, { ip: '10.60.0.20' }),
      ];
      const links = [
        Lk('ANT-Siège', 'ODU-Siège'),
        Lk('ODU-Siège', 'IDU-Siège'),
        Lk('ANT-Agence', 'ODU-Agence'),
        Lk('ODU-Agence', 'IDU-Agence'),
        Lk('ANT-Siège', 'ANT-Agence', { protection: '1+0' }),
        Lk('IDU-Siège', 'Siège banque'),
        Lk('IDU-Agence', 'Agence bancaire'),
      ];
      return {
        settings: { scaleKm: 2, rainMmH: 0 },
        nodes,
        links,
        flows: [Fl('Agence bancaire', 'Siège banque', 10, 'data', 'Paiements et applicatifs'), Fl('Agence bancaire', 'Siège banque', 1, 'voice', 'Téléphonie IP')],
      };
    },
  });

  /* =================== TP 9 =================== */
  LABS.push({
    id: 'tp9',
    
    num: 'TP 9',
    title: 'Anneau Ethernet hertzien protégé par ERPS (G.8032)',
    subtitle: 'Tempête de broadcast, lien RPL, bascule < 50 ms, retour automatique',
    duration: '2 h',
    tags: ['fh', 'ip'],
    mode: 'diag',
    context:
      '<p>Quatre sites mobiles d’une ville sont reliés en <b>anneau</b> par des radios <b>Full-Outdoor 18 GHz</b> et des <b>switches Carrier Ethernet</b>. Le trafic des trois gNodeB remonte en <b>couche 2</b> (VLAN 100) vers le cœur 4G/5G situé au site Nord.</p><p>L’installateur a fermé l’anneau… sans activer le protocole de protection. Votre mission : diagnostiquer le problème, configurer <b>ERPS (ITU-T G.8032)</b> et vérifier la résilience.</p>',
    objectives: [
      'Expliquer pourquoi une boucle Ethernet non protégée paralyse le réseau.',
      'Activer ERPS et identifier le lien RPL bloqué.',
      'Choisir soi-même le lien RPL.',
      'Vérifier la bascule (état PROTECTION) et le retour (état IDLE).',
    ],
    releves: [["État initial de l’anneau", ""], ["Flux en service avant ERPS", "/ 3"], ["Lien RPL choisi automatiquement", ""], ["Lien RPL retenu et propriétaire", ""], ["État après coupure Est ↔ Sud", ""], ["Chemin du gNodeB Sud après coupure", ""], ["Temps de bascule ERPS (norme)", "ms"], ["État après rétablissement", ""]],
    steps: [
      {
        title: 'Constater la tempête de broadcast',
        html: '<p>Observez le canevas (switches qui clignotent en rouge), le <b>Journal d’événements</b> et l’onglet <b>Réseau</b> de l’inspecteur (section Anneaux).</p>',
        question: 'Pourquoi les trames de broadcast (ARP par exemple) tournent-elles indéfiniment dans un anneau Ethernet ? Pourquoi aucun flux ne passe plus ?',
        check: (api) => {
          const r = api.analysis().rings[0];
          return { ok: !!r && r.state === 'loop', msg: r ? `Anneau : ${r.stateLabel}` : 'Aucun anneau détecté.' };
        },
      },
      {
        title: 'Activer ERPS sur les quatre switches',
        html: '<p>Sélectionnez chaque switch (<b>SW-Nord</b>, <b>SW-Est</b>, <b>SW-Sud</b>, <b>SW-Ouest</b>) et cochez <b>ERPS G.8032 (anneau)</b>. Observez le lien marqué <b>RPL</b> sur le canevas.</p>',
        question: 'Quel lien le simulateur a-t-il bloqué ? Pourquoi bloquer un seul lien suffit-il à supprimer la boucle tout en gardant tous les sites joignables ?',
        check: (api) => {
          const sw = api.nodes('switch');
          const on = sw.filter((n) => n.props.erps).length;
          const r = api.analysis().rings[0];
          const ok = on === 4 && r && r.state === 'idle' && allFlows(api).every((x) => x.status === 'ok');
          return { ok, msg: `ERPS actif sur ${on}/4 switches${r ? ' · ' + r.stateLabel : ''}.` };
        },
      },
      {
        title: 'Choisir le lien RPL',
        html: '<p>Le RPL a été choisi automatiquement. L’ingénieur préfère bloquer le bond <b>Ouest ↔ Nord</b>, le moins chargé. Sélectionnez ce faisceau et cochez <b>Lien RPL (anneau ERPS)</b>, puis cochez <b>Propriétaire du RPL</b> sur <b>SW-Nord</b>.</p>',
        question: 'Quel est le rôle du propriétaire du RPL (RPL owner) ? Que se passerait-il si deux liens de l’anneau étaient bloqués en même temps ?',
        check: (api) => {
          const r = api.analysis().rings[0];
          const l = api.link('Pylône Ouest', 'Pylône Nord');
          const ok = r && l && r.rplLink === l.id && !r.rplAuto && api.node('SW-Nord').props.rplOwner && r.state === 'idle';
          return { ok: !!ok, msg: ok ? 'RPL = Ouest ↔ Nord, propriétaire SW-Nord ✔' : `RPL actuel : ${r && r.rplLink ? (api.links().find((x) => x.id === r.rplLink).props.name || 'lien automatique') : '—'}${r && r.rplAuto ? ' (automatique)' : ''}.` };
        },
      },
      {
        title: 'Couper un bond de l’anneau',
        html: '<p>Avec l’outil <b>Panne</b> (C), coupez le faisceau <b>Est ↔ Sud</b>. Lisez le journal : changement d’état de l’anneau et re-routage des flux.</p>',
        question: 'Dans quel état passe l’anneau ? Par quel chemin le trafic du gNodeB Sud rejoint-il maintenant le cœur ? En combien de temps (norme G.8032) ?',
        check: (api) => {
          const r = api.analysis().rings[0];
          const l = api.link('Pylône Est', 'Pylône Sud');
          const ok = l && l.props.cut && r && r.state === 'protection' && allFlows(api).every((x) => x.status === 'ok');
          return { ok: !!ok, msg: l && l.props.cut ? `${r ? r.stateLabel : ''} · flux OK ${allFlows(api).filter((x) => x.status === 'ok').length}/${allFlows(api).length}.` : 'Coupez le bond Est ↔ Sud.' };
        },
      },
      {
        title: 'Rétablir et revenir à l’état normal',
        html: '<p>Rétablissez le faisceau Est ↔ Sud. Vérifiez que l’anneau revient en état <b>IDLE</b> avec le RPL de nouveau bloqué.</p>',
        question: 'Pourquoi ERPS bascule-t-il en moins de 50 ms alors que le protocole Spanning Tree classique (STP) peut mettre plusieurs secondes ? Pourquoi est-ce important pour la voix et la synchronisation des stations mobiles ?',
        check: (api) => {
          const r = api.analysis().rings[0];
          const ok = r && r.state === 'idle' && !api.links().some((x) => x.props.cut);
          return { ok: !!ok, msg: r ? r.stateLabel : '—' };
        },
      },
    ],
    conclusion:
      '<p>Un anneau Ethernet crée une <b>boucle</b> que les switches ne savent pas gérer seuls : sans protocole, les broadcasts saturent le réseau en quelques millisecondes. <b>ERPS (G.8032)</b> bloque un lien choisi (<b>RPL</b>) et le débloque en <b>moins de 50 ms</b> si un bond tombe, puis revient à l’état normal après réparation. C’est la protection standard des anneaux hertziens de backhaul mobile en couche 2.</p>',
    build() {
      const nodes = [];
      const links = [];
      const sites = [
        { key: 'Nord', x: 420, y: 380 },
        { key: 'Est', x: 720, y: 580 },
        { key: 'Sud', x: 420, y: 780 },
        { key: 'Ouest', x: 120, y: 580 },
      ];
      const fo = { band: '18', txPowerDbm: 20, channelMHz: 56, diameterM: 0.6, polarization: 'V', acm: true, maxMod: '512QAM', heightM: 33 };
      for (const s of sites) {
        nodes.push(N('tower', 'Pylône ' + s.key, s.x, s.y, { heightM: 35, groundM: 300 }));
        nodes.push(N('switch', 'SW-' + s.key, s.x, s.y + 115, { vlans: 'all', erps: false }));
      }
      const hop = (a, b) => {
        const na = 'FO ' + a.key + '→' + b.key;
        const nb = 'FO ' + b.key + '→' + a.key;
        const ox = (b.x - a.x) * 0.2;
        const oy = (b.y - a.y) * 0.2;
        nodes.push(N('fullOutdoor', na, a.x + ox, a.y + oy, Object.assign({ siteId: 'Pylône ' + a.key }, fo)));
        nodes.push(N('fullOutdoor', nb, b.x - ox, b.y - oy, Object.assign({ siteId: 'Pylône ' + b.key }, fo)));
        links.push(Lk(na, nb, { name: a.key + ' ↔ ' + b.key }), Lk(na, 'SW-' + a.key), Lk(nb, 'SW-' + b.key));
      };
      hop(sites[0], sites[1]);
      hop(sites[1], sites[2]);
      hop(sites[2], sites[3]);
      hop(sites[3], sites[0]);
      nodes.push(N('server', 'Cœur 4G/5G', 560, 470, { ip: '10.100.0.1', prefix: 24, vlan: 100 }));
      links.push(Lk('SW-Nord', 'Cœur 4G/5G', { capacityMbps: 10000 }, 'fiber'));
      for (const s of sites.slice(1)) {
        const n = 'gNodeB ' + s.key;
        nodes.push(N('gnodeb', n, s.x + 120, s.y + 175, { ip: '10.100.0.' + (10 + sites.indexOf(s)), prefix: 24, vlan: 100 }));
        links.push(Lk('SW-' + s.key, n));
      }
      return {
        settings: { scaleKm: 1, rainMmH: 0 },
        nodes,
        links,
        flows: sites.slice(1).map((s) => Fl('gNodeB ' + s.key, 'Cœur 4G/5G', 120, 'data', 'Backhaul ' + s.key)),
      };
    },
  });

  /* =================== TP 10 =================== */
  LABS.push({
    id: 'tp10',
    
    num: 'TP 10',
    title: 'Backhaul hybride : désenclaver un village par satellite et BLR',
    subtitle: 'VSAT vers le téléport, distribution locale en BLR, goulot d’étranglement, QoS',
    duration: '3 h',
    tags: ['vsat', 'blr', 'ip'],
    mode: 'design',
    context:
      '<p>Le village de <b>Tanlili</b> (13,50° N ; 0,40° E) n’a ni fibre ni faisceau hertzien. Une <b>architecture hybride</b> est déployée :</p><ul><li><b>backhaul satellite</b> : une station VSAT bande Ku relie le village au téléport de Ouagadougou via un satellite GEO à 7° E ;</li><li><b>distribution locale en BLR</b> : une station de base 3,5 GHz installée sur le château d’eau dessert l’<b>école</b>, le <b>centre de santé</b> et la <b>mairie</b>.</li></ul><p>Les usagers se plaignent : Internet est lent. À vous de trouver le goulot d’étranglement et de dimensionner correctement la liaison.</p>',
    objectives: [
      'Décrire une architecture hybride satellite + BLR.',
      'Identifier le maillon limitant (goulot d’étranglement) d’une chaîne de transmission.',
      'Dimensionner la voie retour VSAT (débit symbole, BUC).',
      'Vérifier la QoS et l’intérêt de garder le trafic local en local.',
    ],
    releves: [["Débit montant demandé par le village", "Mbit/s"], ["Débit de la voie retour VSAT initiale", "Mbit/s"], ["Charge de la liaison VSAT", "%"], ["Débit symbole retour retenu", "Msymb/s"], ["C/N retour (BUC 4 W / 8 W)", "dB"], ["Débit retour final", "Mbit/s"], ["RTT École → Internet", "ms"], ["RTT École → Mairie", "ms"], ["Atténuation de pluie VSAT à 40 mm/h (montant)", "dB"]],
    steps: [
      {
        title: 'Analyser l’architecture et les flux',
        html: '<p>Repérez les deux segments : satellite (VSAT ↔ GEO ↔ téléport) et BLR (BTS ↔ 3 CPE). Ouvrez la console, onglet <b>Flux de trafic</b> : relevez les flux saturés et le débit réellement acheminé.</p>',
        question: 'Quels flux sont dégradés ? Additionnez les débits montants demandés par le village et comparez-les au débit de la voie retour VSAT (bilan de la liaison satellite).',
        check: (api) => {
          const fl = allFlows(api);
          const v = api.link('GEO 7°E', 'VSAT Tanlili');
          return { ok: true, msg: `Flux saturés : ${fl.filter((x) => x.status === 'congested').length}/${fl.length} · voie retour VSAT ${v && v.state.retCap !== undefined ? f(v.state.retCap, 2) : '—'} Mbit/s.` };
        },
      },
      {
        title: 'Localiser le goulot d’étranglement',
        html: '<p>Sélectionnez successivement une liaison BLR puis la liaison VSAT. Dans l’onglet <b>Réseau</b>, consultez la section « Liens les plus chargés ».</p>',
        question: 'Quel lien est saturé : le BLR ou la voie retour satellite ? Pourquoi est-ce typique d’une architecture VSAT (débit aller ≫ débit retour) ?',
        check: (api) => {
          const loads = api.analysis().linkLoads;
          const v = api.link('GEO 7°E', 'VSAT Tanlili');
          const ld = v && loads[v.id];
          return { ok: !!ld && ld.utilisation > 1, msg: ld ? `Liaison VSAT chargée à ${f(ld.utilisation * 100, 0)} %.` : '—' };
        },
      },
      {
        title: 'Augmenter le débit de la voie retour',
        html: '<p>Sélectionnez le <b>Modem Tanlili</b> et passez le <b>débit symbole voie retour</b> de 2 à <b>4 Msymb/s</b>. Observez le C/N et le MODCOD retour. Si le MODCOD baisse trop, remplacez le <b>BUC</b> de 4 W par un BUC de <b>8 W</b>.</p>',
        question: 'Pourquoi doubler le débit symbole fait-il perdre 3 dB de C/N ? Que rapporte le passage du BUC de 4 à 8 W ? Quel est le nouveau débit retour ?',
        check: (api) => {
          const v = api.link('GEO 7°E', 'VSAT Tanlili');
          const fl = allFlows(api);
          const ok = v && v.state.up && v.state.retCap >= 7 && fl.every((x) => x.status === 'ok');
          return { ok: !!ok, msg: v ? `Retour : ${f(v.state.retCap, 2)} Mbit/s (${v.state.result && v.state.result.ret.modcod ? v.state.result.ret.modcod.id : 'COUPÉ'}) · flux OK ${fl.filter((x) => x.status === 'ok').length}/${fl.length}.` : '—' };
        },
      },
      {
        title: 'Garder le trafic local en local',
        html: '<p>Faites un <b>ping</b> de l’<b>École</b> vers <b>Internet</b>, puis de l’<b>École</b> vers la <b>Mairie</b>. Comparez les temps de réponse.</p>',
        question: 'Pourquoi le trafic École ↔ Mairie ne passe-t-il pas par le satellite ? Quel service local (serveur de cache, messagerie de la mairie…) pourrait-on héberger au village pour soulager le lien satellite ?',
        check: (api) => {
          const p = api.lastPing();
          const e = api.node('École');
          const m = api.node('Mairie');
          if (!p || p.src !== e.id || p.dst !== m.id) return { ok: false, msg: 'Terminez par un ping École → Mairie.' };
          return { ok: p.success && p.rttMs < 50, msg: p.success ? `École → Mairie : ${f(p.rttMs, 1)} ms (trafic local, sans satellite).` : 'Ping échoué.' };
        },
      },
      {
        title: 'Saison des pluies',
        html: '<p>Passez en mode <b>Météo</b> et réglez la pluie à <b>40 mm/h</b> sur la zone. Observez la liaison VSAT (Ku) et les liaisons BLR (3,5 GHz), puis les flux.</p>',
        question: 'Quel segment souffre de la pluie ? Quel flux reste protégé grâce à la QoS ? Proposez une évolution pour améliorer la disponibilité en saison des pluies.',
        check: (api) => {
          if (api.rain() < 40) return { ok: false, msg: `Pluie : ${api.rain()} mm/h (objectif 40).` };
          const v = api.link('GEO 7°E', 'VSAT Tanlili').state;
          const b = api.links('blr')[0].state;
          const voice = allFlows(api).find((x) => x.cls === 'voice');
          return { ok: true, msg: `VSAT : ${statusTxt(v)} (−${f(v.result ? v.result.rain.remoteUp : 0)} dB montant) · BLR : ${statusTxt(b)} · voix santé : ${voice ? voice.status : '—'}.` };
        },
      },
    ],
    conclusion:
      '<p>Dans une architecture hybride, le <b>maillon le plus faible</b> impose le service : ici la voie retour VSAT. On la dimensionne avec le débit symbole, la puissance du BUC et la taille d’antenne, en surveillant le C/N. La BLR distribue localement et le trafic interne au village reste local, à faible latence. La <b>QoS</b> protège les services vitaux (santé) quand la capacité baisse.</p>',
    build() {
      const nodes = [
        N('satellite', 'GEO 7°E', 520, 60, { orbit: 'GEO', band: 'Ku', lonDeg: 7 }),
        N('hub', 'Téléport Ouaga', 180, 560, { coordMode: 'manual', lat: 12.37, lon: -1.53, dishM: 7.3, hpaW: 200 }),
        N('router', 'R-Cœur', 90, 700, { loopback: '10.255.0.1' }),
        N('internet', 'Internet', 90, 840, { ip: '10.10.0.1', prefix: 24 }),
        N('tower', 'Château d’eau', 760, 600, { heightM: 30, groundM: 290 }),
        N('vsatAntenna', 'VSAT Tanlili', 860, 480, { coordMode: 'manual', lat: 13.5, lon: 0.4, dishM: 1.8, autoPoint: true }),
        N('buc', 'BUC Tanlili', 820, 380, { powerW: 4 }),
        N('lnb', 'LNB Tanlili', 920, 380, { nfDb: 0.8 }),
        N('vsatModem', 'Modem Tanlili', 980, 480, { retSymbolRate: 2, retMaxModcod: '8PSK 3/4' }),
        N('router', 'R-Village', 980, 610, { loopback: '10.255.0.9' }),
        N('blrBts', 'BTS BLR', 700, 540, { siteId: 'Château d’eau', band: '3.5', channelMHz: 20, txPowerDbm: 30, sectorDeg: 120, azimuthDeg: 200, heightM: 28, maxMod: '256QAM 5/6' }),
        N('building', 'Bât. école', 600, 800, { floors: 1, groundM: 288 }),
        N('building', 'Bât. santé', 780, 860, { floors: 1, groundM: 288 }),
        N('building', 'Bât. mairie', 520, 680, { floors: 2, groundM: 292 }),
        N('blrCpe', 'CPE École', 640, 760, { siteId: 'Bât. école', heightM: 9 }),
        N('blrCpe', 'CPE Santé', 820, 820, { siteId: 'Bât. santé', heightM: 9 }),
        N('blrCpe', 'CPE Mairie', 560, 640, { siteId: 'Bât. mairie', heightM: 12 }),
        N('pc', 'École', 560, 900, { ip: '10.70.0.20', prefix: 24, gateway: '10.70.0.1' }),
        N('pc', 'Centre de santé', 820, 960, { ip: '10.70.0.30', prefix: 24, gateway: '10.70.0.1' }),
        N('pc', 'Mairie', 420, 720, { ip: '10.70.0.40', prefix: 24, gateway: '10.70.0.1' }),
      ];
      const links = [
        Lk('GEO 7°E', 'Téléport Ouaga'),
        Lk('GEO 7°E', 'VSAT Tanlili'),
        Lk('VSAT Tanlili', 'BUC Tanlili'),
        Lk('VSAT Tanlili', 'LNB Tanlili'),
        Lk('BUC Tanlili', 'Modem Tanlili'),
        Lk('LNB Tanlili', 'Modem Tanlili'),
        Lk('Modem Tanlili', 'R-Village'),
        Lk('R-Village', 'BTS BLR'),
        Lk('BTS BLR', 'CPE École'),
        Lk('BTS BLR', 'CPE Santé'),
        Lk('BTS BLR', 'CPE Mairie'),
        Lk('CPE École', 'École'),
        Lk('CPE Santé', 'Centre de santé'),
        Lk('CPE Mairie', 'Mairie'),
        Lk('Téléport Ouaga', 'R-Cœur', { capacityMbps: 10000 }, 'fiber'),
        Lk('R-Cœur', 'Internet', { capacityMbps: 10000 }, 'fiber'),
      ];
      return {
        settings: { scaleKm: 0.5, rainMmH: 0 },
        nodes,
        links,
        flows: [
          Fl('École', 'Internet', 3, 'data', 'École → Internet (cours en ligne)'),
          Fl('Mairie', 'Internet', 2, 'data', 'Mairie → Internet (état civil)'),
          Fl('Centre de santé', 'Internet', 0.5, 'voice', 'Centre de santé → télémédecine (voix)'),
          Fl('Centre de santé', 'Internet', 1.5, 'video', 'Centre de santé → télémédecine (vidéo)'),
        ],
      };
    },
  });

  /* =================== TP 11 =================== */
  LABS.push({
    id: 'tp11',
    
    num: 'TP 11',
    title: 'BLR : 5,8 GHz ou 26 GHz ? CPE intérieur ou extérieur ?',
    subtitle: 'Portée contre débit, pertes de mur, pluie en ondes millimétriques',
    duration: '2 h',
    tags: ['blr', 'ip'],
    mode: 'design',
    context:
      '<p>Un fournisseur d’accès veut raccorder trois clients depuis une même station de base : un <b>commerce</b> à 0,6 km, un <b>hôtel</b> à 2 km et une <b>ferme</b> à 5 km. Deux technologies sont envisagées :</p><ul><li><b>26 GHz</b> (5G mmWave / FWA) : canaux de 200 MHz, très haut débit, mais portée courte ;</li><li><b>5,8 GHz</b> (bande libre WISP) : canaux de 40 MHz, débit plus modeste, meilleure portée.</li></ul><p>Le client « commerce » voudrait un <b>CPE intérieur</b> (posé derrière une vitrine), plus simple à installer.</p>',
    objectives: [
      'Comparer la portée et le débit d’une BLR en 5,8 GHz et en 26 GHz.',
      'Quantifier les pertes de pénétration d’un CPE intérieur.',
      'Évaluer l’effet de la pluie en ondes millimétriques.',
      'Choisir la technologie adaptée à chaque client.',
    ],
    releves: [["26 GHz : débit commerce / hôtel / ferme", "Mbit/s"], ["FSL à 26 GHz : 0,6 / 2 / 5 km", "dB"], ["5,8 GHz : débit par abonné", "Mbit/s"], ["CPE intérieur, 5,8 GHz (mur 12 dB) : MCS / débit", "— / Mbit/s"], ["CPE intérieur, 26 GHz (mur 20 dB) : état", ""], ["Pluie 60 mm/h à 26 GHz : commerce / hôtel / ferme", "dB"], ["Bande et CPE recommandés : commerce / hôtel / ferme", ""]],
    steps: [
      {
        title: 'Situation initiale en 26 GHz',
        html: '<p>La BTS est réglée en <b>26 GHz, canal 200 MHz</b>. Sélectionnez chaque liaison BLR et relevez la distance, le MCS et le débit par abonné (onglet Bilan, sens descendant).</p>',
        question: 'Comment évoluent le MCS et le débit par abonné avec la distance ? Calculez l’affaiblissement en espace libre à 26 GHz pour 0,6 km, 2 km et 5 km.',
        check: (api) => {
          const r = api.links('blr').map((l) => `${l.state.cpe ? l.state.cpe.name.replace('CPE ', '') : '?'} ${f(l.state.distanceKm, 1)} km : ${l.state.up ? (l.state.budgets.dl.activeModulation || {}).id : 'COUPÉ'}`);
          return { ok: true, msg: r.join(' · ') };
        },
      },
      {
        title: 'Passer la BTS en 5,8 GHz',
        html: '<p>Sélectionnez la <b>BTS BLR</b> et choisissez la bande <b>5,8 GHz</b> (canal 40 MHz). Comparez la couverture et les débits.</p>',
        question: 'Tous les clients sont-ils desservis ? Comparez le débit du commerce en 26 GHz et en 5,8 GHz. Quel compromis apparaît entre portée et débit ?',
        check: (api) => {
          const b = api.node('BTS BLR');
          const ls = api.links('blr');
          const ok = b.props.band === '5.8' && ls.every((l) => l.state.up);
          return { ok, msg: b.props.band !== '5.8' ? 'Passez la BTS en 5,8 GHz.' : ls.map((l) => `${l.state.cpe.name.replace('CPE ', '')} : ${l.state.up ? f(l.state.dlCap, 1) + ' Mbit/s' : 'COUPÉ'}`).join(' · ') };
        },
      },
      {
        title: 'CPE intérieur pour le commerce',
        html: '<p>Toujours en 5,8 GHz, sélectionnez <b>CPE Commerce</b> et choisissez l’installation <b>Indoor</b> (pertes de mur 12 dB). Puis revenez en <b>26 GHz</b> et réglez les pertes de mur sur <b>20 dB</b> (vitrage athermique).</p>',
        question: 'Combien de dB perd-on avec un CPE intérieur (gain d’antenne plus faible + traversée du mur) ? Pourquoi les ondes millimétriques traversent-elles si mal les vitrages modernes ?',
        check: (api) => {
          const c = api.node('CPE Commerce');
          const b = api.node('BTS BLR');
          const l = api.link('BTS BLR', 'CPE Commerce');
          const ok = c.props.install === 'indoor' && Number(c.props.wallLossDb) >= 20 && b.props.band === '26';
          return { ok, msg: ok ? `26 GHz, CPE intérieur (mur 20 dB) : ${statusTxt(l.state)}${l.state.up ? ' · ' + f(l.state.dlCap, 1) + ' Mbit/s' : ''}.` : 'CPE Commerce en Indoor avec 20 dB de pertes, BTS en 26 GHz.' };
        },
      },
      {
        title: 'Pluie sur la liaison 26 GHz',
        html: '<p>Remettez le CPE Commerce en <b>Outdoor</b>. Toujours en 26 GHz, passez en mode <b>Météo</b> et montez la pluie à <b>60 mm/h</b>. Observez les trois liaisons.</p>',
        question: 'Relevez l’atténuation due à la pluie pour le commerce (0,6 km), l’hôtel (2 km) et la ferme (5 km). Quel client perd le service ? Pourquoi la distance aggrave-t-elle l’effet de la pluie ?',
        check: (api) => {
          const b = api.node('BTS BLR');
          const c = api.node('CPE Commerce');
          if (b.props.band !== '26' || c.props.install !== 'outdoor') return { ok: false, msg: 'BTS en 26 GHz et CPE Commerce en Outdoor.' };
          if (api.rain() < 60) return { ok: false, msg: `Pluie : ${api.rain()} mm/h (objectif 60).` };
          const h = api.link('BTS BLR', 'CPE Hôtel').state;
          const m = api.link('BTS BLR', 'CPE Commerce').state;
          const fe = api.link('BTS BLR', 'CPE Ferme').state;
          return { ok: true, msg: `Pluie : commerce −${f(m.budgets.dl.rain)} dB (${statusTxt(m)}) · hôtel −${f(h.budgets.dl.rain)} dB (${statusTxt(h)}) · ferme −${f(fe.budgets.dl.rain)} dB (${statusTxt(fe)}).` };
        },
      },
      {
        title: 'Proposer une architecture',
        html: '<p>Remettez la pluie à 0. Une station de base peut porter <b>plusieurs secteurs dans des bandes différentes</b>. Rédigez votre recommandation pour les trois clients.</p>',
        question: 'Quelle bande et quel type de CPE (intérieur / extérieur) recommandez-vous pour chaque client ? Justifiez par vos mesures.',
        check: (api) => ({ ok: api.rain() === 0, msg: api.rain() === 0 ? 'Rédigez votre recommandation.' : 'Remettez la pluie à 0 mm/h.' }),
      },
    ],
    conclusion:
      '<p>Plus la fréquence est élevée, plus il y a de spectre (débit) mais plus l’affaiblissement, la pénétration des bâtiments et la pluie sont pénalisants. Le <b>26 GHz</b> convient aux clients proches, en visibilité directe et avec un CPE extérieur ; le <b>5,8 GHz</b> (ou 3,5 GHz) couvre plus loin et tolère mieux les obstacles. Les opérateurs combinent les deux sur un même site.</p>',
    build() {
      const nodes = [
        N('tower', 'Pylône BLR', 200, 560, { heightM: 40, groundM: 300 }),
        N('blrBts', 'BTS BLR', 260, 510, { siteId: 'Pylône BLR', band: '26', channelMHz: 200, txPowerDbm: 24, sectorDeg: 90, azimuthDeg: 105, heightM: 38, maxMod: '256QAM 5/6' }),
        N('building', 'Commerce', 255, 590, { floors: 1, groundM: 300 }),
        N('building', 'Hôtel', 390, 610, { floors: 4, groundM: 298 }),
        N('building', 'Ferme', 680, 680, { floors: 0, groundM: 295 }),
        N('blrCpe', 'CPE Commerce', 290, 640, { siteId: 'Commerce', heightM: 6, install: 'outdoor', wallLossDb: 12 }),
        N('blrCpe', 'CPE Hôtel', 430, 660, { siteId: 'Hôtel', heightM: 15 }),
        N('blrCpe', 'CPE Ferme', 720, 730, { siteId: 'Ferme', heightM: 6 }),
        N('pc', 'PC Commerce', 290, 760, { ip: '10.80.0.10', prefix: 24 }),
        N('pc', 'PC Hôtel', 450, 780, { ip: '10.80.0.20', prefix: 24 }),
        N('pc', 'PC Ferme', 740, 850, { ip: '10.80.0.30', prefix: 24 }),
        N('internet', 'Internet', 70, 700, { ip: '10.80.0.1', prefix: 24 }),
      ];
      const links = [
        Lk('BTS BLR', 'CPE Commerce'),
        Lk('BTS BLR', 'CPE Hôtel'),
        Lk('BTS BLR', 'CPE Ferme'),
        Lk('CPE Commerce', 'PC Commerce'),
        Lk('CPE Hôtel', 'PC Hôtel'),
        Lk('CPE Ferme', 'PC Ferme'),
        Lk('BTS BLR', 'Internet', { capacityMbps: 10000 }, 'fiber'),
      ];
      return {
        settings: { scaleKm: 0.5, rainMmH: 0 },
        nodes,
        links,
        flows: [Fl('PC Commerce', 'Internet', 20, 'data', 'Commerce'), Fl('PC Hôtel', 'Internet', 20, 'data', 'Hôtel'), Fl('PC Ferme', 'Internet', 5, 'data', 'Ferme')],
      };
    },
  });

  /**
   * Réseau régional : 2 bonds FH, BLR, VSAT, IP/MPLS.
   * sain = false : les 5 défauts du TP 12 ; sain = true : réseau en service (TP 16, pannes tirées au hasard).
   */
  function reseauRegional(sain) {
    // Pointage volontairement faux de 3° en azimut (défaut n° 5)
    let az = 155;
    let el = 71;
    let skew = 27;
    if (MBV.SatPhysics) {
      const g = MBV.SatPhysics.geoLookAngles(14.2, -0.4, 7);
      az = Math.round((g.azimuth + (sain ? 0 : 3)) * 10) / 10;
      el = Math.round(g.elevation * 10) / 10;
      skew = Math.round(g.skew);
    }
    const nodes = [
      N('tower', 'Pylône Siège', 120, 580, { heightM: 45, groundM: 310 }),
      N('tower', 'Pylône Relais', 495, 580, { heightM: 45, groundM: 330 }),
      N('tower', 'Pylône Ville', 870, 580, { heightM: 40, groundM: 300 }),
      N('antenna', 'ANT Siège', 190, 520, { siteId: 'Pylône Siège', diameterM: 0.6, polarization: 'V', heightM: 43 }),
      N('odu', 'ODU Siège', 190, 440, { siteId: 'Pylône Siège', band: '7', txPowerDbm: 27, channelMHz: 28 }),
      N('idu', 'IDU Siège', 30, 550, { maxMod: '256QAM' }),
      N('antenna', 'ANT Relais 1', 425, 520, { siteId: 'Pylône Relais', diameterM: 0.6, polarization: sain ? 'V' : 'H', heightM: 43 }),
      N('odu', 'ODU Relais 1', 425, 440, { siteId: 'Pylône Relais', band: '7', txPowerDbm: 27, channelMHz: 28 }),
      N('idu', 'IDU Relais 1', 440, 690, { maxMod: '256QAM' }),
      N('antenna', 'ANT Relais 2', 565, 520, { siteId: 'Pylône Relais', diameterM: 0.9, polarization: 'V', heightM: 43 }),
      N('odu', 'ODU Relais 2', 565, 440, { siteId: 'Pylône Relais', band: '13', txPowerDbm: 25, channelMHz: 28 }),
      N('idu', 'IDU Relais 2', 550, 690, { maxMod: '256QAM' }),
      N('antenna', 'ANT Ville', 800, 520, { siteId: 'Pylône Ville', diameterM: 0.9, polarization: 'V', heightM: 38 }),
      N('odu', 'ODU Ville', 800, 440, { siteId: 'Pylône Ville', band: '13', txPowerDbm: 25, channelMHz: sain ? 28 : 56 }),
      N('idu', 'IDU Ville', 960, 550, { maxMod: '256QAM' }),
      N('router', 'R-Siège', 60, 700, { loopback: '10.255.0.1' }),
      N('router', 'R-Relais', 495, 790, { loopback: '10.255.0.2' }),
      N('router', 'R-Ville', 960, 690, { loopback: '10.255.0.3' }),
      N('internet', 'Internet', 60, 840, { ip: '10.10.0.1', prefix: 24 }),
      N('switch', 'SW-Ville', 1060, 780, { vlans: sain ? '100,200' : '100' }),
      N('blrBts', 'BTS Ville', 930, 520, { siteId: 'Pylône Ville', band: '3.5', channelMHz: 20, txPowerDbm: 30, sectorDeg: 120, azimuthDeg: 135, heightM: 36, maxMod: '256QAM 5/6' }),
      N('building', 'Immeuble entreprise', 1060, 640, { floors: 4, groundM: 300 }),
      N('blrCpe', 'CPE Entreprise', 1110, 600, { siteId: 'Immeuble entreprise', heightM: 15, accessVlan: 200 }),
      N('pc', 'PC Entreprise', 1190, 690, { ip: '10.90.0.20', prefix: 24 }),
      N('gnodeb', 'gNodeB Ville', 1060, 900, { ip: '10.30.0.10', prefix: 24, vlan: 100 }),
      N('satellite', 'GEO 7°E', 640, 60, { orbit: 'GEO', band: 'Ku', lonDeg: 7 }),
      N('hub', 'Téléport', 250, 690, { coordMode: 'manual', lat: 12.37, lon: -1.53, dishM: 7.3, hpaW: 200 }),
      N('vsatAntenna', 'VSAT Mine', 1260, 420, { coordMode: 'manual', lat: 14.2, lon: -0.4, dishM: 1.8, autoPoint: false, azimuthDeg: az, elevationDeg: el, skewDeg: skew }),
      N('buc', 'BUC Mine', 1210, 510, { powerW: 4 }),
      N('lnb', 'LNB Mine', 1310, 510, { nfDb: 0.8 }),
      N('vsatModem', 'Modem Mine', 1260, 600, { retSymbolRate: 2 }),
      N('ruralSite', 'Site minier', 1310, 700, { ip: '10.20.0.10', prefix: 24 }),
    ];
    const links = [
      Lk('ANT Siège', 'ODU Siège'),
      Lk('ODU Siège', 'IDU Siège'),
      Lk('ANT Relais 1', 'ODU Relais 1'),
      Lk('ODU Relais 1', 'IDU Relais 1'),
      Lk('ANT Relais 2', 'ODU Relais 2'),
      Lk('ODU Relais 2', 'IDU Relais 2'),
      Lk('ANT Ville', 'ODU Ville'),
      Lk('ODU Ville', 'IDU Ville'),
      Lk('ANT Siège', 'ANT Relais 1', { name: 'FH Siège ↔ Relais' }),
      Lk('ANT Relais 2', 'ANT Ville', { name: 'FH Relais ↔ Ville' }),
      Lk('IDU Siège', 'R-Siège'),
      Lk('IDU Relais 1', 'R-Relais'),
      Lk('IDU Relais 2', 'R-Relais'),
      Lk('IDU Ville', 'R-Ville'),
      Lk('R-Siège', 'Internet', { capacityMbps: 10000 }, 'fiber'),
      Lk('R-Ville', 'SW-Ville'),
      Lk('SW-Ville', 'BTS Ville'),
      Lk('SW-Ville', 'gNodeB Ville'),
      Lk('BTS Ville', 'CPE Entreprise'),
      Lk('CPE Entreprise', 'PC Entreprise'),
      Lk('GEO 7°E', 'Téléport'),
      Lk('GEO 7°E', 'VSAT Mine'),
      Lk('VSAT Mine', 'BUC Mine'),
      ...(sain ? [Lk('VSAT Mine', 'LNB Mine')] : []),
      Lk('BUC Mine', 'Modem Mine'),
      Lk('LNB Mine', 'Modem Mine'),
      Lk('Modem Mine', 'Site minier'),
      Lk('Téléport', 'R-Siège', { capacityMbps: 10000 }, 'fiber'),
    ];
    return {
      settings: { scaleKm: 2, rainMmH: 0 },
      nodes,
      links,
      flows: [
        Fl('gNodeB Ville', 'Internet', 50, 'data', 'gNodeB Ville → Internet'),
        Fl('PC Entreprise', 'Internet', 10, 'data', 'Entreprise → Internet'),
        Fl('Site minier', 'Internet', 2, 'data', 'Mine → Internet'),
      ],
    };
  }

  /* =================== TP 12 =================== */
  LABS.push({
    id: 'tp12',
    
    num: 'TP 12',
    title: '« Panne mystère » : remettre en service un réseau défaillant',
    subtitle: 'TP d’évaluation : 5 défauts cachés à trouver, expliquer et corriger',
    duration: '2 h',
    tags: ['fh', 'blr', 'vsat', 'ip'],
    mode: 'diag',
    context:
      '<p>Vous êtes technicien d’astreinte. Après des travaux d’un sous-traitant, le réseau régional ne fonctionne plus : <b>aucun service n’est rendu</b>. Le réseau comprend deux bonds hertziens (Siège → Relais → Ville), une BLR à la Ville et une liaison VSAT vers un site minier.</p><p>Plusieurs défauts de configuration ou de câblage ont été introduits. À vous de les <b>trouver</b> (couleurs, inspecteur, console, journal), de les <b>expliquer</b> et de les <b>corriger</b>. Rédigez au fur et à mesure votre <b>rapport d’intervention</b> : symptôme, cause, correction.</p>',
    objectives: [
      'Mettre en œuvre une démarche de diagnostic méthodique (du physique vers le réseau).',
      'Utiliser les outils : inspecteur, bilan de liaison, ping / traceroute, journal.',
      'Corriger des défauts radio, de câblage et de configuration réseau.',
      'Rédiger un rapport d’intervention.',
    ],
    releves: [["Défaut n° 1 : symptôme / cause / correction", ""], ["Défaut n° 2 : symptôme / cause / correction", ""], ["Défaut n° 3 : symptôme / cause / correction", ""], ["Défaut n° 4 : symptôme / cause / correction", ""], ["Défaut n° 5 : symptôme / cause / correction", ""], ["Tests finaux : liaisons vertes / flux OK", "/ 5 · / 3"]],
    steps: [
      {
        title: 'Faire l’état des lieux',
        html: '<p>Sans rien modifier, relevez : les liaisons rouges ou orange, les flux en échec (console → Flux de trafic) et les messages de l’inspecteur pour chaque liaison.</p>',
        question: 'Dressez la liste des symptômes. Dans quel ordre allez-vous traiter les problèmes ? (Pensez au chemin du trafic, du cœur de réseau vers les sites.)',
        check: (api) => {
          const fl = allFlows(api);
          const radio = api.links().filter((l) => ['fh', 'blr', 'vsat'].includes(l.medium));
          return { ok: true, msg: `Liaisons radio en défaut : ${radio.filter((l) => l.state.status !== 'optimal').length}/${radio.length} · flux en échec : ${fl.filter((x) => x.status !== 'ok').length}/${fl.length}.` };
        },
      },
      {
        title: 'Rétablir le bond Siège ↔ Relais',
        html: '<p>Sélectionnez le faisceau Siège ↔ Relais. Lisez attentivement les messages de l’inspecteur et le bilan de liaison, puis corrigez.</p>',
        question: 'Quel était le défaut ? Quel en était le symptôme dans le bilan de liaison ?',
        check: (api) => {
          const s = st(api, 'Pylône Siège', 'Pylône Relais');
          const pol = api.node('ANT Siège').props.polarization === api.node('ANT Relais 1').props.polarization;
          return { ok: !!s && pol && s.status === 'optimal', msg: s ? `Siège ↔ Relais : ${statusTxt(s)}${s.budgets ? ` · marge ${f(fhMargin(s))} dB` : ''}.` : '—' };
        },
      },
      {
        title: 'Rétablir le bond Relais ↔ Ville',
        html: '<p>Même démarche pour le second faisceau.</p>',
        question: 'Quel était le défaut ? Pourquoi la liaison était-elle totalement coupée et non simplement dégradée ?',
        check: (api) => {
          const s = st(api, 'Pylône Relais', 'Pylône Ville');
          return { ok: !!s && s.status === 'optimal', msg: s ? `Relais ↔ Ville : ${statusTxt(s)}.` : '—' };
        },
      },
      {
        title: 'Rétablir le service de l’entreprise (BLR)',
        html: '<p>Les liaisons radio de la Ville fonctionnent, mais le flux de l’entreprise échoue encore. Lisez la cause dans la console (onglet Flux de trafic) et faites un ping depuis le PC de l’entreprise.</p>',
        question: 'Quel était le défaut ? Pourquoi les couleurs des faisceaux ne permettaient-elles pas de le voir ?',
        check: (api) => {
          const fl = allFlows(api).find((x) => x.name === 'Entreprise → Internet');
          return { ok: !!fl && fl.status === 'ok', msg: fl ? `Flux entreprise : ${fl.status === 'ok' ? 'OK' : fl.reason}` : '—' };
        },
      },
      {
        title: 'Rétablir la liaison VSAT de la mine',
        html: '<p>Sélectionnez la liaison satellite de la mine. Deux défauts se cumulent sur cette station : examinez la chaîne d’équipements <b>et</b> l’onglet Profil &amp; Fresnel (pointage).</p>',
        question: 'Quels étaient les deux défauts ? Lequel empêchait la réception, lequel dégradait les deux sens de transmission ?',
        check: (api) => {
          const l = api.link('GEO 7°E', 'VSAT Mine');
          const s = l && l.state;
          const fl = allFlows(api).find((x) => x.name === 'Mine → Internet');
          const ok = s && s.status === 'optimal' && fl && fl.status === 'ok';
          return { ok: !!ok, msg: s ? `VSAT mine : ${statusTxt(s)}${s.errors ? ` · erreur de pointage ${f(s.result.pointing.errorDeg, 2)}°` : ''}${s.chain && !s.chain.lnb ? ' · LNB non raccordé' : ''}.` : '—' };
        },
      },
      {
        title: 'Vérification finale et rapport',
        html: '<p>Vérifiez que tous les flux sont OK et que toutes les liaisons radio sont vertes. Faites un ping de chaque site vers Internet. Sauvegardez la topologie corrigée.</p>',
        question: 'Rédigez le rapport d’intervention : pour chaque défaut, le symptôme, la cause, la correction et une mesure de prévention.',
        check: (api) => {
          const fl = allFlows(api);
          const radio = api.links().filter((l) => ['fh', 'blr', 'vsat'].includes(l.medium));
          const ok = fl.every((x) => x.status === 'ok') && radio.every((l) => l.state.status === 'optimal') && !!api.stats().save;
          return { ok, msg: `Flux OK ${fl.filter((x) => x.status === 'ok').length}/${fl.length} · liaisons vertes ${radio.filter((l) => l.state.status === 'optimal').length}/${radio.length}${api.stats().save ? ' · sauvegardé ✔' : ' · sauvegardez la topologie'}.` };
        },
      },
    ],
    conclusion:
      '<p>Un diagnostic efficace suit le chemin du trafic et procède <b>couche par couche</b> : physique / radio (alignement, polarisation, fréquences, câblage), puis liaison (VLAN, trunks), puis réseau (routage, adressage). Chaque intervention se termine par des <b>tests de bout en bout</b> et un <b>rapport</b> qui permet d’éviter que le défaut se reproduise.</p>',
    build() {
      return reseauRegional(false);
    },
  });

  /* =================== TP 13 =================== */
  LABS.push({
    id: 'tp13',
    num: 'TP 13',
    title: 'Constellation LEO : défilement, handover et Doppler',
    subtitle: 'Horloge de simulation, satellite servant, trous de couverture, comparaison MEO',
    duration: '2 h',
    tags: ['vsat', 'ip'],
    mode: 'design',
    context:
      '<p>Le site minier du TP 5 est désormais raccordé par une <b>constellation en orbite basse (LEO, 550 km)</b>, du type Starlink ou OneWeb. Un satellite LEO fait le tour de la Terre en environ <b>95 minutes</b> : vu du sol, il traverse le ciel en quelques minutes. Le terminal doit donc <b>changer de satellite (handover)</b> en permanence et compenser l’<b>effet Doppler</b>.</p><p>Le satellite est réglé en <b>défilement réel</b> : une <b>horloge de simulation</b> (▶ dans la barre d’outils du canevas) fait avancer le temps.</p>',
    objectives: [
      'Observer le défilement d’un satellite LEO et le changement de satellite servant (handover).',
      'Mesurer la variation de l’élévation, de la distance et de la latence pendant un passage.',
      'Relier le nombre de satellites par plan à la continuité de la couverture.',
      'Calculer et interpréter le décalage Doppler.',
      'Comparer une constellation LEO et une constellation MEO.',
    ],
    releves: [["Période orbitale LEO", "min"], ["Écart entre deux satellites (24 par plan)", "min"], ["Durée de visibilité d’un satellite", "min"], ["Nombre de handovers en 30 min", ""], ["RTT minimal / maximal pendant un passage", "ms"], ["Élévation minimale / maximale du satellite servant", "°"], ["Doppler maximal en réception (bande Ku)", "kHz"], ["Avec 8 satellites par plan : écart entre satellites", "min"], ["Avec 8 satellites par plan : durée d’un trou de couverture", "min"], ["RTT en orbite MEO", "ms"]],
    steps: [
      {
        title: 'Lancer l’horloge de simulation',
        html: '<p>Dans la barre d’outils du canevas, cliquez sur <b>▶</b> (vitesse <b>×60</b> : une seconde réelle = une minute simulée). Observez le satellite qui traverse la bande orbitale LEO et l’étiquette du faisceau (RTT).</p>',
        question: 'Relevez la période orbitale, l’écart entre deux satellites et la durée de visibilité d’un satellite (onglet Profil & Fresnel de la liaison satellite). La couverture est-elle continue ?',
        check: (api) => {
          const t = api.simTime();
          const s = api.link('Constellation LEO', 'Terminal LEO');
          return { ok: t >= 300, msg: t >= 300 ? `Horloge à T+${f(t / 60, 0)} min · ${s && s.state.label ? s.state.label : ''}` : `T+${f(t / 60, 1)} min : laissez tourner l’horloge au moins 5 minutes simulées.` };
        },
      },
      {
        title: 'Observer un handover',
        html: '<p>Laissez tourner l’horloge et surveillez le <b>Journal d’événements</b> : chaque changement de satellite servant y est noté. Sélectionnez la liaison <b>Constellation LEO ↔ Terminal LEO</b>, onglet <b>Profil &amp; Fresnel</b> : le graphique montre l’élévation et le RTT dans le temps, avec les handovers en pointillés violets.</p>',
        question: 'À quel moment le terminal change-t-il de satellite ? Combien de handovers comptez-vous en 30 minutes ? Que se passe-t-il pour les communications pendant un handover ?',
        check: (api) => {
          const h = api.satHistory('Constellation LEO');
          return { ok: !!h && h.handovers >= 1, msg: h ? `Handovers observés : ${h.handovers} · trous de couverture : ${h.gaps}.` : '—' };
        },
      },
      {
        title: 'Mesurer la variation de la latence',
        html: '<p>Faites un <b>ping</b> du <b>Site minier</b> vers <b>Internet</b> à plusieurs moments (satellite haut, satellite bas sur l’horizon). Le tableau « RTT min → max » du graphique se met à jour.</p>',
        question: 'Entre quelles valeurs le RTT varie-t-il ? Expliquez cette variation à partir de la distance station–satellite (élévation haute ou basse).',
        check: (api) => {
          const h = api.satHistory('Constellation LEO');
          const ok = h && Number.isFinite(h.rttMin) && h.rttMax - h.rttMin >= 3;
          return { ok: !!ok, msg: h && Number.isFinite(h.rttMin) ? `RTT de ${f(h.rttMin, 1)} à ${f(h.rttMax, 1)} ms · élévation de ${f(h.elMin, 0)} à ${f(h.elMax, 0)}°.` : 'Laissez tourner l’horloge.' };
        },
      },
      {
        title: 'Une constellation trop clairsemée',
        html: '<p>Sélectionnez le satellite et réglez <b>Satellites par plan orbital</b> sur <b>8</b>. Relancez l’horloge et observez le faisceau et le journal.</p>',
        question: 'Que se passe-t-il ? Calculez le nombre minimal de satellites par plan pour une couverture continue (période / durée de visibilité). Pourquoi les constellations réelles comptent-elles des centaines, voire des milliers de satellites ?',
        check: (api) => {
          const n = Number(api.node('Constellation LEO').props.satsPerPlane);
          const h = api.satHistory('Constellation LEO');
          return { ok: n <= 10 && h && h.gaps >= 1, msg: n > 10 ? 'Réglez 8 satellites par plan.' : `${n} satellites par plan · trous de couverture observés : ${h ? h.gaps : 0}.` };
        },
      },
      {
        title: 'Calculer l’effet Doppler',
        html: '<p>Remettez <b>24</b> satellites par plan. Onglet <b>Bilan de liaison</b> (section Géométrie) ou <b>Profil &amp; Fresnel</b> : relevez la vitesse radiale et le décalage Doppler à plusieurs moments d’un passage.</p><div class="formula">Δf = −f · v_r / c</div>',
        question: 'Quel est le décalage Doppler maximal en réception à 11,7 GHz ? Quand est-il nul ? Pourquoi un modem LEO doit-il le compenser en permanence, alors que c’est inutile en GEO ?',
        check: (api) => {
          const n = Number(api.node('Constellation LEO').props.satsPerPlane);
          const h = api.satHistory('Constellation LEO');
          const ok = n >= 20 && h && h.dopplerMaxKHz > 100 && api.stats().tab_profile;
          return { ok: !!ok, msg: n < 20 ? 'Remettez 24 satellites par plan.' : `Doppler maximal observé : ${h ? f(h.dopplerMaxKHz, 0) : '—'} kHz${api.stats().tab_profile ? '' : ' · ouvrez l’onglet Profil & Fresnel'}.` };
        },
      },
      {
        title: 'Comparer avec une orbite MEO',
        html: '<p>Choisissez l’orbite <b>MEO</b> (8 062 km) pour le satellite. Laissez tourner l’horloge (vitesse ×300) et refaites un ping.</p>',
        question: 'Comparez le RTT, la durée de visibilité, la fréquence des handovers et le Doppler entre LEO et MEO. Quels sont les avantages et les inconvénients de chaque orbite ?',
        check: (api) => {
          const sat = api.node('Constellation LEO');
          const s = api.link('Constellation LEO', 'Terminal LEO');
          const rtt = s && s.state.result ? s.state.result.latency.rttMs : 0;
          return { ok: sat.props.orbit === 'MEO' && rtt > 100, msg: sat.props.orbit !== 'MEO' ? 'Passez le satellite en orbite MEO.' : `MEO : RTT ${f(rtt, 0)} ms.` };
        },
      },
    ],
    conclusion:
      '<p>En orbite basse, la latence est faible (≈ 30 ms) mais chaque satellite n’est visible que quelques minutes : il faut des <b>handovers</b> fréquents, une <b>compensation du Doppler</b> (plusieurs centaines de kHz en bande Ku) et une <b>constellation dense</b> pour une couverture continue. Le MEO est un compromis : moins de satellites, des passages plus longs, une latence d’environ 120 ms. Le GEO, immobile, ne demande ni poursuite ni handover, au prix d’une latence d’environ 550 ms.</p>',
    build() {
      const nodes = [
        N('satellite', 'Constellation LEO', 520, 200, { orbit: 'LEO', band: 'Ku', motion: 'moving', satsPerPlane: 24, passMaxElevDeg: 75 }),
        N('hub', 'Passerelle LEO', 230, 560, { coordMode: 'manual', lat: 12.37, lon: -1.53, dishM: 4.5, hpaW: 100 }),
        N('router', 'Routeur cœur', 120, 690, { loopback: '10.255.0.1' }),
        N('internet', 'Internet', 120, 830, { ip: '10.10.0.1', prefix: 24 }),
        N('vsatAntenna', 'Terminal LEO', 760, 540, { coordMode: 'manual', lat: 14.2, lon: -0.4, dishM: 0.75, groundM: 280 }),
        N('buc', 'BUC LEO', 700, 640, { powerW: 4 }),
        N('lnb', 'LNB LEO', 820, 640, { nfDb: 0.8 }),
        N('vsatModem', 'Modem LEO', 760, 740, { retSymbolRate: 4, retMaxModcod: '16APSK 3/4' }),
        N('ruralSite', 'Site minier', 900, 830, { ip: '10.20.0.10', prefix: 24 }),
      ];
      const links = [
        Lk('Constellation LEO', 'Passerelle LEO'),
        Lk('Constellation LEO', 'Terminal LEO'),
        Lk('Terminal LEO', 'BUC LEO'),
        Lk('Terminal LEO', 'LNB LEO'),
        Lk('BUC LEO', 'Modem LEO'),
        Lk('LNB LEO', 'Modem LEO'),
        Lk('Modem LEO', 'Site minier'),
        Lk('Passerelle LEO', 'Routeur cœur', { capacityMbps: 10000 }, 'fiber'),
        Lk('Routeur cœur', 'Internet', { capacityMbps: 10000 }, 'fiber'),
      ];
      return { settings: { scaleKm: 2, rainMmH: 0 }, nodes, links, flows: [Fl('Site minier', 'Internet', 5, 'data', 'Données exploitation'), Fl('Site minier', 'Internet', 0.2, 'voice', 'Téléphonie IP')] };
    },
  });

  /* =================== TP 14 =================== */
  const av14 = (api) => {
    const s = st(api, 'ANT-NORD', 'ANT-SUD');
    return s && s.availability ? s : null;
  };
  LABS.push({
    id: 'tp14',
    
    num: 'TP 14',
    title: 'Disponibilité d’un bond long et diversité d’espace',
    subtitle: 'Bond de 50 km à 6 GHz, trajets multiples (UIT-R P.530), objectif 99,99 %, configuration 1+1 SD',
    duration: '2 h',
    tags: ['fh'],
    mode: 'design',
    context:
      '<p>Un opérateur relie deux relais de la dorsale nationale par un <b>bond de 50 km à 6 GHz</b>, en zone soudano-sahélienne. Le cahier des charges impose que le <b>débit nominal (256QAM)</b> soit disponible <b>99,99 % du temps</b>, soit moins de <b>53 minutes</b> de dégradation par an.</p><p>Sur un bond aussi long, la pluie gêne peu à 6 GHz. Le danger vient des <b>évanouissements par trajets multiples</b> : la nuit et au petit matin, les couches d’air chaud et humide font arriver le signal par plusieurs chemins, qui s’annulent par moments. La recommandation <b>UIT-R P.530</b> permet de calculer le pourcentage de temps de coupure.</p>',
    objectives: [
      'Lire le calcul de disponibilité UIT-R P.530 : facteur géoclimatique K, facteur p0, marge, conversion annuelle.',
      'Relier la disponibilité à la marge au fading et au climat.',
      'Comparer deux solutions : antennes plus grandes ou diversité d’espace.',
      'Calculer le facteur d’amélioration de la diversité d’espace et choisir l’écart entre antennes.',
    ],
    releves: [["Marge au fading (256QAM)", "dB"], ["Facteur d’occurrence p0", "%"], ["Disponibilité initiale du débit nominal", "%"], ["Coupure annuelle initiale", "min"], ["Disponibilité en climat côtier humide", "%"], ["Disponibilité avec antennes de 1,8 m", "%"], ["Facteur d’amélioration I (S = 10 m)", ""], ["Disponibilité avec diversité S = 10 m", "%"], ["Facteur I et disponibilité avec S = 5 m / 15 m", ""], ["Part de la pluie dans l’indisponibilité", "%"]],
    steps: [
      {
        title: 'Lire le bilan et la disponibilité',
        html: '<p>Sélectionnez le bond <b>ANT-NORD ↔ ANT-SUD</b>, onglet <b>Bilan de liaison</b>. Faites défiler jusqu’à la section <b>Disponibilité annuelle (UIT-R P.530)</b>.</p><div class="formula">p0 = K · d^3,1 · (1 + |εp|)^−1,29 · f^0,8 · 10^(−0,00089·hL)   ;   pw = p0 · 10^(−A/10)</div>',
        question: 'Relevez la marge au fading, le facteur p0, la disponibilité du débit nominal et la durée de coupure annuelle. L’objectif de 99,99 % est-il atteint ? Pourquoi p0 est-il si élevé ?',
        check: (api) => {
          const s = av14(api);
          if (!s) return { ok: false, msg: 'Bond introuvable.' };
          const a = s.availability.ab;
          return { ok: !!api.stats().tab_budget, msg: `Marge ${f(a.nominal.margin, 1)} dB · p0 = ${f(a.nominal.mp.p0, 1)} % · disponibilité ${f(a.nominal.availPct, 4)} %${api.stats().tab_budget ? '' : ' · ouvrez l’onglet Bilan de liaison'}` };
        },
      },
      {
        title: 'Influence du climat',
        html: '<p>Cliquez sur le <b>fond du canevas</b> : les réglages du projet s’affichent. Choisissez le climat <b>Côtier humide</b>, relevez la disponibilité, puis revenez au climat <b>Soudano-sahélien</b>.</p>',
        question: 'Comment varient K, p0 et la disponibilité en climat côtier ? Expliquez avec le gradient de réfractivité dN1.',
        check: (api) => {
          const c = api.settings().climate || 'soudanien';
          const seen = api.stats().climate_cotier;
          return { ok: !!seen && c === 'soudanien', msg: !seen ? 'Choisissez le climat côtier humide.' : c !== 'soudanien' ? 'Revenez au climat soudano-sahélien.' : 'Comparaison des climats faite.' };
        },
      },
      {
        title: 'Première solution : des antennes plus grandes',
        html: '<p>Remplacez les deux antennes de 1,2 m par des antennes de <b>1,8 m</b>.</p>',
        question: 'De combien de dB la marge augmente-t-elle ? La disponibilité atteint-elle l’objectif ? Quels sont les inconvénients d’antennes plus grandes (poids, prise au vent, pylône, coût) ?',
        check: (api) => {
          const s = av14(api);
          const ok = Number(api.node('ANT-NORD').props.diameterM) >= 1.8 && Number(api.node('ANT-SUD').props.diameterM) >= 1.8;
          return { ok, msg: ok ? `Antennes 1,8 m : marge ${f(s.availability.ab.nominal.margin, 1)} dB · disponibilité ${f(s.availWorst, 4)} %.` : 'Passez les deux antennes à 1,8 m.' };
        },
      },
      {
        title: 'Deuxième solution : la diversité d’espace',
        html: '<p>Remettez des antennes de <b>1,2 m</b>. Sélectionnez le lien radio <b>ANT-NORD ↔ ANT-SUD</b> et choisissez la configuration <b>1+1 HSB + diversité d’espace (SD)</b>, avec un écart <b>S = 10 m</b>.</p><div class="formula">P_SD = P_1+0 / I     avec I = facteur d’amélioration (UIT-R P.530, § 6.2.4)</div>',
        question: 'Relevez η, k² et le facteur d’amélioration I. Quelle est la nouvelle disponibilité ? Expliquez pourquoi deux antennes écartées verticalement s’évanouissent rarement en même temps.',
        check: (api) => {
          const s = av14(api);
          const l = api.link('ANT-NORD', 'ANT-SUD');
          const small = Number(api.node('ANT-NORD').props.diameterM) <= 1.2 && Number(api.node('ANT-SUD').props.diameterM) <= 1.2;
          const ok = small && l.props.protection === '1+1 SD' && Number(l.props.sdSpacingM) === 10 && s.availWorst >= 99.99;
          return { ok, msg: !small ? 'Remettez des antennes de 1,2 m.' : l.props.protection !== '1+1 SD' ? 'Choisissez la configuration 1+1 SD.' : `S = ${l.props.sdSpacingM} m · I = ${f(s.availability.ab.nominal.div ? s.availability.ab.nominal.div.I : 1, 1)} · disponibilité ${f(s.availWorst, 4)} %.` };
        },
      },
      {
        title: 'Choisir l’écart entre les antennes',
        html: '<p>Essayez <b>S = 5 m</b> puis <b>S = 15 m</b>, et relevez à chaque fois le facteur I et la disponibilité. Terminez avec <b>S = 15 m</b>.</p>',
        question: 'Comment I varie-t-il avec S ? Quelle limite pratique empêche d’écarter les antennes autant qu’on veut (hauteur du pylône, dégagement de Fresnel de l’antenne basse) ?',
        check: (api) => {
          const s = av14(api);
          const l = api.link('ANT-NORD', 'ANT-SUD');
          const ok = l.props.protection === '1+1 SD' && Number(l.props.sdSpacingM) === 15;
          return { ok, msg: `S = ${l.props.sdSpacingM} m · I = ${f(s.availability.ab.nominal.div ? s.availability.ab.nominal.div.I : 1, 1)} · disponibilité ${f(s.availWorst, 4)} %.` };
        },
      },
      {
        title: 'Et la pluie ?',
        html: '<p>Dans le tableau de disponibilité, comparez les colonnes <b>Trajets multiples</b> et <b>Pluie</b>. Puis réglez la pluie sur <b>100 mm/h</b> (orage violent) et observez la modulation.</p>',
        question: 'Quelle part de l’indisponibilité est due à la pluie à 6 GHz ? Que se passerait-il sur un bond de 50 km à 18 GHz ? Pourquoi les bonds longs utilisent-ils les bandes basses (6, 7, 8 GHz) ?',
        check: (api) => {
          const s = av14(api);
          return { ok: api.rain() >= 90 && s.up, msg: api.rain() >= 90 ? `Pluie ${api.rain()} mm/h : ${s.up ? 'liaison en service' : 'liaison coupée'} (${fhMod(s)}).` : 'Réglez la pluie sur 100 mm/h.' };
        },
      },
    ],
    conclusion:
      '<p>Sur un bond long en bande basse, l’indisponibilité vient surtout des <b>trajets multiples</b>, qui augmentent très vite avec la distance (d^3,1) et avec un climat chaud et humide. Augmenter la marge (antennes plus grandes) aide, mais chaque dB coûte cher. La <b>diversité d’espace</b> place une seconde antenne de réception quelques mètres plus bas : les deux signaux s’évanouissent rarement en même temps, et le temps de coupure est divisé par le facteur d’amélioration I (souvent 10 à 50). La pluie, elle, ne se combat pas par la diversité d’espace : on choisit une bande basse et une marge suffisante.</p>',
    build() {
      const nodes = [];
      const links = [];
      nodes.push(N('tower', 'Relais Nord', 100, 560, { heightM: 70, groundM: 300 }), N('tower', 'Relais Sud', 1100, 560, { heightM: 70, groundM: 285 }));
      fhSite(nodes, links, 'Relais Nord', 'NORD', 100, 560, 'left', { band: '6', txPowerDbm: 30, channelMHz: 28, lossDb: 0.3 }, { diameterM: 1.2, polarization: 'V', heightM: 65 }, { maxMod: '256QAM' });
      fhSite(nodes, links, 'Relais Sud', 'SUD', 1100, 560, 'right', { band: '6', txPowerDbm: 30, channelMHz: 28, lossDb: 0.3 }, { diameterM: 1.2, polarization: 'V', heightM: 65 }, { maxMod: '256QAM' });
      links.push(Lk('ANT-NORD', 'ANT-SUD', { protection: '1+0' }));
      nodes.push(N('router', 'Routeur Nord', 40, 700, { loopback: '10.255.0.1' }), N('router', 'Routeur Sud', 1160, 700, { loopback: '10.255.0.2' }));
      links.push(Lk('IDU-NORD', 'Routeur Nord'), Lk('IDU-SUD', 'Routeur Sud'));
      nodes.push(N('server', 'Cœur réseau', 40, 830, { ip: '10.0.0.1' }), N('gnodeb', 'Sites mobiles Sud', 1160, 830, { ip: '10.0.0.20' }));
      links.push(Lk('Routeur Nord', 'Cœur réseau'), Lk('Routeur Sud', 'Sites mobiles Sud'));
      return { settings: { scaleKm: 2.5, rainMmH: 0, climate: 'soudanien', availObjective: 99.99 }, nodes, links, flows: [Fl('Sites mobiles Sud', 'Cœur réseau', 150, 'data', 'Trafic agrégé des sites mobiles'), Fl('Sites mobiles Sud', 'Cœur réseau', 10, 'voice', 'Voix')] };
    },
  });

  /* =================== TP 15 =================== */
  const HOPS15 = [
    ['FO-NŒUD-E1', 'FO-EST-1'],
    ['FO-NŒUD-E2', 'FO-EST-2'],
    ['FO-NŒUD-O', 'FO-OUEST'],
  ];
  const hops15 = (api) => HOPS15.map(([a, b]) => ({ a, b, s: st(api, a, b) }));
  /** C/I minimal (dB) d'un bond, sur ses deux sens (Infinity sans brouilleur). */
  const ci15 = (s) => (s && s.budgets ? Math.min(...['ab', 'ba'].map((k) => (s.budgets[k].ciExtDb === null ? Infinity : s.budgets[k].ciExtDb))) : -Infinity);
  const ciTxt = (v) => (v === Infinity ? 'aucun brouilleur' : Number.isFinite(v) ? f(v, 1) + ' dB' : '—');
  /** Demi-bande d'émission effective des trois ODU du nœud (lue dans l'état des bonds). */
  const nodeHalves15 = (api) => hops15(api).map((h) => (h.s && h.s.freq ? h.s.freq[h.s.ends.A.node.name === h.a ? 'A' : 'B'].half : null));
  LABS.push({
    id: 'tp15',
    
    num: 'TP 15',
    title: 'Plan de fréquences d’un nœud hertzien et interférences',
    subtitle: 'Nœud à 3 directions en 15 GHz : règle haut / bas, canaux, polarisation, réutilisation, C/I',
    duration: '2 h',
    tags: ['fh'],
    mode: 'design',
    context:
      '<p>Un <b>nœud hertzien</b> (pylône central) dessert trois sites en <b>15 GHz</b> : deux vers l’est, presque dans la même direction (≈ 12° d’écart), et un vers l’ouest. Pour économiser le spectre (licence coûteuse), l’opérateur souhaite utiliser le <b>moins de canaux possible</b>.</p><p>Un stagiaire a configuré les radios Full-Outdoor, mais plusieurs bonds fonctionnent mal. Le <b>calcul des interférences</b> est activé : chaque récepteur subit les émetteurs des autres bonds. Votre mission : établir un <b>plan de fréquences</b> sans brouillage (<b>C/I ≥ 30 dB</b> sur tous les récepteurs).</p>',
    objectives: [
      'Lire un plan de fréquences : demi-bandes basse / haute, canaux, polarisations.',
      'Appliquer la règle haut / bas d’un site (toutes les émissions d’un pylône dans la même demi-bande).',
      'Calculer un rapport C/I à partir de la discrimination angulaire des antennes.',
      'Séparer deux bonds proches par le canal ou la polarisation, et réutiliser un canal grâce à la directivité.',
    ],
    releves: [["Bonds dégradés ou coupés au départ", ""], ["C/I au nœud (réception depuis l’ouest), au départ", "dB"], ["Demi-bandes d’émission des 3 ODU du nœud", ""], ["Écart angulaire Est-1 / Est-2 vu du nœud", "°"], ["Gain hors axe G(12°) de l’antenne 0,6 m", "dBi"], ["C/I à Est-1 avant séparation", "dB"], ["C/I à Est-1 après changement de canal ou de polarisation", "dB"], ["C/I du bond Ouest (canal réutilisé)", "dB"], ["Nombre de canaux utilisés dans le plan final", ""], ["C/I minimal sous 50 mm/h de pluie", "dB"]],
    steps: [
      {
        title: 'État des lieux',
        html: '<p>Observez les trois bonds. Sélectionnez le bond <b>FO-NŒUD-O ↔ FO-OUEST</b>, onglet <b>Bilan de liaison</b>, sens <b>Site Ouest → Nœud</b>. Faites défiler jusqu’aux sections <b>Plan de fréquences</b> et <b>Brouilleurs reçus</b>.</p>',
        question: 'Quels bonds sont dégradés ou coupés ? Qui brouille le récepteur du nœud qui écoute le site Ouest ? Relevez la demi-bande d’émission des trois ODU du nœud : que remarquez-vous ?',
        check: (api) => {
          const bad = hops15(api).filter((h) => !h.s || h.s.status !== 'optimal').length;
          return { ok: !!api.stats().tab_budget, msg: `${bad} bond(s) sur 3 dégradé(s) ou coupé(s)${api.stats().tab_budget ? '' : ' · ouvrez l’onglet Bilan de liaison'}.` };
        },
      },
      {
        title: 'Appliquer la règle haut / bas',
        html: '<p>Sur un même pylône, un émetteur et un récepteur réglés sur la <b>même demi-bande</b> se brouillent fortement : quelques mètres seulement les séparent. <b>Toutes les ODU d’un site doivent émettre dans la même demi-bande.</b></p><p>Réglez la <b>demi-bande d’émission</b> des trois ODU du nœud sur <b>Haute</b>. Les sites distants (en « Automatique ») passent alors en demi-bande basse.</p>',
        question: 'Pourquoi un émetteur et un récepteur du même pylône ne doivent-ils jamais utiliser la même demi-bande ? Quel C/I obtient-on maintenant au nœud ?',
        check: (api) => {
          const hv = nodeHalves15(api);
          const ok = hv.every((x) => x === 'high');
          return { ok, msg: `Demi-bandes d’émission du nœud : ${hv.map((x) => (x === 'high' ? 'haute' : x === 'low' ? 'basse' : '—')).join(' / ')}.` };
        },
      },
      {
        title: 'Séparer les deux bonds vers l’est',
        html: '<p>Les bonds <b>Est-1</b> et <b>Est-2</b> partent presque dans la même direction (≈ 12° d’écart) sur le <b>même canal</b> et la <b>même polarisation</b>. L’antenne du nœud vers Est-2 rayonne encore vers Est-1, seulement atténuée par son diagramme de rayonnement.</p><p>Supprimez ce brouillage, au choix : passez le bond Est-2 sur le <b>canal 2</b> (aux deux extrémités), ou en polarisation <b>H</b> (aux deux extrémités).</p><div class="formula">C/I ≈ G(0°) − G(12°)   (même puissance, même distance)</div>',
        question: 'Calculez la discrimination angulaire G(0°) − G(12°) de l’antenne 0,6 m. Quelle solution avez-vous choisie et quel C/I obtenez-vous ? Comparez les deux solutions (spectre consommé, XPD).',
        check: (api) => {
          const h = hops15(api);
          const ci = Math.min(ci15(h[0].s), ci15(h[1].s));
          const ok = ci >= 30 && h.every((x) => x.s && x.s.status === 'optimal');
          return { ok, msg: `C/I minimal des bonds Est : ${ciTxt(ci)} · ${h.map((x) => x.b + ' ' + fhMod(x.s)).join(' · ')}.` };
        },
      },
      {
        title: 'Réutiliser un canal vers l’ouest',
        html: '<p>Le bond Ouest utilise le <b>même canal 1</b> que le bond Est-1, dans la direction opposée (180°). Vérifiez dans le tableau des brouilleurs du bond Ouest que ce n’est pas gênant.</p>',
        question: 'Quel est le gain de l’antenne du nœud à 180° (rayonnement arrière) ? Quel C/I en résulte ? Expliquez pourquoi un même canal peut être réutilisé dans des directions bien séparées. Combien de canaux le plan final utilise-t-il ?',
        check: (api) => {
          const h = hops15(api);
          const sameCh = h[2].s && h[0].s && h[2].s.freq && h[0].s.freq && h[2].s.freq.A.ch === h[0].s.freq.A.ch;
          const ci = ci15(h[2].s);
          return { ok: !!sameCh && ci >= 30, msg: !sameCh ? 'Gardez le canal 1 sur les bonds Est-1 et Ouest.' : `Bond Ouest sur le même canal qu’Est-1 : C/I ${ciTxt(ci)}.` };
        },
      },
      {
        title: 'Vérifier le plan sous la pluie',
        html: '<p>Réglez la pluie sur <b>50 mm/h</b>. Observez les modulations et les C/I.</p>',
        question: 'Le plan de fréquences reste-t-il valable sous la pluie ? Pourquoi le C/I d’un brouilleur venant de la même direction que le signal utile ne change-t-il presque pas ? Remplissez le plan de fréquences final (bond, demi-bandes, canal, polarisation).',
        check: (api) => {
          const h = hops15(api);
          const ci = Math.min(...h.map((x) => ci15(x.s)));
          return { ok: api.rain() >= 45 && ci >= 25 && h.every((x) => x.s && x.s.up), msg: api.rain() < 45 ? 'Réglez la pluie sur 50 mm/h.' : `Pluie ${api.rain()} mm/h · C/I minimal ${ciTxt(ci)} · ${h.map((x) => x.b + ' ' + fhMod(x.s)).join(' · ')}.` };
        },
      },
    ],
    conclusion:
      '<p>Un plan de fréquences repose sur quatre règles :</p><ol><li><b>Règle haut / bas</b> : sur un même site, toutes les émissions sont dans la même demi-bande, sinon un émetteur aveugle le récepteur voisin.</li><li>Deux bonds <b>proches en direction</b> doivent être séparés par le <b>canal</b> ou la <b>polarisation</b> : la discrimination angulaire de l’antenne ne suffit pas sous 20 à 30°.</li><li>Grâce à la <b>directivité</b> des paraboles, un même canal peut être <b>réutilisé</b> dans des directions bien séparées (ici à 180°).</li><li>On vérifie toujours le <b>C/I ≥ 30 dB</b> (en pratique un seuil de dégradation inférieur à 1 dB).</li></ol><p>En exploitation, l’ARCEP ou l’ARCE (régulateurs nationaux) attribue les canaux et vérifie la compatibilité avec les autres opérateurs.</p>',
    build() {
      const nodes = [];
      const links = [];
      const fo = { band: '15', txPowerDbm: 20, channelMHz: 28, diameterM: 0.6, polarization: 'V', acm: true, maxMod: '256QAM', channelNo: 1 };
      // Nœud central et trois sites (échelle 2 km par carreau : 25 px = 1 km)
      nodes.push(
        N('tower', 'Nœud central', 560, 520, { heightM: 45, groundM: 310 }),
        N('tower', 'Site Est-1', 858, 494, { heightM: 30, groundM: 300 }),
        N('tower', 'Site Est-2', 808, 550, { heightM: 30, groundM: 305 }),
        N('tower', 'Site Ouest', 210, 520, { heightM: 30, groundM: 300 })
      );
      nodes.push(
        N('fullOutdoor', 'FO-NŒUD-E1', 625, 470, Object.assign({ siteId: 'Nœud central', heightM: 42, txHalf: 'high' }, fo)),
        N('fullOutdoor', 'FO-NŒUD-E2', 600, 560, Object.assign({ siteId: 'Nœud central', heightM: 40, txHalf: 'high' }, fo)),
        N('fullOutdoor', 'FO-NŒUD-O', 495, 470, Object.assign({ siteId: 'Nœud central', heightM: 42, txHalf: 'low' }, fo)),
        N('fullOutdoor', 'FO-EST-1', 900, 440, Object.assign({ siteId: 'Site Est-1', heightM: 28, txHalf: 'auto' }, fo)),
        N('fullOutdoor', 'FO-EST-2', 790, 610, Object.assign({ siteId: 'Site Est-2', heightM: 28, txHalf: 'auto' }, fo)),
        N('fullOutdoor', 'FO-OUEST', 250, 470, Object.assign({ siteId: 'Site Ouest', heightM: 28, txHalf: 'auto' }, fo))
      );
      links.push(Lk('FO-NŒUD-E1', 'FO-EST-1'), Lk('FO-NŒUD-E2', 'FO-EST-2'), Lk('FO-NŒUD-O', 'FO-OUEST'));
      nodes.push(N('switch', 'Switch nœud', 560, 660, { vlans: 'all' }), N('router', 'Routeur agrégation', 560, 790, { loopback: '10.255.0.10' }));
      links.push(Lk('FO-NŒUD-E1', 'Switch nœud'), Lk('FO-NŒUD-E2', 'Switch nœud'), Lk('FO-NŒUD-O', 'Switch nœud'), Lk('Switch nœud', 'Routeur agrégation', { capacityMbps: 10000 }, 'fiber'));
      nodes.push(N('gnodeb', 'gNodeB Est-1', 1010, 400, { ip: '10.0.0.21' }), N('gnodeb', 'gNodeB Est-2', 900, 680, { ip: '10.0.0.22' }), N('gnodeb', 'gNodeB Ouest', 110, 420, { ip: '10.0.0.23' }), N('server', 'Cœur réseau', 700, 860, { ip: '10.0.0.1' }));
      links.push(Lk('FO-EST-1', 'gNodeB Est-1'), Lk('FO-EST-2', 'gNodeB Est-2'), Lk('FO-OUEST', 'gNodeB Ouest'), Lk('Routeur agrégation', 'Cœur réseau', { capacityMbps: 10000 }, 'fiber'));
      return {
        settings: { scaleKm: 2, rainMmH: 0, interference: true, climate: 'soudanien', availObjective: 99.9 },
        nodes,
        links,
        flows: [Fl('gNodeB Est-1', 'Cœur réseau', 200, 'data', 'Est-1'), Fl('gNodeB Est-2', 'Cœur réseau', 200, 'data', 'Est-2'), Fl('gNodeB Ouest', 'Cœur réseau', 200, 'data', 'Ouest')],
      };
    },
  });

  /* =================== TP 16 =================== */
  const remaining16 = (api) => {
    const ctx = api.faultCtx();
    return api.listFaults().filter((x) => x.fault.kind === 'hw' || !MBV.Pannes.fixed(x.obj, ctx));
  };
  const flowsOk16 = (api) => allFlows(api).filter((x) => x.status === 'ok').length;
  LABS.push({
    id: 'tp16',
    num: 'TP 16',
    title: 'Astreinte : dépannage d’un réseau régional',
    subtitle: 'Pannes cachées tirées au hasard : constater, mesurer, localiser, intervenir, vérifier, rendre compte',
    duration: '2 h',
    tags: ['fh', 'blr', 'vsat', 'ip'],
    mode: 'diag',
    faults: { count: 3 },
    context:
      '<p>Vous êtes <b>technicien d’astreinte</b> pour l’opérateur régional. Le réseau (deux bonds hertziens, une boucle locale radio, une station VSAT, un cœur IP/MPLS) fonctionnait ce matin. Le centre de supervision vient de vous appeler : <b>plusieurs services sont coupés ou dégradés</b>.</p><p>Les pannes sont <b>tirées au hasard à chaque chargement du TP</b> : votre voisin n’a pas les mêmes. Elles peuvent être <b>matérielles</b> (équipement hors service, câble coupé, antenne dépointée, branchement oxydé…) ou de <b>configuration</b> (polarisation, canal, VLAN, adresse…).</p><p>Chaque déplacement sur un site coûte cher : <b>n’intervenez qu’après avoir localisé le défaut par la mesure</b>. En mode <b>Dépannage</b>, sélectionnez un équipement ou un câble : l’inspecteur affiche ses <b>voyants</b> et les <b>interventions</b> possibles.</p>',
    objectives: [
      'Appliquer une démarche de dépannage : constater, mesurer, localiser, intervenir, vérifier.',
      'Interpréter les symptômes : voyants, RSL mesuré comparé au calcul, modulation, ping et traceroute.',
      'Distinguer une panne matérielle (intervention) d’une erreur de configuration (correction d’un réglage).',
      'Rédiger un rapport d’intervention.',
    ],
    releves: [["Services coupés au départ (flux en échec)", ""], ["Liaisons en défaut et leur symptôme", ""], ["Panne 1 : symptôme, mesure, localisation, action", ""], ["Panne 2 : symptôme, mesure, localisation, action", ""], ["Panne 3 : symptôme, mesure, localisation, action", ""], ["Interventions utiles / inutiles", ""], ["Services rétablis à la fin", ""], ["Durée de l’intervention", "min"]],
    steps: [
      {
        title: 'Constater l’incident',
        html: '<p>Ouvrez l’onglet <b>Flux de trafic</b> (en bas) : quels services sont interrompus ? Repérez sur le canevas les liaisons rouges ou orange. Faites un <b>ping</b> depuis un terminal touché (outil Ping, ou bouton « Ping depuis ce terminal » de l’inspecteur).</p>',
        question: 'Quels services sont coupés ou dégradés ? Quelles liaisons sont en défaut, et avec quel symptôme (coupure, repli de modulation) ?',
        check: (api) => {
          const p = api.lastPing();
          const fl = allFlows(api);
          return { ok: !!p, msg: `${flowsOk16(api)} / ${fl.length} services en service · ${p ? 'ping fait (' + (p.success ? 'succès' : 'échec') + ')' : 'faites un ping depuis un terminal touché'}.` };
        },
      },
      {
        title: 'Mesurer et localiser',
        html: '<p>Pour chaque liaison en défaut, sélectionnez-la et ouvrez l’onglet <b>Bilan de liaison</b>. Comparez le <b>RSL mesuré</b> au <b>RSL calculé</b>, lisez les messages. Sélectionnez les équipements de chaque extrémité : regardez leurs <b>voyants</b> (alimentation, signal reçu, alarme).</p><p>Une erreur de configuration se voit dans les réglages (inspecteur) ; une panne matérielle se voit par ses symptômes.</p>',
        question: 'Pour chaque défaut : quel symptôme avez-vous mesuré, et quel élément (équipement, câble, réglage) soupçonnez-vous ? Justifiez.',
        check: (api) => {
          const measured = new Set(api.journal().filter((j) => j.kind === 'mesure').map((j) => j.target));
          const bad = api.links().filter((l) => ['fh', 'blr', 'vsat'].includes(l.medium) && l.state && l.state.status !== 'optimal');
          const todo = bad.filter((l) => !measured.has(l.id));
          const any = measured.size > 0 || api.journal().some((j) => j.kind === 'ping');
          return { ok: !todo.length && any, msg: bad.length ? `${bad.length - todo.length} / ${bad.length} liaison(s) radio en défaut mesurée(s)${todo.length ? ' : ouvrez le bilan de chacune.' : '.'}` : `Aucune liaison radio en défaut : la panne est dans le réseau IP (ping, traceroute, VLAN, adresses)${any ? '.' : ' — faites un ping.'}` };
        },
      },
      {
        title: 'Intervenir ou corriger',
        html: '<p><b>Panne matérielle</b> : sélectionnez l’élément soupçonné et choisissez l’intervention (remplacer, repointer, refaire le branchement, reprendre le câble). <b>Erreur de configuration</b> : corrigez le réglage dans l’inspecteur. Après chaque action, <b>mesurez de nouveau</b> pour vérifier son effet.</p>',
        question: 'Quelles interventions et corrections avez-vous faites ? Lesquelles étaient inutiles, et pourquoi ?',
        check: (api) => {
          const r = remaining16(api).length;
          const it = api.journal().filter((j) => j.kind === 'intervention');
          return { ok: r === 0, msg: `${r ? r + ' panne(s) encore présente(s)' : 'Toutes les pannes sont corrigées'} · ${it.length} intervention(s), dont ${it.filter((j) => !j.hit).length} inutile(s).` };
        },
      },
      {
        title: 'Vérifier les services',
        html: '<p>Vérifiez que <b>tous les flux</b> sont rétablis (onglet Flux de trafic) et refaites un ping de bout en bout. Contrôlez les bilans : modulation nominale, RSL mesuré égal au calcul.</p>',
        question: 'Tous les services sont-ils rétablis ? Quelles mesures le prouvent ?',
        check: (api) => {
          const fl = allFlows(api);
          return { ok: flowsOk16(api) === fl.length && remaining16(api).length === 0, msg: `${flowsOk16(api)} / ${fl.length} services en service.` };
        },
      },
      {
        title: 'Rédiger le rapport d’intervention',
        html: '<p>Rédigez le rapport pour le centre de supervision : heure, symptômes, mesures, causes, actions, vérifications, et une <b>action de prévention</b> par panne.</p>',
        question: 'Rédigez le rapport d’intervention (tableau : symptôme → mesure → cause → action → vérification → prévention).',
        check: (api) => {
          const it = api.journal().filter((j) => j.kind === 'intervention');
          const ok = remaining16(api).length === 0 && flowsOk16(api) === allFlows(api).length;
          return { ok, msg: ok ? `Réseau rétabli · ${it.filter((j) => j.hit).length} intervention(s) utile(s), ${it.filter((j) => !j.hit).length} inutile(s).` : 'Terminez d’abord le dépannage.' };
        },
      },
    ],
    conclusion:
      '<p>Un dépannage efficace suit toujours la même démarche : <b>constater</b> (quels services ?), <b>mesurer</b> (bilan, RSL mesuré / calculé, voyants, ping), <b>localiser</b> (quelle liaison, quelle extrémité, quel élément ?), <b>intervenir</b> (une seule action ciblée), <b>vérifier</b> (nouvelle mesure, services rétablis), puis <b>rendre compte</b>. Changer des équipements au hasard coûte cher (déplacements, matériel) et peut masquer la vraie cause.</p>',
    build() {
      return reseauRegional(true);
    },
  });

  /* ------------------------------------------------------------------
   * 3. BIBLIOTHÈQUE D'EXEMPLES (réseaux prêts à explorer, sans étapes)
   * ------------------------------------------------------------------ */
  /** Backhaul FH d'un site 4G : deux bonds en cascade (7 GHz sur 30 km, 15 GHz sur 12 km). */
  function exBackhaul() {
    const nodes = [];
    const links = [];
    nodes.push(N('tower', 'Cœur Ouaga', 150, 560, { heightM: 50, groundM: 305 }), N('tower', 'Relais Est', 900, 560, { heightM: 60, groundM: 320 }), N('tower', 'Site 4G', 1200, 560, { heightM: 35, groundM: 310 }));
    fhSite(nodes, links, 'Cœur Ouaga', 'C', 150, 560, 'left', { band: '7', txPowerDbm: 27, channelMHz: 28 }, { diameterM: 1.2, polarization: 'V', heightM: 48 }, { maxMod: '256QAM' });
    fhSite(nodes, links, 'Relais Est', 'R1', 900, 560, 'right', { band: '7', txPowerDbm: 27, channelMHz: 28 }, { diameterM: 1.2, polarization: 'V', heightM: 58 }, { maxMod: '256QAM' });
    fhSite(nodes, links, 'Relais Est', 'R2', 900, 560, 'left', { band: '15', txPowerDbm: 22, channelMHz: 28 }, { diameterM: 0.6, polarization: 'V', heightM: 55 }, { maxMod: '256QAM' });
    fhSite(nodes, links, 'Site 4G', 'S', 1200, 560, 'right', { band: '15', txPowerDbm: 22, channelMHz: 28 }, { diameterM: 0.6, polarization: 'V', heightM: 33 }, { maxMod: '256QAM' });
    nodes.push(N('server', 'Cœur réseau', 60, 720, { ip: '10.0.0.1' }), N('switch', 'SW-Relais', 900, 720, { vlans: 'all' }), N('gnodeb', 'gNodeB 4G', 1270, 720, { ip: '10.0.0.30' }));
    links.push(Lk('ANT-C', 'ANT-R1', { name: 'FH Cœur ↔ Relais (7 GHz)' }), Lk('ANT-R2', 'ANT-S', { name: 'FH Relais ↔ Site 4G (15 GHz)' }), Lk('IDU-C', 'Cœur réseau'), Lk('IDU-R1', 'SW-Relais'), Lk('IDU-R2', 'SW-Relais'), Lk('IDU-S', 'gNodeB 4G'));
    return { settings: { title: 'Exemple — Backhaul FH d’un site 4G', scaleKm: 2, rainMmH: 0 }, nodes, links, flows: [Fl('gNodeB 4G', 'Cœur réseau', 120, 'data', 'Données 4G'), Fl('gNodeB 4G', 'Cœur réseau', 10, 'voice', 'Voix sur IP')] };
  }
  /** Recette réaliste du backhaul : écarts de terrain + un branchement humide caché sur le bond 15 GHz. */
  function exRecette() {
    const t = exBackhaul();
    t.settings = Object.assign(t.settings, { title: 'Exemple — Recette du backhaul (mesures réalistes)', recette: { actif: true, seed: 20261120, tol: 3, mesures: {} } });
    const odu = t.nodes.find((n) => n.name === 'ODU-S');
    odu.props.fault = { type: 'branchement-humide', kind: 'hw', hidden: true, restore: {}, meta: { lossDb: 19 } };
    return t;
  }
  /** Réseau VSAT en étoile : un téléport et trois stations distantes (banque, école, mine). */
  function exVsatEtoile() {
    const nodes = [
      N('satellite', 'GEO 7°E', 640, 60, { orbit: 'GEO', band: 'Ku', lonDeg: 7, elevationDeg: 60 }),
      N('hub', 'Téléport Ouaga', 160, 560, { coordMode: 'manual', lat: 12.37, lon: -1.53, dishM: 7.3, hpaW: 200, lnbNfDb: 0.6 }),
      N('router', 'Routeur cœur', 80, 700, { loopback: '10.255.0.1' }),
      N('internet', 'Internet', 80, 840, { ip: '10.10.0.1', prefix: 24 }),
    ];
    const links = [Lk('Téléport Ouaga', 'Routeur cœur', { capacityMbps: 10000 }, 'fiber'), Lk('Routeur cœur', 'Internet', { capacityMbps: 10000 }, 'fiber'), Lk('GEO 7°E', 'Téléport Ouaga')];
    const flows = [];
    const sites = [
      ['Banque Dori', 14.03, -0.03, 1.2, 2, 'bankAgency', '10.30.0.10'],
      ['École Fada', 12.06, 0.36, 0.96, 2, 'pc', '10.31.0.10'],
      ['Mine Essakane', 14.38, -0.1, 1.8, 4, 'ruralSite', '10.32.0.10'],
    ];
    sites.forEach(([nm, lat, lon, dish, w, type, ip], i) => {
      const x = 520 + i * 330;
      const s = nm.split(' ')[1];
      nodes.push(
        N('vsatAntenna', 'VSAT ' + s, x, 520, { coordMode: 'manual', lat, lon, dishM: dish, autoPoint: true }),
        N('buc', 'BUC ' + s, x - 60, 620, { powerW: w }),
        N('lnb', 'LNB ' + s, x + 60, 620, { nfDb: 0.8 }),
        N('vsatModem', 'Modem ' + s, x, 720, { retSymbolRate: 1, retMaxModcod: '8PSK 3/4' }),
        N(type, nm, x + 90, 830, { ip, prefix: 24, gateway: ip.replace(/\.10$/, '.1') })
      );
      links.push(Lk('GEO 7°E', 'VSAT ' + s), Lk('VSAT ' + s, 'BUC ' + s), Lk('VSAT ' + s, 'LNB ' + s), Lk('BUC ' + s, 'Modem ' + s), Lk('LNB ' + s, 'Modem ' + s), Lk('Modem ' + s, nm));
      flows.push(Fl(nm, 'Internet', 1, 'data', nm + ' → Internet'));
    });
    return { settings: { title: 'Exemple — Réseau VSAT en étoile', scaleKm: 2, rainMmH: 0 }, nodes, links, flows };
  }
  /** Boucle locale radio 5,8 GHz d'un fournisseur d'accès : trois secteurs de 120°, six abonnés. */
  function exWisp() {
    const c = { x: 700, y: 560 };
    const nodes = [N('tower', 'Pylône WISP', c.x, c.y, { heightM: 45, groundM: 300 }), N('switch', 'SW-WISP', c.x - 220, c.y + 180, { vlans: 'all' }), N('router', 'Routeur WISP', c.x - 380, c.y + 180, { loopback: '10.255.0.5', interVlan: true }), N('internet', 'Internet', c.x - 520, c.y + 300, { ip: '10.10.0.1', prefix: 24 })];
    const links = [Lk('SW-WISP', 'Routeur WISP', { capacityMbps: 1000 }, 'fiber'), Lk('Routeur WISP', 'Internet', { capacityMbps: 10000 }, 'fiber')];
    const flows = [];
    [0, 120, 240].forEach((az, i) => {
      const bts = 'Secteur ' + (i + 1);
      nodes.push(N('blrBts', bts, c.x + 40 * Math.sin((az * Math.PI) / 180), c.y - 40 * Math.cos((az * Math.PI) / 180), { siteId: 'Pylône WISP', band: '5.8', channelMHz: 40, txPowerDbm: 24, sectorDeg: 120, azimuthDeg: az, heightM: 43, maxMod: '256QAM 5/6' }));
      links.push(Lk(bts, 'SW-WISP', { capacityMbps: 1000 }, 'fiber'));
      [-25, 25].forEach((da, k) => {
        const a = ((az + da) * Math.PI) / 180;
        const r = 160 + 90 * k + 40 * i;
        const nm = `Abonné ${i * 2 + k + 1}`;
        const x = c.x + r * Math.sin(a);
        const y = c.y - r * Math.cos(a) * 0.55;
        nodes.push(N('blrCpe', 'CPE ' + nm, x, y, { install: 'outdoor', heightM: 8 }), N('pc', nm, x + 50, y + 60, { ip: `10.40.${i}.${10 + k}`, prefix: 16, gateway: '10.40.0.1' }));
        links.push(Lk(bts, 'CPE ' + nm), Lk('CPE ' + nm, nm));
        flows.push(Fl(nm, 'Internet', 4, 'data', nm + ' → Internet'));
      });
    });
    return { settings: { title: 'Exemple — BLR 5,8 GHz à trois secteurs', scaleKm: 0.5, rainMmH: 0 }, nodes, links, flows };
  }
  /* =================== TP 17 à 21 : Direct-to-Device (NTN) =================== */
  const acc = (api, n) => api.d2dAccess(n).access;
  const d2dSt = (api, t, s) => {
    const l = api.link(t, s);
    return l && l.state && l.state.result ? l.state : null;
  };
  const LB = (txt) => `<div class="lvl-box licence"><b>Licence</b> — ${txt}</div>`;
  const MB = (txt) => `<div class="lvl-box master"><b>Master / ingénieur</b> — ${txt}</div>`;
  const D2D_LEVEL = 'Bac Pro → Licence → Master / ingénieur';

  /* =================== TP 17 =================== */
  LABS.push({
    id: 'tp17',
    
    num: 'TP 17',
    title: 'Bilan Direct-to-Device d’un smartphone : pourquoi le LEO et pas le GEO ?',
    subtitle: 'Smartphone ordinaire ↔ satellite LEO : RSRP, SNR, élévation, intérieur, liaison montante, comparaison GEO',
    duration: '2 h',
    level: D2D_LEVEL,
    tags: ['d2d'],
    mode: 'design',
    context:
      '<p>Un opérateur mobile burkinabè veut offrir le service <b>Direct-to-Cell</b> dans les zones blanches : un smartphone 4G ordinaire, sans parabole, se rattache à un <b>satellite en orbite basse</b> (525 km) qui porte une station de base 4G. Le smartphone est loin de toute BTS.</p><p>Vous allez établir le <b>bilan de liaison</b> du smartphone, comprendre pourquoi il fonctionne malgré ses 200 mW et son antenne sans gain, et pourquoi on ne peut pas faire la même chose avec un satellite géostationnaire. Choisissez le <b>niveau des calculs</b> (Bac Pro, Licence, Master) dans l’onglet Bilan de liaison.</p>',
    objectives: [
      'Identifier la chaîne Direct-to-Device : terminal, satellite, liaison de connexion, station sol, cœur mobile.',
      'Lire et vérifier un bilan descendant : FSL, PIRE, puissance reçue, RSRP, SNR.',
      'Mesurer l’influence de l’élévation et de l’emplacement du terminal (extérieur, véhicule, intérieur).',
      'Expliquer pourquoi la liaison montante d’un smartphone est limitée en puissance.',
      'Comparer orbite basse et orbite géostationnaire pour un smartphone.',
    ],
    releves: [['Distance smartphone → satellite (50°)', 'km'], ['FSL descendant', 'dB'], ['Gain de l’antenne du satellite', 'dBi'], ['PIRE du faisceau', 'dBW'], ['Puissance reçue C', 'dBm'], ['RSRP', 'dBm'], ['SNR descendant', 'dB'], ['RSRP à 25° d’élévation', 'dBm'], ['SNR montant sur 1 bloc / sur 25 blocs', 'dB'], ['RTT application en GEO', 'ms']],
    steps: [
      {
        title: 'Identifier la chaîne et le rattachement',
        html: '<p>Observez le canevas : le <b>Smartphone</b> est relié au <b>Satellite D2D</b> (lien direct), lui-même relié à la <b>Station sol NTN</b> (liaison de connexion), raccordée en fibre au <b>Cœur mobile</b>. Sélectionnez le smartphone : la ligne « Réseau utilisé » indique la cellule choisie.</p>',
        question: 'Décrivez le rôle de chaque équipement de la chaîne. Le smartphone est-il modifié ? Que se passerait-il si la fibre entre la station sol et le cœur mobile était coupée ?' + LB('Charge utile régénérative ou transparente : laquelle est utilisée ici, et qu’est-ce que cela change pour le délai ?'),
        check: (api) => {
          const a = acc(api, 'Smartphone');
          return { ok: a === 'satellite', msg: a === 'satellite' ? 'Smartphone rattaché à la cellule satellite ✔' : 'Le smartphone n’est pas rattaché au satellite : vérifiez la chaîne.' };
        },
      },
      {
        title: 'Lire le bilan descendant',
        html: '<p>Sélectionnez le lien <b>Smartphone ↔ Satellite D2D</b>, onglet <b>Bilan de liaison</b>. Relevez la distance, le FSL, le gain de l’antenne du satellite, la PIRE, la puissance reçue, le RSRP et le SNR.</p><div class="formula">C = PIRE − FSL − pertes + G_terminal        FSL = 32,45 + 20·log(d_km) + 20·log(f_MHz)</div>',
        question: 'Recalculez le FSL à la main. Pourquoi le satellite doit-il avoir une antenne de plusieurs m² ?' + LB('Calculez le G/T du smartphone (NF = 7 dB, T_ant = 290 K) et comparez-le à celui d’une antenne VSAT de 1,2 m.') + MB('Détaillez les pertes du trajet (balayage, position dans le faisceau, scintillation, ombrage, polarisation, corps) et leur origine physique.'),
        check: (api) => {
          const s = d2dSt(api, 'Smartphone', 'Satellite D2D');
          const ok = s && api.stats().tab_budget;
          return { ok: !!ok, msg: s ? (api.stats().tab_budget ? `RSRP ${f(s.result.dl.rsrpDbm, 1)} dBm · SNR ${f(s.result.dl.snrDb, 1)} dB ✔` : 'Ouvrez l’onglet Bilan de liaison du lien direct.') : '—' };
        },
      },
      {
        title: 'Influence de l’élévation',
        html: '<p>Sélectionnez le <b>Satellite D2D</b> et réglez l’<b>élévation du satellite servant</b> à <b>25°</b> (élévation minimale du système).</p>',
        question: 'Relevez la nouvelle distance, le RSRP et le SNR. Pourquoi le signal baisse-t-il quand le satellite est bas sur l’horizon ?' + MB('Calculez l’angle de visée au satellite (sin η = R·cos E / (R + h)) et la perte de balayage du réseau actif (−12·log(cos η)).'),
        check: (api) => {
          const el = Number(api.node('Satellite D2D').props.elevationDeg);
          return { ok: el <= 26, msg: el <= 26 ? `Élévation ${f(el, 0)}° ✔` : 'Réglez l’élévation à 25°.' };
        },
      },
      {
        title: 'Dans un véhicule, à l’intérieur',
        html: '<p>Remettez l’élévation à <b>50°</b>. Sélectionnez le smartphone et placez-le successivement <b>à l’intérieur d’un bâtiment</b>, puis <b>dans un véhicule</b>. Observez le lien et le tableau des services.</p>',
        question: 'Que se passe-t-il à l’intérieur ? Et dans un véhicule ? Quel conseil donner à un utilisateur en zone blanche ?',
        check: (api) => {
          const n = api.node('Smartphone');
          const el = Number(api.node('Satellite D2D').props.elevationDeg);
          const a = acc(api, 'Smartphone');
          return { ok: n.props.environment === 'vehicule' && el >= 45 && a === 'satellite', msg: el < 45 ? 'Remettez l’élévation du satellite à 50°.' : n.props.environment !== 'vehicule' ? 'Placez le smartphone dans un véhicule (après avoir essayé l’intérieur).' : `Dans le véhicule : ${a === 'satellite' ? 'service maintenu' : 'pas de service'}.` };
        },
      },
      {
        title: 'La liaison montante, point faible',
        html: '<p>Replacez le smartphone <b>en extérieur</b>. Dans ses paramètres, passez les <b>blocs de ressources montants</b> de 1 à <b>25</b>. Relevez le SNR montant dans les deux cas (rubrique Montant du bilan).</p><div class="formula">SNR = C − (k + 10·log T_sat + 10·log B)</div>',
        question: 'Pourquoi le SNR montant baisse-t-il quand on alloue plus de blocs au smartphone ? De combien de dB pour 25 fois plus de bande ?' + MB('Calculez C/N0 et le plafond de Shannon D_max = (C/N0)·log₂(e). Expliquez l’allocation optimale affichée par le simulateur et la conséquence pour l’ordonnanceur.'),
        check: (api) => {
          const n = api.node('Smartphone');
          return { ok: n.props.environment === 'exterieur' && Number(n.props.ulRb) >= 20, msg: n.props.environment !== 'exterieur' ? 'Replacez le smartphone en extérieur.' : `Blocs montants : ${n.props.ulRb || 1}${Number(n.props.ulRb) >= 20 ? ' ✔' : ' (réglez 25)'}.` };
        },
      },
      {
        title: 'Et avec un satellite géostationnaire ?',
        html: '<p>Changez le <b>système</b> du satellite pour <b>IoT / messagerie NTN par satellite GEO bande L</b>. Observez le smartphone, puis cochez sa case <b>Puce NTN 3GPP (Rel-17)</b>.</p>',
        question: 'Pourquoi le smartphone ordinaire ne trouve-t-il plus de réseau ? Avec la puce NTN, quels services restent possibles et quelle est la latence ? Comparez le FSL vers un GEO et vers le LEO.' + LB('Pourquoi un satellite GEO à réflecteur de 9 m sert-il des objets connectés, mais pas la voix d’un smartphone ?'),
        check: (api) => {
          const sat = api.node('Satellite D2D');
          const a = acc(api, 'Smartphone');
          return { ok: sat.props.profile === 'IOT_GEO' && !!api.node('Smartphone').props.ntnChip && a === 'satellite', msg: sat.props.profile !== 'IOT_GEO' ? 'Choisissez le système GEO bande L.' : !api.node('Smartphone').props.ntnChip ? 'Cochez « Puce NTN 3GPP (Rel-17) » sur le smartphone.' : `GEO : ${a === 'satellite' ? 'rattaché' : 'pas de service'}.` };
        },
      },
    ],
    conclusion: '<p>Un smartphone ordinaire peut joindre un satellite parce que tout l’effort est reporté sur le satellite : une antenne réseau de plusieurs m² (≈ 33 dBi), très proche en orbite basse (≈ 670 km). Le signal reste faible (RSRP ≈ −118 dBm) et fragile : élévation basse, véhicule ou bâtiment le dégradent. La liaison montante est limitée par les 200 mW du téléphone. En GEO, 35 dB de pertes en plus réservent le service direct aux messages et aux objets connectés.</p>',
    build() {
      const nodes = [];
      const links = [];
      d2dCore(nodes, links, 260, 780, { sats: [{ name: 'Satellite D2D', x: 620, props: { profile: 'D2C_LTE', elevationDeg: 50 } }] });
      nodes.push(ue('Smartphone', 760, 520, '10.45.0.21'));
      links.push(Lk('Smartphone', 'Satellite D2D'));
      return { settings: { scaleKm: 10, rainMmH: 0 }, nodes, links, flows: [Fl('Smartphone', 'Serveur opérateur', 0.001, 'data', 'SMS'), Fl('Smartphone', 'Serveur opérateur', 0.04, 'voice', 'Appel')] };
    },
  });

  /* =================== TP 18 =================== */
  LABS.push({
    id: 'tp18',
    
    num: 'TP 18',
    title: 'Zone blanche : couverture terrestre, bascule et services progressifs',
    subtitle: 'Rayon d’une cellule 4G rurale, seuil de bascule, partage du faisceau satellite, phases de service',
    duration: '2 h',
    level: D2D_LEVEL,
    tags: ['d2d'],
    mode: 'design',
    context: '<p>Autour de Ziniaré, une BTS 4G en bande 800 MHz couvre le bourg. Trois abonnés sont plus ou moins loin : <b>Tél. bourg</b>, <b>Tél. ferme</b> et <b>Tél. hameau</b>. Tous les smartphones sont aussi reliés au <b>satellite Direct-to-Cell</b> de l’opérateur.</p><p>Vous allez déterminer jusqu’où va la couverture terrestre, quand les téléphones basculent sur le satellite, et quels services le satellite peut offrir quand beaucoup d’abonnés le partagent.</p>',
    objectives: ['Calculer le rayon de couverture d’une cellule 4G rurale (Okumura-Hata).', 'Expliquer la priorité du réseau terrestre et le seuil de bascule.', 'Relier le nombre d’utilisateurs d’un faisceau au débit par utilisateur.', 'Classer les services en phases (SMS, messagerie, voix, données).', 'Relier la taille de la constellation à la disponibilité.'],
    releves: [['Distance Tél. ferme ↔ BTS', 'km'], ['RSRP terrestre de Tél. ferme', 'dBm'], ['Rayon de couverture de la cellule (antenne 30 m)', 'km'], ['Rayon de couverture (antenne 60 m)', 'km'], ['Débit du faisceau satellite (5 MHz)', 'Mbit/s'], ['Débit par utilisateur (30 actifs)', 'kbit/s'], ['Débit par utilisateur (300 actifs)', 'kbit/s'], ['Disponibilité avec 60 satellites', '%']],
    steps: [
      {
        title: 'Qui est couvert par la BTS ?',
        html: '<p>Sélectionnez tour à tour le lien <b>accès 4G</b> de chaque téléphone vers la <b>BTS Ziniaré</b> (onglet Bilan de liaison, puis Profil &amp; Fresnel). Relevez la distance, le RSRP terrestre et le rayon de couverture.</p>',
        question: 'Quels téléphones restent sur la 4G terrestre, lesquels basculent sur le satellite ? Pourquoi le réseau terrestre est-il prioritaire ?' + LB('Recalculez l’affaiblissement de parcours Okumura-Hata rural à la distance de Tél. ferme.'),
        check: (api) => {
          const ok = acc(api, 'Tél. bourg') === 'terrestre' && acc(api, 'Tél. hameau') === 'satellite' && api.stats().tab_profile;
          return { ok: !!ok, msg: `bourg : ${acc(api, 'Tél. bourg')} · ferme : ${acc(api, 'Tél. ferme')} · hameau : ${acc(api, 'Tél. hameau')}${api.stats().tab_profile ? '' : ' · ouvrez l’onglet Profil & Fresnel d’un lien 4G'}` };
        },
      },
      {
        title: 'Le seuil de bascule',
        html: '<p>Sélectionnez le <b>Cœur mobile</b> et descendez le <b>seuil de bascule vers le satellite</b> de −115 à <b>−125 dBm</b>.</p>',
        question: 'Que fait Tél. ferme ? Quel est l’intérêt d’un seuil bas pour l’opérateur ? Quel est le risque pour la qualité de service ?' + MB('Qu’est-ce que le « ping-pong » entre cellules ? Comment une hystérésis sur le seuil l’évite-t-elle ?'),
        check: (api) => {
          const thr = Number(api.node('Cœur mobile').props.thresholdDbm);
          return { ok: thr <= -122, msg: thr <= -122 ? `Seuil ${thr} dBm · Tél. ferme : ${acc(api, 'Tél. ferme')} ✔` : 'Réglez le seuil à −125 dBm.' };
        },
      },
      {
        title: 'Agrandir la cellule terrestre',
        html: '<p>Remettez le seuil à <b>−115 dBm</b>. Sélectionnez la <b>BTS Ziniaré</b> et montez la <b>hauteur de l’antenne</b> de 30 à <b>60 m</b>.</p>',
        question: 'Comment évolue le rayon de couverture ? Tél. ferme revient-il sur la 4G ? Est-ce une solution pour le hameau ?',
        check: (api) => {
          const h = Number(api.node('BTS Ziniaré').props.cellHeightM);
          const thr = Number(api.node('Cœur mobile').props.thresholdDbm);
          return { ok: h >= 55 && thr >= -116, msg: thr < -116 ? 'Remettez le seuil à −115 dBm.' : h < 55 ? 'Montez l’antenne de la BTS à 60 m.' : `Antenne ${h} m · Tél. ferme : ${acc(api, 'Tél. ferme')} ✔` };
        },
      },
      {
        title: 'Partager le faisceau satellite',
        html: '<p>Sélectionnez le lien direct <b>Tél. hameau ↔ Satellite D2C</b> : relevez le débit du faisceau, le nombre d’utilisateurs actifs et le débit par utilisateur. Puis réglez les <b>autres utilisateurs actifs dans le faisceau</b> du satellite à <b>300</b>.</p>',
        question: 'Comment évolue le débit par utilisateur ? Quels services disparaissent, lesquels restent ? Expliquez la notion de « services progressifs ».' + LB('Le faisceau mesure ≈ 60 km : combien d’habitants contient-il pour 50 hab./km² ? Combien d’abonnés actifs si 2 % sont abonnés au satellite et 5 % actifs en même temps ?'),
        check: (api) => {
          const u = Number(api.node('Satellite D2C').props.backgroundUsers);
          const s = d2dSt(api, 'Tél. hameau', 'Satellite D2C');
          const v = s && s.services.find((x) => x.id === 'voix');
          return { ok: u >= 250 && v && v.state !== 'ok', msg: u < 250 ? 'Réglez 300 autres utilisateurs actifs dans le faisceau.' : `Voix : ${v ? v.state : '—'} · SMS : ${s ? s.services.find((x) => x.id === 'sms').state : '—'}` };
        },
      },
      {
        title: 'Élargir le canal satellite',
        html: '<p>Remettez <b>30</b> autres utilisateurs. Réglez la <b>largeur du canal</b> du satellite sur <b>10 MHz</b>.</p>',
        question: 'Le débit du faisceau double-t-il ? Que devient le SNR ? Pourquoi l’opérateur n’utilise-t-il pas toute sa bande pour le satellite ?' + MB('À puissance par faisceau constante, exprimez la variation du SNR et du débit (régime limité en puissance ou en bande ?).'),
        check: (api) => {
          const p = api.node('Satellite D2C').props;
          return { ok: Number(p.channelMHz) === 10 && Number(p.backgroundUsers) <= 50, msg: Number(p.backgroundUsers) > 50 ? 'Remettez 30 autres utilisateurs.' : Number(p.channelMHz) !== 10 ? 'Réglez un canal de 10 MHz.' : 'Canal de 10 MHz ✔' };
        },
      },
      {
        title: 'Une constellation incomplète',
        html: '<p>Réglez le nombre de <b>satellites de la constellation</b> à <b>60</b> (début de déploiement). Observez le tableau des services du lien Tél. hameau ↔ Satellite D2C et l’onglet Profil &amp; Fresnel (Couverture et constellation).</p>',
        question: 'Quelle est la disponibilité ? Pourquoi la voix devient-elle impossible alors que les SMS passent en « différé » ? Combien de satellites faut-il au minimum pour une couverture continue ?' + LB('Retrouvez ce minimum à partir du demi-angle au centre θ et de la surface couverte par un satellite.'),
        check: (api) => {
          const s = d2dSt(api, 'Tél. hameau', 'Satellite D2C');
          const n = Number(api.node('Satellite D2C').props.satsTotal);
          return { ok: n > 0 && n <= 100 && s && s.coverage.availability < 1, msg: n > 0 && n <= 100 ? `Disponibilité ${s ? f(s.coverage.availability * 100, 0) : '—'} % ✔` : 'Réglez 60 satellites dans la constellation.' };
        },
      },
    ],
    conclusion: '<p>La 4G terrestre reste prioritaire et couvre une dizaine de kilomètres en milieu rural ; au-delà, la cellule satellite prend le relais. Un faisceau satellite d’environ 60 km offre quelques Mbit/s partagés : avec peu d’abonnés, la voix passe ; quand le faisceau se remplit, seuls les SMS et la messagerie restent. Une constellation incomplète n’offre que des services différés.</p>',
    build() {
      const nodes = [];
      const links = [];
      d2dCore(nodes, links, 260, 780, { sats: [{ name: 'Satellite D2C', x: 640, props: { profile: 'D2C_LTE', elevationDeg: 50 } }] });
      nodes.push(bts('BTS Ziniaré', 260, 460, '10.0.0.2'), ue('Tél. bourg', 290, 490, '10.45.0.21'), ue('Tél. ferme', 330, 530, '10.45.0.22'), ue('Tél. hameau', 700, 470, '10.45.0.23'));
      links.push(Lk('BTS Ziniaré', 'Cœur mobile', { capacityMbps: 10000 }, 'fiber'));
      for (const t of ['Tél. bourg', 'Tél. ferme', 'Tél. hameau']) links.push(Lk(t, 'BTS Ziniaré'), Lk(t, 'Satellite D2C'));
      return { settings: { scaleKm: 10, rainMmH: 0 }, nodes, links, flows: [Fl('Tél. bourg', 'Serveur opérateur', 0.04, 'voice', 'Appel bourg'), Fl('Tél. hameau', 'Serveur opérateur', 0.04, 'voice', 'Appel hameau'), Fl('Tél. hameau', 'Serveur opérateur', 0.001, 'data', 'SMS hameau')] };
    },
  });

  /* =================== TP 19 =================== */
  LABS.push({
    id: 'tp19',
    
    num: 'TP 19',
    title: 'Catastrophe naturelle : continuité des services d’urgence',
    subtitle: 'BTS détruite, transmission coupée, saturation, orage sur la station sol, diversité de stations sol',
    duration: '2 h',
    level: D2D_LEVEL,
    tags: ['d2d'],
    mode: 'diag',
    context: '<p>Des pluies diluviennes frappent la région du Centre-Nord. Le réseau mobile compte trois BTS (Kaya, Pissila, Barsalogho) raccordées en fibre au cœur mobile, un satellite <b>Direct-to-Cell</b> et un <b>capteur de crue</b> relié à un satellite GEO en bande L. Le <b>centre de secours</b> doit rester joignable.</p><p>Vous êtes en mode <b>Diagnostic</b> : vous allez simuler les dégâts un par un et vérifier la continuité des services.</p>',
    objectives: ['Vérifier la bascule automatique vers le satellite quand une BTS disparaît.', 'Distinguer une BTS détruite d’une BTS privée de transmission.', 'Évaluer l’effet de la saturation sur les services d’urgence.', 'Comprendre le point faible de la liaison de connexion et la diversité de stations sol.', 'Choisir un système satellite adapté à un capteur d’alerte.'],
    releves: [['Réseau de Tél. sinistré avant / après la destruction de la BTS', ''], ['Réseau du secouriste après la coupure de la fibre', ''], ['SINR du secouriste sur le satellite', 'dB'], ['Services encore disponibles avec 600 utilisateurs', ''], ['C/N du feeder sous 80 mm/h', 'dB'], ['RTT du capteur de crue', 'ms']],
    steps: [
      {
        title: 'Situation normale',
        html: '<p>Vérifiez que les trois téléphones sont sur la 4G terrestre et que tous les flux vers le centre de secours sont « ok » (onglet Flux de trafic, sous le canevas).</p>',
        question: 'Les liens directs vers le satellite sont gris (« veille ») : pourquoi le satellite n’est-il pas utilisé ?',
        check: (api) => {
          const all = ['Tél. Kaya', 'Tél. sinistré', 'Tél. secouriste'].every((n) => acc(api, n) === 'terrestre');
          return { ok: all, msg: all ? 'Les trois téléphones sont sur la 4G ✔' : 'Un téléphone n’est pas sur la 4G : réparez le réseau terrestre.' };
        },
      },
      {
        title: 'La BTS de Pissila est détruite',
        html: '<p>Sélectionnez la <b>BTS Pissila</b> et cochez <b>Simuler une panne</b>. Observez le journal et le lien de <b>Tél. sinistré</b>.</p>',
        question: 'Que fait le téléphone ? Combien de temps l’abonné reste-t-il sans service ? Le SMS de détresse passe-t-il ?' + LB('Pourquoi la bascule est-elle automatique, sans action de l’abonné ? Quel identifiant de réseau la cellule satellite diffuse-t-elle ?'),
        check: (api) => ({ ok: !!api.node('BTS Pissila').props.failed && acc(api, 'Tél. sinistré') === 'satellite', msg: !api.node('BTS Pissila').props.failed ? 'Simulez la panne de la BTS Pissila.' : `Tél. sinistré : ${acc(api, 'Tél. sinistré')}` }),
      },
      {
        title: 'La fibre de Barsalogho est arrachée',
        html: '<p>Avec l’outil <b>Couper</b> (ciseaux), coupez la fibre <b>BTS Barsalogho ↔ Cœur mobile</b>.</p>',
        question: 'La BTS fonctionne encore : pourquoi le secouriste perd-il la 4G ? Que montre le bilan de son lien 4G ?',
        check: (api) => {
          const l = api.link('BTS Barsalogho', 'Cœur mobile');
          return { ok: !!(l && l.props.cut) && acc(api, 'Tél. secouriste') === 'satellite', msg: !(l && l.props.cut) ? 'Coupez la fibre BTS Barsalogho ↔ Cœur mobile.' : `Secouriste : ${acc(api, 'Tél. secouriste')}` };
        },
      },
      {
        title: 'Tout le monde appelle en même temps',
        html: '<p>Réglez les <b>autres utilisateurs actifs dans le faisceau</b> du satellite D2C à <b>600</b>. Observez les services du secouriste.</p>',
        question: 'Quels services restent disponibles ? Pourquoi les SMS et l’alerte à la population résistent-ils mieux que la voix ?' + MB('Proposez des mécanismes réseau pour protéger les communications des secours (priorité d’accès, classes d’accès, QoS).'),
        check: (api) => {
          const s = d2dSt(api, 'Tél. secouriste', 'Satellite D2C');
          const ok = Number(api.node('Satellite D2C').props.backgroundUsers) >= 500 && s && s.services.find((x) => x.id === 'sms').state === 'ok';
          return { ok: !!ok, msg: Number(api.node('Satellite D2C').props.backgroundUsers) < 500 ? 'Réglez 600 utilisateurs dans le faisceau.' : `SMS : ${s ? s.services.find((x) => x.id === 'sms').state : '—'} · voix : ${s ? s.services.find((x) => x.id === 'voix').state : '—'}` };
        },
      },
      {
        title: 'Orage sur la station sol',
        html: '<p>Remettez <b>120</b> utilisateurs. Cochez <b>Subit la pluie locale</b> sur la <b>Station sol NTN</b>, puis réglez la pluie à <b>80 mm/h</b>. Observez la liaison de connexion et les téléphones. Raccordez ensuite la <b>Station sol de secours</b> (déjà posée, hors de l’orage) au satellite D2C et au cœur mobile (fibre).</p>',
        question: 'Pourquoi tous les téléphones sur satellite perdent-ils le service ? Comment la seconde station sol rétablit-elle la situation ?' + LB('Calculez l’atténuation de la pluie en bande Ka sur le trajet oblique (γ = k·R^α, L_s = (h_R − h_s)/sin E).'),
        check: (api) => {
          const feeders = api.links('feeder').filter((l) => l.state && l.state.up).length;
          const ok = api.rain() >= 60 && !!api.node('Station sol NTN').props.localRain && feeders >= 2 && acc(api, 'Tél. secouriste') === 'satellite';
          return { ok, msg: api.rain() < 60 || !api.node('Station sol NTN').props.localRain ? 'Faites pleuvoir 80 mm/h sur la station sol NTN.' : feeders < 2 ? 'Raccordez la station sol de secours au satellite D2C et au cœur mobile.' : `Secouriste : ${acc(api, 'Tél. secouriste')} ✔` };
        },
      },
      {
        title: 'Le capteur de crue',
        html: '<p>Sous l’orage, sélectionnez le lien <b>Capteur de crue ↔ Satellite IoT GEO</b> (bilan, puis Profil &amp; Fresnel).</p>',
        question: 'Le capteur transmet-il encore ? Pourquoi un satellite GEO avec un feeder en bande C est-il adapté à l’alerte de crue ? Quelle est sa latence ?',
        check: (api) => ({ ok: acc(api, 'Capteur de crue') === 'satellite' && api.rain() >= 60, msg: `Capteur : ${acc(api, 'Capteur de crue')}${api.rain() < 60 ? ' · laissez la pluie à 80 mm/h' : ''}` }),
      },
    ],
    conclusion: '<p>Le satellite Direct-to-Cell maintient les communications d’urgence quand des BTS sont détruites ou isolées, sans action des abonnés. Ses limites : la capacité partagée (la voix sature d’abord, les SMS et l’alerte résistent) et la liaison de connexion, sensible à la pluie en bande Ka, d’où la diversité de stations sol. Un capteur d’alerte gagne à utiliser un GEO toujours visible, avec un feeder en bande C.</p>',
    build() {
      const nodes = [];
      const links = [];
      d2dCore(nodes, links, 240, 800, { serverName: 'Centre de secours', sats: [{ name: 'Satellite D2C', x: 560, props: { profile: 'D2C_LTE', elevationDeg: 45, backgroundUsers: 120 } }, { name: 'Satellite IoT GEO', x: 980, props: { profile: 'IOT_GEO', backgroundUsers: 10 } }] });
      nodes.push(
        bts('BTS Kaya', 300, 470, '10.0.0.2'),
        bts('BTS Pissila', 620, 470, '10.0.0.3'),
        bts('BTS Barsalogho', 920, 470, '10.0.0.4'),
        ue('Tél. Kaya', 330, 510, '10.45.0.21'),
        ue('Tél. sinistré', 650, 510, '10.45.0.22'),
        ue('Tél. secouriste', 950, 510, '10.45.0.23', { terminal: 'smartphoneHpue' }),
        N('iotDevice', 'Capteur de crue', 1080, 560, { ip: '10.45.0.40', prefix: 24, gateway: '10.45.0.1', reportsPerDay: 96, payloadBytes: 30 }),
        N('ntnGateway', 'Station sol de secours', 700, 860, {})
      );
      links.push(Lk('BTS Kaya', 'Cœur mobile', { capacityMbps: 10000 }, 'fiber'), Lk('BTS Pissila', 'Cœur mobile', { capacityMbps: 10000 }, 'fiber'), Lk('BTS Barsalogho', 'Cœur mobile', { capacityMbps: 10000 }, 'fiber'));
      for (const [t, b] of [['Tél. Kaya', 'BTS Kaya'], ['Tél. sinistré', 'BTS Pissila'], ['Tél. secouriste', 'BTS Barsalogho']]) links.push(Lk(t, b), Lk(t, 'Satellite D2C'));
      links.push(Lk('Capteur de crue', 'Satellite IoT GEO'));
      return { settings: { scaleKm: 5, rainMmH: 0 }, nodes, links, flows: [Fl('Tél. sinistré', 'Centre de secours', 0.001, 'data', 'SMS de détresse'), Fl('Tél. secouriste', 'Centre de secours', 0.04, 'voice', 'Appel du secouriste'), Fl('Tél. Kaya', 'Centre de secours', 0.04, 'voice', 'Appel Kaya'), Fl('Capteur de crue', 'Centre de secours', 0.0001, 'data', 'Niveau de la rivière')] };
    },
  });

  /* =================== TP 20 =================== */
  LABS.push({
    id: 'tp20',
    
    num: 'TP 20',
    title: 'IoT-NTN : répétitions, stockage et retransmission, dix ans d’autonomie',
    subtitle: 'Colliers de bétail au Sahel : bilan NB-IoT, masquage, pile, point GNSS, revisite, éphémérides',
    duration: '2 h',
    level: D2D_LEVEL,
    tags: ['d2d'],
    mode: 'design',
    context: '<p>Une coopérative d’éleveurs du Sahel veut suivre ses troupeaux pendant la transhumance. Chaque zébu porte un <b>collier NB-IoT</b> qui envoie sa position par une petite constellation de <b>nanosatellites</b> en orbite basse, à <b>stockage et retransmission</b>. Contrainte : la pile (3,6 Ah) doit tenir <b>10 ans</b>.</p>',
    objectives: ['Lire le bilan d’un objet NB-IoT et le rôle des répétitions.', 'Mesurer l’effet du masquage par la végétation.', 'Calculer l’autonomie d’un objet NTN et l’optimiser.', 'Relier la taille de la constellation au délai de livraison.', 'Comprendre le rôle du GNSS et des éphémérides dans la précompensation Doppler.'],
    releves: [['SNR montant (1 tonalité 3,75 kHz)', 'dB'], ['Répétitions sous les arbres', ''], ['Autonomie avec 24 messages / jour', 'ans'], ['Messages par jour pour 10 ans', ''], ['Autonomie sans RAI / avec GNSS 30 s', 'ans'], ['Délai de livraison (6 satellites)', 'min'], ['Délai de livraison (24 satellites)', 'min'], ['Doppler résiduel (éphémérides de 12 h)', 'Hz']],
    steps: [
      {
        title: 'Bilan d’un collier en terrain dégagé',
        html: '<p>Sélectionnez le lien <b>Collier zébu ↔ Nanosatellites IoT</b>, onglet <b>Bilan de liaison</b>. Relevez le SINR descendant, le SNR montant (une tonalité de 3,75 kHz) et les débits.</p>',
        question: 'Pourquoi le collier émet-il sur une seule sous-porteuse de 3,75 kHz plutôt que sur toute la bande de 180 kHz ? Calculez le gain en SNR.' + LB('Quel est le rôle de la technologie NB-IoT (couverture étendue, basse consommation) ?'),
        check: (api) => {
          const s = d2dSt(api, 'Collier zébu', 'Nanosatellites IoT');
          return { ok: !!s && s.up && api.stats().tab_budget, msg: s ? `SNR montant ${f(s.result.ul.snrDb, 1)} dB${api.stats().tab_budget ? ' ✔' : ' · ouvrez l’onglet Bilan de liaison'}` : '—' };
        },
      },
      {
        title: 'Un zébu sous les arbres',
        html: '<p>Décochez <b>Vue dégagée du ciel</b> sur le collier (masquage par la végétation). Relevez le SINR et le nombre de répétitions.</p><div class="formula">Gain des répétitions ≈ 0,85 × 10·log(R)</div>',
        question: 'Combien de répétitions faut-il ? Quel est le coût pour la pile et pour la capacité du satellite ?' + MB('Retrouvez R à partir du SNR requis par le CQI 1 (−6,7 dB) et du SINR mesuré. Quel est le nombre maximal de répétitions en NB-IoT et quel affaiblissement de couplage maximal (MCL) en résulte ?'),
        check: (api) => {
          const s = d2dSt(api, 'Collier zébu', 'Nanosatellites IoT');
          const ok = api.node('Collier zébu').props.los === false && s && s.result.dl.rate.reps > 1;
          return { ok: !!ok, msg: api.node('Collier zébu').props.los !== false ? 'Décochez « Vue dégagée du ciel ».' : `Répétitions descendantes : ${s ? s.result.dl.rate.reps : '—'}` };
        },
      },
      {
        title: 'Viser dix ans d’autonomie',
        html: '<p>Recochez la vue dégagée. Onglet <b>Profil &amp; Fresnel</b> du lien : relevez l’autonomie avec <b>24 messages par jour</b>. Réduisez les <b>messages par jour</b> jusqu’à atteindre <b>10 ans</b>.</p><div class="formula">Autonomie = 0,8 × C_pile / I_moyen</div>',
        question: 'Combien de messages par jour au maximum ? Quel est le premier poste de consommation par message ?' + LB('Recalculez le courant moyen et l’autonomie pour la valeur retenue.'),
        check: (api) => {
          const n = api.node('Collier zébu');
          const s = d2dSt(api, 'Collier zébu', 'Nanosatellites IoT');
          if (!s) return { ok: false, msg: '—' };
          const b = MBV.D2D.iotBattery({ capacityMAh: Number(n.props.capacityMAh), reportsPerDay: Number(n.props.reportsPerDay), payloadBytes: Number(n.props.payloadBytes), ulKbps: Math.max(0.01, s.result.ul.rate.kbps || s.result.ul.best.kbps), repetitions: s.result.ul.rate.reps || 1, gnssFixS: Number(n.props.gnssFixS), rai: n.props.rai !== false });
          return { ok: b.years >= 10 && n.props.los !== false, msg: n.props.los === false ? 'Recochez la vue dégagée du ciel.' : `${n.props.reportsPerDay} messages/jour : ${f(b.years, 1)} ans${b.years >= 10 ? ' ✔' : ''}` };
        },
      },
      {
        title: 'Point GNSS et libération immédiate',
        html: '<p>Décochez la <b>libération immédiate (RAI)</b>, puis passez la <b>durée du point GNSS</b> à <b>30 s</b> (démarrage à froid). Relevez l’autonomie à chaque fois, puis revenez à RAI cochée et 5 s.</p>',
        question: 'Pourquoi un objet NTN doit-il faire un point GNSS avant d’émettre, contrairement à un objet NB-IoT terrestre ? Comment limiter son coût ?',
        check: (api) => {
          const p = api.node('Collier zébu').props;
          return { ok: p.rai !== false && Number(p.gnssFixS) <= 5, msg: p.rai === false || Number(p.gnssFixS) > 5 ? 'Après vos essais, revenez à RAI cochée et 5 s de GNSS.' : 'RAI et GNSS 5 s ✔' };
        },
      },
      {
        title: 'Délai de livraison',
        html: '<p>Onglet <b>Profil &amp; Fresnel</b> : relevez le nombre de passages par jour et le <b>délai de stockage et retransmission</b>. Sélectionnez le satellite et portez la constellation à <b>24 satellites</b>.</p>',
        question: 'Comment évolue le délai ? Ce service convient-il au suivi du bétail ? À une alerte de vol de bétail ? Que proposeriez-vous pour une alerte ?' + MB('Établissez l’expression du délai moyen τ ≈ Δt/2 + T_orbite/(2·N_stations) et discutez ses hypothèses.'),
        check: (api) => {
          const n = Number(api.node('Nanosatellites IoT').props.satsTotal);
          return { ok: n >= 24, msg: n >= 24 ? `${n} satellites ✔` : 'Portez la constellation à 24 satellites.' };
        },
      },
      {
        title: 'Des éphémérides périmées',
        html: '<p>Réglez l’<b>âge des éphémérides</b> du collier à <b>43 200 s</b> (12 h). Observez la rubrique Doppler du bilan, puis revenez à <b>600 s</b>.</p>',
        question: 'Pourquoi le satellite ne reçoit-il plus le collier ? Que doit faire le module pour éviter ce problème ?' + MB('Calculez le Doppler résiduel et comparez-le à la tolérance de ±0,1 ppm.'),
        check: (api) => {
          const a = Number(api.node('Collier zébu').props.ephemerisAgeS);
          return { ok: a <= 3600 && acc(api, 'Collier zébu') === 'satellite', msg: a > 3600 ? 'Revenez à des éphémérides de 600 s.' : `Collier : ${acc(api, 'Collier zébu')}` };
        },
      },
    ],
    conclusion: '<p>Un objet NB-IoT par satellite fonctionne avec quelques centaines de mW grâce à une sous-porteuse très étroite et aux répétitions. Son autonomie dépend surtout du nombre de messages, du point GNSS imposé par le NTN et de la libération rapide de la connexion. Une petite constellation à stockage et retransmission livre les messages avec un délai d’une à plusieurs heures : adapté au suivi, pas à l’alerte.</p>',
    build() {
      const nodes = [];
      const links = [];
      d2dCore(nodes, links, 240, 800, { serverName: 'Plateforme IoT', sats: [{ name: 'Nanosatellites IoT', x: 560, props: { profile: 'IOT_LEO_SF', elevationDeg: 35, backgroundUsers: 10 } }] });
      nodes.push(N('iotDevice', 'Collier zébu', 620, 520, { ip: '10.45.0.41', prefix: 24, gateway: '10.45.0.1', reportsPerDay: 24, payloadBytes: 40, capacityMAh: 3600, gnssFixS: 5 }));
      links.push(Lk('Collier zébu', 'Nanosatellites IoT'));
      return { settings: { scaleKm: 20, rainMmH: 0 }, nodes, links, flows: [Fl('Collier zébu', 'Plateforme IoT', 0.0001, 'data', 'Position du zébu')] };
    },
  });

  /* =================== TP 21 =================== */
  LABS.push({
    id: 'tp21',
    
    num: 'TP 21',
    title: 'Mobilité et véhicules : bascules, Doppler et handover',
    subtitle: 'Camion et passager sur la route nationale : 4G → satellite → 4G, satellites défilants, grandes antennes',
    duration: '2 h',
    level: D2D_LEVEL,
    tags: ['d2d'],
    mode: 'design',
    context: '<p>Un transporteur suit ses camions entre <b>Ouagadougou</b> et <b>Koupéla</b> (140 km). Entre les deux villes, la 4G est absente. Le <b>camion</b> dispose d’un module télématique avec antenne de toit ; un <b>passager</b> n’a que son smartphone dans l’habitacle. Les deux terminaux sont reliés aux BTS des deux villes et au satellite Direct-to-Cell.</p><p>Les terminaux se déplacent à 80 km/h quand l’<b>horloge de simulation</b> tourne (▶ dans la barre du canevas).</p>',
    objectives: ['Observer les bascules automatiques entre cellules terrestres et satellite au cours d’un trajet.', 'Comparer un terminal à antenne extérieure et un smartphone dans un véhicule.', 'Observer le défilement des satellites, les handovers et le Doppler.', 'Comparer deux systèmes Direct-to-Device (continuité, débit).'],
    releves: [['Distance de bascule 4G → satellite (camion)', 'km'], ['Distance de bascule 4G → satellite (passager)', 'km'], ['Débit par utilisateur du camion / du passager', 'kbit/s'], ['Doppler maximal (1 882 MHz)', 'kHz'], ['Handovers en 30 min', ''], ['Disponibilité du système à grandes antennes', '%']],
    steps: [
      {
        title: 'Lancer le trajet',
        html: '<p>Cliquez sur <b>▶</b> (vitesse <b>×60</b>). Les deux terminaux quittent Ouagadougou ; leur position sur le trajet est indiquée dans leurs paramètres. Surveillez le <b>Journal d’événements</b>.</p>',
        question: 'À quelle distance de Ouagadougou le camion bascule-t-il sur le satellite ? Et le passager ? Expliquez la différence.' + LB('Retrouvez ces distances avec le rayon de couverture Okumura-Hata et les pertes de l’habitacle (8 dB) et du corps (3 dB).'),
        check: (api) => {
          const r = api.routeKm('Camion');
          return { ok: !!r && r.s >= 25, msg: r ? `Camion à ${f(r.s, 1)} km de Ouagadougou${r.s >= 25 ? ' ✔' : ' : laissez tourner l’horloge'}` : '—' };
        },
      },
      {
        title: 'Sur le satellite, en pleine brousse',
        html: '<p>Arrêtez l’horloge quand les deux terminaux sont à mi-parcours. Comparez les bilans et les services du camion et du passager.</p>',
        question: 'Quel terminal a le meilleur service ? Pourquoi les constructeurs de camions et les services d’urgence (appel d’urgence automatique) installent-ils une antenne de toit ?',
        check: (api) => {
          const r = api.routeKm('Camion');
          return { ok: !!r && r.s >= 40 && r.s <= 100 && acc(api, 'Camion') === 'satellite', msg: r ? `Camion à ${f(r.s, 0)} km : ${acc(api, 'Camion')}` : '—' };
        },
      },
      {
        title: 'Arrivée à Koupéla',
        html: '<p>Relancez l’horloge jusqu’à l’arrivée (140 km, ≈ 1 h 45 de trajet) et observez le retour sur la 4G.</p>',
        question: 'Le camion revient-il sur la 4G à l’approche de Koupéla ? Pourquoi est-ce important pour l’opérateur et pour l’abonné ?',
        check: (api) => {
          const r = api.routeKm('Camion');
          return { ok: !!r && r.s >= 125 && acc(api, 'Camion') === 'terrestre', msg: r ? `Camion à ${f(r.s, 0)} km : ${acc(api, 'Camion')}` : '—' };
        },
      },
      {
        title: 'Des satellites qui défilent',
        html: '<p>Réglez le <b>mouvement</b> du satellite D2C sur <b>Défilement réel</b>, ramenez le temps à mi-parcours si besoin et relancez l’horloge pendant 30 minutes simulées. Ouvrez l’onglet <b>Profil &amp; Fresnel</b> du lien direct du camion.</p>',
        question: 'Combien de handovers en 30 minutes ? Quel est le Doppler maximal ? Pourquoi le satellite le précompense-t-il au centre de chaque faisceau pour un smartphone ordinaire ?' + MB('Calculez le Doppler différentiel dans un faisceau de 30 km et la dérive Doppler au zénith ; comparez à l’espacement des sous-porteuses (15 kHz).'),
        check: (api) => {
          const h = api.satHistory('Satellite D2C');
          return { ok: api.node('Satellite D2C').props.motion === 'moving' && !!h && h.handovers >= 1, msg: api.node('Satellite D2C').props.motion !== 'moving' ? 'Passez le satellite en défilement réel.' : `Handovers : ${h ? h.handovers : 0}` };
        },
      },
      {
        title: 'Un autre système : les grandes antennes',
        html: '<p>Changez le système du satellite pour <b>Haut débit direct, grandes antennes</b> (position figée). Comparez le débit et le tableau des services du camion à mi-parcours.</p>',
        question: 'Le débit augmente-t-il ? Pourquoi les services temps réel deviennent-ils impossibles alors que la télémétrie reste « différée » ?' + LB('Comparez la disponibilité des deux systèmes (nombre de satellites, satellites nécessaires pour une couverture continue).'),
        check: (api) => {
          const s = d2dSt(api, 'Camion', 'Satellite D2C');
          return { ok: api.node('Satellite D2C').props.profile === 'D2D_BB' && !!s, msg: api.node('Satellite D2C').props.profile !== 'D2D_BB' ? 'Choisissez le système à grandes antennes.' : `Disponibilité ${s ? f(s.coverage.availability * 100, 0) : '—'} %` };
        },
      },
    ],
    conclusion: '<p>Un terminal en mouvement passe automatiquement de la 4G terrestre au satellite puis revient sur la 4G : le réseau terrestre reste prioritaire. L’antenne de toit d’un véhicule gagne une dizaine de dB sur un smartphone dans l’habitacle, ce qui prolonge la couverture et améliore le service satellite. Les satellites défilent : handovers toutes les quelques minutes et Doppler de ±44 kHz, précompensé par le satellite. Un système à très grandes antennes offre plus de débit, mais tant qu’il compte peu de satellites, il n’assure que des services différés.</p>',
    build() {
      const nodes = [];
      const links = [];
      d2dCore(nodes, links, 260, 800, { sats: [{ name: 'Satellite D2C', x: 620, props: { profile: 'D2C_LTE', elevationDeg: 55 } }] });
      nodes.push(
        bts('BTS Ouagadougou', 240, 450, '10.0.0.2'),
        bts('BTS Koupéla', 800, 450, '10.0.0.3'),
        N('vehicle', 'Camion', 240, 458, { ip: '10.45.0.31', prefix: 24, gateway: '10.45.0.1', antenna: 'toit', motion: 'route', routeKm: 140, routeHeadingDeg: 90, speedKmh: 80 }),
        ue('Passager', 240, 466, '10.45.0.32', { environment: 'vehicule', motion: 'route', routeKm: 140, routeHeadingDeg: 90, speedKmh: 80 })
      );
      links.push(Lk('BTS Ouagadougou', 'Cœur mobile', { capacityMbps: 10000 }, 'fiber'), Lk('BTS Koupéla', 'Cœur mobile', { capacityMbps: 10000 }, 'fiber'));
      for (const t of ['Camion', 'Passager']) links.push(Lk(t, 'BTS Ouagadougou'), Lk(t, 'BTS Koupéla'), Lk(t, 'Satellite D2C'));
      return { settings: { scaleKm: 12.5, rainMmH: 0 }, nodes, links, flows: [Fl('Camion', 'Serveur opérateur', 0.002, 'data', 'Suivi de flotte'), Fl('Passager', 'Serveur opérateur', 0.04, 'voice', 'Appel du passager')] };
    },
  });

  /* --- Direct-to-Device : scénarios d'usage opérateur mobile --- */
  /**
   * Cœur d'un opérateur mobile : cœur EPC/5GC, serveur, station sol NTN (fibre) et,
   * si demandé, un satellite D2D relié par sa liaison de connexion.
   * Plan d'adressage : terminaux mobiles 10.45.0.0/24 (pool du cœur), serveurs 10.0.0.0/24.
   */
  function d2dCore(nodes, links, x, y, opts = {}) {
    nodes.push(
      N('mobileCore', 'Cœur mobile', x, y, { loopback: '10.255.0.1' }),
      N('server', opts.serverName || 'Serveur opérateur', x - 150, y + 90, { ip: '10.0.0.10', prefix: 24, gateway: '10.0.0.1' }),
      N('ntnGateway', 'Station sol NTN', x + 170, y + 40, {})
    );
    links.push(Lk('Cœur mobile', opts.serverName || 'Serveur opérateur', {}, 'ethernet'), Lk('Station sol NTN', 'Cœur mobile', { capacityMbps: 10000 }, 'fiber'));
    for (const sat of opts.sats || []) {
      nodes.push(N('d2dSat', sat.name, sat.x, 200, sat.props));
      links.push(Lk(sat.name, 'Station sol NTN'));
    }
  }
  const ue = (name, x, y, ip, props) => N('ue', name, x, y, Object.assign({ ip, prefix: 24, gateway: '10.45.0.1' }, props || {}));
  const bts = (name, x, y, ip, props) => N('gnodeb', name, x, y, Object.assign({ ip, prefix: 24, gateway: '10.0.0.1' }, props || {}));

  /** Zone blanche rurale : un village couvert par la 4G, un hameau et un berger hors couverture. */
  function exD2dZoneBlanche() {
    const nodes = [];
    const links = [];
    d2dCore(nodes, links, 260, 780, { sats: [{ name: 'Satellite D2C', x: 640, props: { profile: 'D2C_LTE', elevationDeg: 50 } }] });
    nodes.push(
      bts('BTS Ziniaré', 260, 470, '10.0.0.2'),
      ue('Tél. village', 300, 500, '10.45.0.21'),
      ue('Tél. hameau', 640, 460, '10.45.0.22'),
      ue('Tél. berger', 860, 560, '10.45.0.23', { terminal: 'smartphone' })
    );
    links.push(Lk('BTS Ziniaré', 'Cœur mobile', { capacityMbps: 10000 }, 'fiber'));
    for (const t of ['Tél. village', 'Tél. hameau', 'Tél. berger']) links.push(Lk(t, 'BTS Ziniaré'), Lk(t, 'Satellite D2C'));
    const flows = [Fl('Tél. village', 'Serveur opérateur', 0.04, 'voice', 'Appel village'), Fl('Tél. hameau', 'Serveur opérateur', 0.04, 'voice', 'Appel hameau'), Fl('Tél. berger', 'Serveur opérateur', 0.001, 'data', 'SMS berger')];
    return { settings: { title: 'Exemple — Zone blanche rurale (Direct-to-Cell)', scaleKm: 10, rainMmH: 0 }, nodes, links, flows };
  }

  /** Catastrophe naturelle : inondation, deux BTS hors service, alerte et secours par satellite. */
  function exD2dCatastrophe() {
    const nodes = [];
    const links = [];
    d2dCore(nodes, links, 240, 800, {
      serverName: 'Centre de secours',
      sats: [
        { name: 'Satellite D2C', x: 560, props: { profile: 'D2C_LTE', elevationDeg: 45, backgroundUsers: 120 } },
        { name: 'Satellite IoT GEO', x: 980, props: { profile: 'IOT_GEO', backgroundUsers: 10 } },
      ],
    });
    nodes.push(
      bts('BTS Kaya', 300, 470, '10.0.0.2'),
      bts('BTS Pissila', 620, 470, '10.0.0.3', { failed: true }),
      bts('BTS Barsalogho', 920, 470, '10.0.0.4'),
      ue('Tél. Kaya', 330, 510, '10.45.0.21'),
      ue('Tél. sinistré Pissila', 650, 520, '10.45.0.22'),
      ue('Tél. secouriste', 950, 520, '10.45.0.23', { terminal: 'smartphoneHpue' }),
      N('iotDevice', 'Capteur de crue', 1080, 560, { ip: '10.45.0.40', prefix: 24, gateway: '10.45.0.1', reportsPerDay: 96, payloadBytes: 30 })
    );
    links.push(
      Lk('BTS Kaya', 'Cœur mobile', { capacityMbps: 10000 }, 'fiber'),
      Lk('BTS Pissila', 'Cœur mobile', { capacityMbps: 10000 }, 'fiber'),
      Lk('BTS Barsalogho', 'Cœur mobile', { capacityMbps: 10000, cut: true }, 'fiber'),
      Lk('Tél. Kaya', 'BTS Kaya'),
      Lk('Tél. Kaya', 'Satellite D2C'),
      Lk('Tél. sinistré Pissila', 'BTS Pissila'),
      Lk('Tél. sinistré Pissila', 'Satellite D2C'),
      Lk('Tél. secouriste', 'BTS Barsalogho'),
      Lk('Tél. secouriste', 'Satellite D2C'),
      Lk('Capteur de crue', 'Satellite IoT GEO')
    );
    const flows = [
      Fl('Tél. sinistré Pissila', 'Centre de secours', 0.001, 'data', 'SMS de détresse'),
      Fl('Tél. secouriste', 'Centre de secours', 0.04, 'voice', 'Appel du secouriste'),
      Fl('Capteur de crue', 'Centre de secours', 0.0001, 'data', 'Niveau de la rivière'),
      Fl('Tél. Kaya', 'Centre de secours', 0.04, 'voice', 'Appel Kaya'),
    ];
    return { settings: { title: 'Exemple — Catastrophe naturelle : secours par satellite', scaleKm: 5, rainMmH: 0 }, nodes, links, flows };
  }

  /** Déplacement hors couverture : un véhicule et un passager sur la route Ouagadougou → Koupéla. */
  function exD2dTrajet() {
    const nodes = [];
    const links = [];
    d2dCore(nodes, links, 260, 800, { sats: [{ name: 'Satellite D2C', x: 620, props: { profile: 'D2C_LTE', elevationDeg: 55 } }] });
    nodes.push(
      bts('BTS Ouagadougou', 240, 450, '10.0.0.2'),
      bts('BTS Koupéla', 800, 450, '10.0.0.3'),
      N('vehicle', 'Camion (antenne de toit)', 240, 462, { ip: '10.45.0.31', prefix: 24, gateway: '10.45.0.1', antenna: 'toit', motion: 'route', routeKm: 140, routeHeadingDeg: 90, speedKmh: 80 }),
      ue('Tél. du passager', 240, 480, '10.45.0.32', { environment: 'vehicule', motion: 'route', routeKm: 140, routeHeadingDeg: 90, speedKmh: 80 })
    );
    links.push(Lk('BTS Ouagadougou', 'Cœur mobile', { capacityMbps: 10000 }, 'fiber'), Lk('BTS Koupéla', 'Cœur mobile', { capacityMbps: 10000 }, 'fiber'));
    for (const t of ['Camion (antenne de toit)', 'Tél. du passager']) links.push(Lk(t, 'BTS Ouagadougou'), Lk(t, 'BTS Koupéla'), Lk(t, 'Satellite D2C'));
    const flows = [Fl('Camion (antenne de toit)', 'Serveur opérateur', 0.002, 'data', 'Suivi de flotte'), Fl('Tél. du passager', 'Serveur opérateur', 0.04, 'voice', 'Appel du passager')];
    return { settings: { title: 'Exemple — Déplacement hors couverture (route nationale)', scaleKm: 12.5, rainMmH: 0 }, nodes, links, flows };
  }

  /** IoT au Sahel : colliers de bétail (LEO à stockage et retransmission) et station hydrologique (GEO). */
  function exD2dIotSahel() {
    const nodes = [];
    const links = [];
    d2dCore(nodes, links, 240, 800, {
      serverName: 'Plateforme IoT',
      sats: [
        { name: 'Nanosatellites IoT', x: 520, props: { profile: 'IOT_LEO_SF', elevationDeg: 35, backgroundUsers: 10 } },
        { name: 'Satellite IoT GEO', x: 960, props: { profile: 'IOT_GEO', backgroundUsers: 10 } },
      ],
    });
    const iot = (name, x, y, ip, props) => N('iotDevice', name, x, y, Object.assign({ ip, prefix: 24, gateway: '10.45.0.1' }, props));
    nodes.push(
      iot('Collier zébu 1', 480, 500, '10.45.0.41', { reportsPerDay: 4, payloadBytes: 40, capacityMAh: 3600, gnssFixS: 8 }),
      iot('Collier zébu 2', 600, 560, '10.45.0.42', { reportsPerDay: 48, payloadBytes: 40, capacityMAh: 3600, gnssFixS: 8, los: false }),
      iot('Station hydrologique', 960, 520, '10.45.0.43', { reportsPerDay: 96, payloadBytes: 60, capacityMAh: 19000, gnssFixS: 3 })
    );
    links.push(Lk('Collier zébu 1', 'Nanosatellites IoT'), Lk('Collier zébu 2', 'Nanosatellites IoT'), Lk('Station hydrologique', 'Satellite IoT GEO'));
    const flows = ['Collier zébu 1', 'Collier zébu 2', 'Station hydrologique'].map((n) => Fl(n, 'Plateforme IoT', 0.0001, 'data', n + ' → plateforme'));
    return { settings: { title: 'Exemple — IoT au Sahel (bétail, hydrologie)', scaleKm: 20, rainMmH: 0 }, nodes, links, flows };
  }

  /** Véhicules connectés : flotte de camions sur un corridor, appel d'urgence et suivi. */
  function exD2dVehicules() {
    const nodes = [];
    const links = [];
    d2dCore(nodes, links, 240, 820, {
      serverName: 'Centre de gestion de flotte',
      sats: [{ name: 'Satellite D2D grandes antennes', x: 640, props: { profile: 'D2D_BB', elevationDeg: 60, backgroundUsers: 10 } }],
    });
    nodes.push(
      bts('BTS Bobo-Dioulasso', 240, 450, '10.0.0.2'),
      N('vehicle', 'Camion 1 (télématique)', 260, 500, { ip: '10.45.0.51', prefix: 24, gateway: '10.45.0.1', antenna: 'toit', motion: 'route', routeKm: 200, routeHeadingDeg: 100, speedKmh: 70 }),
      N('vehicle', 'Camion 2 (smartphone)', 260, 580, { ip: '10.45.0.52', prefix: 24, gateway: '10.45.0.1', antenna: 'interieur', motion: 'route', routeKm: 200, routeHeadingDeg: 100, speedKmh: 70 }),
      N('vehicle', 'Ambulance', 520, 660, { ip: '10.45.0.53', prefix: 24, gateway: '10.45.0.1', antenna: 'toit' })
    );
    links.push(Lk('BTS Bobo-Dioulasso', 'Cœur mobile', { capacityMbps: 10000 }, 'fiber'));
    for (const t of ['Camion 1 (télématique)', 'Camion 2 (smartphone)', 'Ambulance']) links.push(Lk(t, 'BTS Bobo-Dioulasso'), Lk(t, 'Satellite D2D grandes antennes'));
    const flows = [
      Fl('Camion 1 (télématique)', 'Centre de gestion de flotte', 0.005, 'data', 'Position et télémétrie'),
      Fl('Camion 2 (smartphone)', 'Centre de gestion de flotte', 0.04, 'voice', 'Appel du chauffeur'),
      Fl('Ambulance', 'Centre de gestion de flotte', 0.5, 'video', 'Télémédecine (vidéo)'),
    ];
    return { settings: { title: 'Exemple — Véhicules connectés sur un corridor', scaleKm: 12.5, rainMmH: 0 }, nodes, links, flows };
  }

  const EXAMPLES = [
    { id: 'ex-backhaul', num: 'Ex 1', title: 'Backhaul FH d’un site 4G', subtitle: 'Deux bonds en cascade : 7 GHz sur 30 km, 15 GHz sur 12 km', tags: ['fh'], mode: 'design', desc: '<p>Un site 4G est raccordé au cœur de réseau par deux bonds : un long bond <b>7 GHz</b> (paraboles 1,2 m) jusqu’au relais, puis un bond court <b>15 GHz</b> (0,6 m). Comparez les deux bilans, faites pleuvoir : lequel se dégrade le premier ? Pourquoi a-t-on choisi deux bandes différentes ?</p>', build: exBackhaul },
    { id: 'ex-recette', num: 'Ex 2', title: 'Recette du backhaul (mesures réalistes)', subtitle: 'Fiche et rapport de recette ; une liaison n’est pas conforme', tags: ['fh'], mode: 'diag', desc: '<p>Le même réseau, en <b>recette réaliste</b> : chaque liaison réelle s’écarte un peu du calcul, comme sur le terrain. Relevez le RSL mesuré de chaque sens, remplissez la <b>fiche de recette</b> (onglet Bilan de liaison, sans sélection) et concluez. Une liaison est <b>non conforme</b> : trouvez la cause et intervenez (mode Dépannage), puis imprimez le rapport de recette.</p>', build: exRecette },
    { id: 'ex-vsat', num: 'Ex 3', title: 'Réseau VSAT en étoile', subtitle: 'Un téléport, trois stations : banque, école, mine', tags: ['vsat'], mode: 'design', desc: '<p>Trois sites isolés reliés à Internet par satellite GEO en bande Ku. Les paraboles n’ont pas le même diamètre ni les BUC la même puissance : comparez PIRE, Eb/N0, MODCOD et débits. Que se passe-t-il pour chaque site en bande Ka sous un orage ?</p>', build: exVsatEtoile },
    { id: 'ex-wisp', num: 'Ex 4', title: 'BLR 5,8 GHz à trois secteurs', subtitle: 'Fournisseur d’accès rural : 3 secteurs de 120°, 6 abonnés', tags: ['blr'], mode: 'design', desc: '<p>Un pylône porte trois stations de base sectorielles orientées à 0°, 120° et 240°. Observez l’écart de chaque CPE à l’axe de son secteur, le partage du débit entre abonnés et la portée. Déplacez un abonné hors de son secteur, ou loin du pylône.</p>', build: exWisp },
    { id: 'ex-leo', num: 'Ex 5', title: 'Constellation LEO en défilement', subtitle: 'Handovers, Doppler et latence d’une orbite basse', tags: ['vsat'], mode: 'design', desc: '<p>La topologie du TP 13, sans consignes : lancez l’horloge de simulation (▶) et observez les passages des satellites, les handovers, le Doppler et la latence. Réduisez le nombre de satellites par plan pour faire apparaître des trous de couverture.</p>', build: () => LABS.find((l) => l.id === 'tp13').build() },
    { id: 'ex-d2d-zone-blanche', num: 'Ex 6', title: 'Zone blanche rurale : Direct-to-Cell', subtitle: 'Village couvert en 4G, hameau et berger hors couverture : bascule sur le satellite', tags: ['d2d'], mode: 'design', desc: '<p>Une BTS 4G rurale couvre le village (≈ 14 km) ; le hameau et le berger sont en <b>zone blanche</b>. Leurs smartphones ordinaires se rattachent à la <b>cellule satellite</b> Direct-to-Cell de l’opérateur. Comparez le RSRP terrestre et satellite, le débit par utilisateur et le tableau des <b>services progressifs</b>. Augmentez les « autres utilisateurs actifs dans le faisceau » du satellite (300, 1 000) : quels services disparaissent en premier ? Passez le satellite en défilement réel et lancez l’horloge.</p>', build: exD2dZoneBlanche },
    { id: 'ex-d2d-catastrophe', num: 'Ex 7', title: 'Catastrophe naturelle : secours par satellite', subtitle: 'Inondation : une BTS détruite, une BTS privée de transmission, capteur de crue', tags: ['d2d'], mode: 'diag', desc: '<p>Après une inondation, la BTS de Pissila est <b>hors service</b> et la fibre de la BTS de Barsalogho est <b>coupée</b> : sa cellule n’émet plus. Les téléphones basculent sur le satellite ; le SMS de détresse et l’appel du secouriste passent encore. Le capteur de crue transmet par un satellite GEO en bande L. Réparez la BTS (case « Simuler une panne ») ou la fibre (ciseaux) et observez le retour sur le réseau terrestre. Que se passe-t-il si un orage frappe la station sol NTN (« Subit la pluie locale ») ?</p>', build: exD2dCatastrophe },
    { id: 'ex-d2d-trajet', num: 'Ex 8', title: 'Déplacement hors couverture', subtitle: 'Route nationale : bascule 4G → satellite → 4G pendant le trajet', tags: ['d2d'], mode: 'design', desc: '<p>Un camion (antenne de toit) et un passager (smartphone dans l’habitacle) roulent à 80 km/h de Ouagadougou vers Koupéla (140 km). Lancez l’horloge (▶, ×60) : le journal note chaque <b>bascule</b> entre la cellule terrestre et la cellule satellite. Comparez les services du camion et du passager : quel est l’effet des 8 dB de pertes de l’habitacle ? Changez le seuil de bascule du cœur mobile, ou la vitesse.</p>', build: exD2dTrajet },
    { id: 'ex-d2d-iot-sahel', num: 'Ex 9', title: 'IoT au Sahel : bétail et hydrologie', subtitle: 'NB-IoT par nanosatellites (stockage et retransmission) et par GEO bande L', tags: ['d2d'], mode: 'design', desc: '<p>Deux colliers de zébus envoient leur position par une petite constellation de <b>nanosatellites</b> : le message attend le passage d’un satellite (<b>stockage et retransmission</b>). La station hydrologique utilise un <b>satellite GEO</b> en bande L, toujours visible. Le collier 2 est sous les arbres (vue du ciel masquée) et émet toutes les 30 min : que montrent son bilan et son flux ? Comparez dans l’onglet Profil le délai de livraison et l’<b>autonomie de la pile</b> : combien de messages par jour pour tenir 10 ans ? Effet du point GNSS, de la RAI et des répétitions ?</p>', build: exD2dIotSahel },
    { id: 'ex-d2d-vehicules', num: 'Ex 10', title: 'Véhicules connectés sur un corridor', subtitle: 'Télématique, appel du chauffeur, télémédecine depuis une ambulance', tags: ['d2d'], mode: 'design', desc: '<p>Une flotte quitte Bobo-Dioulasso : un camion à module télématique (antenne de toit), un camion dont le chauffeur n’a que son smartphone, une ambulance qui transmet de la vidéo. Le système satellite à <b>grandes antennes</b> offre plus de débit mais ne compte encore que quelques satellites : couverture <b>intermittente</b>. Quels services sont garantis, lesquels sont seulement « différés » ? Passez au système Direct-to-Cell et comparez.</p>', build: exD2dVehicules },
  ];

  MBV.Labs = { list: LABS, examples: EXAMPLES };

  /* ------------------------------------------------------------------
   * 3. COURS EMBARQUÉ
   * ------------------------------------------------------------------ */
  const FIG_SPLIT = `<figure><svg viewBox="0 0 560 190" width="560" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="11">
    <rect x="20" y="120" width="90" height="34" rx="5" fill="#16213a" stroke="#22d3ee"/><text x="65" y="141" fill="#dbe5f5" text-anchor="middle">IDU</text>
    <line x1="110" y1="137" x2="180" y2="137" stroke="#64748b" stroke-dasharray="2 3"/><text x="145" y="130" fill="#7587a8" text-anchor="middle">câble IF</text>
    <line x1="200" y1="170" x2="200" y2="40" stroke="#fbbf24" stroke-width="2"/><text x="200" y="185" fill="#fbbf24" text-anchor="middle">pylône</text>
    <rect x="182" y="50" width="22" height="34" rx="4" fill="#16213a" stroke="#22d3ee"/><text x="193" y="100" fill="#dbe5f5" text-anchor="middle">ODU</text>
    <path d="M206 42 q18 25 0 50" fill="none" stroke="#22d3ee" stroke-width="2"/><text x="236" y="70" fill="#dbe5f5">antenne</text>
    <line x1="215" y1="67" x2="320" y2="67" stroke="#22c55e" stroke-width="3" stroke-dasharray="2 6"/>
    <rect x="360" y="120" width="160" height="34" rx="5" fill="#16213a" stroke="#22d3ee"/><text x="440" y="141" fill="#dbe5f5" text-anchor="middle">Routeur / switch</text>
    <line x1="480" y1="170" x2="480" y2="40" stroke="#fbbf24" stroke-width="2"/>
    <rect x="452" y="48" width="26" height="38" rx="6" fill="#16213a" stroke="#22d3ee"/><path d="M450 46 q-18 21 0 42" fill="none" stroke="#22d3ee" stroke-width="2"/>
    <line x1="465" y1="86" x2="465" y2="120" stroke="#8ea3c7"/><text x="420" y="104" fill="#7587a8" text-anchor="end">Ethernet / fibre + PoE</text>
    <text x="110" y="20" fill="#a9b8d3" text-anchor="middle" font-weight="bold">Split-mount</text><text x="465" y="20" fill="#a9b8d3" text-anchor="middle" font-weight="bold">Full-Outdoor</text>
  </svg><figcaption>Architectures split-mount (IDU + ODU) et Full-Outdoor (radio tout-en-un derrière l’antenne).</figcaption></figure>`;

  const FIG_FRESNEL = `<figure><svg viewBox="0 0 560 200" width="560" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="11">
    <path d="M20 180 Q280 130 540 180 L540 200 L20 200 Z" fill="rgba(146,113,62,.55)" stroke="#b08d57"/>
    <path d="M230 160 q40 -70 80 0 z" fill="rgba(239,68,68,.35)" stroke="#ef4444"/><text x="270" y="150" fill="#fecaca" text-anchor="middle">obstacle</text>
    <line x1="40" y1="180" x2="40" y2="60" stroke="#fbbf24" stroke-width="2"/><line x1="520" y1="180" x2="520" y2="70" stroke="#fbbf24" stroke-width="2"/>
    <ellipse cx="280" cy="65" rx="240" ry="38" fill="rgba(34,211,238,.12)" stroke="#22d3ee"/>
    <line x1="40" y1="60" x2="520" y2="70" stroke="#e2e8f0" stroke-dasharray="6 3"/>
    <line x1="280" y1="65" x2="280" y2="103" stroke="#a78bfa"/><text x="286" y="88" fill="#c4b5fd">r1</text>
    <text x="150" y="58" fill="#e2e8f0">ligne de visée (LOS)</text><text x="420" y="30" fill="#22d3ee">1ère zone de Fresnel</text>
    <text x="40" y="196" fill="#fbbf24" text-anchor="middle">A</text><text x="520" y="196" fill="#fbbf24" text-anchor="middle">B</text>
    <text x="120" y="172" fill="#d6b98a">sol + renflement terrestre</text>
  </svg><figcaption>La 1ère zone de Fresnel est un ellipsoïde autour de la ligne de visée : elle doit être dégagée d’au moins 60 %.</figcaption></figure>`;

  const FIG_VLAN = `<figure><svg viewBox="0 0 560 90" width="560" xmlns="http://www.w3.org/2000/svg" font-family="monospace" font-size="11">
    <g stroke="#2f4166"><rect x="10" y="20" width="80" height="34" fill="#16213a"/><rect x="90" y="20" width="80" height="34" fill="#16213a"/><rect x="170" y="20" width="90" height="34" fill="rgba(52,211,153,.2)" stroke="#34d399"/><rect x="260" y="20" width="60" height="34" fill="#16213a"/><rect x="320" y="20" width="170" height="34" fill="rgba(96,165,250,.15)"/><rect x="490" y="20" width="60" height="34" fill="#16213a"/></g>
    <g fill="#dbe5f5" text-anchor="middle"><text x="50" y="41">MAC dest.</text><text x="130" y="41">MAC src.</text><text x="215" y="41" fill="#a7f3d0">Tag 802.1Q</text><text x="290" y="41">Type</text><text x="405" y="41">Données (IP…)</text><text x="520" y="41">FCS</text></g>
    <g fill="#7587a8" text-anchor="middle" font-size="10"><text x="215" y="72">TPID 0x8100 · PCP (3 bits QoS)</text><text x="215" y="85">DEI · VLAN ID (12 bits : 1 à 4094)</text></g>
  </svg><figcaption>Trame Ethernet étiquetée 802.1Q : 4 octets insérés après l’adresse MAC source.</figcaption></figure>`;

  const FIG_ORBITS = `<figure><svg viewBox="0 0 560 220" width="560" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="11">
    <circle cx="110" cy="110" r="40" fill="#1e3a5f" stroke="#60a5fa"/><text x="110" y="114" fill="#dbe5f5" text-anchor="middle">Terre</text>
    <circle cx="110" cy="110" r="52" fill="none" stroke="#34d399" stroke-dasharray="3 3"/><circle cx="110" cy="110" r="78" fill="none" stroke="#f59e0b" stroke-dasharray="3 3"/><circle cx="110" cy="110" r="104" fill="none" stroke="#a78bfa" stroke-dasharray="3 3"/>
    <text x="250" y="40" fill="#a78bfa">GEO — 35 786 km — RTT ≈ 520 à 600 ms — fixe dans le ciel</text>
    <text x="250" y="100" fill="#f59e0b">MEO — ≈ 8 000 km — RTT ≈ 130 à 150 ms (O3b)</text>
    <text x="250" y="160" fill="#34d399">LEO — ≈ 550 km — RTT ≈ 25 à 45 ms (Starlink, OneWeb)</text>
    <text x="250" y="200" fill="#7587a8">(échelle non respectée)</text>
  </svg><figcaption>Les trois familles d’orbites utilisées pour les télécommunications.</figcaption></figure>`;

  const FIG_RING = `<figure><svg viewBox="0 0 560 210" width="560" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="11">
    <g stroke-width="3"><line x1="280" y1="30" x2="430" y2="105" stroke="#22c55e"/><line x1="430" y1="105" x2="280" y2="180" stroke="#22c55e"/><line x1="280" y1="180" x2="130" y2="105" stroke="#22c55e"/><line x1="130" y1="105" x2="280" y2="30" stroke="#94a3b8" stroke-dasharray="8 6"/></g>
    <g fill="#16213a" stroke="#f472b6"><rect x="262" y="14" width="36" height="30" rx="6"/><rect x="412" y="90" width="36" height="30" rx="6"/><rect x="262" y="165" width="36" height="30" rx="6"/><rect x="112" y="90" width="36" height="30" rx="6"/></g>
    <circle cx="205" cy="67" r="12" fill="#0a0f1c" stroke="#94a3b8"/><text x="205" y="71" fill="#a9b8d3" text-anchor="middle" font-size="9" font-weight="bold">RPL</text>
    <text x="470" y="50" fill="#a9b8d3">IDLE : le lien RPL est bloqué</text><text x="470" y="66" fill="#a9b8d3">→ pas de boucle Ethernet</text>
    <text x="470" y="150" fill="#fcd34d">Panne d’un bond :</text><text x="470" y="166" fill="#fcd34d">RPL débloqué en &lt; 50 ms</text>
  </svg><figcaption>Anneau Ethernet protégé par ERPS (ITU-T G.8032).</figcaption></figure>`;

  const FIG_D2D_ARCHI = `<figure><svg viewBox="0 0 600 250" width="600" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="11">
    <rect x="0" y="0" width="600" height="70" fill="#0b1030"/><text x="10" y="16" fill="#7587a8">segment spatial (LEO 350 à 600 km, ou GEO)</text>
    <g fill="#16213a" stroke="#a3e635"><rect x="250" y="22" width="100" height="34" rx="6"/></g><text x="300" y="38" fill="#e2e8f0" text-anchor="middle">Satellite D2D</text><text x="300" y="51" fill="#a3e635" text-anchor="middle" font-size="9">antenne réseau 6 à 220 m²</text>
    <line x1="270" y1="56" x2="90" y2="160" stroke="#22c55e" stroke-width="2" stroke-dasharray="6 4 1 4"/><text x="120" y="100" fill="#a3e635">lien direct (bande opérateur ou L/S)</text>
    <line x1="330" y1="56" x2="470" y2="160" stroke="#a78bfa" stroke-width="2" stroke-dasharray="2 5"/><text x="420" y="100" fill="#c4b5fd">liaison de connexion (Ka, C)</text>
    <rect x="40" y="160" width="100" height="40" rx="6" fill="#16213a" stroke="#a3e635"/><text x="90" y="178" fill="#e2e8f0" text-anchor="middle">smartphone, IoT,</text><text x="90" y="192" fill="#e2e8f0" text-anchor="middle">véhicule</text>
    <rect x="420" y="160" width="100" height="40" rx="6" fill="#16213a" stroke="#a78bfa"/><text x="470" y="184" fill="#e2e8f0" text-anchor="middle">Station sol NTN</text>
    <line x1="470" y1="200" x2="470" y2="222" stroke="#fb923c" stroke-width="2"/><rect x="400" y="222" width="150" height="24" rx="5" fill="#16213a" stroke="#f472b6"/><text x="475" y="238" fill="#e2e8f0" text-anchor="middle">Cœur mobile EPC / 5GC</text>
    <rect x="190" y="200" width="90" height="34" rx="6" fill="#16213a" stroke="#22d3ee"/><text x="235" y="221" fill="#e2e8f0" text-anchor="middle">BTS terrestre</text>
    <line x1="140" y1="190" x2="190" y2="214" stroke="#22d3ee" stroke-dasharray="8 5"/><line x1="280" y1="226" x2="400" y2="234" stroke="#fb923c" stroke-width="2"/>
    <text x="10" y="246" fill="#7587a8">Le terminal reste sur la BTS tant qu’elle le couvre ; au-delà, il se rattache à la cellule satellite.</text>
  </svg><figcaption>Architecture Direct-to-Device : le satellite est une « cellule de plus » de l’opérateur mobile.</figcaption></figure>`;

  const FIG_DOPPLER_S = `<figure><svg viewBox="0 0 560 190" width="560" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="11">
    <line x1="50" y1="95" x2="530" y2="95" stroke="#334155"/><line x1="50" y1="15" x2="50" y2="175" stroke="#334155"/>
    <path d="M60 25 C200 30, 240 60, 290 95 S380 160, 520 165" fill="none" stroke="#a3e635" stroke-width="2.5"/>
    <path d="M60 170 C180 120, 230 30, 290 25 S400 120, 520 170" fill="none" stroke="#22d3ee" stroke-width="1.6"/>
    <text x="56" y="22" fill="#a3e635">+44 kHz (le satellite se rapproche)</text><text x="330" y="182" fill="#a3e635">−44 kHz (il s’éloigne)</text>
    <text x="300" y="22" fill="#22d3ee">élévation maximale</text><text x="296" y="110" fill="#e2e8f0">Doppler nul, dérive maximale ≈ 640 Hz/s</text>
    <text x="480" y="90" fill="#7587a8">temps</text><text x="8" y="100" fill="#7587a8">0</text>
  </svg><figcaption>Courbe en S du Doppler pendant un passage de 4 à 5 minutes (1,9 GHz, 525 km).</figcaption></figure>`;

  const FIG_D2D_SERVICES = `<figure><svg viewBox="0 0 560 170" width="560" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="11">
    <g stroke="#0a0f1c"><rect x="30" y="120" width="120" height="40" fill="#22c55e"/><rect x="155" y="90" width="120" height="70" fill="#84cc16"/><rect x="280" y="55" width="120" height="105" fill="#eab308"/><rect x="405" y="20" width="125" height="140" fill="#f97316"/></g>
    <g fill="#0a0f1c" font-weight="bold" text-anchor="middle"><text x="90" y="138">1. SMS, alertes</text><text x="215" y="108">2. Messagerie, IoT</text><text x="340" y="73">3. Voix, données</text><text x="467" y="38">4. Haut débit</text></g>
    <g fill="#0a0f1c" text-anchor="middle" font-size="10"><text x="90" y="152">SNR ≥ −15 dB · 1 kbit/s</text><text x="215" y="124">SNR ≥ −6 dB · 16 kbit/s</text><text x="340" y="89">SNR ≥ −4 dB · 40 kbit/s</text><text x="467" y="54">SNR ≥ 5 dB · 2 Mbit/s</text></g>
  </svg><figcaption>Services progressifs : chaque marche demande plus de signal, plus de débit par utilisateur et une couverture continue.</figcaption></figure>`;

  const COURSE_D2D = {
    id: 'd2d',
    title: 'Direct-to-Device : satellite vers mobile et IoT (NTN)',
    intro: '<p>Le <b>Direct-to-Device</b> (D2D), ou <b>Direct-to-Cell</b> (D2C), relie un satellite directement à un <b>smartphone ordinaire</b>, à un <b>objet connecté</b> ou à un <b>véhicule</b>, sans parabole ni terminal spécial. Pour un opérateur mobile, le satellite devient une cellule de plus de son réseau, là où aucune BTS n’est rentable ou disponible. La 3GPP l’a normalisé sous le nom de <b>NTN</b> (Non-Terrestrial Networks) à partir de la Release 17. Les encadrés <b>Licence</b> et <b>Master / ingénieur</b> approfondissent chaque notion ; le cœur du chapitre est accessible au Bac Pro.</p>',
    sections: [
      {
        id: 'd2d-pourquoi',
        title: 'Pourquoi le Direct-to-Device ?',
        html: `<p>En Afrique de l’Ouest, la 4G couvre les villes et les grands axes, mais de vastes <b>zones blanches</b> subsistent : une BTS rurale coûte cher (pylône, énergie solaire, transmission) pour peu d’abonnés. Le satellite direct comble ces trous sans changer de téléphone.</p>
          <table><tr><th>Usage</th><th>Exemple</th><th>Service visé</th></tr>
          <tr><td>Zones blanches et rurales</td><td>Hameau, berger transhumant, site minier</td><td>SMS, messagerie, voix</td></tr>
          <tr><td>Urgences et catastrophes</td><td>Inondation, BTS détruites ou sans transmission</td><td>Alerte à la population, SMS de détresse, appel des secours</td></tr>
          <tr><td>Déplacements hors couverture</td><td>Route nationale, fleuve, désert</td><td>Continuité de service, bascule automatique</td></tr>
          <tr><td>Services progressifs</td><td>Offre lancée par étapes</td><td>SMS → messagerie → voix → données</td></tr>
          <tr><td>Objets connectés et véhicules</td><td>Bétail, capteurs de crue, flottes de camions, ambulances</td><td>Messages IoT, télématique, appel d’urgence</td></tr></table>
          <p>Modèle économique : l’opérateur mobile signe un <b>accord</b> avec un opérateur de satellites ; il lui prête une partie de son spectre (Direct-to-Cell) ou ses abonnés <b>itinèrent</b> sur le réseau satellite. Le réseau terrestre reste <b>prioritaire</b> : le satellite ne sert que lorsqu’aucune cellule terrestre n’est utilisable.</p>
          <div class="lvl-box licence"><b>Licence</b> — Le D2D ne remplace pas la BTS : une cellule satellite de plusieurs dizaines de kilomètres de diamètre partage quelques Mbit/s entre tous ses abonnés, contre plusieurs dizaines de Mbit/s pour une cellule terrestre de quelques km². C’est un service de <b>couverture</b>, pas de <b>capacité</b>.</div>
          <p>À explorer : exemples 6 (zone blanche) et 7 (catastrophe) dans la fenêtre Travaux Pratiques, onglet Exemples.</p>`,
      },
      {
        id: 'd2d-familles',
        title: 'Deux familles : spectre de l’opérateur ou bandes satellitaires',
        html: `<table><tr><th></th><th>Direct-to-Cell (spectre opérateur)</th><th>NTN 3GPP (bandes MSS)</th></tr>
          <tr><td>Fréquences</td><td>Bandes 4G/5G de l’opérateur (700, 800, 900, 1 800, 1 900, 2 100 MHz) réutilisées depuis l’espace</td><td>Bandes du service mobile par satellite : n255 (bande L, 1,6 / 1,5 GHz), n256 (bande S, 2,0 / 2,2 GHz)</td></tr>
          <tr><td>Terminal</td><td>Smartphone 4G/5G du commerce, <b>sans modification</b></td><td>Puce compatible <b>NTN Rel-17</b> (NB-NTN, NR-NTN) : précompensation GNSS</td></tr>
          <tr><td>Qui corrige le Doppler ?</td><td>Le satellite, au centre de chaque faisceau</td><td>Le terminal, grâce à sa position GNSS et aux éphémérides du satellite</td></tr>
          <tr><td>Contrainte</td><td>Ne pas brouiller les réseaux terrestres voisins (mêmes fréquences)</td><td>Parc de terminaux compatibles à renouveler</td></tr></table>
          <p>Profils de systèmes du simulateur (ordres de grandeur publics arrondis) :</p>
          <table><tr><th>Profil</th><th>Orbite</th><th>Antenne du satellite</th><th>Charge utile</th><th>Service</th></tr>
          <tr><td>Direct-to-Cell LTE (type Starlink Direct to Cell)</td><td>LEO 525 km, ≈ 650 satellites</td><td>Réseau actif ≈ 6 m²</td><td>Régénérative (eNodeB à bord)</td><td>SMS, messagerie, voix</td></tr>
          <tr><td>Grandes antennes (type AST SpaceMobile)</td><td>LEO 520 km, quelques satellites</td><td>Réseau déployé ≈ 64 m² (jusqu’à 220 m²)</td><td>Transparente</td><td>Haut débit, couverture intermittente</td></tr>
          <tr><td>IoT GEO bande L (type Skylo)</td><td>GEO</td><td>Réflecteur ≈ 9 m</td><td>Transparente</td><td>Messages IoT, SMS</td></tr>
          <tr><td>IoT LEO à stockage et retransmission (type Sateliot)</td><td>LEO 550 km, quelques nanosatellites</td><td>≈ 0,25 m²</td><td>Régénérative</td><td>Messages IoT différés</td></tr></table>`,
      },
      {
        id: 'd2d-architecture',
        title: 'Architecture : du terminal au cœur de réseau',
        html: `${FIG_D2D_ARCHI}
          <ul><li><b>Lien direct</b> (service link) : entre le terminal et le satellite, dans la bande mobile.</li>
          <li><b>Liaison de connexion</b> (feeder link) : entre le satellite et une <b>station sol NTN</b> (gateway), en bande Ka ou C, avec de grandes paraboles.</li>
          <li><b>Cœur mobile</b> (EPC 4G ou 5GC) de l’opérateur : authentification de la carte SIM, mobilité, accès à Internet. Le satellite n’est qu’un réseau d’accès radio.</li></ul>
          <table><tr><th>Charge utile</th><th>Principe</th><th>Conséquence</th></tr>
          <tr><td><b>Transparente</b> (« bent-pipe »)</td><td>Le satellite amplifie et change la fréquence ; la station de base est au sol, derrière la gateway.</td><td>Le signal fait deux trajets spatiaux ; la pluie ou le bruit du feeder dégradent <b>tous</b> les terminaux.</td></tr>
          <tr><td><b>Régénérative</b></td><td>La station de base (eNodeB / gNB) est à bord ; liaisons laser entre satellites possibles.</td><td>Délai radio plus court, satellite plus complexe ; le feeder ne transporte que le trafic.</td></tr></table>
          <div class="lvl-box licence"><b>Licence</b> — Pour que l’abonné soit accepté, le satellite diffuse un identifiant de réseau (PLMN) que la carte SIM sait utiliser : celui de l’opérateur (Direct-to-Cell) ou un réseau partenaire en itinérance. Sans accord entre les deux opérateurs, seule la cellule est vue : appels d’urgence seulement.</div>
          <div class="lvl-box master"><b>Master / ingénieur</b> — En 5G NTN régénérative, on peut embarquer seulement l’unité distribuée (gNB-DU) et garder l’unité centrale (gNB-CU) au sol : l’interface F1 passe alors par le feeder. La gateway héberge aussi la fonction de compensation du délai de feeder et diffuse le « TA commun » (SIB19 en NR, SIB31 en NB-IoT).</div>`,
      },
      {
        id: 'd2d-bilan',
        title: 'Le bilan de liaison d’un smartphone',
        html: `<p>Un smartphone n’a ni gain d’antenne (≈ 0 dBi) ni amplificateur puissant (classe 3 : <b>23 dBm</b>, soit 200 mW). Son antenne omnidirectionnelle « voit » la Terre chaude (290 K) : son facteur de mérite est minuscule.</p>
          <div class="formula">G/T (smartphone) = 0 − 10·log(290 + 290·(10^(7/10) − 1)) ≈ −31,6 dB/K        (VSAT 1,2 m en Ku : ≈ +20 dB/K)</div>
          <p>Tout l’effort repose donc sur le satellite : une antenne de plusieurs m² qui concentre l’énergie dans des faisceaux étroits. Exemple calculé par le simulateur (Direct-to-Cell, 1 962 MHz, satellite à 525 km vu à 50°) :</p>
          <table><tr><th>Terme (descendant)</th><th>Valeur</th></tr>
          <tr><td>Distance terminal → satellite : d = √((R+h)² − (R·cos E)²) − R·sin E</td><td>668 km</td></tr>
          <tr><td>FSL = 32,45 + 20·log(668) + 20·log(1 962)</td><td>154,8 dB</td></tr>
          <tr><td>Gain du réseau de 6 m² : G = 10·log(0,6 × 4π × 6 / 0,153²)</td><td>32,9 dBi</td></tr>
          <tr><td>PIRE du faisceau (10 W, perte de balayage 1,1 dB)</td><td>41,7 dBW</td></tr>
          <tr><td>Pertes : position dans le faisceau 0,75 ; scintillation 1,3 ; ombrage 1,8 ; polarisation 3 + corps 3</td><td>≈ 10,9 dB</td></tr>
          <tr><td>Puissance reçue C</td><td><b>−93,0 dBm</b></td></tr>
          <tr><td>Bruit sur 25 blocs (4,5 MHz) : N = −228,6 + 10·log(1 453 K) + 10·log(4,5·10⁶)</td><td>−100,4 dBm</td></tr>
          <tr><td>SNR = C − N ; RSRP = C − 10·log(12 × 25)</td><td><b>7,4 dB</b> ; −117,8 dBm</td></tr>
          <tr><td>Débit du faisceau (CQI 7, 16QAM)</td><td>≈ 5 Mbit/s</td></tr></table>
          <p><b>Pourquoi l’orbite basse ?</b> Vers un GEO, le FSL vaudrait ≈ 189 dB à la même fréquence : 35 dB de plus, soit un signal 3 000 fois plus faible. Seuls des satellites GEO à réflecteur géant servent des messages IoT à très bas débit.</p>
          <div class="lvl-box licence"><b>Licence</b> — Le <b>RSRP</b> (puissance par élément de ressource de 15 kHz) est la grandeur que le téléphone mesure et compare aux seuils. Un réseau terrestre est confortable au-dessus de −100 dBm ; une cellule satellite fonctionne vers −110 à −125 dBm. La polarisation coûte 3 dB : antenne linéaire du téléphone face à une onde circulaire.</div>
          <div class="lvl-box master"><b>Master / ingénieur</b> — En montant, la puissance du téléphone est fixe : plus la bande allouée B est large, plus sa densité spectrale baisse (−3 dB par doublement). Le débit plafonne à la limite de Shannon à bande infinie :
            <div class="formula">C/N0 = C − k − 10·log T_sat   ;   D_max = (C/N0)·log₂(e)</div>
            Dans l’exemple, C = −110,1 dBm au satellite, C/N0 = 62,4 dBHz, D_max ≈ 2,5 Mbit/s ; l’allocation optimale (25 blocs, SNR −4 dB) donne ≈ 790 kbit/s. L’ordonnanceur donne donc peu de blocs à chaque terminal et partage le temps. Le modèle d’ombrage et d’encombrement suit le rapport 3GPP TR 38.811 (rural : σ ≈ 1 à 2 dB en visibilité directe, perte d’encombrement ≈ 18 dB sinon).</div>
          <p>Méthode complète : <a href="#" data-doc="fiche-d2d">Dimensionner une liaison Direct-to-Device</a> (Fiches d’ingénierie).</p>`,
      },
      {
        id: 'd2d-leo',
        title: 'Contraintes de l’orbite basse : Doppler, délais, handover',
        html: `<p>Un satellite à 525 km tourne à <b>7,6 km/s</b> (27 000 km/h) : il traverse le ciel en 4 à 5 minutes, puis le terminal passe au suivant (<b>handover</b>). Une couverture continue demande des centaines de satellites.</p>
          ${FIG_DOPPLER_S}
          <div class="formula">Doppler : f_d = (f/c)·v·R·cos E / (R + h)      → ±44 kHz à 1,9 GHz        Dérive : ḟ = (f/c)·v²·R / ((R + h)·h) ≈ 640 Hz/s</div>
          <p>Or les sous-porteuses 4G sont espacées de 15 kHz : sans correction, le signal serait illisible. Deux solutions : le satellite <b>précompense</b> le Doppler au centre de chaque faisceau (smartphone non modifié, faisceaux étroits), ou le terminal NTN calcule lui-même le Doppler à partir de sa <b>position GNSS</b> et des <b>éphémérides</b> diffusées par le satellite.</p>
          <div class="lvl-box licence"><b>Licence</b> — Délais : d/c = 2,2 ms pour 668 km ; RTT radio ≈ 4,5 ms en régénératif, ≈ 10 ms en transparent (deux trajets) et ≈ 500 ms en GEO. Taille de constellation pour une couverture continue :
            <div class="formula">θ = arccos(R·cos E_min / (R + h)) − E_min   ;   N ≈ 4πR² / (0,827 × 2πR²(1 − cos θ))</div>
            À 525 km et E_min = 25° : θ = 8,1°, rayon couvert ≈ 906 km, N ≈ 241 satellites au minimum.</div>
          <div class="lvl-box master"><b>Master / ingénieur</b> — Le terminal doit émettre en avance pour que sa trame arrive alignée (avance temporelle) : TA commun diffusé + TA propre calculé (GNSS). L’écart centre-bord d’un faisceau, ΔTA = 2·r·cos E / c, vaut ≈ 64 µs pour 30 km ; un smartphone non modifié s’appuie sur le préambule PRACH (≈ 100 µs). Le décalage d’ordonnancement <b>K_offset</b> ≥ RTT et le nombre de processus <b>HARQ</b> nécessaires (⌈RTT + 8 ms⌉ = 13 ici) dépassent les 8 processus LTE : la Rel-17 en autorise 32, ou désactive le HARQ en GEO. Erreur résiduelle tolérée sur la fréquence montante : ±0,1 ppm ; des éphémérides trop anciennes la font dépasser.</div>`,
      },
      {
        id: 'd2d-iot',
        title: 'IoT par satellite (NB-IoT, LTE-M NTN)',
        html: `<p>Un capteur envoie quelques dizaines d’octets plusieurs fois par jour et doit tenir <b>10 ans sur une pile</b>. Les technologies NB-IoT et LTE-M, adaptées au satellite (Rel-17), le permettent :</p>
          <ul><li><b>Répétitions</b> : le même message est émis jusqu’à 2 048 fois ; chaque doublement apporte ≈ 2,6 dB (85 % des 3 dB théoriques). On descend ainsi à des SNR de −15 dB et plus (MCL ≈ 164 dB).</li>
          <li><b>Une seule sous-porteuse</b> de 3,75 ou 15 kHz en montant : toute la puissance dans une bande minuscule.</li>
          <li><b>Veille profonde</b> (PSM, eDRX) : le module dort à 3 µA entre deux messages ; la <b>RAI</b> (Release Assistance Indication) le renvoie en veille dès l’envoi.</li>
          <li><b>Stockage et retransmission</b> : avec quelques nanosatellites, le message attend le passage d’un satellite puis la station sol suivante (quelques minutes à quelques heures).</li></ul>
          <div class="formula">Autonomie = 0,8 × C_pile / I_moyen   ;   I_moyen = (I_GNSS·t_GNSS + I_rx·t_rx + I_tx·t_tx) × messages/jour / 86 400 s + I_veille</div>
          <div class="lvl-box licence"><b>Licence</b> — Spécificité NTN : avant chaque émission, le module refait un <b>point GNSS</b> (quelques secondes à 25 mA) pour précompenser Doppler et délai. C’est souvent le premier poste de consommation : 4 messages par jour avec 5 s de GNSS, 8 répétitions et 1 kbit/s donnent ≈ 7 ans sur 5 Ah.</div>
          <div class="lvl-box master"><b>Master / ingénieur</b> — Délai moyen en stockage et retransmission : τ ≈ Δt/2 + T_orbite / (2·N_stations), avec Δt l’attente entre passages ; pour 6 satellites polaires au-dessus du Sahel : ≈ 10 passages par jour, Δt ≈ 2 h 15, τ ≈ 1 h 20. Le choix GEO (toujours visible, alerte de crue en temps réel) ou LEO clairsemé (moins cher, différé) dépend du besoin de latence.</div>`,
      },
      {
        id: 'd2d-coexistence',
        title: 'Coexistence avec le réseau terrestre et réglementation',
        html: `<p>Le Direct-to-Cell émet dans les fréquences des BTS. Il ne doit pas les brouiller :</p>
          <ul><li>le satellite n’éclaire que les zones sans couverture terrestre de l’opérateur (géorepérage des faisceaux) ;</li>
          <li>hors de la zone servie, la <b>densité de flux surfacique</b> au sol est plafonnée (ordre de grandeur : −120 dBW/m²/MHz) ;</li>
          <li>le terminal reste sur la cellule terrestre tant que son RSRP dépasse le seuil de bascule (≈ −115 dBm).</li></ul>
          <div class="formula">PFD = PIRE − L_lobes − 10·log(4π·d²) − 10·log(B_MHz)        Exemple : 40 dBW, 700 km, 5 MHz → 25 dB de lobes : −119,9 (dépassé) ; 27 dB : respecté</div>
          <div class="lvl-box licence"><b>Licence</b> — Réglementation : l’UIT étudie pour la CMR-27 (point 1.13) l’utilisation directe des bandes mobiles IMT par des satellites ; chaque pays (au Burkina Faso, l’ARCEP) autorise l’usage du spectre de l’opérateur depuis l’espace et l’atterrissage du service. Les bandes MSS L et S relèvent déjà du service mobile par satellite.</div>
          <div class="lvl-box master"><b>Master / ingénieur</b> — Le brouillage reçu par un terminal terrestre vaut I = PFD + 10·log(B) + 10·log(λ²/4π) + G ; on le compare au signal de la BTS (C/I). Les marges imposent des réseaux d’antennes à lobes secondaires très bas, une réutilisation de fréquences entre faisceaux (1, 3, 4 ou 7) et une coordination avec les opérateurs des pays voisins.</div>`,
      },
      {
        id: 'd2d-services',
        title: 'Services progressifs et cas d’usage',
        html: `${FIG_D2D_SERVICES}
          <table><tr><th>Phase</th><th>Services</th><th>Ce qu’il faut</th></tr>
          <tr><td>1 (2024-2025)</td><td>Alerte à la population, SMS</td><td>Très peu de signal (répétitions), file d’attente acceptée</td></tr>
          <tr><td>2 (2025-2026)</td><td>Messagerie instantanée, IoT</td><td>Quelques kbit/s par utilisateur</td></tr>
          <tr><td>3 (2026 et après)</td><td>Voix (VoLTE), données</td><td>≈ 40 kbit/s garantis, RTT &lt; 600 ms, couverture continue</td></tr>
          <tr><td>4 (à venir)</td><td>Vidéo, haut débit</td><td>Satellites à très grandes antennes, beaucoup de satellites</td></tr></table>
          <p>Un service « temps réel » (voix, vidéo) exige une couverture <b>continue</b> : avec trop peu de satellites, il devient seulement <b>différé</b>. Plus il y a d’abonnés dans un faisceau, plus le débit par utilisateur baisse : les services du haut de l’escalier disparaissent les premiers.</p>
          <p>Cas d’usage à charger dans le simulateur (Exemples 6 à 10) : zone blanche rurale, catastrophe naturelle, déplacement hors couverture, IoT au Sahel, véhicules connectés. Mode d’emploi : <a href="#" data-doc="guide-d2d">Direct-to-Device : satellite vers mobile et IoT</a> (guide de l’utilisateur).</p>`,
      },
    ],
  };

  const COURSE = {
    chapters: [
      {
        id: 'bases',
        title: 'Bases des transmissions hertziennes',
        intro: '<p>Ce chapitre rappelle les notions communes aux faisceaux hertziens, à la BLR et au satellite : décibels, puissance, propagation en espace libre et bilan de liaison.</p>',
        sections: [
          {
            id: 'db',
            title: 'Décibels : dB, dBm, dBW, dBi',
            html: `<p>En radio, les puissances varient sur des milliards de fois : on utilise une échelle logarithmique.</p>
              <div class="formula">G (dB) = 10·log(P2 / P1)      P (dBm) = 10·log(P / 1 mW)      P (dBW) = 10·log(P / 1 W)</div>
              <table><tr><th>Puissance</th><th>dBm</th><th>dBW</th></tr><tr><td>1 mW</td><td>0 dBm</td><td>−30 dBW</td></tr><tr><td>100 mW</td><td>20 dBm</td><td>−10 dBW</td></tr><tr><td>1 W</td><td>30 dBm</td><td>0 dBW</td></tr><tr><td>4 W (BUC)</td><td>36 dBm</td><td>6 dBW</td></tr><tr><td>200 W (HPA)</td><td>53 dBm</td><td>23 dBW</td></tr></table>
              <ul><li><b>+3 dB</b> = puissance × 2 ; <b>+10 dB</b> = × 10 ; <b>−3 dB</b> = ÷ 2.</li><li>Le <b>dBi</b> exprime le gain d’une antenne par rapport à une antenne isotrope (qui rayonne également dans toutes les directions).</li><li>Dans un bilan, les gains s’<b>ajoutent</b> et les pertes se <b>soustraient</b>.</li></ul>`,
          },
          {
            id: 'spectre',
            title: 'Fréquence, longueur d’onde et bandes',
            html: `<div class="formula">λ = c / f        (c = 3·10⁸ m/s)        ex. : 15 GHz → λ = 2 cm</div>
              <table><tr><th>Usage</th><th>Bandes</th><th>Portée typique</th></tr>
              <tr><td>Faisceaux hertziens longue distance</td><td>6, 7, 8 GHz</td><td>30 à 60 km</td></tr>
              <tr><td>FH moyenne distance</td><td>11, 13, 15 GHz</td><td>10 à 30 km</td></tr>
              <tr><td>FH courte distance / urbain</td><td>18, 23 GHz</td><td>3 à 15 km</td></tr>
              <tr><td>E-Band (très haut débit)</td><td>70 / 80 GHz</td><td>0,5 à 3 km</td></tr>
              <tr><td>BLR / FWA</td><td>3,5 GHz, 5,8 GHz, 26 GHz</td><td>0,3 à 15 km</td></tr>
              <tr><td>Satellite</td><td>C (6/4), Ku (14/12), Ka (30/20 GHz)</td><td>36 000 km (GEO)</td></tr></table>
              <p>Plus la fréquence est élevée : plus de bande passante disponible (débit), antennes plus petites pour un même gain, mais affaiblissement et sensibilité à la pluie plus forts.</p>`,
          },
          {
            id: 'bilan',
            title: 'Bilan de liaison',
            html: `<p>Le bilan de liaison suit la puissance de l’émetteur jusqu’au récepteur :</p>
              <div class="formula">PIRE = Ptx − Pertes_tx + Gtx<br>RSL = PIRE − FSL − A_gaz − A_pluie − A_diff + Grx − Pertes_rx</div>
              <div class="formula">FSL (dB) = 92,45 + 20·log(d km) + 20·log(f GHz)</div>
              <p>Le récepteur fonctionne si le <b>RSL</b> dépasse son <b>seuil</b>, qui dépend du bruit thermique et de la modulation :</p>
              <div class="formula">N (dBm) = −174 + 10·log(B Hz) + NF        Seuil = N + C/N requis</div>
              <div class="formula">Marge au fading = RSL (ciel clair) − Seuil</div>
              <div class="tip">Exemple TP 1 : 25 km à 7 GHz → FSL = 92,45 + 27,96 + 17,15 ≈ 137,6 dB.</div>`,
          },
        ],
      },
      {
        id: 'fh',
        title: 'Faisceaux Hertziens (Microwave)',
        intro: '<p>Un faisceau hertzien (FH) est une liaison radio <b>point-à-point</b>, directive, en visibilité directe, qui remplace une fibre pour le transport (backhaul) des sites mobiles, des entreprises ou des réseaux d’opérateurs.</p>',
        sections: [
          {
            id: 'archi',
            title: 'Architectures : split-mount, full-indoor, full-outdoor',
            html: `${FIG_SPLIT}
              <ul><li><b>IDU</b> (Indoor Unit) : modem, multiplexage, ports Ethernet GbE / 10 GbE, VLAN, ACM, XPIC. Installée en local technique.</li>
              <li><b>ODU</b> (Outdoor Unit) : émetteur-récepteur RF fixé derrière l’antenne, relié à l’IDU par un câble coaxial IF qui transporte signal et alimentation.</li>
              <li><b>Full-Outdoor</b> : tout est intégré derrière l’antenne, alimenté en <b>PoE++</b>, avec sortie Ethernet ou fibre. Installation simplifiée, pas de local nécessaire.</li></ul>
              <p>Configurations : <b>1+0</b> (sans protection), <b>1+1 HSB</b> (Hot Stand-By : un équipement de secours prend le relais en cas de panne), <b>2+0 XPIC</b> (deux canaux sur les deux polarisations).</p>`,
          },
          {
            id: 'antenne',
            title: 'Antennes paraboliques',
            html: `<div class="formula">G (dBi) = 10·log(η·(π·D/λ)²)        θ3dB ≈ 70·λ / D (degrés)</div>
              <table><tr><th>Diamètre</th><th>Gain à 7 GHz</th><th>Gain à 18 GHz</th><th>θ3dB à 18 GHz</th></tr>
              <tr><td>0,6 m</td><td>30,5 dBi</td><td>38,5 dBi</td><td>1,9°</td></tr><tr><td>1,2 m</td><td>36,5 dBi</td><td>44,5 dBi</td><td>1,0°</td></tr><tr><td>1,8 m</td><td>40,1 dBi</td><td>48,0 dBi</td><td>0,65°</td></tr></table>
              <p>Doubler le diamètre = +6 dB de gain, mais faisceau deux fois plus étroit : l’alignement doit être plus précis et le pylône plus rigide. Le simulateur calcule la <b>perte de dépointage</b> L = 12·(Δθ / θ3dB)².</p>`,
          },
          {
            id: 'fresnel',
            title: 'Visibilité, zone de Fresnel et courbure terrestre',
            html: `${FIG_FRESNEL}
              <div class="formula">r1 (m) = 17,32·√(d1·d2 / (f·d))      [d en km, f en GHz]</div>
              <div class="formula">Renflement terrestre h (m) = d1·d2 / (12,74·k)      k = 4/3 (atmosphère standard)</div>
              <ul><li>Critère d’ingénierie : <b>60 %</b> de r1 dégagé au minimum ; 100 % idéalement.</li><li>Si un obstacle pénètre dans la zone de Fresnel, une <b>perte de diffraction</b> apparaît (≈ 6 dB quand l’obstacle affleure la ligne de visée, 20 dB et plus si elle est coupée).</li><li>Le facteur <b>k</b> traduit la courbure des ondes par l’atmosphère : avec k = 4/3, la Terre paraît « plus plate ».</li></ul>`,
          },
          {
            id: 'pluie',
            title: 'Atténuation par la pluie',
            html: `<div class="formula">γR = k·R^α (dB/km)      A_pluie = γR × d_eff      d_eff = d / (1 + d/d0), d0 = 35·e^(−0,015·R)</div>
              <p>Les coefficients k et α (recommandation UIT-R P.838) augmentent fortement avec la fréquence et dépendent de la polarisation (la polarisation <b>verticale</b> est moins atténuée).</p>
              <table><tr><th>Pluie 50 mm/h, 10 km</th><th>7 GHz</th><th>15 GHz</th><th>23 GHz</th><th>80 GHz</th></tr><tr><td>Atténuation spécifique</td><td>≈ 0,5 dB/km</td><td>≈ 3 dB/km</td><td>≈ 6 dB/km</td><td>≈ 18 dB/km</td></tr></table>
              <div class="warning">En Afrique de l’Ouest, les orages dépassent fréquemment 80 à 100 mm/h : les bandes hautes ne conviennent qu’aux bonds courts.</div>`,
          },
          {
            id: 'acm',
            title: 'Modulation adaptative (ACM)',
            html: `<p>Plus une modulation transporte de bits par symbole, plus elle exige un bon rapport signal/bruit :</p>
              <table><tr><th>Modulation</th><th>Bits/symbole</th><th>C/N requis</th><th>Débit (28 MHz)</th></tr>
              <tr><td>QPSK</td><td>2</td><td>≈ 10 dB</td><td>≈ 41 Mbit/s</td></tr><tr><td>16QAM</td><td>4</td><td>≈ 16,5 dB</td><td>≈ 82 Mbit/s</td></tr><tr><td>64QAM</td><td>6</td><td>≈ 22,5 dB</td><td>≈ 124 Mbit/s</td></tr><tr><td>256QAM</td><td>8</td><td>≈ 28,5 dB</td><td>≈ 165 Mbit/s</td></tr><tr><td>1024QAM</td><td>10</td><td>≈ 34,5 dB</td><td>≈ 206 Mbit/s</td></tr></table>
              <p>Avec l’<b>ACM</b>, le modem change de modulation en temps réel, sans coupure (« hitless ») : sous la pluie il descend vers QPSK, puis remonte quand le ciel se dégage. Associée à la <b>QoS</b>, l’ACM préserve les services prioritaires (voix, signalisation).</p>`,
          },
          {
            id: 'xpic',
            title: 'Double polarisation et XPIC',
            html: `<p>Une même fréquence peut porter deux signaux indépendants, l’un en polarisation <b>V</b>, l’autre en <b>H</b> (CCDP, Co-Channel Dual Polarization) : le débit est <b>doublé</b>.</p>
              <p>Le découplage entre polarisations (<b>XPD</b>, ≈ 30 dB pour l’antenne) se dégrade sous la pluie : XPD = U − V·log(A_pluie). Le <b>XPIC</b> (Cross-Polarization Interference Canceller) soustrait la fuite de l’autre polarisation et apporte ≈ 20 dB d’amélioration. Sans XPIC, une liaison V+H ne peut pas utiliser les modulations élevées.</p>`,
          },
          {
            id: 'dispo',
            title: 'Disponibilité, trajets multiples et diversité d’espace',
            html: `<p>La <b>disponibilité</b> d’une liaison est le pourcentage du temps où elle fonctionne avec la qualité demandée. Les objectifs courants sont <b>99,99 %</b> (53 min de coupure par an) pour le débit nominal et <b>99,999 %</b> (5 min) pour la coupure totale.</p>
              <p>Deux phénomènes font descendre le signal sous le seuil :</p>
              <ul><li>la <b>pluie</b>, surtout au-dessus de 10 GHz : on la combat par une bande basse et de la marge ;</li><li>les <b>évanouissements par trajets multiples</b>, sur les bonds longs : la nuit, des couches d’air chaud et humide font arriver le signal par plusieurs chemins qui s’annulent par moments.</li></ul>
              <p>La recommandation <b>UIT-R P.530</b> calcule le pourcentage de temps où l’évanouissement dépasse la marge A :</p>
              <div class="formula">K = 10^(−4,6 − 0,0027·dN1)      p0 = K · d^3,1 · (1 + |εp|)^−1,29 · f^0,8 · 10^(−0,00089·hL)      pw = p0 · 10^(−A/10)</div>
              <ul><li><b>dN1</b> : gradient de réfractivité du climat (très négatif sur la côte humide) ;</li><li><b>d</b> en km : l’indisponibilité croît comme d^3,1, donc doubler la longueur la multiplie par 8,6 ;</li><li><b>εp</b> : inclinaison du trajet, en mrad ;</li><li><b>hL</b> : altitude de l’antenne la plus basse ;</li><li><b>chaque dB de marge</b> divise le temps de coupure par 1,26, et 10 dB le divisent par 10.</li></ul>
              <p>La <b>diversité d’espace (SD)</b> ajoute à chaque extrémité une seconde antenne de réception, S mètres sous la première. Les deux signaux s’évanouissent rarement ensemble : le temps de coupure est divisé par le <b>facteur d’amélioration I</b> (souvent 5 à 50), qui croît avec S et avec la marge. L’antenne basse doit garder un bon dégagement de Fresnel.</p>
              <div class="formula">k² = exp(−0,0004·S^0,87·f^−0,12·d^0,48·p0^−0,04/η)      I = (100η/p0)·[1 − k²·(1 − p0/(100η)·10^(−A/10))]·10^((A−V)/10)</div>
              <p>Dans le simulateur, l’onglet <b>Bilan de liaison</b> d’un bond FH affiche la disponibilité par modulation. Le climat et l’objectif se règlent dans les réglages du projet (cliquez sur le fond du canevas), la diversité dans les paramètres du lien (configuration 1+1 SD). Voir le TP 14.</p>`,
          },
          {
            id: 'plan-freq',
            title: 'Plan de fréquences et interférences',
            html: `<p>Chaque bande FH est découpée en <b>canaux</b>. Ils sont groupés en <b>deux demi-bandes</b> séparées par l’<b>écart duplex</b> (252 MHz à 6 GHz, 420 MHz à 15 GHz) : une extrémité émet en demi-bande basse et reçoit en haute, l’autre fait l’inverse.</p>
              <p>Règles d’un bon plan de fréquences :</p>
              <ol><li><b>Règle haut / bas</b> : toutes les émissions d’un même site sont dans la même demi-bande. Un émetteur à quelques mètres d’un récepteur réglé sur sa fréquence l’aveuglerait.</li><li><b>Discrimination angulaire</b> : un brouilleur vu à θ° de l’axe de l’antenne est atténué de G(0) − G(θ). Ce n’est que 15 à 30 dB sous 20°, d’où la règle suivante.</li><li>Deux bonds <b>proches en direction</b> sont séparés par le <b>canal</b> (discrimination de filtrage NFD ≈ 30 dB pour le canal adjacent) ou par la <b>polarisation</b> (V / H, ≈ 25 à 30 dB).</li><li><b>Réutilisation</b> : un même canal peut servir dans des directions bien séparées, car le rayonnement arrière d’une parabole est 40 à 60 dB sous le lobe principal.</li><li>Attention au <b>dépassement de portée</b> (<i>overreach</i>) : dans une chaîne rectiligne, un émetteur peut atteindre le site situé deux bonds plus loin. On décale les sites en zigzag ou on alterne les canaux.</li></ol>
              <div class="formula">I = Ptx − pertes + G_Tx(θTx) − FSL − pluie + G_Rx(θRx) − NFD − XPD      C/I = RSL − I   (objectif ≥ 30 dB)</div>
              <p>Dans le simulateur, activez <b>Interférences entre bonds FH</b> dans les réglages du projet. Chaque ODU ou Full-Outdoor possède un <b>canal</b> et une <b>demi-bande d’émission</b>, et le bilan de liaison liste les brouilleurs reçus. Voir le TP 15.</p>`,
          },
        ],
      },
      {
        id: 'blr',
        title: 'Boucle Locale Radio (BLR / FWA)',
        intro: '<p>La BLR raccorde des abonnés (entreprises, particuliers) <b>sans fil</b> depuis une station de base : c’est une architecture <b>point-à-multipoint</b>. On parle aujourd’hui de FWA (Fixed Wireless Access) en 4G/5G.</p>',
        sections: [
          {
            id: 'pmp',
            title: 'Architecture point-à-multipoint',
            html: `<ul><li><b>Station de base (BTS)</b> : antennes <b>sectorielles</b> (60°, 90° ou 120°) installées en hauteur ; 3 ou 4 secteurs couvrent 360°.</li><li><b>CPE</b> (Customer Premises Equipment) : terminal abonné avec antenne directive pointée vers la BTS, en <b>outdoor</b> (meilleur gain) ou <b>indoor</b> (installation simple, pertes de mur de 10 à 20 dB).</li><li>La capacité du secteur est <b>partagée</b> entre les CPE ; en <b>TDD</b>, le temps est réparti entre voie descendante et montante (ex. 70 / 30).</li></ul>
              <div class="formula">G_secteur ≈ 10·log(η·41 253 / (θH·θV))      ex. 90° × 5° → ≈ 17 dBi</div>`,
          },
          {
            id: 'bandes-blr',
            title: 'Bandes et technologies',
            html: `<table><tr><th>Bande</th><th>Technologies</th><th>Atouts</th><th>Limites</th></tr>
              <tr><td>3,5 GHz</td><td>WiMAX, LTE-TDD, 5G NR (n78)</td><td>Bonne portée, pénétration correcte</td><td>Bande licenciée, capacité moyenne</td></tr>
              <tr><td>5,8 GHz</td><td>Systèmes propriétaires WISP</td><td>Bande libre, matériel économique</td><td>Interférences, puissance limitée</td></tr>
              <tr><td>26 GHz</td><td>5G mmWave, LMDS</td><td>Très haut débit (canaux de 100 à 400 MHz)</td><td>Portée < 2 km, visibilité directe, pluie</td></tr></table>`,
          },
          {
            id: 'vlan-blr',
            title: 'Séparation des clients par VLAN',
            html: `<p>Chaque CPE étiquette le trafic de son client avec un <b>VLAN d’accès</b> (port « access »). Les liens entre BTS, switch et cœur de réseau sont des <b>trunks</b> qui transportent plusieurs VLAN. Les clients sont ainsi isolés au niveau 2 (voir chapitre Transport IP).</p>`,
          },
        ],
      },
      {
        id: 'vsat',
        title: 'Liaisons satellitaires VSAT',
        intro: '<p>Un VSAT (Very Small Aperture Terminal) est une petite station terrienne (antenne de 0,75 à 2,4 m) qui communique via un satellite avec une grande station centrale, le <b>Hub</b> ou <b>téléport</b>, relié au réseau de l’opérateur et à Internet.</p>',
        sections: [
          {
            id: 'orbites',
            title: 'Orbites GEO, MEO, LEO',
            html: `${FIG_ORBITS}
              <table><tr><th>Orbite</th><th>Altitude</th><th>Période</th><th>RTT typique</th><th>Antenne sol</th></tr>
              <tr><td>GEO</td><td>35 786 km</td><td>23 h 56 min</td><td>≈ 520 à 600 ms</td><td>Fixe, pointée une fois</td></tr>
              <tr><td>MEO (O3b)</td><td>≈ 8 000 km</td><td>≈ 4 h 48 min</td><td>≈ 130 à 150 ms</td><td>Motorisée (poursuite)</td></tr>
              <tr><td>LEO</td><td>≈ 550 km</td><td>≈ 95 min</td><td>≈ 25 à 45 ms</td><td>Plate, balayage électronique</td></tr></table>
              <div class="formula">Latence : t = distance / c        GEO : 4 × 36 000 km / 300 000 km/s ≈ 480 ms (+ traitements)</div>`,
          },
          {
            id: 'bandes-sat',
            title: 'Bandes C, Ku et Ka',
            html: `<table><tr><th>Bande</th><th>Montant / descendant</th><th>Pluie</th><th>Antennes</th><th>Usage</th></tr>
              <tr><td>C</td><td>6 / 4 GHz</td><td>Très résistante</td><td>Grandes (2,4 m et plus)</td><td>Liaisons critiques en zone tropicale, TV</td></tr>
              <tr><td>Ku</td><td>14 / 12 GHz</td><td>Sensible aux fortes pluies</td><td>0,75 à 2,4 m</td><td>VSAT d’entreprise, TV directe</td></tr>
              <tr><td>Ka</td><td>30 / 20 GHz</td><td>Très sensible (orages)</td><td>0,6 à 1,2 m</td><td>Internet haut débit (satellites HTS à spots)</td></tr></table>`,
          },
          {
            id: 'station',
            title: 'Chaîne d’une station VSAT',
            html: `<ul><li><b>Antenne</b> parabolique offset avec son cornet (feed).</li><li><b>BUC</b> (Block Up-Converter) : convertit la fréquence intermédiaire bande L (950–1 450 MHz) du modem vers la fréquence montante, et l’amplifie (2, 4, 8, 16 W).</li><li><b>LNB</b> (Low-Noise Block) : amplifie le signal descendant très faible avec un très faible facteur de bruit et le ramène en bande L.</li><li><b>Modem satellite IP</b> (IDU) : DVB-S2X en voie aller, TDMA / MF-TDMA en voie retour, ACM, sortie Ethernet vers le routeur ou la BTS.</li></ul>
              <p>Topologie en <b>étoile</b> : toutes les stations communiquent via le Hub. Voie <b>aller</b> (outbound) : Hub → satellite → VSAT, large porteuse partagée. Voie <b>retour</b> (inbound) : VSAT → satellite → Hub, petites porteuses (puissance du BUC limitée).</p>`,
          },
          {
            id: 'bilan-sat',
            title: 'Bilan satellite : PIRE, G/T, C/N0, Eb/N0',
            html: `<div class="formula">PIRE (dBW) = P_BUC (dBW) − pertes + G_antenne</div>
              <div class="formula">G/T (dB/K) = G_rx − 10·log(T_sys)        T_sys = T_antenne + T_LNB,  T_LNB = 290·(10^(NF/10) − 1)</div>
              <div class="formula">C/N0 (dBHz) = PIRE − FSL − A_pluie − A_pointage + G/T + 228,6</div>
              <div class="formula">C/N = C/N0 − 10·log(Rs)      Eb/N0 = Es/N0 − 10·log(η)      1/(C/N)tot = 1/(C/N)up + 1/(C/N)down + 1/(C/I)</div>
              <p>Le FSL vers un GEO vaut ≈ 196 dB en bande C (4 GHz) et ≈ 213 dB en bande Ka (30 GHz). Le modem DVB-S2X choisit le <b>MODCOD</b> (QPSK, 8PSK, 16APSK, 32APSK + taux de codage) selon l’Es/N0 reçu : c’est l’ACM satellite.</p>
              <div class="note">La pluie agit deux fois en voie descendante : elle atténue le signal ET rayonne du bruit qui augmente la température d’antenne (dégradation du G/T).</div>`,
          },
          {
            id: 'pointage',
            title: 'Pointage : azimut, élévation, skew',
            html: `<p>Pour un satellite GEO à la longitude Ls, depuis un site de latitude φ et longitude L (ΔL = Ls − L) :</p>
              <div class="formula">El = arctan[(cos ΔL·cos φ − 0,1513) / √(1 − (cos ΔL·cos φ)²)]</div>
              <div class="formula">Az = 180° − arctan(tan|ΔL| / sin φ) si le satellite est à l’Est (hémisphère Nord), 180° + … s’il est à l’Ouest</div>
              <div class="formula">Skew = arctan(sin ΔL / tan φ)</div>
              <div class="tip">Exemple TP 5 (14,2° N ; 0,4° O → 7° E) : Az ≈ 152°, El ≈ 71°, skew ≈ 27°. Un écart de 1° sur une antenne de 1,8 m en Ku coûte plusieurs dB.</div>
              <p>Sur le terrain, on affine le pointage en maximisant le niveau reçu (Es/N0) indiqué par le modem ou un mesureur de champ. Le <b>skew</b> (rotation du LNB) n’a de sens qu’en polarisation linéaire (Ku).</p>`,
          },
        ],
      },
      COURSE_D2D,
      {
        id: 'ip',
        title: 'Transport IP moderne : VLAN, MPLS, anneaux',
        intro: '<p>Les faisceaux hertziens actuels sont des équipements <b>tout IP</b> : ils transportent des trames Ethernet, souvent étiquetées VLAN, qui portent elles-mêmes du trafic IP ou MPLS.</p>',
        sections: [
          {
            id: 'vlan',
            title: 'VLAN IEEE 802.1Q',
            html: `${FIG_VLAN}
              <ul><li><b>Port access</b> : un seul VLAN, trames non étiquetées côté équipement client (le switch ou le CPE ajoute le tag).</li><li><b>Port trunk</b> : plusieurs VLAN étiquetés ; on n’autorise que les VLAN nécessaires.</li><li>Deux VLAN différents ne communiquent <b>pas</b> sans un <b>routeur</b> (routage inter-VLAN).</li><li>Le champ PCP (3 bits) porte la priorité QoS (802.1p).</li></ul>`,
          },
          {
            id: 'qos',
            title: 'Qualité de service (QoS)',
            html: `<table><tr><th>Classe</th><th>Exemple</th><th>Traitement</th></tr><tr><td>EF (Expedited Forwarding)</td><td>Voix, signalisation</td><td>Priorité stricte, faible latence</td></tr><tr><td>AF41</td><td>Vidéo</td><td>Bande garantie</td></tr><tr><td>BE (Best Effort)</td><td>Internet, données</td><td>Ce qui reste</td></tr></table>
              <p>Quand l’ACM réduit le débit d’un FH, ou quand le trafic bascule sur un lien de secours plus lent, les classes prioritaires sont servies en premier.</p>`,
          },
          {
            id: 'mpls',
            title: 'Routage IP et MPLS',
            html: `<p>Les routeurs calculent les meilleurs chemins avec un protocole de routage (<b>OSPF</b> : coût = débit de référence / débit du lien ; <b>BGP</b> entre opérateurs).</p>
              <p><b>MPLS</b> (Multi-Protocol Label Switching) ajoute un <b>label</b> de 20 bits devant le paquet ; les routeurs du cœur commutent sur ce label sans relire l’en-tête IP :</p>
              <ul><li><b>PE d’entrée</b> (Provider Edge) : classe le trafic et <b>PUSH</b> un label.</li><li><b>Routeurs P</b> : <b>SWAP</b> (échange de label) à chaque saut, le long du <b>LSP</b> (Label Switched Path).</li><li><b>Avant-dernier saut</b> : <b>POP</b> du label (PHP, Penultimate Hop Popping).</li><li><b>PE de sortie</b> : remet le paquet IP au client.</li></ul>
              <p>Services : <b>VPN L3</b> (routage isolé par client), <b>VPN L2</b> (pseudowire / VPLS : transport transparent de trames Ethernet). <b>Fast Reroute</b> : chemins de secours pré-calculés, bascule en ≈ 50 ms.</p>`,
          },
          {
            id: 'erps',
            title: 'Anneaux Ethernet ERPS (G.8032)',
            html: `${FIG_RING}
              <ul><li>Un anneau Ethernet crée une <b>boucle</b> : sans protection, les trames broadcast tournent à l’infini (<b>tempête de broadcast</b>) et le réseau s’effondre.</li><li>ERPS désigne un lien <b>RPL</b> (Ring Protection Link), bloqué en temps normal par son propriétaire (<b>RPL owner</b>) : état <b>IDLE</b>.</li><li>Quand un bond tombe (pluie, panne), les switches envoient des messages R-APS : le RPL est débloqué en <b>moins de 50 ms</b> (état <b>PROTECTION</b>).</li></ul>`,
          },
          {
            id: 'hybride',
            title: 'Architectures hybrides et secours satellite',
            html: `<p>Un réseau de backhaul combine souvent : un <b>anneau</b> FH ou fibre pour les villes, des <b>bonds en antenne</b> (spurs) vers les sites isolés, de la <b>BLR</b> pour la desserte locale et du <b>satellite</b> pour les zones sans infrastructure ou en <b>secours</b>.</p>
              <p>Le lien de secours est configuré avec un coût de routage élevé : il n’est utilisé qu’en cas de panne. Sa latence (GEO ≈ 550 ms) et son débit limité imposent une QoS stricte.</p>`,
          },
        ],
      },
      {
        id: 'depannage',
        title: 'Maintenance et dépannage',
        intro: '<p>Un technicien télécom passe une grande partie de son temps à <b>remettre en service</b> des liaisons. Ce chapitre présente une démarche de dépannage méthodique, les symptômes typiques des pannes FH, BLR, VSAT et IP, et le rapport d’intervention.</p>',
        sections: [
          {
            id: 'demarche',
            title: 'La démarche de dépannage',
            html: `<p>Un dépannage efficace suit toujours les mêmes étapes, <b>dans cet ordre</b> :</p>
              <ol><li><b>Constater</b> : quels services sont touchés (clients, BTS, site distant) ? Depuis quand ? Une seule liaison, ou plusieurs ?</li><li><b>Mesurer</b> : niveaux reçus, modulation, voyants, ping et traceroute. On mesure <b>avant</b> de toucher à quoi que ce soit.</li><li><b>Localiser</b> : quelle liaison, quelle extrémité, quel élément (équipement, câble, réglage) ? On procède <b>du physique vers le réseau</b> : alimentation et câbles, puis radio, puis configuration IP / VLAN.</li><li><b>Intervenir</b> : <b>une seule action ciblée</b> à la fois (remplacer, repointer, refaire un branchement, corriger un réglage).</li><li><b>Vérifier</b> : nouvelle mesure, services rétablis. C’est la mesure qui prouve la réparation, pas l’intervention.</li><li><b>Rendre compte</b> : rapport d’intervention et action de prévention.</li></ol>
              <div class="note">Un déplacement sur un pylône ou chez un client coûte cher (véhicule, temps, sécurité, matériel). Remplacer des équipements « pour voir » masque la vraie cause et gaspille du matériel.</div>`,
          },
          {
            id: 'symptomes',
            title: 'Symptômes et causes probables',
            html: `<table><tr><th>Symptôme</th><th>Mesure</th><th>Cause probable</th><th>Action</th></tr>
              <tr><td>Bond FH coupé, voyants éteints d’un côté</td><td>Voyant « Alim. » éteint, aucun signal</td><td>ODU ou IDU hors service, câble IF coupé (il alimente l’ODU)</td><td>Remplacer l’équipement, reprendre le câble</td></tr>
              <tr><td>Bond FH orange ou coupé, voyants allumés</td><td>RSL mesuré très inférieur au RSL calculé</td><td>Antenne dépointée, branchement humide / oxydé</td><td>Repointer (maximum d’AGC), refaire le branchement</td></tr>
              <tr><td>Bond coupé avec un message de réglage</td><td>Inspecteur des deux extrémités</td><td>Polarisations croisées, canaux ou largeurs différents, demi-bandes identiques</td><td>Aligner les réglages</td></tr>
              <tr><td>Bond coupé seulement sous la pluie</td><td>Marge au fading, bilan sous pluie</td><td>Marge insuffisante, ACM désactivé avec modulation trop haute</td><td>Activer l’ACM, augmenter la marge</td></tr>
              <tr><td>VSAT : voie aller coupée (« Rx unlock »)</td><td>Voyant Rx du modem</td><td>LNB hors service, câble coaxial côté LNB</td><td>Remplacer le LNB, reprendre le câble</td></tr>
              <tr><td>VSAT : voie retour coupée</td><td>Voyant Tx, le Hub ne voit pas la station</td><td>BUC hors service, câble coaxial côté BUC</td><td>Remplacer le BUC, reprendre le câble</td></tr>
              <tr><td>VSAT : niveau reçu inférieur au calcul</td><td>Es/N0, marge</td><td>Parabole dépointée, LNB dégradé</td><td>Repointer, remplacer le LNB</td></tr>
              <tr><td>Abonné BLR non enregistré</td><td>RSL du CPE, voyants</td><td>CPE hors service ou dépointé</td><td>Remplacer, repointer vers la station de base</td></tr>
              <tr><td>Radio verte mais service en échec</td><td>Ping, traceroute, journal</td><td>VLAN non autorisé, VLAN d’accès ou adresse IP erronés, câble Ethernet coupé</td><td>Corriger la configuration, reprendre le câble</td></tr></table>`,
          },
          {
            id: 'mesures',
            title: 'Les outils de mesure',
            html: `<ul><li><b>Niveau reçu (RSL)</b> : lu sur l’interface de l’IDU, ou en tension AGC sur l’ODU (voltmètre au pointage). On le compare au <b>RSL calculé</b> par le bilan de liaison : un écart de plus de 3 dB est anormal.</li><li><b>Modulation et capacité</b> (ACM) : un repli de modulation par ciel clair signale une perte anormale.</li><li><b>Voyants</b> : alimentation, signal reçu, alarme, ports Ethernet ; sur un modem satellite, verrouillage en réception (Rx lock) et émission (Tx).</li><li><b>Ping et traceroute</b> : le ping dit si le service passe ; le traceroute indique le <b>dernier équipement joignable</b>, donc où se situe la coupure.</li><li><b>Analyseur de spectre</b> (sur le terrain) : brouillage, porteuse présente ou absente.</li></ul>`,
          },
          {
            id: 'rapport',
            title: 'Rapport d’intervention et prévention',
            html: `<p>Le rapport d’intervention est remis au centre de supervision. Il précise, pour chaque défaut :</p>
              <table><tr><th>Heure</th><th>Symptôme</th><th>Mesure</th><th>Cause</th><th>Action</th><th>Vérification</th><th>Prévention</th></tr><tr><td>08 h 40</td><td>FH Siège – Relais coupé</td><td>Aucun signal ; voyants de l’ODU Siège éteints</td><td>ODU Siège hors service (foudre)</td><td>Remplacement de l’ODU</td><td>RSL −42 dBm = calcul, 256QAM</td><td>Parafoudre et mise à la terre à contrôler</td></tr></table>
              <p>La <b>prévention</b> évite la panne suivante : contrôle des fixations après un coup de vent, étanchéité des connecteurs (ruban vulcanisant), parafoudres, sauvegarde et gestion des configurations, surveillance des alarmes.</p>`,
          },
          {
            id: 'simulateur-depannage',
            title: 'Le dépannage dans le simulateur',
            html: `<p>En mode <b>Dépannage</b> (barre du haut), sélectionnez un équipement : l’inspecteur affiche ses <b>voyants</b> et les <b>interventions</b> possibles (remplacer, repointer, refaire le branchement, reprendre le câble). Le bilan de liaison compare le <b>RSL calculé</b> et le <b>RSL mesuré</b>. Une erreur de configuration se corrige directement dans les réglages de l’inspecteur.</p>
              <p>Les pannes sont <b>cachées</b> : seuls leurs symptômes sont visibles. Après une intervention, rien ne vous dit si elle était utile : <b>mesurez de nouveau</b>.</p>
              <p>Entraînement : <b>TP 12</b> (5 défauts fixes, corrigé détaillé) et <b>TP 16</b> (pannes tirées au hasard à chaque chargement). Évaluation : épreuve de <b>dépannage pratique</b> de l’onglet Examen (topologie verrouillée, notation des pannes réparées, des services rétablis, de la méthode et des interventions inutiles).</p>
              `,
          },
        ],
      },
      {
        id: 'memo',
        title: 'Aide-mémoire et glossaire',
        sections: [
          {
            id: 'formules',
            title: 'Formules essentielles',
            html: `<table><tr><th>Grandeur</th><th>Formule</th></tr>
              <tr><td>Espace libre</td><td><code>FSL = 92,45 + 20·log(d km) + 20·log(f GHz)</code></td></tr>
              <tr><td>Gain parabole</td><td><code>G = 10·log(η·(π·D/λ)²)</code>, η ≈ 0,55 à 0,65</td></tr>
              <tr><td>PIRE</td><td><code>PIRE = Ptx − pertes + Gtx</code></td></tr>
              <tr><td>Niveau reçu</td><td><code>RSL = PIRE − pertes de trajet + Grx − pertes rx</code></td></tr>
              <tr><td>Bruit thermique</td><td><code>N = −174 + 10·log(B) + NF</code> (dBm)</td></tr>
              <tr><td>Fresnel</td><td><code>r1 = 17,32·√(d1·d2/(f·d))</code></td></tr>
              <tr><td>Renflement</td><td><code>h = d1·d2/(12,74·k)</code></td></tr>
              <tr><td>Pluie</td><td><code>γ = k·R^α</code></td></tr>
              <tr><td>Satellite</td><td><code>C/N0 = PIRE − FSL + G/T + 228,6</code></td></tr>
              <tr><td>Eb/N0</td><td><code>Eb/N0 = C/N0 − 10·log(débit binaire)</code></td></tr>
              <tr><td>Latence</td><td><code>t = d / c</code>, c = 300 000 km/s</td></tr>
              <tr><td>G/T d’un terminal</td><td><code>G/T = G − 10·log(290 + 290·(10^(NF/10) − 1))</code> (smartphone ≈ −31,6 dB/K)</td></tr>
              <tr><td>RSRP</td><td><code>RSRP = C − 10·log(12 × N_RB)</code></td></tr>
              <tr><td>Doppler LEO</td><td><code>f_d = (f/c)·v·R·cos E / (R + h)</code></td></tr>
              <tr><td>Constellation continue</td><td><code>N ≈ 2 / (0,827·(1 − cos θ))</code>, θ = arccos(R·cos E / (R+h)) − E</td></tr>
              <tr><td>Autonomie IoT</td><td><code>0,8 × C_pile / I_moyen</code></td></tr></table>`,
          },
          {
            id: 'glossaire',
            title: 'Glossaire',
            html: `<table>
              <tr><td><b>ACM</b></td><td>Adaptive Coding and Modulation : changement automatique de modulation selon la qualité du signal.</td></tr>
              <tr><td><b>BUC / LNB</b></td><td>Convertisseur-amplificateur d’émission / récepteur faible bruit d’une station satellite.</td></tr>
              <tr><td><b>D2D / D2C</b></td><td>Direct-to-Device / Direct-to-Cell : liaison directe entre un satellite et un terminal mobile ordinaire.</td></tr>
              <tr><td><b>eDRX / PSM</b></td><td>Modes de veille longue d’un objet connecté (économie de la pile).</td></tr>
              <tr><td><b>Feeder</b></td><td>Liaison de connexion entre un satellite et sa station sol.</td></tr>
              <tr><td><b>HARQ</b></td><td>Retransmission rapide avec combinaison au niveau radio.</td></tr>
              <tr><td><b>MSS</b></td><td>Mobile Satellite Service : bandes du service mobile par satellite (L, S).</td></tr>
              <tr><td><b>NB-IoT / LTE-M</b></td><td>Technologies 4G pour objets connectés à bas débit et basse consommation.</td></tr>
              <tr><td><b>NTN</b></td><td>Non-Terrestrial Networks : réseaux 3GPP par satellite (Rel-17 et suivantes).</td></tr>
              <tr><td><b>RSRP</b></td><td>Reference Signal Received Power : niveau reçu d’une cellule 4G/5G (dBm par élément de ressource).</td></tr>
              <tr><td><b>Stockage et retransmission</b></td><td>Store &amp; forward : message gardé à bord jusqu’à la prochaine station sol.</td></tr>
              <tr><td><b>CPE</b></td><td>Customer Premises Equipment : terminal radio chez l’abonné.</td></tr>
              <tr><td><b>ERPS</b></td><td>Ethernet Ring Protection Switching (ITU-T G.8032).</td></tr>
              <tr><td><b>FSL</b></td><td>Free Space Loss : affaiblissement en espace libre.</td></tr>
              <tr><td><b>G/T</b></td><td>Facteur de mérite d’une station réceptrice (gain / température de bruit).</td></tr>
              <tr><td><b>IDU / ODU</b></td><td>Unité intérieure (modem) / extérieure (radio) d’un faisceau hertzien.</td></tr>
              <tr><td><b>LSP</b></td><td>Label Switched Path : chemin MPLS.</td></tr>
              <tr><td><b>PIRE (EIRP)</b></td><td>Puissance Isotrope Rayonnée Équivalente.</td></tr>
              <tr><td><b>RPL</b></td><td>Ring Protection Link : lien bloqué d’un anneau ERPS.</td></tr>
              <tr><td><b>RSL</b></td><td>Received Signal Level : niveau reçu (dBm).</td></tr>
              <tr><td><b>RTT</b></td><td>Round Trip Time : temps aller-retour d’un paquet (ping).</td></tr>
              <tr><td><b>VLAN</b></td><td>Réseau local virtuel (IEEE 802.1Q).</td></tr>
              <tr><td><b>XPIC</b></td><td>Annuleur d’interférence de polarisation croisée.</td></tr></table>`,
          },
        ],
      },
    ],
  };

  MBV.Course = COURSE;
})(typeof window !== 'undefined' ? window : globalThis);
