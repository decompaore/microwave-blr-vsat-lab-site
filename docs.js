/* =====================================================================
 * MicroWave, BLR & VSAT Lab — docs.js
 *
 * Documentation embarquée, organisée par rubriques (modèle OptiSim FTTx Lab) :
 *   1. Guide de l'utilisateur        (comment se servir du simulateur)
 *   2. Instruments et mesures        (bilan, profil, pointage, ping, voyants)
 *   3. Fiches d'ingénierie           (méthodes FH, BLR, VSAT, IP, pannes)
 *   4. Cours FH, BLR, VSAT & IP      (chapitres de MBV.Course, labs.js)
 *   5. Aide-mémoire                  (formules, glossaire)
 *
 * Interface : MBV.Docs = { groups, chapters, find(id) }.
 * Chaque chapitre : { id, group, title, intro?, sections: [{ id, title, html }] }.
 * Liens internes dans le HTML : <a href="#" data-doc="chapitre" data-sec="section">.
 *
 * Contenu réservé à l'enseignant : 
 * à l'intérieur des gabarits (retiré des paquets élève et examen).
 * ===================================================================== */
(function (global) {
  'use strict';
  const MBV = (global.MBV = global.MBV || {});

  const G_GUIDE = 'Guide de l’utilisateur';
  const G_MESURES = 'Instruments et mesures';
  const G_FICHES = 'Fiches d’ingénierie FH, BLR, VSAT';
  const G_COURS = 'Cours FH, BLR, VSAT & Microwave IP';
  const G_MEMO = 'Aide-mémoire';
  const G_PRINT = 'Supports imprimables';
  const GROUPS = [G_GUIDE, G_MESURES, G_FICHES, G_COURS, G_MEMO, G_PRINT];

  const kbd = (k) => `<kbd>${k}</kbd>`;
  const link = (chap, sec, txt) => `<a href="#" data-doc="${chap}"${sec ? ` data-sec="${sec}"` : ''}>${txt}</a>`;

  /* --- Figure : les zones de l'écran --- */
  const FIG_ECRAN = `<figure><svg viewBox="0 0 640 330" width="640" font-family="Segoe UI, sans-serif" font-size="12">
    <rect x="10" y="10" width="620" height="40" rx="6" fill="#16213a" stroke="#22d3ee"/>
    <text x="22" y="35" fill="#e2e8f0" font-weight="bold">① Barre supérieure</text>
    <text x="170" y="35" fill="#a9b8d3">Nouveau · Ouvrir · Sauvegarder · Modes · Pluie · TP · Examen · Documentation</text>
    <rect x="10" y="58" width="130" height="230" rx="6" fill="#111a2e" stroke="#a78bfa"/>
    <text x="75" y="80" fill="#e2e8f0" font-weight="bold" text-anchor="middle">② Boîte à outils</text>
    <text x="75" y="102" fill="#a9b8d3" text-anchor="middle">Sites &amp; obstacles</text>
    <text x="75" y="120" fill="#a9b8d3" text-anchor="middle">FH · BLR · VSAT · D2D</text>
    <text x="75" y="138" fill="#a9b8d3" text-anchor="middle">Réseau IP / MPLS</text>
    <rect x="148" y="58" width="322" height="26" rx="4" fill="#16213a" stroke="#334155"/>
    <text x="158" y="76" fill="#a9b8d3">Outils : V · L · F · P · C · Suppr · orage · zoom</text>
    <rect x="148" y="90" width="322" height="140" rx="6" fill="#070c17" stroke="#22c55e"/>
    <text x="309" y="150" fill="#e2e8f0" font-weight="bold" text-anchor="middle">③ Canevas</text>
    <text x="309" y="170" fill="#a9b8d3" text-anchor="middle">segment spatial en haut, terrestre en bas</text>
    <line x1="190" y1="205" x2="300" y2="205" stroke="#22c55e" stroke-width="3"/><line x1="300" y1="205" x2="420" y2="205" stroke="#f59e0b" stroke-width="3"/>
    <rect x="148" y="236" width="322" height="52" rx="6" fill="#111a2e" stroke="#334155"/>
    <text x="309" y="258" fill="#e2e8f0" text-anchor="middle">Journal · Console ping · Flux</text>
    <rect x="478" y="58" width="152" height="230" rx="6" fill="#111a2e" stroke="#f472b6"/>
    <text x="554" y="80" fill="#e2e8f0" font-weight="bold" text-anchor="middle">④ Inspecteur</text>
    <text x="554" y="102" fill="#a9b8d3" text-anchor="middle">Paramètres</text>
    <text x="554" y="120" fill="#a9b8d3" text-anchor="middle">Bilan de liaison</text>
    <text x="554" y="138" fill="#a9b8d3" text-anchor="middle">Profil &amp; Fresnel</text>
    <text x="554" y="156" fill="#a9b8d3" text-anchor="middle">Réseau</text>
    <rect x="10" y="296" width="620" height="24" rx="4" fill="#16213a" stroke="#334155"/>
    <text x="22" y="312" fill="#a9b8d3">Barre d’état : mode · équipements et liens · santé du réseau · coordonnées · fichier · version</text>
  </svg><figcaption>Les quatre zones de l’écran et la barre d’état.</figcaption></figure>`;

  /* =================================================================
   * 1. GUIDE DE L'UTILISATEUR
   * ================================================================= */
  const GUIDE = [
    {
      id: 'guide',
      group: G_GUIDE,
      title: 'Prise en main de l’interface',
      intro: `<p><b>MicroWave, BLR &amp; VSAT Lab</b> est un laboratoire virtuel de transmissions hertziennes : faisceaux hertziens (FH), boucle locale radio (BLR) et liaisons satellitaires (VSAT), avec le réseau IP/MPLS qu’elles transportent. Il fonctionne dans le navigateur, sans installation ni connexion Internet.</p>`,
      sections: [
        {
          id: 'ecran',
          title: 'Les quatre zones de l’écran',
          html: `${FIG_ECRAN}
            <ol><li><b>Barre supérieure</b> : fichiers (Nouveau, Ouvrir, Sauvegarder, export image), thème clair / sombre (◐), choix du <b>mode de travail</b>, curseur de <b>pluie</b> (0 à 100 mm/h), fenêtres <b>Travaux Pratiques (TP)</b>, <b>Examen</b> et <b>Documentation</b>. Pendant une épreuve, la barre affiche aussi l’élève, le temps restant, <b>Consignes</b>, <b>Ma copie</b> et <b>Rendre ma copie</b>.</li>
            <li><b>Boîte à outils</b> (à gauche) : les équipements, classés par famille. Le champ « Rechercher… » filtre la liste.</li>
            <li><b>Canevas</b> (au centre) : le plan du réseau. La barre d’outils du canevas donne les outils (sélection, liaison, flux, ping, panne, suppression), l’échelle du plan et le zoom. En dessous : le <b>journal d’événements</b>, la <b>console</b> (ping / traceroute) et le tableau des <b>flux de trafic</b>.</li>
            <li><b>Inspecteur</b> (à droite) : les réglages de l’élément sélectionné et ses analyses, en quatre onglets : <b>Paramètres</b>, <b>Bilan de liaison</b>, <b>Profil &amp; Fresnel</b>, <b>Réseau</b>.</li></ol>
            <p>Sans sélection, l’onglet Paramètres affiche les <b>réglages du projet</b> : titre, origine géographique du plan, climat et objectif de disponibilité, interférences entre bonds.</p>`,
        },
        {
          id: 'modes',
          title: 'Les modes de travail',
          html: `<table><tr><th>Mode</th><th>Usage</th></tr>
            <tr><td><b>Conception RF/IP</b></td><td>Poser, relier, déplacer et paramétrer les équipements ; lire les bilans et le profil.</td></tr>
            <tr><td><b>Météo &amp; Propagation</b></td><td>La pluie est dessinée sur le plan et les atténuations sont affichées. Bouton <b>« Simuler un orage »</b> : la pluie monte de 0 à 100 mm/h puis redescend, et l’on voit la modulation adaptative (ACM) se replier puis remonter.</td></tr>
            <tr><td><b>Dépannage</b> <small>(version élève)</small></td><td>Voyants des équipements, <b>interventions</b> sur site (remplacer, repointer, refaire un branchement, reprendre un câble) et outil « Panne » (${kbd('C')}) pour couper un lien ou arrêter un équipement (test de résilience). Voir ${link('guide-depannage', '', 'Le mode Dépannage')}.</td></tr>
            </table>
            <p>Couleurs des liaisons radio : <span style="color:#22c55e">vert</span> = modulation maximale (ACM optimal), <span style="color:#f59e0b">orange</span> = repli de modulation (pluie, dépointage, obstacle…), <span style="color:#ef4444">rouge</span> = coupure. Les câbles Ethernet et fibre sont gris ; un lien RPL bloqué par l’anneau ERPS est en pointillés.</p>`,
        },
        {
          id: 'canevas',
          title: 'Se déplacer sur le plan',
          html: `<ul><li><b>Molette</b> : zoom autour du pointeur ; boutons ＋ / − ou touches ${kbd('+')} ${kbd('−')} ; ${kbd('0')} = tout afficher.</li>
            <li><b>Glisser le fond</b> du canevas : déplacer la vue.</li>
            <li><b>Échelle</b> (barre du canevas) : distance représentée par un carreau de la grille, de 0,25 à 10 km. Les distances des liaisons sont mesurées sur le plan : changer l’échelle change les longueurs de tous les bonds.</li>
            <li>La barre d’état affiche les <b>coordonnées</b> du pointeur en km. Le haut du canevas représente le <b>segment spatial</b> (satellites), le bas le <b>segment terrestre</b>.</li></ul>`,
        },
        {
          id: 'adapter',
          title: 'Adapter l’écran et retrouver son travail',
          html: `<ul><li><b>Thème clair / sombre</b> : bouton <b>◐</b> de la barre supérieure. Le choix est mémorisé sur le poste. Le thème clair convient aux salles lumineuses, aux vidéoprojecteurs et aux captures pour un compte rendu ; le schéma du dossier technique est toujours dessiné en clair.</li>
            <li><b>Panneaux redimensionnables</b> : tirez le <b>bord intérieur</b> de la boîte à outils ou de l’inspecteur pour les élargir, et le <b>bord supérieur</b> de la console pour l’agrandir. Double-clic sur le bord : taille par défaut. Les tailles sont mémorisées sur le poste.</li>
            <li><b>Session restaurée</b> : le réseau du canevas, la vue, le mode et le TP en cours (avec son étape) sont enregistrés automatiquement sur le poste. À la réouverture, le travail reprend là où il s’était arrêté (message « Session restaurée » dans le journal). <b>Nouveau</b> repart d’une page blanche.</li></ul>
            <div class="warning">La session restaurée dépend du navigateur et du compte : elle ne remplace pas la <b>sauvegarde</b> (${kbd('Ctrl')} + ${kbd('S')}), seule à pouvoir être rouverte sur un autre poste ou rendue au professeur. Pendant un examen, la session n’est pas enregistrée : l’examen a sa propre reprise.</div>`,
        },
        {
          id: 'raccourcis',
          title: 'Raccourcis clavier',
          html: `<table><tr><th>Touche</th><th>Action</th></tr>
            <tr><td>${kbd('V')}</td><td>Sélection / déplacement</td></tr>
            <tr><td>${kbd('L')}</td><td>Relier deux équipements</td></tr>
            <tr><td>${kbd('F')}</td><td>Créer un flux de trafic entre deux terminaux</td></tr>
            <tr><td>${kbd('P')}</td><td>Ping / traceroute entre deux terminaux</td></tr>
            <tr><td>${kbd('C')}</td><td>Couper / rétablir un lien, ou mettre un équipement en panne / le remettre en service (mode Dépannage ou Diagnostic)</td></tr>
            <tr><td>${kbd('Suppr')}</td><td>Supprimer la sélection</td></tr>
            <tr><td>${kbd('Échap')}</td><td>Abandonner l’outil en cours, fermer une fenêtre</td></tr>
            <tr><td>${kbd('Ctrl')} + ${kbd('Z')} / ${kbd('Ctrl')} + ${kbd('Y')}</td><td>Annuler / rétablir</td></tr>
            <tr><td>${kbd('Ctrl')} + ${kbd('S')}</td><td>Sauvegarder la topologie (JSON) ; pendant un examen : <b>Rendre ma copie</b></td></tr>
            <tr><td>${kbd('+')} ${kbd('−')} ${kbd('0')}</td><td>Zoom avant, arrière, tout afficher</td></tr></table>`,
        },
        {
          id: 'etat',
          title: 'Barre d’état, journal et console',
          html: `<ul><li><b>Barre d’état</b> (en bas) : mode courant, nombre d’équipements et de liens, <b>santé du réseau</b> (liaisons en service, dégradées, coupées), coordonnées du pointeur, nom du fichier et <b>version</b> utilisée (élève ou enseignant).</li>
            <li><b>Journal d’événements</b> : chaque action et chaque changement d’état (coupure, repli de modulation, basculement d’anneau…) y est horodaté.</li>
            <li><b>Console</b> : résultat des ping et traceroute.</li>
            <li><b>Flux de trafic</b> : chaque flux créé, son chemin, son débit et son état.</li>
            <li>Le bouton ▾ réduit ou agrandit la zone ; « Effacer » vide l’onglet affiché.</li></ul>`,
        },
        {
          id: 'auteur',
          title: 'Auteur et contact',
          html: `<p>MicroWave, BLR &amp; VSAT Lab est conçu par <b>Hassami COMPAORE</b> — <a href="mailto:decompaore@gmail.com">decompaore@gmail.com</a> — Tél. / WhatsApp : <b>+226 79 00 03 04</b>. Questions, remarques et propositions de TP sont les bienvenues.</p>`,
        },
      ],
    },
    {
      id: 'guide-construire',
      group: G_GUIDE,
      title: 'Construire un réseau',
      sections: [
        {
          id: 'poser',
          title: 'Poser les sites et les équipements',
          html: `<ul><li><b>Glissez</b> un élément de la boîte à outils sur le canevas (ou cliquez-le, puis cliquez sur le canevas).</li>
            <li><b>Sites</b> : un <b>pylône</b> (15 à 150 m) ou un <b>toit-terrasse</b> (immeuble R+N) porte les antennes. Déposée sur un pylône ou un immeuble, une antenne, une ODU ou une radio Full-Outdoor s’y <b>fixe</b> : elle prend la hauteur et l’altitude du site et se déplace avec lui.</li>
            <li><b>Hauteur d’un pylône</b> : tirez la <b>poignée</b> à son sommet sur le canevas, ou réglez-la dans ses Paramètres, ou sous le profil de Fresnel (« Ajuster les hauteurs »). Les antennes fixées au sommet suivent.</li>
            <li><b>Obstacles</b> (relief / colline, arbres / forêt, bâtiment haut) : posés entre deux sites, ils apparaissent sur le profil des bonds qu’ils traversent. Réglez-les <b>à la souris</b> : la poignée du haut règle la <b>hauteur</b> (5 à 400 m), la poignée ◀ ▶ à droite du disque règle la <b>largeur</b> (emprise) ; ou dans l’inspecteur.</li>
            <li><b>Immeuble (toit-terrasse)</b> : la poignée « R+N » au-dessus de l’immeuble règle le <b>nombre d’étages</b> à la souris ; les équipements posés sur le toit suivent.</li>
            <li><b>Orientation</b> : une fois le faisceau créé, chaque antenne FH (ou radio Full-Outdoor) se tourne vers l’antenne d’en face, et chaque CPE vers sa station de base : les deux antennes d’un bond se font face, en visibilité directe.</li>
            <li><b>Altitude du sol</b> : réglable pour chaque site ; le profil en tient compte.</li></ul>`,
        },
        {
          id: 'relier',
          title: 'Relier les équipements',
          html: `<p>Outil <b>Lier</b> (${kbd('L')}) : cliquez sur le premier équipement, puis sur le second. Le type de lien est <b>déduit</b> des équipements :</p>
            <table><tr><th>Entre</th><th>Lien créé</th></tr>
            <tr><td>Antenne FH ↔ antenne FH, Full-Outdoor ↔ Full-Outdoor</td><td><b>Bond FH</b> (faisceau)</td></tr>
            <tr><td>Station de base BLR ↔ CPE</td><td><b>Liaison BLR</b> point-à-multipoint</td></tr>
            <tr><td>Antenne VSAT ou Hub ↔ satellite</td><td><b>Liaison satellite</b> (montante et descendante)</td></tr>
            <tr><td>ODU ↔ antenne</td><td>Branchement (guide d’onde / connecteur)</td></tr>
            <tr><td>IDU ↔ ODU</td><td>Câble <b>IF</b> (coaxial, alimente l’ODU)</td></tr>
            <tr><td>Modem ↔ BUC / LNB</td><td>Câble <b>coaxial</b> (bande L)</td></tr>
            <tr><td>Autres équipements</td><td>Câble <b>Ethernet</b> RJ45 (ou fibre, au choix dans le menu « Lien : auto »)</td></tr></table>
            <p>Un lien impossible (deux CPE entre eux, par exemple) est refusé avec un message expliquant pourquoi.</p>`,
        },
        {
          id: 'chaines',
          title: 'Les chaînes d’équipements à respecter',
          html: `<table><tr><th>Système</th><th>Chaîne complète</th></tr>
            <tr><td>FH <i>split-mount</i></td><td>Routeur / switch — <b>IDU</b> — câble IF — <b>ODU</b> — <b>antenne</b> ~~~ antenne — ODU — IDU — routeur / switch</td></tr>
            <tr><td>FH tout-extérieur</td><td>Switch — <b>Full-Outdoor</b> ~~~ Full-Outdoor — switch</td></tr>
            <tr><td>BLR</td><td>Routeur — <b>station de base</b> ~~~ <b>CPE</b> — PC / agence</td></tr>
            <tr><td>VSAT</td><td>Terminal — <b>modem</b> — <b>BUC</b> + <b>LNB</b> — <b>antenne VSAT</b> ~~~ <b>satellite</b> ~~~ <b>Hub</b> — routeur — Internet</td></tr></table>
            <p>Un maillon manquant est signalé dans l’inspecteur (« ODU non alimentée », « pas de LNB »…) et la liaison reste coupée.</p>`,
        },
        {
          id: 'parametres',
          title: 'Régler un équipement ou un lien',
          html: `<p>Sélectionnez-le (outil ${kbd('V')}) : l’onglet <b>Paramètres</b> de l’inspecteur affiche :</p>
            <ul><li><b>Identification</b> : nom, type, site de fixation ;</li>
            <li><b>Paramètres</b> : bande, canal, largeur de canal, puissance d’émission, diamètre d’antenne, polarisation, XPIC, ACM, protection 1+1, azimut / élévation, VLAN, adresse IP… selon l’équipement ;</li>
            <li><b>Voyants</b> et messages d’alerte ;</li>
            <li>pour un lien : distance, bande, état, <b>charge</b> (trafic transporté).</li></ul>
            <p>Chaque réglage est recalculé immédiatement : bilan, couleur du faisceau, flux.</p>`,
        },
        {
          id: 'modifier',
          title: 'Déplacer, supprimer, annuler',
          html: `<ul><li>Déplacez un équipement en le faisant glisser ; les longueurs de bonds sont recalculées.</li>
            <li>${kbd('Suppr')} ou l’outil Supprimer retire l’élément et ses liens.</li>
            <li>${kbd('Ctrl')} + ${kbd('Z')} annule, ${kbd('Ctrl')} + ${kbd('Y')} rétablit (plusieurs niveaux).</li>
            <li><b>Nouveau</b> efface le canevas (une confirmation est demandée).</li></ul>`,
        },
      ],
    },
    {
      id: 'guide-propagation',
      group: G_GUIDE,
      title: 'Pluie, climat, disponibilité et fréquences',
      sections: [
        {
          id: 'pluie',
          title: 'Faire pleuvoir',
          html: `<p>Le curseur <b>Pluie</b> de la barre supérieure applique une intensité de 0 à 100 mm/h à toutes les liaisons (le libellé indique « Ciel clair », « Pluie modérée », « Orage tropical »…). En mode <b>Météo &amp; Propagation</b>, le bouton « Simuler un orage » fait passer un orage complet.</p>
            <p>Observez dans le bilan : l’<b>atténuation due à la pluie</b> augmente avec la fréquence et la longueur du bond ; la modulation se replie (ACM) ; au-delà de la marge, la liaison coupe. Un satellite peut ne pas subir la pluie locale (réglage « Subit la pluie locale » de la station).</p>`,
        },
        {
          id: 'climat',
          title: 'Climat et objectif de disponibilité',
          html: `<p>Dans les <b>réglages du projet</b> (cliquez sur le fond du canevas : l’inspecteur n’a plus de sélection) : choisissez le <b>climat</b> (sahélien sec, soudano-sahélien, soudano-guinéen, côtier humide, ou personnalisé), qui fixe le gradient de réfractivité dN1 et l’intensité de pluie R0,01, puis l’<b>objectif de disponibilité</b> (99,9 % à 99,999 %).</p>
            <p>Le bilan d’un bond FH affiche alors la <b>disponibilité</b> calculée selon UIT-R P.530 : coupures dues aux <b>trajets multiples</b> (évanouissements) et à la <b>pluie</b>, en secondes ou minutes par an, comparées à l’objectif. Voir le cours ${link('fh', 'dispo', 'Disponibilité d’un bond')}.</p>
            <p><b>Diversité d’espace</b> : dans les paramètres d’un bond FH, la configuration « 1+1 HSB + diversité d’espace (SD) » ajoute une seconde antenne, plus bas sur le pylône (écart vertical S réglable) ; le bilan affiche le facteur d’amélioration et la nouvelle disponibilité.</p>`,
        },
        {
          id: 'plan-freq',
          title: 'Plan de fréquences et interférences',
          html: `<p>Chaque ODU a une <b>demi-bande</b> d’émission (basse / haute) et un <b>numéro de canal</b>. Les deux extrémités d’un bond doivent utiliser le même canal, des demi-bandes opposées, la même largeur et la même polarisation.</p>
            <p>Cochez <b>« Interférences entre bonds FH »</b> dans les réglages du projet : le simulateur calcule le brouillage reçu de chaque autre émetteur (diagramme d’antenne UIT-R F.699, découplage de polarisation, filtrage du canal adjacent NFD) et affiche le rapport <b>C/I</b> dans le bilan. Un C/I insuffisant dégrade la modulation : changez de canal, de polarisation ou d’azimut. Voir ${link('fh', 'plan-freq', 'Plan de fréquences')}.</p>`,
        },
      ],
    },
    {
      id: 'guide-satellites',
      group: G_GUIDE,
      title: 'Satellites GEO, MEO et LEO',
      sections: [
        {
          id: 'placer-sat',
          title: 'Poser un satellite',
          html: `<p>Glissez un <b>Satellite relais</b> en haut du canevas (segment spatial). Dans ses paramètres : <b>orbite</b> (GEO 35 786 km, MEO 8 000 km, LEO 550 km), <b>bande</b> (C, Ku, Ka) et, pour un GEO, sa <b>position orbitale</b> (longitude, ex. 7° E).</p>
            <p>Les stations (Hub, antennes VSAT) sont reliées au satellite avec l’outil Lier. Leurs coordonnées géographiques sont déduites de l’<b>origine du plan</b> (réglages du projet, Ouagadougou par défaut) ou saisies directement (« Coordonnées : Saisie manuelle »).</p>`,
        },
        {
          id: 'defilants',
          title: 'Satellites défilants (LEO, MEO) et horloge',
          html: `<p>Un satellite LEO ou MEO n’est pas fixe dans le ciel. Réglez son <b>mouvement</b> sur « Défilement réel (horloge de simulation) » : une <b>constellation</b> est modélisée (satellites par plan orbital, élévation maximale des passages). L’<b>horloge de simulation</b> apparaît alors dans la barre du canevas : ▶ lance le temps (×1 à ×300).</p>
            <p>Observez : l’élévation et la distance changent, donc le bilan, la latence et le <b>décalage Doppler</b> ; au coucher d’un satellite, le terminal <b>bascule</b> sur le suivant (handover) ; trop peu de satellites par plan laisse des <b>trous de couverture</b>. L’onglet Profil de la liaison trace l’élévation et le RTT au cours du temps. Voir le cours ${link('vsat', 'orbites', 'Orbites GEO, MEO, LEO')}.</p>`,
        },
      ],
    },
    {
      id: 'guide-d2d',
      group: G_GUIDE,
      title: 'Direct-to-Device : satellite vers mobile et IoT',
      sections: [
        {
          id: 'd2d-poser',
          title: 'Construire un réseau Direct-to-Device',
          html: `<p>La famille <b>Direct-to-Device (D2D / NTN)</b> de la boîte à outils relie un satellite directement à un <b>smartphone</b>, un <b>capteur IoT</b> ou un <b>véhicule</b>, sans parabole. Chaîne à respecter :</p>
            <ul><li><b>Terminal</b> (smartphone, capteur IoT, véhicule) — lien <i>direct</i> — <b>Satellite D2D</b> — <i>liaison de connexion (feeder)</i> — <b>Station sol NTN</b> — fibre — <b>Cœur mobile</b> (EPC / 5GC) — réseau IP, serveurs, Internet.</li>
            <li>Pour comparer avec le réseau terrestre, reliez aussi le terminal à une <b>BTS / gNodeB</b> (lien <i>accès radio terrestre 4G</i>) : la BTS doit elle-même être raccordée au cœur (fibre, FH, VSAT…), sinon sa cellule est hors antenne.</li></ul>
            <p>Paramètres du <b>Satellite D2D</b> : le <b>système</b> (Direct-to-Cell LTE, haut débit à grandes antennes, IoT GEO bande L, IoT LEO à stockage et retransmission), la bande (spectre de l’opérateur ou bande MSS), le canal, la puissance par faisceau, la réutilisation de fréquence, l’élévation ou le défilement réel (horloge, voir ${link('guide-satellites', 'defilants', 'Satellites défilants')}), le nombre de satellites et les autres utilisateurs du faisceau. Un satellite GEO se place seul sur l’orbite géostationnaire.</p>
            <p>Paramètres du <b>terminal</b> : type (smartphone classe 3 ou 2), emplacement (extérieur, véhicule, intérieur), <b>puce NTN 3GPP Rel-17</b>, abonnement autorisé sur le satellite, vue dégagée du ciel, position dans le faisceau ; pour un capteur IoT : messages par jour, taille, pile, durée du point GNSS, RAI, âge des éphémérides. Le <b>Cœur mobile</b> porte l’accord avec l’opérateur satellite et le seuil de bascule ; la <b>Station sol NTN</b> peut subir la pluie locale.</p>`,
        },
        {
          id: 'd2d-acces',
          title: 'Réseau terrestre prioritaire et bascule vers le satellite',
          html: `<p>Chaque terminal choisit lui-même son réseau, comme un vrai mobile : la <b>cellule terrestre reste prioritaire</b> tant que son RSRP dépasse le seuil du cœur mobile (−115 dBm par défaut). En dessous — zone blanche, BTS détruite, BTS privée de transmission — il se rattache à la <b>cellule satellite</b>, si le satellite est visible, si le terminal est compatible et si l’abonnement est accepté.</p>
            <ul><li>Sur le canevas, le lien actif est coloré (vert : voix et données, orange : service réduit), le lien de secours est gris pointillé « <b>veille</b> », un lien sans service est rouge. L’étiquette du terminal indique 📶 4G terrestre ou 📡 satellite.</li>
            <li>Le journal note chaque bascule ; les flux IP suivent le réseau choisi.</li>
            <li>Le cône vert sous le satellite représente l’<b>empreinte du faisceau</b> : plusieurs dizaines de kilomètres pour un seul faisceau.</li>
            <li><b>Terminal en mouvement</b> : réglez le « Mouvement » d’un smartphone ou d’un véhicule sur « Sur un trajet » (longueur, direction, vitesse). Le trajet est tracé en pointillés ; lancez l’horloge (▶) : le terminal fait l’aller-retour et bascule entre cellules terrestres et satellite au fil de la route.</li></ul>
            <p><b>Dépannage</b> (mode Diagnostic → Dépannage) : les terminaux affichent le réseau utilisé (voyant « Réseau 4G », « Réseau SAT » ou « Aucun réseau »), la BTS le voyant « Émission cellule », la station sol le voyant « Poursuite satellite ». Le bilan compare le RSRP <b>calculé</b> et <b>mesuré</b>. Interventions possibles : remplacer la BTS, le terminal ou la station sol, refaire le branchement d’antenne (BTS, véhicule), repointer la station sol. Méthode : ${link('fiche-pannes', 'tableau-pannes', 'Du symptôme à la cause')}.</p>
            <p>Notions de cours : ${link('d2d', 'd2d-pourquoi', 'Direct-to-Device : satellite vers mobile et IoT')}. Cinq réseaux prêts à explorer illustrent les usages (fenêtre Travaux Pratiques → onglet <b>Exemples</b>, Ex 6 à 10) : zone blanche rurale, catastrophe naturelle, déplacement hors couverture, IoT au Sahel, véhicules connectés.</p>`,
        },
        {
          id: 'd2d-bilan',
          title: 'Bilan, niveau des calculs, services et analyseurs',
          html: `<p>Sélectionnez le lien direct d’un terminal. L’onglet <b>Bilan de liaison</b> donne l’élévation, le RSRP, le SINR, le débit du faisceau et par utilisateur, le débit montant optimal, le Doppler et la latence, puis le tableau des <b>services progressifs</b> (alerte, SMS, IoT, messagerie, voix, données, vidéo) avec la raison de chaque refus, et enfin tous les calculs pas à pas par rubrique.</p>
            <p>Le sélecteur <b>Niveau des calculs</b> adapte le détail : <b>Bac Pro</b> (bilan essentiel : distance, FSL, puissance reçue, SNR, latence), <b>Licence</b> (G/T, RSRP, empreinte, scintillation, Doppler, couverture) ou <b>Master / ingénieur</b> (perte de balayage, ombrage 3GPP TR 38.811, SINR, plafond de Shannon, allocation montante, HARQ, K_offset). Le choix est mémorisé sur le poste ; chaque calcul avancé porte une étiquette de niveau.</p>
            <p>L’onglet <b>Profil &amp; Fresnel</b> devient pour ce lien un ensemble d’<b>analyseurs</b> : courbe en S du Doppler et de l’élévation pendant un passage, couverture et taille de constellation, partage du faisceau et, pour un capteur IoT, l’<b>autonomie de la pile</b> et le délai de stockage et retransmission. Pour un lien terrestre, il trace le RSRP selon la distance à la BTS avec le seuil de bascule et le niveau du satellite.</p>`,
        },
      ],
    },
    {
      id: 'guide-reseau',
      group: G_GUIDE,
      title: 'Réseau IP : adresses, VLAN, flux et ping',
      sections: [
        {
          id: 'adresses',
          title: 'Adresses IP et VLAN',
          html: `<ul><li>Chaque terminal, routeur et switch a une <b>adresse IP</b> et un <b>masque</b> (préfixe /n), et une <b>passerelle</b> pour les terminaux.</li>
            <li>Switch : <b>VLAN autorisés</b> (trunk) et VLAN d’accès ; CPE BLR : <b>VLAN d’accès</b> du port client ; IDU : <b>VLAN</b> transportés par le bond.</li>
            <li>Routeur : routage inter-VLAN, <b>MPLS</b> (LDP) et <b>Fast Reroute</b>.</li></ul>
            <p>Un VLAN absent d’un équipement du chemin bloque le service : c’est l’isolement voulu entre clients (TP 4), ou une erreur de configuration à corriger.</p>`,
        },
        {
          id: 'flux',
          title: 'Créer un flux de trafic',
          html: `<p>Outil <b>Flux</b> (${kbd('F')}) : cliquez sur la source puis sur la destination. Indiquez son nom, le débit demandé et la classe de service (voix, vidéo, données). Le flux est animé sur le plan (bouton ⏸ / ▶ de la barre du canevas) et listé dans l’onglet <b>Flux de trafic</b> : chemin emprunté, débit acheminé, état (acheminé, congestionné quand la capacité radio est dépassée, coupé).</p>
            <p>Quand un bond coupe (pluie, panne, outil ${kbd('C')}), le flux est <b>re-routé</b> par l’autre côté de l’anneau ou par le lien de secours, s’il en existe un.</p>`,
        },
        {
          id: 'ping',
          title: 'Ping et traceroute',
          html: `<p>Outil <b>Ping</b> (${kbd('P')}) : cliquez sur deux terminaux. La console affiche le ping (temps aller-retour <b>RTT</b>, qui inclut la latence satellite) et le <b>traceroute</b> : la liste des équipements traversés. En cas d’échec, le dernier équipement joignable indique où chercher la coupure.</p>`,
        },
        {
          id: 'anneau',
          title: 'Anneau ERPS et lien de secours',
          html: `<p>Sur un anneau de switches, activez <b>ERPS G.8032</b> sur les liens de l’anneau et désignez un lien <b>RPL</b> (bloqué en temps normal) et son propriétaire. L’onglet <b>Réseau</b> de l’inspecteur montre l’état de l’anneau. Coupez un bond : le RPL se débloque et le trafic repasse par l’autre côté.</p>
            <p>Une liaison peut être marquée <b>« Lien de secours (backup) »</b> (ex. VSAT) : elle n’est utilisée que si le chemin principal est coupé.</p>`,
        },
      ],
    },
    {
      id: 'guide-depannage',
      group: G_GUIDE,
      title: 'Le mode Dépannage',
      sections: [
        {
          id: 'principe',
          title: 'Principe',
          html: `<p>Un réseau peut contenir des <b>pannes cachées</b> : matérielles (équipement hors service, antenne dépointée, câble coupé, branchement humide…) ou de configuration (canal, polarisation, VLAN, adresse IP…). Le simulateur ne les nomme <b>jamais</b> : seuls leurs <b>symptômes</b> sont visibles. À vous de les localiser par la mesure, puis d’intervenir.</p>
            <ol><li><b>Constater</b> : quels services ne passent plus ? (flux, ping)</li>
            <li><b>Localiser</b> : traceroute, voyants, bilan de liaison (RSL calculé / RSL mesuré).</li>
            <li><b>Intervenir</b> sur l’élément suspect, ou corriger le réglage erroné.</li>
            <li><b>Vérifier</b> par une nouvelle mesure, puis noter l’intervention.</li></ol>
            <p>Méthode détaillée : cours ${link('depannage', 'demarche', 'Maintenance et dépannage')}.</p>`,
        },
        {
          id: 'interventions',
          title: 'Les interventions sur site',
          html: `<p>En mode <b>Dépannage</b>, sélectionnez un équipement ou un câble : l’encadré <b>« Intervention sur site »</b> de l’inspecteur propose les actions possibles.</p>
            <table><tr><th>Intervention</th><th>Équipements concernés</th></tr>
            <tr><td>Remplacer l’équipement</td><td>ODU, IDU, Full-Outdoor, BUC, LNB, modem, CPE, station de base…</td></tr>
            <tr><td>Repointer l’antenne</td><td>Antenne FH, Full-Outdoor, antenne VSAT, CPE</td></tr>
            <tr><td>Refaire le branchement</td><td>ODU ↔ antenne (connecteurs, guide d’onde)</td></tr>
            <tr><td>Reprendre le câble</td><td>Câble IF, coaxial, Ethernet, fibre</td></tr></table>
            <p>Le simulateur ne dit pas si l’élément était défectueux : <b>mesurez de nouveau</b>. Une intervention sur un élément sain est inutile (et pénalisée en examen). Une erreur de configuration se corrige dans les <b>Paramètres</b>.</p>`,
        },
        {
          id: 'journal',
          title: 'Le journal de dépannage',
          html: `<p>Vos mesures (bilan consulté, ping), réglages modifiés et interventions sont enregistrés dans un journal horodaté. Pendant un examen pratique, il est joint à la copie : l’examinateur voit si chaque correction a été précédée d’une mesure.</p>
            <p>Entraînement : <b>TP 12</b> (pannes fixes, corrigé détaillé) et <b>TP 16</b> (pannes tirées au hasard à chaque chargement).</p>
            `,
        },
      ],
    },
    {
      id: 'guide-activites',
      group: G_GUIDE,
      title: 'Tutoriels, TP, exercices et fiches',
      sections: [
        {
          id: 'fenetre',
          title: 'La fenêtre Activités',
          html: `<p>Bouton <b>Travaux Pratiques (TP)</b> : la fenêtre a plusieurs onglets.</p>
            <table><tr><th>Onglet</th><th>Contenu</th></tr>
            <tr><td>Tutoriels</td><td>Prises en main guidées, pas à pas, pour découvrir une fonction du simulateur.</td></tr>
            <tr><td>Travaux pratiques</td><td>21 TP de 1 à 3 h : contexte, objectifs, étapes vérifiées automatiquement, questions et synthèse.</td></tr>
            <tr><td>Exercices corrigés</td><td>Calculs de bilan, Fresnel, pluie, satellite… avec correction et explication pas à pas.</td></tr>
            <tr><td>Exemples</td><td>Réseaux prêts à explorer, sans consignes : backhaul FH d’un site 4G, recette du backhaul (une liaison non conforme à trouver), réseau VSAT en étoile, BLR 5,8 GHz à trois secteurs, constellation LEO.</td></tr></table>
            <p>Les épreuves se passent dans la fenêtre <b>Examen</b> (bouton de la barre supérieure) : voir ${link('guide-examen', 'passer', 'Passer un examen')}.</p>`,
        },
        {
          id: 'tp',
          title: 'Réaliser un TP',
          html: `<ol><li>Choisissez le TP et cliquez sur <b>« Charger la topologie du TP »</b> : le réseau de départ s’affiche (la topologie courante est remplacée).</li>
            <li>Le panneau flottant des <b>consignes</b> guide étape par étape. Il se déplace par son titre et se réduit (▾).</li>
            <li>Chaque étape est <b>vérifiée automatiquement</b> : elle passe au vert quand l’objectif est atteint (ex. « marge au fading &gt; 25 dB »).</li>
            <li>Répondez aux questions sur votre compte rendu, ou sur la <b>fiche élève</b> imprimée.</li></ol>
            <p>Bouton <b>📄 Fiche élève</b> : fiche à imprimer (en-tête nominatif, tableaux de relevés, questions avec lignes de réponse). « Imprimer toutes les fiches élèves » en bas de la liste les regroupe.</p>
            `,
        },
      ],
    },
    {
      id: 'guide-examen',
      group: G_GUIDE,
      title: 'Versions élève / enseignant et examens',
      sections: [
        {
          id: 'versions',
          title: 'Les deux versions',
          html: `<table><tr><th>Version</th><th>Contenu</th></tr>
            <tr><td><b>Élève</b></td><td>Tutoriels, TP, exercices corrigés, documentation, fiches élèves, mode Dépannage. Pas de corrigé des TP, pas d’injection ni de révélation des pannes, pas d’outil de création de sujets.</td></tr>
            <tr><td><b>Enseignant</b></td><td>Tout le contenu, les corrigés des TP, les pannes cachées (mode Diagnostic) et l’espace examinateur : création des sujets et correction des copies.</td></tr></table>
            <p>La version utilisée est indiquée dans la barre d’état, en bas à droite.</p>`,
        },
        {
          id: 'passer',
          title: 'Passer un examen (élève)',
          html: `<ol><li>Cliquez sur <b>Ouvrir</b> (barre supérieure) et choisissez le fichier <code>sujet-….json</code> donné par l’enseignant — ou bouton <b>🎓 Examen</b>, puis « Fichier sujet ».</li>
            <li>Un <b>sujet nominatif</b> affiche « Sujet nominatif : NOM Prénom » et remplit votre identité : vérifiez qu’il s’agit bien de vous. Sinon, saisissez nom, prénom et classe. Lisez les <b>consignes</b>, puis <b>Commencer l’examen</b>.</li>
            <li>La barre supérieure affiche votre nom, le <b>temps restant</b> (en rouge les 5 dernières minutes), <b>📋 Consignes</b> (à relire à tout moment), <b>Ma copie</b> (exercices, TP et dépannage de l’épreuve) et <b>📤 Rendre ma copie</b>.</li>
            <li>Répondez aux <b>exercices</b>, réalisez les <b>TP</b> demandés dans le simulateur et, si le sujet en contient, le <b>dépannage pratique</b> : le réseau est alors <b>verrouillé</b> (impossible d’ajouter, supprimer ou déplacer un élément) ; seuls les réglages, les mesures et les interventions sont permis.</li>
            <li>À la fin, <b>📤 Rendre ma copie</b> (ou ${kbd('Ctrl')} + ${kbd('S')}) : le fichier <code>copie-NOM-PRENOM.json</code> est enregistré dans Téléchargements ; déposez-le dans le dossier indiqué par l’enseignant (dossier Copies du partage de la classe, clé USB…). À la fin du temps, la copie est rendue automatiquement.</li></ol>
            <div class="tip">Pendant le dépannage pratique, vos mesures, réglages et interventions sont enregistrés dans un <b>journal</b> joint à la copie.</div>
            <div class="tip">Si le navigateur est fermé par erreur, l’examen reprend à la réouverture, sur le même poste.</div>`,
        },
        
      ],
    },
    
    {
      id: 'guide-fichiers',
      group: G_GUIDE,
      title: 'Fichiers, sauvegarde et compte rendu',
      sections: [
        {
          id: 'json',
          title: 'Sauvegarder et rouvrir',
          html: `<ul><li><b>Sauvegarder</b> (${kbd('Ctrl')} + ${kbd('S')}) enregistre la topologie complète au format <b>JSON</b> : équipements, liens, réglages, flux, pluie et réglages du projet. Le titre du projet donne le nom du fichier.</li>
            <li><b>Ouvrir</b> recharge un fichier JSON, sur n’importe quel poste.</li>
            <li>Rangez vos fichiers dans votre dossier personnel ou sur le partage de la classe, avec un nom explicite (<code>TP3-NOM-Prenom.json</code>).</li></ul>`,
        },
        {
          id: 'image',
          title: 'Illustrer un compte rendu',
          html: `<ul><li>Le bouton <b>image</b> (à droite de Sauvegarder) exporte le schéma du réseau en <b>SVG</b> : il s’insère dans un traitement de texte et reste net à l’impression.</li>
            <li>Le bilan pas à pas, le profil de Fresnel et l’aide au pointage peuvent être recopiés ou capturés (outil Capture d’écran de Windows : ${kbd('Win')} + ${kbd('Maj')} + ${kbd('S')}).</li></ul>`,
        },
      ],
    },
  ];

  /* =================================================================
   * 2. INSTRUMENTS ET MESURES
   * ================================================================= */
  const MESURES = [
    {
      id: 'mes-bilan',
      group: G_MESURES,
      title: 'Bilan de liaison pas à pas',
      sections: [
        {
          id: 'lire',
          title: 'Lire le bilan',
          html: `<p>Sélectionnez un bond FH, une liaison BLR ou une liaison satellite (ou l’un de ses équipements), puis l’onglet <b>Bilan de liaison</b>. Chaque ligne donne la <b>formule</b>, l’<b>application numérique</b> et le <b>résultat</b> : vous pouvez refaire le calcul à la main.</p>
            <table><tr><th>Liaison</th><th>Grandeurs affichées</th></tr>
            <tr><td>FH / BLR</td><td>Fréquence, distance, gains d’antenne, <b>PIRE</b>, affaiblissement en espace libre <b>FSL</b>, gaz, pluie, obstacle (diffraction), dépointage, <b>RSL</b>, bruit, seuils de chaque modulation, <b>marge au fading</b>, modulation et débit retenus (ACM), XPIC, C/I, disponibilité.</td></tr>
            <tr><td>VSAT</td><td>Voie <b>montante</b> et <b>descendante</b> : PIRE de la station, FSL (~196 à 213 dB), G/T, <b>C/N0</b>, <b>C/N</b>, <b>Eb/N0</b>, MODCOD DVB-S2X retenu, débit, <b>latence</b> RTT.</td></tr></table>`,
        },
        {
          id: 'rsl',
          title: 'RSL calculé et RSL mesuré',
          html: `<p>Le <b>RSL calculé</b> est la valeur attendue d’après les réglages. Le <b>RSL mesuré</b> est ce que lit réellement l’IDU (ou le voltmètre AGC de l’ODU). Normalement, ils sont égaux à ±1 dB près.</p>
            <div class="warning">Un écart de plus de <b>3 dB</b> entre calcul et mesure signale une perte anormale : branchement humide, antenne dépointée, câble endommagé… C’est le premier indice du dépannage d’un bond.</div>
            <p>Le statut est résumé par la couleur : vert (marge confortable), orange (repli de modulation), rouge (sous le seuil QPSK : coupure).</p>
            <p>Comparer calcul et mesure de toutes les liaisons, conclure et produire le rapport : ${link('fiche-recette', 'simulateur-recette', 'fiche de recette')}.</p>`,
        },
      ],
    },
    {
      id: 'mes-profil',
      group: G_MESURES,
      title: 'Profil de terrain et zone de Fresnel',
      sections: [
        {
          id: 'lire-profil',
          title: 'Lire le profil',
          html: `<p>Onglet <b>Profil &amp; Fresnel</b> d’un bond FH ou BLR : coupe du terrain entre les deux sites, avec la <b>courbure terrestre</b> (renflement, coefficient k = 4/3), les pylônes, les obstacles, la ligne de visée et l’ellipse de la <b>1re zone de Fresnel</b>.</p>
            <ul><li>Le <b>dégagement</b> est donné en % du rayon de Fresnel au point le plus critique : il faut au moins <b>60 %</b> (100 % recommandé).</li>
            <li>Un obstacle dans la zone ajoute une perte de <b>diffraction</b> (lame de couteau) au bilan.</li></ul>`,
        },
        {
          id: 'hauteurs',
          title: 'Ajuster les hauteurs',
          html: `<p>Sous le profil, la rubrique <b>« Ajuster les hauteurs »</b> règle directement la hauteur des pylônes (ou des mâts) des deux extrémités. Quand le dégagement est insuffisant, le message sous le profil indique de combien <b>surélever</b> les antennes pour atteindre 60 % ou 100 %. Le profil et le bilan sont recalculés en direct (TP 2).</p>`,
        },
      ],
    },
    {
      id: 'mes-pointage',
      group: G_MESURES,
      title: 'Aide au pointage VSAT',
      sections: [
        {
          id: 'pointer',
          title: 'Pointer une parabole',
          html: `<p>Pour une liaison VSAT, l’onglet <b>Profil &amp; Fresnel</b> devient l’<b>aide au pointage</b> : <b>azimut</b>, <b>élévation</b> et <b>skew</b> (rotation de la polarisation) à régler, calculés depuis les coordonnées de la station et la position du satellite.</p>
            <ul><li>Saisissez l’azimut et l’élévation <b>réglés</b> dans les paramètres de l’antenne VSAT (ou cochez « Pointage automatique ») : l’<b>erreur de pointage</b> et la perte qu’elle cause sont affichées.</li>
            <li>Une erreur de quelques dixièmes de degré suffit à perdre plusieurs dB sur une parabole de 1,8 m en bande Ka : le faisceau est très étroit.</li></ul>
            <p>Méthode d’installation : ${link('fiche-vsat', '', 'Installer et pointer une station VSAT')}.</p>`,
        },
      ],
    },
    {
      id: 'mes-reseau',
      group: G_MESURES,
      title: 'Ping, traceroute, flux et vue réseau',
      sections: [
        {
          id: 'outils-ip',
          title: 'Les outils du réseau IP',
          html: `<table><tr><th>Outil</th><th>Ce qu’il mesure</th><th>Où lire</th></tr>
            <tr><td>Ping (${kbd('P')})</td><td>Le service passe-t-il ? Temps aller-retour (RTT)</td><td>Console</td></tr>
            <tr><td>Traceroute</td><td>Équipements traversés ; dernier équipement joignable</td><td>Console</td></tr>
            <tr><td>Flux (${kbd('F')})</td><td>Chemin, débit acheminé, re-routage</td><td>Onglet Flux de trafic</td></tr>
            <tr><td>Onglet Réseau</td><td>Anneaux ERPS, LSP MPLS, VLAN, charge des liens</td><td>Inspecteur</td></tr></table>
            <p>Ordres de grandeur du RTT : FH ou BLR seuls &lt; 10 ms ; satellite LEO 25 à 45 ms ; MEO 130 à 150 ms ; GEO 520 à 600 ms.</p>`,
        },
      ],
    },
    {
      id: 'mes-voyants',
      group: G_MESURES,
      title: 'Voyants des équipements',
      sections: [
        {
          id: 'voyants',
          title: 'Lire les voyants',
          html: `<p>Les voyants sont affichés dans l’inspecteur de l’équipement (rubrique <b>Voyants</b>).</p>
            <table><tr><th>Voyant</th><th>Allumé (vert)</th><th>Éteint / rouge : piste</th></tr>
            <tr><td>Alim.</td><td>Équipement alimenté</td><td>Équipement hors service, câble IF coupé (ODU non alimentée)</td></tr>
            <tr><td>Signal reçu</td><td>Porteuse de l’extrémité distante reçue</td><td>Émetteur distant, antenne dépointée, obstacle, canal / polarisation différents</td></tr>
            <tr><td>Alarme</td><td>(éteint = normal)</td><td>Allumée : niveau reçu insuffisant, défaut matériel</td></tr>
            <tr><td>Rx (verrouillage)</td><td>Modem satellite verrouillé sur la porteuse</td><td>LNB, câble coaxial, pointage, satellite</td></tr>
            <tr><td>Tx</td><td>Modem autorisé à émettre</td><td>BUC, câble coaxial, pas de verrouillage Rx</td></tr>
            <tr><td>Ports Ethernet</td><td>Lien établi</td><td>Câble réseau coupé ou équipement voisin éteint</td></tr></table>`,
        },
      ],
    },
  ];

  /* =================================================================
   * 3. FICHES D'INGÉNIERIE
   * ================================================================= */
  const FICHES = [
    {
      id: 'fiche-bond',
      group: G_FICHES,
      title: 'Dimensionner un bond FH',
      sections: [
        {
          id: 'methode',
          title: 'Méthode en 6 étapes',
          html: `<ol><li><b>Distance</b> et visibilité : relevez la distance entre les sites ; vérifiez le profil (obstacles, courbure).</li>
            <li><b>Bande</b> : choisie selon la distance (tableau ci-dessous) et la disponibilité des canaux.</li>
            <li><b>Hauteurs</b> : 60 % de la 1re zone de Fresnel dégagés au point critique.</li>
            <li><b>Antennes</b> : diamètre suffisant pour la marge, sans dépasser la charge au vent du pylône.</li>
            <li><b>Bilan</b> : RSL, marge au fading (souvent visée &gt; 25 à 35 dB), modulation et débit.</li>
            <li><b>Disponibilité</b> : vérifier l’objectif (ex. 99,995 %) ; sinon, plus grande antenne, bande plus basse, diversité d’espace ou bond plus court.</li></ol>`,
        },
        {
          id: 'bandes',
          title: 'Choisir la bande',
          html: `<table><tr><th>Bande</th><th>Portée typique</th><th>Puissance Tx max</th><th>Remarque</th></tr>
            <tr><td>6 GHz</td><td>30 – 60 km</td><td>30 dBm</td><td>Longs bonds, peu sensible à la pluie, grandes antennes</td></tr>
            <tr><td>7 / 8 GHz</td><td>20 – 50 km</td><td>29 – 30 dBm</td><td>Bonds régionaux</td></tr>
            <tr><td>11 / 13 GHz</td><td>10 – 30 km</td><td>26 – 27 dBm</td><td>Compromis</td></tr>
            <tr><td>15 / 18 GHz</td><td>5 – 20 km</td><td>24 – 26 dBm</td><td>Sensible aux orages tropicaux</td></tr>
            <tr><td>23 GHz</td><td>3 – 10 km</td><td>23 dBm</td><td>Courts bonds urbains</td></tr>
            <tr><td>E-Band 70 / 80 GHz</td><td>0,5 – 3 km</td><td>15 dBm</td><td>Très haut débit (jusqu’à 10 Gbit/s), très sensible à la pluie</td></tr></table>`,
        },
        {
          id: 'exemple',
          title: 'Exemple chiffré (25 km, 7 GHz, canal 28 MHz)',
          html: `<table><tr><th>Terme</th><th>Valeur</th></tr>
            <tr><td>FSL = 92,45 + 20·log(25) + 20·log(7,2)</td><td>137,6 dB</td></tr>
            <tr><td>Gain d’une parabole 1,2 m à 7,2 GHz (η = 0,55)</td><td>36,5 dBi (0,6 m : 30,5 dBi)</td></tr>
            <tr><td>RSL avec Tx 30 dBm, 2 × 1,2 m, pertes 1 dB</td><td>30 + 36,5 + 36,5 − 137,6 − 1 ≈ <b>−35,6 dBm</b></td></tr>
            <tr><td>Seuil QPSK / 256QAM (28 MHz, NF 4,5 dB)</td><td>−86 dBm / −67,5 dBm</td></tr>
            <tr><td>Marge au fading (seuil QPSK)</td><td>≈ <b>50 dB</b> ; en 256QAM ≈ 32 dB</td></tr>
            <tr><td>Rayon de Fresnel à mi-bond / renflement (k = 4/3)</td><td>16,1 m / 9,2 m</td></tr>
            <tr><td>Pluie 80 mm/h sur 25 km à 7,2 GHz</td><td>≈ 7,5 dB (à 18 GHz : bien davantage)</td></tr></table>
            <p>À vérifier dans le simulateur : TP 1 (choix 7 GHz / 18 GHz, diamètre d’antenne).</p>`,
        },
      ],
    },
    {
      id: 'fiche-blr',
      group: G_FICHES,
      title: 'Déployer une boucle locale radio',
      sections: [
        {
          id: 'etapes-blr',
          title: 'Étapes',
          html: `<ol><li><b>Bande</b> : 3,5 GHz (licence, 2 à 15 km), 5,8 GHz (bande libre, 1 à 10 km), 26 GHz (mmWave, 0,3 à 2 km).</li>
            <li><b>Station de base</b> : hauteur sur pylône, <b>azimut du secteur</b> et <b>ouverture</b> (90° ou 120°) pour couvrir les abonnés ; 3 ou 4 secteurs pour 360°.</li>
            <li><b>CPE</b> : antenne directive pointée vers la station ; un abonné hors du secteur subit une perte de diagramme. Vérifier RSL et MCS dans le bilan.</li>
            <li><b>Pertes de mur</b> pour un CPE intérieur (réglage « Installation »).</li>
            <li><b>VLAN</b> : un VLAN par client (accès sur le port du CPE, trunk vers le cœur), pour isoler les trafics (TP 4).</li>
            <li><b>Capacité</b> : le débit du secteur est partagé entre ses abonnés : vérifier la charge dans l’onglet Flux.</li></ol>`,
        },
      ],
    },
    {
      id: 'fiche-vsat',
      group: G_FICHES,
      title: 'Installer et pointer une station VSAT',
      sections: [
        {
          id: 'choix-vsat',
          title: 'Choisir la station',
          html: `<table><tr><th>Bande</th><th>Montant / descendant</th><th>Pluie</th><th>Usage</th></tr>
            <tr><td>C</td><td>6 / 4 GHz</td><td>Quasi insensible</td><td>Zones tropicales, liaisons critiques, grandes antennes (1,8 à 2,4 m)</td></tr>
            <tr><td>Ku</td><td>14 / 12 GHz</td><td>Sensible</td><td>Le plus courant (0,75 à 1,8 m)</td></tr>
            <tr><td>Ka</td><td>30 / 20 GHz</td><td>Très sensible (orages)</td><td>Très haut débit, faisceaux étroits</td></tr></table>
            <p>Puissance du <b>BUC</b> (2 à 16 W) et diamètre d’antenne règlent la <b>PIRE</b> montante ; le <b>LNB</b> (facteur de bruit) et l’antenne règlent le <b>G/T</b> en réception.</p>`,
        },
        {
          id: 'installation-vsat',
          title: 'Installation et pointage',
          html: `<ol><li>Fixer le pied ou le mât <b>d’aplomb</b> (niveau à bulle), sur un support rigide, dégagé vers le sud (Afrique de l’Ouest, satellite GEO).</li>
            <li>Calculer <b>azimut</b>, <b>élévation</b> et <b>skew</b> (aide au pointage du simulateur, ou du modem).</li>
            <li>Régler l’élévation sur le rapporteur, l’azimut à la boussole (corriger la déclinaison magnétique), le skew en tournant le LNB / BUC.</li>
            <li>Affiner par <b>balayage</b> lent en azimut puis en élévation, en cherchant le maximum du niveau reçu (indicateur du modem, voyant Rx lock).</li>
            <li>Serrer les fixations, étancher les connecteurs F (ruban vulcanisant), mettre à la terre.</li>
            <li>Faire le test de <b>polarisation croisée</b> avec le centre de contrôle du satellite, puis l’activation du service.</li></ol>`,
        },
      ],
    },
    {
      id: 'fiche-d2d',
      group: G_FICHES,
      title: 'Dimensionner une liaison Direct-to-Device',
      sections: [
        {
          id: 'methode-d2d',
          title: 'Méthode en huit étapes',
          html: `<ol><li><b>Besoin</b> : quels services (SMS, IoT, voix, données), combien d’abonnés actifs par faisceau, quelle latence acceptable, couverture continue ou différée ?</li>
            <li><b>Système et bande</b> : Direct-to-Cell dans le spectre de l’opérateur (smartphones du commerce) ou NTN en bande L/S (terminaux Rel-17) ; LEO (faible latence, beaucoup de satellites) ou GEO (toujours visible, ≈ 550 ms).</li>
            <li><b>Géométrie</b> : élévation minimale, distance d = √((R+h)² − (R·cos E)²) − R·sin E, angle de visée et perte de balayage.</li>
            <li><b>Bilan descendant</b> : PIRE du faisceau − FSL − pertes (position dans le faisceau, scintillation, ombrage, polarisation 3 dB, corps 3 dB, véhicule 8 dB, bâtiment ≈ 18 dB) + G du terminal → C, RSRP, SNR.</li>
            <li><b>Bilan montant</b> : 23 dBm − pertes + G/T du satellite → C/N0 ; choisir le nombre de blocs (ou une tonalité NB-IoT) qui maximise le débit.</li>
            <li><b>Débit et services</b> : CQI (ou répétitions), débit du faisceau, débit par utilisateur actif, tableau des services progressifs.</li>
            <li><b>Contraintes LEO</b> : Doppler et précompensation, avance temporelle, K_offset, HARQ, taille de constellation, revisite.</li>
            <li><b>Réseau</b> : feeder et station sol (pluie en bande Ka), cœur mobile, accord avec l’opérateur satellite, seuil de bascule, coexistence (densité de flux hors zone).</li></ol>
            <p>Le simulateur affiche chaque étape pas à pas (onglet Bilan de liaison, niveau des calculs au choix). Cours : ${link('d2d', 'd2d-bilan', 'Le bilan de liaison d’un smartphone')}.</p>`,
        },
        {
          id: 'reperes-d2d',
          title: 'Repères chiffrés',
          html: `<table><tr><th>Grandeur</th><th>Ordre de grandeur</th></tr>
            <tr><td>Puissance d’un smartphone / gain d’antenne</td><td>23 dBm (classe 3), 26 dBm (classe 2) / ≈ 0 dBi</td></tr>
            <tr><td>G/T d’un smartphone</td><td>≈ −31,6 dB/K</td></tr>
            <tr><td>FSL à 2 GHz : LEO 550 km au zénith / à 25° / GEO</td><td>≈ 153 dB / ≈ 159 dB / ≈ 190 dB</td></tr>
            <tr><td>RSRP de service satellite</td><td>−110 à −125 dBm</td></tr>
            <tr><td>Doppler LEO à 2 GHz / dérive</td><td>±45 kHz / ≈ 600 Hz/s</td></tr>
            <tr><td>Empreinte d’un faisceau LEO</td><td>30 à 60 km (D2C), centaines de km (IoT)</td></tr>
            <tr><td>Débit d’un faisceau D2C de 5 MHz</td><td>quelques Mbit/s partagés</td></tr>
            <tr><td>Satellites pour une couverture continue (525 km, 25°)</td><td>≥ 241 (bien plus pour la capacité)</td></tr>
            <tr><td>Autonomie IoT visée</td><td>10 ans sur une pile de quelques Ah</td></tr></table>`,
        },
      ],
    },
    {
      id: 'fiche-ip',
      group: G_FICHES,
      title: 'Plan d’adressage IP et VLAN',
      sections: [
        {
          id: 'plan-ip',
          title: 'Construire le plan',
          html: `<ul><li>Un <b>VLAN par service ou par client</b> (ex. 100 gestion, 200 données, 300 voix ; ou un VLAN par entreprise).</li>
            <li>Un <b>sous-réseau IP par VLAN</b> : ex. VLAN 200 → 10.20.0.0/24, passerelle 10.20.0.1 sur le routeur.</li>
            <li>Une adresse de <b>gestion</b> (loopback ou VLAN de gestion) pour chaque IDU, switch et routeur.</li>
            <li>Sur chaque équipement du chemin : le VLAN doit être <b>autorisé</b> (trunk) ; en bout de chaîne, port en <b>accès</b> sur le bon VLAN.</li></ul>
            <table><tr><th>VLAN</th><th>Usage</th><th>Réseau</th><th>Passerelle</th></tr>
            <tr><td>100</td><td>Gestion des équipements radio</td><td>10.10.0.0/24</td><td>10.10.0.1</td></tr>
            <tr><td>200</td><td>Client A</td><td>10.20.0.0/24</td><td>10.20.0.1</td></tr>
            <tr><td>300</td><td>Client B</td><td>10.30.0.0/24</td><td>10.30.0.1</td></tr></table>`,
        },
      ],
    },
    {
      id: 'fiche-recette',
      group: G_FICHES,
      title: 'Recette d’une liaison radio : calcul, mesure, conformité',
      sections: [
        {
          id: 'calcul-terrain',
          title: 'Calcul et terrain',
          html: `<p>Le bilan de liaison donne une valeur <b>de référence</b>, calculée avec les caractéristiques nominales des fiches techniques. Il sert à <b>dimensionner</b> la liaison, pas à la déclarer conforme : sur le terrain, chaque équipement a ses propres tolérances.</p>
            <table><tr><th>Élément</th><th>Calcul</th><th>Sur le terrain</th></tr>
            <tr><td>Puissance d’émission de l’ODU</td><td>valeur réglée</td><td>tolérance constructeur ± 1 à ± 2 dB</td></tr>
            <tr><td>Gain d’antenne</td><td>formule (rendement 55 %)</td><td>de −0,6 à +0,3 dB selon la fabrication et le montage</td></tr>
            <tr><td>Branchement ODU – antenne, connecteurs</td><td>0,5 dB par extrémité</td><td>0,3 à 1,2 dB (serrage, étanchéité)</td></tr>
            <tr><td>Propagation par ciel clair</td><td>espace libre + gaz</td><td>± 0,5 dB (réfraction, scintillation)</td></tr>
            <tr><td>Station VSAT</td><td>gain, BUC, LNB nominaux</td><td>tolérances BUC (−1 à +0,5 dB) et LNB (−0,8 à +0,4 dB)</td></tr></table>`,
        },
        {
          id: 'juger',
          title: 'Juger une liaison',
          html: `<ol><li><b>Calculer</b> le niveau attendu (onglet Bilan de liaison).</li>
            <li><b>Mesurer</b> par ciel clair, après pointage : RSL lu sur l’IDU (ou tension AGC de l’ODU convertie en dBm), Es/N0 lu sur le modem satellite.</li>
            <li><b>Comparer</b> : écart = mesure − calcul.</li></ol>
            <table><tr><th>Écart</th><th>Conclusion</th></tr>
            <tr><td>entre −3 et +3 dB</td><td><b>Conforme</b> : écart dû aux tolérances normales des équipements</td></tr>
            <tr><td>inférieur à −3 dB</td><td><b>Non conforme</b> : perte anormale à localiser (pointage, branchement humide, connecteur, obstacle) avant la réception des travaux</td></tr>
            <tr><td>supérieur à +3 dB</td><td><b>Suspect</b> : mesure meilleure que le calcul ; vérifier la lecture, la puissance d’émission réglée et les données du bilan</td></tr></table>
            <p>La tolérance exacte est fixée par le cahier des charges de recette de l’opérateur ou du maître d’ouvrage (souvent ± 2 à ± 3 dB). On vérifie aussi la modulation atteinte (ACM) et le taux d’erreurs, et l’on consigne tout dans le <b>rapport de recette</b>.</p>`,
        },
        {
          id: 'simulateur-recette',
          title: 'Dans le simulateur',
          html: `<ul><li><b>Fiche de recette</b> : onglet <b>Bilan de liaison</b>, sans sélection (cliquez sur le fond du canevas). Une ligne par sens de chaque liaison FH ou BLR (RSL reçu) et par station VSAT (Es/N0 voie aller) : saisissez la valeur mesurée, l’écart et la conclusion s’affichent.</li>
            <li>Où lire la mesure : sélectionnez la liaison, onglet Bilan de liaison ; en recette réaliste, le bilan affiche « RSL calculé » puis « RSL mesuré sur l’équipement de réception » (pour le satellite, la valeur Es/N0 du bilan est celle du modem).</li>
            <li>En mode <b>recette réaliste</b>, chaque liaison réelle s’écarte un peu du calcul, de façon reproductible, comme sur le terrain. Combinée à des pannes cachées, la recette fait apparaître les liaisons <b>non conformes</b>.</li>
            <li><b>Rapport de recette</b> (bouton de la fiche) : document imprimable avec chaque mesure, l’écart, la conclusion et la conclusion générale (conforme, non conforme, incomplète). Les mesures sont enregistrées avec le fichier, reprises dans le dossier technique et jointes à la copie d’examen.</li></ul>
            `,
        },
      ],
    },
    {
      id: 'fiche-pannes',
      group: G_FICHES,
      title: 'Pannes typiques et symptômes',
      sections: [
        {
          id: 'tableau-pannes',
          title: 'Du symptôme à la cause',
          html: `<table><tr><th>Symptôme</th><th>Mesure</th><th>Causes possibles</th></tr>
            <tr><td>Bond FH coupé, aucun signal reçu</td><td>Voyants des deux ODU ; RSL</td><td>ODU ou IDU hors service, câble IF coupé, canal ou polarisation différents</td></tr>
            <tr><td>Bond FH dégradé par ciel clair</td><td>RSL mesuré &lt; RSL calculé de plus de 3 dB</td><td>Antenne dépointée, branchement ODU – antenne humide, obstacle</td></tr>
            <tr><td>Débit réduit, modulation fixe</td><td>Paramètres ACM</td><td>ACM désactivée, modulation fixe trop élevée</td></tr>
            <tr><td>Abonné BLR sans service</td><td>RSL du CPE, voyants, ping</td><td>CPE hors service ou dépointé, VLAN d’accès erroné</td></tr>
            <tr><td>Station VSAT : Rx non verrouillé</td><td>Voyant Rx, Eb/N0 descendant</td><td>LNB, câble coaxial, parabole dépointée</td></tr>
            <tr><td>Station VSAT : Rx OK mais pas d’émission</td><td>Voyant Tx</td><td>BUC hors service, câble coaxial d’émission</td></tr>
            <tr><td>Radio OK mais un service ne passe pas</td><td>Ping, traceroute</td><td>VLAN non autorisé, adresse IP dans le mauvais réseau, câble réseau</td></tr>
            <tr><td>Terminal mobile près d’une BTS, mais sur le satellite</td><td>Voyant « Émission cellule » de la BTS ; RSRP terrestre calculé / mesuré</td><td>Module radio de la BTS, jarretière d’antenne, transmission de la BTS coupée, seuil de bascule du cœur mobile mal réglé</td></tr>
            <tr><td>Cellule satellite vue, inscription refusée</td><td>Message du terminal, paramètres du cœur mobile</td><td>Abonnement non autorisé sur le satellite, accord avec l’opérateur satellite absent</td></tr>
            <tr><td>Tous les terminaux d’un satellite sans service</td><td>Voyant « Poursuite satellite » de la station sol ; C/N du feeder</td><td>Station sol hors service ou mal poursuivie, orage sur la station sol, fibre station sol – cœur</td></tr>
            <tr><td>Objet IoT reçu mais jamais entendu par le satellite</td><td>Rubrique Doppler du bilan, paramètres de l’objet</td><td>Éphémérides périmées, mode NTN désactivé</td></tr>
            <tr><td>Terminal sans aucun réseau, voyant « Aucun réseau »</td><td>Voyants, bilans terrestre et satellite</td><td>Terminal hors service, antenne de toit du véhicule endommagée, terminal à l’intérieur</td></tr></table>
            <p>Méthode et rapport d’intervention : cours ${link('depannage', '', 'Maintenance et dépannage')}.</p>`,
        },
      ],
    },
  ];

  /* =================================================================
   * 4. SUPPORTS IMPRIMABLES (livrets A4, tools/livrets.js)
   * ================================================================= */
  const doc = (f, t) => `<a href="${f}" target="_blank" rel="noopener">${t}</a>`;
  const PRINT = [
    {
      id: 'print',
      group: G_PRINT,
      title: 'Livrets à imprimer',
      sections: [
        {
          id: 'livrets',
          title: 'Les livrets',
          html: `<p>Livrets au format A4, à ouvrir dans le navigateur puis à imprimer ou enregistrer en PDF (bouton « Imprimer » en haut de chaque livret). Ils sont fournis avec l’application et fonctionnent hors ligne.</p>
            <table><tr><th>Livret</th><th>Contenu</th></tr>
            <tr><td>${doc('tutoriels-imprimables.html', '📘 Tutoriels')}</td><td>13 tutoriels illustrés de captures d’écran (interface, bond FH, bilan, Fresnel, pluie et ACM, VSAT et pointage, LEO, BLR et VLAN, réseau IP et anneau, dépannage, recette, activités et examen), fiche mémo, grille d’auto-évaluation.</td></tr>
            <tr><td>${doc('tp-complementaires-imprimables.html', '📗 TP complémentaires')}</td><td>4 TP de 2 h avec fiches à compléter : étude d’un bond FH de 32 km, recette d’un réseau régional, dépannage sur sujet avec fiche d’intervention, avant-projet VSAT d’un site minier (appel d’offres).</td></tr>
            <tr><td>${doc('exercices-imprimables.html', '📙 Exercices')}</td><td>Les 35 exercices des 7 séries, avec lignes de réponse, puis leurs corrigés détaillés.</td></tr></table>
            <p>Les <b>fiches élèves</b> de chaque TP du simulateur s’impriment depuis la fenêtre des TP (bouton « 📄 Fiche élève »).</p>
            `,
        },
      ],
    },
  ];

  /* =================================================================
   * Assemblage : guide + mesures + fiches + cours (labs.js)
   * ================================================================= */
  const COURSE_GROUPS = { memo: G_MEMO };
  function build() {
    const course = (MBV.Course && Array.isArray(MBV.Course.chapters) ? MBV.Course.chapters : []).filter((c) => c.id !== 'guide');
    course.forEach((c) => {
      if (!c.group) c.group = COURSE_GROUPS[c.id] || G_COURS;
    });
    return GUIDE.concat(MESURES, FICHES, course, PRINT);
  }
  const chapters = build();
  MBV.Docs = {
    groups: GROUPS,
    chapters,
    find: (id) => chapters.find((c) => c.id === id) || null,
  };
})(typeof window !== 'undefined' ? window : globalThis);
