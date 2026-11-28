/* =====================================================================
 * exercises.js — Exercices corrigés (type examen, auto-évaluation)
 * MicroWave, BLR & VSAT Lab
 *
 * 7 séries de 5 exercices de calcul. Pour chaque exercice :
 *   - énoncé et données ;
 *   - champs de réponse numériques vérifiés avec une tolérance ;
 *   - indice, puis correction détaillée visible après 2 essais
 *     (ou sur demande) ;
 *   - éventuellement « Vérifier dans le simulateur » (mini-topologie).
 * Les réponses attendues sont CALCULÉES ici avec les formules du cours :
 * elles restent cohérentes avec les moteurs radio_physics / sat_physics.
 *
 * Interface : MBV.Exercises = { series, render({ nav, detail, id, api }) }
 * (appelée par l'onglet « Exercices corrigés » de la fenêtre Activités).
 * ===================================================================== */
(function (root) {
  'use strict';

  const MBV = (root.MBV = root.MBV || {});
  const U = MBV.Util;
  const RP = MBV.RadioPhysics;
  const SP = MBV.SatPhysics;
  const fmt = (v, d = 2) => (U ? U.fmt(v, d) : String(Math.round(v * 100) / 100));
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const log10 = Math.log10;
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;

  /* ------------------------------------------------------------------
   * Outils de construction des mini-topologies « simulateur »
   * ------------------------------------------------------------------ */
  const N = (type, name, x, y, props) => ({ type, name, x, y, props: props || {} });
  const Lk = (a, b, props, medium) => ({ a, b, props: props || {}, medium });
  /** Faisceau FH complet entre deux pylônes, distance en km. */
  function fhTopo(distanceKm, band, diameterM, txPowerDbm, opts = {}) {
    const scale = distanceKm > 20 ? 4 : distanceKm > 8 ? 2 : 1;
    const px = (distanceKm / scale) * 50;
    const xA = 150;
    const xB = xA + px;
    const ant = { diameterM, polarization: 'V', heightM: 58 };
    const odu = { band, txPowerDbm, channelMHz: 28, lossDb: 0.5 };
    return {
      settings: { title: opts.title || 'Exercice', scaleKm: scale, rainMmH: opts.rain || 0 },
      nodes: [
        N('tower', 'Site A', xA, 560, { heightM: 60, groundM: 300 }),
        N('tower', 'Site B', xB, 560, { heightM: 60, groundM: 300 }),
        N('antenna', 'ANT-A', xA + 60, 500, Object.assign({ siteId: 'Site A' }, ant)),
        N('odu', 'ODU-A', xA + 60, 420, Object.assign({ siteId: 'Site A' }, odu)),
        N('idu', 'IDU-A', xA - 90, 530, { maxMod: opts.maxMod || '256QAM' }),
        N('antenna', 'ANT-B', xB - 60, 500, Object.assign({ siteId: 'Site B' }, ant)),
        N('odu', 'ODU-B', xB - 60, 420, Object.assign({ siteId: 'Site B' }, odu)),
        N('idu', 'IDU-B', xB + 90, 530, { maxMod: opts.maxMod || '256QAM' }),
      ],
      links: [Lk('ANT-A', 'ODU-A'), Lk('ODU-A', 'IDU-A'), Lk('ANT-B', 'ODU-B'), Lk('ODU-B', 'IDU-B'), Lk('ANT-A', 'ANT-B')],
      flows: [],
    };
  }
  /** Station VSAT GEO complète (Hub de Ouagadougou + station distante). */
  function vsatTopo(lat, lon, satLon, opts = {}) {
    return {
      settings: { title: opts.title || 'Exercice VSAT', scaleKm: 2, rainMmH: 0 },
      nodes: [
        N('satellite', 'GEO', 460, 60, { orbit: 'GEO', band: 'Ku', lonDeg: satLon }),
        N('hub', 'Téléport', 220, 560, { coordMode: 'manual', lat: 12.37, lon: -1.53, dishM: 7.3, hpaW: 200 }),
        N('internet', 'Internet', 120, 700, { ip: '10.10.0.1' }),
        N('vsatAntenna', 'Antenne VSAT', 700, 540, { coordMode: 'manual', lat, lon, dishM: opts.dishM || 1.8, autoPoint: true }),
        N('buc', 'BUC', 650, 640, { powerW: opts.bucW || 4 }),
        N('lnb', 'LNB', 750, 640, { nfDb: 0.8 }),
        N('vsatModem', 'Modem', 700, 740, {}),
        N('ruralSite', 'Site distant', 830, 820, { ip: '10.10.0.20' }),
      ],
      links: [
        Lk('GEO', 'Téléport'),
        Lk('GEO', 'Antenne VSAT'),
        Lk('Antenne VSAT', 'BUC'),
        Lk('Antenne VSAT', 'LNB'),
        Lk('BUC', 'Modem'),
        Lk('LNB', 'Modem'),
        Lk('Modem', 'Site distant'),
        Lk('Téléport', 'Internet', { capacityMbps: 10000 }, 'fiber'),
      ],
      flows: [],
    };
  }
  /** Gain d'une parabole (dBi). */
  const dishGain = (D, fGHz, eta) => 10 * log10(eta * Math.pow((Math.PI * D) / (0.299792458 / fGHz), 2));
  const fsl = (dKm, fGHz) => 92.45 + 20 * log10(dKm) + 20 * log10(fGHz);

  /* ------------------------------------------------------------------
   * SÉRIE 1 — Décibels et puissance
   * ------------------------------------------------------------------ */
  const S1 = (() => {
    const e1dbm = 10 * log10(2000);
    const e1dbw = 10 * log10(2);
    const e4 = 26 - 1 + 38;
    const e4w = Math.pow(10, e4 / 10) / 1000;
    return {
      id: 's1',
      num: 'S1',
      title: 'Décibels et puissance',
      subtitle: 'dBm, dBW, gains et pertes, PIRE',
      exercises: [
        {
          id: 's1e1',
          title: 'Puissance d’un émetteur en dBm et en dBW',
          statement: '<p>Un émetteur délivre une puissance de <b>2 W</b>. Exprimez cette puissance en <b>dBm</b> puis en <b>dBW</b>.</p>',
          fields: [
            { label: 'P en dBm', unit: 'dBm', answer: e1dbm, tol: 0.1 },
            { label: 'P en dBW', unit: 'dBW', answer: e1dbw, tol: 0.1 },
          ],
          hint: 'P(dBm) = 10·log(P / 1 mW) : convertissez d’abord 2 W en mW. Entre dBm et dBW, il y a toujours 30 dB d’écart.',
          correction: `<p>P = 2 W = 2 000 mW → P(dBm) = 10·log(2 000) = <b>${fmt(e1dbm)} dBm</b>.</p><p>P(dBW) = 10·log(2) = <b>${fmt(e1dbw)} dBW</b> (= ${fmt(e1dbm)} − 30).</p><p class="small-muted">Retenez : 1 W = 30 dBm = 0 dBW ; doubler la puissance = +3 dB.</p>`,
        },
        {
          id: 's1e2',
          title: 'Niveau reçu très faible',
          statement: '<p>Un récepteur mesure un niveau de <b>−60 dBm</b>. Exprimez ce niveau en <b>nanowatts</b> (nW).</p>',
          fields: [{ label: 'P', unit: 'nW', answer: 1, tol: 0.02 }],
          hint: 'P(mW) = 10^(P(dBm)/10). Rappel : 1 nW = 10⁻⁹ W = 10⁻⁶ mW.',
          correction: '<p>P = 10^(−60/10) mW = 10⁻⁶ mW = 10⁻⁹ W = <b>1 nW</b>.</p><p class="small-muted">Les niveaux reçus en radio sont infimes : de l’ordre du nanowatt ou moins, d’où l’intérêt des dBm.</p>',
        },
        {
          id: 's1e3',
          title: 'Chaîne amplificateur + câble',
          statement: '<p>Un signal de <b>10 dBm</b> traverse un amplificateur de gain <b>20 dB</b>, puis un câble de pertes <b>3 dB</b>. Calculez la puissance de sortie en dBm puis en mW.</p>',
          fields: [
            { label: 'P sortie', unit: 'dBm', answer: 27, tol: 0.05 },
            { label: 'P sortie', unit: 'mW', answer: Math.pow(10, 2.7), tol: 5 },
          ],
          hint: 'En décibels, les gains s’ajoutent et les pertes se soustraient.',
          correction: `<p>P = 10 + 20 − 3 = <b>27 dBm</b>.</p><p>P(mW) = 10^(27/10) = <b>${fmt(Math.pow(10, 2.7), 0)} mW</b> (≈ 0,5 W).</p>`,
        },
        {
          id: 's1e4',
          title: 'PIRE d’un faisceau hertzien',
          statement: '<p>Une ODU émet <b>26 dBm</b>. Les pertes de branchement valent <b>1 dB</b> et l’antenne a un gain de <b>38 dBi</b>. Calculez la PIRE en dBm puis en watts.</p>',
          fields: [
            { label: 'PIRE', unit: 'dBm', answer: e4, tol: 0.05 },
            { label: 'PIRE', unit: 'W', answer: e4w, tol: e4w * 0.02 },
          ],
          hint: 'PIRE = Ptx − pertes + Gtx. Puis P(W) = 10^(P(dBm)/10) / 1000.',
          correction: `<p>PIRE = 26 − 1 + 38 = <b>${e4} dBm</b>.</p><p>P(W) = 10^(6,3) / 1 000 ≈ <b>${fmt(e4w, 0)} W</b>.</p><p class="small-muted">Avec seulement 400 mW émis, l’antenne concentre l’énergie comme le ferait un émetteur isotrope de près de 2 kW !</p>`,
        },
        {
          id: 's1e5',
          title: 'Comparer deux niveaux reçus',
          statement: '<p>Par ciel clair, un récepteur mesure <b>−50 dBm</b>. Pendant un orage, il mesure <b>−80 dBm</b>. Quel est l’écart en dB ? Combien de fois la puissance reçue a-t-elle été divisée ?</p>',
          fields: [
            { label: 'Écart', unit: 'dB', answer: 30, tol: 0.05 },
            { label: 'Rapport', unit: 'fois', answer: 1000, tol: 1 },
          ],
          hint: 'Un écart de 10 dB correspond à un facteur 10 ; un écart de 20 dB à un facteur 100…',
          correction: '<p>Écart = −50 − (−80) = <b>30 dB</b> → rapport = 10^(30/10) = <b>1 000</b>.</p><p class="small-muted">La pluie a divisé la puissance reçue par mille.</p>',
        },
      ],
    };
  })();

  /* ------------------------------------------------------------------
   * SÉRIE 2 — Bilan de liaison FH
   * ------------------------------------------------------------------ */
  const S2 = (() => {
    const f1 = fsl(30, 8);
    const g2 = dishGain(1.2, 15, 0.55);
    const g3 = dishGain(0.9, 13, 0.55);
    const fsl3 = fsl(20, 13);
    const rsl3 = 26 - 0.5 + g3 - fsl3 + g3 - 0.5;
    const rs5 = 28 / 1.25;
    const n5 = -174 + 10 * log10(rs5 * 1e6) + 5;
    const thr5 = n5 + 22.5;
    return {
      id: 's2',
      num: 'S2',
      title: 'Bilan de liaison FH',
      subtitle: 'FSL, gain d’antenne, RSL, marge, seuil',
      exercises: [
        {
          id: 's2e1',
          title: 'Affaiblissement en espace libre',
          statement: '<p>Calculez l’affaiblissement en espace libre d’un bond de <b>30 km</b> à <b>8 GHz</b>.</p><div class="formula">FSL = 92,45 + 20·log(d km) + 20·log(f GHz)</div>',
          fields: [{ label: 'FSL', unit: 'dB', answer: f1, tol: 0.1 }],
          hint: '20·log(30) ≈ 29,54 ; 20·log(8) ≈ 18,06.',
          correction: `<p>FSL = 92,45 + 20·log(30) + 20·log(8) = 92,45 + ${fmt(20 * log10(30))} + ${fmt(20 * log10(8))} = <b>${fmt(f1)} dB</b>.</p>`,
          sim: { build: () => fhTopo(30, '8', 1.2, 29, { title: 'Exercice S2-1 : bond 30 km à 8 GHz' }), focus: ['Site A', 'Site B', 'budget'], note: 'Le simulateur affiche le FSL dans l’onglet Bilan de liaison.' },
        },
        {
          id: 's2e2',
          title: 'Gain d’une parabole',
          statement: '<p>Calculez le gain d’une antenne parabolique de <b>1,2 m</b> à <b>15 GHz</b>, avec un rendement η = <b>0,55</b> (c = 3·10⁸ m/s).</p><div class="formula">G = 10·log(η·(π·D/λ)²)    λ = c / f</div>',
          fields: [{ label: 'G', unit: 'dBi', answer: g2, tol: 0.2 }],
          hint: 'λ = 3·10⁸ / 15·10⁹ = 0,02 m. Puis π·D/λ ≈ 188,5.',
          correction: `<p>λ = 3·10⁸ / 15·10⁹ = 0,02 m ; π·D/λ = π × 1,2 / 0,02 ≈ ${fmt((Math.PI * 1.2) / 0.02, 1)}.</p><p>G = 10·log(0,55 × ${fmt((Math.PI * 1.2) / 0.02, 1)}²) = <b>${fmt(g2, 1)} dBi</b>.</p>`,
        },
        {
          id: 's2e3',
          title: 'Niveau de réception RSL',
          statement: `<p>Un bond de <b>20 km à 13 GHz</b> utilise deux antennes de <b>0,9 m</b> (gain ${fmt(g3, 1)} dBi chacune). L’ODU émet <b>26 dBm</b> (puissance maximale en bande 13 GHz) ; les pertes de branchement valent <b>0,5 dB</b> de chaque côté. On néglige l’absorption atmosphérique.</p><p>Calculez le FSL puis le RSL.</p>`,
          fields: [
            { label: 'FSL', unit: 'dB', answer: fsl3, tol: 0.1 },
            { label: 'RSL', unit: 'dBm', answer: rsl3, tol: 0.3 },
          ],
          hint: 'RSL = Ptx − Ltx + Gtx − FSL + Grx − Lrx.',
          correction: `<p>FSL = 92,45 + 20·log(20) + 20·log(13) = <b>${fmt(fsl3)} dB</b>.</p><p>RSL = 26 − 0,5 + ${fmt(g3, 1)} − ${fmt(fsl3)} + ${fmt(g3, 1)} − 0,5 = <b>${fmt(rsl3, 1)} dBm</b>.</p><p class="small-muted">Le simulateur ajoute l’absorption par les gaz (≈ 0,6 dB ici) : son RSL est donc légèrement plus faible.</p>`,
          sim: { build: () => fhTopo(20, '13', 0.9, 26, { title: 'Exercice S2-3 : 20 km à 13 GHz' }), focus: ['Site A', 'Site B', 'budget'], note: 'Le simulateur ajoute l’absorption atmosphérique (≈ 0,6 dB).' },
        },
        {
          id: 's2e4',
          title: 'Marge au fading',
          statement: '<p>Une liaison reçoit <b>−45 dBm</b> par ciel clair. Le seuil du récepteur en 256QAM est <b>−67 dBm</b>. Calculez la marge au fading. Le cahier des charges impose 25 dB : la liaison est-elle conforme ? (Répondez 1 pour oui, 0 pour non.)</p>',
          fields: [
            { label: 'Marge', unit: 'dB', answer: 22, tol: 0.05 },
            { label: 'Conforme (1 = oui, 0 = non)', unit: '', answer: 0, tol: 0 },
          ],
          hint: 'Marge = RSL − seuil.',
          correction: '<p>Marge = −45 − (−67) = <b>22 dB</b> &lt; 25 dB → <b>non conforme (0)</b>. Il faut gagner au moins 3 dB : antennes plus grandes, puissance plus élevée ou bande plus basse.</p>',
        },
        {
          id: 's2e5',
          title: 'Seuil de réception',
          statement: `<p>Un récepteur a un facteur de bruit <b>NF = 5 dB</b>. Le canal de <b>28 MHz</b> transporte <b>${fmt(rs5, 1)} Msymb/s</b> (roll-off 0,25). La modulation 64QAM exige un <b>C/N de 22,5 dB</b>.</p><p>Calculez la puissance de bruit N puis le seuil de réception.</p><div class="formula">N = −174 + 10·log(Rs) + NF    Seuil = N + C/N</div>`,
          fields: [
            { label: 'N', unit: 'dBm', answer: n5, tol: 0.1 },
            { label: 'Seuil', unit: 'dBm', answer: thr5, tol: 0.1 },
          ],
          hint: '10·log(22,4·10⁶) ≈ 73,5.',
          correction: `<p>N = −174 + 10·log(${fmt(rs5, 1)}·10⁶) + 5 = −174 + ${fmt(10 * log10(rs5 * 1e6))} + 5 = <b>${fmt(n5)} dBm</b>.</p><p>Seuil = ${fmt(n5)} + 22,5 = <b>${fmt(thr5)} dBm</b>.</p>`,
        },
      ],
    };
  })();

  /* ------------------------------------------------------------------
   * SÉRIE 3 — Zone de Fresnel et dégagement
   * ------------------------------------------------------------------ */
  const S3 = (() => {
    const fr = (d1, d2, f) => 17.32 * Math.sqrt((d1 * d2) / (f * (d1 + d2)));
    const bul = (d1, d2) => (d1 * d2) / (12.74 * (4 / 3));
    const e1 = fr(10, 10, 13);
    const e2 = fr(5, 15, 7);
    const e3 = bul(15, 15);
    const b4 = bul(10, 10);
    const clr4 = 330 - (310 + b4);
    const ratio4 = (clr4 / e1) * 100;
    const need5 = 325 + b4 + 0.6 * e1 - 300;
    return {
      id: 's3',
      num: 'S3',
      title: 'Zone de Fresnel et dégagement',
      subtitle: 'Rayon de Fresnel, renflement terrestre, hauteur de pylône',
      exercises: [
        {
          id: 's3e1',
          title: 'Rayon de Fresnel au milieu du bond',
          statement: '<p>Calculez le rayon de la 1ère zone de Fresnel <b>au milieu</b> d’un bond de <b>20 km</b> à <b>13 GHz</b>.</p><div class="formula">r1 = 17,32·√(d1·d2 / (f·d))    [m, km, GHz]</div>',
          fields: [{ label: 'r1', unit: 'm', answer: e1, tol: 0.1 }],
          hint: 'Au milieu, d1 = d2 = 10 km.',
          correction: `<p>r1 = 17,32·√(10 × 10 / (13 × 20)) = 17,32 × ${fmt(Math.sqrt(100 / 260), 3)} = <b>${fmt(e1)} m</b>.</p>`,
        },
        {
          id: 's3e2',
          title: 'Rayon de Fresnel hors du milieu',
          statement: '<p>Même calcul pour un point situé à <b>5 km</b> d’une extrémité d’un bond de <b>20 km</b> à <b>7 GHz</b>.</p>',
          fields: [{ label: 'r1', unit: 'm', answer: e2, tol: 0.1 }],
          hint: 'd1 = 5 km, d2 = 15 km.',
          correction: `<p>r1 = 17,32·√(5 × 15 / (7 × 20)) = <b>${fmt(e2)} m</b>.</p><p class="small-muted">À 7 GHz, la zone de Fresnel est plus large qu’à 13 GHz : les bandes basses demandent plus de dégagement.</p>`,
        },
        {
          id: 's3e3',
          title: 'Renflement terrestre',
          statement: '<p>Calculez le renflement terrestre au milieu d’un bond de <b>30 km</b> avec k = 4/3.</p><div class="formula">h = d1·d2 / (12,74·k)</div>',
          fields: [{ label: 'h', unit: 'm', answer: e3, tol: 0.1 }],
          hint: '12,74 × 4/3 ≈ 16,99.',
          correction: `<p>h = 15 × 15 / (12,74 × 4/3) = 225 / 16,99 = <b>${fmt(e3)} m</b>.</p>`,
        },
        {
          id: 's3e4',
          title: 'Taux de dégagement au-dessus d’un obstacle',
          statement: `<p>Bond de <b>20 km à 13 GHz</b>. Les deux antennes sont à l’altitude <b>330 m</b> (sol + pylône). Au milieu du bond se trouve un obstacle dont le sommet est à <b>310 m</b> d’altitude. On prend k = 4/3 ; au milieu, r1 = ${fmt(e1)} m.</p><p>Calculez le renflement, le dégagement (en m) puis le taux de dégagement de la 1ère zone de Fresnel (en %).</p>`,
          fields: [
            { label: 'Renflement', unit: 'm', answer: b4, tol: 0.1 },
            { label: 'Dégagement', unit: 'm', answer: clr4, tol: 0.2 },
            { label: 'Taux', unit: '%', answer: ratio4, tol: 2 },
          ],
          hint: 'Dégagement = hauteur de la ligne de visée − (sommet de l’obstacle + renflement).',
          correction: `<p>Renflement = 10 × 10 / 16,99 = <b>${fmt(b4)} m</b>.</p><p>Dégagement = 330 − (310 + ${fmt(b4)}) = <b>${fmt(clr4)} m</b>.</p><p>Taux = ${fmt(clr4)} / ${fmt(e1)} = <b>${fmt(ratio4, 0)} %</b> → la 1ère zone de Fresnel est entièrement dégagée.</p>`,
        },
        {
          id: 's3e5',
          title: 'Hauteur de pylône minimale',
          statement: `<p>Même bond (20 km, 13 GHz, r1 = ${fmt(e1)} m au milieu), mais le sol est à <b>300 m</b> aux deux extrémités et l’obstacle culmine à <b>325 m</b> au milieu. Les deux pylônes ont la même hauteur.</p><p>Quelle hauteur d’antenne minimale (au-dessus du sol) faut-il pour dégager <b>60 %</b> de la zone de Fresnel ?</p>`,
          fields: [{ label: 'Hauteur d’antenne', unit: 'm', answer: need5, tol: 0.5 }],
          hint: 'Il faut : ligne de visée ≥ obstacle + renflement + 0,6 × r1.',
          correction: `<p>Altitude minimale de la ligne de visée = 325 + ${fmt(b4)} + 0,6 × ${fmt(e1)} = ${fmt(325 + b4 + 0.6 * e1)} m.</p><p>Hauteur d’antenne = ${fmt(325 + b4 + 0.6 * e1)} − 300 = <b>${fmt(need5, 1)} m</b> (on retiendra un pylône d’environ 40 m).</p>`,
        },
      ],
    };
  })();

  /* ------------------------------------------------------------------
   * SÉRIE 4 — Pluie et choix de bande
   * ------------------------------------------------------------------ */
  const S4 = (() => {
    const c15 = RP ? RP.rainCoefficients(15, 'H') : { k: 0.04481, alpha: 1.1233 };
    const k1 = Math.round(c15.k * 10000) / 10000;
    const a1 = Math.round(c15.alpha * 1000) / 1000;
    const g1 = k1 * Math.pow(50, a1);
    const d0b = 35 * Math.exp(-0.015 * 50);
    const de2 = 15 / (1 + 15 / d0b);
    const a3 = g1 * de2;
    const c8 = RP ? RP.rainCoefficients(8, 'V') : { k: 0.00345, alpha: 1.3797 };
    const c18 = RP ? RP.rainCoefficients(18, 'V') : { k: 0.07708, alpha: 1.0025 };
    const g8 = c8.k * Math.pow(60, c8.alpha);
    const g18 = c18.k * Math.pow(60, c18.alpha);
    const d04 = 35 * Math.exp(-0.015 * 60);
    const de4 = 25 / (1 + 25 / d04);
    const A8 = g8 * de4;
    const A18 = g18 * de4;
    return {
      id: 's4',
      num: 'S4',
      title: 'Pluie et choix de bande',
      subtitle: 'Atténuation spécifique, longueur effective, ACM',
      exercises: [
        {
          id: 's4e1',
          title: 'Atténuation spécifique de la pluie',
          statement: `<p>À 15 GHz en polarisation horizontale, les coefficients UIT-R P.838 valent <b>k = ${fmt(k1, 4)}</b> et <b>α = ${fmt(a1, 3)}</b>. Calculez l’atténuation spécifique pour une pluie de <b>50 mm/h</b>.</p><div class="formula">γ = k·R^α (dB/km)</div>`,
          fields: [{ label: 'γ', unit: 'dB/km', answer: g1, tol: 0.05 }],
          hint: '50^α se calcule avec la touche x^y de la calculatrice.',
          correction: `<p>γ = ${fmt(k1, 4)} × 50^${fmt(a1, 3)} = ${fmt(k1, 4)} × ${fmt(Math.pow(50, a1), 1)} = <b>${fmt(g1)} dB/km</b>.</p>`,
        },
        {
          id: 's4e2',
          title: 'Longueur effective sous la pluie',
          statement: '<p>Une cellule orageuse ne couvre pas tout le bond. Calculez la longueur effective d’un bond de <b>15 km</b> sous une pluie de <b>50 mm/h</b>.</p><div class="formula">d0 = 35·e^(−0,015·R)    d_eff = d / (1 + d/d0)</div>',
          fields: [
            { label: 'd0', unit: 'km', answer: d0b, tol: 0.1 },
            { label: 'd_eff', unit: 'km', answer: de2, tol: 0.1 },
          ],
          hint: 'e^(−0,75) ≈ 0,472.',
          correction: `<p>d0 = 35 × e^(−0,75) = <b>${fmt(d0b)} km</b> ; d_eff = 15 / (1 + 15 / ${fmt(d0b)}) = <b>${fmt(de2)} km</b>.</p>`,
        },
        {
          id: 's4e3',
          title: 'Atténuation totale due à la pluie',
          statement: `<p>À partir des deux exercices précédents (γ = ${fmt(g1)} dB/km, d_eff = ${fmt(de2)} km), calculez l’atténuation due à la pluie sur le bond de 15 km à 15 GHz.</p>`,
          fields: [{ label: 'A_pluie', unit: 'dB', answer: a3, tol: 0.3 }],
          hint: 'A = γ × d_eff.',
          correction: `<p>A_pluie = ${fmt(g1)} × ${fmt(de2)} = <b>${fmt(a3, 1)} dB</b>.</p><p class="small-muted">Une liaison 15 GHz de 15 km doit donc disposer d’environ ${fmt(Math.ceil(a3), 0)} dB de marge (ou d’une ACM) pour passer un orage de 50 mm/h.</p>`,
        },
        {
          id: 's4e4',
          title: '8 GHz ou 18 GHz sur 25 km ?',
          statement: `<p>Bond de <b>25 km</b>, pluie de <b>60 mm/h</b>, polarisation verticale. Atténuations spécifiques : <b>γ(8 GHz) = ${fmt(g8, 3)} dB/km</b> et <b>γ(18 GHz) = ${fmt(g18, 2)} dB/km</b>. Calculez la longueur effective puis l’atténuation de pluie dans chaque bande.</p><p>Les deux liaisons ont une marge de 30 dB : laquelle tient ?</p>`,
          fields: [
            { label: 'd_eff', unit: 'km', answer: de4, tol: 0.1 },
            { label: 'A_pluie 8 GHz', unit: 'dB', answer: A8, tol: 0.2 },
            { label: 'A_pluie 18 GHz', unit: 'dB', answer: A18, tol: 0.5 },
          ],
          hint: 'd0 = 35·e^(−0,9).',
          correction: `<p>d0 = 35 × e^(−0,9) = ${fmt(d04)} km ; d_eff = 25 / (1 + 25 / ${fmt(d04)}) = <b>${fmt(de4)} km</b>.</p><p>8 GHz : ${fmt(g8, 3)} × ${fmt(de4)} = <b>${fmt(A8, 1)} dB</b> ; 18 GHz : ${fmt(g18, 2)} × ${fmt(de4)} = <b>${fmt(A18, 1)} dB</b>.</p><p>Avec 30 dB de marge, seule la liaison <b>8 GHz</b> tient : la liaison 18 GHz est coupée pendant l’orage.</p>`,
          sim: { build: () => fhTopo(25, '8', 1.2, 29, { title: 'Exercice S4-4 : 25 km à 8 GHz sous la pluie', rain: 60 }), focus: ['Site A', 'Site B', 'budget'], note: 'Pluie réglée à 60 mm/h. Changez la bande des deux ODU en 18 GHz pour comparer.' },
        },
        {
          id: 's4e5',
          title: 'Modulation choisie par l’ACM',
          statement: '<p>Une liaison reçoit <b>−40 dBm</b> par ciel clair. Pendant un orage, la pluie atténue le signal de <b>30 dB</b>. Seuils du récepteur : 256QAM −67,5 dBm · 128QAM −70,5 dBm · 64QAM −73,5 dBm · 16QAM −79,5 dBm.</p><p>Quel est le RSL pendant l’orage ? Combien de bits par symbole transporte la modulation choisie par l’ACM ?</p>',
          fields: [
            { label: 'RSL', unit: 'dBm', answer: -70, tol: 0.05 },
            { label: 'Bits / symbole', unit: '', answer: 7, tol: 0 },
          ],
          hint: 'L’ACM choisit la modulation la plus élevée dont le seuil reste inférieur au RSL.',
          correction: '<p>RSL = −40 − 30 = <b>−70 dBm</b>. −70 &gt; −70,5 dBm : le seuil du 128QAM est respecté, celui du 256QAM (−67,5) ne l’est plus → <b>128QAM, 7 bits/symbole</b> (2⁷ = 128).</p>',
        },
      ],
    };
  })();

  /* ------------------------------------------------------------------
   * SÉRIE 5 — Satellite : latence, pointage, bilan
   * ------------------------------------------------------------------ */
  const S5 = (() => {
    const oneway = ((37000 + 37000) / 300000) * 1000;
    const rtt = 2 * oneway;
    const look = SP ? SP.geoLookAngles(12.37, -1.53, 7) : { azimuth: 145.6, elevation: 72.6 };
    const g3 = dishGain(1.8, 14.25, 0.65);
    const p3 = 10 * log10(4);
    const eirp3 = p3 - 0.5 + g3;
    const tl = 290 * (Math.pow(10, 0.08) - 1);
    const ts = 35 + tl;
    const gt = 45 - 10 * log10(ts);
    const cn0 = 50 - 205.5 + 25 + 228.6;
    const ebn0 = cn0 - 10 * log10(50e6);
    return {
      id: 's5',
      num: 'S5',
      title: 'Liaisons satellitaires',
      subtitle: 'Latence, pointage, PIRE, G/T, C/N0, Eb/N0',
      exercises: [
        {
          id: 's5e1',
          title: 'Latence d’un satellite géostationnaire',
          statement: '<p>Une station VSAT et son Hub sont chacun à <b>37 000 km</b> du satellite GEO. Calculez le temps de propagation d’un trajet simple (VSAT → satellite → Hub), puis le temps aller-retour (RTT) sans compter les traitements (c = 300 000 km/s).</p>',
          fields: [
            { label: 'Trajet simple', unit: 'ms', answer: oneway, tol: 1 },
            { label: 'RTT', unit: 'ms', answer: rtt, tol: 2 },
          ],
          hint: 't = d / c ; le RTT parcourt deux fois le trajet simple.',
          correction: `<p>t = (37 000 + 37 000) / 300 000 = <b>${fmt(oneway, 1)} ms</b> ; RTT = 2 × ${fmt(oneway, 1)} = <b>${fmt(rtt, 0)} ms</b>.</p><p class="small-muted">Avec les traitements des modems (≈ 40 ms), on mesure environ 520 à 550 ms.</p>`,
          sim: { build: () => vsatTopo(14.2, -0.4, 7, { title: 'Exercice S5-1 : latence GEO' }), focus: ['GEO', 'Antenne VSAT', 'budget'], note: 'Faites un ping (P) du Site distant vers Internet pour mesurer le RTT.' },
        },
        {
          id: 's5e2',
          title: 'Pointage d’une antenne à Ouagadougou',
          statement: `<p>Une antenne est installée à Ouagadougou (<b>φ = 12,37° N</b>, <b>L = 1,53° O</b>). Le satellite est en orbite géostationnaire à <b>7° E</b>. Calculez l’élévation et l’azimut.</p><div class="formula">El = arctan[(cos ΔL·cos φ − 0,1513) / √(1 − (cos ΔL·cos φ)²)]<br>Az = 180° − arctan(tan ΔL / sin φ)   (satellite à l’Est)</div>`,
          fields: [
            { label: 'Élévation', unit: '°', answer: look.elevation, tol: 0.3 },
            { label: 'Azimut', unit: '°', answer: look.azimuth, tol: 0.5 },
          ],
          hint: 'ΔL = 7 − (−1,53) = 8,53°.',
          correction: `<p>ΔL = 8,53° ; cos ΔL·cos φ = cos 8,53° × cos 12,37° = ${fmt(Math.cos((8.53 * Math.PI) / 180) * Math.cos((12.37 * Math.PI) / 180), 4)}.</p><p>El = <b>${fmt(look.elevation, 1)}°</b> ; Az = 180 − arctan(tan 8,53° / sin 12,37°) = <b>${fmt(look.azimuth, 1)}°</b> (vers le sud-sud-est).</p>`,
          sim: { build: () => vsatTopo(12.37, -1.53, 7, { title: 'Exercice S5-2 : pointage depuis Ouagadougou' }), focus: ['GEO', 'Antenne VSAT', 'profile'], note: 'L’onglet Profil & Fresnel affiche la boussole de pointage et le calcul détaillé.' },
        },
        {
          id: 's5e3',
          title: 'PIRE d’une station VSAT',
          statement: `<p>Une station VSAT utilise un <b>BUC de 4 W</b>, des pertes de guide de <b>0,5 dB</b> et une antenne de <b>1,8 m</b> dont le gain à 14,25 GHz vaut <b>${fmt(g3, 1)} dBi</b>. Calculez la puissance du BUC en dBW puis la PIRE.</p>`,
          fields: [
            { label: 'P BUC', unit: 'dBW', answer: p3, tol: 0.05 },
            { label: 'PIRE', unit: 'dBW', answer: eirp3, tol: 0.15 },
          ],
          hint: 'P(dBW) = 10·log(P en W).',
          correction: `<p>P = 10·log(4) = <b>${fmt(p3)} dBW</b> ; PIRE = ${fmt(p3)} − 0,5 + ${fmt(g3, 1)} = <b>${fmt(eirp3, 1)} dBW</b>.</p>`,
        },
        {
          id: 's5e4',
          title: 'Facteur de mérite G/T',
          statement: '<p>Une antenne VSAT a un gain en réception de <b>45 dBi</b> et une température de bruit de <b>35 K</b>. Le LNB a un facteur de bruit <b>NF = 0,8 dB</b>. Calculez la température du LNB, la température système puis le G/T.</p><div class="formula">T_LNB = 290·(10^(NF/10) − 1)    G/T = G − 10·log(T_sys)</div>',
          fields: [
            { label: 'T_LNB', unit: 'K', answer: tl, tol: 0.5 },
            { label: 'T_sys', unit: 'K', answer: ts, tol: 0.5 },
            { label: 'G/T', unit: 'dB/K', answer: gt, tol: 0.1 },
          ],
          hint: '10^0,08 ≈ 1,202.',
          correction: `<p>T_LNB = 290 × (10^0,08 − 1) = <b>${fmt(tl, 1)} K</b> ; T_sys = 35 + ${fmt(tl, 1)} = <b>${fmt(ts, 1)} K</b>.</p><p>G/T = 45 − 10·log(${fmt(ts, 1)}) = <b>${fmt(gt)} dB/K</b>.</p>`,
        },
        {
          id: 's5e5',
          title: 'C/N0 et Eb/N0',
          statement: '<p>Voie descendante : PIRE du satellite <b>50 dBW</b>, affaiblissement en espace libre <b>205,5 dB</b>, G/T de la station <b>25 dB/K</b>, pas de pluie. Le débit utile est de <b>50 Mbit/s</b>. Calculez le C/N0 puis l’Eb/N0 (constante de Boltzmann : −228,6 dBW/K/Hz).</p><div class="formula">C/N0 = PIRE − FSL + G/T + 228,6    Eb/N0 = C/N0 − 10·log(Rb)</div>',
          fields: [
            { label: 'C/N0', unit: 'dBHz', answer: cn0, tol: 0.05 },
            { label: 'Eb/N0', unit: 'dB', answer: ebn0, tol: 0.1 },
          ],
          hint: '10·log(50·10⁶) ≈ 77,0.',
          correction: `<p>C/N0 = 50 − 205,5 + 25 + 228,6 = <b>${fmt(cn0, 1)} dBHz</b>.</p><p>Eb/N0 = ${fmt(cn0, 1)} − 10·log(50·10⁶) = ${fmt(cn0, 1)} − ${fmt(10 * log10(50e6))} = <b>${fmt(ebn0, 1)} dB</b>, une marge confortable pour un MODCOD élevé.</p>`,
        },
      ],
    };
  })();

  /* ------------------------------------------------------------------
   * SÉRIE 6 — Réseau : IP, VLAN, MPLS, QoS
   * ------------------------------------------------------------------ */
  const S6 = {
    id: 's6',
    num: 'S6',
    title: 'Réseau IP, VLAN, MPLS et QoS',
    subtitle: 'Sous-réseaux, tag 802.1Q, labels, priorité stricte',
    exercises: [
      {
        id: 's6e1',
        title: 'Adresse de réseau et de diffusion',
        statement: '<p>Un PC a l’adresse <b>192.168.10.77/26</b>. Donnez le dernier octet de l’adresse de <b>réseau</b>, celui de l’adresse de <b>diffusion</b> (broadcast), et le nombre d’adresses utilisables pour les hôtes.</p>',
        fields: [
          { label: 'Réseau : 192.168.10.', unit: '', answer: 64, tol: 0 },
          { label: 'Diffusion : 192.168.10.', unit: '', answer: 127, tol: 0 },
          { label: 'Hôtes utilisables', unit: '', answer: 62, tol: 0 },
        ],
        hint: '/26 → masque 255.255.255.192 : des blocs de 64 adresses (0, 64, 128, 192).',
        correction: '<p>/26 laisse 6 bits pour les hôtes : blocs de 2⁶ = 64 adresses. 77 est dans le bloc 64–127.</p><p>Réseau <b>192.168.10.64</b> ; diffusion <b>192.168.10.127</b> ; hôtes : 64 − 2 = <b>62</b> (.65 à .126).</p>',
      },
      {
        id: 's6e2',
        title: 'Masque /28',
        statement: '<p>Pour un réseau en <b>/28</b>, donnez le dernier octet du masque en notation décimale et le nombre d’hôtes utilisables.</p>',
        fields: [
          { label: 'Masque : 255.255.255.', unit: '', answer: 240, tol: 0 },
          { label: 'Hôtes utilisables', unit: '', answer: 14, tol: 0 },
        ],
        hint: '28 bits à 1 : les 4 bits de poids fort du dernier octet sont à 1.',
        correction: '<p>Dernier octet : 1111 0000 = 128 + 64 + 32 + 16 = <b>240</b>. Bits d’hôte : 32 − 28 = 4 → 2⁴ − 2 = <b>14</b> hôtes.</p><p class="small-muted">Les /28 à /30 servent souvent pour les liens point-à-point entre routeurs.</p>',
      },
      {
        id: 's6e3',
        title: 'Le tag VLAN 802.1Q',
        statement: '<p>Combien d’octets le tag 802.1Q ajoute-t-il à une trame Ethernet ? Sur combien de bits est codé le VLAN ID ? Combien de VLAN sont utilisables (les valeurs 0 et 4095 sont réservées) ?</p>',
        fields: [
          { label: 'Taille du tag', unit: 'octets', answer: 4, tol: 0 },
          { label: 'VLAN ID', unit: 'bits', answer: 12, tol: 0 },
          { label: 'VLAN utilisables', unit: '', answer: 4094, tol: 0 },
        ],
        hint: 'Tag = TPID (16 bits) + PCP (3) + DEI (1) + VID.',
        correction: '<p>Tag = TPID 0x8100 (16 bits) + PCP (3 bits) + DEI (1 bit) + VID (12 bits) = 32 bits = <b>4 octets</b>.</p><p>VID sur <b>12 bits</b> → 2¹² = 4 096 valeurs, moins 0 et 4095 → <b>4 094 VLAN</b>.</p>',
        sim: {
          build: () => ({
            settings: { title: 'Exercice S6-3 : trames 802.1Q', scaleKm: 0.25 },
            nodes: [N('switch', 'SW', 450, 500, { vlans: 'all' }), N('pc', 'PC VLAN 10', 250, 650, { ip: '10.0.10.2', vlan: 10 }), N('server', 'Serveur VLAN 10', 650, 650, { ip: '10.0.10.1', vlan: 10 })],
            links: [Lk('SW', 'PC VLAN 10'), Lk('SW', 'Serveur VLAN 10')],
            flows: [{ src: 'PC VLAN 10', dst: 'Serveur VLAN 10', rateMbps: 5, cls: 'data', name: 'PC → Serveur' }],
          }),
          focus: ['SW', 'PC VLAN 10', 'network'],
          note: 'Dans l’onglet Réseau, cliquez sur le flux pour voir la pile d’en-têtes (Ethernet | 802.1Q VLAN 10 | IP).',
        },
      },
      {
        id: 's6e4',
        title: 'Opérations MPLS sur un LSP',
        statement: '<p>Un LSP traverse quatre routeurs : <b>PE1 → P1 → P2 → PE2</b>, avec PHP (Penultimate Hop Popping). Combien d’opérations <b>SWAP</b> sont réalisées ? Sur combien de bits est codé un label MPLS ? Combien d’octets ajoute un label ?</p>',
        fields: [
          { label: 'Nombre de SWAP', unit: '', answer: 1, tol: 0 },
          { label: 'Label', unit: 'bits', answer: 20, tol: 0 },
          { label: 'En-tête MPLS', unit: 'octets', answer: 4, tol: 0 },
        ],
        hint: 'PE1 fait PUSH, l’avant-dernier routeur fait POP (PHP), PE2 reçoit le paquet sans label.',
        correction: '<p>PE1 : PUSH ; P1 : <b>SWAP (1 seul)</b> ; P2 (avant-dernier saut) : POP (PHP) ; PE2 reçoit le paquet IP.</p><p>Un en-tête MPLS fait <b>32 bits = 4 octets</b> : label sur <b>20 bits</b>, TC (3), S (1), TTL (8).</p>',
      },
      {
        id: 's6e5',
        title: 'Priorité stricte sur un lien saturé',
        statement: '<p>Sous la pluie, l’ACM réduit un faisceau à <b>10 Mbit/s</b>. Il transporte : voix <b>2 Mbit/s</b> (EF), vidéo <b>5 Mbit/s</b> (AF41), données <b>6 Mbit/s</b> (best effort). La QoS applique une <b>priorité stricte</b> voix &gt; vidéo &gt; données.</p><p>Quel débit reste-t-il pour les données ? Quel pourcentage des données est perdu ?</p>',
        fields: [
          { label: 'Débit données', unit: 'Mbit/s', answer: 3, tol: 0.05 },
          { label: 'Perte données', unit: '%', answer: 50, tol: 0.5 },
        ],
        hint: 'Servez d’abord la voix, puis la vidéo, puis donnez le reste aux données.',
        correction: '<p>Voix : 2 → reste 8 ; vidéo : 5 → reste <b>3 Mbit/s</b> pour les données. Perte = (6 − 3) / 6 = <b>50 %</b>. La voix et la vidéo ne subissent aucune perte.</p>',
      },
    ],
  };

  /* ------------------------------------------------------------------
   * SÉRIE 7 — Direct-to-Device (satellite vers mobile et IoT)
   * Formules identiques au moteur d2d_physics.js.
   * ------------------------------------------------------------------ */
  const S7 = (() => {
    const R = 6378.137;
    const deg = Math.PI / 180;
    // Exercice 1 : distance et FSL (h = 525 km, E = 50°, 1 962 MHz)
    const h1 = 525;
    const E1 = 50 * deg;
    const d1 = Math.sqrt((R + h1) ** 2 - (R * Math.cos(E1)) ** 2) - R * Math.sin(E1);
    const fsl1 = 32.45 + 20 * log10(d1) + 20 * log10(1962);
    // Exercice 2 : G/T d'un smartphone et bruit sur 4,5 MHz
    const t2 = 290 + 290 * (Math.pow(10, 0.7) - 1);
    const gt2 = 0 - 10 * log10(t2);
    const n2 = -228.6 + 10 * log10(t2) + 10 * log10(4.5e6) + 30;
    // Exercice 3 : RSRP et SNR (C = −93,0 dBm, 25 blocs)
    const rsrp3 = -93.0 - 10 * log10(12 * 25);
    const snr3 = -93.0 - n2;
    // Exercice 4 : Doppler maximal et dérive (1 882 MHz, 525 km)
    const v4 = Math.sqrt(398600.4418 / (R + h1));
    const fd4 = ((1882e6 / 299792.458) * v4 * (R / (R + h1))) / 1000;
    const rate4 = (1882e6 / 299792.458) * ((v4 * v4 * R) / ((R + h1) * h1));
    // Exercice 5 : autonomie d'un capteur IoT
    const q5 = 25 * 5 + 50 * 1.5 + 230 * 0.5;
    const i5 = (q5 * 10) / 86400 + 0.003;
    const y5 = (0.8 * 3600) / i5 / 8760;
    return {
      id: 's7',
      num: 'S7',
      title: 'Direct-to-Device : satellite vers mobile et IoT',
      subtitle: 'Distance et FSL, G/T d’un smartphone, RSRP, Doppler, autonomie IoT (Bac Pro → Master)',
      exercises: [
        {
          id: 's7e1',
          title: 'Distance et affaiblissement vers un satellite LEO',
          statement: '<p>Un satellite Direct-to-Cell tourne à <b>h = 525 km</b>. Il est vu depuis un smartphone sous une élévation de <b>50°</b>. Calculez la distance smartphone → satellite (R = 6 378 km), puis l’affaiblissement en espace libre à <b>1 962 MHz</b>.</p><div class="formula">d = √((R + h)² − (R·cos E)²) − R·sin E      FSL = 32,45 + 20·log(d_km) + 20·log(f_MHz)</div>',
          fields: [
            { label: 'Distance d', unit: 'km', answer: d1, tol: 1.5 },
            { label: 'FSL', unit: 'dB', answer: fsl1, tol: 0.1 },
          ],
          hint: 'R + h = 6 903 km ; R·cos 50° ≈ 4 100 km ; R·sin 50° ≈ 4 886 km.',
          correction: `<p>d = √(6 903² − 4 099,8²) − 4 885,9 = <b>${fmt(d1, 0)} km</b>.</p><p>FSL = 32,45 + 20·log(${fmt(d1, 0)}) + 20·log(1 962) = 32,45 + ${fmt(20 * log10(d1), 2)} + ${fmt(20 * log10(1962), 2)} = <b>${fmt(fsl1, 1)} dB</b>. Vers un GEO (≈ 36 700 km), on aurait ≈ 189,5 dB : 35 dB de plus.</p>`,
        },
        {
          id: 's7e2',
          title: 'Facteur de mérite d’un smartphone (Licence)',
          statement: '<p>Un smartphone a une antenne de <b>0 dBi</b> qui voit la Terre à <b>290 K</b> et un récepteur de facteur de bruit <b>NF = 7 dB</b>. Calculez la température de bruit du système, le G/T, puis la puissance de bruit sur <b>4,5 MHz</b> (25 blocs de ressources) en dBm.</p><div class="formula">T = T_ant + 290·(10^(NF/10) − 1)      G/T = G − 10·log T      N = k + 10·log T + 10·log B   (k = −228,6 dBW/K/Hz)</div>',
          fields: [
            { label: 'T système', unit: 'K', answer: t2, tol: 3 },
            { label: 'G/T', unit: 'dB/K', answer: gt2, tol: 0.05 },
            { label: 'Bruit N', unit: 'dBm', answer: n2, tol: 0.1 },
          ],
          hint: '10^0,7 ≈ 5,012 ; 10·log(4,5·10⁶) ≈ 66,5 ; dBm = dBW + 30.',
          correction: `<p>T = 290 + 290 × (5,012 − 1) = <b>${fmt(t2, 0)} K</b> ; G/T = 0 − 10·log(${fmt(t2, 0)}) = <b>${fmt(gt2, 1)} dB/K</b> (un VSAT de 1,2 m en Ku : ≈ +20 dB/K).</p><p>N = −228,6 + ${fmt(10 * log10(t2), 2)} + ${fmt(10 * log10(4.5e6), 2)} = ${fmt(n2 - 30, 2)} dBW = <b>${fmt(n2, 1)} dBm</b>.</p>`,
        },
        {
          id: 's7e3',
          title: 'RSRP et SNR d’une cellule satellite',
          statement: `<p>Le smartphone reçoit une puissance totale <b>C = −93,0 dBm</b> d’une cellule satellite 4G de 5 MHz (<b>25 blocs</b> de 12 sous-porteuses). Le bruit dans la bande occupée vaut <b>${fmt(n2, 1)} dBm</b>. Calculez le RSRP (puissance par élément de ressource) et le SNR.</p><div class="formula">RSRP = C − 10·log(12 × N_RB)      SNR = C − N</div>`,
          fields: [
            { label: 'RSRP', unit: 'dBm', answer: rsrp3, tol: 0.1 },
            { label: 'SNR', unit: 'dB', answer: snr3, tol: 0.1 },
          ],
          hint: '12 × 25 = 300 éléments de ressource ; 10·log(300) ≈ 24,8.',
          correction: `<p>RSRP = −93,0 − 10·log(300) = −93,0 − 24,77 = <b>${fmt(rsrp3, 1)} dBm</b> : niveau typique d’un service satellite (un réseau terrestre est confortable au-dessus de −100 dBm).</p><p>SNR = −93,0 − (${fmt(n2, 1)}) = <b>${fmt(snr3, 1)} dB</b> : CQI 7 (16QAM), ≈ 5 Mbit/s partagés dans le faisceau.</p>`,
        },
        {
          id: 's7e4',
          title: 'Doppler d’un satellite défilant (Master / ingénieur)',
          statement: '<p>Le smartphone émet à <b>1 882 MHz</b> vers un satellite à <b>525 km</b>. Calculez la vitesse orbitale, le Doppler maximal (satellite à l’horizon, E = 0°) et la dérive Doppler maximale (au zénith).</p><div class="formula">v = √(μ / (R + h)), μ = 398 600 km³/s²      f_d = (f/c)·v·R·cos E / (R + h)      ḟ = (f/c)·v²·R / ((R + h)·h)</div>',
          fields: [
            { label: 'Vitesse v', unit: 'km/s', answer: v4, tol: 0.01 },
            { label: 'Doppler maximal', unit: 'kHz', answer: fd4, tol: 0.15 },
            { label: 'Dérive maximale', unit: 'Hz/s', answer: rate4, tol: 3 },
          ],
          hint: 'f/c = 1 882·10⁶ / 299 792 ≈ 6 278 Hz par km/s ; R / (R + h) ≈ 0,924.',
          correction: `<p>v = √(398 600 / 6 903) = <b>${fmt(v4, 2)} km/s</b>.</p><p>f_d = 6 278 × ${fmt(v4, 3)} × 0,924 = <b>±${fmt(fd4, 1)} kHz</b> : près de trois sous-porteuses de 15 kHz, à précompenser.</p><p>ḟ = 6 278 × ${fmt(v4, 3)}² × 6 378 / (6 903 × 525) = <b>${fmt(rate4, 0)} Hz/s</b>.</p>`,
        },
        {
          id: 's7e5',
          title: 'Autonomie d’un capteur IoT par satellite',
          statement: '<p>À chaque message, un capteur NB-IoT NTN fait un point GNSS de <b>5 s à 25 mA</b>, reçoit pendant <b>1,5 s à 50 mA</b> et émet pendant <b>0,5 s à 230 mA</b>. Il envoie <b>10 messages par jour</b> et consomme <b>3 µA</b> en veille. Calculez la charge par message, le courant moyen et l’autonomie d’une pile de <b>3 600 mAh</b> (on garde 20 % de marge).</p><div class="formula">Q = Σ I·t      I_moy = Q × messages / 86 400 + I_veille      Autonomie = 0,8 × C / I_moy</div>',
          fields: [
            { label: 'Charge par message', unit: 'mA·s', answer: q5, tol: 1 },
            { label: 'Courant moyen', unit: 'µA', answer: i5 * 1000, tol: 0.5 },
            { label: 'Autonomie', unit: 'ans', answer: y5, tol: 0.1 },
          ],
          hint: '1 an = 8 760 h ; convertissez le courant moyen en mA.',
          correction: `<p>Q = 25 × 5 + 50 × 1,5 + 230 × 0,5 = 125 + 75 + 115 = <b>${fmt(q5, 0)} mA·s</b> : le point GNSS est le premier poste.</p><p>I_moy = ${fmt(q5, 0)} × 10 / 86 400 + 0,003 = <b>${fmt(i5 * 1000, 1)} µA</b>.</p><p>Autonomie = 0,8 × 3 600 / ${fmt(i5, 4)} / 8 760 = <b>${fmt(y5, 1)} ans</b>. Pour 10 ans : moins de messages, un point GNSS plus court ou une émission plus rapide.</p>`,
        },
      ],
    };
  })();

  const SERIES = [S1, S2, S3, S4, S5, S6, S7];

  /* ------------------------------------------------------------------
   * PROGRESSION (mémorisée dans le navigateur de l'élève)
   * ------------------------------------------------------------------ */
  const STORE_KEY = 'mbv-exercices-v1';
  let progress = {};
  try {
    progress = JSON.parse(root.localStorage.getItem(STORE_KEY) || '{}') || {};
  } catch (err) {
    progress = {};
  }
  function save() {
    try {
      root.localStorage.setItem(STORE_KEY, JSON.stringify(progress));
    } catch (err) {
      /* stockage indisponible : la progression reste en mémoire */
    }
  }
  const prog = (id) => (progress[id] = progress[id] || { attempts: 0, solved: false, shown: false, values: [] });
  const seriesScore = (s) => s.exercises.filter((e) => progress[e.id] && progress[e.id].solved).length;

  /** Lit un nombre saisi (virgule ou point, signe moins typographique accepté). */
  function parseNum(str) {
    const t = String(str || '')
      .trim()
      .replace(/\s/g, '')
      .replace(',', '.')
      .replace('−', '-');
    if (t === '') return NaN;
    return Number(t);
  }

  /* ------------------------------------------------------------------
   * RENDU (onglet « Exercices corrigés » de la fenêtre Activités)
   * ------------------------------------------------------------------ */
  let ctx = null;

  function render(opts) {
    ctx = opts;
    const cur = SERIES.find((s) => s.id === opts.id) || SERIES.find((s) => s.id === render.lastId) || SERIES[0];
    render.lastId = cur.id;
    // Navigation : séries + progression
    ctx.nav.innerHTML =
      SERIES.map((s) => {
        const sc = seriesScore(s);
        return `<button class="nav-item ${s.id === cur.id ? 'active' : ''}" data-serie="${s.id}"><span class="nav-num">${s.num}</span>${esc(s.title)}<small>${esc(s.subtitle)} · <b>${sc}/${s.exercises.length}</b> réussi${sc > 1 ? 's' : ''}</small></button>`;
      }).join('') + '<button class="btn btn-xs btn-ghost" id="exo-reset" style="margin-top:8px">Effacer ma progression</button>';
    ctx.nav.querySelectorAll('[data-serie]').forEach((b) => b.addEventListener('click', () => render(Object.assign({}, ctx, { id: b.dataset.serie }))));
    const reset = ctx.nav.querySelector('#exo-reset');
    reset.addEventListener('click', () => {
      if (!root.confirm('Effacer la progression de tous les exercices sur ce poste ?')) return;
      progress = {};
      save();
      render(Object.assign({}, ctx, { id: cur.id }));
    });
    // Contenu de la série
    const total = SERIES.reduce((a, s) => a + s.exercises.length, 0);
    const done = SERIES.reduce((a, s) => a + seriesScore(s), 0);
    let h = `<div class="lab-header"><div><div class="small-muted">Série ${cur.num} · ${cur.exercises.length} exercices · progression globale ${done}/${total}</div><h3>${esc(cur.title)}</h3><div class="small-muted">${esc(cur.subtitle)}</div></div></div>
      <div class="tip">Saisissez vos réponses (virgule ou point acceptés) puis cliquez sur <b>Vérifier</b>. Après 2 essais, la <b>correction détaillée</b> devient disponible ; vous pouvez aussi l’afficher plus tôt.</div>`;
    cur.exercises.forEach((e, idx) => {
      const p = prog(e.id);
      h += `<div class="exo-card ${p.solved ? 'solved' : ''}" data-exo="${e.id}">
        <div class="exo-head"><span class="exo-num">${cur.num}-${idx + 1}</span><b>${esc(e.title)}</b>${p.solved ? '<span class="status-pill ok">Réussi</span>' : p.attempts ? `<span class="small-muted">${p.attempts} essai${p.attempts > 1 ? 's' : ''}</span>` : ''}</div>
        <div class="doc exo-statement">${e.statement}</div>
        <div class="exo-fields">${e.fields
          .map(
            (fd, i) =>
              `<label class="exo-field"><span>${esc(fd.label)}</span><input type="text" inputmode="decimal" data-i="${i}" value="${esc(p.values[i] !== undefined ? p.values[i] : '')}" autocomplete="off"><em>${esc(fd.unit)}</em><i class="exo-mark" data-mark="${i}"></i></label>`
          )
          .join('')}</div>
        <div class="btn-row">
          <button class="btn btn-xs btn-accent" data-act="check">Vérifier</button>
          <button class="btn btn-xs" data-act="hint">💡 Indice</button>
          <button class="btn btn-xs" data-act="correction">${p.attempts >= 2 || p.solved || p.shown ? '📘 Correction' : '📘 Correction (après 2 essais)'}</button>
          ${e.sim ? '<button class="btn btn-xs" data-act="sim">🛰 Vérifier dans le simulateur</button>' : ''}
        </div>
        <div class="exo-feedback"></div>
        <div class="exo-hint" hidden><div class="tip">💡 ${esc(e.hint)}</div></div>
        <div class="exo-correction" ${p.shown ? '' : 'hidden'}><div class="answer"><div class="answer-title">✔ Correction</div>${e.correction}</div></div>
      </div>`;
    });
    ctx.detail.innerHTML = h;
    ctx.detail.querySelectorAll('.exo-card').forEach((card) => bindCard(card, cur));
  }

  function bindCard(card, serie) {
    const e = serie.exercises.find((x) => x.id === card.dataset.exo);
    const p = prog(e.id);
    const inputs = [...card.querySelectorAll('input[data-i]')];
    const fb = card.querySelector('.exo-feedback');
    inputs.forEach((inp) =>
      inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') card.querySelector('[data-act="check"]').click();
      })
    );
    card.querySelector('[data-act="check"]').addEventListener('click', () => {
      const vals = inputs.map((i) => parseNum(i.value));
      p.values = inputs.map((i) => i.value);
      if (vals.some((v) => Number.isNaN(v))) {
        fb.innerHTML = '<div class="verdict warn">Complétez tous les champs avec un nombre.</div>';
        save();
        return;
      }
      p.attempts++;
      let okCount = 0;
      e.fields.forEach((fd, i) => {
        const ok = Math.abs(vals[i] - fd.answer) <= fd.tol + 1e-9;
        if (ok) okCount++;
        const m = card.querySelector(`[data-mark="${i}"]`);
        m.textContent = ok ? '✔' : '✘';
        m.className = 'exo-mark ' + (ok ? 'ok' : 'ko');
      });
      const all = okCount === e.fields.length;
      if (all) p.solved = true;
      save();
      fb.innerHTML = all
        ? `<div class="verdict ok">✔ Bravo, ${e.fields.length > 1 ? 'toutes les réponses sont justes' : 'réponse juste'} !</div>`
        : `<div class="verdict err">✘ ${okCount}/${e.fields.length} réponse${okCount > 1 ? 's' : ''} juste${okCount > 1 ? 's' : ''}. ${p.attempts >= 2 ? 'La correction est disponible.' : 'Vérifiez vos calculs (essai ' + p.attempts + '/2), l’indice peut vous aider.'}</div>`;
      const corrBtn = card.querySelector('[data-act="correction"]');
      if (p.attempts >= 2 || p.solved) corrBtn.textContent = '📘 Correction';
      card.classList.toggle('solved', p.solved);
      refreshNav(serie);
    });
    card.querySelector('[data-act="hint"]').addEventListener('click', () => {
      const hEl = card.querySelector('.exo-hint');
      hEl.hidden = !hEl.hidden;
    });
    card.querySelector('[data-act="correction"]').addEventListener('click', () => {
      const c = card.querySelector('.exo-correction');
      if (c.hidden && p.attempts < 2 && !p.solved && !p.shown) {
        if (!root.confirm(`Vous n’avez fait que ${p.attempts} essai${p.attempts > 1 ? 's' : ''}. Afficher quand même la correction ?`)) return;
      }
      c.hidden = !c.hidden;
      if (!c.hidden) {
        p.shown = true;
        save();
      }
    });
    const simBtn = card.querySelector('[data-act="sim"]');
    if (simBtn)
      simBtn.addEventListener('click', () => {
        const api = ctx.api;
        if (api.nodes().length && !root.confirm('Charger la mini-topologie de l’exercice ? La topologie actuelle sera remplacée (pensez à la sauvegarder).')) return;
        api.load(e.sim.build());
        const [a, b, tab] = e.sim.focus || [];
        if (a && b) api.focusLink(a, b, tab);
        else api.closeModals();
        api.log(`Exercice ${serie.num} « ${e.title} » chargé dans le simulateur.${e.sim.note ? ' ' + e.sim.note : ''}`, 'info');
        if (e.sim.note) api.toast(e.sim.note, 'info');
      });
  }

  function refreshNav(serie) {
    const b = ctx.nav.querySelector(`[data-serie="${serie.id}"] small b`);
    if (b) b.textContent = `${seriesScore(serie)}/${serie.exercises.length}`;
  }

  MBV.Exercises = { series: SERIES, render, _progress: () => progress };
})(typeof window !== 'undefined' ? window : globalThis);
