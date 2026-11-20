/* =====================================================================
 * MicroWave, BLR & VSAT Lab — edition.js
 * Version de l'application :
 *   'enseignant' : dépôt et paquet enseignant (complets : corrigés des TP,
 *                  création des sujets d'examen, correction des copies) ;
 *   'eleve'      : paquet élève, écrit par tools/paquets.js (le code
 *                  enseignant y est retiré, ainsi que les corrigés).
 * Chargé en premier par index.html.
 * ===================================================================== */
(function (root) {
  'use strict';
  const MBV = (root.MBV = root.MBV || {});
  MBV.Edition = { role: 'eleve' };
})(typeof window !== 'undefined' ? window : globalThis);
