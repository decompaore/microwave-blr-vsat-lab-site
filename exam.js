/* =====================================================================
 * exam.js — Mode examen avec correction automatique
 * MicroWave, BLR & VSAT Lab
 *
 * Trois espaces (onglet « Examen » de la fenêtre Activités) :
 *
 *  1. CRÉER UN SUJET (enseignant, code requis, version enseignant) :
 *     choix des exercices et des TP, durée, documentation autorisée,
 *     barème par champ / étape / question. Export « sujet.json » qui ne
 *     contient AUCUNE réponse (seulement des références et le barème).
 *
 *  2. PASSER L'EXAMEN (élève, toutes versions — de préférence la
 *     « version examen » sans réponses) : chargement du sujet, identité,
 *     chronomètre, réponses aux exercices, TP réalisés dans le simulateur
 *     (vérifications masquées), questions rédigées. Remise : fichier
 *     « copie-NOM-PRENOM.json ». Reprise automatique après un rechargement.
 *
 *  3. CORRIGER LES COPIES (enseignant, code requis, version enseignant —
 *     la seule qui contient les réponses) : correction automatique des
 *     exercices (tolérances) et des étapes de TP, notation manuelle des
 *     questions rédigées avec le corrigé affiché, note /20, tableau de
 *     classe CSV, corrigés individuels et corrigé type imprimables.
 *
 *  4. DÉPANNAGE PRATIQUE (facultatif dans un sujet) : le réseau du canevas
 *     de l'enseignant, avec ses pannes cachées, est remis à l'élève verrouillé
 *     (mode Dépannage). Correction automatique : pannes réparées, services
 *     rétablis, méthode (mesure avant intervention), pénalité par
 *     intervention inutile. La topologie, les pannes et le journal sont
 *     ENCODÉS dans le sujet et la copie (illisibles dans un éditeur de texte ;
 *     ce n'est pas un chiffrement).
 *
 * Interface : MBV.Exam = { render({ nav, detail, api }) }
 * ===================================================================== */
