/* =====================================================================
 * d2d_physics.js — Moteur Direct-to-Device / Direct-to-Cell (NTN)
 * MicroWave, BLR & VSAT Lab
 *
 * Liaisons directes satellite ↔ terminal mobile non modifié ou NTN :
 * smartphone, objet connecté (IoT-NTN), véhicule. Orientation opérateur
 * mobile terrestre (spectre de l'opérateur ou bandes MSS L / S).
 *
 * Contenu (MBV.D2D) :
 *   - Profils de systèmes (D2C LTE, grandes antennes, IoT GEO, IoT LEO
 *     à stockage et retransmission), bandes 3GPP opérateur et MSS
 *   - Terminaux (smartphone classe 3 / 2, objet IoT, véhicule) et
 *     environnement (extérieur, véhicule, intérieur)
 *   - Propagation 3GPP TR 38.811 : espace libre, gaz, scintillation
 *     ionosphérique (UIT-R P.531, f^−1,5), ombrage / encombrement
 *   - Antenne satellite : gain d'ouverture, faisceau, perte de balayage
 *     d'un réseau actif, position dans le faisceau
 *   - Bilans descendant (RSRP, SNR, SINR) et montant (densité de
 *     puissance : allocation optimale de ressources), liaison de
 *     connexion (feeder) des charges utiles transparentes
 *   - Débit (CQI LTE / NR), répétitions de couverture (NB-IoT, LTE-M)
 *   - Doppler, dérive Doppler, précompensation (GNSS + éphémérides ou
 *     côté satellite), délais, avance temporelle, K_offset, HARQ
 *   - Couverture, taille de constellation, revisite et délai de stockage
 *     et retransmission (store & forward)
 *   - Charge d'un faisceau, services progressifs, autonomie IoT
 *     (PSM / eDRX + GNSS), choix terrestre / satellite, coexistence
 *     (densité de flux hors zone)
 *
 * Chaque étape de calcul porte un niveau : 'bac' (Bac Pro), 'licence'
 * (BTS / BUT / Licence) ou 'master' (Master / cycle ingénieur).
 * Les valeurs des profils sont des ordres de grandeur publics arrondis,
 * à visée pédagogique.
 *
 * Dépend de radio_physics.js et sat_physics.js chargés avant.
 * ===================================================================== */
