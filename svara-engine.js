/* ============================================================================
   svara-engine.js
   Traditional Svarodaya rule engine for neuroscienceofmeditation.in

   DESIGN CONTRACT
   ---------------
   This file contains ONLY logic. No DOM, no UI, no side effects.
   Every rule carries a `status` field describing its provenance:

     "confirmed"  - present in the site owner's supplied Svara Yoga source
     "unverified" - commonly cited in Svara Yoga literature, but NOT yet
                    checked against the owner's source. Must be verified.
     "missing"    - NOT SPECIFIED IN SOURCE. No rule is invented to fill it.

   Nothing here fabricates a verse number. `verse: null` means "not yet
   supplied by the site owner" and the UI renders it as such.

   Contradictions between the owner's source and the wider literature are
   recorded in RULES.contradictions and surfaced in the UI. They are NOT
   silently resolved.
   ============================================================================ */

(function (root) {
  'use strict';

  /* ==========================================================================
     1. ASTRONOMY
     Low-precision but deterministic. Accuracy stated honestly per function.
     ========================================================================== */

  var DEG = Math.PI / 180;

  function norm360(x) { return ((x % 360) + 360) % 360; }
  function sind(x) { return Math.sin(x * DEG); }
  function cosd(x) { return Math.cos(x * DEG); }

  /** Julian Day from a JS Date (uses its UTC value). */
  function julianDay(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }

  /**
   * Apparent geocentric longitude of the Sun, degrees.
   * Meeus low-precision. Accurate to about 0.01 degrees.
   */
  function sunLongitude(jd) {
    var n = jd - 2451545.0;
    var L = norm360(280.460 + 0.9856474 * n);
    var g = norm360(357.528 + 0.9856003 * n);
    return norm360(L + 1.915 * sind(g) + 0.020 * sind(2 * g));
  }

  /**
   * Apparent geocentric longitude of the Moon, degrees.
   * Abbreviated Meeus series. Accurate to roughly 0.3 degrees, which is
   * 2.5% of one tithi (12 degrees). Near a tithi boundary this matters,
   * so `tithi()` reports how close to a boundary we are.
   */
  function moonLongitude(jd) {
    var T = (jd - 2451545.0) / 36525;
    var Lp = 218.316 + 481267.8813 * T;      // mean longitude
    var M  = 134.963 + 477198.8676 * T;      // Moon mean anomaly
    var Ms = 357.529 + 35999.0503 * T;       // Sun mean anomaly
    var D  = 297.850 + 445267.1115 * T;      // mean elongation
    var F  = 93.272 + 483202.0175 * T;       // argument of latitude

    var l = Lp
      + 6.289 * sind(M)
      + 1.274 * sind(2 * D - M)
      + 0.658 * sind(2 * D)
      + 0.214 * sind(2 * M)
      - 0.186 * sind(Ms)
      - 0.114 * sind(2 * F)
      + 0.059 * sind(2 * D - 2 * M)
      + 0.057 * sind(2 * D - Ms - M)
      + 0.053 * sind(2 * D + M)
      + 0.046 * sind(2 * D - Ms)
      - 0.041 * sind(Ms - M)
      - 0.035 * sind(D)
      - 0.031 * sind(Ms + M);

    return norm360(l);
  }

  /**
   * Tithi (lunar day) at an instant.
   * A tithi is the time for the Moon to gain 12 degrees on the Sun.
   * Returns index 0-29, number 1-15, paksha, and boundary proximity.
   */
  function tithi(date) {
    var jd = julianDay(date);
    var elong = norm360(moonLongitude(jd) - sunLongitude(jd));
    var exact = elong / 12;               // 0 .. 30
    var index = Math.floor(exact);        // 0 .. 29
    var fraction = exact - index;         // 0 .. 1 through this tithi

    // How near are we to a boundary, in degrees of elongation?
    var degIntoTithi = elong - index * 12;
    var degToBoundary = Math.min(degIntoTithi, 12 - degIntoTithi);

    return {
      index: index,
      number: (index % 15) + 1,
      paksha: index < 15 ? 'shukla' : 'krishna',
      name: TITHI_NAMES[index % 15],
      fraction: fraction,
      elongation: elong,
      // 0.3 deg is our stated model error
      nearBoundary: degToBoundary < 0.35,
      degreesToBoundary: degToBoundary
    };
  }

  var TITHI_NAMES = [
    'Pratipada', 'Dvitiya', 'Tritiya', 'Chaturthi', 'Panchami',
    'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami',
    'Ekadashi', 'Dvadashi', 'Trayodashi', 'Chaturdashi', 'Purnima'
  ];
  // Index 29 in krishna paksha is Amavasya, not Purnima.
  function tithiDisplayName(t) {
    if (t.index === 14) return 'Purnima';
    if (t.index === 29) return 'Amavasya';
    return TITHI_NAMES[t.index % 15];
  }

  /**
   * Sunrise / sunset as Date objects for the local civil day of `date`.
   * NOAA general solar position algorithm. Accurate to about a minute at
   * mid latitudes. Returns null where the Sun does not cross the horizon.
   */
  function sunTimes(date, lat, lon) {
    if (lat == null || lon == null) return { sunrise: null, sunset: null };

    // Work from local midnight so we get the right civil day.
    var local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var start = new Date(Date.UTC(
      local.getFullYear(), local.getMonth(), local.getDate()
    ));
    var dayOfYear = Math.floor(
      (start - Date.UTC(local.getFullYear(), 0, 0)) / 86400000
    );

    // NOAA solar position. Accurate to well under a minute at these latitudes.
    // `lon` is positive east. Returns minutes after 00:00 UTC.
    function solarTerms(T) {
      var L0 = norm360(280.46646 + T * (36000.76983 + T * 0.0003032));
      var M  = 357.52911 + T * (35999.05029 - 0.0001537 * T);
      var e  = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

      var C = sind(M) * (1.914602 - T * (0.004817 + 0.000014 * T))
            + sind(2 * M) * (0.019993 - 0.000101 * T)
            + sind(3 * M) * 0.000289;

      var trueLong = L0 + C;
      var omega = 125.04 - 1934.136 * T;
      var lambda = trueLong - 0.00569 - 0.00478 * sind(omega);

      var eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
      var eps = eps0 + 0.00256 * cosd(omega);

      var decl = Math.asin(sind(eps) * sind(lambda)) / DEG;

      var y = Math.pow(Math.tan(eps / 2 * DEG), 2);
      var eqtime = 4 / DEG * (
          y * Math.sin(2 * L0 * DEG)
        - 2 * e * Math.sin(M * DEG)
        + 4 * e * y * Math.sin(M * DEG) * Math.cos(2 * L0 * DEG)
        - 0.5 * y * y * Math.sin(4 * L0 * DEG)
        - 1.25 * e * e * Math.sin(2 * M * DEG)
      );

      return { decl: decl, eqtime: eqtime };
    }

    function solve(isRise) {
      // Two passes: estimate at local noon, then refine at the found time.
      var jdNoon = start.getTime() / 86400000 + 2440587.5 + 0.5 - lon / 360;
      var minutes = null;

      for (var pass = 0; pass < 2; pass++) {
        var jd = (minutes == null)
          ? jdNoon
          : start.getTime() / 86400000 + 2440587.5 + minutes / 1440;

        var s = solarTerms((jd - 2451545.0) / 36525);

        var latR = lat * DEG;
        var declR = s.decl * DEG;
        var cosH = Math.cos(90.833 * DEG) / (Math.cos(latR) * Math.cos(declR))
                 - Math.tan(latR) * Math.tan(declR);

        if (cosH > 1 || cosH < -1) return null;   // polar day or polar night

        var ha = Math.acos(cosH) / DEG;           // positive, degrees
        if (!isRise) ha = -ha;                    // sunset is the other side

        minutes = 720 - 4 * (lon + ha) - s.eqtime;
      }

      return new Date(start.getTime() + minutes * 60000);
    }

    return { sunrise: solve(true), sunset: solve(false) };
  }

  /**
   * The Svarodaya day begins at sunrise, not midnight. Before today's
   * sunrise we still belong to yesterday's svara cycle.
   */
  function svarodayaDay(date, lat, lon) {
    var today = sunTimes(date, lat, lon);
    if (!today.sunrise) {
      return { sunrise: null, sunset: today.sunset, reference: date, shifted: false };
    }
    if (date < today.sunrise) {
      var y = new Date(date.getTime() - 86400000);
      var prev = sunTimes(y, lat, lon);
      return {
        sunrise: prev.sunrise,
        sunset: prev.sunset,
        reference: y,
        shifted: true
      };
    }
    return { sunrise: today.sunrise, sunset: today.sunset, reference: date, shifted: false };
  }

  /* ==========================================================================
     2. RULE TABLE
     EDIT THIS SECTION when the full source has been extracted.
     Change `status` to "confirmed" and fill `verse` only from the document.
     ========================================================================== */

  var RULES = {

    /* --- Nadi orientation ------------------------------------------------ */
    orientation: {
      ruleId: 'ORIENT-01',
      status: 'confirmed',
      source: 'Owner-supplied Svara Yoga source',
      verse: null,
      section: 'Nadi orientation',
      statement: 'Ida flows on the left and is associated with Chandra (Moon). ' +
                 'Pingala flows on the right and is associated with Surya (Sun). ' +
                 'Sushumna is in the middle.',
      note: 'Confirmed present in the supplied brief. Verse reference still needed.'
    },

    /* --- Which svara should be flowing at sunrise ------------------------ */
    sunriseSvara: {
      ruleId: 'SUNRISE-01',
      status: 'partial',
      source: 'Owner-supplied Svara Yoga source',
      verse: null,
      section: 'Pratipada and the lunar cycle',

      confirmed: {
        statement: 'At sunrise on Shukla Paksha Pratipada, Ida flows. ' +
                   'At sunrise on Krishna Paksha Pratipada, Pingala flows.',
        covers: 'Tithi 1 of each paksha only.'
      },

      // Extension beyond Pratipada. NOT confirmed by the supplied excerpt.
      extension: {
        status: 'unverified',
        statement: 'The sunrise svara is commonly described as holding for three ' +
                   'consecutive tithis, then alternating: Shukla 1-3 Ida, 4-6 ' +
                   'Pingala, 7-9 Ida, 10-12 Pingala, 13-15 Ida; Krishna paksha ' +
                   'mirrored, beginning with Pingala.',
        warning: 'This grouping is widely cited but is NOT in the supplied ' +
                 'excerpt. Verify against the source before treating results ' +
                 'on tithis 2-15 as traditional.',
        enabled: true   // set false to restrict the engine to Pratipada only
      },

      /** Returns 'ida' | 'pingala' | null, plus which rule was used. */
      evaluate: function (t) {
        var group = Math.floor((t.number - 1) / 3);       // 0..4
        var startsWithIda = (t.paksha === 'shukla');
        var svara = (group % 2 === 0)
          ? (startsWithIda ? 'ida' : 'pingala')
          : (startsWithIda ? 'pingala' : 'ida');

        if (t.number <= 1) {
          return { svara: svara, basis: 'confirmed' };
        }
        if (!RULES.sunriseSvara.extension.enabled) {
          return { svara: null, basis: 'missing' };
        }
        return { svara: svara, basis: 'unverified' };
      }
    },

    /* --- How long each svara holds before turning ------------------------ */
    alternation: {
      ruleId: 'ALT-01',
      status: 'unverified',
      source: 'Commonly cited; site copy also states "roughly every hour"',
      verse: null,
      section: 'Svara timing',
      statement: 'The active svara turns approximately every 60 minutes, ' +
                 'measured from sunrise.',
      warning: 'The exact period is NOT SPECIFIED IN SOURCE in the supplied ' +
               'excerpt. 60 minutes is the common figure and is configurable ' +
               'below. Results depend on it directly.',
      periodMinutes: 60
    },

    /* --- Tattva sequence -------------------------------------------------- */
    tattva: {
      ruleId: 'TATTVA-01',
      status: 'confirmed',
      source: 'Owner-supplied Svara Yoga source',
      verse: null,
      section: 'Tattva sequence',
      statement: 'During the flow of a nadi the tattvas arise in sequence: ' +
                 'Vayu, Agni, Prithvi, Jala, Akasha. The sequence occurs in ' +
                 'each nadi.',
      order: ['vayu', 'agni', 'prithvi', 'jala', 'akasha'],

      durations: null,   // null = NOT SPECIFIED IN SOURCE -> equal division
      durationStatus: 'missing',
      durationNote: 'The supplied source gives the ORDER but no durations. ' +
                    'The engine divides the svara period equally until real ' +
                    'durations are supplied. Do not present these boundaries ' +
                    'as traditional.'
    },

    /* --- Sushumna --------------------------------------------------------- */
    sushumna: {
      ruleId: 'SUSH-01',
      status: 'confirmed',
      source: 'Owner-supplied Svara Yoga source',
      verse: null,
      section: 'Sushumna',
      statement: 'Rapid alternation between left and right is described as ' +
                 'Sushumna and is treated differently from ordinary Ida or ' +
                 'Pingala activity.',
      predictable: false,
      predictionNote: 'NOT SPECIFIED IN SOURCE: the supplied excerpt gives no ' +
                      'rule for predicting WHEN Sushumna should occur from ' +
                      'date and time. The engine therefore never predicts it, ' +
                      'only recognises it when observed.'
    },

    /* --- Weekday rules ---------------------------------------------------- */
    weekday: {
      ruleId: 'WEEKDAY-01',
      status: 'missing',
      statement: 'NOT SPECIFIED IN SOURCE.',
      note: 'The brief mentions weekday rules exist in the source but does not ' +
            'quote them. No weekday logic is implemented. Supply the text and ' +
            'this rule can be added here.'
    },

    /* --- Corrective practice ---------------------------------------------- */
    correction: {
      ruleId: 'CORRECT-01',
      status: 'partial',
      source: 'Owner-supplied Svara Yoga source',
      verse: null,
      section: 'Adjustment of nadi',
      statement: 'The source describes adjusting the nadi according to the ' +
                 'requirement of the action.',
      methodStatus: 'missing',
      methodNote: 'NOT SPECIFIED IN SOURCE: the supplied excerpt confirms THAT ' +
                  'the nadi is adjusted but does not give the method. The ' +
                  'practices below are labelled as contemporary instructional ' +
                  'adaptations and are NOT attributed to the text.'
    },

    /* --- Recorded contradictions ------------------------------------------ */
    contradictions: [
      {
        id: 'CONTRA-TATTVA-ORDER',
        severity: 'high',
        title: 'Tattva order differs from most printed editions',
        ours: 'The supplied source gives Vayu, Agni, Prithvi, Jala, Akasha.',
        other: 'Most widely circulated editions of Shiva Swarodaya give ' +
               'Prithvi, Jala, Agni, Vayu, Akasha, with durations of ' +
               '20, 16, 12, 8 and 4 minutes in a 60-minute svara.',
        resolution: 'NOT RESOLVED. The engine follows the supplied source, as ' +
                    'instructed. Please confirm the order and durations against ' +
                    'the original text before publishing results.'
      },
      {
        id: 'CONTRA-SUNRISE-EXTENSION',
        severity: 'medium',
        title: 'Sunrise rule only confirmed for Pratipada',
        ours: 'The supplied excerpt covers tithi 1 of each paksha.',
        other: 'The engine currently extends this to all 15 tithis using the ' +
               'common three-tithi grouping.',
        resolution: 'NOT RESOLVED. Results on tithis 2-15 are marked ' +
                    '"unverified" in the UI. Set ' +
                    'RULES.sunriseSvara.extension.enabled = false to disable.'
      },
      {
        id: 'CONTRA-PERIOD',
        severity: 'medium',
        title: 'Svara period not given in the supplied excerpt',
        ours: 'No period stated.',
        other: '60 minutes is the standard figure and is used as the default.',
        resolution: 'NOT RESOLVED. Configurable via RULES.alternation.periodMinutes.'
      }
    ]
  };

  /* ==========================================================================
     3. DESCRIPTIVE DATA
     ========================================================================== */

  var SVARAS = {
    ida: {
      key: 'ida', side: 'left', name: 'Ida', sanskrit: 'इडा',
      label: 'Ida · left', luminary: 'Chandra · Moon',
      quality: 'cooling', colour: '#2E7FA8', glyph: 'moon'
    },
    pingala: {
      key: 'pingala', side: 'right', name: 'Pingala', sanskrit: 'पिङ्गला',
      label: 'Pingala · right', luminary: 'Surya · Sun',
      quality: 'heating', colour: '#E4744F', glyph: 'sun'
    },
    sushumna: {
      key: 'sushumna', side: 'both', name: 'Sushumna', sanskrit: 'सुषुम्णा',
      label: 'Sushumna · both', luminary: 'The turning point',
      quality: 'transitional', colour: '#C6A15B', glyph: 'both'
    }
  };

  var TATTVAS = {
    vayu:    { key: 'vayu',    sanskrit: 'वायु',  name: 'Vayu',    english: 'Air',   colour: '#7FA88C' },
    agni:    { key: 'agni',    sanskrit: 'अग्नि', name: 'Agni',    english: 'Fire',  colour: '#E4744F' },
    prithvi: { key: 'prithvi', sanskrit: 'पृथ्वी', name: 'Prithvi', english: 'Earth', colour: '#B08D57' },
    jala:    { key: 'jala',    sanskrit: 'जल',   name: 'Jala',    english: 'Water', colour: '#2E7FA8' },
    akasha:  { key: 'akasha',  sanskrit: 'आकाश', name: 'Akasha',  english: 'Space', colour: '#8A7FA8' }
  };

  /**
   * Corrective practices.
   * EVERY entry is explicitly labelled as a contemporary adaptation.
   * Nothing here is attributed to the source. Gentle only: no retention,
   * no forceful breathing, no hyperventilation.
   */
  var PRACTICES = {
    ida: {
      target: 'ida',
      title: 'Practice to shift toward Ida',
      attribution: 'Contemporary instructional adaptation — not attributed to the source.',
      steps: [
        'Sit upright and comfortably, or lie on your right side.',
        'Rest your right thumb lightly against the right nostril, without pressing hard.',
        'Breathe softly and evenly through the left nostril.',
        'Let the breath stay quiet. There is no holding at any point.'
      ],
      inhale: 4,
      exhale: 6,
      cycles: 8,
      ratioStatus: 'adaptation',
      ratioNote: 'A 4:6 second ratio is a modern breathing protocol chosen for ' +
                 'gentleness. The source does not prescribe it. Adjust below.'
    },
    pingala: {
      target: 'pingala',
      title: 'Practice to shift toward Pingala',
      attribution: 'Contemporary instructional adaptation — not attributed to the source.',
      steps: [
        'Sit upright and comfortably, or lie on your left side.',
        'Rest your left thumb lightly against the left nostril, without pressing hard.',
        'Breathe softly and evenly through the right nostril.',
        'Let the breath stay quiet. There is no holding at any point.'
      ],
      inhale: 4,
      exhale: 6,
      cycles: 8,
      ratioStatus: 'adaptation',
      ratioNote: 'A 4:6 second ratio is a modern breathing protocol chosen for ' +
                 'gentleness. The source does not prescribe it. Adjust below.'
    }
  };

  /* ==========================================================================
     4. ASSESSMENT
     ========================================================================== */

  /** Expected tattva at a given point through the svara period. */
  function tattvaAt(minutesIntoSvara, periodMinutes) {
    var order = RULES.tattva.order;
    var durations = RULES.tattva.durations;

    if (!durations) {
      durations = order.map(function () { return periodMinutes / order.length; });
    }

    var elapsed = 0;
    var timeline = [];
    var current = null;

    for (var i = 0; i < order.length; i++) {
      var from = elapsed;
      var to = elapsed + durations[i];
      var active = minutesIntoSvara >= from && minutesIntoSvara < to;
      timeline.push({
        tattva: TATTVAS[order[i]],
        from: from,
        to: to,
        active: active,
        minutesRemaining: active ? to - minutesIntoSvara : null
      });
      if (active) current = timeline[i];
      elapsed = to;
    }

    // Defensive: floating point at the very end of the period.
    if (!current && timeline.length) {
      current = timeline[timeline.length - 1];
      current.active = true;
    }

    return { current: current, timeline: timeline };
  }

  /**
   * Main entry point.
   * @param {Object} input
   *   date          {Date}    instant of observation
   *   lat, lon      {Number}  optional; required for sunrise-based rules
   *   observedSvara {String}  'ida' | 'pingala' | 'sushumna' | null
   */
  function assess(input) {
    var date = input.date instanceof Date ? input.date : new Date();
    var lat = (typeof input.lat === 'number') ? input.lat : null;
    var lon = (typeof input.lon === 'number') ? input.lon : null;
    var observed = input.observedSvara || null;

    var flags = [];
    var provenance = [];
    var explanation = [];

    /* --- Astronomical context ------------------------------------------- */
    var day = svarodayaDay(date, lat, lon);
    var t = tithi(day.sunrise || date);
    t.displayName = tithiDisplayName(t);

    var context = {
      date: date,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      lat: lat, lon: lon,
      sunrise: day.sunrise,
      sunset: day.sunset,
      beforeSunrise: day.shifted,
      tithi: t,
      weekday: date.toLocaleDateString(undefined, { weekday: 'long' }),
      minutesSinceSunrise: null
    };

    if (!day.sunrise) {
      flags.push({
        level: 'blocking',
        text: lat == null
          ? 'Location is needed. The svara cycle is counted from sunrise, and ' +
            'sunrise depends on where you are.'
          : 'The Sun does not cross the horizon at this location today, so ' +
            'sunrise-based rules cannot be applied.'
      });
      return {
        context: context, observedSvara: observed && SVARAS[observed],
        expectedSvara: null, alignment: 'unavailable',
        expectedTattva: null, tattvaTimeline: [],
        provenance: provenance, explanation: explanation,
        correctivePractice: null, flags: flags, ruleMatch: null
      };
    }

    var minsSinceSunrise = (date - day.sunrise) / 60000;
    context.minutesSinceSunrise = minsSinceSunrise;

    if (t.nearBoundary) {
      flags.push({
        level: 'caution',
        text: 'The tithi is within about 20 minutes of changing. This engine\'s ' +
              'lunar model is accurate to roughly 0.3 degrees, so the tithi ' +
              'shown here may be off by one. Treat this result as provisional.'
      });
    }

    /* --- Rule 1: sunrise svara ------------------------------------------- */
    var sunriseResult = RULES.sunriseSvara.evaluate(t);
    provenance.push({
      ruleId: RULES.sunriseSvara.ruleId,
      status: sunriseResult.basis,
      title: 'Sunrise svara from the lunar day',
      detail: sunriseResult.basis === 'confirmed'
        ? RULES.sunriseSvara.confirmed.statement
        : RULES.sunriseSvara.extension.statement,
      warning: sunriseResult.basis === 'unverified'
        ? RULES.sunriseSvara.extension.warning : null,
      source: RULES.sunriseSvara.source,
      verse: RULES.sunriseSvara.verse
    });

    if (!sunriseResult.svara) {
      flags.push({
        level: 'blocking',
        text: 'NOT SPECIFIED IN SOURCE. The confirmed rule only covers ' +
              'Pratipada, and the unverified extension is switched off. ' +
              'No expected svara can be given for ' + t.displayName + '.'
      });
      return {
        context: context, observedSvara: observed && SVARAS[observed],
        expectedSvara: null, alignment: 'unavailable',
        expectedTattva: null, tattvaTimeline: [],
        provenance: provenance, explanation: explanation,
        correctivePractice: null, flags: flags, ruleMatch: null
      };
    }

    explanation.push(
      'The svarodaya day began at sunrise, ' +
      formatTime(day.sunrise) + '. The lunar day is ' +
      t.displayName + ' of ' +
      (t.paksha === 'shukla' ? 'Shukla' : 'Krishna') + ' Paksha, ' +
      'so the svara at sunrise was ' + SVARAS[sunriseResult.svara].name + '.'
    );

    /* --- Rule 2: alternation --------------------------------------------- */
    var period = RULES.alternation.periodMinutes;
    var turns = Math.floor(minsSinceSunrise / period);
    var minsIntoSvara = minsSinceSunrise - turns * period;

    var expectedKey = (turns % 2 === 0)
      ? sunriseResult.svara
      : (sunriseResult.svara === 'ida' ? 'pingala' : 'ida');

    provenance.push({
      ruleId: RULES.alternation.ruleId,
      status: 'unverified',
      title: 'Alternation period',
      detail: RULES.alternation.statement,
      warning: RULES.alternation.warning,
      source: RULES.alternation.source,
      verse: RULES.alternation.verse
    });

    explanation.push(
      'It is now ' + Math.floor(minsSinceSunrise) + ' minutes past sunrise. ' +
      'At one turn every ' + period + ' minutes that is ' + turns +
      ' turn' + (turns === 1 ? '' : 's') + ', giving ' +
      SVARAS[expectedKey].name + ', ' + Math.floor(minsIntoSvara) +
      ' minutes into its period.'
    );

    /* --- Rule 3: tattva --------------------------------------------------- */
    var tv = tattvaAt(minsIntoSvara, period);

    provenance.push({
      ruleId: RULES.tattva.ruleId,
      status: 'confirmed',
      title: 'Tattva sequence',
      detail: RULES.tattva.statement,
      warning: RULES.tattva.durationNote,
      source: RULES.tattva.source,
      verse: RULES.tattva.verse
    });

    explanation.push(
      'Within a svara the tattvas run ' +
      RULES.tattva.order.map(function (k) { return TATTVAS[k].name; }).join(' → ') +
      '. Durations are NOT SPECIFIED IN SOURCE, so the period is divided ' +
      'equally into five parts of ' + Math.round(period / 5) + ' minutes. ' +
      'That places the present moment in ' + tv.current.tattva.name + '.'
    );

    /* --- Alignment -------------------------------------------------------- */
    var alignment;
    if (!observed) {
      alignment = 'unreported';
    } else if (observed === 'sushumna') {
      alignment = 'sushumna';
      provenance.push({
        ruleId: RULES.sushumna.ruleId,
        status: 'confirmed',
        title: 'Sushumna is handled separately',
        detail: RULES.sushumna.statement,
        warning: RULES.sushumna.predictionNote,
        source: RULES.sushumna.source,
        verse: RULES.sushumna.verse
      });
      explanation.push(
        'You reported both sides, or rapid changing. The source treats this as ' +
        'Sushumna and as distinct from ordinary Ida or Pingala activity, so it ' +
        'is not scored as aligned or misaligned against the clock rule.'
      );
    } else {
      alignment = (observed === expectedKey) ? 'aligned' : 'misaligned';
    }

    /* --- Correction ------------------------------------------------------- */
    var practice = null;
    if (alignment === 'misaligned') {
      practice = PRACTICES[expectedKey];
      provenance.push({
        ruleId: RULES.correction.ruleId,
        status: 'partial',
        title: 'Adjustment of the nadi',
        detail: RULES.correction.statement,
        warning: RULES.correction.methodNote,
        source: RULES.correction.source,
        verse: RULES.correction.verse
      });
    }

    /* --- Overall rule match ----------------------------------------------- */
    var statuses = provenance.map(function (p) { return p.status; });
    var ruleMatch = statuses.indexOf('unverified') === -1 &&
                    statuses.indexOf('partial') === -1
      ? 'fully-sourced'
      : 'partly-sourced';

    return {
      context: context,
      observedSvara: observed ? SVARAS[observed] : null,
      expectedSvara: SVARAS[expectedKey],
      alignment: alignment,
      expectedTattva: tv.current.tattva,
      tattvaCurrent: tv.current,
      tattvaTimeline: tv.timeline,
      minutesIntoSvara: minsIntoSvara,
      periodMinutes: period,
      provenance: provenance,
      explanation: explanation,
      correctivePractice: practice,
      flags: flags,
      ruleMatch: ruleMatch
    };
  }

  function formatTime(d) {
    if (!d) return '—';
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  /* ==========================================================================
     5. SOURCE MODE — future sensor extensibility
     ========================================================================== */

  var sourceMode = 'self-report';   // 'self-report' | 'sensor'

  /**
   * Placeholder for a future bilateral nasal airflow sensor.
   * Deliberately throws rather than returning a plausible fake number.
   */
  function calculateNasalDominance(leftFlow, rightFlow) {
    if (typeof leftFlow !== 'number' || typeof rightFlow !== 'number') {
      throw new Error(
        'Sensor mode is not implemented. No physiological values are ' +
        'simulated by this engine.'
      );
    }
    var total = leftFlow + rightFlow;
    if (total <= 0) return null;
    var ratio = leftFlow / total;
    if (ratio > 0.60) return 'ida';
    if (ratio < 0.40) return 'pingala';
    return 'sushumna';
  }

  /* ========================================================================== */

  root.SvaraEngine = {
    assess: assess,
    RULES: RULES,
    SVARAS: SVARAS,
    TATTVAS: TATTVAS,
    PRACTICES: PRACTICES,
    astro: {
      julianDay: julianDay,
      sunLongitude: sunLongitude,
      moonLongitude: moonLongitude,
      tithi: tithi,
      sunTimes: sunTimes,
      svarodayaDay: svarodayaDay
    },
    formatTime: formatTime,
    get sourceMode() { return sourceMode; },
    set sourceMode(v) { sourceMode = v; },
    calculateNasalDominance: calculateNasalDominance,
    version: '1.0.0'
  };

}(typeof window !== 'undefined' ? window : globalThis));
