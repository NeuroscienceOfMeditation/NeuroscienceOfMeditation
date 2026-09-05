/* ============================================================================
   svara-engine.js
   Traditional Svarodaya rule engine for neuroscienceofmeditation.in

   DESIGN CONTRACT
   ---------------
   This file contains ONLY logic. No DOM, no UI, no side effects.

   SOURCE
   ------
   Every rule below is taken from the Siva Svarodaya as presented in
   "The Respiratory Codex: A Neurocognitive Decoding of the Siva Svarodaya",
   supplied by the site owner. Each rule carries its verse number and the
   source's own evidential grade:

     E  - Established. Replicated human studies, physiological measurement,
          or anatomical fact.
     S  - Suggestive. Some human data, often small-sample, variable replication.
     X  - Speculative. A mechanistic proposal, not a finding.
     EN - Contradicted ([E, negative] in the source). The evidence has been
          examined and does not support the claim.

   Nothing is invented. Rules the text states but which the source grades as
   contradicted, or which are structurally unfalsifiable, are listed in
   RULES.notApplied with `applied: false` and the reason, and are shown to the
   reader rather than hidden. Where the recension disagrees with itself, the
   disagreement is recorded in RULES.contradictions and NOT resolved.

   Note that the central timing rule (verse 65) is graded EN by the source.
   That is not a defect in this engine; it is the finding, and the interface
   reports it as such.
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
     2. EVIDENTIAL GRADING
     Taken from the grading scheme of "The Respiratory Codex: A Neurocognitive
     Decoding of the Siva Svarodaya", which is the source document for every
     rule below. The grades are the source's own, not this engine's invention.
     ========================================================================== */

  var GRADES = {
    E: {
      key: 'E', label: 'Established',
      note: 'Supported by replicated human studies, physiological measurement, ' +
            'or anatomical fact.'
    },
    S: {
      key: 'S', label: 'Suggestive',
      note: 'Supported by some human data, often small-sample, sometimes with ' +
            'failed or partial replications.'
    },
    X: {
      key: 'X', label: 'Speculative',
      note: 'A mechanistic proposal offered to explain why the text says what ' +
            'it says. A hypothesis, not a finding.'
    },
    EN: {
      key: 'E-negative', label: 'Contradicted',
      note: 'The evidence has been examined and does not support the claim.'
    }
  };

  /* ==========================================================================
     3. RULE TABLE
     Every rule carries its verse number and the source's evidential grade.
     `applied: false` means the engine deliberately does not act on the rule,
     with the reason given. Nothing here is invented; nothing is silently
     resolved.
     ========================================================================== */

  var SOURCE = 'Siva Svarodaya, via The Respiratory Codex';

  var RULES = {

    /* --- Verse 50: the polarity itself -------------------------------------- */
    polarity: {
      ruleId: 'SS-50',
      verse: 50,
      applied: true,
      grade: 'S',
      source: SOURCE,
      section: 'The solar-lunar polarity and the balanced state',
      sanskrit: 'iḍāyāṃ tu sthitaś candraḥ piṅgalāyāṃ ca bhāskaraḥ',
      translation: 'The moon resides in Ida, the sun in Pingala. Sushumna is ' +
                   'Shiva himself, and Shiva\'s essential nature is the hamsa, ' +
                   'the sound of the breath.',
      statement: 'Ida flows on the left and carries a cooling, conserving ' +
                 'signature. Pingala flows on the right and carries a heating, ' +
                 'expending one.',
      commentary: 'Lateralised autonomic effects of unilateral nostril breathing ' +
                  'have some empirical support, predominantly from small studies ' +
                  'with variable replication and modest effect sizes. Plausible, ' +
                  'not established to the standard the popular literature claims.'
    },

    /* --- Verse 65: the lunar fortnight rule ---------------------------------- */
    sunriseSvara: {
      ruleId: 'SS-65',
      verse: 65,
      applied: true,
      grade: 'EN',
      source: SOURCE,
      section: 'Lunar phase and the expected opening',
      sanskrit: 'śuklapakṣe bhaved vāmā kṛṣṇapakṣe ca dakṣiṇā',
      translation: 'In the waxing fortnight the left channel should flow, in the ' +
                   'waning fortnight the right, reckoned from the first lunar day.',
      statement: 'Through Shukla Paksha the expected channel at sunrise is Ida. ' +
                 'Through Krishna Paksha it is Pingala. The rule runs across the ' +
                 'whole fortnight, reckoned from Pratipada.',
      commentary: 'The source grades this claim as contradicted. The nasal cycle ' +
                  'shows no established lunar-monthly modulation, and its ' +
                  'documented determinants — posture, unilateral pressure, ' +
                  'exercise, temperature, hormonal state, sleep stage — are all ' +
                  'more powerful than any putative lunar influence. The verse is ' +
                  'read as deducing physiology from the metaphor of verse 50 ' +
                  'rather than from the body.',

      /** Fortnight-wide, per the verse. Returns 'ida' or 'pingala'. */
      evaluate: function (t) {
        return { svara: t.paksha === 'shukla' ? 'ida' : 'pingala', basis: 'SS-65' };
      }
    },

    /* --- Verses 71-72: tattva order and duration ----------------------------- */
    tattva: {
      ruleId: 'SS-71-72',
      verse: '71–72',
      applied: true,
      grade: 'X',
      source: SOURCE,
      section: 'The elemental sequence and its timing',
      sanskrit: 'prathamaṃ vahate vāyur dvitīyaṃ ca tathānalaḥ | ' +
                'sārdhadvighaṭike pañca krameṇaivodayanti',
      translation: 'Air flows first, then fire, then earth, then water. The five ' +
                   'arise in sequence within a period of two and a half ghatikas, ' +
                   'each element arising distinctly in turn within each channel.',
      statement: 'Within one period of dominance the phases run Vayu, Agni, ' +
                 'Prithvi, Jala, Akasha. A ghatika is 24 minutes, so two and a ' +
                 'half ghatikas is 60 minutes, giving 12 minutes per phase.',
      commentary: 'The nesting of faster rhythms inside slower ones is ' +
                  'established biology. That these particular five phases are ' +
                  'fixed and of equal length is not; the source calls a rigid ' +
                  'equal-duration substructure inside an irregular parent cycle ' +
                  '"not a description of anything that would survive ' +
                  'measurement". Treat the phases as a vocabulary for breath ' +
                  'quality rather than as five real states.',

      order: ['vayu', 'agni', 'prithvi', 'jala', 'akasha'],
      durations: [12, 12, 12, 12, 12],       // minutes, from verse 72
      durationVerse: 72
    },

    /* --- The period, and the text's disagreement with itself ------------------ */
    alternation: {
      ruleId: 'SS-72/73-74',
      verse: '72, 73–74',
      applied: true,
      grade: 'S',
      source: SOURCE,
      section: 'Svara timing',
      statement: 'The recension gives three different periods and does not ' +
                 'reconcile them. The engine uses whichever you select.',
      commentary: 'The measured nasal cycle has a modal period around two to ' +
                  'four hours with enormous variance, and a substantial minority ' +
                  'of healthy people show no clear alternation at all. Any fixed ' +
                  'number will be wrong for most people most of the time. The ' +
                  'twelve-transit figure of verses 73–74 is the closest to the ' +
                  'measured rhythm.',

      periodMinutes: 60,
      options: [
        { minutes: 60,  verse: '72',    grade: 'X',
          label: 'Five phases in two and a half ghatikas — 60 minutes',
          note: 'Reading the sardha-dvi-ghatika as covering the whole set of five.' },
        { minutes: 150, verse: '72',    grade: 'X',
          label: 'Two and a half ghatikas per element — 150 minutes',
          note: 'Other passages assign the period to each element separately. ' +
                'The recension is internally inconsistent here.' },
        { minutes: 120, verse: '73–74', grade: 'S',
          label: 'Twelve transits in a day and night — 120 minutes',
          note: 'Twenty-four hours divided by twelve. The source calls this a ' +
                'reasonable approximation of the measured nasal cycle, and the ' +
                'zodiacal labels around it decoration.' }
      ]
    },

    /* --- Verse 50: Sushumna --------------------------------------------------- */
    sushumna: {
      ruleId: 'SS-50-b',
      verse: 50,
      applied: true,
      grade: 'E',
      source: SOURCE,
      section: 'Sushumna as the balanced state',
      statement: 'Sushumna is not a third channel of the same type but the state ' +
                 'in which the polarity is suspended — the changeover window.',
      commentary: 'The physiological reality of the window is not in question: ' +
                  'during changeover, congestion is shifting and lateral ' +
                  'asymmetry passes through a minimum. The further claim that ' +
                  'the window is unsuited to action and suited to contemplation ' +
                  'is coherent but tested at best suggestively.',
      predictable: false,
      predictionNote: 'The engine never predicts Sushumna from the clock. The ' +
                      'window is real but its timing is not derivable from date ' +
                      'and time, so a reported Sushumna is recorded and scored ' +
                      'as neither aligned nor misaligned.'
    },

    /* ======================================================================
       RULES THE TEXT STATES THAT THIS ENGINE DELIBERATELY DOES NOT APPLY
       Shown to the reader with the source's reason for rejecting them.
       ====================================================================== */

    notApplied: [
      {
        ruleId: 'SS-69-70',
        verse: '69–70',
        applied: false,
        grade: 'EN',
        section: 'Weekday and planetary assignment',
        sanskrit: 'guruśukrabudhendūnāṃ vāsare vāmanāḍikā',
        translation: 'On Thursday, Friday, Wednesday and Monday the left channel ' +
                     'yields success in all undertakings, particularly in the ' +
                     'waxing fortnight. On Sunday, Tuesday and Saturday the right ' +
                     'channel should be observed for active undertakings.',
        left: [1, 3, 4, 5],       // Mon, Wed, Thu, Fri  (JS getDay)
        right: [0, 2, 6],         // Sun, Tue, Sat
        reason: 'The source states plainly that nothing in verses 69 and 70 ' +
                'should be applied. Nasal dominance is not modulated by day of ' +
                'the week and no mechanism by which it could be has been ' +
                'proposed. The verse aligns two pre-existing classification ' +
                'schemes — benefic and malefic planets, cool and hot channels — ' +
                'and presents the alignment as discovery.'
      },
      {
        ruleId: 'SS-73-74',
        verse: '73–74',
        applied: false,
        grade: 'EN',
        section: 'The twelve zodiacal transits',
        translation: 'Taurus, Cancer, Virgo, Scorpio, Capricorn and Pisces belong ' +
                     'to the left channel; Aries, Leo, Aquarius, Libra, Gemini ' +
                     'and Sagittarius to the right.',
        reason: 'The zodiacal assignment is astrology with no physiological ' +
                'content — the standard even/odd division of the signs mapped ' +
                'onto the two channels. The usable part of these verses is the ' +
                'number twelve, which the engine offers as a period option.'
      },
      {
        ruleId: 'SS-68',
        verse: 68,
        applied: false,
        grade: 'EN',
        section: 'Left at dawn, right at dusk',
        translation: 'If the day begins with the left channel and ends with the ' +
                     'right, outcomes are favourable; the reverse should be avoided.',
        reason: 'The claim is inverted relative to the measured circadian ' +
                'profile of autonomic tone. Sympathetic activity and cortisol ' +
                'rise sharply before waking, and parasympathetic influence ' +
                'increases toward night. The source notes this verse is wrong ' +
                'but not category-mistaken — it is at least the kind of claim ' +
                'that could have been true.'
      },
      {
        ruleId: 'SS-64',
        verse: 64,
        applied: false,
        grade: 'EN',
        section: 'The abstention rule',
        translation: 'When the observed order is contrary to the expected, one ' +
                     'should refrain from undertaking action.',
        reason: 'Deliberately not implemented. This rule is unfalsifiable in ' +
                'structure: contrary observation is reinterpreted as an ' +
                'inauspicious condition rather than as evidence against the ' +
                'scheme, and outcomes are only tested when conditions are ' +
                'favourable, which censors the sample. This tool will never ' +
                'tell you not to act.'
      },
      {
        ruleId: 'SS-96',
        verse: 96,
        applied: false,
        grade: 'X',
        section: 'The void channel and the inversion rule',
        translation: 'When the channel is empty, the results previously described ' +
                     'are reversed.',
        reason: 'A logical closure device rather than an observation — a ' +
                'two-state model needs a rule for the complementary case and ' +
                'inversion is the simplest available. Worth knowing that the ' +
                '"empty" side is physiologically the busy one: the congested ' +
                'nostril is the site of active vascular engorgement.'
      }
    ],

    /* --- Verse 149: the daily observation ------------------------------------- */
    dailyObservation: {
      ruleId: 'SS-149',
      verse: 149,
      applied: true,
      grade: 'E',
      source: SOURCE,
      section: 'The daily observation',
      sanskrit: 'nirīkṣitavyaṃ yatnena sadā pratyūṣakālataḥ',
      translation: 'It should be examined carefully every day from daybreak.',
      statement: 'Anchor the observation to waking rather than to a clock time.',
      commentary: 'The source calls this the single most important practical ' +
                  'instruction in the book. Waking is the moment of the day\'s ' +
                  'largest routine autonomic transition, which makes it the most ' +
                  'informative single observation point; and anchoring a habit ' +
                  'to an unavoidable daily event is the strongest predictor of ' +
                  'whether self-monitoring survives past a fortnight.'
    },

    /* --- Verses 153-155: the mirror test -------------------------------------- */
    mirrorTest: {
      ruleId: 'SS-153-155',
      verse: '153–155',
      applied: true,
      grade: 'E',
      source: SOURCE,
      section: 'The mirror test and the direction of flow',
      sanskrit: 'darpaṇena samālokya tatra śvāsaṃ vinikṣipet',
      translation: 'Breathe onto a mirror and examine the shape formed. Earth ' +
                   'flows through the centre of the nostril, water downward, ' +
                   'fire upward, air obliquely, and space at the moment of ' +
                   'changeover.',
      statement: 'Breathe onto a cool mirror, or the back of your hand, and ' +
                 'compare the two patches. The larger patch marks the open side.',
      commentary: 'The measurement is real: exhaled air condenses on a cool ' +
                  'surface in a pattern determined by the geometry of the nasal ' +
                  'jet, which changes with congestion. This is the only external ' +
                  'instrument in the whole treatise and the tradition invented ' +
                  'it. The shape-to-element assignment is a separate matter — ' +
                  'those are yantra forms imported from iconography, and ' +
                  'condensation patches are ambiguous stimuli where expectation ' +
                  'dominates report.',
      gradeSplit: 'Comparing the two patches for size is graded E. Reading an ' +
                  'element from the shape is graded X and this tool does not do it.'
    },

    /* --- Verses 66-67: deliberate reversal ------------------------------------ */
    correction: {
      ruleId: 'SS-66-67',
      verse: '66–67',
      applied: true,
      grade: 'E',
      source: SOURCE,
      section: 'Deliberate reversal of dominance',
      sanskrit: 'sūryeṇa badhyate sūryaś candraś candreṇa badhyate',
      translation: 'One should check the left channel at night and the right by ' +
                   'day. Sun is bound by sun and moon by moon; whoever knows ' +
                   'this operation gains mastery in an instant.',
      statement: 'Nasal dominance is not merely readable but steerable.',
      commentary: 'One of the better-established propositions in the corpus. ' +
                  'Sustained pressure on the lateral chest wall or axilla shifts ' +
                  'congestion to the same side and opens the other, an effect ' +
                  'mediated by cutaneous pressure receptors modulating ' +
                  'sympathetic outflow — formalised in the tradition as the ' +
                  'yogadanda, the crutch-staff used to apply exactly this ' +
                  'pressure. Lying on one side does the same.'
    },

    /* --- Recorded contradictions --------------------------------------------- */
    contradictions: [
      {
        id: 'CONTRA-PERIOD',
        severity: 'high',
        title: 'The text gives three different periods and reconciles none',
        detail: 'Verse 72 read one way gives 60 minutes for all five phases. ' +
                'Read the other way — and other passages do read it that way — ' +
                'it gives 150 minutes. Verses 73–74 give twelve transits per ' +
                'day and night, which is 120 minutes. The recension is ' +
                'internally inconsistent and different manuscript traditions ' +
                'resolve it differently.',
        resolution: 'NOT RESOLVED. All three are offered as options with their ' +
                    'verse and grade. The default is 60 minutes because it is ' +
                    'the reading that makes verses 71 and 72 consistent with ' +
                    'each other, but 120 is the one closest to the measured cycle.'
      },
      {
        id: 'CONTRA-LUNAR',
        severity: 'high',
        title: 'The rule the engine runs on is graded as contradicted',
        detail: 'Verse 65 is the only rule in the text that predicts a specific ' +
                'channel from a date, so it is the only thing an expected-svara ' +
                'calculation can be built on. The source grades it E-negative.',
        resolution: 'NOT RESOLVED, and not resolvable in favour of the text. The ' +
                    'expected svara is shown as what the tradition predicts, ' +
                    'labelled with its grade. Disagreement between observation ' +
                    'and expectation is the interesting result, not an error.'
      },
      {
        id: 'CONTRA-TATTVA-ORDER',
        severity: 'medium',
        title: 'Tattva order differs from the widely circulated one',
        detail: 'Verse 71 gives air, fire, earth, water, with space implied ' +
                'fifth. Many circulating editions give earth, water, fire, air, ' +
                'space with durations of 20, 16, 12, 8 and 4 minutes.',
        resolution: 'NOT RESOLVED. The engine follows verse 71 as supplied, with ' +
                    'the equal 12-minute durations of verse 72.'
      }
    ],

    GRADES: GRADES
  };

  /* ==========================================================================
     4. DESCRIPTIVE DATA
     ========================================================================== */

  var SVARAS = {
    ida: {
      key: 'ida', side: 'left', name: 'Ida', sanskrit: 'इडा',
      label: 'Ida · left', luminary: 'Chandra · Moon',
      quality: 'cooling, receptive, conserving', colour: '#2E7FA8', glyph: 'moon'
    },
    pingala: {
      key: 'pingala', side: 'right', name: 'Pingala', sanskrit: 'पिङ्गला',
      label: 'Pingala · right', luminary: 'Surya · Sun',
      quality: 'heating, active, expending', colour: '#E4744F', glyph: 'sun'
    },
    sushumna: {
      key: 'sushumna', side: 'both', name: 'Sushumna', sanskrit: 'सुषुम्णा',
      label: 'Sushumna · both', luminary: 'The changeover window',
      quality: 'the polarity suspended', colour: '#C6A15B', glyph: 'both'
    }
  };

  /* Phase qualities from verse 155: the direction of the exhaled jet. */
  var TATTVAS = {
    vayu:    { key: 'vayu',    sanskrit: 'वायु',  name: 'Vayu',    english: 'Air',
               direction: 'oblique', colour: '#7FA88C', verse: 155 },
    agni:    { key: 'agni',    sanskrit: 'अग्नि', name: 'Agni',    english: 'Fire',
               direction: 'upward', colour: '#E4744F', verse: 155 },
    prithvi: { key: 'prithvi', sanskrit: 'पृथ्वी', name: 'Prithvi', english: 'Earth',
               direction: 'through the centre', colour: '#B08D57', verse: 155 },
    jala:    { key: 'jala',    sanskrit: 'जल',   name: 'Jala',    english: 'Water',
               direction: 'downward', colour: '#2E7FA8', verse: 155 },
    akasha:  { key: 'akasha',  sanskrit: 'आकाश', name: 'Akasha',  english: 'Space',
               direction: 'at the changeover', colour: '#8A7FA8', verse: 155 }
  };

  /**
   * Reversal methods, verses 66-67 and the verse 50 integration.
   * Each carries its own grade. None involves retention, forcing, or fast
   * breathing. To open a nostril you work on the OPPOSITE side.
   */
  function practiceFor(targetKey) {
    var target = SVARAS[targetKey];
    var open = target.side;                       // side to open
    var other = open === 'left' ? 'right' : 'left';

    return {
      target: targetKey,
      title: 'Shift toward ' + target.name,
      verse: '66–67',
      sanskrit: 'sūryeṇa badhyate sūryaś candraś candreṇa badhyate',
      methods: [
        {
          id: 'recline',
          grade: 'E',
          verse: '66–67',
          name: 'Lie on the ' + other + ' side',
          minutes: 8,
          steps: [
            'Lie down on your ' + other + ' side.',
            'Breathe normally. Change nothing about the breath.',
            'Stay for five to ten minutes.'
          ],
          note: 'Pressure on the lateral chest wall shifts congestion to the ' +
                'side you are lying on and opens the other. Reliable, immediate, ' +
                'and the effect you can verify on yourself.'
        },
        {
          id: 'axilla',
          grade: 'E',
          verse: '66–67',
          name: 'Pressure into the ' + other + ' armpit',
          minutes: 3,
          steps: [
            'Sit upright.',
            'Wedge a fist firmly under your ' + other + ' armpit.',
            'Hold steady pressure for two to three minutes, breathing normally.'
          ],
          note: 'The tradition formalised this as the yogadanda, a crutch-staff ' +
                'used to apply exactly this pressure. Cutaneous pressure ' +
                'receptors modulate sympathetic outflow to the nasal sinusoids.'
        },
        {
          id: 'unilateral',
          grade: 'S',
          verse: '50',
          name: 'Breathe through the ' + open + ' nostril',
          minutes: 4,
          steps: [
            'Sit upright and comfortably.',
            'Close the ' + other + ' nostril with light finger pressure.',
            'Breathe through the ' + open + ' nostril at a natural rate for ' +
              'three to five minutes.',
            'There is no holding and no forcing at any point.'
          ],
          note: 'Graded suggestive rather than established. Part of any effect ' +
                'may come from the attention and expectancy involved rather ' +
                'than from laterality. The source recommends testing it on ' +
                'yourself with an honest record.'
        },
        {
          id: 'paradoxical',
          grade: 'X',
          verse: '67',
          name: 'Drive the open side (untested)',
          minutes: 4,
          steps: [
            'Breathe through the nostril that is already open, not the blocked one.',
            'Keep it gentle and continue until you notice the sides change.'
          ],
          note: 'Verse 67 — sun is bound by sun, moon by moon — may describe ' +
                'driving a system further in the direction it is already going ' +
                'to trigger its compensatory reversal. Whether this reliably ' +
                'accelerates changeover has not been tested. The source calls ' +
                'it an obvious and cheap experiment.'
        }
      ]
    };
  }

  var PRACTICES = {
    ida: practiceFor('ida'),
    pingala: practiceFor('pingala')
  };

  /* ==========================================================================
     4. ASSESSMENT
     ========================================================================== */

  /** Expected tattva at a given point through the svara period. */
  function tattvaAt(minutesIntoSvara, periodMinutes) {
    var order = RULES.tattva.order;
    var durations = RULES.tattva.durations;

    // Verse 72 gives 12 minutes per phase inside a 60-minute period. If a
    // different period is selected the figures are scaled proportionally and
    // the UI says so, rather than silently keeping 12.
    var stated = durations.reduce(function (a, b) { return a + b; }, 0);
    if (Math.abs(stated - periodMinutes) > 0.01) {
      var k = periodMinutes / stated;
      durations = durations.map(function (d) { return d * k; });
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
        correctivePractice: null, flags: flags, weakestGrade: null,
        notApplied: RULES.notApplied, contradictions: RULES.contradictions,
        grades: GRADES
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

    /* --- Rule 1, verse 65: the expected svara at sunrise ------------------ */
    var sunriseResult = RULES.sunriseSvara.evaluate(t);
    provenance.push(rule(RULES.sunriseSvara, 'Expected svara from the lunar fortnight'));

    explanation.push(
      'The svarodaya day began at sunrise, ' + formatTime(day.sunrise) +
      '. The lunar day is ' + t.displayName + ' of ' +
      (t.paksha === 'shukla' ? 'Shukla' : 'Krishna') + ' Paksha. Verse 65 ' +
      'assigns the whole of ' + (t.paksha === 'shukla' ? 'Shukla' : 'Krishna') +
      ' Paksha to the ' + (sunriseResult.svara === 'ida' ? 'left' : 'right') +
      ' channel, so the expected svara at sunrise was ' +
      SVARAS[sunriseResult.svara].name + '.'
    );

    /* --- Rule 2, verses 72 / 73-74: the alternation period ---------------- */
    var period = RULES.alternation.periodMinutes;
    var turns = Math.floor(minsSinceSunrise / period);
    var minsIntoSvara = minsSinceSunrise - turns * period;

    var expectedKey = (turns % 2 === 0)
      ? sunriseResult.svara
      : (sunriseResult.svara === 'ida' ? 'pingala' : 'ida');

    var chosen = RULES.alternation.options.filter(function (o) {
      return o.minutes === period;
    })[0] || RULES.alternation.options[0];

    provenance.push(rule(RULES.alternation, 'Alternation period', {
      grade: chosen.grade,
      verse: chosen.verse,
      extra: chosen.label + '. ' + chosen.note
    }));

    explanation.push(
      'It is now ' + Math.floor(minsSinceSunrise) + ' minutes past sunrise. ' +
      'At one turn every ' + period + ' minutes that is ' + turns +
      ' turn' + (turns === 1 ? '' : 's') + ', giving ' +
      SVARAS[expectedKey].name + ', ' + Math.floor(minsIntoSvara) +
      ' minutes into its period.'
    );

    /* --- Rule 3, verses 71-72: the tattva sequence ------------------------ */
    var tv = tattvaAt(minsIntoSvara, period);

    provenance.push(rule(RULES.tattva, 'Tattva sequence and timing'));

    var scaled = period !== 60;
    explanation.push(
      'Within one period the phases run ' +
      RULES.tattva.order.map(function (k) { return TATTVAS[k].name; }).join(' → ') +
      ' (verse 71). Verse 72 gives twelve minutes each' +
      (scaled
        ? ', but you have selected a ' + period + '-minute period, so the ' +
          'twelve-minute figure has been scaled to ' +
          Math.round(period / 5) + ' minutes per phase'
        : '') +
      '. That places the present moment in ' + tv.current.tattva.name +
      ', whose exhaled jet the text describes as flowing ' +
      tv.current.tattva.direction + ' (verse 155).'
    );

    /* --- Alignment -------------------------------------------------------- */
    var alignment;
    if (!observed) {
      alignment = 'unreported';
    } else if (observed === 'sushumna') {
      alignment = 'sushumna';
      provenance.push(rule(RULES.sushumna, 'Sushumna is scored separately'));
      explanation.push(
        'You reported both sides, or rapid changing. Verse 50 defines Sushumna ' +
        'not as a third channel but as the state in which the polarity is ' +
        'suspended — the changeover window. The engine never predicts it from ' +
        'the clock, so this is recorded rather than scored.'
      );
    } else {
      alignment = (observed === expectedKey) ? 'aligned' : 'misaligned';
    }

    /* --- Correction, verses 66-67 ----------------------------------------- */
    var practice = null;
    if (alignment === 'misaligned') {
      practice = PRACTICES[expectedKey];
      provenance.push(rule(RULES.correction, 'Deliberate reversal of dominance'));
    }

    /* --- The weakest link in the chain ------------------------------------ */
    var order = { EN: 0, X: 1, S: 2, E: 3 };
    var weakest = provenance.reduce(function (acc, p) {
      return order[p.grade] < order[acc] ? p.grade : acc;
    }, 'E');

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
      notApplied: RULES.notApplied,
      contradictions: RULES.contradictions,
      explanation: explanation,
      correctivePractice: practice,
      flags: flags,
      weakestGrade: weakest,
      grades: GRADES
    };
  }

  /** Build a provenance entry from a rule, carrying its verse and grade. */
  function rule(r, title, over) {
    over = over || {};
    return {
      ruleId: r.ruleId,
      title: title,
      grade: over.grade || r.grade,
      verse: over.verse || r.verse,
      section: r.section,
      sanskrit: r.sanskrit || null,
      translation: r.translation || null,
      detail: r.statement,
      commentary: (over.extra ? over.extra + ' ' : '') + (r.commentary || ''),
      source: r.source || SOURCE
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
    GRADES: GRADES,
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
    /** Select one of the three periods the text gives. Returns the option. */
    setPeriod: function (minutes) {
      var opt = RULES.alternation.options.filter(function (o) {
        return o.minutes === Number(minutes);
      })[0];
      if (opt) RULES.alternation.periodMinutes = opt.minutes;
      return opt || null;
    },
    /** Verses 69-70, stated for display only. Never drives the assessment. */
    weekdayRule: function (date) {
      var r = RULES.notApplied.filter(function (x) { return x.ruleId === 'SS-69-70'; })[0];
      var d = date.getDay();
      return {
        rule: r,
        channel: r.left.indexOf(d) > -1 ? 'ida' : 'pingala',
        applied: false
      };
    },
    get sourceMode() { return sourceMode; },
    set sourceMode(v) { sourceMode = v; },
    calculateNasalDominance: calculateNasalDominance,
    version: '2.0.0'
  };

}(typeof window !== 'undefined' ? window : globalThis));
