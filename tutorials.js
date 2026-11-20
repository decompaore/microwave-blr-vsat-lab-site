/* =====================================================================
 * tutorials.js — Tutoriels de prise en main (10 à 15 min chacun)
 * MicroWave, BLR & VSAT Lab
 *
 * Contrairement aux TP (topologie toute prête), l'élève construit lui-même
 * le réseau, geste après geste. Chaque étape est vérifiée automatiquement
 * dans le panneau de consignes (fonction check(api) → { ok, msg }).
 *
 * Format d'un tutoriel : { id, num, title, subtitle, duration, tags,
 *   mode, context, objectives[], steps[{ title, html, check }], build() }
 * L'API utilisée est MBV.App (voir app.js, section « API publique »).
 * ===================================================================== */
(function (root) {
  'use strict';

  const MBV = (root.MBV = root.MBV || {});
  const f = (v, d = 1) => (MBV.Util ? MBV.Util.fmt(v, d) : String(v));

  /* ------------------------------------------------------------------
   * Outils
   * ------------------------------------------------------------------ */
  const N = (type, name, x, y, props) => ({ type, name, x, y, props: props || {} });
  const Lk = (a, b, props, medium) => ({ a, b, props: props || {}, medium });
  const Fl = (src, dst, rateMbps, cls, name) => ({ src, dst, rateMbps, cls: cls || 'data', name });
  const empty = (settings) => ({ settings: Object.assign({ scaleKm: 2, rainMmH: 0 }, settings || {}), nodes: [], links: [], flows: [] });
  const ENDPOINTS = ['gnodeb', 'ruralSite', 'bankAgency', 'pc', 'server', 'internet'];

  /** Équipements d'un type fixés sur un pylône (ou un immeuble). */
  const mounted = (api, type, siteType) =>
    api.nodes(type).filter((n) => {
      const s = api.siteOf(n);
      return s && (!siteType || s.type === siteType);
    });
  /** Voisins d'un type donné. */
  const hasNeighbor = (api, n, type, media) => api.neighbors(n, media).some((x) => x.type === type);
  const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
  const endpointOf = (api, id) => api.nodes().find((n) => n.id === id) || null;

  const TUTORIALS = [];

  /* =================== T1 =================== */
  TUTORIALS.push({
    id: 't1',
    num: 'T1',
    title: 'Premiers pas dans le simulateur',
    subtitle: 'Placer, fixer, relier, régler, sélectionner, sauvegarder',
    duration: '10 min',
    tags: ['fh'],
    mode: 'design',
    context: '<p>Vous partez d’un <b>canevas vide</b>. En quelques gestes, vous allez placer deux pylônes, y fixer des antennes, régler une hauteur, relier les antennes par un faisceau et enregistrer votre travail.</p>',
    objectives: [
      'Glisser un équipement depuis la boîte à outils',
      'Fixer un équipement sur un pylône',
      'Régler la hauteur d’un pylône avec la poignée',
      'Relier deux équipements avec l’outil Lier',
      'Lire l’inspecteur et sauvegarder la topologie',
    ],
    steps: [
      {
        title: 'Placer un pylône',
        html: '<p>Dans la <b>boîte à outils</b> (à gauche), rubrique <i>Sites &amp; Obstacles</i>, faites glisser un <b>Pylône / Tour</b> sur la partie basse du canevas (le segment terrestre).</p><p class="small-muted">Astuce : vous pouvez aussi cliquer sur l’élément de la boîte à outils, puis cliquer sur le canevas.</p>',
        check: (api) => {
          const n = api.nodes('tower').length;
          return { ok: n >= 1, msg: n ? `${plural(n, 'pylône')} sur le canevas.` : 'Aucun pylône pour l’instant.' };
        },
      },
      {
        title: 'Placer un second pylône à au moins 10 km',
        html: '<p>Placez un deuxième pylône sur la droite. La grille indique l’échelle : <b>1 carreau = 2 km</b> (barre d’échelle en bas à droite). Éloignez-le d’au moins <b>5 carreaux</b>.</p><p class="small-muted">Pour déplacer un pylône : outil Sélection (V), cliquez-glissez.</p>',
        check: (api) => {
          const t = api.nodes('tower');
          if (t.length < 2) return { ok: false, msg: `${plural(t.length, 'pylône')} : il en faut 2.` };
          let d = 0;
          for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) d = Math.max(d, api.distanceKm(t[i], t[j]));
          return { ok: d >= 10, msg: `Distance entre les pylônes : ${f(d)} km ${d >= 10 ? '✔' : '(objectif ≥ 10 km)'}.` };
        },
      },
      {
        title: 'Fixer une antenne parabolique sur chaque pylône',
        html: '<p>Rubrique <i>Faisceaux Hertziens</i> : faites glisser une <b>Antenne parabolique</b> et <b>lâchez-la sur un pylône</b>. Elle s’y fixe (pointillés jaunes) et prend la hauteur du pylône. Faites de même sur l’autre pylône.</p>',
        check: (api) => {
          const m = mounted(api, 'antenna', 'tower');
          const sites = new Set(m.map((n) => api.siteOf(n).id));
          return { ok: sites.size >= 2, msg: `Antennes fixées sur ${plural(sites.size, 'pylône')} (objectif : 2).` };
        },
      },
      {
        title: 'Régler la hauteur d’un pylône à 60 m',
        html: '<p>Au-dessus de chaque pylône se trouve un mât gradué avec une <b>poignée jaune</b> qui affiche sa hauteur. <b>Tirez cette poignée vers le haut</b> jusqu’à 60 m au moins. L’antenne fixée suit automatiquement.</p>',
        check: (api) => {
          const h = Math.max(0, ...api.nodes('tower').map((t) => Number(t.props.heightM) || 0));
          return { ok: h >= 60, msg: `Pylône le plus haut : ${f(h, 0)} m ${h >= 60 ? '✔' : '(objectif ≥ 60 m)'}.` };
        },
      },
      {
        title: 'Relier les deux antennes',
        html: '<p>Choisissez l’outil <b>Lier</b> (icône de lien ou touche <b>L</b>), cliquez sur la première antenne puis sur la seconde. Un <b>faisceau hertzien</b> est créé.</p><p>Il apparaît en <b style="color:#ef4444">rouge</b> : c’est normal, les antennes ne sont raccordées à aucun émetteur (ODU). Vous le construirez dans le tutoriel T2.</p>',
        check: (api) => {
          const n = api.links('fh').length;
          return { ok: n >= 1, msg: n ? 'Faisceau créé ✔ (rouge : pas encore d’ODU).' : 'Aucun faisceau pour l’instant.' };
        },
      },
      {
        title: 'Lire l’inspecteur',
        html: '<p>Reprenez l’outil <b>Sélection</b> (touche <b>V</b>) et cliquez sur le faisceau. L’<b>inspecteur</b> (à droite) affiche ses paramètres et la cause du problème : « n’est raccordée à aucune ODU ». Ouvrez aussi l’onglet <b>Profil &amp; Fresnel</b>.</p>',
        check: (api) => {
          const sel = api.selection();
          const l = sel && sel.kind === 'link' ? api.links().find((x) => x.id === sel.id) : null;
          const tab = api.stats().tab_profile;
          if (!l || l.medium !== 'fh') return { ok: false, msg: 'Sélectionnez le faisceau.' };
          return { ok: !!tab, msg: tab ? 'Faisceau sélectionné et onglet Profil ouvert ✔' : 'Faisceau sélectionné : ouvrez maintenant l’onglet Profil & Fresnel.' };
        },
      },
      {
        title: 'Cadrer et sauvegarder',
        html: '<p>Cliquez sur <b>Tout afficher</b> (icône en coin, ou touche <b>0</b>) pour cadrer le réseau, puis sur <b>Sauvegarder</b> (barre du haut, ou <b>Ctrl+S</b>). Un fichier <code>.json</code> est téléchargé : vous pourrez le rouvrir avec <b>Ouvrir</b>.</p>',
        check: (api) => {
          const s = api.stats();
          return { ok: !!s.save, msg: s.save ? 'Topologie sauvegardée ✔ Bravo, vous maîtrisez les gestes de base !' : `${s.fit ? 'Vue cadrée ✔ · ' : ''}Sauvegardez la topologie.` };
        },
      },
    ],
    build: () => empty({ scaleKm: 2 }),
  });

  /* =================== T2 =================== */
  TUTORIALS.push({
    id: 't2',
    num: 'T2',
    title: 'Construire un faisceau hertzien',
    subtitle: 'Chaîne IDU – ODU – antenne, bande, bilan, profil, ping',
    duration: '15 min',
    tags: ['fh', 'ip'],
    mode: 'design',
    context: '<p>Deux pylônes distants de <b>20 km</b> sont déjà en place. Vous allez construire la liaison complète en architecture <b>split-mount</b> : <code>IDU — câble IF — ODU — Antenne ~~~ Antenne — ODU — câble IF — IDU</code>, puis la tester avec un ping.</p>',
    objectives: [
      'Assembler une chaîne FH split-mount complète',
      'Régler la bande de fréquence des ODU',
      'Lire le bilan de liaison et le profil de Fresnel',
      'Raccorder des terminaux et faire un ping à travers le faisceau',
    ],
    steps: [
      {
        title: 'Fixer une antenne sur chaque pylône',
        html: '<p>Glissez une <b>Antenne parabolique</b> sur le <b>Pylône Ouest</b>, puis une autre sur le <b>Pylône Est</b>.</p>',
        check: (api) => {
          const sites = new Set(mounted(api, 'antenna', 'tower').map((n) => api.siteOf(n).name));
          return { ok: sites.has('Pylône Ouest') && sites.has('Pylône Est'), msg: `Antennes fixées sur : ${[...sites].join(', ') || 'aucun pylône'}.` };
        },
      },
      {
        title: 'Ajouter une ODU derrière chaque antenne',
        html: '<p>Glissez une <b>ODU</b> sur chaque pylône (elle se fixe à côté de l’antenne), puis avec l’outil <b>Lier</b> (L) reliez chaque ODU à <b>son</b> antenne. Le lien créé est un « câble IF / montage direct ».</p>',
        check: (api) => {
          const ants = mounted(api, 'antenna', 'tower');
          const ok = ants.filter((a) => hasNeighbor(api, a, 'odu', ['if'])).length;
          return { ok: ants.length >= 2 && ok >= 2, msg: `${ok} antenne(s) sur ${ants.length} raccordée(s) à une ODU.` };
        },
      },
      {
        title: 'Ajouter une IDU au pied de chaque pylône',
        html: '<p>Placez une <b>IDU</b> près de chaque pylône (dans le local technique, pas besoin de la fixer) et reliez-la à l’ODU du même site.</p><p class="small-muted">Le simulateur refuse les raccordements incohérents : essayez de relier une IDU directement à une antenne pour voir le message.</p>',
        check: (api) => {
          const odus = api.nodes('odu');
          const ok = odus.filter((o) => hasNeighbor(api, o, 'idu', ['if'])).length;
          return { ok: odus.length >= 2 && ok >= 2, msg: `${ok} ODU sur ${odus.length} raccordée(s) à une IDU.` };
        },
      },
      {
        title: 'Créer le faisceau',
        html: '<p>Reliez les <b>deux antennes</b> entre elles. Le faisceau doit apparaître en <b style="color:#22c55e">vert</b> avec son étiquette (bande · modulation · débit).</p>',
        check: (api) => {
          const l = api.links('fh')[0];
          if (!l) return { ok: false, msg: 'Reliez les deux antennes.' };
          return { ok: !!(l.state && l.state.up), msg: l.state && l.state.up ? `Faisceau en service : ${l.state.label}.` : 'Faisceau créé mais coupé : vérifiez la chaîne antenne – ODU – IDU des deux côtés.' };
        },
      },
      {
        title: 'Passer les deux ODU en 13 GHz',
        html: '<p>Sélectionnez chaque ODU et choisissez la bande <b>13 GHz</b> dans l’inspecteur. Les deux extrémités doivent utiliser la même bande et la même largeur de canal, sinon la liaison coupe (essayez !).</p>',
        check: (api) => {
          const o = api.nodes('odu');
          const l = api.links('fh')[0];
          const ok = o.length >= 2 && o.every((x) => x.props.band === '13') && l && l.state.up;
          return { ok, msg: `Bandes : ${o.map((x) => x.props.band + ' GHz').join(' / ')}${ok ? ' · liaison en service ✔' : ''}.` };
        },
      },
      {
        title: 'Lire le bilan et le profil',
        html: '<p>Sélectionnez le faisceau. Ouvrez l’onglet <b>Bilan de liaison</b> : chaque grandeur (PIRE, FSL, RSL, marge) est calculée pas à pas avec sa formule. Ouvrez ensuite <b>Profil &amp; Fresnel</b> : la coupe du terrain montre la ligne de visée et la zone de Fresnel.</p>',
        check: (api) => {
          const s = api.stats();
          const l = api.links('fh')[0];
          const ok = !!s.tab_budget && !!s.tab_profile;
          return { ok, msg: ok && l && l.state.budgets ? `Lu ✔ — RSL ${f(l.state.budgets.ab.rsl)} dBm, marge ${f(l.state.budgets.ab.fadeMarginRef)} dB.` : `Onglets ouverts : ${[s.tab_budget ? 'Bilan' : '', s.tab_profile ? 'Profil' : ''].filter(Boolean).join(', ') || 'aucun'}.` };
        },
      },
      {
        title: 'Tester avec un ping',
        html: '<p>Placez un <b>Serveur</b> près de l’IDU ouest et un <b>PC</b> près de l’IDU est, reliez chacun à son IDU (câble Ethernet). Puis outil <b>Ping</b> (P) : cliquez sur le PC puis sur le serveur. Le résultat s’affiche dans la <b>Console</b>.</p>',
        check: (api) => {
          const p = api.lastPing();
          if (!p) return { ok: false, msg: 'Faites un ping entre les deux terminaux.' };
          return { ok: p.success, msg: p.success ? `Ping réussi ✔ (${f(p.rttMs, 1)} ms) : votre faisceau transporte du trafic IP !` : 'Ping échoué : lisez le diagnostic dans la console.' };
        },
      },
    ],
    build: () => ({
      settings: { scaleKm: 2, rainMmH: 0 },
      nodes: [N('tower', 'Pylône Ouest', 150, 580, { heightM: 40, groundM: 300 }), N('tower', 'Pylône Est', 650, 580, { heightM: 40, groundM: 295 })],
      links: [],
      flows: [],
    }),
  });

  /* =================== T3 =================== */
  TUTORIALS.push({
    id: 't3',
    num: 'T3',
    title: 'Construire une station VSAT',
    subtitle: 'Satellite, Hub, antenne, BUC, LNB, modem, pointage',
    duration: '15 min',
    tags: ['vsat', 'ip'],
    mode: 'design',
    context: '<p>Vous partez d’un canevas vide pour construire une liaison satellite complète en <b>étoile</b> : un <b>Hub</b> (téléport) et une <b>station distante</b>, reliés par un satellite géostationnaire. Chaîne de la station : <code>Modem — BUC + LNB — Antenne VSAT ~~~ Satellite ~~~ Hub</code>.</p>',
    objectives: [
      'Placer un satellite sur son orbite',
      'Assembler la chaîne d’une station VSAT (BUC, LNB, modem)',
      'Lire le pointage (azimut, élévation, skew) et le bilan',
      'Mesurer la latence GEO puis LEO',
    ],
    steps: [
      {
        title: 'Placer un satellite',
        html: '<p>Rubrique <i>Liaisons satellitaires</i> : glissez un <b>Satellite relais</b> n’importe où. Il se place automatiquement sur la ligne de son orbite (<b>GEO</b>, en haut du canevas, dans le segment spatial).</p>',
        check: (api) => {
          const n = api.nodes('satellite').length;
          return { ok: n >= 1, msg: n ? 'Satellite en orbite GEO ✔' : 'Aucun satellite.' };
        },
      },
      {
        title: 'Placer le Hub et le relier au satellite',
        html: '<p>Glissez un <b>Hub / Téléport</b> dans le segment terrestre, puis reliez-le au satellite avec l’outil <b>Lier</b> (L).</p>',
        check: (api) => {
          const ok = api.links('vsat').some((l) => [l.a, l.b].some((id) => (endpointOf(api, id) || {}).type === 'hub'));
          return { ok, msg: ok ? 'Hub relié au satellite ✔' : 'Reliez un Hub au satellite.' };
        },
      },
      {
        title: 'Assembler la station distante',
        html: '<p>Placez une <b>Antenne VSAT</b>, un <b>BUC</b>, un <b>LNB</b> et un <b>Modem satellite IP</b>. Reliez :</p><ul><li>antenne ↔ BUC et antenne ↔ LNB ;</li><li>BUC ↔ modem et LNB ↔ modem.</li></ul><p class="small-muted">Le BUC sert à <b>émettre</b> (voie montante), le LNB à <b>recevoir</b> (voie descendante).</p>',
        check: (api) => {
          const ant = api.nodes('vsatAntenna')[0];
          if (!ant) return { ok: false, msg: 'Placez une antenne VSAT.' };
          const buc = api.neighbors(ant, ['coax']).find((x) => x.type === 'buc');
          const lnb = api.neighbors(ant, ['coax']).find((x) => x.type === 'lnb');
          const mBuc = buc && hasNeighbor(api, buc, 'vsatModem', ['coax']);
          const mLnb = lnb && hasNeighbor(api, lnb, 'vsatModem', ['coax']);
          const parts = [buc ? 'BUC ✔' : 'BUC ✘', lnb ? 'LNB ✔' : 'LNB ✘', mBuc && mLnb ? 'modem ✔' : 'modem ✘'];
          return { ok: !!(buc && lnb && mBuc && mLnb), msg: parts.join(' · ') };
        },
      },
      {
        title: 'Viser le satellite',
        html: '<p>Reliez l’<b>antenne VSAT</b> au <b>satellite</b>. Les deux faisceaux (station et Hub) doivent passer au <b style="color:#22c55e">vert</b>.</p>',
        check: (api) => {
          const ant = api.nodes('vsatAntenna')[0];
          const sat = api.nodes('satellite')[0];
          const l = ant && sat ? api.link(ant.id, sat.id) : null;
          if (!l) return { ok: false, msg: 'Reliez l’antenne VSAT au satellite.' };
          return { ok: l.state.up, msg: l.state.up ? `Liaison satellite en service : ${l.state.label}.` : (l.state.issues[0] || {}).text || 'Liaison coupée.' };
        },
      },
      {
        title: 'Lire le pointage et le bilan',
        html: '<p>Sélectionnez la liaison antenne VSAT ↔ satellite. Onglet <b>Profil &amp; Fresnel</b> : la boussole indique l’<b>azimut</b> et l’<b>élévation</b> à régler, ainsi que le <b>skew</b> du LNB. Onglet <b>Bilan de liaison</b> : PIRE, G/T, Eb/N0 des voies aller et retour.</p>',
        check: (api) => {
          const s = api.stats();
          const ok = !!s.tab_profile && !!s.tab_budget;
          const ant = api.nodes('vsatAntenna')[0];
          const sat = api.nodes('satellite')[0];
          const l = ant && sat ? api.link(ant.id, sat.id) : null;
          const id = l && l.state.ideal;
          return { ok, msg: (id ? `Pointage : Az ${f(id.azimuth)}° · El ${f(id.elevation)}° · skew ${f(id.skew)}°. ` : '') + (ok ? '✔' : 'Ouvrez les onglets Profil et Bilan.') };
        },
      },
      {
        title: 'Raccorder des terminaux et mesurer la latence',
        html: '<p>Placez un <b>Site rural / minier</b> relié au <b>modem</b>, et un <b>Internet / Cœur</b> relié au <b>Hub</b>. Faites un <b>ping</b> (P) du site vers Internet : notez le temps de réponse (orbite GEO à 35 786 km).</p>',
        check: (api) => {
          const p = api.lastPing();
          if (!p) return { ok: false, msg: 'Faites un ping Site → Internet.' };
          return { ok: p.success && p.rttMs > 400, msg: p.success ? `RTT GEO : ${f(p.rttMs, 0)} ms ${p.rttMs > 400 ? '✔' : ''}` : 'Ping échoué : lisez le diagnostic dans la console.' };
        },
      },
      {
        title: 'Passer en orbite basse (LEO)',
        html: '<p>Sélectionnez le satellite et choisissez l’orbite <b>LEO</b> : il descend sur la ligne LEO (550 km). Refaites le ping et comparez.</p>',
        check: (api) => {
          const sat = api.nodes('satellite')[0];
          const p = api.lastPing();
          const leo = sat && sat.props.orbit === 'LEO';
          return { ok: leo && p && p.success && p.rttMs < 60, msg: !leo ? 'Passez le satellite en LEO.' : p && p.success && p.rttMs < 60 ? `RTT LEO : ${f(p.rttMs, 0)} ms ✔ — près de 20 fois moins qu’en GEO !` : 'Refaites le ping.' };
        },
      },
    ],
    build: () => empty({ scaleKm: 2 }),
  });

  /* =================== T4 =================== */
  TUTORIALS.push({
    id: 't4',
    num: 'T4',
    title: 'Configurer le réseau IP et les VLAN',
    subtitle: 'Adresses IP, VLAN, routage inter-VLAN, flux, ping',
    duration: '15 min',
    tags: ['ip'],
    mode: 'design',
    context: '<p>Un <b>switch d’agence</b> est déjà en place. Vous allez y raccorder des postes et un serveur, les isoler avec des <b>VLAN</b>, puis les faire communiquer grâce à un <b>routeur</b>.</p>',
    objectives: [
      'Raccorder des terminaux à un switch',
      'Lire et modifier une adresse IP, attribuer un VLAN',
      'Constater l’isolation entre VLAN',
      'Activer le routage inter-VLAN et créer un flux de trafic',
    ],
    steps: [
      {
        title: 'Raccorder 2 PC et 1 serveur au switch',
        html: '<p>Placez deux <b>PC</b> et un <b>Serveur</b>, puis reliez chacun au <b>SW Agence</b> avec l’outil <b>Lier</b> (câble Ethernet). Chaque terminal reçoit automatiquement une adresse IP (onglet Paramètres).</p>',
        check: (api) => {
          const sw = api.node('SW Agence');
          const att = api.neighbors(sw).filter((n) => ENDPOINTS.includes(n.type));
          const pcs = att.filter((n) => n.type === 'pc').length;
          const srv = att.filter((n) => n.type === 'server').length;
          return { ok: pcs >= 2 && srv >= 1, msg: `Raccordés au switch : ${pcs} PC, ${plural(srv, 'serveur')}.` };
        },
      },
      {
        title: 'Premier ping',
        html: '<p>Outil <b>Ping</b> (P) : cliquez sur un PC puis sur le serveur. Ils sont dans le même sous-réseau (10.0.0.0/24) : le ping réussit. Lisez la réponse dans la <b>Console</b> (TTL, temps).</p>',
        check: (api) => {
          const p = api.lastPing();
          return { ok: !!(p && p.success), msg: p ? (p.success ? `Ping réussi ✔ (${f(p.rttMs, 2)} ms).` : 'Ping échoué.') : 'Faites un ping PC → serveur.' };
        },
      },
      {
        title: 'Séparer les postes avec des VLAN',
        html: '<p>Dans l’onglet Paramètres, réglez le champ <b>VLAN</b> :</p><ul><li>le <b>serveur</b> et un premier PC en <b>VLAN 10</b> ;</li><li>le second PC en <b>VLAN 20</b>.</li></ul><p>Faites ensuite un ping du <b>PC du VLAN 20</b> vers le serveur.</p>',
        check: (api) => {
          const srv = api.nodes('server').find((n) => Number(n.props.vlan) === 10);
          const pc10 = api.nodes('pc').find((n) => Number(n.props.vlan) === 10);
          const pc20 = api.nodes('pc').find((n) => Number(n.props.vlan) === 20);
          if (!srv || !pc10 || !pc20) return { ok: false, msg: `VLAN : serveur ${srv ? '10 ✔' : '?'} · PC ${pc10 ? '10 ✔' : '?'} · PC ${pc20 ? '20 ✔' : '?'}` };
          const p = api.lastPing();
          if (!p || p.src !== pc20.id) return { ok: false, msg: 'VLAN réglés ✔ — faites un ping du PC du VLAN 20 vers le serveur.' };
          return { ok: !p.success, msg: p.success ? 'Le ping a réussi : vérifiez les VLAN.' : 'Ping échoué : les VLAN 10 et 20 sont isolés ✔' };
        },
      },
      {
        title: 'Faire communiquer les VLAN avec un routeur',
        html: '<p>Placez un <b>Routeur</b> et reliez-le au switch. Un routeur ne relie que des <b>sous-réseaux différents</b> : donnez au PC du VLAN 20 l’adresse <code>10.0.20.10</code> (masque /24). Refaites le ping vers le serveur.</p>',
        check: (api) => {
          const r = api.nodes('router').length;
          const pc20 = api.nodes('pc').find((n) => Number(n.props.vlan) === 20);
          const p = api.lastPing();
          if (!r) return { ok: false, msg: 'Placez un routeur relié au switch.' };
          if (!pc20 || !String(pc20.props.ip).startsWith('10.0.20.')) return { ok: false, msg: 'Changez l’adresse du PC du VLAN 20 en 10.0.20.10.' };
          if (!p || p.src !== pc20.id) return { ok: false, msg: 'Refaites un ping du PC du VLAN 20 vers le serveur.' };
          return { ok: p.success, msg: p.success ? 'Ping réussi via le routeur (routage inter-VLAN) ✔ — voyez le traceroute dans la console.' : 'Ping échoué : vérifiez que le routeur est relié au switch.' };
        },
      },
      {
        title: 'Créer un flux de voix et l’analyser',
        html: '<p>Outil <b>Flux</b> (F) : cliquez sur un PC puis sur le serveur. Dans la fenêtre, choisissez la classe <b>Voix</b> et 2 Mbit/s. Ouvrez ensuite l’onglet <b>Réseau</b> de l’inspecteur et <b>cliquez sur le flux</b> : son chemin s’affiche sur le canevas, avec les en-têtes (VLAN, IP) sur chaque tronçon.</p>',
        check: (api) => {
          const a = api.analysis();
          const v = a ? a.flows.find((x) => x.cls === 'voice') : null;
          if (!v) return { ok: false, msg: 'Créez un flux de classe Voix.' };
          const sel = api.stats().flowSelected;
          return { ok: v.status === 'ok' && !!sel, msg: v.status !== 'ok' ? 'Le flux échoue : ' + v.reason : sel ? 'Flux de voix en service et analysé ✔' : 'Flux en service : cliquez dessus dans l’onglet Réseau.' };
        },
      },
    ],
    build: () => ({
      settings: { scaleKm: 0.25 },
      nodes: [N('switch', 'SW Agence', 450, 520, { vlans: 'all' })],
      links: [],
      flows: [],
    }),
  });

  /* =================== T5 =================== */
  TUTORIALS.push({
    id: 't5',
    num: 'T5',
    title: 'Diagnostiquer une panne',
    subtitle: 'Mode Diagnostic, coupure, panne d’équipement, 1+1, dépointage',
    duration: '15 min',
    tags: ['fh', 'ip'],
    mode: 'design',
    context: '<p>Une liaison hertzienne en service transporte le trafic entre un <b>gNodeB</b> et le <b>cœur de réseau</b>. Vous allez provoquer des pannes, lire les symptômes (couleurs, journal, console) et rétablir le service.</p>',
    objectives: [
      'Utiliser le mode Diagnostic et l’outil Panne',
      'Lire le journal d’événements et les causes affichées',
      'Comprendre l’intérêt d’une protection 1+1',
      'Mesurer l’effet d’un dépointage d’antenne',
    ],
    steps: [
      {
        title: 'Passer en mode Diagnostic',
        html: '<p>Dans la barre du haut, cliquez sur <b>Diagnostic / Pannes</b>. L’outil <b>Panne</b> (ciseaux, touche <b>C</b>) apparaît dans la barre d’outils du canevas.</p>',
        check: (api) => ({ ok: api.mode() === 'diag', msg: api.mode() === 'diag' ? 'Mode Diagnostic actif ✔' : 'Passez en mode Diagnostic / Pannes.' }),
      },
      {
        title: 'Couper le faisceau',
        html: '<p>Avec l’outil <b>Panne</b>, cliquez sur le faisceau. Observez : faisceau rouge barré, flux en échec (console → <b>Flux de trafic</b>), message dans le <b>Journal d’événements</b>.</p>',
        check: (api) => {
          const l = api.links('fh')[0];
          const fl = api.analysis().flows;
          return { ok: !!l.props.cut, msg: l.props.cut ? `Faisceau coupé ✔ — flux en échec : ${fl.filter((x) => x.status !== 'ok').length}/${fl.length}.` : 'Coupez le faisceau avec l’outil Panne.' };
        },
      },
      {
        title: 'Rétablir le faisceau',
        html: '<p>Cliquez à nouveau sur le faisceau avec l’outil Panne (ou <b>Ctrl+Z</b>). Le trafic repart.</p>',
        check: (api) => {
          const l = api.links('fh')[0];
          const fl = api.analysis().flows;
          return { ok: !l.props.cut && fl.every((x) => x.status === 'ok'), msg: !l.props.cut ? 'Faisceau rétabli ✔' : 'Le faisceau est toujours coupé.' };
        },
      },
      {
        title: 'Mettre une ODU en panne',
        html: '<p>Toujours avec l’outil Panne, cliquez sur l’<b>ODU-A</b>. Elle est marquée d’une croix rouge et la liaison coupe. Sélectionnez le faisceau (outil Sélection, V) : l’inspecteur indique « Équipement en panne : ODU-A ».</p>',
        check: (api) => {
          const o = api.node('ODU-A');
          const l = api.links('fh')[0];
          return { ok: !!o.props.failed && !l.state.up, msg: o.props.failed ? 'ODU-A en panne → liaison coupée ✔' : 'Mettez ODU-A en panne.' };
        },
      },
      {
        title: 'Protéger la liaison en 1+1',
        html: '<p>Sans réparer l’ODU, sélectionnez le faisceau et réglez <b>Configuration</b> sur <b>1+1 HSB</b> : un équipement de secours (Hot Stand-By) prend le relais. La liaison revient malgré la panne.</p>',
        check: (api) => {
          const l = api.links('fh')[0];
          const o = api.node('ODU-A');
          return { ok: l.props.protection === '1+1' && !!o.props.failed && l.state.up, msg: l.props.protection === '1+1' ? (l.state.up ? 'Protection 1+1 active : liaison en service malgré la panne ✔' : 'Protection 1+1 réglée.') : 'Réglez la configuration du faisceau en 1+1 HSB.' };
        },
      },
      {
        title: 'Dépointer une antenne',
        html: '<p>Réparez l’ODU-A (outil Panne). Sélectionnez <b>ANT-B</b> : en mode Diagnostic, le champ <b>Dépointage azimut</b> est disponible. Réglez-le à <b>2°</b> et observez le RSL et la marge dans le bilan. L’ouverture de cette antenne de 0,9 m à 7 GHz est d’environ 3,2° : plus l’antenne est grande ou la fréquence élevée, plus le faisceau est étroit et le pointage critique.</p>',
        check: (api) => {
          const o = api.node('ODU-A');
          const a = api.node('ANT-B');
          const l = api.links('fh')[0];
          const err = Math.abs(Number(a.props.azErrDeg) || 0);
          if (o.props.failed) return { ok: false, msg: 'Réparez d’abord ODU-A.' };
          return { ok: err >= 2, msg: err >= 2 && l.state.budgets ? `Dépointage ${f(err)}° → perte ${f(l.state.budgets.ab.pointing)} dB, marge ${f(l.state.budgets.ab.fadeMarginRef)} dB ✔` : 'Réglez un dépointage d’au moins 2° sur ANT-B.' };
        },
      },
      {
        title: 'Remettre le réseau en état',
        html: '<p>Remettez le dépointage à <b>0°</b>. Vérifiez que tous les flux sont OK et que le journal ne signale plus de problème. Revenez en mode <b>Conception</b>.</p>',
        check: (api) => {
          const a = api.node('ANT-B');
          const fl = api.analysis().flows;
          const ok = !Number(a.props.azErrDeg) && !api.nodes().some((n) => n.props.failed) && !api.links().some((l) => l.props.cut) && fl.every((x) => x.status === 'ok');
          return { ok, msg: ok ? 'Réseau nominal ✔ Vous savez provoquer, lire et réparer une panne !' : 'Il reste un dépointage, une panne ou une coupure.' };
        },
      },
    ],
    build: () => {
      const nodes = [
        N('tower', 'Site A', 150, 580, { heightM: 40, groundM: 300 }),
        N('tower', 'Site B', 600, 580, { heightM: 40, groundM: 300 }),
        N('antenna', 'ANT-A', 220, 520, { siteId: 'Site A', diameterM: 0.9, heightM: 38 }),
        N('odu', 'ODU-A', 220, 440, { siteId: 'Site A', band: '7', txPowerDbm: 28, channelMHz: 28 }),
        N('idu', 'IDU-A', 55, 550, { maxMod: '256QAM' }),
        N('antenna', 'ANT-B', 530, 520, { siteId: 'Site B', diameterM: 0.9, heightM: 38 }),
        N('odu', 'ODU-B', 530, 440, { siteId: 'Site B', band: '7', txPowerDbm: 28, channelMHz: 28 }),
        N('idu', 'IDU-B', 695, 550, { maxMod: '256QAM' }),
        N('server', 'Cœur réseau', 60, 700, { ip: '10.0.0.1' }),
        N('gnodeb', 'gNodeB', 690, 700, { ip: '10.0.0.20' }),
      ];
      const links = [
        Lk('ANT-A', 'ODU-A'),
        Lk('ODU-A', 'IDU-A'),
        Lk('ANT-B', 'ODU-B'),
        Lk('ODU-B', 'IDU-B'),
        Lk('ANT-A', 'ANT-B', { protection: '1+0' }),
        Lk('IDU-A', 'Cœur réseau'),
        Lk('IDU-B', 'gNodeB'),
      ];
      return { settings: { scaleKm: 2 }, nodes, links, flows: [Fl('gNodeB', 'Cœur réseau', 80, 'data', 'Données gNodeB'), Fl('gNodeB', 'Cœur réseau', 5, 'voice', 'Voix gNodeB')] };
    },
  });

  MBV.Tutorials = { list: TUTORIALS };
})(typeof window !== 'undefined' ? window : globalThis);
