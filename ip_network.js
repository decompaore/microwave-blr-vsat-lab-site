/* =====================================================================
 * ip_network.js — Simulation de la couche transport IP / MPLS / Ethernet
 * MicroWave, BLR & VSAT Lab
 *
 * Contenu (MBV.IpNetwork) :
 *   - Rôles réseau des équipements (terminal, routeur, switch, pont, radio)
 *   - Adressage IPv4 (sous-réseaux, passerelle)
 *   - VLAN 802.1Q : ports d'accès (tag par CPE/modem), trunks filtrés, isolation
 *   - Routage IP (coût type OSPF), routage inter-VLAN, liens de secours (backup)
 *   - MPLS : LSP, labels (push / swap / pop PHP), transport L2VPN (pseudowire)
 *   - Anneaux Ethernet ERPS ITU-T G.8032 : RPL bloqué, basculement < 50 ms,
 *     détection des boucles non protégées (tempête de broadcast)
 *   - QoS (priorité stricte voix > vidéo > données) et charge des liens
 *   - Outils : ping, traceroute, journal de basculement
 *
 * Modèle de topologie attendu :
 *   nodes : [{ id, type, name, x, y, props:{...} }]
 *   links : [{ id, a, b, medium, props:{ backup, rpl, cut, capacityMbps },
 *              state:{ up, capacityMbps, latencyMs, status } }]
 *   flows : [{ id, name, src, dst, rateMbps, cls:'voice'|'video'|'data' }]
 * ===================================================================== */
