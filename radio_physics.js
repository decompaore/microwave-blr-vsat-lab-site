/* =====================================================================
 * radio_physics.js — Moteur de calcul hyperfréquences terrestre
 * MicroWave, BLR & VSAT Lab
 *
 * Contenu :
 *   - MBV.Util          : utilitaires partagés (format FR, dB, géométrie)
 *   - MBV.RadioPhysics  : catalogues FH/BLR, gain d'antenne, FSL, gaz,
 *                         pluie (UIT-R P.838-3 / P.530), XPD/XPIC,
 *                         profil de terrain, zone de Fresnel, diffraction,
 *                         bilan de liaison complet avec ACM.
 *
 * Script classique (pas de module ES) : fonctionne en double-clic
 * (file://) et aussi sous Node.js pour les tests.
 * ===================================================================== */
(function (root) {
  'use strict';

  const MBV = (root.MBV = root.MBV || {});

  /* ------------------------------------------------------------------
   * 1. UTILITAIRES PARTAGÉS
   * ------------------------------------------------------------------ */
  const Util = {
    /** Formate un nombre à la française : virgule décimale, signe moins typographique. */
    fmt(value, decimals = 2) {
      if (value === null || value === undefined || Number.isNaN(value)) return '—';
      if (!Number.isFinite(value)) return value > 0 ? '+∞' : '−∞';
      const s = Number(value).toFixed(decimals).replace('.', ',');
      return s.startsWith('-') ? '−' + s.slice(1) : s;
    },
    /** Formate avec signe explicite (+ / −). */
    fmtSigned(value, decimals = 2) {
      const s = Util.fmt(value, decimals);
      return value > 0 ? '+' + s : s;
    },
    log10(x) {
      return Math.log10(x);
    },
    dbToLin(db) {
      return Math.pow(10, db / 10);
    },
    linToDb(x) {
      return 10 * Math.log10(x);
    },
    wattToDbm(w) {
      return 10 * Math.log10(w * 1000);
    },
    wattToDbw(w) {
      return 10 * Math.log10(w);
    },
    dbmToWatt(dbm) {
      return Math.pow(10, dbm / 10) / 1000;
    },
    clamp(v, min, max) {
      return Math.min(max, Math.max(min, v));
    },
    deg2rad(d) {
      return (d * Math.PI) / 180;
    },
    rad2deg(r) {
      return (r * 180) / Math.PI;
    },
    /** Normalise un angle en degrés dans [0, 360[. */
    normDeg(a) {
      return ((a % 360) + 360) % 360;
    },
    /** Écart angulaire signé minimal entre deux azimuts, dans ]-180, 180]. */
    angleDiff(a, b) {
      let d = Util.normDeg(a - b);
      if (d > 180) d -= 360;
      return d;
    },
    /** Interpolation linéaire dans un tableau trié [{x, y}]. */
    interp(table, x, xKey = 'x', yKey = 'y') {
      if (x <= table[0][xKey]) return table[0][yKey];
      const last = table[table.length - 1];
      if (x >= last[xKey]) return last[yKey];
      for (let i = 0; i < table.length - 1; i++) {
        const a = table[i];
        const b = table[i + 1];
        if (x >= a[xKey] && x <= b[xKey]) {
          const t = (x - a[xKey]) / (b[xKey] - a[xKey]);
          return a[yKey] + t * (b[yKey] - a[yKey]);
        }
      }
      return last[yKey];
    },
    /** Distance euclidienne (km) entre deux points du plan exprimés en km. */
    distanceKm(a, b) {
      return Math.hypot(b.x - a.x, b.y - a.y);
    },
    /**
     * Azimut (°) de A vers B sur le plan : 0° = Nord (haut de l'écran),
     * 90° = Est (droite). L'axe y de l'écran pointe vers le bas (Sud).
     */
    bearingDeg(a, b) {
      return Util.normDeg(Util.rad2deg(Math.atan2(b.x - a.x, -(b.y - a.y))));
    },
    /**
     * Crée une étape de calcul affichable pas à pas.
     * @param {string} label       Nom de la grandeur (ex. "Affaiblissement en espace libre")
     * @param {string} formula     Formule littérale
     * @param {string} substituted Formule avec valeurs numériques
     * @param {number} value       Résultat
     * @param {string} unit        Unité
     * @param {string} [note]      Commentaire pédagogique
     */
    step(label, formula, substituted, value, unit, note) {
      return { label, formula, substituted, value, unit, note: note || '' };
    },
    uid(prefix = 'id') {
      return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
    },
  };
  MBV.Util = Util;
  const f2 = (v) => Util.fmt(v, 2);
  const f1 = (v) => Util.fmt(v, 1);

  /* ------------------------------------------------------------------
   * 2. CONSTANTES PHYSIQUES
   * ------------------------------------------------------------------ */
  const C = 299792458; // vitesse de la lumière (m/s)
  const BOLTZMANN_DBW = -228.6; // 10·log(k) en dBW/K/Hz
  const NOISE_DENSITY_DBM_HZ = -174; // kT0 à 290 K en dBm/Hz
  const EARTH_RADIUS_KM = 6371;
  const K_FACTOR_DEFAULT = 4 / 3; // atmosphère standard

  /* ------------------------------------------------------------------
   * 3. CATALOGUES D'ÉQUIPEMENTS RADIO
   * ------------------------------------------------------------------ */

  /** Bandes Faisceaux Hertziens (ODU). txMax en dBm, nf = facteur de bruit récepteur (dB). */
  const FH_BANDS = [
    { id: '6', label: '6 GHz (L6/U6)', f: 6.2, txMax: 30, nf: 4.5, channels: [7, 14, 28, 56], typicalHopKm: '30 – 60 km' },
    { id: '7', label: '7 GHz', f: 7.2, txMax: 30, nf: 4.5, channels: [7, 14, 28, 56], typicalHopKm: '25 – 50 km' },
    { id: '8', label: '8 GHz', f: 8.0, txMax: 29, nf: 4.5, channels: [7, 14, 28, 56], typicalHopKm: '20 – 45 km' },
    { id: '11', label: '11 GHz', f: 11.0, txMax: 27, nf: 5, channels: [7, 14, 28, 56, 112], typicalHopKm: '15 – 30 km' },
    { id: '13', label: '13 GHz', f: 13.0, txMax: 26, nf: 5, channels: [7, 14, 28, 56, 112], typicalHopKm: '10 – 25 km' },
    { id: '15', label: '15 GHz', f: 15.0, txMax: 26, nf: 5, channels: [7, 14, 28, 56, 112], typicalHopKm: '8 – 20 km' },
    { id: '18', label: '18 GHz', f: 18.0, txMax: 24, nf: 5.5, channels: [7, 14, 28, 56, 112], typicalHopKm: '5 – 15 km' },
    { id: '23', label: '23 GHz', f: 23.0, txMax: 23, nf: 5.5, channels: [7, 14, 28, 56, 112], typicalHopKm: '3 – 10 km' },
    { id: '70', label: 'E-Band 70 GHz', f: 73.5, txMax: 15, nf: 8, channels: [112, 250, 500, 1000, 2000], typicalHopKm: '0,5 – 3 km' },
    { id: '80', label: 'E-Band 80 GHz', f: 83.5, txMax: 15, nf: 8, channels: [112, 250, 500, 1000, 2000], typicalHopKm: '0,5 – 3 km' },
  ];

  /** Bandes Boucle Locale Radio (point-à-multipoint). */
  const BLR_BANDS = [
    { id: '3.5', label: '3,5 GHz (WiMAX / LTE-TDD / 5G NR n78)', f: 3.5, txMax: 40, nf: 6, channels: [10, 20, 40, 100], cpeGainOutdoor: 18, typicalCellKm: '2 – 15 km' },
    { id: '5.8', label: '5,8 GHz (bande libre WISP)', f: 5.8, txMax: 27, nf: 6, channels: [20, 40, 80], cpeGainOutdoor: 23, typicalCellKm: '1 – 10 km' },
    { id: '26', label: '26 GHz (5G mmWave FWA / LMDS)', f: 26.0, txMax: 24, nf: 8, channels: [100, 200, 400], cpeGainOutdoor: 28, typicalCellKm: '0,3 – 2 km' },
  ];

  /** Diamètres normalisés d'antennes paraboliques FH (m). */
  const FH_DISH_SIZES = [0.3, 0.6, 0.9, 1.2, 1.8, 2.4];

  /**
   * Modulations FH (ACM, QPSK → 1024QAM).
   * snr = rapport signal/bruit requis (dB) pour BER 10⁻⁶ avec codage (valeurs typiques constructeurs).
   */
  const FH_MODULATIONS = [
    { id: 'QPSK', bits: 2, snr: 10.0 },
    { id: '16QAM', bits: 4, snr: 16.5 },
    { id: '32QAM', bits: 5, snr: 19.5 },
    { id: '64QAM', bits: 6, snr: 22.5 },
    { id: '128QAM', bits: 7, snr: 25.5 },
    { id: '256QAM', bits: 8, snr: 28.5 },
    { id: '512QAM', bits: 9, snr: 31.5 },
    { id: '1024QAM', bits: 10, snr: 34.5 },
  ];

  /** Modulations BLR (OFDM, MCS avec taux de codage). bits = bits utiles/symbole après codage. */
  const BLR_MODULATIONS = [
    { id: 'QPSK 1/2', bits: 1.0, snr: 5.0 },
    { id: 'QPSK 3/4', bits: 1.5, snr: 8.0 },
    { id: '16QAM 1/2', bits: 2.0, snr: 11.0 },
    { id: '16QAM 3/4', bits: 3.0, snr: 14.5 },
    { id: '64QAM 2/3', bits: 4.0, snr: 19.0 },
    { id: '64QAM 3/4', bits: 4.5, snr: 21.0 },
    { id: '256QAM 3/4', bits: 6.0, snr: 26.5 },
    { id: '256QAM 5/6', bits: 6.67, snr: 29.0 },
  ];

  const FH_ROLLOFF = 0.25; // facteur de retombée (roll-off) du filtre
  const FH_CODE_EFFICIENCY = 0.92; // rendement FEC + en-têtes radio
  const BLR_OFDM_EFFICIENCY = 0.75; // sous-porteuses utiles, préfixe cyclique, TDD
  const ANTENNA_XPD_DB = 30; // découplage de polarisation croisée des antennes (ciel clair)
  const XPIC_IMPROVEMENT_DB = 20; // gain d'annulation du XPIC (XPIF)

  /* ------------------------------------------------------------------
   * 4. COEFFICIENTS DE PLUIE — UIT-R P.838-3 (valeurs arrondies)
   *    f (GHz), kH, αH, kV, αV
   * ------------------------------------------------------------------ */
  const RAIN_COEFFS = [
    [1, 0.0000259, 0.9691, 0.0000308, 0.8592],
    [2, 0.0000847, 1.0664, 0.0000998, 0.949],
    [3, 0.000139, 1.2322, 0.0001942, 1.0688],
    [4, 0.0001071, 1.6009, 0.0002461, 1.2476],
    [5, 0.0002162, 1.6969, 0.0002428, 1.5317],
    [6, 0.0007056, 1.59, 0.0004878, 1.5728],
    [7, 0.001915, 1.481, 0.001425, 1.4745],
    [8, 0.004115, 1.3905, 0.00345, 1.3797],
    [9, 0.007535, 1.3155, 0.006691, 1.2895],
    [10, 0.01217, 1.2571, 0.01129, 1.2156],
    [11, 0.01772, 1.214, 0.01731, 1.1617],
    [12, 0.02386, 1.1825, 0.02455, 1.1216],
    [13, 0.03041, 1.1586, 0.03266, 1.0901],
    [14, 0.03738, 1.1396, 0.04126, 1.0646],
    [15, 0.04481, 1.1233, 0.05008, 1.044],
    [16, 0.05282, 1.1086, 0.05899, 1.0273],
    [17, 0.06146, 1.0949, 0.06797, 1.0137],
    [18, 0.07078, 1.0818, 0.07708, 1.0025],
    [19, 0.08084, 1.0691, 0.08642, 0.993],
    [20, 0.09164, 1.0568, 0.09611, 0.9847],
    [22, 0.1155, 1.0335, 0.117, 0.97],
    [23, 0.1286, 1.0224, 0.1284, 0.963],
    [25, 0.1571, 1.0011, 0.1533, 0.9491],
    [28, 0.2051, 0.9718, 0.194, 0.929],
    [30, 0.2403, 0.9485, 0.2291, 0.9129],
    [35, 0.3374, 0.9047, 0.3224, 0.8761],
    [40, 0.4431, 0.8673, 0.4274, 0.8421],
    [50, 0.66, 0.8084, 0.6472, 0.7871],
    [60, 0.8606, 0.7656, 0.8515, 0.7486],
    [70, 1.0315, 0.7345, 1.0253, 0.7215],
    [80, 1.1704, 0.7115, 1.1668, 0.7021],
    [90, 1.2807, 0.6944, 1.2795, 0.6876],
    [100, 1.3671, 0.6815, 1.368, 0.6765],
  ];

  /**
   * Atténuation spécifique des gaz atmosphériques (O₂ + vapeur d'eau),
   * climat tropical humide (ρ ≈ 15 g/m³), niveau du sol. f (GHz) → dB/km.
   * Pic d'absorption de la vapeur d'eau à 22,2 GHz, de l'oxygène vers 60 GHz.
   */
  const GAS_TABLE = [
    { x: 1, y: 0.006 },
    { x: 5, y: 0.009 },
    { x: 7, y: 0.011 },
    { x: 10, y: 0.018 },
    { x: 13, y: 0.03 },
    { x: 15, y: 0.045 },
    { x: 18, y: 0.1 },
    { x: 20, y: 0.2 },
    { x: 22.2, y: 0.36 },
    { x: 25, y: 0.25 },
    { x: 30, y: 0.17 },
    { x: 40, y: 0.2 },
    { x: 50, y: 0.55 },
    { x: 55, y: 6.0 },
    { x: 60, y: 15.0 },
    { x: 65, y: 2.5 },
    { x: 70, y: 0.6 },
    { x: 80, y: 0.45 },
    { x: 90, y: 0.5 },
    { x: 100, y: 0.55 },
  ];

  /* ------------------------------------------------------------------
   * 5. MOTEUR DE CALCUL
   * ------------------------------------------------------------------ */
  /**
   * Climats d'Afrique de l'Ouest : valeurs indicatives (ordre de grandeur) du gradient
   * de réfractivité dN1 (UIT-R P.453, dépassé 1 % du temps) et de l'intensité de pluie
   * R0,01 (UIT-R P.837). Pour une étude réelle, lire les cartes UIT-R.
   */
  const CLIMATES = [
    { id: 'sahel', label: 'Sahélien sec (nord du Burkina Faso, Niger, nord du Mali)', dN1: -200, r001: 60 },
    { id: 'soudanien', label: 'Soudano-sahélien (Ouagadougou, Bamako, Niamey)', dN1: -300, r001: 90 },
    { id: 'guineen', label: 'Soudano-guinéen (Bobo-Dioulasso, Korhogo, Parakou)', dN1: -380, r001: 100 },
    { id: 'cotier', label: 'Côtier humide (Abidjan, Lomé, Cotonou, Lagos)', dN1: -500, r001: 120 },
    { id: 'custom', label: 'Personnalisé (dN1 et R0,01 saisis)', dN1: null, r001: null },
  ];
  /** Écart duplex (GHz) entre demi-bande basse et demi-bande haute, par bande FH. */
  const FH_DUPLEX_GHZ = { 6: 0.252, 7: 0.161, 8: 0.311, 11: 0.49, 13: 0.266, 15: 0.42, 18: 1.01, 23: 1.232, 70: 0.25, 80: 0.25 };
  const FH_CHANNELS_PER_HALF = 8;
  const SECONDS_PER_YEAR = 365.25 * 86400;
  /** Discrimination de polarisation hors axe (antennes V et H en visée oblique). */
  const OFFAXIS_XPD_DB = 25;
  /** Discrimination de filtrage (NFD) selon l'écart de fréquence rapporté à la largeur de canal. */
  const NFD_TABLE = [
    { maxRatio: 0.5, db: 0, label: 'co-canal' },
    { maxRatio: 1.5, db: 30, label: '1er canal adjacent' },
    { maxRatio: 2.5, db: 50, label: '2e canal adjacent' },
  ];

  const RadioPhysics = {
    C,
    BOLTZMANN_DBW,
    NOISE_DENSITY_DBM_HZ,
    EARTH_RADIUS_KM,
    K_FACTOR_DEFAULT,
    FH_BANDS,
    BLR_BANDS,
    FH_DISH_SIZES,
    FH_MODULATIONS,
    BLR_MODULATIONS,
    ANTENNA_XPD_DB,
    XPIC_IMPROVEMENT_DB,

    getFhBand(id) {
      return FH_BANDS.find((b) => b.id === String(id)) || FH_BANDS[1];
    },
    getBlrBand(id) {
      return BLR_BANDS.find((b) => b.id === String(id)) || BLR_BANDS[0];
    },
    getModTable(kind) {
      return kind === 'BLR' ? BLR_MODULATIONS : FH_MODULATIONS;
    },

    /** Longueur d'onde (m) pour une fréquence en GHz. */
    wavelengthM(fGHz) {
      return C / (fGHz * 1e9);
    },

    /* ---------------- Antennes ---------------- */

    /** Gain d'une parabole (dBi) : G = 10·log(η·(π·D/λ)²). */
    dishGainDbi(diameterM, fGHz, efficiency = 0.55) {
      const lambda = RadioPhysics.wavelengthM(fGHz);
      return 10 * Math.log10(efficiency * Math.pow((Math.PI * diameterM) / lambda, 2));
    },
    dishGainStep(diameterM, fGHz, efficiency = 0.55) {
      const lambda = RadioPhysics.wavelengthM(fGHz);
      const g = RadioPhysics.dishGainDbi(diameterM, fGHz, efficiency);
      return Util.step(
        "Gain de l'antenne",
        'G = 10·log(η·(π·D/λ)²)   avec λ = c/f',
        `G = 10·log(${f2(efficiency)} × (π × ${f2(diameterM)} / ${Util.fmt(lambda * 1000, 2)}·10⁻³)²)`,
        g,
        'dBi',
        `λ = ${Util.fmt(lambda * 100, 2)} cm à ${f1(fGHz)} GHz ; η = rendement d'ouverture.`
      );
    },
    /** Ouverture à −3 dB d'une parabole (°) : θ ≈ 70·λ/D. */
    dishBeamwidthDeg(diameterM, fGHz) {
      return (70 * RadioPhysics.wavelengthM(fGHz)) / diameterM;
    },
    /** Gain d'une antenne sectorielle (dBi) à partir des ouvertures H et V. */
    sectorGainDbi(hBeamDeg, vBeamDeg = 5, efficiency = 0.6) {
      return 10 * Math.log10((efficiency * 41253) / (hBeamDeg * vBeamDeg));
    },
    /**
     * Perte de dépointage (dB) — diagramme parabolique simplifié (UIT/3GPP) :
     * L = min(12·(Δθ/θ3dB)², Lmax).
     */
    pointingLossDb(errorDeg, beamwidthDeg, maxLossDb = 40) {
      if (!beamwidthDeg) return 0;
      return Math.min(12 * Math.pow(Math.abs(errorDeg) / beamwidthDeg, 2), maxLossDb);
    },
    /** Perte hors-secteur d'une antenne sectorielle BLR (rapport avant/arrière ≈ 25 dB). */
    sectorPatternLossDb(offAxisDeg, sectorWidthDeg) {
      return Math.min(12 * Math.pow(Math.abs(offAxisDeg) / sectorWidthDeg, 2), 25);
    },

    /* ---------------- Propagation ---------------- */

    /** Affaiblissement en espace libre (dB) : FSL = 92,45 + 20·log(d km) + 20·log(f GHz). */
    fslDb(dKm, fGHz) {
      return 92.45 + 20 * Math.log10(Math.max(dKm, 1e-4)) + 20 * Math.log10(fGHz);
    },
    fslStep(dKm, fGHz) {
      const v = RadioPhysics.fslDb(dKm, fGHz);
      return Util.step(
        'Affaiblissement en espace libre (FSL)',
        'FSL = 92,45 + 20·log(d) + 20·log(f)   [d en km, f en GHz]',
        `FSL = 92,45 + 20·log(${Util.fmt(dKm, 2)}) + 20·log(${f2(fGHz)}) = 92,45 + ${f2(20 * Math.log10(Math.max(dKm, 1e-4)))} + ${f2(20 * Math.log10(fGHz))}`,
        v,
        'dB'
      );
    },
    /** Atténuation spécifique des gaz (dB/km). */
    gasSpecificDbPerKm(fGHz) {
      return Util.interp(GAS_TABLE, fGHz);
    },

    /** Coefficients k et α de pluie (UIT-R P.838-3), interpolés en log(f). */
    rainCoefficients(fGHz, polarization = 'V') {
      const f = Util.clamp(fGHz, 1, 100);
      let i = 0;
      while (i < RAIN_COEFFS.length - 2 && RAIN_COEFFS[i + 1][0] < f) i++;
      const a = RAIN_COEFFS[i];
      const b = RAIN_COEFFS[i + 1];
      const t = (Math.log10(f) - Math.log10(a[0])) / (Math.log10(b[0]) - Math.log10(a[0]));
      const lerpLog = (ya, yb) => Math.pow(10, Math.log10(ya) + t * (Math.log10(yb) - Math.log10(ya)));
      const lerp = (ya, yb) => ya + t * (yb - ya);
      const kH = lerpLog(a[1], b[1]);
      const aH = lerp(a[2], b[2]);
      const kV = lerpLog(a[3], b[3]);
      const aV = lerp(a[4], b[4]);
      if (polarization === 'H') return { k: kH, alpha: aH };
      if (polarization === 'V') return { k: kV, alpha: aV };
      // Polarisation circulaire (satellite) : moyenne UIT-R P.838 (τ = 45°)
      const k = (kH + kV) / 2;
      const alpha = (kH * aH + kV * aV) / (2 * k);
      return { k, alpha };
    },
    /** Atténuation spécifique due à la pluie γR = k·R^α (dB/km). */
    rainSpecificDbPerKm(fGHz, rainMmH, polarization = 'V') {
      if (rainMmH <= 0) return 0;
      const { k, alpha } = RadioPhysics.rainCoefficients(fGHz, polarization);
      return k * Math.pow(rainMmH, alpha);
    },
    /**
     * Longueur effective du trajet sous la pluie (km) :
     * d_eff = d / (1 + d/d0), avec d0 = 35·e^(−0,015·R) (UIT-R P.530, R ≤ 100 mm/h).
     * Les cellules orageuses ne couvrent pas tout le bond.
     */
    rainEffectivePathKm(dKm, rainMmH) {
      if (rainMmH <= 0) return 0;
      const d0 = 35 * Math.exp(-0.015 * Math.min(rainMmH, 100));
      return dKm / (1 + dKm / d0);
    },
    /** Atténuation totale due à la pluie sur un bond terrestre, avec étapes. */
    rainAttenuation(dKm, fGHz, rainMmH, polarization = 'V') {
      const pol = polarization === 'H' ? 'H' : 'V';
      const { k, alpha } = RadioPhysics.rainCoefficients(fGHz, pol);
      const gamma = RadioPhysics.rainSpecificDbPerKm(fGHz, rainMmH, pol);
      const d0 = 35 * Math.exp(-0.015 * Math.min(rainMmH, 100));
      const deff = RadioPhysics.rainEffectivePathKm(dKm, rainMmH);
      const total = gamma * deff;
      const steps = [];
      if (rainMmH > 0) {
        steps.push(
          Util.step(
            'Atténuation spécifique de la pluie',
            'γR = k·R^α   (UIT-R P.838)',
            `γR = ${Util.fmt(k, 5)} × ${f1(rainMmH)}^${Util.fmt(alpha, 4)}   (polar. ${pol})`,
            gamma,
            'dB/km'
          ),
          Util.step(
            'Longueur effective sous la pluie',
            'd_eff = d / (1 + d/d0)   avec d0 = 35·e^(−0,015·R)',
            `d0 = ${f2(d0)} km ; d_eff = ${f2(dKm)} / (1 + ${f2(dKm)}/${f2(d0)})`,
            deff,
            'km'
          ),
          Util.step('Atténuation due à la pluie', 'A_pluie = γR × d_eff', `A_pluie = ${f2(gamma)} × ${f2(deff)}`, total, 'dB')
        );
      }
      return { gamma, deff, total, k, alpha, steps };
    },

    /**
     * XPD (découplage de polarisation) dégradé par la pluie — UIT-R P.530 :
     * XPD = U − V·log(A), U = 15 + 30·log(f), V = 12,8·f^0,19 (8 ≤ f ≤ 20 GHz) ou 22,6 (20 < f ≤ 35 GHz).
     */
    xpdUnderRainDb(fGHz, rainAttDb) {
      if (rainAttDb <= 1) return ANTENNA_XPD_DB;
      const f = Util.clamp(fGHz, 8, 35);
      const U = 15 + 30 * Math.log10(f);
      const V = f <= 20 ? 12.8 * Math.pow(f, 0.19) : 22.6;
      return Math.min(ANTENNA_XPD_DB, U - V * Math.log10(rainAttDb));
    },

    /* ---------------- Fresnel & profil de terrain ---------------- */

    /** Rayon de la 1ère zone de Fresnel (m) : r1 = 17,32·√(d1·d2 / (f·d)). */
    fresnelRadiusM(d1Km, d2Km, fGHz) {
      const d = d1Km + d2Km;
      if (d <= 0 || d1Km <= 0 || d2Km <= 0) return 0;
      return 17.32 * Math.sqrt((d1Km * d2Km) / (fGHz * d));
    },
    /** Renflement terrestre (m) : h = d1·d2 / (12,74·k). */
    earthBulgeM(d1Km, d2Km, k = K_FACTOR_DEFAULT) {
      return (d1Km * d2Km) / (12.74 * k);
    },
    /** Perte de diffraction en arête unique (UIT-R P.526) en fonction du paramètre ν. */
    knifeEdgeLossDb(nu) {
      if (nu <= -0.78) return 0;
      return 6.9 + 20 * Math.log10(Math.sqrt(Math.pow(nu - 0.1, 2) + 1) + nu - 0.1);
    },

    /**
     * Hauteur d'un obstacle (m) à la distance x (km) depuis A.
     * Types : 'hill' (colline, profil en cosinus), 'building' (bâtiment, bloc plat),
     *         'forest' (forêt, bloc plat).
     */
    obstacleHeightAt(obstacle, xKm) {
      const half = Math.max(obstacle.widthKm || 0.5, 0.01) / 2;
      const dx = Math.abs(xKm - obstacle.dKm);
      if (dx > half) return 0;
      if (obstacle.type === 'hill') {
        return obstacle.heightM * 0.5 * (1 + Math.cos((Math.PI * dx) / half));
      }
      return obstacle.heightM;
    },

    /**
     * Construit le profil de terrain d'un bond et analyse le dégagement de Fresnel.
     * @param {object} p
     *   distanceKm, fGHz, k (facteur k),
     *   siteA {groundM, antennaM}, siteB {groundM, antennaM},
     *   obstacles [{dKm, heightM, widthKm, type, name}], samples
     * @returns {object} points[], minRatio, worst, diffractionLossDb, verdict,
     *                   requiredRaise60M, requiredRaise100M, steps[]
     */
    buildProfile(p) {
      const d = Math.max(p.distanceKm, 0.01);
      const f = p.fGHz;
      const k = p.k || K_FACTOR_DEFAULT;
      const n = p.samples || 200;
      const gA = p.siteA.groundM || 0;
      const gB = p.siteB.groundM || 0;
      const hA = gA + p.siteA.antennaM;
      const hB = gB + p.siteB.antennaM;
      const obstacles = p.obstacles || [];
      const points = [];
      let minRatio = Infinity;
      let worst = null;
      let raise60 = 0;
      let raise100 = 0;

      for (let i = 0; i <= n; i++) {
        const x = (d * i) / n;
        const d1 = x;
        const d2 = d - x;
        const baseGround = gA + ((gB - gA) * x) / d;
        let obst = 0;
        let obstName = '';
        let obstType = '';
        for (const o of obstacles) {
          const h = RadioPhysics.obstacleHeightAt(o, x);
          if (h > obst) {
            obst = h;
            obstName = o.name || '';
            obstType = o.type || 'hill';
          }
        }
        const ground = baseGround + obst;
        const bulge = RadioPhysics.earthBulgeM(d1, d2, k);
        const terrain = ground + bulge; // terrain "vu" par l'onde (avec courbure k)
        const los = hA + ((hB - hA) * x) / d;
        const r1 = RadioPhysics.fresnelRadiusM(d1, d2, f);
        const clearance = los - terrain;
        const ratio = r1 > 0 ? clearance / r1 : Infinity;
        const pt = { x, ground, baseGround, obstacle: obst, obstacleName: obstName, obstacleType: obstType, bulge, terrain, los, r1, clearance, ratio };
        points.push(pt);
        if (i > 0 && i < n) {
          if (ratio < minRatio) {
            minRatio = ratio;
            worst = pt;
          }
          // Surélévation uniforme des deux antennes nécessaire pour atteindre 60 % / 100 %
          raise60 = Math.max(raise60, 0.6 * r1 - clearance);
          raise100 = Math.max(raise100, 1.0 * r1 - clearance);
        }
      }

      // Diffraction sur le point le plus critique : ν = −√2 · (dégagement / r1)
      const nu = worst ? -Math.SQRT2 * worst.ratio : -10;
      const diffractionLossDb = RadioPhysics.knifeEdgeLossDb(nu);

      let verdict;
      if (minRatio >= 1) verdict = 'clear100';
      else if (minRatio >= 0.6) verdict = 'clear60';
      else if (minRatio >= 0) verdict = 'partial';
      else verdict = 'blocked';

      const steps = [];
      if (worst) {
        steps.push(
          Util.step(
            'Rayon de la 1ère zone de Fresnel (point critique)',
            'r1 = 17,32·√(d1·d2 / (f·d))   [m, km, GHz]',
            `r1 = 17,32·√(${f2(worst.x)} × ${f2(d - worst.x)} / (${f2(f)} × ${f2(d)}))`,
            worst.r1,
            'm'
          ),
          Util.step(
            'Renflement terrestre (courbure, k = ' + Util.fmt(k, 2) + ')',
            'h = d1·d2 / (12,74·k)',
            `h = ${f2(worst.x)} × ${f2(d - worst.x)} / (12,74 × ${Util.fmt(k, 2)})`,
            worst.bulge,
            'm'
          ),
          Util.step(
            'Dégagement au point critique',
            'dégagement = h_LOS − (sol + obstacle + renflement)',
            `dégagement = ${f1(worst.los)} − (${f1(worst.ground)} + ${f1(worst.bulge)})`,
            worst.clearance,
            'm'
          ),
          Util.step(
            'Taux de dégagement de la 1ère zone de Fresnel',
            'taux = dégagement / r1   (objectif ≥ 60 %, idéal 100 %)',
            `taux = ${f1(worst.clearance)} / ${f1(worst.r1)}`,
            worst.ratio * 100,
            '%'
          ),
          Util.step(
            'Perte de diffraction (arête unique, UIT-R P.526)',
            'ν = −√2·taux ; J(ν) = 6,9 + 20·log(√((ν−0,1)²+1) + ν − 0,1) si ν > −0,78',
            `ν = ${f2(nu)}`,
            diffractionLossDb,
            'dB'
          )
        );
      }

      return {
        points,
        distanceKm: d,
        fGHz: f,
        k,
        hA,
        hB,
        minRatio,
        worst,
        nu,
        diffractionLossDb,
        verdict,
        requiredRaise60M: Math.max(0, raise60),
        requiredRaise100M: Math.max(0, raise100),
        steps,
      };
    },

    /* ---------------- Bruit, seuils, capacité ---------------- */

    /** Débit symbole (Msymb/s) pour une largeur de canal (MHz). */
    symbolRateMsps(channelMHz, kind = 'FH') {
      return kind === 'BLR' ? channelMHz * BLR_OFDM_EFFICIENCY : channelMHz / (1 + FH_ROLLOFF);
    },
    /** Puissance de bruit thermique du récepteur (dBm) : N = −174 + 10·log(B) + NF. */
    noiseFloorDbm(channelMHz, nfDb, kind = 'FH') {
      const b = RadioPhysics.symbolRateMsps(channelMHz, kind) * 1e6;
      return NOISE_DENSITY_DBM_HZ + 10 * Math.log10(b) + nfDb;
    },
    /** Capacité radio (Mbit/s) d'une modulation sur un canal. */
    capacityMbps(mod, channelMHz, kind = 'FH') {
      const rs = RadioPhysics.symbolRateMsps(channelMHz, kind);
      return kind === 'BLR' ? rs * mod.bits : rs * mod.bits * FH_CODE_EFFICIENCY;
    },
    /** Tableau des seuils de réception par modulation. */
    thresholdTable(channelMHz, nfDb, kind = 'FH') {
      const noise = RadioPhysics.noiseFloorDbm(channelMHz, nfDb, kind);
      return RadioPhysics.getModTable(kind).map((m) => ({
        id: m.id,
        bits: m.bits,
        snr: m.snr,
        thresholdDbm: noise + m.snr,
        capacityMbps: RadioPhysics.capacityMbps(m, channelMHz, kind),
      }));
    },
    /** Combinaison de rapports signal/bruit et signal/interférence (dB). */
    combineSnrDb(...ratiosDb) {
      const inv = ratiosDb.filter((r) => Number.isFinite(r)).reduce((s, r) => s + Math.pow(10, -r / 10), 0);
      return inv > 0 ? -10 * Math.log10(inv) : Infinity;
    },

    /* ---------------- Disponibilité (UIT-R P.530) ---------------- */

    CLIMATES,
    getClimate(id) {
      return CLIMATES.find((c) => c.id === id) || CLIMATES[1];
    },

    /**
     * Pourcentage du mois le plus défavorable où la profondeur d'évanouissement A est dépassée
     * (UIT-R P.530 § 2.3.2, toutes profondeurs : éq. 12 à 18).
     */
    multipathWorstMonthPct(p0, A) {
      const At = 25 + 1.2 * Math.log10(p0);
      if (A >= At) return p0 * Math.pow(10, -A / 10);
      const pt = p0 * Math.pow(10, -At / 10);
      const qaP = (-20 * Math.log10(-Math.log((100 - Math.min(pt, 99.999)) / 100))) / At;
      const qt = (qaP - 2) / ((1 + 0.3 * Math.pow(10, -At / 20)) * Math.pow(10, -0.016 * At)) - 4.3 * (Math.pow(10, -At / 20) + At / 800);
      const a = Math.max(A, 0);
      const qa = 2 + (1 + 0.3 * Math.pow(10, -a / 20)) * Math.pow(10, -0.016 * a) * (qt + 4.3 * (Math.pow(10, -a / 20) + a / 800));
      return 100 * (1 - Math.exp(-Math.pow(10, (-qa * a) / 20)));
    },

    /**
     * Évanouissements par trajets multiples (UIT-R P.530 méthode de planification rapide).
     * @param {object} p dKm, fGHz, heA, heB (altitudes des antennes, m), dN1, latDeg, marginDb
     */
    multipathFading(p) {
      const d = Math.max(p.dKm, 0.5);
      const f = p.fGHz;
      const K = Math.pow(10, -4.6 - 0.0027 * p.dN1);
      const eps = Math.abs(p.heB - p.heA) / d;
      const hL = Math.min(p.heA, p.heB);
      const p0 = K * Math.pow(d, 3.1) * Math.pow(1 + eps, -1.29) * Math.pow(f, 0.8) * Math.pow(10, -0.00089 * hL);
      const A = p.marginDb;
      const At = 25 + 1.2 * Math.log10(p0);
      const pw = RadioPhysics.multipathWorstMonthPct(p0, A);
      const lat = Math.abs(p.latDeg || 12);
      const c2 = Math.pow(Math.abs(Math.cos((2 * lat * Math.PI) / 180)), 0.7);
      const dG = Math.min(10.8, 10.5 - 5.6 * Math.log10(1.1 + (lat <= 45 ? c2 : -c2)) - 2.7 * Math.log10(d) + 1.7 * Math.log10(1 + eps));
      const toYear = Math.pow(10, -dG / 10);
      const steps = [
        Util.step('Facteur géoclimatique K', 'K = 10^(−4,6 − 0,0027·dN1)   (UIT-R P.530, éq. 5)', `dN1 = ${f1(p.dN1)} N/km`, K * 1e4, '×10⁻⁴'),
        Util.step('Inclinaison du trajet |εp|', '|εp| = |hr − he| / d   (altitudes des antennes)', `|εp| = |${f1(p.heB)} − ${f1(p.heA)}| / ${f2(d)}`, eps, 'mrad'),
        Util.step(
          'Facteur d’occurrence des trajets multiples p0',
          'p0 = K · d^3,1 · (1 + |εp|)^−1,29 · f^0,8 · 10^(−0,00089·hL)   (éq. 11)',
          `d = ${f2(d)} km · f = ${f2(f)} GHz · hL = ${f1(hL)} m`,
          p0,
          '%',
          p0 > 10 ? 'Valeur élevée : bond long et bas, climat chaud et humide → évanouissements fréquents.' : ''
        ),
        Util.step(
          'Évanouissement dépassé pendant le mois le plus défavorable',
          A >= At ? 'pw = p0 · 10^(−A/10)   (A ≥ At = 25 + 1,2·log p0)' : 'A < At : méthode d’interpolation pour faibles profondeurs (éq. 14 à 18)',
          `A = marge = ${f1(A)} dB · At = ${f1(At)} dB`,
          pw,
          '%'
        ),
        Util.step(
          'Conversion mois défavorable → année moyenne',
          'ΔG = 10,5 − 5,6·log(1,1 ± |cos 2ξ|^0,7) − 2,7·log d + 1,7·log(1 + |εp|) ; p = pw · 10^(−ΔG/10)',
          `ξ = ${f1(lat)}° · ΔG = ${f2(dG)} dB`,
          pw * toYear,
          '%'
        ),
      ];
      return { K, eps, hL, p0, At, pwPct: pw, deltaG: dG, toYear, pYearPct: pw * toYear, steps };
    },

    /**
     * Amélioration par diversité d'espace (UIT-R P.530 § 6.2.4, éq. 155 à 157).
     * @param {object} p p0 (%), dKm, fGHz, sM (écart vertical), marginDb, vDb (écart de gains)
     */
    spaceDiversity(p) {
      const P0 = p.p0 / 100;
      const eta = 1 - Math.exp(-0.2 * Math.pow(P0, 0.75));
      const k2 = Math.exp((-0.0004 * Math.pow(p.sM, 0.87) * Math.pow(p.fGHz, -0.12) * Math.pow(p.dKm, 0.48) * Math.pow(p.p0, -0.04)) / eta);
      const A = p.marginDb;
      const raw = ((100 * eta) / p.p0) * (1 - k2 * (1 - (p.p0 / (100 * eta)) * Math.pow(10, -A / 10))) * Math.pow(10, (A - p.vDb) / 10);
      const I = Util.clamp(raw, 1, 200);
      const steps = [
        Util.step('Activité des trajets multiples η', 'η = 1 − exp(−0,2 · P0^0,75)   avec P0 = p0 / 100', `P0 = ${Util.fmt(P0, 3)}`, eta, ''),
        Util.step(
          'Corrélation entre les deux antennes k²',
          'k² = exp(−0,0004 · S^0,87 · f^−0,12 · d^0,48 · p0^−0,04 / η)   (éq. 155)',
          `S = ${f1(p.sM)} m · f = ${f2(p.fGHz)} GHz · d = ${f2(p.dKm)} km`,
          k2,
          '',
          'Plus les antennes sont écartées, plus k² est faible : leurs évanouissements deviennent indépendants.'
        ),
        Util.step(
          'Facteur d’amélioration I',
          'I = (100η/p0)·[1 − k²·(1 − p0/(100η)·10^(−A/10))]·10^((A − V)/10)   (éq. 156)',
          `A = ${f1(A)} dB · V = |G1 − G2| = ${f1(p.vDb)} dB`,
          I,
          '',
          raw > 200 ? 'Plafonné à 200 (limite pratique).' : 'Le temps de coupure par trajets multiples est divisé par I.'
        ),
      ];
      return { P0, eta, k2, I, steps };
    },

    /**
     * Pourcentage annuel du temps où la pluie dépasse la marge (UIT-R P.530 § 2.4.1, éq. 34 à 36).
     */
    rainOutage(p) {
      const a001 = RadioPhysics.rainAttenuation(p.dKm, p.fGHz, p.r001, p.polarization).total;
      const C0 = p.fGHz >= 10 ? 0.12 + 0.4 * Math.log10(Math.pow(p.fGHz / 10, 0.8)) : 0.12;
      const C1 = Math.pow(0.07, C0) * Math.pow(0.12, 1 - C0);
      const C2 = 0.855 * C0 + 0.546 * (1 - C0);
      const C3 = 0.139 * C0 + 0.043 * (1 - C0);
      const ap = (pp) => a001 * C1 * Math.pow(pp, -(C2 + C3 * Math.log10(pp)));
      let pct;
      if (a001 <= 0) pct = 0;
      else if (p.marginDb >= ap(0.001)) pct = 0.001 * Math.pow(10, -(p.marginDb - ap(0.001)) / 10);
      else if (p.marginDb <= ap(1)) pct = 1;
      else {
        let lo = Math.log10(0.001);
        let hi = 0;
        for (let i = 0; i < 50; i++) {
          const mid = (lo + hi) / 2;
          if (ap(Math.pow(10, mid)) > p.marginDb) lo = mid;
          else hi = mid;
        }
        pct = Math.pow(10, (lo + hi) / 2);
      }
      return {
        a001,
        pct,
        steps: [
          Util.step('Atténuation dépassée 0,01 % du temps', 'A0,01 = γ(R0,01) · d_eff', `R0,01 = ${f1(p.r001)} mm/h`, a001, 'dB'),
          Util.step(
            'Pourcentage annuel où la pluie dépasse la marge',
            'A_p / A0,01 = C1 · p^−(C2 + C3·log p)   (éq. 34), résolu pour A_p = marge',
            `marge = ${f1(p.marginDb)} dB · C1 = ${f2(C1)} · C2 = ${Util.fmt(C2, 3)} · C3 = ${Util.fmt(C3, 3)}`,
            pct,
            '%'
          ),
        ],
      };
    },

    /**
     * Disponibilité annuelle par modulation (trajets multiples + pluie, diversité d'espace éventuelle).
     * @param {object} p dKm, fGHz, polarization, heA, heB, dN1, r001, latDeg, rslClearDbm, noiseDbm,
     *   interferenceDbm (ou null), thresholds (table des seuils), maxModulation (id), acm,
     *   diversity { sM, vDb } ou null, objectivePct
     */
    computeAvailability(p) {
      const floor = Number.isFinite(p.interferenceDbm) ? 10 * Math.log10(Math.pow(10, p.noiseDbm / 10) + Math.pow(10, p.interferenceDbm / 10)) : p.noiseDbm;
      const maxIdx = Math.max(0, p.thresholds.findIndex((t) => t.id === p.maxModulation));
      const rows = p.thresholds.slice(0, maxIdx + 1).map((t) => {
        const margin = p.rslClearDbm - (t.snr + floor);
        const mp = RadioPhysics.multipathFading(Object.assign({}, p, { marginDb: margin }));
        const div = p.diversity ? RadioPhysics.spaceDiversity({ p0: mp.p0, dKm: p.dKm, fGHz: p.fGHz, sM: p.diversity.sM, marginDb: margin, vDb: p.diversity.vDb }) : null;
        const multipathPct = mp.pYearPct / (div ? div.I : 1);
        const rn = RadioPhysics.rainOutage({ dKm: p.dKm, fGHz: p.fGHz, r001: p.r001, polarization: p.polarization, marginDb: margin });
        // Marge négative : la modulation n'est jamais disponible, même par ciel clair
        const total = margin <= 0 ? 100 : Math.min(100, multipathPct + rn.pct);
        return { id: t.id, capacityMbps: t.capacityMbps, thresholdDbm: t.snr + floor, margin, mp, div, multipathPct, rainPct: rn.pct, rain: rn, totalPct: total, availPct: 100 - total, downtimeS: (total / 100) * SECONDS_PER_YEAR };
      });
      const nominal = rows[rows.length - 1];
      const link = p.acm !== false ? rows[0] : nominal;
      const objective = p.objectivePct || 99.99;
      const steps = [
        Util.step(
          `Marge pour la modulation de référence ${nominal.id}`,
          Number.isFinite(p.interferenceDbm) ? 'M = RSL ciel clair − (C/N requis + N ⊕ I)   (seuil dégradé par l’interférence)' : 'M = RSL ciel clair − seuil',
          `M = ${f2(p.rslClearDbm)} − (${f2(nominal.thresholdDbm)})`,
          nominal.margin,
          'dB'
        ),
      ]
        .concat(nominal.mp.steps)
        .concat(nominal.div ? nominal.div.steps.concat([Util.step('Trajets multiples avec diversité', 'p_SD = p / I', `${Util.fmt(nominal.mp.pYearPct, 5)} / ${f1(nominal.div.I)}`, nominal.multipathPct, '%')]) : [])
        .concat(nominal.rain.steps)
        .concat([
          Util.step(
            'Indisponibilité annuelle totale',
            'p_total = p_trajets multiples + p_pluie',
            `${Util.fmt(nominal.multipathPct, 5)} + ${Util.fmt(nominal.rainPct, 5)}`,
            nominal.totalPct,
            '%',
            `Soit ${RadioPhysics.downtimeText(nominal.downtimeS)} par an. Disponibilité = ${Util.fmt(nominal.availPct, 4)} % (objectif ${Util.fmt(objective, 3)} %).`
          ),
        ]);
      return { rows, nominal, link, objective, meets: nominal.availPct >= objective, steps };
    },
    /** Durée lisible (s → « 12 min 30 s », « 3 h 05 min »). */
    downtimeText(sec) {
      const s = Math.round(sec);
      if (s < 60) return s + ' s';
      if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
      const m = Math.round(s / 60);
      return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
    },

    /* ---------------- Plan de fréquences et interférences ---------------- */

    FH_CHANNELS_PER_HALF,
    OFFAXIS_XPD_DB,
    /** Fréquence d'émission (GHz) d'un canal : demi-bande basse ou haute, canal n (1 à 8). */
    fhChannelGHz(bandId, half, channelNo, channelMHz) {
      const band = RadioPhysics.getFhBand(bandId);
      const duplex = FH_DUPLEX_GHZ[band.id] || 0.3;
      const n = Util.clamp(Math.round(channelNo) || 1, 1, FH_CHANNELS_PER_HALF);
      return band.f + (half === 'high' ? duplex / 2 : -duplex / 2) + ((n - (FH_CHANNELS_PER_HALF + 1) / 2) * channelMHz) / 1000;
    },
    /**
     * Diagramme de rayonnement de référence d'une parabole (UIT-R F.699), gain hors axe en dBi.
     */
    dishOffAxisGainDbi(diameterM, fGHz, offDeg) {
      const lambda = RadioPhysics.wavelengthM(fGHz);
      const dl = diameterM / lambda;
      const gmax = RadioPhysics.dishGainDbi(diameterM, fGHz);
      const phi = Math.min(180, Math.abs(offDeg));
      const g1 = 2 + 15 * Math.log10(dl);
      const phiM = (20 / dl) * Math.sqrt(Math.max(gmax - g1, 0));
      if (phi < phiM) return gmax - 2.5e-3 * Math.pow(dl * phi, 2);
      if (dl > 100) {
        const phiR = 15.85 * Math.pow(dl, -0.6);
        if (phi < phiR) return g1;
        if (phi < 48) return 32 - 25 * Math.log10(phi);
        return -10;
      }
      const phiR = 100 / dl;
      if (phi < phiR) return g1;
      if (phi < 48) return 52 - 10 * Math.log10(dl) - 25 * Math.log10(phi);
      return 10 - 10 * Math.log10(dl);
    },
    /** Discrimination de filtrage selon l'écart de fréquence (MHz) et la largeur de canal (MHz). */
    nfd(deltaMHz, channelMHz) {
      const r = Math.abs(deltaMHz) / Math.max(channelMHz, 1);
      return NFD_TABLE.find((x) => r < x.maxRatio) || null;
    },
    /**
     * Niveau d'un brouilleur au récepteur (dBm).
     * @param {object} p txDbm, lossTxDb, diamTxM, offTxDeg, dKm, fGHz, diamRxM, offRxDeg, lossRxDb,
     *   nfdDb, xpdDb, rainDb
     */
    interferenceLevelDbm(p) {
      const gTx = RadioPhysics.dishOffAxisGainDbi(p.diamTxM, p.fGHz, p.offTxDeg);
      const gRx = RadioPhysics.dishOffAxisGainDbi(p.diamRxM, p.fGHz, p.offRxDeg);
      const fsl = RadioPhysics.fslDb(p.dKm, p.fGHz);
      const gas = RadioPhysics.gasSpecificDbPerKm(p.fGHz) * p.dKm;
      const i = p.txDbm - p.lossTxDb + gTx - fsl - gas - (p.rainDb || 0) + gRx - p.lossRxDb - p.nfdDb - p.xpdDb;
      return { iDbm: i, gTx, gRx, fsl };
    },
    /** Somme de puissances (dBm). */
    sumDbm(list) {
      const s = list.reduce((a, v) => a + Math.pow(10, v / 10), 0);
      return s > 0 ? 10 * Math.log10(s) : -Infinity;
    },

    /* ---------------- Bilan de liaison complet ---------------- */

    /**
     * Bilan de liaison FH ou BLR avec pluie, gaz, diffraction, dépointage, ACM et XPIC.
     * @param {object} p
     *   kind 'FH' | 'BLR', fGHz, distanceKm, txPowerDbm,
     *   gTxDbi, gRxDbi, lossTxDb, lossRxDb (guides d'onde / branchement),
     *   rainMmH, polarization 'V' | 'H',
     *   channelMHz, nfDb, maxModulation (id), acm (bool),
     *   dualPol (bool, transmission V+H co-canal), xpic (bool),
     *   diffractionLossDb, pointingLossDb, extraLossDb, extraLossLabel
     */
    computeLinkBudget(p) {
      const kind = p.kind === 'BLR' ? 'BLR' : 'FH';
      const table = RadioPhysics.getModTable(kind);
      const steps = [];
      const lossTx = p.lossTxDb || 0;
      const lossRx = p.lossRxDb || 0;
      const diff = p.diffractionLossDb || 0;
      const pointing = p.pointingLossDb || 0;
      const extra = p.extraLossDb || 0;
      const rainRate = p.rainMmH || 0;
      const pol = p.polarization === 'H' ? 'H' : 'V';

      // 1. PIRE
      const eirp = p.txPowerDbm - lossTx + p.gTxDbi;
      steps.push(
        Util.step(
          "PIRE (Puissance Isotrope Rayonnée Équivalente)",
          'PIRE = Ptx − Lbranch,tx + Gtx',
          `PIRE = ${f1(p.txPowerDbm)} − ${f1(lossTx)} + ${f2(p.gTxDbi)}`,
          eirp,
          'dBm'
        )
      );

      // 2. FSL
      const fsl = RadioPhysics.fslDb(p.distanceKm, p.fGHz);
      steps.push(RadioPhysics.fslStep(p.distanceKm, p.fGHz));

      // 3. Gaz
      const gasSpec = RadioPhysics.gasSpecificDbPerKm(p.fGHz);
      const gas = gasSpec * p.distanceKm;
      steps.push(
        Util.step(
          'Absorption atmosphérique (O₂ + vapeur d’eau)',
          'A_gaz = γ_gaz × d',
          `A_gaz = ${Util.fmt(gasSpec, 3)} × ${f2(p.distanceKm)}`,
          gas,
          'dB'
        )
      );

      // 4. Pluie
      const rain = RadioPhysics.rainAttenuation(p.distanceKm, p.fGHz, rainRate, pol);
      steps.push(...rain.steps);

      // 5. Pertes additionnelles
      if (diff > 0.01) {
        steps.push(Util.step('Perte de diffraction (obstacle dans Fresnel)', 'A_diff (voir profil)', '', diff, 'dB'));
      }
      if (pointing > 0.01) {
        steps.push(Util.step("Perte de dépointage d'antenne", 'L = 12·(Δθ/θ3dB)²', '', pointing, 'dB'));
      }
      if (extra > 0.01) {
        steps.push(Util.step(p.extraLossLabel || 'Pertes additionnelles', '', '', extra, 'dB'));
      }

      // 6. RSL (une panne cachée ajoute une perte non affichée : seul l'écart mesure / calcul est visible)
      // hidden > 0 : perte d'une panne cachée ; < 0 possible en recette réaliste (réseau réel meilleur que le calcul)
      const hidden = Number.isFinite(p.hiddenLossDb) ? p.hiddenLossDb : 0;
      const pathLossClear = fsl + gas + diff + pointing + extra;
      const rslCalcClear = eirp - pathLossClear + p.gRxDbi - lossRx;
      const rslClear = rslCalcClear - hidden;
      const rsl = rslClear - rain.total;
      steps.push(
        Util.step(
          Math.abs(hidden) > 0.3 ? 'Niveau de réception RSL calculé' : 'Niveau de réception RSL',
          'RSL = PIRE − FSL − A_gaz − A_pluie − A_autres + Grx − Lbranch,rx',
          `RSL = ${f2(eirp)} − ${f2(fsl)} − ${f2(gas)} − ${f2(rain.total)} − ${f2(diff + pointing + extra)} + ${f2(p.gRxDbi)} − ${f1(lossRx)}`,
          rsl + hidden,
          'dBm'
        )
      );
      if (Math.abs(hidden) > 0.3) {
        steps.push(
          Util.step(
            'RSL mesuré sur l’équipement de réception',
            'lecture de l’AGC / de l’interface de supervision',
            `écart avec le calcul : ${hidden > 0 ? '−' : '+'}${f1(Math.abs(hidden))} dB`,
            rsl,
            'dBm',
            hidden > 3
              ? 'Le niveau mesuré est inférieur au calcul : une anomalie est à localiser (équipement, branchement, câblage, pointage…).'
              : 'Valeur réelle lue sur l’équipement : à comparer au calcul dans la fiche de recette.'
          )
        );
      }

      // 7. Bruit et SNR
      const rs = RadioPhysics.symbolRateMsps(p.channelMHz, kind);
      const noise = RadioPhysics.noiseFloorDbm(p.channelMHz, p.nfDb, kind);
      steps.push(
        Util.step(
          'Bruit thermique du récepteur',
          'N = −174 + 10·log(B) + NF   (B = débit symbole en Hz)',
          `N = −174 + 10·log(${f2(rs)}·10⁶) + ${f1(p.nfDb)}`,
          noise,
          'dBm'
        )
      );
      const snr = rsl - noise;
      steps.push(Util.step('Rapport signal/bruit', 'C/N = RSL − N', `C/N = ${f2(rsl)} − (${f2(noise)})`, snr, 'dB'));

      // 8. Interférence de polarisation croisée (double polarisation co-canal)
      let sinr = snr;
      let xpdDb = null;
      let ciXpolDb = null;
      if (p.dualPol) {
        xpdDb = RadioPhysics.xpdUnderRainDb(p.fGHz, rain.total);
        ciXpolDb = xpdDb + (p.xpic ? XPIC_IMPROVEMENT_DB : 0);
        steps.push(
          Util.step(
            'Découplage de polarisation (XPD) sous la pluie',
            'XPD = U − V·log(A_pluie)   (UIT-R P.530), plafonné à XPD antenne',
            rain.total > 1 ? `A_pluie = ${f2(rain.total)} dB` : 'Ciel clair : XPD = XPD de l’antenne',
            xpdDb,
            'dB'
          ),
          Util.step(
            p.xpic ? 'C/I polarisation croisée après XPIC' : 'C/I polarisation croisée (XPIC désactivé !)',
            p.xpic ? 'C/I = XPD + XPIF (gain XPIC)' : 'C/I = XPD',
            p.xpic ? `C/I = ${f2(xpdDb)} + ${f1(XPIC_IMPROVEMENT_DB)}` : `C/I = ${f2(xpdDb)}`,
            ciXpolDb,
            'dB'
          )
        );
        sinr = RadioPhysics.combineSnrDb(snr, ciXpolDb);
        steps.push(
          Util.step('Rapport signal/(bruit + interférence)', 'C/(N+I) = −10·log(10^(−C/N/10) + 10^(−C/I/10))', '', sinr, 'dB')
        );
      }

      // 8b. Interférence externe (plan de fréquences)
      let ciExtDb = null;
      if (Number.isFinite(p.interferenceDbm)) {
        ciExtDb = rsl - p.interferenceDbm;
        steps.push(
          Util.step(
            'Brouillage par d’autres liaisons (plan de fréquences)',
            'I = Σ des brouilleurs (voir tableau des interférences) ; C/I = RSL − I',
            `C/I = ${f2(rsl)} − (${f2(p.interferenceDbm)})`,
            ciExtDb,
            'dB',
            ciExtDb < 30 ? 'C/I inférieur à 30 dB : les modulations élevées sont dégradées.' : 'C/I suffisant (≥ 30 dB).'
          )
        );
        sinr = RadioPhysics.combineSnrDb(sinr, ciExtDb);
        steps.push(Util.step('Rapport signal/(bruit + interférences)', 'C/(N+I) = −10·log(10^(−C/N/10) + 10^(−C/I/10))', '', sinr, 'dB'));
      }

      // 9. Choix de la modulation (ACM)
      const thresholds = RadioPhysics.thresholdTable(p.channelMHz, p.nfDb, kind);
      const maxIdx = Math.max(
        0,
        table.findIndex((m) => m.id === p.maxModulation)
      );
      const maxMod = thresholds[maxIdx];
      let activeIdx = -1;
      if (p.acm !== false) {
        for (let i = maxIdx; i >= 0; i--) {
          if (sinr >= thresholds[i].snr) {
            activeIdx = i;
            break;
          }
        }
      } else if (sinr >= maxMod.snr) {
        activeIdx = maxIdx;
      }
      const active = activeIdx >= 0 ? thresholds[activeIdx] : null;
      const polFactor = p.dualPol ? 2 : 1;
      const capacity = active ? active.capacityMbps * polFactor : 0;
      const maxCapacity = maxMod.capacityMbps * polFactor;

      // Marges
      const fadeMarginRef = rslClear - maxMod.thresholdDbm; // marge au fading ciel clair (modulation de référence)
      const marginActive = active ? rsl - active.thresholdDbm : rsl - thresholds[0].thresholdDbm;
      const marginToCut = rsl - thresholds[0].thresholdDbm; // marge restante avant coupure (QPSK)
      steps.push(
        Util.step(
          'Marge au fading (ciel clair, modulation de référence ' + maxMod.id + ')',
          'M = RSL_ciel clair − Seuil_réf',
          `M = ${f2(rslClear)} − (${f2(maxMod.thresholdDbm)})`,
          fadeMarginRef,
          'dB',
          fadeMarginRef >= 25 ? 'Objectif typique ≥ 25 dB atteint.' : 'Marge inférieure à l’objectif typique de 25 dB.'
        )
      );

      let status;
      if (!active) status = 'down';
      else if (activeIdx < maxIdx) status = 'degraded';
      else status = 'optimal';

      if (active) {
        steps.push(
          Util.step(
            'Modulation active ' + (p.acm !== false ? '(ACM)' : '(fixe)'),
            'plus haute modulation telle que C/(N+I) ≥ C/N requis',
            `${f2(sinr)} dB ≥ ${f1(active.snr)} dB requis pour ${active.id}`,
            capacity,
            'Mbit/s',
            p.dualPol ? 'Capacité doublée : deux polarisations (V+H) sur le même canal.' : ''
          )
        );
      } else {
        steps.push(
          Util.step(
            'Liaison coupée',
            'C/(N+I) < C/N requis ' + (p.acm !== false ? 'en QPSK' : 'pour la modulation fixe'),
            `${f2(sinr)} dB < ${f1(p.acm !== false ? thresholds[0].snr : maxMod.snr)} dB`,
            0,
            'Mbit/s'
          )
        );
      }

      return {
        kind,
        eirp,
        fsl,
        gas,
        rain: rain.total,
        rainGamma: rain.gamma,
        rainDeff: rain.deff,
        diffraction: diff,
        pointing,
        extra,
        rslClear,
        rsl,
        rslCalc: rsl + hidden,
        hiddenLossDb: hidden,
        noise,
        snr,
        xpdDb,
        ciXpolDb,
        ciExtDb,
        interferenceDbm: Number.isFinite(p.interferenceDbm) ? p.interferenceDbm : null,
        sinr,
        thresholds,
        maxModulation: maxMod,
        activeModulation: active,
        capacityMbps: capacity,
        maxCapacityMbps: maxCapacity,
        fadeMarginRef,
        marginActive,
        marginToCut,
        status,
        steps,
      };
    },

    /**
     * Analyse complète d'un bond FH : profil + Fresnel + bilan.
     * @param {object} p  Paramètres de computeLinkBudget + siteA, siteB, obstacles, k.
     */
    analyzeHop(p) {
      const profile = RadioPhysics.buildProfile({
        distanceKm: p.distanceKm,
        fGHz: p.fGHz,
        k: p.k,
        siteA: p.siteA,
        siteB: p.siteB,
        obstacles: p.obstacles,
        samples: p.samples,
      });
      const budget = RadioPhysics.computeLinkBudget(Object.assign({}, p, { diffractionLossDb: profile.diffractionLossDb }));
      return { profile, budget };
    },

    /** Couleur d'état d'un faisceau (vert / orange / rouge). */
    statusColor(status) {
      return { optimal: '#22c55e', degraded: '#f59e0b', down: '#ef4444' }[status] || '#94a3b8';
    },
    statusLabel(status) {
      return { optimal: 'ACM optimal', degraded: 'Repli de modulation', down: 'Coupure' }[status] || 'Inconnu';
    },
  };

  MBV.RadioPhysics = RadioPhysics;
})(typeof window !== 'undefined' ? window : globalThis);
