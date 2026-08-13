/* ============================================================
   worlds.js  -  Mehrere benannte Welten verwalten

   Bisher gab es genau einen Spielstand unter einem festen Schlüssel: eine neue
   Welt überschrieb die alte. Hier liegt jetzt eine Liste, jede Welt mit Namen,
   Seed, Modus und Datum.

   Zwei Ablagen, dieselbe Schnittstelle:

   * **Browserspeicher** — läuft überall, auch per Doppelklick aus dem Ordner,
     ist aber auf einige Megabyte begrenzt und hängt am Browserprofil.
   * **Ein echter Ordner** über die File-System-Access-Schnittstelle. Die gibt
     es nur in Chrome und Edge und nur auf einer https-Seite oder als
     installierte App – aus einer Datei heraus verweigert der Browser sie.
     Darum ist sie ein Angebot und keine Voraussetzung: wo sie da ist, kann man
     einen Ordner wählen und die Welten liegen als lesbare .json-Dateien darin.
   ============================================================ */
(function () {
  'use strict';

  var W = {};
  MC.Welten = W;

  var INDEX_KEY = 'minecraft_html_welten_v1';
  var WELT_KEY = 'minecraft_html_welt_';
  var ALT_KEY = 'minecraft_html_world_v1';     // der eine Spielstand von früher

  // ============================================================
  //  Verzeichnis
  // ============================================================
  // [{ id, name, seed, mode, gen, zuletzt, groesse }]
  W.liste = function () {
    var l = null;
    try { l = JSON.parse(localStorage.getItem(INDEX_KEY)); } catch (e) { }
    if (!Array.isArray(l)) l = [];
    // Nach letztem Spielen, das Zuletzte oben – so wie man es sucht
    l.sort(function (a, b) { return (b.zuletzt || 0) - (a.zuletzt || 0); });
    return l;
  };

  function schreibeListe(l) {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(l)); } catch (e) { }
  }

  W.eintrag = function (id) {
    var l = W.liste();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  };

  W.neueId = function () {
    // Zeitstempel plus Zufall: eindeutig, ohne einen Zähler pflegen zu müssen
    return 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  };

  // Ein Name, den es noch nicht gibt: „Neue Welt", „Neue Welt (2)", …
  W.freierName = function (wunsch) {
    var basis = (wunsch || 'Neue Welt').trim() || 'Neue Welt';
    var l = W.liste(), n = basis, i = 1;
    while (l.some(function (e) { return e.name === n; })) { i++; n = basis + ' (' + i + ')'; }
    return n;
  };

  // ============================================================
  //  Ordner (nur wo der Browser mitspielt)
  // ============================================================
  W.ordnerMoeglich = function () {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
  };
  W.ordnerAktiv = function () { return !!W.ordner; };
  W.ordnerName = function () { return W.ordner ? W.ordner.name : null; };

  W.ordnerWaehlen = function (fertig) {
    if (!W.ordnerMoeglich()) { fertig(false, 'Dieser Browser kann keinen Ordner öffnen'); return; }
    window.showDirectoryPicker({ mode: 'readwrite' }).then(function (griff) {
      W.ordner = griff;
      W.ordnerLesen(function () { fertig(true, griff.name); });
    }).catch(function (e) {
      fertig(false, (e && e.name === 'AbortError') ? 'Abgebrochen' : 'Ordner nicht nutzbar');
    });
  };

  W.ordnerLoesen = function () { W.ordner = null; };

  // Liest alle .json aus dem Ordner und trägt sie in die Liste ein
  W.ordnerLesen = function (fertig) {
    if (!W.ordner) { fertig(); return; }
    var gefunden = [];
    var iter = W.ordner.values();
    function weiter() {
      iter.next().then(function (r) {
        if (r.done) { uebernehmen(); return; }
        var h = r.value;
        if (h.kind !== 'file' || !/\.json$/i.test(h.name)) { weiter(); return; }
        h.getFile().then(function (f) {
          return f.text();
        }).then(function (t) {
          var d = null;
          try { d = JSON.parse(t); } catch (e) { d = null; }
          if (d && d.seed !== undefined) {
            gefunden.push({
              id: d.weltId || ('datei:' + h.name),
              name: d.weltName || h.name.replace(/\.json$/i, ''),
              seed: d.seed, mode: d.mode || 'survival',
              gen: (d.settings && d.settings.gen) || 1,
              zuletzt: d.zuletzt || 0, datei: h.name
            });
          }
          weiter();
        }).catch(function () { weiter(); });
      }).catch(function () { uebernehmen(); });
    }
    function uebernehmen() {
      // Der Ordner ist die Wahrheit, solange er gewählt ist
      schreibeListe(gefunden);
      fertig();
    }
    weiter();
  };

  function dateiname(eintrag) {
    var roh = (eintrag.name || 'welt').replace(/[^\wäöüÄÖÜß \-]/g, '').trim() || 'welt';
    return roh + '.json';
  }

  // ============================================================
  //  Lesen und Schreiben
  // ============================================================
  W.speichern = function (id, name, daten, fertig) {
    daten.weltId = id;
    daten.weltName = name;
    daten.zuletzt = Date.now();
    var text = JSON.stringify(daten);

    var e = W.eintrag(id) || { id: id };
    e.name = name;
    e.seed = daten.seed;
    e.mode = daten.mode;
    e.gen = (daten.settings && daten.settings.gen) || 1;
    e.zuletzt = daten.zuletzt;
    e.groesse = text.length;

    if (W.ordner) {
      var dn = e.datei || dateiname(e);
      e.datei = dn;
      W.ordner.getFileHandle(dn, { create: true }).then(function (h) {
        return h.createWritable();
      }).then(function (s) {
        return s.write(text).then(function () { return s.close(); });
      }).then(function () {
        merkeEintrag(e);
        if (fertig) fertig(true);
      }).catch(function () { if (fertig) fertig(false, 'Schreiben in den Ordner ging nicht'); });
      return;
    }

    try {
      localStorage.setItem(WELT_KEY + id, text);
      merkeEintrag(e);
      if (fertig) fertig(true);
    } catch (err) {
      if (fertig) fertig(false, 'Speicher voll — nutze „Welt exportieren"');
    }
  };

  function merkeEintrag(e) {
    var l = W.liste();
    var i = l.findIndex(function (x) { return x.id === e.id; });
    if (i >= 0) l[i] = e; else l.push(e);
    schreibeListe(l);
  }

  W.laden = function (id, fertig) {
    var e = W.eintrag(id);
    if (!e) { fertig(null); return; }
    if (W.ordner && e.datei) {
      W.ordner.getFileHandle(e.datei).then(function (h) { return h.getFile(); })
        .then(function (f) { return f.text(); })
        .then(function (t) { fertig(JSON.parse(t)); })
        .catch(function () { fertig(null); });
      return;
    }
    var d = null;
    try { d = JSON.parse(localStorage.getItem(WELT_KEY + id)); } catch (err) { d = null; }
    fertig(d);
  };

  W.umbenennen = function (id, name) {
    var e = W.eintrag(id);
    if (!e) return false;
    var alterName = e.name, alteDatei = e.datei;
    e.name = W.freierName(name);
    // Im Ordner heißt die Datei wie die Welt – also mit umbenennen
    if (W.ordner && alteDatei) {
      var neu = dateiname(e);
      if (neu !== alteDatei) {
        W.laden(id, function (d) {
          if (!d) return;
          d.weltName = e.name;
          e.datei = neu;
          merkeEintrag(e);
          W.ordner.getFileHandle(neu, { create: true }).then(function (h) { return h.createWritable(); })
            .then(function (s) { return s.write(JSON.stringify(d)).then(function () { return s.close(); }); })
            .then(function () { return W.ordner.removeEntry(alteDatei); })
            .catch(function () { });
        });
        return true;
      }
    }
    merkeEintrag(e);
    return e.name !== alterName || true;
  };

  W.loeschen = function (id, fertig) {
    var e = W.eintrag(id);
    var l = W.liste().filter(function (x) { return x.id !== id; });
    schreibeListe(l);
    if (W.ordner && e && e.datei) {
      W.ordner.removeEntry(e.datei).then(function () { if (fertig) fertig(true); })
        .catch(function () { if (fertig) fertig(false); });
      return;
    }
    try { localStorage.removeItem(WELT_KEY + id); } catch (err) { }
    if (fertig) fertig(true);
  };

  W.duplizieren = function (id, fertig) {
    W.laden(id, function (d) {
      if (!d) { fertig(null); return; }
      var e = W.eintrag(id);
      var neueId = W.neueId();
      var name = W.freierName((e ? e.name : 'Welt') + ' Kopie');
      var kopie = JSON.parse(JSON.stringify(d));
      delete kopie.datei;
      W.speichern(neueId, name, kopie, function () { fertig(neueId); });
    });
  };

  // ============================================================
  //  Der alte Spielstand
  // ============================================================
  // Wer schon gespielt hat, soll seine Welt nicht verlieren, bloß weil es jetzt
  // eine Liste gibt. Sie wandert beim ersten Start in die Liste.
  W.altenUebernehmen = function () {
    var alt = null;
    try { alt = localStorage.getItem(ALT_KEY); } catch (e) { return false; }
    if (!alt) return false;
    var d = null;
    try { d = JSON.parse(alt); } catch (e) { return false; }
    if (!d || d.seed === undefined) return false;
    if (W.liste().some(function (e2) { return e2.uebernommen; })) return false;
    var id = W.neueId();
    var e = {
      id: id, name: W.freierName('Meine Welt'), seed: d.seed,
      mode: d.mode || 'survival', gen: (d.settings && d.settings.gen) || 1,
      zuletzt: Date.now(), groesse: alt.length, uebernommen: true
    };
    try {
      localStorage.setItem(WELT_KEY + id, alt);
      merkeEintrag(e);
      localStorage.removeItem(ALT_KEY);
      return true;
    } catch (err) { return false; }
  };

  W.datum = function (t) {
    if (!t) return 'nie gespielt';
    var d = new Date(t);
    var zwei = function (n) { return (n < 10 ? '0' : '') + n; };
    return zwei(d.getDate()) + '.' + zwei(d.getMonth() + 1) + '.' + d.getFullYear() +
           ' ' + zwei(d.getHours()) + ':' + zwei(d.getMinutes());
  };

  W.groesse = function (n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' kB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  };

})();