(function (root) {
  'use strict';

  const MBV = (root.MBV = root.MBV || {});
  const Util = MBV.Util || {
    fmt: (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—'),
  };

  /* ------------------------------------------------------------------
   * 1. RÔLES DES ÉQUIPEMENTS
   *   endpoint : terminal (source/destination du trafic, ne relaie pas)
   *   router   : routeur IP/MPLS (couche 3)
   *   switch   : commutateur Carrier Ethernet (VLAN, ERPS, option L3)
   *   bridge   : équipement transparent avec filtrage VLAN (IDU, CPE, modem…)
   *   radio    : élément RF passif transparent (ODU, antenne, satellite, BUC, LNB)
   *   passive  : site / obstacle (pas de rôle réseau)
   * ------------------------------------------------------------------ */
  const ROLE_BY_TYPE = {
    tower: 'passive',
    building: 'passive',
    obstacle: 'passive',
    idu: 'bridge',
    odu: 'radio',
    fullOutdoor: 'bridge',
    antenna: 'radio',
    blrBts: 'bridge',
    blrCpe: 'bridge',
    satellite: 'radio',
    hub: 'bridge',
    vsatAntenna: 'radio',
    buc: 'radio',
    lnb: 'radio',
    vsatModem: 'bridge',
    router: 'router',
    switch: 'switch',
    gnodeb: 'endpoint',
    ruralSite: 'endpoint',
    bankAgency: 'endpoint',
    pc: 'endpoint',
    server: 'endpoint',
    internet: 'endpoint',
    // Direct-to-Device / NTN
    d2dSat: 'radio',
    ntnGateway: 'bridge',
    mobileCore: 'router',
    ue: 'endpoint',
    iotDevice: 'endpoint',
    vehicle: 'endpoint',
  };

  /** Débit par défaut (Mbit/s) des supports filaires. */
  const WIRED_CAPACITY = { ethernet: 1000, fiber: 10000, if: 10000, coax: 10000 };
  /** Latence par défaut (ms) d'un lien selon le support (hors VSAT, fournie par le moteur satellite). */
  const DEFAULT_LATENCY = { ethernet: 0.05, fiber: 0.1, if: 0.01, coax: 0.01, fh: 0.15, blr: 2.0, vsat: 120, d2d: 5, feeder: 3, cell: 10 };
  const NODE_LATENCY_MS = { router: 0.1, switch: 0.02, bridge: 0.05, radio: 0, endpoint: 0, passive: 0 };
  const QOS_PRIORITY = { voice: 0, video: 1, data: 2 };
  const QOS_LABEL = { voice: 'Voix (EF)', video: 'Vidéo (AF41)', data: 'Données (BE)' };
  const OSPF_REF_MBPS = 10000;
  const BACKUP_COST = 100000;

  /* ------------------------------------------------------------------
   * 2. OUTILS IP & VLAN
   * ------------------------------------------------------------------ */
  const IpTools = {
    /** Convertit "a.b.c.d" en entier 32 bits non signé (ou null si invalide). */
    ipToInt(ip) {
      if (typeof ip !== 'string') return null;
      const parts = ip.trim().split('.');
      if (parts.length !== 4) return null;
      let v = 0;
      for (const p of parts) {
        if (!/^\d{1,3}$/.test(p)) return null;
        const n = Number(p);
        if (n > 255) return null;
        v = v * 256 + n;
      }
      return v >>> 0;
    },
    isValidIp(ip) {
      return IpTools.ipToInt(ip) !== null;
    },
    maskFromPrefix(prefix) {
      const p = Math.max(0, Math.min(32, Number(prefix) || 0));
      return p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
    },
    networkOf(ip, prefix) {
      const i = IpTools.ipToInt(ip);
      if (i === null) return null;
      return (i & IpTools.maskFromPrefix(prefix)) >>> 0;
    },
    intToIp(v) {
      return [24, 16, 8, 0].map((s) => (v >>> s) & 255).join('.');
    },
    /** Vrai / faux si les deux adresses sont dans le même sous-réseau ; null si inconnu. */
    sameSubnet(ipA, prefixA, ipB) {
      const a = IpTools.networkOf(ipA, prefixA);
      const b = IpTools.networkOf(ipB, prefixA);
      if (a === null || b === null) return null;
      return a === b;
    },
    /**
     * Analyse une liste de VLAN : "all" / "" → null (tous autorisés),
     * "100,200,300-305" → Set{100,200,300,…,305}.
     */
    parseVlanList(str) {
      if (str === undefined || str === null) return null;
      const s = String(str).trim().toLowerCase();
      if (s === '' || s === 'all' || s === 'tous' || s === '*') return null;
      const set = new Set();
      for (const part of s.split(/[,;\s]+/)) {
        if (!part) continue;
        const m = part.match(/^(\d+)(?:-(\d+))?$/);
        if (!m) continue;
        const a = Number(m[1]);
        const b = m[2] ? Number(m[2]) : a;
        for (let v = Math.min(a, b); v <= Math.max(a, b) && v <= 4094; v++) set.add(v);
      }
      return set;
    },
    vlanLabel(v) {
      return v ? 'VLAN ' + v : 'non tagué';
    },
    /** Formulation en phrase : « dans le VLAN 100 » / « sans VLAN (trames non taguées) ». */
    vlanPhrase(v) {
      return v ? 'dans le VLAN ' + v : 'sans VLAN (trames non taguées)';
    },
  };

  /* ------------------------------------------------------------------
   * 3. MOTEUR RÉSEAU
   * ------------------------------------------------------------------ */
  class NetworkEngine {
    /**
     * @param {object} topology { nodes, links, flows }
     */
    constructor(topology) {
      this.topology = topology;
      this.nodes = new Map();
      this.links = new Map();
      this.adj = new Map(); // nodeId -> [{link, other}]
      for (const n of topology.nodes || []) {
        this.nodes.set(n.id, n);
        this.adj.set(n.id, []);
      }
      for (const l of topology.links || []) {
        if (!this.nodes.has(l.a) || !this.nodes.has(l.b)) continue;
        if (l.medium === 'mount') continue; // fixation mécanique sur un site
        // Le LNB (réception) et le BUC (émission) forment les deux moitiés d'un même
        // chemin modem ↔ antenne : seul le chemin via le BUC est retenu pour le trafic IP
        // (sinon la chaîne modem–BUC–antenne–LNB–modem serait vue comme une boucle).
        const ta = this.nodes.get(l.a).type;
        const tb = this.nodes.get(l.b).type;
        if (l.medium === 'coax' && (ta === 'lnb' || tb === 'lnb')) continue;
        this.links.set(l.id, l);
        this.adj.get(l.a).push({ link: l, other: l.b });
        this.adj.get(l.b).push({ link: l, other: l.a });
      }
      // Une BTS/gNodeB qui sert des terminaux mobiles (lien « cell ») relaie leur trafic vers le cœur
      this.cellSites = new Set();
      for (const l of this.links.values()) {
        if (l.medium !== 'cell') continue;
        for (const id of [l.a, l.b]) if (this.nodes.get(id).type === 'gnodeb') this.cellSites.add(id);
      }
      this.blockedLinks = new Set(); // RPL bloqués par ERPS
      this.stormNodes = new Set(); // nœuds pris dans une boucle L2 non protégée
      this.rings = [];
      this.warnings = [];
    }

    /* ---------------- Propriétés des nœuds et liens ---------------- */

    role(nodeOrId) {
      const n = typeof nodeOrId === 'string' ? this.nodes.get(nodeOrId) : nodeOrId;
      if (!n) return 'passive';
      if (this.cellSites && this.cellSites.has(n.id)) return 'bridge';
      return ROLE_BY_TYPE[n.type] || 'passive';
    }
    props(id) {
      const n = this.nodes.get(id);
      return (n && n.props) || {};
    }
    name(id) {
      const n = this.nodes.get(id);
      return n ? n.name || n.id : id;
    }
    /** Le nœud sait-il router (couche 3) ? */
    canRoute(id) {
      const r = this.role(id);
      return r === 'router' || (r === 'switch' && !!this.props(id).l3);
    }
    isMpls(id) {
      return this.role(id) === 'router' && this.props(id).mpls !== false;
    }
    /** Le nœud laisse-t-il passer ce VLAN ? */
    acceptsVlan(id, vlan) {
      const r = this.role(id);
      if (r === 'radio') return true;
      if (r === 'passive') return false;
      if (!vlan) return true;
      const set = IpTools.parseVlanList(this.props(id).vlans);
      return set === null || set.has(vlan);
    }
    isLinkUp(l) {
      if (l.props && l.props.cut) return false;
      if (l.state && l.state.up === false) return false;
      return true;
    }
    linkCapacity(l) {
      if (l.state && Number.isFinite(l.state.capacityMbps)) return l.state.capacityMbps;
      if (l.props && Number.isFinite(Number(l.props.capacityMbps)) && Number(l.props.capacityMbps) > 0) return Number(l.props.capacityMbps);
      return WIRED_CAPACITY[l.medium] || 1000;
    }
    /** Débit dans un sens donné ('ab' = de l.a vers l.b) ; liens asymétriques (VSAT, BLR TDD). */
    linkCapacityDir(l, dir) {
      const cd = l.state && l.state.capacityDir;
      if (cd && Number.isFinite(cd[dir])) return cd[dir];
      return this.linkCapacity(l);
    }
    linkLatency(l) {
      if (l.state && Number.isFinite(l.state.latencyMs)) return l.state.latencyMs;
      return DEFAULT_LATENCY[l.medium] || 0.1;
    }
    /** Coût de routage type OSPF : référence 10 Gbit/s / débit, pénalité si lien de secours. */
    linkCost(l) {
      const cap = Math.max(this.linkCapacity(l), 0.1);
      let c = Math.max(1, OSPF_REF_MBPS / cap);
      if (l.props && l.props.backup) c += BACKUP_COST;
      return c;
    }
    /** VLAN effectif d'un terminal : son VLAN propre, sinon le VLAN d'accès de l'équipement voisin (CPE, modem…). */
    endpointVlan(id) {
      const p = this.props(id);
      const own = Number(p.vlan) || 0;
      if (own) return own;
      for (const { link, other } of this.adj.get(id) || []) {
        if (!this.isLinkUp(link)) continue;
        const acc = Number(this.props(other).accessVlan) || 0;
        if (acc) return acc;
      }
      return 0;
    }
    /** Ensemble des VLAN connus de la topologie (pour le routage inter-VLAN). */
    allVlans() {
      const set = new Set([0]);
      for (const n of this.nodes.values()) {
        const p = n.props || {};
        if (Number(p.vlan)) set.add(Number(p.vlan));
        if (Number(p.accessVlan)) set.add(Number(p.accessVlan));
        const l = IpTools.parseVlanList(p.vlans);
        if (l && l.size <= 64) l.forEach((v) => set.add(v));
      }
      return [...set];
    }

    /* ---------------- Anneaux & boucles couche 2 (ERPS G.8032) ---------------- */

    isL2Node(id) {
      const r = this.role(id);
      return r === 'switch' || r === 'bridge' || r === 'radio';
    }

    /** Détecte les cycles du domaine couche 2 (base de cycles fondamentaux). */
    findL2Cycles() {
      const l2Links = [...this.links.values()].filter((l) => this.isL2Node(l.a) && this.isL2Node(l.b));
      const parent = new Map();
      const parentLink = new Map();
      const depth = new Map();
      const treeLinks = new Set();
      const adj = new Map();
      for (const l of l2Links) {
        if (!adj.has(l.a)) adj.set(l.a, []);
        if (!adj.has(l.b)) adj.set(l.b, []);
        adj.get(l.a).push({ l, o: l.b });
        adj.get(l.b).push({ l, o: l.a });
      }
      for (const start of adj.keys()) {
        if (depth.has(start)) continue;
        depth.set(start, 0);
        parent.set(start, null);
        const queue = [start];
        while (queue.length) {
          const u = queue.shift();
          for (const { l, o } of adj.get(u)) {
            if (depth.has(o)) continue;
            depth.set(o, depth.get(u) + 1);
            parent.set(o, u);
            parentLink.set(o, l);
            treeLinks.add(l.id);
            queue.push(o);
          }
        }
      }
      const cycles = [];
      for (const l of l2Links) {
        if (treeLinks.has(l.id)) continue;
        // Chemin dans l'arbre entre l.a et l.b + le lien l
        let u = l.a;
        let v = l.b;
        const linksU = [];
        const linksV = [];
        const nodesU = [u];
        const nodesV = [v];
        while (u !== v) {
          if (depth.get(u) >= depth.get(v)) {
            linksU.push(parentLink.get(u));
            u = parent.get(u);
            nodesU.push(u);
          } else {
            linksV.push(parentLink.get(v));
            v = parent.get(v);
            nodesV.push(v);
          }
        }
        nodesV.pop();
        const nodes = nodesU.concat(nodesV.reverse());
        const links = linksU.concat(linksV.reverse(), [l]);
        cycles.push({ nodes, links });
      }
      return cycles;
    }

    /** Applique la logique ERPS aux cycles détectés (bloque les RPL, signale les boucles). */
    applyRingProtection() {
      this.blockedLinks.clear();
      this.stormNodes.clear();
      this.rings = [];
      const cycles = this.findL2Cycles();
      cycles.forEach((cyc, idx) => {
        const switches = cyc.nodes.filter((n) => this.role(n) === 'switch');
        const erpsSwitches = switches.filter((n) => this.props(n).erps);
        const protectedRing = erpsSwitches.length >= 2 && erpsSwitches.length === switches.length;
        const allUp = cyc.links.every((l) => this.isLinkUp(l));
        const ring = {
          index: idx + 1,
          nodes: cyc.nodes,
          links: cyc.links.map((l) => l.id),
          protected: protectedRing,
          allUp,
          rplLink: null,
          rplAuto: false,
          state: '',
          failedLinks: cyc.links.filter((l) => !this.isLinkUp(l)).map((l) => l.id),
        };
        if (protectedRing) {
          // Choix du lien RPL : marqué explicitement > adjacent au propriétaire RPL > lien le plus faible
          let rpl = cyc.links.find((l) => l.props && l.props.rpl);
          if (!rpl) {
            const owner = erpsSwitches.find((n) => this.props(n).rplOwner);
            if (owner) rpl = cyc.links.find((l) => l.a === owner || l.b === owner);
          }
          if (!rpl) {
            rpl = cyc.links.slice().sort((x, y) => this.linkCost(y) - this.linkCost(x))[0];
            ring.rplAuto = true;
          }
          ring.rplLink = rpl.id;
          if (allUp) {
            this.blockedLinks.add(rpl.id);
            ring.state = 'idle';
            ring.stateLabel = 'État IDLE : lien RPL « ' + this.linkName(rpl) + ' » bloqué pour éviter la boucle';
          } else {
            ring.state = 'protection';
            ring.stateLabel = 'État PROTECTION : panne détectée, RPL débloqué, trafic basculé (< 50 ms)';
          }
        } else if (allUp) {
          ring.state = 'loop';
          ring.stateLabel = 'BOUCLE COUCHE 2 NON PROTÉGÉE : tempête de broadcast !';
          cyc.nodes.forEach((n) => this.stormNodes.add(n));
          this.warnings.push({
            level: 'error',
            text:
              'Boucle Ethernet détectée (' +
              cyc.nodes.map((n) => this.name(n)).join(' → ') +
              ') sans protocole ERPS : activez ERPS (G.8032) sur les switches de l’anneau.',
          });
        } else {
          ring.state = 'open';
          ring.stateLabel = 'Anneau ouvert (lien coupé), pas de protection ERPS';
        }
        this.rings.push(ring);
      });
    }

    linkName(l) {
      if (l.props && l.props.name) return l.props.name;
      return this.name(l.a) + ' ↔ ' + this.name(l.b);
    }

    /* ---------------- Recherche de chemin ---------------- */

    /**
     * Recherche du meilleur chemin (Dijkstra) en respectant VLAN, routage et MPLS.
     * État = (nœud, VLAN, routé ?, phase entrée/sortie pour les nœuds routants).
     * @param {string} src  id terminal source
     * @param {string} dst  id terminal destination
     * @param {object} opts { relaxed: ignore VLAN/IP (diagnostic), ignoreLinkState }
     */
    findPath(src, dst, opts = {}) {
      const relaxed = !!opts.relaxed;
      const ignoreState = !!opts.ignoreLinkState;
      const pSrc = this.props(src);
      const pDst = this.props(dst);
      const vSrc = this.endpointVlan(src);
      const vDst = this.endpointVlan(dst);
      const subnet = relaxed ? null : IpTools.sameSubnet(pSrc.ip, pSrc.prefix || 24, pDst.ip);
      const vlans = this.allVlans();
      const key = (s) => s.node + '|' + s.vlan + '|' + (s.routed ? 1 : 0) + '|' + s.phase;
      const dist = new Map();
      const prev = new Map();
      const open = [];
      const start = { node: src, vlan: relaxed ? 0 : vSrc, routed: false, phase: 'out', cost: 0 };
      dist.set(key(start), 0);
      open.push(start);
      let goal = null;

      const push = (from, to, cost, via) => {
        const k = key(to);
        if (!dist.has(k) || cost < dist.get(k) - 1e-9) {
          dist.set(k, cost);
          prev.set(k, { from: key(from), state: from, via });
          to.cost = cost;
          open.push(to);
        }
      };

      while (open.length) {
        // extraction du minimum (graphes de petite taille)
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
        const s = open.splice(bi, 1)[0];
        if (s.cost > dist.get(key(s)) + 1e-9) continue;

        // Arrivée à destination
        if (s.node === dst) {
          if (relaxed) {
            goal = s;
            break;
          }
          const vlanOk = s.vlan === vDst;
          const routeOk = subnet === null ? true : subnet ? !s.routed : s.routed;
          if (vlanOk && routeOk) {
            goal = s;
            break;
          }
          continue;
        }

        // Nœud routant en phase "entrée" : soit routage, soit transit L2
        if (s.phase === 'in') {
          const r = this.role(s.node);
          if (relaxed || r === 'switch') {
            // Switch L3 : peut aussi simplement commuter la trame (couche 2)
            push(s, { node: s.node, vlan: s.vlan, routed: s.routed, phase: 'out' }, s.cost + 0.001, { type: 'l2' });
          } else if (this.isMpls(s.node)) {
            if (s.routed) {
              // Paquet déjà routé par un PE d'entrée : commutation de labels (LSR, L3VPN)
              push(s, { node: s.node, vlan: s.vlan, routed: true, phase: 'out' }, s.cost + 0.001, { type: 'lsr' });
            } else if (subnet !== false) {
              // Même sous-réseau (ou adressage inconnu) : service L2VPN / pseudowire
              push(s, { node: s.node, vlan: s.vlan, routed: false, phase: 'out' }, s.cost + 0.001, { type: 'l2vpn' });
            }
          }
          if (!relaxed) {
            const interVlan = this.props(s.node).interVlan !== false;
            for (const v of vlans) {
              if (v !== s.vlan && !interVlan) continue;
              if (!this.acceptsVlan(s.node, v)) continue;
              push(s, { node: s.node, vlan: v, routed: true, phase: 'out' }, s.cost + 0.01, { type: 'route' });
            }
          }
          continue;
        }

        // Phase "sortie" : traversée des liens
        if (s.node !== src && this.stormNodes.has(s.node) && !relaxed) continue;
        for (const { link, other } of this.adj.get(s.node) || []) {
          if (!ignoreState && !this.isLinkUp(link)) continue;
          if (!relaxed && this.blockedLinks.has(link.id)) continue;
          const r = this.role(other);
          if (r === 'passive') continue;
          if (r === 'endpoint' && other !== dst) continue;
          if (!relaxed && r !== 'endpoint' && !this.acceptsVlan(other, s.vlan)) continue;
          const cost = s.cost + this.linkCost(link) + 0.001;
          const phase = this.canRoute(other) && r !== 'endpoint' ? 'in' : 'out';
          push(s, { node: other, vlan: s.vlan, routed: s.routed, phase }, cost, { type: 'link', link });
        }
      }

      if (!goal) return null;

      // Reconstruction
      const chain = [];
      let k = key(goal);
      let cur = goal;
      while (prev.has(k)) {
        const p = prev.get(k);
        chain.unshift({ state: cur, via: p.via });
        cur = p.state;
        k = p.from;
      }
      const nodes = [src];
      const segments = []; // {link, from, to, vlan}
      const routedAt = [];
      const l2vpnAt = [];
      let vlan = start.vlan;
      for (const step of chain) {
        if (step.via.type === 'link') {
          segments.push({ link: step.via.link, from: nodes[nodes.length - 1], to: step.state.node, vlan });
          nodes.push(step.state.node);
        } else if (step.via.type === 'route') {
          routedAt.push({ node: step.state.node, fromVlan: vlan, toVlan: step.state.vlan });
          vlan = step.state.vlan;
        } else if (step.via.type === 'l2vpn') {
          l2vpnAt.push(step.state.node);
        }
      }
      return { nodes, segments, routedAt, l2vpnAt, cost: goal.cost, vlanSrc: start.vlan, vlanDst: vDst };
    }

    /** Explique pourquoi aucun chemin n'existe. */
    diagnoseFailure(src, dst) {
      const physical = this.findPath(src, dst, { relaxed: true });
      if (!physical) {
        const anyPath = this.findPath(src, dst, { relaxed: true, ignoreLinkState: true });
        if (anyPath) {
          const down = anyPath.segments.filter((s) => !this.isLinkUp(s.link)).map((s) => this.linkName(s.link));
          return { code: 'link-down', text: 'Liaison coupée sur le trajet : ' + down.join(', ') + '.' };
        }
        return { code: 'no-path', text: 'Aucun chemin physique : équipements non raccordés.' };
      }
      // Chemin physique existant → problème de VLAN, d'adressage ou de boucle
      if (physical.nodes.some((n) => this.stormNodes.has(n))) {
        return { code: 'storm', text: 'Tempête de broadcast : boucle Ethernet non protégée sur le trajet.' };
      }
      const vS = this.endpointVlan(src);
      const vD = this.endpointVlan(dst);
      const pS = this.props(src);
      const pD = this.props(dst);
      const same = IpTools.sameSubnet(pS.ip, pS.prefix || 24, pD.ip);
      const filt = physical.nodes.find((n) => this.role(n) !== 'endpoint' && !this.acceptsVlan(n, vS));
      if (vS !== vD && same !== false) {
        return {
          code: 'vlan-isolation',
          text: `Isolation VLAN : la source est ${IpTools.vlanPhrase(vS)}, la destination ${IpTools.vlanPhrase(vD)} (même domaine IP, pas de routage possible).`,
        };
      }
      if (vS !== vD) {
        const routers = physical.nodes.filter((n) => this.canRoute(n));
        if (!routers.length) {
          return { code: 'vlan-isolation', text: `Isolation VLAN : ${IpTools.vlanLabel(vS)} ≠ ${IpTools.vlanLabel(vD)} et aucun routeur sur le trajet.` };
        }
        if (routers.every((n) => this.props(n).interVlan === false)) {
          return { code: 'vlan-isolation', text: 'Isolation VLAN : le routage inter-VLAN est désactivé sur le(s) routeur(s) (' + routers.map((n) => this.name(n)).join(', ') + ').' };
        }
      }
      if (filt) {
        return { code: 'vlan-filter', text: `Le ${IpTools.vlanLabel(vS)} n'est pas autorisé sur « ${this.name(filt)} » (liste VLAN du trunk).` };
      }
      if (same === false && !physical.nodes.some((n) => this.canRoute(n))) {
        return { code: 'no-router', text: 'Sous-réseaux IP différents et aucun routeur sur le trajet (vérifier adresses / masques).' };
      }
      if (same === true && physical.nodes.some((n) => this.role(n) === 'router' && !this.isMpls(n))) {
        return { code: 'routed-same-subnet', text: 'Même sous-réseau de part et d’autre d’un routeur sans MPLS/L2VPN : il faut un service L2VPN ou des sous-réseaux différents.' };
      }
      return { code: 'unreachable', text: 'Destination injoignable (VLAN ou adressage incohérent).' };
    }

    /* ---------------- MPLS ---------------- */

    /** Construit les LSP (suites de routeurs MPLS consécutifs) et les opérations de labels. */
    buildLsps(path, flowIndex) {
      const lsps = [];
      let current = [];
      const routerSeq = path.nodes.filter((n) => this.role(n) === 'router' || this.role(n) === 'endpoint');
      for (const n of routerSeq) {
        if (this.isMpls(n)) current.push(n);
        else {
          if (current.length >= 2) lsps.push(current);
          current = [];
        }
      }
      if (current.length >= 2) lsps.push(current);
      return lsps.map((routers, li) => {
        const ops = [];
        const labels = [];
        for (let i = 0; i < routers.length - 1; i++) {
          // label annoncé (LDP) par le routeur aval pour cette FEC
          labels.push(16 + ((flowIndex + 1) * 1000 + (li + 1) * 100 + (i + 1) * 11) % 1048560);
        }
        routers.forEach((r, i) => {
          if (i === 0 && routers.length === 2)
            // PE de sortie adjacent : il annonce le label implicit-null, rien n'est empilé (PHP)
            ops.push({ node: r, op: 'PUSH', label: null, text: `${this.name(r)} (PE d’entrée) : aucun label de transport empilé (PE de sortie adjacent, implicit-null / PHP)` });
          else if (i === 0) ops.push({ node: r, op: 'PUSH', label: labels[0], text: `${this.name(r)} (PE d’entrée) : PUSH label ${labels[0]}` });
          else if (i === routers.length - 1) ops.push({ node: r, op: 'POP', label: null, text: `${this.name(r)} (PE de sortie) : reçoit le paquet IP/trame sans label` });
          else if (i === routers.length - 2) ops.push({ node: r, op: 'PHP', label: labels[i - 1], text: `${this.name(r)} (P, avant-dernier saut) : POP label ${labels[i - 1]} (PHP)` });
          else ops.push({ node: r, op: 'SWAP', label: labels[i], text: `${this.name(r)} (P) : SWAP ${labels[i - 1]} → ${labels[i]}` });
        });
        // Label en vigueur sur chaque routeur → routeur suivant
        const hopLabels = [];
        for (let i = 0; i < routers.length - 1; i++) {
          const isLastHop = i === routers.length - 2 && routers.length > 2;
          hopLabels.push({ from: routers[i], to: routers[i + 1], label: isLastHop ? null : labels[i] });
        }
        if (routers.length === 2) hopLabels[0].label = null; // PHP direct : 2 PE adjacents
        return { ingress: routers[0], egress: routers[routers.length - 1], routers, labels, ops, hopLabels };
      });
    }

    /** Pile d'en-têtes de la trame sur chaque segment (pour l'affichage pédagogique). */
    buildHeaders(path, lsps, src, dst) {
      const pS = this.props(src);
      const pD = this.props(dst);
      const ipPart = `IP ${pS.ip || '?'} → ${pD.ip || '?'}`;
      // Position de chaque nœud dans le chemin
      const pos = new Map();
      path.nodes.forEach((n, i) => {
        if (!pos.has(n)) pos.set(n, i);
      });
      return path.segments.map((seg, i) => {
        const stack = ['Ethernet'];
        let mplsLabel;
        let inLsp = false;
        for (const lsp of lsps) {
          for (const hl of lsp.hopLabels) {
            const a = pos.get(hl.from);
            const b = pos.get(hl.to);
            if (a !== undefined && b !== undefined && i >= a && i < b) {
              inLsp = true;
              mplsLabel = hl.label;
            }
          }
        }
        if (inLsp) {
          if (mplsLabel !== null && mplsLabel !== undefined) stack.push('MPLS ' + mplsLabel);
          else stack.push('MPLS (label dépilé)');
          if (path.l2vpnAt.length) stack.push('PW', seg.vlan ? '802.1Q VLAN ' + seg.vlan : 'Ethernet client');
        } else if (seg.vlan) {
          stack.push('802.1Q VLAN ' + seg.vlan);
        }
        stack.push(ipPart);
        return { link: seg.link.id, from: seg.from, to: seg.to, vlan: seg.vlan, mpls: inLsp ? mplsLabel : undefined, stack, text: stack.join(' | ') };
      });
    }

    /* ---------------- Analyse globale ---------------- */

    /**
     * Analyse complète : anneaux, chemins de chaque flux, MPLS, QoS, charges.
     * @returns {object} { flows[], linkLoads{}, rings[], blockedLinks[], warnings[] }
     */
    analyze() {
      this.warnings = [];
      this.applyRingProtection();
      const flows = this.topology.flows || [];
      const results = [];

      flows.forEach((flow, idx) => {
        const res = {
          id: flow.id,
          name: flow.name || this.name(flow.src) + ' → ' + this.name(flow.dst),
          src: flow.src,
          dst: flow.dst,
          cls: flow.cls || 'data',
          clsLabel: QOS_LABEL[flow.cls || 'data'],
          rateMbps: Number(flow.rateMbps) || 1,
          status: 'down',
          reason: '',
          path: null,
          lsps: [],
          headers: [],
          latencyMs: 0,
          rttMs: 0,
          deliveredMbps: 0,
          usesBackup: false,
          backupLinks: [],
          vlan: this.endpointVlan(flow.src),
        };
        if (!this.nodes.has(flow.src) || !this.nodes.has(flow.dst)) {
          res.reason = 'Terminal source ou destination absent.';
          results.push(res);
          return;
        }
        const path = this.findPath(flow.src, flow.dst);
        if (!path) {
          const diag = this.diagnoseFailure(flow.src, flow.dst);
          res.status = diag.code === 'storm' ? 'storm' : 'down';
          res.reason = diag.text;
          res.reasonCode = diag.code;
          results.push(res);
          return;
        }
        res.path = path;
        res.lsps = this.buildLsps(path, idx);
        res.headers = this.buildHeaders(path, res.lsps, flow.src, flow.dst);
        let lat = 0;
        for (const seg of path.segments) {
          lat += this.linkLatency(seg.link);
          if (seg.link.props && seg.link.props.backup) {
            res.usesBackup = true;
            res.backupLinks.push(seg.link.id);
          }
        }
        for (const n of path.nodes) lat += NODE_LATENCY_MS[this.role(n)] || 0;
        res.latencyMs = lat;
        res.rttMs = 2 * lat;
        res.status = 'ok';
        results.push(res);
      });

      // QoS : allocation par lien et par sens, priorité stricte voix > vidéo > données
      const demand = new Map(); // key link:dir -> [res]
      for (const r of results) {
        if (r.status !== 'ok') continue;
        for (const seg of r.path.segments) {
          const dir = seg.from === seg.link.a ? 'ab' : 'ba';
          const k = seg.link.id + ':' + dir;
          if (!demand.has(k)) demand.set(k, []);
          demand.get(k).push(r);
        }
      }
      const alloc = new Map(); // res.id -> min allocation
      const linkLoads = {};
      for (const [k, list] of demand) {
        const [linkId, dir] = k.split(':');
        const link = this.links.get(linkId);
        const cap = this.linkCapacityDir(link, dir);
        let remaining = cap;
        const total = list.reduce((s, r) => s + r.rateMbps, 0);
        for (const prio of [0, 1, 2]) {
          const cls = list.filter((r) => QOS_PRIORITY[r.cls] === prio);
          const need = cls.reduce((s, r) => s + r.rateMbps, 0);
          const share = need > 0 ? Math.min(1, remaining / need) : 1;
          for (const r of cls) {
            const a = r.rateMbps * share;
            alloc.set(r.id, Math.min(alloc.has(r.id) ? alloc.get(r.id) : Infinity, a));
          }
          remaining = Math.max(0, remaining - need);
        }
        const ld = linkLoads[linkId] || { capacityMbps: this.linkCapacity(link), capAb: this.linkCapacityDir(link, 'ab'), capBa: this.linkCapacityDir(link, 'ba'), ab: 0, ba: 0, utilisation: 0 };
        ld[dir] = total;
        ld.utilisation = Math.max(ld.ab / Math.max(ld.capAb, 1e-6), ld.ba / Math.max(ld.capBa, 1e-6));
        linkLoads[linkId] = ld;
      }
      for (const r of results) {
        if (r.status !== 'ok') continue;
        r.deliveredMbps = alloc.has(r.id) ? alloc.get(r.id) : r.rateMbps;
        if (r.deliveredMbps < r.rateMbps * 0.98) {
          r.status = 'congested';
          r.reason = `Congestion : ${Util.fmt(r.deliveredMbps, 1)} Mbit/s acheminés sur ${Util.fmt(r.rateMbps, 1)} demandés (priorité ${r.clsLabel}).`;
        } else if (r.usesBackup) {
          r.reason = 'Acheminé via le lien de secours.';
        }
      }
      for (const [id, ld] of Object.entries(linkLoads)) {
        if (ld.utilisation > 1) {
          this.warnings.push({ level: 'warn', text: `Lien « ${this.linkName(this.links.get(id))} » saturé (${Util.fmt(ld.utilisation * 100, 0)} %).` });
        }
      }

      return {
        flows: results,
        linkLoads,
        rings: this.rings,
        blockedLinks: [...this.blockedLinks],
        stormNodes: [...this.stormNodes],
        warnings: this.warnings,
      };
    }

    /* ---------------- Outils de diagnostic ---------------- */

    /**
     * Simule un ping entre deux terminaux.
     * @returns {object} { success, lines[], rttMs, path }
     */
    ping(src, dst, count = 4) {
      this.warnings = [];
      this.applyRingProtection();
      const pS = this.props(src);
      const pD = this.props(dst);
      const target = pD.ip || this.name(dst);
      const lines = [`Envoi d’une requête « Ping » ${target} avec 32 octets de données :`];
      const path = this.findPath(src, dst);
      let rtts = [];
      let reason = '';
      if (!path) {
        const diag = this.diagnoseFailure(src, dst);
        reason = diag.text;
        for (let i = 0; i < count; i++) {
          lines.push(diag.code === 'link-down' || diag.code === 'storm' ? 'Délai d’attente de la demande dépassé.' : `Réponse de ${pS.ip || this.name(src)} : Impossible de joindre l’hôte de destination.`);
        }
      } else {
        let lat = 0;
        for (const seg of path.segments) lat += this.linkLatency(seg.link);
        for (const n of path.nodes) lat += NODE_LATENCY_MS[this.role(n)] || 0;
        const l3 = new Set(path.routedAt.map((r) => r.node));
        for (const lsp of this.buildLsps(path, 0)) l3.add(lsp.egress);
        const ttl = 64 - l3.size;
        for (let i = 0; i < count; i++) {
          const jitter = 1 + (Math.random() - 0.5) * 0.04; // ± 2 %
          const rtt = 2 * lat * jitter;
          rtts.push(rtt);
          const t = rtt < 1 ? '<1' : String(Math.round(rtt));
          lines.push(`Réponse de ${target} : octets=32 temps${rtt < 1 ? '' : '='}${t} ms TTL=${ttl}`);
        }
      }
      const received = rtts.length;
      lines.push('', `Statistiques Ping pour ${target} :`, `    Paquets : envoyés = ${count}, reçus = ${received}, perdus = ${count - received} (${Math.round(((count - received) / count) * 100)} % de perte),`);
      if (received) {
        const min = Math.min(...rtts);
        const max = Math.max(...rtts);
        const avg = rtts.reduce((a, b) => a + b, 0) / received;
        lines.push('Durée approximative des boucles en millisecondes :', `    Minimum = ${Math.round(min)} ms, Maximum = ${Math.round(max)} ms, Moyenne = ${Math.round(avg)} ms`);
      }
      if (reason) lines.push('', 'Diagnostic : ' + reason);
      return { success: received > 0, lines, rttMs: received ? rtts.reduce((a, b) => a + b, 0) / received : null, path, reason };
    }

    /** Simule un traceroute : seuls les sauts couche 3 apparaissent. */
    traceroute(src, dst) {
      this.warnings = [];
      this.applyRingProtection();
      const pD = this.props(dst);
      const target = pD.ip || this.name(dst);
      const lines = [`Détermination de l’itinéraire vers ${target} avec un maximum de 30 sauts :`, ''];
      const path = this.findPath(src, dst);
      if (!path) {
        lines.push('  1     *        *        *     Délai d’attente de la demande dépassé.');
        lines.push('', 'Diagnostic : ' + this.diagnoseFailure(src, dst).text);
        return { success: false, lines };
      }
      // Sauts L3 visibles : routeurs qui routent + PE de sortie des LSP (les P restent masqués)
      const l3 = new Set(path.routedAt.map((r) => r.node));
      for (const lsp of this.buildLsps(path, 0)) l3.add(lsp.egress);
      const hops = path.nodes.filter((n, i) => l3.has(n) && path.nodes.indexOf(n) === i).concat([dst]);
      let hopIdx = 1;
      for (const h of hops) {
        const idx = path.nodes.indexOf(h);
        let lat = 0;
        for (let i = 0; i < idx; i++) lat += this.linkLatency(path.segments[i].link);
        for (let i = 0; i <= idx; i++) lat += NODE_LATENCY_MS[this.role(path.nodes[i])] || 0;
        const rtt = 2 * lat;
        const fmt = (v) => (v < 1 ? '<1 ms' : Math.round(v) + ' ms');
        const ip = this.props(h).ip || this.props(h).loopback || '';
        const t = [rtt * 0.99, rtt, rtt * 1.01].map(fmt).map((s) => s.padStart(8));
        lines.push(`${String(hopIdx).padStart(3)} ${t.join(' ')}  ${this.name(h)}${ip ? ' [' + ip + ']' : ''}`);
        hopIdx++;
      }
      lines.push('', 'Itinéraire déterminé.');
      lines.push('Remarque : IDU, ODU, antennes, switches et cœur MPLS (LSP) sont transparents au traceroute : seuls les routeurs IP qui routent le paquet apparaissent.');
      return { success: true, lines };
    }

    /**
     * Compare deux analyses (avant / après un événement) et produit un journal de basculement.
     * @returns {Array} événements { level, text }
     */
    static compare(before, after, engine) {
      const events = [];
      if (!before || !after) return events;
      const prevById = new Map(before.flows.map((f) => [f.id, f]));
      const pathKey = (f) => (f.path ? f.path.segments.map((s) => s.link.id).join('>') : '');
      for (const f of after.flows) {
        const p = prevById.get(f.id);
        if (!p) continue;
        const wasOk = p.status === 'ok' || p.status === 'congested';
        const isOk = f.status === 'ok' || f.status === 'congested';
        if (wasOk && !isOk) {
          events.push({ level: 'error', text: `✖ Flux « ${f.name} » interrompu : ${f.reason}` });
        } else if (!wasOk && isOk) {
          events.push({ level: 'ok', text: `✔ Flux « ${f.name} » rétabli (latence ${Util.fmt(f.rttMs, 1)} ms RTT).` });
        } else if (wasOk && isOk && pathKey(p) !== pathKey(f)) {
          const ringSwitch = after.rings.some((r) => r.protected && r.state === 'protection') || before.rings.some((r) => r.protected && r.state === 'protection');
          const routers = f.path.nodes.filter((n) => engine && engine.role(n) === 'router');
          const allFrr = routers.length > 0 && routers.every((n) => engine.isMpls(n) && engine.props(n).frr !== false);
          let mech;
          let time;
          if (f.usesBackup !== p.usesBackup) {
            mech = f.usesBackup ? 'détection de panne (BFD) + reconvergence du routage vers le lien de secours' : 'retour automatique sur le lien principal (routage IP)';
            time = '≈ 1 s';
          } else if (ringSwitch && f.path.routedAt.length === 0) {
            mech = 'ERPS G.8032 (déblocage du RPL)';
            time = '< 50 ms';
          } else if (allFrr) {
            mech = 'MPLS Fast Reroute (chemin de secours pré-calculé)';
            time = '≈ 50 ms';
          } else {
            mech = 'reconvergence du routage IP (OSPF + BFD)';
            time = '≈ 1 s';
          }
          const dLat = f.rttMs - p.rttMs;
          let txt = `↻ Flux « ${f.name} » re-routé par ${mech} en ${time}. Nouveau RTT : ${Util.fmt(f.rttMs, 1)} ms (${dLat >= 0 ? '+' : ''}${Util.fmt(dLat, 1)} ms).`;
          if (f.usesBackup && !p.usesBackup) txt += ' Trafic basculé sur le lien de SECOURS.';
          if (!f.usesBackup && p.usesBackup) txt += ' Retour sur le lien principal.';
          events.push({ level: f.usesBackup ? 'warn' : 'info', text: txt });
        }
      }
      for (const r of after.rings) {
        const old = before.rings.find((x) => x.links.join() === r.links.join());
        if (old && old.state !== r.state && r.protected) {
          events.push({ level: r.state === 'protection' ? 'warn' : 'ok', text: `Anneau ${r.index} : ${r.stateLabel}` });
        }
      }
      return events;
    }
  }

  MBV.IpNetwork = {
    ROLE_BY_TYPE,
    WIRED_CAPACITY,
    DEFAULT_LATENCY,
    QOS_PRIORITY,
    QOS_LABEL,
    IpTools,
    NetworkEngine,
    roleOf(type) {
      return ROLE_BY_TYPE[type] || 'passive';
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