(function (root) {
  'use strict';

  const MBV = (root.MBV = root.MBV || {});
  const fmt = (v, d = 2) => (MBV.Util ? MBV.Util.fmt(v, d) : String(Math.round(v * 100) / 100));
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS_EXAM = 'mbv-examen-en-cours-v1';
  const LS_GRADES = 'mbv-examen-notes-v1';
  const SUJET_FORMAT = 'mbv-exam-sujet';
  const COPIE_FORMAT = 'mbv-exam-copie';

  let ctx = null; // { nav, detail, api }
  let exam = null; // examen en cours (élève)
  let lastCopie = null; // dernière copie rendue (pour la télécharger à nouveau)
  let teacherOk = false; // espace examinateur déverrouillé (session)
  let view = 'home'; // home | create | grade
  let draft = null; // sujet en cours de création
  let pendingSujet = null; // sujet chargé, examen pas encore commencé
  const grading = { sujet: null, copies: [], selected: null };
  let timer = null;

  /* ------------------------------------------------------------------
   * Outils
   * ------------------------------------------------------------------ */
  function lsGet(k, d) {
    try {
      const v = root.localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (err) {
      return d;
    }
  }
  function lsSet(k, v) {
    try {
      root.localStorage.setItem(k, JSON.stringify(v));
    } catch (err) {
      /* stockage indisponible */
    }
  }
  function lsDel(k) {
    try {
      root.localStorage.removeItem(k);
    } catch (err) {
      /* stockage indisponible */
    }
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }
  /* Encodage du dépannage pratique (XOR + base64 : pas un chiffrement, seulement illisible à l'œil). */
  const XKEY = 'MBV-BLR-VSAT-examen';
  function xor(s) {
    let o = '';
    for (let i = 0; i < s.length; i++) o += String.fromCharCode(s.charCodeAt(i) ^ XKEY.charCodeAt(i % XKEY.length));
    return o;
  }
  const enc = (obj) => root.btoa(xor(unescape(encodeURIComponent(JSON.stringify(obj)))));
  const dec = (str) => JSON.parse(decodeURIComponent(escape(xor(root.atob(str)))));
  const PRATIQUE_BAREME = { pannes: 12, services: 4, methode: 4, penalite: 1 };
  const pratiqueMax = (p) => {
    const b = Object.assign({}, PRATIQUE_BAREME, (p && p.bareme) || {});
    return b.pannes + b.services + b.methode;
  };

  function slug(s) {
    return (
      String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toUpperCase() || 'ELEVE'
    );
  }
  function parseNum(str) {
    const t = String(str === undefined || str === null ? '' : str)
      .trim()
      .replace(/\s/g, '')
      .replace(',', '.')
      .replace('−', '-');
    return t === '' ? NaN : Number(t);
  }
  const hhmm = (t) => (t ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—');
  const dateFr = (t) => (t ? new Date(t).toLocaleString('fr-FR') : '—');
  const clock = (sec) => {
    const s = Math.max(0, Math.round(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(ss).padStart(2, '0');
  };
  const round05 = (v) => Math.round(v * 2) / 2;
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        try {
          resolve(JSON.parse(r.result));
        } catch (err) {
          reject(new Error(file.name + ' : fichier JSON illisible.'));
        }
      };
      r.onerror = () => reject(new Error(file.name + ' : lecture impossible.'));
      r.readAsText(file, 'utf-8');
    });
  }

  /** Index des exercices : id → { exo, serie, num } (avec ou sans réponses selon la version). */
  function exoIndex() {
    const idx = {};
    const series = (MBV.Exercises && MBV.Exercises.series) || [];
    for (const s of series) s.exercises.forEach((e, i) => (idx[e.id] = { exo: e, serie: s, num: `${s.num}-${i + 1}` }));
    return idx;
  }
  const labsList = () => (MBV.Labs && MBV.Labs.list) || [];
  const labById = (id) => labsList().find((l) => l.id === id) || null;
  const hasExerciseAnswers = () => {
    const idx = exoIndex();
    const any = Object.values(idx)[0];
    return !!(any && any.exo.fields && any.exo.fields.every((f) => typeof f.answer === 'number'));
  };

  /* ------------------------------------------------------------------
   * Rendu principal
   * ------------------------------------------------------------------ */
  function render(opts) {
    ctx = opts;
    renderNav();
    if (exam) return renderExam();
    if (lastCopie && view === 'done') return renderDone();
    
    view = 'home';
    return renderHome();
  }
  function renderNav() {
    const teacher = ctx.api.hasAnswerKeys();
    const items = [['home', exam ? '⏱ Mon examen en cours' : '🎓 Passer un examen', exam ? 'Reprendre la composition' : 'Charger un sujet et composer']];
    
    ctx.nav.innerHTML = items
      .map(([v, t, sub]) => `<button class="nav-item ${(view === v || (exam && v === 'home')) ? 'active' : ''}" data-examview="${v}">${esc(t)}<small>${esc(sub)}</small></button>`)
      .join('');
    ctx.nav.querySelectorAll('[data-examview]').forEach((b) =>
      b.addEventListener('click', () => {
        view = b.dataset.examview;
        render(ctx);
      })
    );
  }

  /* ------------------------------------------------------------------
   * 1. ACCUEIL : passer un examen / accès examinateur
   * ------------------------------------------------------------------ */
  function renderHome() {
    const teacher = ctx.api.hasAnswerKeys();
    const s = pendingSujet;
    let h = `<div class="lab-header"><div><div class="small-muted">Mode examen</div><h3>Passer un examen</h3></div></div>
      <ol class="exam-howto"><li>Chargez le fichier <b>sujet</b> fourni par votre professeur (clé USB, dossier partagé…).</li><li>Indiquez votre nom, votre prénom et votre classe, puis cliquez sur <b>Commencer</b> : le chronomètre démarre.</li><li>Pendant l’examen, les corrections, les indices et les vérifications automatiques sont masqués.</li><li>À la fin, cliquez sur <b>Rendre ma copie</b> : un fichier <code>copie-NOM-PRENOM.json</code> est téléchargé. Remettez-le à votre professeur.</li></ol>
      <div class="exam-box">
        <div class="field"><label>Fichier sujet</label><input type="file" id="ex-sujet-file" accept=".json,application/json"></div>
        ${s ? `<div class="verdict ok">Sujet chargé : <b>${esc(s.title)}</b> — durée ${s.durationMin} min · ${s.exercises.length} exercice(s) · ${s.tps.length} TP${s.pratique ? ' · dépannage pratique' : ''} · documentation ${s.docAllowed ? 'autorisée' : '<b>non autorisée</b>'}</div>` : ''}
        <div class="field"><label>Nom</label><input type="text" id="ex-nom" autocomplete="off"></div>
        <div class="field"><label>Prénom</label><input type="text" id="ex-prenom" autocomplete="off"></div>
        <div class="field"><label>Classe</label><input type="text" id="ex-classe" autocomplete="off"></div>
        <div class="btn-row"><button class="btn btn-accent" id="ex-start" ${s ? '' : 'disabled'}>▶ Commencer l’examen</button></div>
        <div id="ex-home-msg"></div>
      </div>`;
    
    ctx.detail.innerHTML = h;
    const msg = ctx.detail.querySelector('#ex-home-msg');
    ctx.detail.querySelector('#ex-sujet-file').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const j = await readFile(f);
        if (j.format !== SUJET_FORMAT) throw new Error('ce fichier n’est pas un sujet d’examen MicroWave, BLR & VSAT Lab.');
        pendingSujet = j;
        render(ctx);
      } catch (err) {
        msg.innerHTML = `<div class="verdict err">Sujet refusé : ${esc(err.message)}</div>`;
      }
    });
    ctx.detail.querySelector('#ex-start').addEventListener('click', () => {
      const nom = ctx.detail.querySelector('#ex-nom').value.trim();
      const prenom = ctx.detail.querySelector('#ex-prenom').value.trim();
      const classe = ctx.detail.querySelector('#ex-classe').value.trim();
      if (!nom || !prenom || !classe) {
        msg.innerHTML = '<div class="verdict warn">Indiquez votre nom, votre prénom et votre classe.</div>';
        return;
      }
      if (!root.confirm(`Commencer l’examen « ${pendingSujet.title} » (${pendingSujet.durationMin} min) ? Le chronomètre démarre immédiatement.`)) return;
      startExam(pendingSujet, { nom, prenom, classe });
    });
    
  }

  /* ------------------------------------------------------------------
   * 2. ÉLÈVE : composition
   * ------------------------------------------------------------------ */
  function startExam(sujet, student) {
    exam = { sujet, student, startedAt: Date.now(), exercises: {}, tps: {} };
    for (const t of sujet.tps) exam.tps[t.id] = { steps: [], questions: [], evaluatedAt: null, topology: null };
    if (sujet.pratique) {
      const d = dec(sujet.pratique.data);
      exam.pratique = { topo: d.topo, faults: d.faults, journal: [], active: false, opened: false };
    }
    pendingSujet = null;
    save();
    ctx.api.setExamActive(true, { docAllowed: sujet.docAllowed });
    startTimer();
    ctx.api.log(`🎓 Examen « ${sujet.title} » commencé par ${student.prenom} ${student.nom} (${student.classe}).`, 'info');
    if (exam.pratique && !sujet.exercises.length && !sujet.tps.length) openPratique();
    render(ctx);
  }
  function save() {
    if (exam) lsSet(LS_EXAM, exam);
  }
  const remaining = () => (exam ? exam.sujet.durationMin * 60 - (Date.now() - exam.startedAt) / 1000 : 0);

  function startTimer() {
    stopTimer();
    ensureBanner();
    timer = setInterval(tick, 1000);
    tick();
  }
  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }
  let tickN = 0;
  function tick() {
    if (!exam) return stopTimer();
    if (++tickN % 5 === 0) capturePratique();
    const r = remaining();
    const txt = clock(r);
    document.querySelectorAll('.exam-clock').forEach((el) => {
      el.textContent = txt;
      el.classList.toggle('late', r < 300);
    });
    if (r <= 0) {
      stopTimer();
      ctx.api.toast('Temps écoulé : votre copie est rendue automatiquement.', 'warn');
      submit(true);
    }
  }
  function ensureBanner() {
    let b = document.getElementById('exam-banner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'exam-banner';
      const bar = document.querySelector('.topbar');
      const last = bar.lastElementChild;
      bar.insertBefore(b, last);
    }
    b.innerHTML = `<span>🎓 ${esc(exam.student.prenom)} ${esc(exam.student.nom)}</span><span class="exam-clock">—</span><button class="btn btn-xs btn-accent" id="exam-banner-open">Ma copie</button>`;
    b.querySelector('#exam-banner-open').addEventListener('click', () => ctx.api.openLabs(undefined, 'exam'));
  }
  function removeBanner() {
    const b = document.getElementById('exam-banner');
    if (b) b.remove();
  }

  /** Fusionne des résultats d'étapes : une étape atteinte reste acquise. */
  function mergeSteps(tp, steps) {
    let changed = false;
    steps.forEach((ok, i) => {
      if (ok && !tp.steps[i]) {
        tp.steps[i] = true;
        changed = true;
      } else if (tp.steps[i] === undefined) tp.steps[i] = false;
    });
    return changed;
  }
  /** Appelé par le simulateur à chaque recalcul pendant l'examen (étapes atteintes). */
  function onProgress(labId, steps) {
    if (!exam || !exam.tps[labId]) return;
    if (mergeSteps(exam.tps[labId], steps)) save();
  }
  /** Enregistre l'état du TP actuellement chargé (étapes atteintes + topologie). */
  function captureCurrent() {
    if (!exam) return;
    const cur = ctx.api.currentLabId();
    if (!cur || !exam.tps[cur]) return;
    const r = ctx.api.evaluateSteps(cur);
    if (!r) return;
    mergeSteps(exam.tps[cur], r.steps);
    Object.assign(exam.tps[cur], { topology: r.topology, evaluatedAt: Date.now() });
    save();
  }
  /** Enregistre l'état du dépannage pratique (topologie + journal) s'il est ouvert. */
  function capturePratique() {
    if (!exam || !exam.pratique || !exam.pratique.active) return;
    exam.pratique.topo = ctx.api.serialize();
    exam.pratique.journal = ctx.api.journal();
    save();
  }
  /** Charge le réseau du dépannage dans le simulateur : mode Dépannage, topologie verrouillée. */
  function loadPratique() {
    ctx.api.setLocked(false);
    ctx.api.load(exam.pratique.topo);
    ctx.api.setMode('diag');
    ctx.api.journalSet(exam.pratique.journal);
    ctx.api.setLocked(true);
  }
  function openPratique() {
    if (!exam || !exam.pratique) return;
    captureCurrent();
    loadPratique();
    const first = !exam.pratique.opened;
    exam.pratique.active = true;
    exam.pratique.opened = true;
    save();
    ctx.api.closeModals();
    ctx.api.log(first ? '🚨 Examen pratique : le réseau présente des pannes. Mesurez, localisez, puis intervenez ou corrigez les réglages (topologie verrouillée).' : 'Examen pratique : dépannage repris.', first ? 'error' : 'info');
  }
  function leavePratique() {
    if (!exam || !exam.pratique || !exam.pratique.active) return;
    capturePratique();
    exam.pratique.active = false;
    ctx.api.setLocked(false);
    save();
  }
  function openTp(id) {
    leavePratique();
    captureCurrent();
    const saved = exam.tps[id] && exam.tps[id].topology;
    ctx.api.startLab(id);
    if (ctx.api.currentLabId() !== id) return; // chargement annulé par l'élève
    if (saved) ctx.api.load(saved);
    exam.tps[id].evaluatedAt = exam.tps[id].evaluatedAt || Date.now();
    save();
    ctx.api.log(`Examen : TP ${(labById(id) || {}).num || id} ouvert${saved ? ' (travail précédent restauré)' : ''}.`, 'info');
  }

  function renderExam() {
    const s = exam.sujet;
    const idx = exoIndex();
    let h = `<div class="lab-header"><div><div class="small-muted">Examen en cours · ${esc(exam.student.prenom)} ${esc(exam.student.nom)} · ${esc(exam.student.classe)} · commencé à ${hhmm(exam.startedAt)}</div><h3>${esc(s.title)}</h3></div><div class="exam-timer">⏱ <span class="exam-clock">—</span></div></div>
      <div class="note">Les corrections, indices et vérifications automatiques sont masqués. Vos réponses sont enregistrées automatiquement sur ce poste (même en cas de rechargement de la page).</div>`;
    if (s.exercises.length) {
      h += '<h4>Exercices</h4>';
      s.exercises.forEach((it, n) => {
        const d = idx[it.id];
        if (!d) {
          h += `<div class="exo-card"><b>Exercice ${it.id} introuvable dans cette version du simulateur.</b></div>`;
          return;
        }
        const vals = exam.exercises[it.id] || [];
        const tot = it.points.reduce((a, b) => a + b, 0);
        h += `<div class="exo-card"><div class="exo-head"><span class="exo-num">Ex. ${n + 1}</span><b>${esc(d.exo.title)}</b><span class="small-muted">${fmt(tot, tot % 1 ? 1 : 0)} pt${tot > 1 ? 's' : ''}</span></div>
          <div class="doc exo-statement">${d.exo.statement}</div>
          <div class="exo-fields">${d.exo.fields
            .map((fd, i) => `<label class="exo-field"><span>${esc(fd.label)}</span><input type="text" inputmode="decimal" data-exo="${it.id}" data-i="${i}" value="${esc(vals[i] !== undefined ? vals[i] : '')}" autocomplete="off"><em>${esc(fd.unit)}</em></label>`)
            .join('')}</div></div>`;
      });
    }
    if (s.tps.length) {
      h += '<h4>Travaux pratiques</h4>';
      for (const t of s.tps) {
        const lab = labById(t.id);
        if (!lab) continue;
        const st = exam.tps[t.id];
        const cur = ctx.api.currentLabId() === t.id;
        const auto = t.steps.reduce((a, b) => a + b, 0);
        const qs = lab.steps.map((stp, i) => ({ stp, i, pts: t.questions[i] || 0 })).filter((q) => q.stp.question && q.pts > 0);
        h += `<div class="exo-card"><div class="exo-head"><span class="exo-num">${esc(lab.num)}</span><b>${esc(lab.title)}</b><span class="small-muted">${cur ? '● ouvert dans le simulateur' : st.evaluatedAt ? 'travail enregistré à ' + hhmm(st.evaluatedAt) : 'pas encore commencé'}</span></div>
          <p class="small-muted">${esc(lab.subtitle || '')} — réalisation dans le simulateur : ${fmt(auto, auto % 1 ? 1 : 0)} pt(s) ; chaque étape est acquise dès que son objectif est atteint.</p>
          <div class="btn-row"><button class="btn btn-xs btn-accent" data-opentp="${t.id}">${cur ? '↺ Revenir au simulateur' : st.topology ? '▶ Reprendre ce TP' : '▶ Ouvrir ce TP dans le simulateur'}</button></div>
          ${qs
            .map(
              (q) =>
                `<div class="exam-q"><div class="question">❓ <b>Étape ${q.i + 1} — ${esc(q.stp.title)}</b> (${fmt(q.pts, q.pts % 1 ? 1 : 0)} pt${q.pts > 1 ? 's' : ''})<br>${q.stp.question}</div><textarea rows="4" data-tpq="${t.id}" data-i="${q.i}" placeholder="Votre réponse…">${esc(st.questions[q.i] || '')}</textarea></div>`
            )
            .join('')}</div>`;
      }
    }
    if (s.pratique && exam.pratique) {
      const p = exam.pratique;
      const j = (p.active ? ctx.api.journal() : p.journal) || [];
      const nm = j.filter((x) => x.kind === 'mesure' || x.kind === 'ping').length;
      const ni = j.filter((x) => x.kind === 'intervention').length;
      const tot = pratiqueMax(s.pratique);
      h += `<h4>Dépannage pratique</h4><div class="exo-card"><div class="exo-head"><span class="exo-num">Dépannage</span><b>${esc(s.pratique.title || 'Réseau à dépanner')}</b><span class="small-muted">${p.active ? '● ouvert dans le simulateur' : p.opened ? 'commencé' : 'non commencé'} · ${fmt(tot, tot % 1 ? 1 : 0)} pts</span></div>
        <p class="small-muted">Le réseau du sujet présente des <b>pannes cachées</b>. En mode <b>Dépannage</b> : mesurez (bilans, voyants, ping), localisez, puis intervenez (inspecteur) ou corrigez les réglages. La topologie est verrouillée. Notation : pannes réparées, services rétablis, méthode (une mesure avant chaque intervention) ; chaque intervention inutile retire des points.</p>
        <p class="small-muted">Votre journal : ${nm} mesure(s), ${ni} intervention(s).</p>
        <div class="btn-row"><button class="btn btn-xs btn-accent" id="ex-pratique">${p.active ? '↺ Revenir au réseau' : p.opened ? '▶ Reprendre le dépannage' : '▶ Commencer le dépannage'}</button></div></div>`;
    }
    h += `<div class="btn-row exam-submit"><button class="btn" id="ex-capture">💾 Enregistrer le TP en cours</button><button class="btn btn-danger" id="ex-submit">📤 Rendre ma copie</button></div>`;
    ctx.detail.innerHTML = h;
    tick();
    ctx.detail.querySelectorAll('input[data-exo]').forEach((inp) =>
      inp.addEventListener('input', () => {
        const id = inp.dataset.exo;
        exam.exercises[id] = exam.exercises[id] || [];
        exam.exercises[id][Number(inp.dataset.i)] = inp.value;
        save();
      })
    );
    ctx.detail.querySelectorAll('textarea[data-tpq]').forEach((ta) =>
      ta.addEventListener('input', () => {
        exam.tps[ta.dataset.tpq].questions[Number(ta.dataset.i)] = ta.value;
        save();
      })
    );
    ctx.detail.querySelectorAll('[data-opentp]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.opentp;
        if (ctx.api.currentLabId() === id) return ctx.api.closeModals();
        openTp(id);
      })
    );
    const bp = ctx.detail.querySelector('#ex-pratique');
    if (bp)
      bp.addEventListener('click', () => {
        if (exam.pratique.active) return ctx.api.closeModals();
        openPratique();
      });
    ctx.detail.querySelector('#ex-capture').addEventListener('click', () => {
      captureCurrent();
      ctx.api.toast(ctx.api.currentLabId() && exam.tps[ctx.api.currentLabId()] ? 'TP enregistré.' : 'Aucun TP de l’examen n’est ouvert.', 'info');
      renderExam();
    });
    ctx.detail.querySelector('#ex-submit').addEventListener('click', () => {
      const empty = exam.sujet.exercises.filter((it) => !(exam.exercises[it.id] || []).some((v) => String(v || '').trim())).length;
      const warn = empty ? `\n\nAttention : ${empty} exercice(s) sans réponse.` : '';
      if (root.confirm(`Rendre définitivement votre copie ?${warn}\n\nVous ne pourrez plus la modifier.`)) submit(false);
    });
  }

  function submit(auto) {
    if (!exam) return;
    captureCurrent();
    let pratique;
    if (exam.pratique) {
      capturePratique();
      loadPratique();
      const result = { faults: ctx.api.faultStatus(exam.pratique.faults), flows: ctx.api.flowStatus() };
      pratique = { data: enc({ topo: exam.pratique.topo, journal: exam.pratique.journal, result }) };
      ctx.api.setLocked(false);
    }
    const copie = {
      format: COPIE_FORMAT,
      version: 1,
      sujet: exam.sujet,
      student: exam.student,
      startedAt: exam.startedAt,
      submittedAt: Date.now(),
      autoSubmitted: !!auto,
      exercises: exam.exercises,
      tps: exam.tps,
    };
    if (pratique) copie.pratique = pratique;
    lastCopie = copie;
    const name = `copie-${slug(exam.student.nom)}-${slug(exam.student.prenom)}.json`;
    download(name, JSON.stringify(copie, null, 1));
    ctx.api.log(`📤 Copie rendue${auto ? ' automatiquement (temps écoulé)' : ''} : ${name}.`, 'ok');
    exam = null;
    lsDel(LS_EXAM);
    stopTimer();
    removeBanner();
    ctx.api.setExamActive(false);
    view = 'done';
    if (ctx) render(ctx);
  }
  function renderDone() {
    const c = lastCopie;
    const name = `copie-${slug(c.student.nom)}-${slug(c.student.prenom)}.json`;
    ctx.detail.innerHTML = `<div class="lab-header"><div><div class="small-muted">Examen terminé</div><h3>Copie rendue ✔</h3></div></div>
      <div class="verdict ok">${esc(c.student.prenom)} ${esc(c.student.nom)} (${esc(c.student.classe)}) — « ${esc(c.sujet.title)} » — rendue à ${hhmm(c.submittedAt)}${c.autoSubmitted ? ' (temps écoulé)' : ''}.</div>
      <p>Le fichier <code>${esc(name)}</code> a été téléchargé (dossier « Téléchargements »). Remettez-le à votre professeur selon ses consignes (dossier partagé, clé USB…).</p>
      <div class="btn-row"><button class="btn" id="ex-redl">⬇ Télécharger à nouveau ma copie</button></div>`;
    ctx.detail.querySelector('#ex-redl').addEventListener('click', () => download(name, JSON.stringify(c, null, 1)));
  }

  

  /* ------------------------------------------------------------------
   * Reprise d'un examen interrompu (rechargement de la page)
   * ------------------------------------------------------------------ */
  function resume() {
    const st = lsGet(LS_EXAM, null);
    if (!st || !st.sujet || !MBV.App) return;
    exam = st;
    ctx = ctx || { nav: document.getElementById('labs-list'), detail: document.getElementById('labs-detail'), api: MBV.App };
    ctx.api.setExamActive(true, { docAllowed: exam.sujet.docAllowed });
    if (exam.pratique && exam.pratique.active) loadPratique();
    ctx.api.log(`🎓 Examen « ${exam.sujet.title} » repris (${exam.student.prenom} ${exam.student.nom}).`, 'warn');
    if (remaining() <= 0) {
      submit(true);
      return;
    }
    startTimer();
  }
  root.addEventListener('load', () => setTimeout(resume, 50));

  MBV.Exam = {
    render,
    onProgress,
    /* accès pour les tests et l'intégration */
    
    _state: () => ({ exam, view, teacherOk, grading }),
  };
})(typeof window !== 'undefined' ? window : globalThis);