(function (root) {
  'use strict';

  const MBV = (root.MBV = root.MBV || {});
  const Util = MBV.Util;
  const RP = MBV.RadioPhysics;
  const SP = MBV.SatPhysics;
  if (!Util || !RP || !SP) {
    throw new Error('d2d_physics.js nécessite radio_physics.js et sat_physics.js chargés avant.');
  }
  const f0 = (v) => Util.fmt(v, 0);
  const f1 = (v) => Util.fmt(v, 1);
  const f2 = (v) => Util.fmt(v, 2);
  const f3 = (v) => Util.fmt(v, 3);

  /** Étape de calcul étiquetée par niveau ('bac' | 'licence' | 'master'). */
  const st = (niveau, label, formula, substituted, value, unit, note) => Object.assign(Util.step(label, formula, substituted, value, unit, note), { niveau });
  /** Somme « en puissance » de rapports en dB : 1/x_tot = Σ 1/x_i. */
  const combineDb = (list) => {
    const inv = list.filter((x) => Number.isFinite(x)).reduce((s, x) => s + Math.pow(10, -x / 10), 0);
    return inv > 0 ? -10 * Math.log10(inv) : Infinity;
  };

  /* ------------------------------------------------------------------
   * 1. CONSTANTES
   * ------------------------------------------------------------------ */
  const R_E = SP.EARTH_RADIUS_KM;
  const C_KM_S = SP.C_KM_S;
  const K_DBW = SP.BOLTZMANN_DBW; // −228,6 dBW/K/Hz
  const T0 = 290;
  const MU = 398600.4418;
  const SAT_ANTENNA_TEMP_K = 290; // un satellite voit la Terre « chaude »
  const UE_ANTENNA_TEMP_K = 290; // terminal omnidirectionnel (TR 38.821)
  const POL_MISMATCH_DB = 3; // antenne linéaire du terminal / polarisation circulaire du satellite
  const SHADOW_QUANTILE = 1.28; // marge d'ombrage couvrant 90 % des emplacements
  const SCAN_EXPONENT = 1.2; // perte de balayage d'un réseau actif : cos^n
  const RB_KHZ = 180; // bloc de ressources LTE / NR à 15 kHz : 12 × 15 kHz
  const OVERHEAD = 0.25; // signalisation, signaux de référence, préfixe cyclique
  const LTE_CP_US = 4.69; // préfixe cyclique normal à 15 kHz
  const HARQ_PROC_MS = 8; // retard de traitement HARQ terrestre (8 processus LTE FDD)
  const UL_FREQ_TOL_PPM = 0.1; // exigence 3GPP NTN sur la fréquence montante précompensée
  const PFD_LIMIT_DBW_M2_MHZ = -120; // limite hors zone (cadre « SCS » de la FCC, ordre de grandeur)
  const EARTH_AREA_KM2 = 4 * Math.PI * R_E * R_E;

  /* ------------------------------------------------------------------
   * 2. CATALOGUES
   * ------------------------------------------------------------------ */

  /**
   * Bandes de fréquences (MHz). family : 'MNO' (spectre terrestre de
   * l'opérateur, réutilisé depuis l'espace) ou 'MSS' (service mobile
   * par satellite, bandes NTN 3GPP n255 / n256).
   */
  const BANDS = {
    B28: { id: 'B28', label: 'B28 — 700 MHz (APT)', family: 'MNO', ulMHz: 733, dlMHz: 788, note: 'Bande basse : meilleure propagation, antenne satellite plus grande pour le même gain.' },
    B20: { id: 'B20', label: 'B20 — 800 MHz (dividende numérique)', family: 'MNO', ulMHz: 847, dlMHz: 806, note: 'Très utilisée en Afrique de l’Ouest pour la 4G rurale.' },
    B8: { id: 'B8', label: 'B8 — 900 MHz', family: 'MNO', ulMHz: 897, dlMHz: 942, note: 'Bande historique GSM réaffectée à la 4G.' },
    B3: { id: 'B3', label: 'B3 — 1 800 MHz', family: 'MNO', ulMHz: 1747, dlMHz: 1842, note: 'Bande 4G la plus déployée dans le monde.' },
    B25: { id: 'B25', label: 'B25 — 1 900 MHz (PCS)', family: 'MNO', ulMHz: 1882, dlMHz: 1962, note: 'Bande des premiers services Direct-to-Cell aux États-Unis.' },
    B1: { id: 'B1', label: 'B1 — 2 100 MHz', family: 'MNO', ulMHz: 1950, dlMHz: 2140, note: 'Bande 3G/4G/5G classique.' },
    n255: { id: 'n255', label: 'n255 — Bande L MSS (1,6 / 1,5 GHz)', family: 'MSS', ulMHz: 1643.5, dlMHz: 1542, note: 'Bande NTN 3GPP (Rel-17) des satellites mobiles en bande L.' },
    n256: { id: 'n256', label: 'n256 — Bande S MSS (2,0 / 2,2 GHz)', family: 'MSS', ulMHz: 1995, dlMHz: 2185, note: 'Bande NTN 3GPP (Rel-17) en bande S.' },
  };

  /**
   * Profils de systèmes Direct-to-Device. Ordres de grandeur publics,
   * arrondis.
   *   payload    : 'regeneratif' (station de base à bord) | 'transparent' (« bent-pipe »)
   *   antenna    : 'reseau' (réseau actif à balayage électronique) | 'reflecteur'
   *   tech       : technologie radio servie
   *   precomp    : 'satellite' (le satellite compense le Doppler au centre du faisceau,
   *                terminal non modifié) | 'gnss' (le terminal NTN se précompense)
   */
  const PROFILES = {
    D2C_LTE: {
      id: 'D2C_LTE',
      label: 'Direct-to-Cell LTE (type Starlink Direct to Cell)',
      short: 'D2C LTE',
      orbit: 'LEO',
      altitudeKm: 525,
      payload: 'regeneratif',
      antenna: 'reseau',
      antennaAreaM2: 6,
      efficiency: 0.6,
      beamPowerW: 10,
      satNfDb: 1.5,
      beamDiameterKm: 30,
      band: 'B25',
      channelMHz: 5,
      tech: 'LTE',
      precomp: 'satellite',
      minElevationDeg: 25,
      satsTotal: 650,
      reuse: 3,
      processingMs: 10,
      isl: true,
      ueCompat: 'Smartphones 4G du commerce, sans modification',
      description: 'eNodeB embarqué dans chaque satellite, liaisons laser entre satellites : le smartphone voit une cellule 4G « de plus » de son opérateur.',
    },
    D2D_BB: {
      id: 'D2D_BB',
      label: 'Haut débit direct, grandes antennes (type AST SpaceMobile)',
      short: 'D2D grandes antennes',
      orbit: 'LEO',
      altitudeKm: 520,
      payload: 'transparent',
      antenna: 'reseau',
      antennaAreaM2: 64,
      efficiency: 0.6,
      beamPowerW: 10,
      satNfDb: 1.5,
      beamDiameterKm: 48,
      band: 'B20',
      channelMHz: 10,
      tech: 'LTE',
      precomp: 'satellite',
      minElevationDeg: 20,
      satsTotal: 5,
      reuse: 3,
      processingMs: 5,
      isl: false,
      feederBand: 'Ka',
      feederCnDb: 22,
      gatewayElevationDeg: 40,
      ueCompat: 'Smartphones 4G/5G du commerce, sans modification',
      description: 'Très grande antenne déployée en orbite (plusieurs dizaines de m²) : haut débit et voix, mais encore peu de satellites, donc couverture intermittente.',
    },
    IOT_GEO: {
      id: 'IOT_GEO',
      label: 'IoT / messagerie NTN par satellite GEO bande L (type Skylo)',
      short: 'IoT-NTN GEO',
      orbit: 'GEO',
      altitudeKm: 35786,
      satLonDeg: 25,
      payload: 'transparent',
      antenna: 'reflecteur',
      antennaDiameterM: 9,
      efficiency: 0.55,
      beamPowerW: 2,
      satNfDb: 2,
      beamDiameterKm: 800,
      band: 'n255',
      channelMHz: 0.2,
      tech: 'NB-IoT',
      precomp: 'gnss',
      minElevationDeg: 10,
      satsTotal: 1,
      reuse: 7,
      processingMs: 30,
      isl: false,
      feederBand: 'C',
      feederCnDb: 25,
      gatewayElevationDeg: 50,
      ueCompat: 'Terminaux NB-IoT / smartphones avec puce NTN Rel-17',
      description: 'Satellites GEO existants à grand réflecteur : couverture permanente d’un continent, faible débit, latence élevée.',
    },
    IOT_LEO_SF: {
      id: 'IOT_LEO_SF',
      label: 'IoT LEO à stockage et retransmission (type Sateliot)',
      short: 'IoT LEO S&F',
      orbit: 'LEO',
      altitudeKm: 550,
      payload: 'regeneratif',
      antenna: 'reseau',
      antennaAreaM2: 0.25,
      efficiency: 0.6,
      beamPowerW: 5,
      satNfDb: 2,
      beamDiameterKm: 2400,
      band: 'n256',
      channelMHz: 0.2,
      tech: 'NB-IoT',
      precomp: 'gnss',
      minElevationDeg: 20,
      satsTotal: 6,
      reuse: 1,
      processingMs: 20,
      isl: false,
      storeForward: true,
      gateways: 3,
      ueCompat: 'Modules NB-IoT NTN Rel-17',
      description: 'Nanosatellites peu nombreux : le message est stocké à bord et déposé à la prochaine station sol (quelques minutes à quelques heures).',
    },
  };

  /** Technologies radio : nombre maximal de répétitions, plafonds de débit, sous-porteuse. */
  const TECHS = {
    LTE: { id: 'LTE', label: '4G LTE', maxRepDl: 1, maxRepUl: 4, capDlKbps: Infinity, capUlKbps: Infinity, scsKHz: 15, harqMax: 8 },
    NR: { id: 'NR', label: '5G NR (NTN Rel-17)', maxRepDl: 1, maxRepUl: 16, capDlKbps: Infinity, capUlKbps: Infinity, scsKHz: 15, harqMax: 32 },
    'LTE-M': { id: 'LTE-M', label: 'LTE-M (Cat-M1)', maxRepDl: 2048, maxRepUl: 2048, capDlKbps: 1000, capUlKbps: 1000, scsKHz: 15, harqMax: 8 },
    'NB-IoT': { id: 'NB-IoT', label: 'NB-IoT (NB-NTN)', maxRepDl: 2048, maxRepUl: 128, capDlKbps: 127, capUlKbps: 159, scsKHz: 15, harqMax: 2 },
  };

  /** Terminaux (TR 38.821 : terminal portable 23 dBm, 0 dBi, NF 7 dB). */
  const TERMINALS = {
    smartphone: { id: 'smartphone', label: 'Smartphone (classe 3, 23 dBm)', txDbm: 23, gainDbi: 0, nfDb: 7, bodyLossDb: 3, tech: 'LTE' },
    smartphoneHpue: { id: 'smartphoneHpue', label: 'Smartphone haute puissance (classe 2, 26 dBm)', txDbm: 26, gainDbi: 0, nfDb: 7, bodyLossDb: 3, tech: 'LTE' },
    iot: { id: 'iot', label: 'Objet connecté NB-IoT (23 dBm)', txDbm: 23, gainDbi: -2, nfDb: 7, bodyLossDb: 0, tech: 'NB-IoT' },
    vehicle: { id: 'vehicle', label: 'Véhicule connecté (antenne de toit)', txDbm: 23, gainDbi: 3, nfDb: 5, bodyLossDb: 0, tech: 'LTE' },
  };

  /** Environnement du terminal : pertes supplémentaires (dB). */
  const ENVIRONMENTS = {
    exterieur: { id: 'exterieur', label: 'En extérieur, ciel dégagé', lossDb: 0 },
    vehicule: { id: 'vehicule', label: 'Dans un véhicule (sans antenne extérieure)', lossDb: 8 },
    interieur: { id: 'interieur', label: 'À l’intérieur d’un bâtiment', lossDb: 18 },
  };

  /**
   * Ombrage et encombrement en zone rurale, bande S (d'après 3GPP TR 38.811,
   * tableaux 6.6.2, valeurs arrondies) : probabilité de visibilité directe,
   * écart-type de l'ombrage LOS / NLOS, perte d'encombrement NLOS.
   */
  const SHADOW_RURAL = [
    { el: 10, pLos: 78.2, sfLos: 1.79, sfNlos: 8.93, cl: 19.52 },
    { el: 20, pLos: 86.9, sfLos: 1.14, sfNlos: 9.08, cl: 18.17 },
    { el: 30, pLos: 91.9, sfLos: 1.14, sfNlos: 8.78, cl: 18.42 },
    { el: 40, pLos: 92.9, sfLos: 0.92, sfNlos: 10.25, cl: 18.28 },
    { el: 50, pLos: 93.5, sfLos: 1.42, sfNlos: 10.56, cl: 18.63 },
    { el: 60, pLos: 94.0, sfLos: 1.56, sfNlos: 10.74, cl: 17.68 },
    { el: 70, pLos: 94.9, sfLos: 0.85, sfNlos: 10.17, cl: 16.5 },
    { el: 80, pLos: 95.2, sfLos: 0.72, sfNlos: 11.52, cl: 16.3 },
    { el: 90, pLos: 99.8, sfLos: 0.72, sfNlos: 11.52, cl: 16.3 },
  ];

  /**
   * Table CQI LTE (TS 36.213, tableau 7.2.3-1) : efficacité spectrale
   * (bit/s/Hz) et SNR requis indicatif (BLER 10 %, canal AWGN).
   */
  const CQI = [
    { cqi: 1, mod: 'QPSK', eff: 0.1523, snr: -6.7 },
    { cqi: 2, mod: 'QPSK', eff: 0.2344, snr: -4.7 },
    { cqi: 3, mod: 'QPSK', eff: 0.377, snr: -2.3 },
    { cqi: 4, mod: 'QPSK', eff: 0.6016, snr: 0.2 },
    { cqi: 5, mod: 'QPSK', eff: 0.877, snr: 2.4 },
    { cqi: 6, mod: 'QPSK', eff: 1.1758, snr: 4.3 },
    { cqi: 7, mod: '16QAM', eff: 1.4766, snr: 5.9 },
    { cqi: 8, mod: '16QAM', eff: 1.9141, snr: 8.1 },
    { cqi: 9, mod: '16QAM', eff: 2.4063, snr: 10.3 },
    { cqi: 10, mod: '64QAM', eff: 2.7305, snr: 11.7 },
    { cqi: 11, mod: '64QAM', eff: 3.3223, snr: 14.1 },
    { cqi: 12, mod: '64QAM', eff: 3.9023, snr: 16.3 },
    { cqi: 13, mod: '64QAM', eff: 4.5234, snr: 18.7 },
    { cqi: 14, mod: '64QAM', eff: 5.1152, snr: 21.0 },
    { cqi: 15, mod: '64QAM', eff: 5.5547, snr: 22.7 },
  ];
  const REP_EFFICIENCY = 0.85; // gain réel d'une répétition : 85 % de 10·log(R)

  /**
   * Services, du plus simple au plus exigeant (« services progressifs »).
   * dlKbps / ulKbps : débit utile par utilisateur ; minSnrDb : SNR minimal
   * (répétitions comprises) ; maxRttMs : délai aller-retour maximal ;
   * realtime : service conversationnel (pas de stockage et retransmission).
   */
  const SERVICES = [
    { id: 'alerte', label: 'Alerte à la population (diffusion cellulaire)', phase: 1, dlKbps: 0.5, ulKbps: 0, minSnrDb: -15, maxRttMs: Infinity, realtime: false, dlOnly: true },
    { id: 'sms', label: 'SMS / messagerie d’urgence', phase: 1, dlKbps: 1, ulKbps: 1, minSnrDb: -12, maxRttMs: Infinity, realtime: false },
    { id: 'iot', label: 'Messages IoT (capteurs, suivi)', phase: 2, dlKbps: 0.1, ulKbps: 0.3, minSnrDb: -15, maxRttMs: Infinity, realtime: false },
    { id: 'messagerie', label: 'Messagerie instantanée (texte, photo légère)', phase: 2, dlKbps: 16, ulKbps: 8, minSnrDb: -6, maxRttMs: 5000, realtime: false },
    { id: 'voix', label: 'Voix sur LTE (VoLTE, codec AMR-WB)', phase: 3, dlKbps: 40, ulKbps: 40, minSnrDb: -4, maxRttMs: 600, realtime: true },
    { id: 'web', label: 'Données / navigation web', phase: 3, dlKbps: 500, ulKbps: 100, minSnrDb: 0, maxRttMs: 1500, realtime: true },
    { id: 'video', label: 'Vidéo / visioconférence', phase: 4, dlKbps: 2000, ulKbps: 500, minSnrDb: 5, maxRttMs: 400, realtime: true },
  ];
  /** Phases commerciales des offres directes vers mobile. */
  const SERVICE_PHASES = [
    { phase: 1, label: 'Phase 1 — SMS et alertes', years: '2024-2025' },
    { phase: 2, label: 'Phase 2 — Messagerie et IoT', years: '2025-2026' },
    { phase: 3, label: 'Phase 3 — Voix et données', years: '2026 et après' },
    { phase: 4, label: 'Phase 4 — Haut débit (satellites de nouvelle génération)', years: 'à venir' },
  ];

  /** Consommation d'un module IoT NTN (mA sous 3,6 V). */
  const IOT_POWER = { txMa: 230, rxMa: 50, gnssMa: 25, sleepUa: 3, voltage: 3.6 };

  /* ------------------------------------------------------------------
   * 3. MOTEUR
   * ------------------------------------------------------------------ */
  const D2D = {
    BANDS,
    PROFILES,
    TECHS,
    TERMINALS,
    ENVIRONMENTS,
    SHADOW_RURAL,
    CQI,
    SERVICES,
    SERVICE_PHASES,
    IOT_POWER,
    POL_MISMATCH_DB,
    PFD_LIMIT_DBW_M2_MHZ,
    UL_FREQ_TOL_PPM,
    NIVEAUX: { bac: 'Bac Pro', licence: 'BTS / BUT / Licence', master: 'Master / Ingénieur' },

    getProfile(id) {
      return PROFILES[id] || PROFILES.D2C_LTE;
    },
    getBand(id) {
      return BANDS[id] || BANDS.B25;
    },
    getTech(id) {
      return TECHS[id] || TECHS.LTE;
    },
    getTerminal(id) {
      return TERMINALS[id] || TERMINALS.smartphone;
    },
    getEnvironment(id) {
      return ENVIRONMENTS[id] || ENVIRONMENTS.exterieur;
    },

    /* ---------------- Antenne du satellite ---------------- */

    /** Surface d'ouverture (m²) d'un profil (réseau actif ou réflecteur). */
    apertureM2(prof) {
      if (prof.antennaAreaM2) return prof.antennaAreaM2;
      return (Math.PI * Math.pow(prof.antennaDiameterM || 1, 2)) / 4;
    },
    /** Gain d'ouverture (dBi) : G = 10·log(η·4π·A/λ²). */
    apertureGainDbi(areaM2, fMHz, eff = 0.6) {
      const lambda = 299.792458 / fMHz;
      return 10 * Math.log10((eff * 4 * Math.PI * areaM2) / (lambda * lambda));
    },
    /** Ouverture à −3 dB (°) d'une ouverture de diamètre équivalent D = √(4A/π) : θ ≈ 70·λ/D. */
    apertureBeamwidthDeg(areaM2, fMHz) {
      const lambda = 299.792458 / fMHz;
      return (70 * lambda) / Math.sqrt((4 * areaM2) / Math.PI);
    },
    /** Angle de visée au satellite (nadir, °) pour une élévation E : sin η = R·cos E / (R + h). */
    nadirAngleDeg(altitudeKm, elevationDeg) {
      return Util.rad2deg(Math.asin((R_E * Math.cos(Util.deg2rad(elevationDeg))) / (R_E + altitudeKm)));
    },
    /** Perte de balayage (dB) d'un réseau actif plan : L = −10·log(cos^n η). */
    scanLossDb(nadirDeg, n = SCAN_EXPONENT) {
      const c = Math.max(Math.cos(Util.deg2rad(nadirDeg)), 0.05);
      return -10 * n * Math.log10(c);
    },
    /** Perte liée à la position dans le faisceau (u = 0 au centre, 1 au bord à −3 dB) : 3·u² dB. */
    beamPositionLossDb(u) {
      return 3 * Math.pow(Util.clamp(u, 0, 1.5), 2);
    },
    /** Diamètre de l'empreinte au sol d'un faisceau (km) : ≈ 2·d·tan(θ/2) / sin E. */
    footprintKm(slantKm, beamwidthDeg, elevationDeg) {
      return (2 * slantKm * Math.tan(Util.deg2rad(beamwidthDeg / 2))) / Math.max(Math.sin(Util.deg2rad(elevationDeg)), 0.1);
    },

    /* ---------------- Propagation (TR 38.811) ---------------- */

    /** Ombrage et encombrement en zone rurale, interpolés selon l'élévation. */
    shadowing(elevationDeg, los = true) {
      const el = Util.clamp(elevationDeg, 10, 90);
      const sigma = Util.interp(SHADOW_RURAL, el, 'el', los ? 'sfLos' : 'sfNlos');
      return {
        pLos: Util.interp(SHADOW_RURAL, el, 'el', 'pLos'),
        sigma,
        clutterDb: los ? 0 : Util.interp(SHADOW_RURAL, el, 'el', 'cl'),
        marginDb: SHADOW_QUANTILE * sigma,
      };
    },
    /**
     * Scintillation ionosphérique (dB), modèle pédagogique d'après UIT-R P.531 :
     * A = A₀·(f / 1,5 GHz)^−1,5 ; A₀ ≈ 2 dB près de l'équateur magnétique
     * (|latitude| < 20°, cas du Sahel), 0,5 dB aux latitudes moyennes.
     */
    ionoScintillationDb(fMHz, latDeg) {
      const a0 = Math.abs(latDeg) < 20 ? 2 : Math.abs(latDeg) < 50 ? 0.5 : 1;
      return a0 * Math.pow(fMHz / 1500, -1.5);
    },
    /** Absorption atmosphérique en dessous de 6 GHz (dB) : ≈ 0,04 dB au zénith, / sin E. */
    atmosphericDb(elevationDeg) {
      return 0.04 / Math.max(Math.sin(Util.deg2rad(elevationDeg)), 0.1);
    },

    /* ---------------- Débit ---------------- */

    /** Meilleur CQI pour un SNR ; null si SNR sous le CQI 1. */
    cqiFor(snrDb) {
      let best = null;
      for (const c of CQI) if (snrDb >= c.snr) best = c;
      return best;
    },
    /**
     * Répétitions nécessaires (puissance de 2) pour atteindre le SNR du CQI 1 :
     * gain réel = 0,85 × 10·log(R).
     */
    repetitionsFor(snrDb, maxRep) {
      const need = CQI[0].snr - snrDb;
      if (need <= 0) return 1;
      const r = Math.pow(2, Math.ceil(Math.log2(Math.pow(10, need / (10 * REP_EFFICIENCY)))));
      return r <= maxRep ? r : null;
    },
    /* ---------------- Géométrie ---------------- */

    /** Géométrie terminal ↔ satellite servant : élévation, distance, angle de visée. */
    geometry(prof, p) {
      if (prof.orbit === 'GEO') {
        const g = SP.geoLookAngles(p.latDeg != null ? p.latDeg : 12.37, p.lonDeg != null ? p.lonDeg : -1.52, prof.satLonDeg || 0);
        return {
          elevation: g.elevation,
          azimuth: g.azimuth,
          slantKm: g.slantRangeKm,
          nadirDeg: D2D.nadirAngleDeg(prof.altitudeKm, g.elevation),
          visible: g.elevation >= prof.minElevationDeg,
          steps: g.steps.slice(1, 2).concat(g.steps.slice(4)).map((s) => Object.assign(s, { niveau: 'licence' })),
        };
      }
      const el = Util.clamp(p.elevationDeg != null ? p.elevationDeg : 50, 0, 90);
      const slant = SP.slantRangeFromElevationKm(prof.altitudeKm, el);
      const nadir = D2D.nadirAngleDeg(prof.altitudeKm, el);
      return {
        elevation: el,
        azimuth: null,
        slantKm: slant,
        nadirDeg: nadir,
        visible: el >= prof.minElevationDeg,
        steps: [
          st('bac', 'Distance terminal → satellite', 'd = √((R+h)² − (R·cos E)²) − R·sin E', `d = √((6378 + ${f0(prof.altitudeKm)})² − (6378·cos ${f1(el)}°)²) − 6378·sin ${f1(el)}°`, slant, 'km', el < prof.minElevationDeg ? 'Satellite trop bas : sous l’élévation minimale du système.' : ''),
          st('master', 'Angle de visée au satellite (depuis le nadir)', 'sin η = R·cos E / (R + h)', `sin η = 6378 × cos ${f1(el)}° / ${f0(R_E + prof.altitudeKm)}`, nadir, '°', 'Plus le terminal est bas sur l’horizon, plus le réseau d’antennes du satellite doit dépointer son faisceau.'),
        ],
      };
    },

    /* ---------------- Bilan complet ---------------- */

    /**
     * Bilan Direct-to-Device complet (descendant + montant).
     * @param {object} p
     *   profile, band, channelMHz, terminal, environment, los (bool),
     *   elevationDeg (LEO), latDeg, lonDeg, beamPos (0 centre … 1 bord),
     *   ulRb (blocs de 180 kHz, ou nombre de tonalités NB-IoT), ulTonesKHz (3,75 | 15),
     *   reuse, beamPowerW, gatewayRainMmH, ephemerisAgeS, ntnCapable,
     *   interferenceTerrDbm (brouillage terrestre co-canal au terminal),
     *   hiddenLossDb / hiddenUlDb (panne cachée ou écart de recette : jamais détaillés)
     */
    computeD2DLink(p = {}) {
      const prof = D2D.getProfile(p.profile);
      const band = D2D.getBand(p.band || prof.band);
      const term = D2D.getTerminal(p.terminal);
      const env = D2D.getEnvironment(p.environment);
      const techId = p.tech || (term.tech === 'NB-IoT' || prof.tech === 'NB-IoT' ? 'NB-IoT' : prof.tech === 'NR' ? 'NR' : term.tech === 'LTE-M' ? 'LTE-M' : 'LTE');
      const tech = D2D.getTech(techId);
      const isNb = tech.id === 'NB-IoT';
      const chMHz = p.channelMHz || prof.channelMHz;
      const los = p.los !== false;
      const u = p.beamPos != null ? p.beamPos : 0.5;
      const reuse = p.reuse || prof.reuse;
      const beamW = p.beamPowerW != null ? p.beamPowerW : prof.beamPowerW;
      const lat = p.latDeg != null ? p.latDeg : 12.37;
      const steps = [];
      const messages = [];
      const add = (group, s) => steps.push(Object.assign(s, { group }));

      /* --- Géométrie --- */
      const geo = D2D.geometry(prof, p);
      geo.steps.forEach((s) => add('Géométrie', s));
      const d = geo.slantKm;
      if (!geo.visible) messages.push({ level: 'err', text: `Élévation ${f1(geo.elevation)}° inférieure au minimum du système (${f0(prof.minElevationDeg)}°) : pas de service.` });

      /* --- Antenne satellite --- */
      const area = D2D.apertureM2(prof);
      const gDl = D2D.apertureGainDbi(area, band.dlMHz, prof.efficiency);
      const gUl = D2D.apertureGainDbi(area, band.ulMHz, prof.efficiency);
      const bw = D2D.apertureBeamwidthDeg(area, band.dlMHz);
      const scan = prof.antenna === 'reseau' ? D2D.scanLossDb(geo.nadirDeg) : 0;
      const posLoss = D2D.beamPositionLossDb(u);
      const lambdaDl = 299.792458 / band.dlMHz;
      add('Antenne du satellite', st('bac', 'Gain de l’antenne du satellite (descendant)', 'G = 10·log(η × 4π × A / λ²)', `G = 10·log(${f2(prof.efficiency)} × 4π × ${f1(area)} / ${f3(lambdaDl)}²)`, gDl, 'dBi', prof.antenna === 'reseau' ? 'Réseau actif à balayage électronique : des centaines d’éléments rayonnants.' : 'Grand réflecteur déployable.'));
      add('Antenne du satellite', st('licence', 'Ouverture du faisceau à −3 dB', 'θ3dB ≈ 70·λ / D,   D = √(4A/π)', `θ3dB ≈ 70 × ${f3(lambdaDl)} / ${f2(Math.sqrt((4 * area) / Math.PI))}`, bw, '°'));
      const foot = D2D.footprintKm(d, bw, geo.elevation);
      add('Antenne du satellite', st('licence', 'Empreinte du faisceau au sol', 'Ø ≈ 2·d·tan(θ3dB/2) / sin E', `Ø ≈ 2 × ${f0(d)} × tan(${f2(bw / 2)}°) / sin ${f1(geo.elevation)}°`, foot, 'km', 'Une « cellule » satellite couvre des centaines à des milliers de km², contre quelques km² pour une cellule terrestre rurale.'));
      if (scan > 0) add('Antenne du satellite', st('master', 'Perte de balayage du réseau actif', 'L_scan = −10·n·log(cos η)   (n = 1,2)', `L_scan = −12 × log(cos ${f1(geo.nadirDeg)}°)`, scan, 'dB'));
      add('Antenne du satellite', st('licence', 'Perte liée à la position dans le faisceau', 'L_pos = 3·u²   (u = 0 au centre, 1 au bord à −3 dB)', `L_pos = 3 × ${f2(u)}²`, posLoss, 'dB'));

      /* --- Propagation --- */
      const fslDl = RP.fslDb(d, band.dlMHz / 1000);
      const fslUl = RP.fslDb(d, band.ulMHz / 1000);
      const atm = D2D.atmosphericDb(geo.elevation);
      const scDl = D2D.ionoScintillationDb(band.dlMHz, lat);
      const scUl = D2D.ionoScintillationDb(band.ulMHz, lat);
      const sh = D2D.shadowing(geo.elevation, los);
      add('Propagation', st('bac', 'Affaiblissement en espace libre (descendant)', 'FSL = 32,45 + 20·log(d_km) + 20·log(f_MHz)', `FSL = 32,45 + 20·log(${f0(d)}) + 20·log(${f0(band.dlMHz)})`, fslDl, 'dB'));
      add('Propagation', st('bac', 'Affaiblissement en espace libre (montant)', 'FSL = 32,45 + 20·log(d_km) + 20·log(f_MHz)', `FSL = 32,45 + 20·log(${f0(d)}) + 20·log(${f0(band.ulMHz)})`, fslUl, 'dB'));
      add('Propagation', st('licence', 'Scintillation ionosphérique (descendant)', 'A_sc = A₀ × (f / 1500 MHz)^−1,5   (A₀ = 2 dB près de l’équateur magnétique)', `A_sc = ${Math.abs(lat) < 20 ? 2 : 0.5} × (${f0(band.dlMHz)} / 1500)^−1,5`, scDl, 'dB', 'Le Sahel est sous l’anomalie équatoriale : la scintillation y est forte le soir, aux équinoxes.'));
      add('Propagation', st('master', 'Ombrage (marge à 90 % des emplacements, TR 38.811 rural)', 'M_SF = 1,28 × σ_SF' + (los ? '' : ' ; + perte d’encombrement NLOS'), `M_SF = 1,28 × ${f2(sh.sigma)}${los ? '' : ' ; CL = ' + f2(sh.clutterDb) + ' dB'}`, sh.marginDb + sh.clutterDb, 'dB', `Probabilité de visibilité directe à ${f0(geo.elevation)}° : ${f1(sh.pLos)} %.`));
      add('Propagation', st('bac', 'Pertes côté terminal', 'L_term = L_polarisation + L_corps + L_environnement', `L_term = ${POL_MISMATCH_DB} + ${term.bodyLossDb} + ${env.lossDb}`, POL_MISMATCH_DB + term.bodyLossDb + env.lossDb, 'dB', 'Antenne linéaire du téléphone face à une polarisation circulaire : 3 dB perdus. ' + (env.lossDb >= 15 ? 'À l’intérieur, le service direct est en général impossible.' : '')));
      const hidDl = p.hiddenLossDb || 0;
      const hidUl = p.hiddenUlDb != null ? p.hiddenUlDb : hidDl;
      const commonDl = atm + scDl + sh.marginDb + sh.clutterDb + POL_MISMATCH_DB + term.bodyLossDb + env.lossDb;
      const commonUl = atm + scUl + sh.marginDb + sh.clutterDb + POL_MISMATCH_DB + term.bodyLossDb + env.lossDb;

      /* --- Descendant --- */
      const pBeamDbw = Util.wattToDbw(Math.max(beamW, 1e-6));
      const eirp = pBeamDbw + gDl - scan;
      const nRb = isNb ? 1 : Math.max(1, Math.round((chMHz * 1000 * 0.9) / RB_KHZ));
      const bwDlKHz = nRb * RB_KHZ;
      const cDl = eirp - posLoss - fslDl - commonDl - hidDl; // dBW
      const tUe = UE_ANTENNA_TEMP_K + T0 * (Math.pow(10, term.nfDb / 10) - 1);
      const gtUe = term.gainDbi - Util.linToDb(tUe);
      const nDl = K_DBW + Util.linToDb(tUe) + Util.linToDb(bwDlKHz * 1000);
      const cDlTerm = cDl + term.gainDbi;
      const snrDl = cDlTerm - nDl;
      const rsrp = cDlTerm + 30 - Util.linToDb(12 * nRb);
      add('Descendant', st('bac', 'PIRE du faisceau (satellite)', 'PIRE = P_faisceau + G_sat − L_scan', `PIRE = 10·log(${f1(beamW)}) + ${f2(gDl)} − ${f2(scan)}`, eirp, 'dBW'));
      add('Descendant', st('licence', 'G/T du terminal', 'G/T = G − 10·log(T_ant + 290·(10^(NF/10) − 1))', `G/T = ${f1(term.gainDbi)} − 10·log(290 + 290 × (10^(${f1(term.nfDb)}/10) − 1))`, gtUe, 'dB/K', 'Antenne omnidirectionnelle qui « voit » la Terre à 290 K : un smartphone a un G/T d’environ −31,6 dB/K, contre ≈ +20 dB/K pour un VSAT de 1,2 m en Ku.'));
      add('Descendant', st('bac', 'Puissance reçue par le terminal', 'C = PIRE − L_pos − FSL − A_atm − A_sc − M_SF − L_term + G_term', `C = ${f2(eirp)} − ${f2(posLoss)} − ${f2(fslDl)} − ${f2(atm)} − ${f2(scDl)} − ${f2(sh.marginDb + sh.clutterDb)} − ${f2(POL_MISMATCH_DB + term.bodyLossDb + env.lossDb)} + ${f1(term.gainDbi)}`, cDlTerm + 30, 'dBm'));
      if (!isNb) add('Descendant', st('licence', 'RSRP (puissance par élément de ressource)', 'RSRP = C − 10·log(12 × N_RB)', `RSRP = ${f2(cDlTerm + 30)} − 10·log(12 × ${nRb})`, rsrp, 'dBm', 'Un réseau terrestre est correct au-dessus de −100 dBm ; le service satellite fonctionne vers −110 à −125 dBm.'));
      add('Descendant', st('licence', 'Bruit dans la bande occupée', 'N = k + 10·log(T) + 10·log(B)', `N = −228,6 + 10·log(${f0(tUe)}) + 10·log(${f0(bwDlKHz)}·10³)`, nDl + 30, 'dBm'));
      add('Descendant', st('bac', 'Rapport signal sur bruit (descendant)', 'SNR = C − N', `SNR = ${f2(cDlTerm + 30)} − (${f2(nDl + 30)})`, snrDl, 'dB'));

      /* --- Liaison de connexion (charge utile transparente) --- */
      let feeder = null;
      if (prof.payload === 'transparent') {
        const fb = SP.getBand(prof.feederBand || 'Ka');
        const rain = p.gatewayRainMmH || 0;
        const ar = SP.slantRainAttenuation(fb.downGHz, rain, prof.gatewayElevationDeg || 40, 0.3, fb.polarization);
        const cnF = (prof.feederCnDb || 22) - ar.total;
        feeder = { band: fb.id, rainDb: ar.total, cnDb: cnF };
        add('Liaison de connexion', st('master', 'C/N de la liaison de connexion (station sol ↔ satellite)', 'C/N_feeder = C/N_ciel clair − A_pluie(station sol)', `C/N_feeder = ${f1(prof.feederCnDb || 22)} − ${f2(ar.total)}   (bande ${fb.id}, ${f0(rain)} mm/h)`, cnF, 'dB', 'Charge utile transparente : un orage sur la station sol dégrade TOUS les utilisateurs du satellite.'));
        if (cnF < 5) messages.push({ level: 'warn', text: 'Liaison de connexion dégradée : le bruit qu’elle ajoute limite tous les terminaux du satellite.' });
      }

      /* --- Brouillage et SINR --- */
      const ciBeam = reuse >= 7 ? 25 - 3 * u : reuse >= 4 ? 21 - 4 * u : reuse >= 3 ? 18 - 4 * u : 10 - 7 * u;
      const ciTerr = p.interferenceTerrDbm != null ? cDlTerm + 30 - p.interferenceTerrDbm : Infinity;
      const sinrDl = combineDb([snrDl, ciBeam, ciTerr, feeder ? feeder.cnDb : Infinity]);
      add('Descendant', st('master', 'SINR descendant', '1/SINR = 1/SNR + 1/(C/I)_faisceaux' + (feeder ? ' + 1/(C/N)_feeder' : '') + (Number.isFinite(ciTerr) ? ' + 1/(C/I)_terrestre' : ''), `SNR = ${f2(snrDl)} dB ; C/I faisceaux (réutilisation ${reuse}) = ${f2(ciBeam)} dB${feeder ? ' ; C/N feeder = ' + f2(feeder.cnDb) + ' dB' : ''}${Number.isFinite(ciTerr) ? ' ; C/I terrestre = ' + f2(ciTerr) + ' dB' : ''}`, sinrDl, 'dB'));

      /* --- Débit descendant --- */
      const dlRate = D2D.linkRate(sinrDl, bwDlKHz, tech, 'dl');
      add('Descendant', st('licence', 'Débit descendant du faisceau', dlRate.reps > 1 ? 'D = η_CQI1 × B × 0,75 / R   (répétitions)' : 'D = η_CQI × B × 0,75', dlRate.cqi ? `CQI ${dlRate.cqi.cqi} (${dlRate.cqi.mod}, ${f2(dlRate.cqi.eff)} bit/s/Hz) × ${f0(bwDlKHz)} kHz × 0,75${dlRate.reps > 1 ? ' / ' + dlRate.reps : ''}` : 'SINR sous le seuil, même avec le nombre maximal de répétitions', dlRate.kbps / 1000, 'Mbit/s', dlRate.reps > 1 ? `${dlRate.reps} répétitions : chaque doublement apporte ≈ 2,6 dB.` : ''));

      /* --- Montant : allocation à densité de puissance limitée --- */
      const tSat = SAT_ANTENNA_TEMP_K + T0 * (Math.pow(10, prof.satNfDb / 10) - 1);
      const gtSat = gUl - scan - Util.linToDb(tSat);
      const ueEirpDbw = term.txDbm - 30 + term.gainDbi;
      const cUl = ueEirpDbw - fslUl - commonUl - posLoss - hidUl + gUl - scan; // dBW au récepteur du satellite
      const toneKHz = p.ulTonesKHz || 15;
      const ulUnits = Math.max(1, Math.round(p.ulRb || (isNb ? 1 : 1)));
      const bwUlKHz = isNb ? Math.min(ulUnits, 12) * (ulUnits > 1 ? 15 : toneKHz) : ulUnits * RB_KHZ;
      const ulAt = (bKHz) => {
        const n = K_DBW + Util.linToDb(tSat) + Util.linToDb(bKHz * 1000);
        const snr = cUl - n;
        const s = combineDb([snr, ciBeam + 3, feeder ? feeder.cnDb : Infinity]);
        return { n, snr, sinr: s, rate: D2D.linkRate(s, bKHz, tech, 'ul') };
      };
      const ul = ulAt(bwUlKHz);
      add('Montant', st('bac', 'PIRE du terminal', 'PIRE = P_tx + G_term', `PIRE = ${f0(term.txDbm)} dBm + ${f1(term.gainDbi)} dBi`, ueEirpDbw + 30, 'dBm'));
      add('Montant', st('licence', 'G/T du satellite', 'G/T = G_sat − L_scan − 10·log(290 + 290·(10^(NF/10) − 1))', `G/T = ${f2(gUl)} − ${f2(scan)} − 10·log(${f0(tSat)})`, gtSat, 'dB/K'));
      add('Montant', st('bac', 'Puissance reçue par le satellite', 'C = PIRE_term − FSL − A − M_SF − L_term − L_pos + G_sat − L_scan', `C = ${f2(ueEirpDbw + 30)} − ${f2(fslUl)} − ${f2(commonUl)} − ${f2(posLoss)} + ${f2(gUl)} − ${f2(scan)}`, cUl + 30, 'dBm'));
      add('Montant', st('licence', 'SNR montant', 'SNR = C − (k + 10·log T_sat + 10·log B)', `B = ${isNb ? (ulUnits > 1 ? ulUnits + ' × 15 kHz' : f2(toneKHz) + ' kHz (1 tonalité)') : ulUnits + ' × 180 kHz'} = ${f2(bwUlKHz)} kHz`, ul.snr, 'dB', 'Un smartphone n’a que 200 mW : plus la bande allouée est large, plus sa puissance est diluée.'));

      // Recherche de l'allocation qui maximise le débit (régime limité en puissance)
      let best = null;
      const cands = isNb ? [3.75, 15, 45, 90, 180] : [1, 2, 3, 4, 6, 8, 10, 15, 20, 25, 50, 100].filter((x) => x <= nRb).map((x) => x * RB_KHZ);
      for (const b of cands) {
        const r = ulAt(b);
        if (!best || r.rate.kbps > best.rate.kbps) best = Object.assign({ bKHz: b }, r);
      }
      const cn0Ul = cUl - K_DBW - Util.linToDb(tSat);
      add('Montant', st('master', 'C/N0 montant et plafond de Shannon', 'C/N0 = C − k − 10·log T_sat ;  D_max = (C/N0)·log₂(e) quand B → ∞', `C/N0 = ${f2(cUl + 30)} − 30 + 228,6 − 10·log(${f0(tSat)})`, cn0Ul, 'dBHz', `Plafond théorique : ${f0((Math.pow(10, cn0Ul / 10) * Math.LOG2E) / 1000)} kbit/s, quelle que soit la bande allouée.`));
      add('Montant', st('master', 'Allocation montante optimale (régime limité en puissance)', 'max_B  η(SNR(B)) × B,   SNR(B) = C − k − 10·log T − 10·log B', `meilleure bande : ${f2(best.bKHz)} kHz (${isNb ? '' : f0(best.bKHz / RB_KHZ) + ' RB, '}SNR ${f1(best.snr)} dB)`, best.rate.kbps, 'kbit/s', 'Régime limité en puissance : doubler la bande coûte 3 dB de SNR ; le gain de débit s’amenuise, puis la liaison tombe sous le seuil du CQI 1.'));
      add('Montant', st('licence', 'Débit montant (allocation choisie)', 'D = η_CQI × B × 0,75 / R', ul.rate.cqi ? `CQI ${ul.rate.cqi.cqi} × ${f2(bwUlKHz)} kHz × 0,75${ul.rate.reps > 1 ? ' / ' + ul.rate.reps : ''}` : 'SINR sous le seuil, même avec le nombre maximal de répétitions', ul.rate.kbps, 'kbit/s'));

      /* --- Doppler, délais --- */
      const dop = D2D.doppler(prof, geo.elevation, band, tech, { ephemerisAgeS: p.ephemerisAgeS, ntnCapable: p.ntnCapable, beamDiameterKm: Math.min(prof.beamDiameterKm, foot) });
      dop.steps.forEach((s) => add('Doppler', s));
      const tim = D2D.timing(prof, d, tech, { beamDiameterKm: Math.min(prof.beamDiameterKm, foot), elevationDeg: geo.elevation });
      tim.steps.forEach((s) => add('Délais', s));

      /* --- Synthèse --- */
      const dlOk = geo.visible && dlRate.kbps > 0;
      const ulOk = geo.visible && ul.rate.kbps > 0 && dop.ulOk && tim.taOk;
      if (geo.visible && !dlRate.kbps) messages.push({ level: 'err', text: 'Aucun signal exploitable reçu par le terminal (SINR descendant trop faible).' });
      if (geo.visible && dlRate.kbps && !ul.rate.kbps) messages.push({ level: 'err', text: 'Le terminal reçoit le satellite mais le satellite ne l’entend pas : liaison montante limitée.' });
      if (!dop.ulOk) messages.push({ level: 'err', text: 'Fréquence montante hors tolérance : le satellite ne peut pas démoduler le terminal.' });
      if (!tim.taOk) messages.push({ level: 'err', text: 'Synchronisation montante impossible (avance temporelle hors limite).' });
      if (env.lossDb >= 15 && geo.visible) messages.push({ level: 'warn', text: 'Terminal à l’intérieur : sortir à l’extérieur, ciel dégagé.' });
      if (dlRate.reps > 1 || ul.rate.reps > 1) messages.push({ level: 'info', text: `Répétitions de couverture actives (${dlRate.reps} en descendant, ${ul.rate.reps || '—'} en montant).` });

      return {
        profile: prof,
        band,
        tech,
        terminal: term,
        environment: env,
        geometry: { elevation: geo.elevation, azimuth: geo.azimuth, slantKm: d, nadirDeg: geo.nadirDeg, visible: geo.visible },
        sat: { gainDlDbi: gDl, gainUlDbi: gUl, beamwidthDeg: bw, footprintKm: foot, scanDb: scan, eirpDbw: eirp, gtDbK: gtSat, areaM2: area },
        dl: { cDbm: cDlTerm + 30, rsrpDbm: isNb ? null : rsrp, nDbm: nDl + 30, snrDb: snrDl, sinrDb: sinrDl, ciBeamDb: ciBeam, ciTerrDb: ciTerr, nRb, bwKHz: bwDlKHz, rate: dlRate, gtDbK: gtUe, fslDb: fslDl },
        ul: { cDbm: cUl + 30, cn0DbHz: cn0Ul, snrDb: ul.snr, sinrDb: ul.sinr, bwKHz: bwUlKHz, rate: ul.rate, best: { bwKHz: best.bKHz, snrDb: best.snr, kbps: best.rate.kbps }, fslDb: fslUl },
        feeder,
        losses: { atm, scintDlDb: scDl, scintUlDb: scUl, shadowDb: sh.marginDb, clutterDb: sh.clutterDb, terminalDb: POL_MISMATCH_DB + term.bodyLossDb + env.lossDb, posDb: posLoss, pLos: sh.pLos },
        doppler: dop,
        timing: tim,
        ok: dlOk && ulOk,
        dlOk,
        ulOk,
        messages,
        steps,
      };
    },

    /** Débit d'un sens de liaison avec répétitions éventuelles et plafond de la technologie. */
    linkRate(sinrDb, bwKHz, tech, dir) {
      const t = typeof tech === 'string' ? D2D.getTech(tech) : tech;
      const maxRep = dir === 'ul' ? t.maxRepUl : t.maxRepDl;
      const cap = dir === 'ul' ? t.capUlKbps : t.capDlKbps;
      const cqi = D2D.cqiFor(sinrDb);
      if (cqi) return { kbps: Math.min(cap, cqi.eff * bwKHz * (1 - OVERHEAD)), cqi, reps: 1, gainDb: 0 };
      const reps = D2D.repetitionsFor(sinrDb, maxRep);
      if (!reps) return { kbps: 0, cqi: null, reps: null, gainDb: 0, maxRep };
      return { kbps: Math.min(cap, (CQI[0].eff * bwKHz * (1 - OVERHEAD)) / reps), cqi: CQI[0], reps, gainDb: REP_EFFICIENCY * 10 * Math.log10(reps) };
    },

    /* ---------------- Doppler ---------------- */

    /**
     * Doppler d'un satellite défilant, vu à l'élévation E :
     *   f_d = (f/c)·v·(R·cos E)/(R+h)        (maximum le long de la trace)
     *   dérive maximale (au zénith) : ḟ = (f/c)·v²·R / ((R+h)·h)
     * Précompensation : par le terminal NTN (GNSS + éphémérides, erreur résiduelle
     * croissant avec l'âge des éphémérides) ou par le satellite au centre du
     * faisceau (terminal non modifié : reste le Doppler différentiel dans le faisceau).
     */
    doppler(prof, elevationDeg, band, tech, o = {}) {
      const steps = [];
      if (prof.orbit === 'GEO') {
        const tolHz = (UL_FREQ_TOL_PPM * band.ulMHz * 1e6) / 1e6;
        steps.push(st('bac', 'Doppler d’un satellite géostationnaire', 'f_d ≈ 0   (satellite fixe dans le ciel)', 'seul un léger mouvement en « 8 » subsiste : quelques Hz', 0, 'Hz'));
        return { maxKHz: 0, rateHzS: 0, residualHz: 0, tolHz, ulOk: true, method: 'aucune', steps };
      }
      const h = prof.altitudeKm;
      const v = SP.orbitalSpeedKmS(h);
      const E = Util.deg2rad(elevationDeg);
      const fUl = band.ulMHz * 1e6;
      const fdHz = (fUl / C_KM_S) * v * ((R_E * Math.cos(E)) / (R_E + h));
      const fdMaxHz = (fUl / C_KM_S) * v * (R_E / (R_E + h));
      const rateHzS = (fUl / C_KM_S) * ((v * v * R_E) / ((R_E + h) * h));
      steps.push(st('bac', 'Vitesse du satellite', 'v = √(μ / (R + h))', `v = √(398 600 / ${f0(R_E + h)})`, v, 'km/s', `Le satellite traverse le ciel en quelques minutes (≈ ${f0(v * 3600)} km/h).`));
      steps.push(st('licence', 'Doppler maximal (montant, à l’élévation E)', 'f_d = (f/c) × v × R·cos E / (R + h)', `f_d = (${f0(band.ulMHz)}·10⁶ / 299 792) × ${f2(v)} × 6378·cos ${f1(elevationDeg)}° / ${f0(R_E + h)}`, fdHz / 1000, 'kHz', `Maximum absolu à l’horizon : ±${f1(fdMaxHz / 1000)} kHz, à comparer à l’espacement des sous-porteuses (${tech.scsKHz} kHz).`));
      steps.push(st('master', 'Dérive Doppler maximale (au zénith)', 'ḟ_d = (f/c) × v² × R / ((R + h) × h)', `ḟ_d = (${f0(band.ulMHz)}·10⁶ / 299 792) × ${f2(v)}² × 6378 / (${f0(R_E + h)} × ${f0(h)})`, rateHzS, 'Hz/s'));
      const tolHz = (UL_FREQ_TOL_PPM * fUl) / 1e6;
      let residualHz;
      let method;
      const ntn = o.ntnCapable != null ? o.ntnCapable : prof.precomp === 'gnss';
      if (ntn) {
        method = 'gnss';
        const age = Math.max(0, o.ephemerisAgeS != null ? o.ephemerisAgeS : 60);
        const dvMs = 0.01 + 0.0015 * age; // erreur de vitesse (m/s) des éphémérides propagées
        residualHz = (fUl * dvMs) / (C_KM_S * 1000);
        steps.push(st('master', 'Doppler résiduel après précompensation GNSS', 'Δf = f × δv / c,   δv ≈ 0,01 + 0,0015 × âge (m/s)', `δv = 0,01 + 0,0015 × ${f0(age)} s = ${f3(dvMs)} m/s`, residualHz, 'Hz', `Le terminal NTN calcule sa position (GNSS) et celle du satellite (éphémérides diffusées, SIB31 / SIB19) puis décale sa fréquence d’émission. Tolérance : ±${f0(tolHz)} Hz (0,1 ppm).`));
      } else {
        method = 'satellite';
        const r = (o.beamDiameterKm || prof.beamDiameterKm) / 2;
        const slope = (fUl / C_KM_S) * (v / h) * (R_E / (R_E + h)); // Hz par km au sol, près du nadir
        residualHz = slope * r;
        steps.push(st('master', 'Doppler différentiel dans le faisceau (précompensation côté satellite)', 'Δf ≈ (f/c) × (v/h) × R/(R+h) × r_faisceau', `Δf ≈ ${f1(slope)} Hz/km × ${f1(r)} km`, residualHz, 'Hz', 'Le satellite corrige le Doppler au centre de chaque faisceau : un smartphone non modifié ne voit que l’écart entre sa position et ce centre, d’où des faisceaux étroits.'));
      }
      const tol = method === 'gnss' ? tolHz : 0.1 * tech.scsKHz * 1000;
      const ulOk = residualHz <= tol;
      return { maxKHz: fdMaxHz / 1000, atElKHz: fdHz / 1000, rateHzS, residualHz, tolHz: tol, ulOk, method, speedKmS: v, steps };
    },

    /* ---------------- Délais et synchronisation ---------------- */

    /**
     * Délais : aller simple, RTT radio (avec liaison de connexion si charge utile
     * transparente), avance temporelle commune / différentielle, K_offset, HARQ.
     */
    timing(prof, slantKm, tech, o = {}) {
      const steps = [];
      const transparent = prof.payload === 'transparent';
      const feederKm = transparent ? SP.slantRangeFromElevationKm(prof.altitudeKm, prof.gatewayElevationDeg || 40) : 0;
      const oneWayMs = ((slantKm + feederKm) / C_KM_S) * 1000;
      const rttRadioMs = 2 * oneWayMs;
      const serviceRttMs = ((2 * slantKm) / C_KM_S) * 1000;
      const rttAppMs = rttRadioMs + 2 * prof.processingMs + (prof.isl ? 10 : 0);
      steps.push(st('bac', 'Temps de propagation terminal → satellite', 't = d / c', `t = ${f0(slantKm)} / 299 792`, (slantKm / C_KM_S) * 1000, 'ms'));
      steps.push(st('licence', transparent ? 'RTT radio (terminal ↔ satellite ↔ station sol)' : 'RTT radio (station de base à bord)', transparent ? 'RTT = 2 × (d_service + d_feeder) / c' : 'RTT = 2 × d / c', transparent ? `RTT = 2 × (${f0(slantKm)} + ${f0(feederKm)}) / 299 792` : `RTT = 2 × ${f0(slantKm)} / 299 792`, rttRadioMs, 'ms', transparent ? 'Charge utile transparente : la station de base est au sol, le signal fait deux allers-retours spatiaux.' : 'Station de base embarquée : seule la liaison terminal ↔ satellite compte pour la radio.'));
      steps.push(st('bac', 'Latence aller-retour vue par l’application', 'RTT_app = RTT_radio + traitements' + (prof.isl ? ' + liaisons inter-satellites' : ''), `RTT_app = ${f1(rttRadioMs)} + 2 × ${f0(prof.processingMs)}${prof.isl ? ' + 10' : ''}`, rttAppMs, 'ms'));
      // Avance temporelle différentielle dans le faisceau
      const r = (o.beamDiameterKm || prof.beamDiameterKm) / 2;
      const dDiffKm = r * Math.cos(Util.deg2rad(o.elevationDeg != null ? o.elevationDeg : 60));
      const taDiffUs = ((2 * dDiffKm) / C_KM_S) * 1e6;
      steps.push(st('master', 'Écart d’avance temporelle entre centre et bord du faisceau', 'ΔTA = 2 × r × cos E / c', `ΔTA = 2 × ${f1(r)} × cos ${f1(o.elevationDeg != null ? o.elevationDeg : 60)}° / 299 792`, taDiffUs, 'µs', `Un terminal NTN calcule son avance (TA commun diffusé + TA propre GNSS). Un terminal non modifié s’appuie sur le préfixe aléatoire PRACH : l’écart doit rester petit devant ~100 µs.`));
      const kOffset = Math.ceil(serviceRttMs + (transparent ? ((2 * feederKm) / C_KM_S) * 1000 : 0));
      const harqNeed = Math.ceil(rttRadioMs + HARQ_PROC_MS);
      steps.push(st('master', 'Décalage d’ordonnancement K_offset (sous-trames de 1 ms)', 'K_offset ≥ ⌈RTT_radio⌉', `K_offset ≥ ⌈${f1(rttRadioMs)}⌉`, kOffset, 'ms'));
      steps.push(st('master', 'Processus HARQ nécessaires pour un débit continu', 'N_HARQ = ⌈RTT_radio + 8 ms⌉', `N_HARQ = ⌈${f1(rttRadioMs)} + 8⌉`, harqNeed, '', harqNeed > 32 ? 'Au-delà de 32 processus (limite NTN Rel-17), il faut désactiver le HARQ (fiabilité assurée par RLC).' : harqNeed > tech.harqMax ? `Plus que les ${tech.harqMax} processus de la technologie terrestre : le débit d’un terminal plafonne à ${f0((100 * tech.harqMax) / harqNeed)} % du débit nominal.` : ''));
      const nonNtn = prof.precomp === 'satellite';
      const taOk = nonNtn ? taDiffUs <= 100 : true;
      return { oneWayMs, rttRadioMs, rttAppMs, serviceRttMs, feederKm, taDiffUs, kOffset, harqNeed, harqEff: Math.min(1, tech.harqMax / harqNeed), taOk, steps };
    },

    /* ---------------- Passage d'un satellite ---------------- */

    /**
     * Série temporelle d'un passage culminant à maxElDeg : élévation, distance,
     * Doppler, délai. Point de départ des analyseurs (courbe en S du Doppler).
     */
    passTimeline(profileId, o = {}) {
      const prof = D2D.getProfile(profileId);
      const band = D2D.getBand(o.band || prof.band);
      const h = prof.altitudeKm;
      const T = SP.orbitalPeriodMin(h) * 60;
      const w = (2 * Math.PI) / T;
      const minEl = o.minElevationDeg != null ? o.minElevationDeg : prof.minElevationDeg;
      const maxEl = Util.clamp(o.maxElevationDeg != null ? o.maxElevationDeg : 80, minEl + 1, 90);
      const thc = Math.max(0, SP.centralAngleRad(h, maxEl));
      const thMin = SP.centralAngleRad(h, minEl);
      const half = thMin > thc ? Math.acos(Math.cos(thMin) / Math.cos(thc)) / w : 0;
      const dt = o.stepS || 10;
      const pts = [];
      const distAt = (t) => SP.slantFromCentralKm(h, Math.acos(Math.cos(thc) * Math.cos(w * t)));
      for (let t = -half; t <= half + 1e-9; t += dt) {
        const theta = Math.acos(Math.cos(thc) * Math.cos(w * t));
        const el = SP.elevationFromCentralDeg(h, theta);
        const dKm = distAt(t);
        const rr = (distAt(t + 0.5) - distAt(t - 0.5)) / 1; // km/s
        pts.push({ t: t + half, el, dKm, dopplerKHz: SP.dopplerKHz(band.ulMHz / 1000, rr), delayMs: (dKm / C_KM_S) * 1000 });
      }
      return { durationS: 2 * half, maxEl, minEl, points: pts };
    },

    /* ---------------- Couverture et constellation ---------------- */

    /**
     * Couverture d'un satellite et taille de constellation pour un service continu :
     *   θ = arccos(R·cos E_min / (R + h)) − E_min,   A = 2πR²·(1 − cos θ)
     *   N_continu ≈ 4πR² / (0,827 × A)   (pavage hexagonal des disques)
     * Revisite (constellation clairsemée, orbites polaires) :
     *   passages/jour ≈ N × (révolutions/jour) × 2θ / (π·cos φ)
     */
    coverage(o = {}) {
      const prof = D2D.getProfile(o.profile);
      const h = o.altitudeKm || prof.altitudeKm;
      const minEl = o.minElevationDeg != null ? o.minElevationDeg : prof.minElevationDeg;
      const N = o.satsTotal != null ? o.satsTotal : prof.satsTotal;
      const lat = o.latDeg != null ? o.latDeg : 12.37;
      const steps = [];
      if (prof.orbit === 'GEO') {
        steps.push(st('bac', 'Couverture d’un satellite GEO', 'permanente sur environ un tiers de la Terre', '', 100, '%'));
        return { thetaDeg: 81.3, radiusKm: 9000, areaKm2: EARTH_AREA_KM2 * 0.34, nContinuous: 3, availability: 1, passesPerDay: Infinity, meanGapMin: 0, passMin: Infinity, storeForwardMin: 0, steps };
      }
      const theta = SP.centralAngleRad(h, minEl);
      const radius = R_E * theta;
      const area = 2 * Math.PI * R_E * R_E * (1 - Math.cos(theta));
      const nCont = Math.ceil(EARTH_AREA_KM2 / (0.827 * area));
      const availability = Math.min(1, N / nCont);
      const periodMin = SP.orbitalPeriodMin(h);
      const revs = 1440 / periodMin;
      const passesPerDay = (N * revs * 2 * theta) / (Math.PI * Math.max(Math.cos(Util.deg2rad(lat)), 0.2));
      const passMin = ((2 * theta) / (2 * Math.PI)) * periodMin * 0.7; // passage moyen (pas toujours au zénith)
      const meanGapMin = passesPerDay > 0 ? Math.max(0, 1440 / passesPerDay - passMin) : Infinity;
      const gw = Math.max(1, o.gateways || prof.gateways || 1);
      const waitGwMin = periodMin / (2 * gw);
      const sfMin = availability >= 1 ? 0 : meanGapMin / 2 + waitGwMin;
      steps.push(st('licence', 'Demi-angle au centre de la zone couverte', 'θ = arccos(R·cos E_min / (R + h)) − E_min', `θ = arccos(6378·cos ${f0(minEl)}° / ${f0(R_E + h)}) − ${f0(minEl)}°`, Util.rad2deg(theta), '°'));
      steps.push(st('bac', 'Rayon de la zone couverte par un satellite', 'r = R × θ (rad)', `r = 6378 × ${f3(theta)}`, radius, 'km'));
      steps.push(st('licence', 'Surface couverte par un satellite', 'A = 2π·R²·(1 − cos θ)', `A = 2π × 6378² × (1 − cos ${f2(Util.rad2deg(theta))}°)`, area / 1e6, 'millions de km²'));
      steps.push(st('master', 'Satellites nécessaires pour une couverture continue', 'N ≈ 4π·R² / (0,827 × A)', `N ≈ ${f0(EARTH_AREA_KM2 / 1e6)}·10⁶ / (0,827 × ${f2(area / 1e6)}·10⁶)`, nCont, 'satellites', 'Minimum géométrique (une couverture simple) ; la capacité impose beaucoup plus de satellites.'));
      steps.push(st('licence', 'Disponibilité moyenne du service', 'Disp ≈ min(1 ; N_réel / N_continu)', `Disp ≈ min(1 ; ${N} / ${nCont})`, availability * 100, '%'));
      if (availability < 1) {
        steps.push(st('licence', 'Passages par jour au-dessus du site', 'n ≈ N × (révolutions/jour) × 2θ / (π·cos φ)', `n ≈ ${N} × ${f2(revs)} × ${f3(2 * theta)} / (π × cos ${f1(lat)}°)`, passesPerDay, 'passages/j'));
        steps.push(st('licence', 'Attente moyenne entre deux passages', 'Δt ≈ 1440 / n − durée d’un passage', `Δt ≈ 1440 / ${f1(passesPerDay)} − ${f1(passMin)}`, meanGapMin, 'min'));
        if (prof.storeForward) steps.push(st('master', 'Délai moyen de livraison en stockage et retransmission', 'τ ≈ Δt/2 + T_orbite / (2 × N_stations)', `τ ≈ ${f1(meanGapMin)}/2 + ${f1(periodMin)} / (2 × ${gw})`, sfMin, 'min', 'Le message attend un satellite, voyage à bord, puis est déposé à la station sol suivante.'));
      }
      return { thetaDeg: Util.rad2deg(theta), radiusKm: radius, areaKm2: area, nContinuous: nCont, availability, passesPerDay, meanGapMin, passMin, storeForwardMin: sfMin, periodMin, steps };
    },

    /* ---------------- Charge d'un faisceau ---------------- */

    /**
     * Utilisateurs actifs dans un faisceau et débit par utilisateur :
     *   N_actifs = densité × surface × taux d'abonnés satellite × taux d'activité
     */
    beamLoad(o = {}) {
      const diam = o.beamDiameterKm || 30;
      const area = (Math.PI * diam * diam) / 4;
      const pop = (o.densityPerKm2 != null ? o.densityPerKm2 : 50) * area;
      const users = pop * ((o.penetrationPct != null ? o.penetrationPct : 2) / 100);
      const active = Math.max(1, users * ((o.activityPct != null ? o.activityPct : 5) / 100));
      const capKbps = o.capacityKbps || 0;
      const perUser = capKbps / active;
      const steps = [
        st('bac', 'Surface du faisceau', 'S = π × Ø² / 4', `S = π × ${f0(diam)}² / 4`, area, 'km²'),
        st('bac', 'Utilisateurs actifs en même temps', 'N = densité × S × abonnés × activité', `N = ${f0(o.densityPerKm2 != null ? o.densityPerKm2 : 50)} × ${f0(area)} × ${f1(o.penetrationPct != null ? o.penetrationPct : 2)} % × ${f1(o.activityPct != null ? o.activityPct : 5)} %`, active, 'utilisateurs'),
        st('licence', 'Débit moyen par utilisateur actif', 'D_u = D_faisceau / N', `D_u = ${f0(capKbps)} / ${f0(active)}`, perUser, 'kbit/s', 'Une cellule satellite est partagée par des milliers d’abonnés potentiels : le service direct convient aux faibles débits.'),
      ];
      return { areaKm2: area, population: pop, users, active, perUserKbps: perUser, steps };
    },

    /* ---------------- Services progressifs ---------------- */

    /**
     * Services disponibles pour une liaison calculée par computeD2DLink.
     * @param {object} link       résultat de computeD2DLink
     * @param {object} o          { activeUsers, coverage (résultat de coverage) }
     */
    services(link, o = {}) {
      const n = Math.max(1, o.activeUsers || 1);
      const cov = o.coverage;
      const intermittent = cov && cov.availability < 1;
      const dlU = link.dl.rate.kbps / n;
      const ulU = link.ul.best.kbps / Math.max(1, Math.ceil(n / 4)); // ressources montantes partagées en temps
      return SERVICES.map((s) => {
        const reasons = [];
        if (!link.geometry.visible) reasons.push('satellite non visible');
        if (link.dl.sinrDb + (link.dl.rate.gainDb || 0) < s.minSnrDb || !link.dl.rate.kbps) reasons.push('signal trop faible');
        if (!s.dlOnly && !link.ulOk) reasons.push('liaison montante impossible');
        // Service conversationnel : débit garanti par utilisateur ; message (SMS, IoT, alerte) : mis en file, il suffit que le faisceau l'écoule
        const dlAv = s.realtime ? dlU : link.dl.rate.kbps;
        const ulAv = s.realtime ? ulU : link.ul.best.kbps;
        if (dlAv < s.dlKbps) reasons.push(`débit descendant ${f1(dlAv)} < ${f1(s.dlKbps)} kbit/s`);
        if (!s.dlOnly && ulAv < s.ulKbps) reasons.push(`débit montant ${f1(ulAv)} < ${f1(s.ulKbps)} kbit/s`);
        if (link.timing.rttAppMs > s.maxRttMs) reasons.push(`latence ${f0(link.timing.rttAppMs)} ms > ${f0(s.maxRttMs)} ms`);
        if (intermittent && s.realtime) reasons.push('couverture intermittente');
        let state = reasons.length ? 'ko' : 'ok';
        if (state === 'ok' && intermittent) state = 'differe';
        return { id: s.id, label: s.label, phase: s.phase, state, reasons };
      });
    },

    /* ---------------- Autonomie IoT ---------------- */

    /**
     * Autonomie d'un objet IoT-NTN (PSM) :
     *   Q_message = I_GNSS·t_GNSS + I_rx·t_rx + I_tx·t_tx (+ queue de connexion sans RAI)
     *   t_tx = (8·octets + 160) / D_montant × R_rép   (débit hors répétitions)
     *   I_moy = Q_jour / 24 h + I_veille ;   autonomie = 0,8 × C / I_moy
     */
    iotBattery(o = {}) {
      const P = IOT_POWER;
      const capMAh = o.capacityMAh || 5000;
      const perDay = o.reportsPerDay != null ? o.reportsPerDay : 24;
      const bytes = o.payloadBytes || 50;
      const ulKbps = Math.max(0.01, o.ulKbps || 2);
      const reps = Math.max(1, o.repetitions || 1);
      const gnssS = o.gnssFixS != null ? o.gnssFixS : 5;
      const rxS = (o.rxS != null ? o.rxS : 1.5) * Math.sqrt(reps);
      const rai = o.rai !== false;
      const tailS = rai ? 0 : 2;
      const txS = ((8 * bytes + 160) / (ulKbps * 1000)) * reps;
      const qMsgMAs = P.gnssMa * gnssS + P.rxMa * (rxS + tailS) + P.txMa * txS; // mA·s
      const qDayMAh = (qMsgMAs * perDay) / 3600;
      const iAvgMa = qDayMAh / 24 + P.sleepUa / 1000;
      const years = (0.8 * capMAh) / iAvgMa / 8760;
      const steps = [
        st('licence', 'Durée d’émission d’un message', 't_tx = (8 × octets + 160) / D × R', `t_tx = (8 × ${bytes} + 160) / ${f2(ulKbps * 1000)} × ${reps}`, txS, 's'),
        st('licence', 'Charge consommée par message', 'Q = I_GNSS·t_GNSS + I_rx·t_rx + I_tx·t_tx', `Q = ${P.gnssMa} × ${f1(gnssS)} + ${P.rxMa} × ${f2(rxS + tailS)} + ${P.txMa} × ${f2(txS)}`, qMsgMAs, 'mA·s', 'Spécificité NTN : le module doit refaire un point GNSS avant d’émettre (précompensation Doppler et avance temporelle).'),
        st('bac', 'Courant moyen', 'I_moy = Q × messages/jour / 24 h + I_veille', `I_moy = ${f1(qMsgMAs)} × ${perDay} / 86 400 + ${f3(P.sleepUa / 1000)}`, iAvgMa * 1000, 'µA'),
        st('bac', 'Autonomie de la pile', 'Autonomie = 0,8 × C / I_moy   (20 % de marge : autodécharge, froid/chaleur)', `Autonomie = 0,8 × ${f0(capMAh)} mAh / ${f3(iAvgMa)} mA`, years, 'ans', years >= 10 ? 'Objectif 10 ans atteint.' : 'Objectif 10 ans non atteint : réduire la fréquence des messages, le temps GNSS ou les répétitions.'),
      ];
      return { txS, rxS, qMsgMAs, iAvgUa: iAvgMa * 1000, years, steps };
    },

    /* ---------------- Choix terrestre / satellite ---------------- */

    /**
     * Sélection du réseau d'accès par le terminal. Le réseau terrestre reste
     * prioritaire ; le satellite n'est choisi qu'en dessous du seuil de
     * couverture terrestre, si le terminal, la carte SIM et l'accord entre
     * l'opérateur et le système satellite le permettent.
     * Messages génériques : ils ne nomment jamais une panne cachée.
     */
    selectAccess(o = {}) {
      const thr = o.thresholdDbm != null ? o.thresholdDbm : -115;
      const terr = o.terrestrialRsrpDbm;
      const sat = o.satelliteOk;
      if (terr != null && terr >= thr) return { access: 'terrestre', reason: `Réseau terrestre disponible (RSRP ${f0(terr)} dBm ≥ ${f0(thr)} dBm) : prioritaire.` };
      if (!sat) return { access: 'aucun', reason: 'Aucun réseau : pas de couverture terrestre et pas de signal satellite exploitable.' };
      if (o.terminalCompatible === false) return { access: 'aucun', reason: 'Aucun réseau : le terminal ne trouve aucune cellule qu’il sache utiliser.' };
      if (o.subscriptionOk === false) return { access: 'aucun', reason: 'Cellule satellite détectée mais inscription refusée : urgences seulement.' };
      return { access: 'satellite', reason: terr != null ? `Hors couverture terrestre (RSRP ${f0(terr)} dBm < ${f0(thr)} dBm) : bascule sur la cellule satellite.` : 'Zone blanche : rattachement à la cellule satellite.' };
    },

    /* ---------------- Cellule terrestre (comparaison) ---------------- */

    /**
     * Bilan descendant d'une cellule 4G terrestre (Okumura-Hata ≤ 1 500 MHz,
     * COST-231 Hata au-delà), pour comparer avec le satellite et décider de la
     * bascule :
     *   L_urbain = A + B·log f − 13,82·log h_b − a(h_m) + (44,9 − 6,55·log h_b)·log d
     *   rural ouvert : L = L_urbain − 4,78·(log f)² + 18,33·log f − 40,94
     *   suburbain    : L = L_urbain − 2·(log(f/28))² − 5,4
     *   RSRP = P_tx − 10·log(12·N_RB) + G_bts − L_câbles − L − M_SF + G_term − L_corps − L_env
     */
    terrestrialCell(o = {}) {
      const band = D2D.getBand(o.band || 'B20');
      const f = band.dlMHz;
      const term = D2D.getTerminal(o.terminal);
      const env = D2D.getEnvironment(o.environment);
      const terrain = o.terrain || 'rural';
      const hb = Util.clamp(o.hbM || 30, 10, 200);
      const hm = 1.5;
      const d = Math.max(0.05, o.dKm || 1);
      const chMHz = o.channelMHz || 10;
      const nRb = Math.max(1, Math.round((chMHz * 1000 * 0.9) / RB_KHZ));
      const lf = Math.log10(f);
      const ahm = (1.1 * lf - 0.7) * hm - (1.56 * lf - 0.8);
      const slope = 44.9 - 6.55 * Math.log10(hb);
      const base = (f <= 1500 ? 69.55 + 26.16 * lf : 46.3 + 33.9 * lf) - 13.82 * Math.log10(hb) - ahm;
      const corr = terrain === 'rural' ? -4.78 * lf * lf + 18.33 * lf - 40.94 : terrain === 'suburbain' ? -2 * Math.pow(Math.log10(f / 28), 2) - 5.4 : 0;
      const loss = base + slope * Math.log10(d) + corr;
      const sigma = terrain === 'urbain' ? 8 : 6;
      const msf = SHADOW_QUANTILE * sigma;
      const pRe = (o.txDbm != null ? o.txDbm : 46) - Util.linToDb(12 * nRb);
      const fixed = pRe + (o.gainDbi != null ? o.gainDbi : 17) - 2 + term.gainDbi - term.bodyLossDb - env.lossDb - msf - (o.hiddenLossDb || 0);
      const rsrp = fixed - loss;
      const nRe = -174 + Util.linToDb(15000) + term.nfDb;
      const snr = rsrp - nRe;
      const rate = D2D.linkRate(snr, nRb * RB_KHZ, 'LTE', 'dl');
      const thr = o.thresholdDbm != null ? o.thresholdDbm : -115;
      const radiusKm = Math.pow(10, (fixed - thr - base - corr) / slope);
      const steps = [
        st('licence', `Affaiblissement de parcours (${f <= 1500 ? 'Okumura-Hata' : 'COST-231 Hata'}, ${terrain})`, 'L = A + B·log f − 13,82·log h_b − a(h_m) + (44,9 − 6,55·log h_b)·log d + correction', `f = ${f0(f)} MHz ; h_b = ${f0(hb)} m ; d = ${f2(d)} km`, loss, 'dB'),
        st('master', 'Marge d’ombrage terrestre (90 % des emplacements)', 'M_SF = 1,28 × σ', `M_SF = 1,28 × ${sigma}`, msf, 'dB'),
        st('bac', 'RSRP de la cellule terrestre', 'RSRP = P_tx − 10·log(12·N_RB) + G_bts − 2 − L − M_SF + G_term − L_corps − L_env', `RSRP = ${f0(o.txDbm != null ? o.txDbm : 46)} − 10·log(12 × ${nRb}) + ${f0(o.gainDbi != null ? o.gainDbi : 17)} − 2 − ${f1(loss)} − ${f1(msf)} + ${f1(term.gainDbi)} − ${f0(term.bodyLossDb)} − ${f0(env.lossDb)}`, rsrp, 'dBm', rsrp >= thr ? 'Couverture terrestre suffisante : le terminal y reste.' : 'Sous le seuil de couverture : le terminal cherche une autre cellule (satellite).'),
        st('licence', 'Rayon de couverture de la cellule', 'd_max tel que RSRP(d_max) = seuil', `seuil ${f0(thr)} dBm`, radiusKm, 'km'),
      ];
      return { band, rsrp, snr, rate, radiusKm, lossDb: loss, nRb, steps };
    },

    /* ---------------- Coexistence ---------------- */

    /**
     * Densité de flux surfacique au sol et brouillage d'un réseau terrestre
     * co-canal (même spectre opérateur) :
     *   PFD = PIRE − L_lobes − 10·log(4π·d²) − 10·log(B_MHz)   [dBW/m²/MHz]
     *   I   = PFD + 10·log(B_MHz) + 10·log(λ²/4π) + G_term      [dBW]
     */
    coexistence(o = {}) {
      const eirp = o.eirpDbw != null ? o.eirpDbw : 40;
      const side = o.sidelobeDb != null ? o.sidelobeDb : 0;
      const dKm = o.slantKm || 600;
      const bw = o.bwMHz || 5;
      const fMHz = o.fMHz || 1962;
      const lambda = 299.792458 / fMHz;
      const pfd = eirp - side - 10 * Math.log10(4 * Math.PI * Math.pow(dKm * 1000, 2)) - 10 * Math.log10(bw);
      const iDbm = pfd + 10 * Math.log10(bw) + 10 * Math.log10((lambda * lambda) / (4 * Math.PI)) + (o.ueGainDbi || 0) + 30;
      const ok = pfd <= PFD_LIMIT_DBW_M2_MHZ;
      const ci = o.terrestrialCdBm != null ? o.terrestrialCdBm - iDbm : null;
      const steps = [
        st('master', 'Densité de flux surfacique au sol', 'PFD = PIRE − L_lobes − 10·log(4π·d²) − 10·log(B)', `PFD = ${f1(eirp)} − ${f1(side)} − 10·log(4π × (${f0(dKm)}·10³)²) − 10·log(${f1(bw)})`, pfd, 'dBW/m²/MHz', `Limite hors zone : ${PFD_LIMIT_DBW_M2_MHZ} dBW/m²/MHz${ok ? ' — respectée.' : ' — DÉPASSÉE : le faisceau brouille le réseau terrestre voisin.'}`),
        st('master', 'Brouillage reçu par un terminal terrestre', 'I = PFD + 10·log(B) + 10·log(λ²/4π) + G', `I = ${f1(pfd)} + 10·log(${f1(bw)}) + 10·log(${f3(lambda)}² / 4π) + ${f1(o.ueGainDbi || 0)}`, iDbm, 'dBm'),
      ];
      if (ci != null) steps.push(st('master', 'C/I du réseau terrestre', 'C/I = C_terrestre − I', `C/I = ${f1(o.terrestrialCdBm)} − (${f1(iDbm)})`, ci, 'dB'));
      return { pfd, iDbm, ok, ci, steps };
    },
  };

  MBV.D2D = D2D;
})(typeof window !== 'undefined' ? window : globalThis);
