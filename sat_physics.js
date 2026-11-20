/* =====================================================================
 * sat_physics.js — Moteur de calcul des liaisons satellitaires VSAT
 * MicroWave, BLR & VSAT Lab
 *
 * Contenu (MBV.SatPhysics) :
 *   - Orbites GEO / MEO / LEO : géométrie, période, distance oblique
 *   - Bandes C / Ku / Ka : fréquences montante/descendante, polarisation
 *   - Pointage GEO : azimut, élévation, skew (polarisation) + dépointage
 *   - Pluie sur trajet oblique (UIT-R P.618 simplifié) + bruit de ciel
 *   - Stations terriennes : PIRE (BUC/HPA + antenne), G/T (antenne + LNB)
 *   - Bilan aller (Hub → VSAT) et retour (VSAT → Hub), montant + descendant
 *   - C/N0, C/N, Es/N0, Eb/N0, ACM DVB-S2X, débit, latence RTT
 *
 * Dépend de radio_physics.js (MBV.Util, MBV.RadioPhysics) chargé avant.
 * ===================================================================== */
(function (root) {
  'use strict';

  const MBV = (root.MBV = root.MBV || {});
  const Util = MBV.Util;
  const RP = MBV.RadioPhysics;
  if (!Util || !RP) {
    throw new Error('sat_physics.js nécessite radio_physics.js chargé avant.');
  }
  const f1 = (v) => Util.fmt(v, 1);
  const f2 = (v) => Util.fmt(v, 2);

  /* ------------------------------------------------------------------
   * 1. CONSTANTES
   * ------------------------------------------------------------------ */
  const EARTH_RADIUS_KM = 6378.137; // rayon équatorial
  const MU_KM3_S2 = 398600.4418; // constante gravitationnelle terrestre
  const C_KM_S = 299792.458;
  const BOLTZMANN_DBW = -228.6; // 10·log(1,38·10⁻²³)
  const T0 = 290; // température de référence (K)
  const RAIN_MEDIUM_TEMP_K = 275; // température physique de la pluie (bruit de ciel)
  const RAIN_HEIGHT_TROPICAL_KM = 5.0; // hauteur de pluie hR (UIT-R P.839, zone tropicale)
  const GAS_EQUIV_HEIGHT_KM = 2.5; // hauteur équivalente simplifiée des gaz absorbants
  const CARRIER_ROLLOFF = 0.2; // roll-off DVB-S2X typique
  const IMPLEMENTATION_MARGIN_DB = 0.5; // marge d'implémentation du modem
  const C_I_SYSTEM_DB = 20; // C/I global : intermodulation + satellites adjacents + polar. croisée

  /* ------------------------------------------------------------------
   * 2. CATALOGUES
   * ------------------------------------------------------------------ */

  /**
   * Orbites. eirpOffset/gtOffset : écart des performances du satellite par
   * rapport à un GEO (satellites plus petits mais beaucoup plus proches).
   * processingMs : retards de traitement (trames TDMA/ACM, ordonnancement, routage).
   * minElevation : élévation minimale d'exploitation.
   */
  const ORBITS = {
    GEO: {
      id: 'GEO',
      label: 'GEO — Géostationnaire',
      altitudeKm: 35786,
      eirpOffset: 0,
      gtOffset: 0,
      processingMs: 40,
      minElevation: 5,
      defaultElevation: null, // calculée à partir de la longitude du satellite
      tracking: false,
      description: 'Immobile dans le ciel : antenne fixe, couverture d’un tiers de la Terre, mais latence élevée.',
    },
    MEO: {
      id: 'MEO',
      label: 'MEO — Orbite moyenne (type O3b)',
      altitudeKm: 8062,
      eirpOffset: -6,
      gtOffset: -4,
      processingMs: 10,
      minElevation: 10,
      defaultElevation: 45,
      tracking: true,
      description: 'Défile lentement (≈ 6 h par tour) : antennes motorisées de poursuite, latence moyenne.',
    },
    LEO: {
      id: 'LEO',
      label: 'LEO — Orbite basse (type Starlink / OneWeb)',
      altitudeKm: 550,
      eirpOffset: -15,
      gtOffset: -10,
      processingMs: 20,
      minElevation: 25,
      defaultElevation: 60,
      tracking: true,
      description: 'Défile très vite (≈ 95 min par tour) : constellation de centaines de satellites, antenne plate à balayage électronique, faible latence.',
    },
  };

  /**
   * Bandes satellitaires. up/down en GHz.
   * satEirpDbw / satGtDbK : performances typiques d'un satellite GEO en centre de faisceau.
   * transponderMHz : largeur d'un répéteur.
   */
  const BANDS = {
    C: {
      id: 'C',
      label: 'Bande C (6/4 GHz)',
      upGHz: 6.175,
      downGHz: 3.95,
      polarization: 'circulaire',
      satEirpDbw: 40,
      satGtDbK: -2,
      transponderMHz: 36,
      remark: 'Très résistante à la pluie, grandes antennes nécessaires (faible gain).',
    },
    Ku: {
      id: 'Ku',
      label: 'Bande Ku (14/12 GHz)',
      upGHz: 14.25,
      downGHz: 11.7,
      polarization: 'linéaire',
      satEirpDbw: 50,
      satGtDbK: 2,
      transponderMHz: 36,
      remark: 'Compromis classique VSAT : antennes 0,75 à 2,4 m, sensible aux fortes pluies.',
    },
    Ka: {
      id: 'Ka',
      label: 'Bande Ka (30/20 GHz)',
      upGHz: 29.75,
      downGHz: 19.95,
      polarization: 'circulaire',
      satEirpDbw: 60,
      satGtDbK: 15,
      transponderMHz: 250,
      remark: 'Très haut débit (satellites HTS à spots), mais très sensible aux orages.',
    },
  };

  /** Diamètres d'antennes VSAT distantes et de Hub (m). */
  const VSAT_DISHES = [0.75, 1.2, 1.8, 2.4];
  const HUB_DISHES = [4.5, 6.3, 7.3, 9.0];
  /** Puissances BUC (VSAT) et HPA/SSPA (Hub) en watts. */
  const BUC_POWERS = [2, 4, 8, 16];
  const HPA_POWERS = [50, 100, 200, 400];
  const ANTENNA_EFFICIENCY = 0.65; // antennes offset VSAT
  const FEED_LOSS_DB = 0.5; // pertes guide d'onde / cornet côté émission

  /**
   * MODCOD DVB-S2X (normal frame). esn0 = Es/N0 requis (dB, canal AWGN, PER 10⁻⁷),
   * eff = efficacité spectrale (bit/symbole utile).
   */
  const MODCODS = [
    { id: 'QPSK 1/4', family: 'QPSK', esn0: -2.35, eff: 0.49 },
    { id: 'QPSK 1/2', family: 'QPSK', esn0: 1.0, eff: 0.99 },
    { id: 'QPSK 2/3', family: 'QPSK', esn0: 3.1, eff: 1.32 },
    { id: 'QPSK 3/4', family: 'QPSK', esn0: 4.03, eff: 1.49 },
    { id: 'QPSK 5/6', family: 'QPSK', esn0: 5.18, eff: 1.65 },
    { id: '8PSK 2/3', family: '8PSK', esn0: 6.62, eff: 1.98 },
    { id: '8PSK 3/4', family: '8PSK', esn0: 7.91, eff: 2.23 },
    { id: '8PSK 5/6', family: '8PSK', esn0: 9.35, eff: 2.48 },
    { id: '16APSK 2/3', family: '16APSK', esn0: 8.97, eff: 2.64 },
    { id: '16APSK 3/4', family: '16APSK', esn0: 10.21, eff: 2.97 },
    { id: '16APSK 5/6', family: '16APSK', esn0: 11.61, eff: 3.3 },
    { id: '32APSK 3/4', family: '32APSK', esn0: 12.73, eff: 3.7 },
    { id: '32APSK 4/5', family: '32APSK', esn0: 13.64, eff: 3.95 },
    { id: '32APSK 5/6', family: '32APSK', esn0: 14.28, eff: 4.12 },
    { id: '32APSK 9/10', family: '32APSK', esn0: 16.05, eff: 4.45 },
  ];

  /* ------------------------------------------------------------------
   * 3. MOTEUR
   * ------------------------------------------------------------------ */
  const SatPhysics = {
    EARTH_RADIUS_KM,
    C_KM_S,
    BOLTZMANN_DBW,
    ORBITS,
    BANDS,
    VSAT_DISHES,
    HUB_DISHES,
    BUC_POWERS,
    HPA_POWERS,
    MODCODS,
    C_I_SYSTEM_DB,
    IMPLEMENTATION_MARGIN_DB,

    getOrbit(id) {
      return ORBITS[id] || ORBITS.GEO;
    },
    getBand(id) {
      return BANDS[id] || BANDS.Ku;
    },
    getModcod(id) {
      return MODCODS.find((m) => m.id === id) || MODCODS[MODCODS.length - 1];
    },

    /* ---------------- Orbites ---------------- */

    /** Période orbitale (min) : T = 2π·√(a³/μ). */
    orbitalPeriodMin(altitudeKm) {
      const a = EARTH_RADIUS_KM + altitudeKm;
      return (2 * Math.PI * Math.sqrt(Math.pow(a, 3) / MU_KM3_S2)) / 60;
    },
    /** Vitesse orbitale (km/s) : v = √(μ/a). */
    orbitalSpeedKmS(altitudeKm) {
      return Math.sqrt(MU_KM3_S2 / (EARTH_RADIUS_KM + altitudeKm));
    },
    /**
     * Distance oblique station → satellite (km) pour une élévation donnée :
     * d = √((R+h)² − (R·cos E)²) − R·sin E
     */
    slantRangeFromElevationKm(altitudeKm, elevationDeg) {
      const R = EARTH_RADIUS_KM;
      const E = Util.deg2rad(elevationDeg);
      return Math.sqrt(Math.pow(R + altitudeKm, 2) - Math.pow(R * Math.cos(E), 2)) - R * Math.sin(E);
    },

    /**
     * Angles de pointage vers un satellite GEO.
     * @param {number} latDeg  Latitude du site (°, + Nord)
     * @param {number} lonDeg  Longitude du site (°, + Est)
     * @param {number} satLonDeg Longitude orbitale du satellite (°, + Est)
     * @returns {object} azimuth (° vrai), elevation, skew, slantRangeKm, visible, steps
     */
    geoLookAngles(latDeg, lonDeg, satLonDeg) {
      const R = EARTH_RADIUS_KM;
      const r = R + ORBITS.GEO.altitudeKm; // 42 164 km
      const phi = Util.deg2rad(latDeg);
      const dLonDeg = Util.angleDiff(satLonDeg, lonDeg); // + si satellite à l'Est
      const dL = Util.deg2rad(dLonDeg);
      const cosGamma = Math.cos(phi) * Math.cos(dL); // angle central site–point sous-satellite
      const ratio = R / r; // 0,1513

      // Élévation
      const elevation = Util.rad2deg(Math.atan((cosGamma - ratio) / Math.sqrt(Math.max(1e-12, 1 - cosGamma * cosGamma))));

      // Azimut vrai (0° = Nord, sens horaire)
      const aPrime = Util.rad2deg(Math.atan(Math.tan(Math.abs(dL)) / Math.max(1e-9, Math.sin(Math.abs(phi)))));
      let azimuth;
      if (latDeg >= 0) {
        azimuth = dLonDeg >= 0 ? 180 - aPrime : 180 + aPrime;
      } else {
        azimuth = dLonDeg >= 0 ? aPrime : 360 - aPrime;
      }
      azimuth = Util.normDeg(azimuth);

      // Skew (rotation de polarisation du cornet/LNB)
      const skew = Util.rad2deg(Math.atan(Math.sin(dL) / Math.max(1e-9, Math.tan(phi))));

      // Distance oblique
      const slant = Math.sqrt(R * R + r * r - 2 * R * r * cosGamma);

      const steps = [
        Util.step(
          'Écart de longitude satellite − site',
          'ΔL = Lon_sat − Lon_site',
          `ΔL = ${f2(satLonDeg)} − (${f2(lonDeg)})`,
          dLonDeg,
          '°'
        ),
        Util.step(
          'Élévation',
          'El = arctan[(cos ΔL·cos φ − 0,1513) / √(1 − (cos ΔL·cos φ)²)]',
          `cos ΔL·cos φ = cos(${f2(dLonDeg)}°) × cos(${f2(latDeg)}°) = ${Util.fmt(cosGamma, 4)}`,
          elevation,
          '°',
          elevation < ORBITS.GEO.minElevation ? 'Satellite trop bas sur l’horizon : non exploitable.' : ''
        ),
        Util.step(
          'Azimut (vrai, depuis le Nord)',
          latDeg >= 0 ? 'Az = 180° ∓ arctan(tan|ΔL| / sin|φ|)  (− si sat. à l’Est, + à l’Ouest)' : 'Az = arctan(tan|ΔL| / sin|φ|) ou 360° − …',
          `arctan(tan ${f2(Math.abs(dLonDeg))}° / sin ${f2(Math.abs(latDeg))}°) = ${f2(aPrime)}°`,
          azimuth,
          '°',
          'Cap géographique vrai ; corriger de la déclinaison magnétique pour une boussole (≈ 0 à −2° en Afrique de l’Ouest).'
        ),
        Util.step(
          'Skew (rotation de polarisation du LNB)',
          'Skew = arctan(sin ΔL / tan φ)',
          `Skew = arctan(sin ${f2(dLonDeg)}° / tan ${f2(latDeg)}°)`,
          skew,
          '°',
          'Utile seulement en polarisation linéaire (bande Ku).'
        ),
        Util.step(
          'Distance oblique station → satellite',
          'd = √(R² + r² − 2·R·r·cos ΔL·cos φ)   (R = 6 378 km, r = 42 164 km)',
          `d = √(6378² + 42164² − 2 × 6378 × 42164 × ${Util.fmt(cosGamma, 4)})`,
          slant,
          'km'
        ),
      ];

      return {
        azimuth,
        elevation,
        skew,
        slantRangeKm: slant,
        dLonDeg,
        visible: elevation >= ORBITS.GEO.minElevation,
        steps,
      };
    },

    /**
     * Géométrie station ↔ satellite selon l'orbite.
     * GEO : calcul exact depuis lat/lon. MEO/LEO : élévation instantanée du satellite servant.
     */
    stationGeometry(orbitId, station, satLonDeg) {
      const orbit = SatPhysics.getOrbit(orbitId);
      if (orbit.id === 'GEO') {
        const g = SatPhysics.geoLookAngles(station.lat, station.lon, satLonDeg);
        return Object.assign({ orbit: orbit.id, tracking: false }, g);
      }
      const el = Util.clamp(station.elevationDeg || orbit.defaultElevation, 0, 90);
      const slant = SatPhysics.slantRangeFromElevationKm(orbit.altitudeKm, el);
      return {
        orbit: orbit.id,
        tracking: true,
        azimuth: null,
        elevation: el,
        skew: 0,
        slantRangeKm: slant,
        visible: el >= orbit.minElevation,
        steps: [
          Util.step(
            'Distance oblique (satellite à ' + f1(el) + '° d’élévation)',
            'd = √((R+h)² − (R·cos E)²) − R·sin E',
            `d = √((6378 + ${orbit.altitudeKm})² − (6378·cos ${f1(el)}°)²) − 6378·sin ${f1(el)}°`,
            slant,
            'km',
            'Satellite défilant : l’antenne le poursuit automatiquement (pas de pointage manuel).'
          ),
        ],
      };
    },

    /* ---------------- Constellations défilantes (LEO / MEO) ---------------- */

    /** Angle au centre de la Terre (rad) entre la station et le point sous-satellite, pour une élévation E. */
    centralAngleRad(altitudeKm, elevationDeg) {
      const r = EARTH_RADIUS_KM + altitudeKm;
      const E = Util.deg2rad(elevationDeg);
      return Math.acos((EARTH_RADIUS_KM * Math.cos(E)) / r) - E;
    },
    /** Élévation (°) vue depuis la station pour un angle au centre θ (rad). */
    elevationFromCentralDeg(altitudeKm, theta) {
      const r = EARTH_RADIUS_KM + altitudeKm;
      return Util.rad2deg(Math.atan2(Math.cos(theta) - EARTH_RADIUS_KM / r, Math.sin(theta)));
    },
    /** Distance station → satellite (km) pour un angle au centre θ (rad). */
    slantFromCentralKm(altitudeKm, theta) {
      const R = EARTH_RADIUS_KM;
      const r = R + altitudeKm;
      return Math.sqrt(R * R + r * r - 2 * R * r * Math.cos(theta));
    },
    /** Décalage Doppler (kHz) : Δf = −f·v_r / c (v_r > 0 : le satellite s'éloigne). */
    dopplerKHz(fGHz, rangeRateKmS) {
      return (-fGHz * 1e6 * rangeRateKmS) / C_KM_S;
    },

    /**
     * État d'un plan orbital de N satellites régulièrement espacés, vu d'une station,
     * à l'instant t (s). Modèle pédagogique : rotation de la Terre négligée, passages
     * identiques culminant à une élévation maximale donnée.
     * Le terminal se raccorde au satellite visible le plus haut (handover au croisement).
     * @param {string} orbitId 'LEO' | 'MEO'
     * @param {number} tSec    temps de simulation (s)
     * @param {object} opts    { satsPerPlane, maxElevationDeg, minElevationDeg }
     */
    constellationState(orbitId, tSec, opts = {}) {
      const orbit = SatPhysics.getOrbit(orbitId);
      const h = orbit.altitudeKm;
      const T = SatPhysics.orbitalPeriodMin(h) * 60;
      const w = (2 * Math.PI) / T;
      const N = Util.clamp(Math.round(opts.satsPerPlane || 24), 1, 200);
      const delta = (2 * Math.PI) / N;
      const minEl = opts.minElevationDeg !== undefined ? opts.minElevationDeg : orbit.minElevation;
      const maxEl = Util.clamp(opts.maxElevationDeg !== undefined ? opts.maxElevationDeg : 75, minEl + 1, 90);
      const thc = Math.max(0, SatPhysics.centralAngleRad(h, maxEl)); // écart latéral minimal de la trace
      const thMin = SatPhysics.centralAngleRad(h, minEl);
      const wrap = (a) => {
        let x = (a + Math.PI) % (2 * Math.PI);
        if (x < 0) x += 2 * Math.PI;
        return x - Math.PI;
      };
      const satAt = (k, t) => {
        const a = wrap(w * t - k * delta);
        const theta = Math.acos(Math.cos(thc) * Math.cos(a));
        return { k, a, theta, el: SatPhysics.elevationFromCentralDeg(h, theta) };
      };
      const sats = [];
      for (let k = 0; k < N; k++) sats.push(satAt(k, tSec));
      const visible = sats.filter((s) => s.el >= minEl).sort((x, y) => y.el - x.el);
      const halfVisible = thMin > thc ? Math.acos(Math.cos(thMin) / Math.cos(thc)) : 0; // demi-angle le long de la trace
      const passDurationMin = (2 * halfVisible) / w / 60;
      let serving = null;
      if (visible.length) {
        const s = visible[0];
        const d1 = SatPhysics.slantFromCentralKm(h, s.theta);
        const d2 = SatPhysics.slantFromCentralKm(h, satAt(s.k, tSec + 1).theta);
        serving = { index: s.k + 1, el: s.el, slantKm: d1, rangeRateKmS: d2 - d1, alongDeg: Util.rad2deg(s.a) };
      }
      return {
        orbit: orbit.id,
        serving,
        visibleCount: visible.length,
        satsPerPlane: N,
        periodMin: T / 60,
        spacingMin: T / N / 60,
        passDurationMin,
        halfVisibleDeg: Util.rad2deg(halfVisible),
        minEl,
        maxEl,
        speedKmS: SatPhysics.orbitalSpeedKmS(h),
      };
    },

    /* ---------------- Dépointage ---------------- */

    /** Erreur angulaire totale (°) à partir des erreurs d'azimut et d'élévation. */
    pointingErrorDeg(azErrDeg, elErrDeg, elevationDeg) {
      const azOnSky = azErrDeg * Math.cos(Util.deg2rad(elevationDeg || 0));
      return Math.sqrt(azOnSky * azOnSky + elErrDeg * elErrDeg);
    },
    /** Perte de désadaptation de polarisation linéaire (dB) : L = −20·log|cos Δψ|. */
    skewLossDb(skewErrDeg) {
      const c = Math.abs(Math.cos(Util.deg2rad(skewErrDeg)));
      return Math.min(30, -20 * Math.log10(Math.max(c, 1e-3)));
    },

    /* ---------------- Propagation oblique ---------------- */

    /**
     * Atténuation par la pluie sur un trajet oblique (UIT-R P.618 simplifié).
     * Ls = (hR − hs)/sin E ; facteur de réduction horizontale r ; A = γR·Ls·r.
     */
    slantRainAttenuation(fGHz, rainMmH, elevationDeg, stationAltKm = 0.3, polarization = 'C') {
      const el = Math.max(elevationDeg, 5);
      if (rainMmH <= 0) return { total: 0, gamma: 0, Ls: 0, r: 1, steps: [] };
      const pol = polarization === 'circulaire' ? 'C' : polarization === 'linéaire' ? 'V' : polarization;
      const gamma = RP.rainSpecificDbPerKm(fGHz, rainMmH, pol);
      const hR = RAIN_HEIGHT_TROPICAL_KM;
      const Ls = Math.max(0, (hR - stationAltKm) / Math.sin(Util.deg2rad(el)));
      const LG = Ls * Math.cos(Util.deg2rad(el));
      const r = 1 / (1 + 0.78 * Math.sqrt((LG * gamma) / fGHz) - 0.38 * (1 - Math.exp(-2 * LG)));
      const rr = Util.clamp(r, 0.1, 1.5);
      const total = gamma * Ls * rr;
      const steps = [
        Util.step(
          `Atténuation spécifique de la pluie à ${f2(fGHz)} GHz`,
          'γR = k·R^α   (UIT-R P.838)',
          `R = ${f1(rainMmH)} mm/h`,
          gamma,
          'dB/km'
        ),
        Util.step(
          'Longueur du trajet oblique dans la pluie',
          'Ls = (hR − hs) / sin E   (hR ≈ 5 km en zone tropicale)',
          `Ls = (${f1(hR)} − ${f2(stationAltKm)}) / sin ${f1(el)}°`,
          Ls,
          'km'
        ),
        Util.step(
          'Atténuation pluie sur le trajet',
          'A = γR × Ls × r   (r = facteur de réduction horizontale)',
          `A = ${f2(gamma)} × ${f2(Ls)} × ${f2(rr)}`,
          total,
          'dB'
        ),
      ];
      return { total, gamma, Ls, r: rr, steps };
    },
    /** Absorption gazeuse sur trajet oblique (dB) : A ≈ γ_sol × h_eq / sin E. */
    slantGasAttenuationDb(fGHz, elevationDeg) {
      const el = Math.max(elevationDeg, 5);
      return (RP.gasSpecificDbPerKm(fGHz) * GAS_EQUIV_HEIGHT_KM) / Math.sin(Util.deg2rad(el));
    },
    /** Affaiblissement en espace libre (dB) pour une distance en km. */
    fslDb(dKm, fGHz) {
      return RP.fslDb(dKm, fGHz);
    },

    /* ---------------- Stations terriennes ---------------- */

    /** Température de bruit (K) d'un LNB à partir de son facteur de bruit : T = 290·(10^(NF/10) − 1). */
    lnbNoiseTempK(nfDb) {
      return T0 * (Math.pow(10, nfDb / 10) - 1);
    },
    /** Température d'antenne ciel clair (K) selon l'élévation (rayonnement du sol + ciel). */
    antennaClearSkyTempK(elevationDeg) {
      const el = Math.max(elevationDeg, 5);
      return Util.clamp(25 + 60 / Math.sqrt(el), 30, 60);
    },

    /**
     * Calcule les caractéristiques d'une station terrienne.
     * @param {object} s { dishM, txPowerW, lnbNfDb, efficiency }
     */
    stationRf(s, band) {
      const eff = s.efficiency || ANTENNA_EFFICIENCY;
      const gTx = RP.dishGainDbi(s.dishM, band.upGHz, eff);
      const gRx = RP.dishGainDbi(s.dishM, band.downGHz, eff);
      const pDbw = Util.wattToDbw(s.txPowerW);
      const eirp = pDbw - FEED_LOSS_DB + gTx;
      return {
        gTx,
        gRx,
        pDbw,
        eirp,
        bwUp: RP.dishBeamwidthDeg(s.dishM, band.upGHz),
        bwDown: RP.dishBeamwidthDeg(s.dishM, band.downGHz),
      };
    },

    /* ---------------- Débit, ACM ---------------- */

    /** Choisit le meilleur MODCOD (ACM) pour un Es/N0 donné, plafonné par maxId. */
    selectModcod(esn0Db, maxId, acm = true) {
      const maxIdx = Math.max(0, MODCODS.findIndex((m) => m.id === maxId));
      if (!acm) {
        const m = MODCODS[maxIdx];
        return esn0Db >= m.esn0 + IMPLEMENTATION_MARGIN_DB ? { modcod: m, index: maxIdx, maxIndex: maxIdx } : { modcod: null, index: -1, maxIndex: maxIdx };
      }
      for (let i = maxIdx; i >= 0; i--) {
        if (esn0Db >= MODCODS[i].esn0 + IMPLEMENTATION_MARGIN_DB) return { modcod: MODCODS[i], index: i, maxIndex: maxIdx };
      }
      return { modcod: null, index: -1, maxIndex: maxIdx };
    },

    /* ---------------- Bilan d'un bond (montant ou descendant) ---------------- */

    /**
     * Bilan C/N0 d'un bond simple.
     * @param {object} h
     *   label, fGHz, distanceKm, eirpDbw, gtDbK, rainDb, gasDb, pointingDb, polLossDb, extraNoteSteps[]
     */
    hopBudget(h) {
      const fsl = SatPhysics.fslDb(h.distanceKm, h.fGHz);
      // h.hiddenDb : perte due à une panne cachée (mode Dépannage), incluse mais jamais détaillée
      const losses = fsl + h.rainDb + h.gasDb + h.pointingDb + (h.polLossDb || 0) + (h.hiddenDb || 0);
      const cn0 = h.eirpDbw - losses + h.gtDbK - BOLTZMANN_DBW;
      const steps = [];
      steps.push(
        Util.step(
          `Affaiblissement en espace libre (${h.label})`,
          'FSL = 92,45 + 20·log(d) + 20·log(f)',
          `FSL = 92,45 + 20·log(${Util.fmt(h.distanceKm, 0)}) + 20·log(${f2(h.fGHz)})`,
          fsl,
          'dB'
        )
      );
      if (h.extraSteps) steps.push(...h.extraSteps);
      steps.push(
        Util.step(
          `C/N0 ${h.label}`,
          'C/N0 = PIRE − FSL − A_pluie − A_gaz − L_pointage + G/T − k   (k = −228,6 dBW/K/Hz)',
          `C/N0 = ${f2(h.eirpDbw)} − ${f2(fsl)} − ${f2(h.rainDb)} − ${f2(h.gasDb)} − ${f2(h.pointingDb + (h.polLossDb || 0))} + ${f2(h.gtDbK)} + 228,6`,
          cn0,
          'dBHz'
        )
      );
      return { fsl, cn0, rain: h.rainDb, gas: h.gasDb, pointing: h.pointingDb, polLoss: h.polLossDb || 0, eirp: h.eirpDbw, gt: h.gtDbK, steps };
    },

    /**
     * Bilan complet d'une liaison satellite VSAT (aller + retour).
     * @param {object} p
     *   orbit 'GEO'|'MEO'|'LEO', band 'C'|'Ku'|'Ka', satLonDeg,
     *   satEirpDbw?, satGtDbK?, transponderMHz?, outputBackoffDb?,
     *   remote: { lat, lon, altKm, elevationDeg (MEO/LEO), dishM, bucW, lnbNfDb, rainMmH,
     *             azErrDeg, elErrDeg, skewErrDeg },
     *   hub:    { lat, lon, altKm, elevationDeg (MEO/LEO), dishM, hpaW, lnbNfDb, rainMmH },
     *   forward: { symbolRateMsps, maxModcod }, ret: { symbolRateMsps, maxModcod }, acm
     */
    computeSatLink(p) {
      const orbit = SatPhysics.getOrbit(p.orbit);
      const band = SatPhysics.getBand(p.band);
      const satEirp = (p.satEirpDbw != null ? p.satEirpDbw : band.satEirpDbw) + orbit.eirpOffset;
      const satGt = (p.satGtDbK != null ? p.satGtDbK : band.satGtDbK) + orbit.gtOffset;
      const tpMHz = p.transponderMHz || band.transponderMHz;
      const obo = p.outputBackoffDb != null ? p.outputBackoffDb : 1;
      const acm = p.acm !== false;
      const remote = p.remote;
      const hub = p.hub;

      /* --- Géométrie et pointage --- */
      const geoR = SatPhysics.stationGeometry(orbit.id, remote, p.satLonDeg);
      const geoH = SatPhysics.stationGeometry(orbit.id, hub, p.satLonDeg);

      /* --- Stations --- */
      const rfR = SatPhysics.stationRf({ dishM: remote.dishM, txPowerW: remote.bucW }, band);
      const rfH = SatPhysics.stationRf({ dishM: hub.dishM, txPowerW: hub.hpaW }, band);

      // Dépointage de l'antenne VSAT (uniquement pour une antenne fixe GEO)
      let pointErr = 0;
      let lossPointUp = 0;
      let lossPointDown = 0;
      let lossSkew = 0;
      const pointingSteps = [];
      if (!geoR.tracking) {
        pointErr = SatPhysics.pointingErrorDeg(remote.azErrDeg || 0, remote.elErrDeg || 0, geoR.elevation);
        lossPointUp = RP.pointingLossDb(pointErr, rfR.bwUp, 40);
        lossPointDown = RP.pointingLossDb(pointErr, rfR.bwDown, 40);
        if (band.polarization === 'linéaire') lossSkew = SatPhysics.skewLossDb(remote.skewErrDeg || 0);
        pointingSteps.push(
          Util.step(
            'Erreur de pointage totale',
            'ε = √((ΔAz·cos El)² + ΔEl²)',
            `ε = √((${f2(remote.azErrDeg || 0)} × cos ${f1(geoR.elevation)}°)² + ${f2(remote.elErrDeg || 0)}²)`,
            pointErr,
            '°'
          ),
          Util.step(
            'Ouverture à −3 dB de l’antenne VSAT (montant / descendant)',
            'θ3dB ≈ 70·λ/D',
            `θ_up = ${f2(rfR.bwUp)}° ; θ_down = ${f2(rfR.bwDown)}°`,
            rfR.bwUp,
            '°'
          ),
          Util.step(
            'Perte de dépointage (montant / descendant)',
            'L = 12·(ε/θ3dB)²',
            `L_up = ${f2(lossPointUp)} dB ; L_down = ${f2(lossPointDown)} dB`,
            lossPointUp,
            'dB'
          )
        );
        if (band.polarization === 'linéaire') {
          pointingSteps.push(
            Util.step(
              'Perte de désalignement de polarisation (skew)',
              'L = −20·log|cos Δψ|',
              `Δψ = ${f1(remote.skewErrDeg || 0)}°`,
              lossSkew,
              'dB'
            )
          );
        }
      }

      /* --- Atmosphère --- */
      const rainR = remote.rainMmH || 0;
      const rainH = hub.rainMmH || 0;
      const rainRUp = SatPhysics.slantRainAttenuation(band.upGHz, rainR, geoR.elevation, remote.altKm || 0.3, band.polarization);
      const rainRDown = SatPhysics.slantRainAttenuation(band.downGHz, rainR, geoR.elevation, remote.altKm || 0.3, band.polarization);
      const rainHUp = SatPhysics.slantRainAttenuation(band.upGHz, rainH, geoH.elevation, hub.altKm || 0.3, band.polarization);
      const rainHDown = SatPhysics.slantRainAttenuation(band.downGHz, rainH, geoH.elevation, hub.altKm || 0.3, band.polarization);
      const gasRUp = SatPhysics.slantGasAttenuationDb(band.upGHz, geoR.elevation);
      const gasRDown = SatPhysics.slantGasAttenuationDb(band.downGHz, geoR.elevation);
      const gasHUp = SatPhysics.slantGasAttenuationDb(band.upGHz, geoH.elevation);
      const gasHDown = SatPhysics.slantGasAttenuationDb(band.downGHz, geoH.elevation);

      /* --- G/T des stations (avec bruit de ciel dû à la pluie) --- */
      const gtOf = (rf, station, geo, rainDownDb, label) => {
        const tAntClear = SatPhysics.antennaClearSkyTempK(geo.elevation);
        const tRain = RAIN_MEDIUM_TEMP_K * (1 - Math.pow(10, -rainDownDb / 10));
        const tAnt = Math.min(290, tAntClear + tRain);
        const tLnb = SatPhysics.lnbNoiseTempK(station.lnbNfDb);
        const tSys = tAnt + tLnb;
        const gt = rf.gRx - 10 * Math.log10(tSys);
        const steps = [
          Util.step(
            `Température de bruit du LNB (${label})`,
            'T_LNB = 290·(10^(NF/10) − 1)',
            `T_LNB = 290 × (10^(${f2(station.lnbNfDb)}/10) − 1)`,
            tLnb,
            'K'
          ),
          Util.step(
            `Température système (${label})`,
            'T_sys = T_antenne (ciel clair + pluie) + T_LNB',
            `T_sys = ${f1(tAntClear)} + ${f1(tRain)} + ${f1(tLnb)}`,
            tSys,
            'K',
            tRain > 1 ? 'La pluie rayonne du bruit thermique : elle dégrade aussi le G/T.' : ''
          ),
          Util.step(
            `Facteur de mérite G/T (${label})`,
            'G/T = G_rx − 10·log(T_sys)',
            `G/T = ${f2(rf.gRx)} − 10·log(${f1(tSys)})`,
            gt,
            'dB/K'
          ),
        ];
        return { gt, tSys, tLnb, tAnt, tRain, steps };
      };
      const gtR = gtOf(rfR, remote, geoR, rainRDown.total, 'VSAT');
      const gtH = gtOf(rfH, hub, geoH, rainHDown.total, 'Hub');

      /* --- Construction d'une direction (aller ou retour) --- */
      const direction = (cfg) => {
        const rs = cfg.symbolRateMsps;
        const carrierMHz = rs * (1 + CARRIER_ROLLOFF);
        // Montant
        const up = SatPhysics.hopBudget({
          label: 'montant',
          fGHz: band.upGHz,
          distanceKm: cfg.txGeo.slantRangeKm,
          eirpDbw: cfg.txRf.eirp,
          gtDbK: satGt,
          rainDb: cfg.rainUp.total,
          gasDb: cfg.gasUp,
          pointingDb: cfg.pointUp,
          polLossDb: cfg.polLoss,
          hiddenDb: cfg.hiddenUp || 0,
          extraSteps: cfg.rainUp.steps,
        });
        // Descendant : PIRE du satellite partagée au prorata de la bande occupée
        const share = Math.max(0, 10 * Math.log10(tpMHz / Math.min(carrierMHz, tpMHz)));
        const eirpCarrier = satEirp - obo - share;
        const down = SatPhysics.hopBudget({
          label: 'descendant',
          fGHz: band.downGHz,
          distanceKm: cfg.rxGeo.slantRangeKm,
          eirpDbw: eirpCarrier,
          gtDbK: cfg.rxGt.gt,
          rainDb: cfg.rainDown.total,
          gasDb: cfg.gasDown,
          pointingDb: cfg.pointDown,
          polLossDb: cfg.polLoss,
          hiddenDb: cfg.hiddenDown || 0,
          extraSteps: cfg.rainDown.steps,
        });
        const bwDb = 10 * Math.log10(rs * 1e6);
        const cnUp = up.cn0 - bwDb;
        const cnDown = down.cn0 - bwDb;
        const cnTotal = RP.combineSnrDb(cnUp, cnDown, C_I_SYSTEM_DB);
        const sel = SatPhysics.selectModcod(cnTotal, cfg.maxModcod, acm);
        const mc = sel.modcod;
        const ebn0 = mc ? cnTotal - 10 * Math.log10(mc.eff) : null;
        const throughput = mc ? rs * mc.eff : 0;
        const visible = cfg.txGeo.visible && cfg.rxGeo.visible;
        let status;
        if (!visible || !mc) status = 'down';
        else if (sel.index < sel.maxIndex) status = 'degraded';
        else status = 'optimal';
        const maxMc = SatPhysics.getModcod(cfg.maxModcod);

        const steps = [
          Util.step(
            `PIRE de la station émettrice (${cfg.txName})`,
            'PIRE = P_amplificateur (dBW) − L_guide + G_tx',
            `PIRE = 10·log(${f1(cfg.txPowerW)} W) − ${f1(FEED_LOSS_DB)} + ${f2(cfg.txRf.gTx)} = ${f2(cfg.txRf.pDbw)} − ${f1(FEED_LOSS_DB)} + ${f2(cfg.txRf.gTx)}`,
            cfg.txRf.eirp,
            'dBW'
          ),
          ...up.steps,
          Util.step(
            'PIRE satellite allouée à la porteuse',
            'PIRE_porteuse = PIRE_sat − OBO − 10·log(B_répéteur / B_porteuse)',
            `PIRE = ${f2(satEirp)} − ${f1(obo)} − 10·log(${f1(tpMHz)} / ${f2(Math.min(carrierMHz, tpMHz))})`,
            eirpCarrier,
            'dBW',
            'Le répéteur partage sa puissance entre les porteuses au prorata de la bande occupée.'
          ),
          ...cfg.rxGt.steps,
          ...down.steps,
          Util.step('C/N montant', 'C/N = C/N0 − 10·log(Rs)', `C/N = ${f2(up.cn0)} − 10·log(${f2(rs)}·10⁶)`, cnUp, 'dB'),
          Util.step('C/N descendant', 'C/N = C/N0 − 10·log(Rs)', `C/N = ${f2(down.cn0)} − 10·log(${f2(rs)}·10⁶)`, cnDown, 'dB'),
          Util.step(
            'C/N total de bout en bout (répéteur transparent)',
            '1/(C/N)tot = 1/(C/N)up + 1/(C/N)down + 1/(C/I)',
            `(C/N)up = ${f2(cnUp)} dB ; (C/N)down = ${f2(cnDown)} dB ; C/I = ${f1(C_I_SYSTEM_DB)} dB`,
            cnTotal,
            'dB',
            'Le maillon le plus faible impose la qualité globale.'
          ),
        ];
        if (mc) {
          steps.push(
            Util.step(
              'MODCOD DVB-S2X sélectionné ' + (acm ? '(ACM)' : '(fixe)'),
              'plus haut MODCOD tel que Es/N0 ≥ Es/N0 requis + marge d’implémentation (' + f1(IMPLEMENTATION_MARGIN_DB) + ' dB)',
              `${f2(cnTotal)} dB ≥ ${f2(mc.esn0)} + ${f1(IMPLEMENTATION_MARGIN_DB)} dB → ${mc.id}`,
              mc.eff,
              'bit/symbole'
            ),
            Util.step('Eb/N0', 'Eb/N0 = Es/N0 − 10·log(η)   (η = efficacité spectrale)', `Eb/N0 = ${f2(cnTotal)} − 10·log(${f2(mc.eff)})`, ebn0, 'dB'),
            Util.step('Débit utile', 'D = Rs × η', `D = ${f2(rs)} Msymb/s × ${f2(mc.eff)}`, throughput, 'Mbit/s')
          );
        } else {
          steps.push(
            Util.step(
              visible ? 'Liaison coupée' : 'Satellite non visible',
              visible ? 'Es/N0 inférieur au seuil du MODCOD le plus robuste' : 'Élévation inférieure au minimum d’exploitation',
              visible ? `${f2(cnTotal)} dB < ${f2((acm ? MODCODS[0] : maxMc).esn0 + IMPLEMENTATION_MARGIN_DB)} dB` : '',
              0,
              'Mbit/s'
            )
          );
        }
        return {
          symbolRateMsps: rs,
          carrierMHz,
          up,
          down,
          eirpCarrier,
          cnUp,
          cnDown,
          cnTotal,
          esn0: cnTotal,
          ebn0,
          modcod: mc,
          maxModcod: maxMc,
          marginDb: mc ? cnTotal - (mc.esn0 + IMPLEMENTATION_MARGIN_DB) : cnTotal - (MODCODS[0].esn0 + IMPLEMENTATION_MARGIN_DB),
          throughputMbps: throughput,
          status,
          steps,
        };
      };

      // ALLER (Forward / Outbound) : Hub → Satellite → VSAT
      const forward = direction({
        txName: 'Hub, HPA ' + hub.hpaW + ' W',
        txPowerW: hub.hpaW,
        txRf: rfH,
        txGeo: geoH,
        rxGeo: geoR,
        rxGt: gtR,
        rainUp: rainHUp,
        rainDown: rainRDown,
        gasUp: gasHUp,
        gasDown: gasRDown,
        pointUp: 0,
        pointDown: lossPointDown,
        hiddenDown: remote.hiddenLossDownDb || 0,
        polLoss: lossSkew,
        symbolRateMsps: (p.forward && p.forward.symbolRateMsps) || 30,
        maxModcod: (p.forward && p.forward.maxModcod) || '32APSK 9/10',
      });
      // RETOUR (Return / Inbound) : VSAT → Satellite → Hub
      const ret = direction({
        txName: 'VSAT, BUC ' + remote.bucW + ' W',
        txPowerW: remote.bucW,
        txRf: rfR,
        txGeo: geoR,
        rxGeo: geoH,
        rxGt: gtH,
        rainUp: rainRUp,
        rainDown: rainHDown,
        gasUp: gasRUp,
        gasDown: gasHDown,
        pointUp: lossPointUp,
        pointDown: 0,
        hiddenUp: remote.hiddenLossUpDb || 0,
        polLoss: lossSkew,
        symbolRateMsps: (p.ret && p.ret.symbolRateMsps) || 2,
        maxModcod: (p.ret && p.ret.maxModcod) || '8PSK 3/4',
      });

      /* --- Latence --- */
      const latency = SatPhysics.latency(orbit, geoR.slantRangeKm, geoH.slantRangeKm);

      /* --- Référence ciel clair / pointage parfait ---
       * L'état « dégradé » (orange) signale un repli de MODCOD dû à la pluie ou
       * au dépointage, par rapport à ce que la liaison obtient par ciel clair. */
      if (!p._reference) {
        const ref = SatPhysics.computeSatLink(
          Object.assign({}, p, {
            _reference: true,
            remote: Object.assign({}, remote, { rainMmH: 0, azErrDeg: 0, elErrDeg: 0, skewErrDeg: 0 }),
            hub: Object.assign({}, hub, { rainMmH: 0 }),
          })
        );
        for (const [dir, refDir] of [
          [forward, ref.forward],
          [ret, ref.ret],
        ]) {
          dir.clearSkyModcod = refDir.modcod;
          dir.clearSkyThroughputMbps = refDir.throughputMbps;
          dir.clearSkyCn = refDir.cnTotal;
          if (dir.status !== 'down') {
            const idx = MODCODS.indexOf(dir.modcod);
            const refIdx = refDir.modcod ? MODCODS.indexOf(refDir.modcod) : -1;
            dir.status = idx < refIdx ? 'degraded' : 'optimal';
          }
        }
      }

      let status = 'optimal';
      if (forward.status === 'down' || ret.status === 'down') status = 'down';
      else if (forward.status === 'degraded' || ret.status === 'degraded') status = 'degraded';

      return {
        orbit,
        band,
        satEirp,
        satGt,
        transponderMHz: tpMHz,
        remoteGeometry: geoR,
        hubGeometry: geoH,
        remoteRf: rfR,
        hubRf: rfH,
        remoteGt: gtR,
        hubGt: gtH,
        pointing: { errorDeg: pointErr, lossUpDb: lossPointUp, lossDownDb: lossPointDown, skewLossDb: lossSkew, steps: pointingSteps },
        rain: { remoteUp: rainRUp.total, remoteDown: rainRDown.total, hubUp: rainHUp.total, hubDown: rainHDown.total },
        forward,
        ret,
        latency,
        status,
        periodMin: SatPhysics.orbitalPeriodMin(orbit.altitudeKm),
        speedKmS: SatPhysics.orbitalSpeedKmS(orbit.altitudeKm),
      };
    },

    /**
     * Latence de propagation et RTT (aller-retour d'un paquet VSAT ↔ Hub ↔ VSAT).
     * Un trajet simple = VSAT → satellite → Hub. RTT = 2 trajets + traitements.
     */
    latency(orbit, dRemoteKm, dHubKm) {
      const oneWayMs = ((dRemoteKm + dHubKm) / C_KM_S) * 1000;
      const rttMs = 2 * oneWayMs + orbit.processingMs;
      const steps = [
        Util.step(
          'Temps de propagation (un trajet VSAT → satellite → Hub)',
          't = (d_VSAT + d_Hub) / c   (c = 299 792 km/s)',
          `t = (${Util.fmt(dRemoteKm, 0)} + ${Util.fmt(dHubKm, 0)}) / 299 792`,
          oneWayMs,
          'ms'
        ),
        Util.step(
          'Latence aller-retour (RTT, ex. ping)',
          'RTT = 2 × t + t_traitement (modems, trames TDMA/ACM, routage)',
          `RTT = 2 × ${f1(oneWayMs)} + ${f1(orbit.processingMs)}`,
          rttMs,
          'ms',
          orbit.id === 'GEO'
            ? 'Latence GEO élevée : gênante pour la voix et le jeu, acceptable pour la navigation.'
            : orbit.id === 'MEO'
            ? 'Latence MEO proche d’une liaison terrestre intercontinentale.'
            : 'Latence LEO comparable à la fibre ou à l’ADSL.'
        ),
      ];
      return { oneWayMs, rttMs, processingMs: orbit.processingMs, steps };
    },
  };

  MBV.SatPhysics = SatPhysics;
})(typeof window !== 'undefined' ? window : globalThis);
