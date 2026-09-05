/* ============================================================================
   svara-knowledge.js
   Three things, all sourced to the Siva Svarodaya via The Respiratory Codex:

     1. TATTVA_SIGNS  - the eightfold observation scheme of verses 145-147,
                        disaggregated into dimensions you can check and
                        dimensions you can only report. The source is explicit
                        that these must be recorded separately and never
                        allowed to vouch for each other.
     2. PRANAYAMA     - the breath practices the text actually contains, each
                        with its verse, its evidential grade, and its
                        contraindications.
     3. Search        - retrieval over the full commentary. Answers are
                        passages from the book, ranked; nothing is generated.
   ============================================================================ */

(function (root) {
  'use strict';

  /* ==========================================================================
     1. THE EIGHTFOLD SCHEME — verses 145-147
     ========================================================================== */

  var DIMENSIONS = [
    {
      key: 'reach', order: 1, verifiable: true, grade: 'E', verse: 158,
      name: 'Reach of the exhalation',
      sanskrit: 'aṣṭāṅgulaṃ vahed vāyur analaś caturaṅgulam',
      how: 'Hold the back of your hand in front of the nostrils and move it ' +
           'away until you can no longer feel the breath. Note the distance in ' +
           'finger-breadths — an aṅgula is about three quarters of an inch.',
      why: 'This is the only genuinely quantitative measurement protocol in the ' +
           'whole treatise. Exhalation reach is a crude measure of peak ' +
           'expiratory flow, which is real, varies through the day, and can be ' +
           'disagreed about and checked between observers.',
      unit: 'aṅgula',
      values: { vayu: 8, agni: 4, prithvi: 12, jala: 16, akasha: null },
      caution: 'Verse 158 assigns fire the shortest reach and water the longest, ' +
               'which is inverted relative to how the same phases are described ' +
               'elsewhere in the text. The source flags this as a real internal ' +
               'tension that no commentary resolves.'
    },
    {
      key: 'direction', order: 2, verifiable: true, grade: 'E', verse: 155,
      name: 'Direction of the jet',
      sanskrit: 'madhye pṛthvī hy adhaś cāpaś cordhvaṃ vahati cānalaḥ',
      how: 'Breathe out onto a cool mirror held just below the nose, or onto ' +
           'the back of your hand. Notice where the air actually lands: ' +
           'straight ahead, downward, upward, or off to one side.',
      why: 'Nasal exhalation produces a directed jet whose orientation is set ' +
           'by the anatomy of the nasal valve and by flow rate, both of which ' +
           'change with congestion. Confirmed by schlieren imaging of exhaled ' +
           'airflow.',
      values: {
        vayu: 'oblique, off to one side',
        agni: 'upward',
        prithvi: 'straight out through the centre',
        jala: 'downward',
        akasha: 'diffuse, at the changeover'
      },
      caution: 'Jet direction is dominated by your fixed anatomy — septum and ' +
               'nasal valve shape — far more than by any passing state. ' +
               'Between-person variation exceeds within-person variation, so ' +
               'compare yourself against yourself, never against someone else.'
    },
    {
      key: 'dominance', order: 3, verifiable: true, grade: 'E', verse: 153,
      name: 'Which side is open',
      sanskrit: 'darpaṇena samālokya tatra śvāsaṃ vinikṣipet',
      how: 'Breathe out onto a cool mirror and compare the two patches of ' +
           'condensation. The larger patch marks the open side.',
      why: 'The only external instrument in the treatise, and the tradition ' +
           'invented it. Exhaled air is saturated at body temperature and ' +
           'condenses on a cooler surface in a pattern set by the jet geometry.',
      values: {
        vayu: null, agni: null, prithvi: null, jala: null,
        akasha: 'both patches nearly equal — the changeover'
      },
      caution: 'Comparing the two patches for size is sound. Reading an element ' +
               'from the shape of the patch is not: square, crescent, triangle ' +
               'and circle are yantra forms imported from iconography, and a ' +
               'condensation patch is exactly the ambiguous stimulus where ' +
               'expectation writes the answer.'
    },
    {
      key: 'juncture', order: 4, verifiable: true, grade: 'E', verse: 146,
      name: 'Junctures of the breath',
      sanskrit: 'dvitīye śvāsasandhayaḥ',
      how: 'Count your breaths for one minute, and notice the pauses at the top ' +
           'and bottom of each breath — whether they are long or barely there.',
      why: 'Rate and the length of the natural pauses are countable, and they ' +
           'track autonomic state directly through respiratory sinus arrhythmia.',
      values: {
        vayu: 'irregular, uneven pauses',
        agni: 'quick, short pauses',
        prithvi: 'steady and even',
        jala: 'slow, with a longer pause after the out-breath',
        akasha: 'unsettled, hard to characterise'
      },
      caution: 'The rate and the pauses are countable. Which phase they indicate ' +
               'is the text\'s claim, not a measured fact.'
    },
    {
      key: 'taste', order: 5, verifiable: false, grade: 'S', verse: 157,
      name: 'Taste in the mouth',
      sanskrit: 'māheyaṃ madhuraṃ svāde kaṣāyaṃ jalam eva ca',
      how: 'Without eating or drinking, notice the resting taste of your own ' +
           'mouth, and whether it is wet or dry.',
      why: 'There is a real signal here. Saliva composition and flow are under ' +
           'autonomic control — sympathetic drive gives a smaller volume of ' +
           'thicker, protein-rich saliva, parasympathetic a larger watery one. ' +
           'Your mouth genuinely tastes different in different states, most ' +
           'obviously as the dry mouth of acute stress.',
      values: {
        prithvi: 'sweet', jala: 'astringent', agni: 'pungent',
        vayu: 'sour', akasha: 'bitter'
      },
      caution: 'That resting oral sensation varies with autonomic state is well ' +
               'supported. That it partitions into these five classical rasa ' +
               'categories is not, and no evidence supports the specific ' +
               'assignments. Dry mouth alone is the reliable part.'
    },
    {
      key: 'location', order: 6, verifiable: false, grade: 'X', verse: 156,
      name: 'Location in the body',
      sanskrit: 'skandhadvaye sthito vahnir nābhimūle prabhañjanaḥ',
      how: 'Sweep attention through five points in order — feet, knees, navel, ' +
           'shoulders, head — spending about twenty seconds at each.',
      why: 'Use this as a structured body scan, not as a diagnosis. The value ' +
           'is entirely in the structuring of attention; a fixed sequence of ' +
           'bodily locations is what makes a scan repeatable.',
      values: {
        jala: 'feet', prithvi: 'knees', vayu: 'root of the navel',
        agni: 'shoulders', akasha: 'head'
      },
      caution: 'There is no defensible physiological reading. The locations do ' +
               'not correspond to autonomic territories or to referred ' +
               'sensation. The ordering is schematic — heaviest lowest, ' +
               'subtlest highest — not observed.'
    },
    {
      key: 'colour', order: 7, verifiable: false, grade: 'X', verse: '151–152',
      name: 'Colour in the closed field',
      sanskrit: 'āpaḥ śvetam kṣitiḥ pītā raktavarṇo hutāśanaḥ',
      how: 'Sit, close the eyes, and rest the fingers lightly over the closed ' +
           'lids and the ears — with no pressure on the eyeballs. Stay three to ' +
           'five minutes and note what colours appear.',
      why: 'The phenomenon is real and reliably reproducible. Removing patterned ' +
           'visual input produces endogenous colour and form in healthy ' +
           'observers within minutes — the Ganzfeld effect. Visual cortex does ' +
           'not fall silent when input is withdrawn; the spontaneous activity ' +
           'that remains is read downstream as signal.',
      values: {
        prithvi: 'yellow', jala: 'white', agni: 'red',
        vayu: 'dark, like a storm cloud', akasha: 'all colours mixed'
      },
      caution: 'The observation is correct and the diagnostic claim almost ' +
               'certainly false. There is no mechanism by which respiratory ' +
               'phase would set the colour of endogenous visual activity, and ' +
               'a practitioner who has been taught which colour means which ' +
               'phase will see that colour. If you want to test it, determine ' +
               'the phase by the measurable dimensions AFTER the observation, ' +
               'never before.',
      safety: 'Do not press on the eyeballs. Sustained pressure raises ' +
              'intraocular pressure and can trigger the oculocardiac reflex. ' +
              'Skip this entirely if you have glaucoma, retinal disease, high ' +
              'myopia, or recent eye surgery.'
    }
  ];

  var TATTVA_SIGNS = {
    scheme: {
      verse: '145–147',
      sanskrit: 'prathame tattvasaṅkhyānaṃ dvitīye śvāsasandhayaḥ',
      translation: 'Hear the eightfold analysis: first their enumeration, second ' +
                   'the junctures of the breath, third the signs of the breath, ' +
                   'fourth their location, fifth their colours, sixth the vital ' +
                   'force, seventh their associated tastes, and eighth the ' +
                   'characteristics of their movement.',
      method: 'A factorial description matrix — every phase gets a value on ' +
              'every dimension. The source calls this a genuinely sophisticated ' +
              'instrument for a text of this period, with one flaw: it mixes ' +
              'dimensions you can check against dimensions you cannot, and does ' +
              'not mark the difference. This tool marks it.',
      discipline: 'Record the measurable and the reported separately. If the ' +
                  'self-report dimensions turn out to track the measured ones, ' +
                  'that is a finding. If they do not, that is a more important ' +
                  'finding, and a merged instrument would have hidden it.'
    },
    dimensions: DIMENSIONS,
    verifiable: DIMENSIONS.filter(function (d) { return d.verifiable; }),
    reported: DIMENSIONS.filter(function (d) { return !d.verifiable; })
  };

  /**
   * Score the five phases against what the person observed.
   * Measured dimensions carry weight; reported ones are shown but scored zero,
   * so the unverifiable answers can never drive the result.
   */
  function scoreTattva(answers) {
    var keys = ['vayu', 'agni', 'prithvi', 'jala', 'akasha'];
    var scores = {}, contributions = {};
    keys.forEach(function (k) { scores[k] = 0; contributions[k] = []; });

    DIMENSIONS.forEach(function (d) {
      var a = answers[d.key];
      if (a == null || a === '') return;

      keys.forEach(function (k) {
        var expected = d.values[k];
        if (expected == null) return;
        var hit = false;

        if (d.key === 'reach') {
          // Nearest stated reach wins, tolerance of 2 angulas.
          hit = Math.abs(Number(a) - expected) <= 2;
        } else {
          hit = String(a) === k;
        }

        if (hit) {
          contributions[k].push({
            dimension: d.name, verifiable: d.verifiable, grade: d.grade, verse: d.verse
          });
          if (d.verifiable) scores[k] += 1;      // only measurable evidence counts
        }
      });
    });

    var ranked = keys.map(function (k) {
      return { key: k, score: scores[k], support: contributions[k] };
    }).sort(function (a, b) { return b.score - a.score; });

    var measuredAnswered = DIMENSIONS.filter(function (d) {
      return d.verifiable && answers[d.key] != null && answers[d.key] !== '';
    }).length;

    return {
      ranked: ranked,
      best: ranked[0].score > 0 ? ranked[0] : null,
      tie: ranked.length > 1 && ranked[0].score === ranked[1].score && ranked[0].score > 0,
      measuredAnswered: measuredAnswered,
      note: measuredAnswered === 0
        ? 'You answered only on the reported dimensions. Those are recorded but ' +
          'not scored, so no phase can be indicated. Measure the reach or check ' +
          'the jet direction to get a result.'
        : null
    };
  }

  /* ==========================================================================
     2. PRANAYAMA
     Only practices the text actually contains, each with its verse and grade.
     Breath retention is deliberately absent — see RETENTION_NOTE.
     ========================================================================== */

  var RETENTION_NOTE = {
    title: 'Why there is no breath retention here',
    body: 'The source is direct about this. Forceful retention combined with ' +
          'strong abdominal or pelvic pressure reproduces the haemodynamics of ' +
          'a Valsalva manoeuvre and can cause substantial transient swings in ' +
          'blood pressure and cerebral perfusion. Reports of adverse events ' +
          'from aggressive retention are not rare enough to ignore. Anyone with ' +
          'uncontrolled hypertension, glaucoma, retinal disease, a history of ' +
          'cardiac arrhythmia, or who is pregnant should not perform retention ' +
          'without medical advice. The traditional insistence that these be ' +
          'learned under supervision was sound risk management, not gatekeeping. ' +
          'A web page is not supervision, so the retention practices are named ' +
          'and not taught here.',
    grade: 'E'
  };

  var PRANAYAMA = [
    {
      id: 'hamsa',
      name: 'Hamsa observation',
      sanskrit: 'haṃsa',
      verse: 50,
      grade: 'E',
      minutes: 12,
      purpose: 'settle',
      effect: 'Trains the detection of attentional lapse and the re-orienting ' +
              'of attention.',
      steps: [
        'Sit with the mouth closed.',
        'Attend to the sound and sensation of air at the nostrils.',
        'Do not alter the breath in any way.',
        'When attention departs — it will, repeatedly — return it without ' +
          'commentary.'
      ],
      note: 'The source calls this the intervention with the strongest support ' +
            'in the whole text, and its mechanism the least exotic. What is ' +
            'trained is not relaxation but the noticing of lapse, repeated ' +
            'across thousands of trials. Sustained attention to the breath is ' +
            'associated with reduced default-mode network activity in the ' +
            'medial prefrontal cortex and posterior cingulate.',
      pacer: false
    },
    {
      id: 'chandra',
      name: 'Left-nostril breathing',
      sanskrit: 'candra svara',
      verse: 50,
      grade: 'S',
      minutes: 4,
      purpose: 'cool',
      target: 'ida',
      effect: 'Toward lower physiological arousal.',
      steps: [
        'Sit upright and comfortably.',
        'Close the right nostril with light finger pressure.',
        'Breathe through the left nostril at a natural rate.',
        'No holding, no forcing, no counting.'
      ],
      note: 'Right-nostril breathing has been reported to raise heart rate, ' +
            'blood pressure and oxygen consumption relative to left, and left ' +
            'the reverse. The findings come predominantly from small studies, ' +
            'several from a limited number of laboratories, with inconsistent ' +
            'replication and modest effect sizes. Part of any effect may come ' +
            'from the attention and expectancy involved rather than from ' +
            'laterality as such.',
      pacer: false
    },
    {
      id: 'surya',
      name: 'Right-nostril breathing',
      sanskrit: 'sūrya svara',
      verse: 50,
      grade: 'S',
      minutes: 4,
      purpose: 'warm',
      target: 'pingala',
      effect: 'Toward higher physiological arousal.',
      steps: [
        'Sit upright and comfortably.',
        'Close the left nostril with light finger pressure.',
        'Breathe through the right nostril at a natural rate.',
        'No holding, no forcing, no counting.'
      ],
      note: 'Same evidence base as the left-side practice, and the same caveat. ' +
            'If you are already agitated, this is the wrong direction.',
      pacer: false
    },
    {
      id: 'ujjayi',
      name: 'Ujjayi — the narrowed glottis',
      sanskrit: 'ujjāyī',
      verse: '42–45',
      grade: 'E',
      minutes: 6,
      purpose: 'settle',
      effect: 'Extends the out-breath and amplifies the vagal component of ' +
              'respiratory sinus arrhythmia. Measured effects on heart-rate ' +
              'variability are consistent and reproducible.',
      steps: [
        'Close the mouth and breathe through the nose.',
        'Narrow the throat very slightly, as if fogging a window with the mouth shut.',
        'Let the out-breath become long and quietly audible.',
        'Keep it gentle — a soft ocean sound, never a strain.'
      ],
      note: 'The text places a distinct control principle, udana, at the throat. ' +
            'That is the one region where a normally involuntary process is ' +
            'subject to very high voluntary override, and where the vagus is ' +
            'most accessible to voluntary influence. The tradition concentrated ' +
            'technique at a real high-leverage point, whatever theory it offered.',
      pacer: true,
      inhale: 4, exhale: 8
    },
    {
      id: 'humming',
      name: 'Humming exhalation',
      sanskrit: 'bhrāmarī-type vocalisation',
      verse: '42–45',
      grade: 'E',
      minutes: 5,
      purpose: 'settle',
      effect: 'Lengthens exhalation and raises nasal nitric oxide output ' +
              'substantially.',
      steps: [
        'Breathe in gently through the nose.',
        'Hum on the way out, lips closed, until the breath runs out comfortably.',
        'Keep the volume low. There is no need to strain the voice.'
      ],
      note: 'The nitric oxide finding is well established; what it means ' +
            'functionally for paranasal sinus ventilation is still being ' +
            'characterised. The exhalation-lengthening effect on heart-rate ' +
            'variability is the better-supported reason to do it.',
      pacer: true,
      inhale: 3, exhale: 7
    },
    {
      id: 'recline',
      name: 'Lateral recline',
      sanskrit: 'from verses 66–67',
      verse: '66–67',
      grade: 'E',
      minutes: 8,
      purpose: 'switch',
      effect: 'Shifts nasal dominance to the opposite side.',
      steps: [
        'Lie on the side OPPOSITE the nostril you want to open.',
        'Breathe normally. Change nothing.',
        'Stay five to ten minutes.'
      ],
      note: 'Pressure on the lateral chest wall shifts congestion to the side ' +
            'you are lying on and opens the other, through cutaneous pressure ' +
            'receptors modulating sympathetic outflow to the nasal sinusoids. ' +
            'Reliable, immediate and verifiable on yourself in minutes.',
      pacer: false
    },
    {
      id: 'yogadanda',
      name: 'Axillary pressure — the yogadanda',
      sanskrit: 'yogadaṇḍa',
      verse: '66–67',
      grade: 'E',
      minutes: 3,
      purpose: 'switch',
      effect: 'Opens the nostril on the side opposite the pressure.',
      steps: [
        'Sit upright.',
        'Wedge a fist firmly into the armpit OPPOSITE the nostril you want to open.',
        'Hold steady pressure for two to three minutes, breathing normally.'
      ],
      note: 'The tradition formalised this as a crutch-staff used to apply ' +
            'exactly this pressure, which tells you the effect was known and ' +
            'relied upon. The fastest of the switching methods.',
      pacer: false
    },
    {
      id: 'paradoxical',
      name: 'Driving the open side',
      sanskrit: 'sūryeṇa badhyate sūryaḥ',
      verse: 67,
      grade: 'X',
      minutes: 4,
      purpose: 'switch',
      effect: 'Claimed to trigger a compensatory reversal. Untested.',
      steps: [
        'Breathe through the nostril that is ALREADY open, not the blocked one.',
        'Keep it gentle and continue until you notice the sides change.'
      ],
      note: 'Sun is bound by sun, moon by moon. The most coherent reading is ' +
            'driving a system further in the direction it is already going to ' +
            'trigger its own reversal. Whether this reliably accelerates ' +
            'changeover has never been directly tested. The source calls it an ' +
            'obvious and cheap experiment — so treat it as one, and record the ' +
            'result honestly either way.',
      pacer: false
    },
    {
      id: 'shanmukhi',
      name: 'Shanmukhi — closing the six gates',
      sanskrit: 'ṣaṇmukhī mudrā',
      verse: '150–152',
      grade: 'E',
      minutes: 4,
      purpose: 'observe',
      effect: 'Produces endogenous colour and form in the closed visual field ' +
              'within minutes.',
      steps: [
        'Sit and close the eyes.',
        'Rest the thumbs lightly on the tragus of each ear to close the canals.',
        'Rest index and middle fingers on the closed lids WITHOUT pressure.',
        'Remaining fingers alongside the nose and at the corners of the mouth.',
        'Breathe normally through the nose. Observe without trying to classify.'
      ],
      note: 'The tradition preserved a reliable method for producing a ' +
            'psychological effect that Western psychology did not investigate ' +
            'systematically until the twentieth century — and preserved it ' +
            'inside a diagnostic claim that is almost certainly false. Do it ' +
            'for what it demonstrates about how perception is constructed, not ' +
            'to read your tattva off the colours.',
      safety: 'No pressure on the eyeballs at any point. Skip entirely if you ' +
              'have glaucoma, retinal disease, high myopia or recent eye ' +
              'surgery. Stop at once for pain, unusual visual disturbance or ' +
              'light-headedness. The traditional version includes retention; ' +
              'that is unnecessary and adds risk, so it is omitted.',
      pacer: false
    },
    {
      id: 'scan',
      name: 'The five-point scan',
      sanskrit: 'from verse 156',
      verse: 156,
      grade: 'X',
      minutes: 2,
      purpose: 'observe',
      effect: 'Structures attention across the vertical extent of the body.',
      steps: [
        'Feet. Knees. Root of the navel. Shoulders. Head.',
        'About twenty seconds at each, in that order.',
        'Notice what is there. Do not try to find anything in particular.'
      ],
      note: 'The bodily locations verse 156 assigns to the five phases have no ' +
            'defensible physiological reading — the ordering is schematic, ' +
            'heaviest lowest and subtlest highest. What survives is the ' +
            'sequence itself: a fixed order of locations is what makes a body ' +
            'scan repeatable, and the structuring is what does the work.',
      pacer: false
    }
  ];

  function pranayamaFor(purpose) {
    return PRANAYAMA.filter(function (p) { return p.purpose === purpose; });
  }

  function pranayamaToward(svaraKey) {
    return PRANAYAMA.filter(function (p) {
      return p.purpose === 'switch' || p.target === svaraKey;
    });
  }

  /* ==========================================================================
     3. SEARCH OVER THE COMMENTARY
     BM25 over the 51 verse sections. Retrieval, not generation: every answer
     is a passage from the book with its verse number attached.
     ========================================================================== */

  var STOP = ('a an and are as at be but by for from has have how i if in into is ' +
    'it its of on or that the this to was what when where which who why will with ' +
    'do does did can could should would my me you your').split(' ');

  var index = null;

  /**
   * Curated concept map. Retrieval alone puts "pranayama for anxiety" on a
   * verse about prediction, because the word "pranayama" barely appears in a
   * book that calls it something else. These are hand-authored routes from
   * how people ask to where the answer lives. Curation of the index, not
   * invention of content — every target is a real section of the book.
   */
  var CONCEPTS = [
    { terms: ['what', 'define', 'definition', 'meaning', 'means', 'explain',
              'introduction', 'about', 'overview', 'basics', 'beginner'],
      with: ['svara', 'yoga', 'svarodaya', 'shiva', 'text', 'book', 'system',
             'tradition', 'this', 'nasal', 'cycle'],
      verses: [null, 'INTRO-nasal'] },
    { terms: ['nasal', 'cycle', 'physiology', 'physiological', 'real', 'proven',
              'congestion', 'turbinate', 'autonomic'],
      verses: ['INTRO-nasal', null] },
    { terms: ['evidence', 'grade', 'graded', 'reliable', 'trust', 'proof',
              'scientific', 'science', 'valid'],
      verses: [null] },
    { terms: ['switch', 'change', 'reverse', 'shift', 'open', 'unblock', 'steer', 'force'],
      with: ['nostril', 'side', 'svara', 'nadi', 'dominance', 'channel'],
      verses: ['66–67', '50'] },
    { terms: ['tattva', 'element', 'phase', 'identify', 'know', 'check', 'detect', 'observe', 'tell'],
      verses: ['145–148', '150–152', '153–155', '156–158', '71–72'] },
    { terms: ['pranayama', 'practice', 'technique', 'exercise', 'anxiety',
              'calm', 'stress', 'relax', 'arousal', 'panic'],
      verses: ['50', '42–45', '66–67'] },
    { terms: ['retention', 'kumbhaka', 'hold', 'holding', 'safe', 'safety', 'danger',
              'risk', 'bandha', 'contraindication'],
      verses: ['40', '150–152'] },
    { terms: ['sushumna', 'transition', 'changeover', 'both', 'balanced', 'middle'],
      verses: ['50', '41', '124–125'] },
    { terms: ['moon', 'lunar', 'tithi', 'paksha', 'fortnight', 'waxing', 'waning'],
      verses: ['65', '68–70'] },
    { terms: ['weekday', 'planet', 'monday', 'thursday', 'astrology', 'zodiac', 'day'],
      verses: ['68–70', '73–74'] },
    { terms: ['long', 'period', 'hour', 'duration', 'timing', 'often', 'minutes', 'cycle'],
      verses: ['71–72', '73–74'] },
    { terms: ['mirror', 'measure', 'measurement', 'reach', 'distance', 'angula', 'quantitative'],
      verses: ['153–155', '156–158', '220–223'] },
    { terms: ['morning', 'waking', 'daybreak', 'daily', 'routine', 'habit', 'log', 'track'],
      verses: ['149', '64'] },
    { terms: ['sleep', 'sleeping', 'posture', 'night', 'digestion', 'eating', 'meal'],
      verses: ['122–123'] },
    { terms: ['left', 'right', 'ida', 'pingala', 'lateral', 'brain', 'hemisphere'],
      verses: ['50', '38'] }
  ];

  /**
   * Additive, not multiplicative. A concept route has to be able to surface a
   * section that shares no literal word with the question — which is the whole
   * point, since "pranayama for anxiety" contains neither word the book uses.
   */
  function conceptBonus(rec, q) {
    var bonus = 0;
    CONCEPTS.forEach(function (c) {
      var hit = c.terms.some(function (t) { return q.indexOf(t) > -1; });
      if (hit && c.with) {
        hit = c.with.some(function (t) { return q.indexOf(t) > -1; });
      }
      if (!hit) return;
      var i = c.verses.indexOf(rec.v);
      if (i > -1) bonus += 12 - i * 1.5;      // earlier in the list ranks higher
    });
    return bonus;
  }

  /**
   * IAST to plain ASCII the way an English speaker would type it.
   * Without this, "sushumna" never matches "suṣumnā" — the retrocflex s folds
   * to a bare "s", not "sh". Same for ṣaṇmukhī, prāṇāyāma, and most of the
   * vocabulary anyone would actually search for.
   */
  function translit(s) {
    return String(s).toLowerCase()
      .replace(/[śṣ]/g, 'sh')
      .replace(/ñ/g, 'ny').replace(/[ṅṇ]/g, 'n')
      .replace(/ṭ/g, 't').replace(/ḍ/g, 'd')
      .replace(/ṃ/g, 'm').replace(/ḥ/g, 'h')
      .replace(/ṛ/g, 'ri').replace(/ḷ/g, 'l')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* Common spellings folded to one form, so "shivasvarodaya", "swara" and
     "pranayam" all reach the same documents. */
  var SYNONYM = {
    swara: 'svara', swar: 'svara', suara: 'svara',
    sushumna: 'sushumna', susumna: 'sushumna',
    ida: 'ida', eda: 'ida',
    pingla: 'pingala', pingalla: 'pingala',
    pranayam: 'pranayama', pranayama: 'pranayama',
    nostrils: 'nostril', breaths: 'breath', breathing: 'breath',
    tattvas: 'tattva', tatva: 'tattva', tattwa: 'tattva',
    nadis: 'nadi', nadees: 'nadi',
    anxious: 'anxiety', anxiousness: 'anxiety',
    sleeping: 'sleep', digest: 'digestion', digesting: 'digestion'
  };

  function tokenize(s) {
    return translit(s)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map(function (w) { return SYNONYM[w] || w; })
      .filter(function (w) { return w.length > 2 && STOP.indexOf(w) === -1; });
  }

  /** Strip the markdown the commentary is written in, for clean display. */
  function clean(t) {
    return String(t || '')
      .replace(/\*\*\[[^\]]+\]\*\*/g, '')          // grades are shown as badges, not inline
      .replace(/\*\*/g, '')
      .replace(/(^|[\s(])\*([^*]+)\*/g, '$1$2')      // italics
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildIndex(corpus) {
    var docs = corpus.map(function (r, i) {
      // Title and translation are weighted by repetition.
      var text = [r.t, r.t, r.t, r.f, r.f, r.i, r.a, r.m].join(' ');
      var toks = tokenize(text);
      var tf = {};
      toks.forEach(function (w) { tf[w] = (tf[w] || 0) + 1; });
      return { i: i, tf: tf, len: toks.length, rec: r };
    });

    var df = {};
    docs.forEach(function (d) {
      Object.keys(d.tf).forEach(function (w) { df[w] = (df[w] || 0) + 1; });
    });

    var avg = docs.reduce(function (a, d) { return a + d.len; }, 0) / docs.length;
    return { docs: docs, df: df, avg: avg, N: docs.length };
  }

  function search(query, limit) {
    if (!index) {
      if (!root.SVARA_CORPUS) return null;      // corpus not loaded yet
      index = buildIndex(root.SVARA_CORPUS);
    }
    var q = tokenize(query);
    if (!q.length) return [];

    // Title terms are what a question is usually aiming at, so a title hit
    // outweighs an incidental mention buried in a commentary paragraph.
    function titleBoost(rec) {
      var t = tokenize(rec.t + ' ' + rec.f);
      var hits = q.filter(function (w) { return t.indexOf(w) > -1; }).length;
      return 1 + 0.55 * hits;
    }

    var k1 = 1.5, b = 0.75;
    var scored = index.docs.map(function (d) {
      var s = 0, matched = [];
      q.forEach(function (w) {
        var f = d.tf[w];
        if (!f) return;
        var idf = Math.log(1 + (index.N - index.df[w] + 0.5) / (index.df[w] + 0.5));
        s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / index.avg));
        matched.push(w);
      });
      return {
        rec: d.rec,
        kw: s * titleBoost(d.rec),
        bonus: conceptBonus(d.rec, q),
        matched: matched
      };
    });

    // BM25 magnitudes vary with query length, so a raw score is not comparable
    // to a fixed concept bonus. Normalise the keyword component to 0-10 first,
    // then add the routing bonus on the same scale.
    var maxKw = scored.reduce(function (m, r) { return Math.max(m, r.kw); }, 0);
    scored.forEach(function (r) {
      r.score = (maxKw > 0 ? (r.kw / maxKw) * 10 : 0) + r.bonus;
    });

    return scored
      .filter(function (r) { return r.score > 0.5; })
      .sort(function (a, b2) { return b2.score - a.score; })
      .slice(0, limit || 4);
  }

  /**
   * Pull a readable answer out of a passage.
   *
   * The first version grabbed the highest-scoring sentences wherever they fell,
   * which produced things like "Two applications, one strong and one
   * methodological. Learning." — grammatical fragments torn out of a list.
   * This version keeps sentences in order, requires them to stand alone, and
   * drops anything that reads as a stub.
   */
  function bestPassage(text, terms, maxSentences) {
    if (!text) return '';
    text = clean(text);

    var sentences = (text.match(/[^.!?]+[.!?]+/g) || [text])
      .map(function (x) { return x.trim(); })
      .filter(function (x) {
        // A sentence needs a verb's worth of words to survive on its own.
        if (x.split(/\s+/).length < 5) return false;
        // Drop openers that only make sense with what follows them.
        if (/^(The protocol|Two applications|Three items|The procedure|First|Second|Third)[,.:]?\s*$/i.test(x)) return false;
        // "Three protocols follow, in ascending order:" announces content
        // rather than carrying any, and reads as a non-answer on its own.
        if (/[:;]\s*$/.test(x)) return false;
        if (/^(One|Two|Three|Four|Five)\s+(protocols?|applications?|items?|points?|things?|elements?)\b/i.test(x)) return false;
        if (/^(The|This)\s+(extractable|transferable|usable|residual|practical)\b/i.test(x) && x.length < 90) return false;
        return true;
      });

    if (!sentences.length) return '';

    var scored = sentences.map(function (x, i) {
      var low = translit(x);
      var hits = terms.filter(function (t) { return low.indexOf(t) > -1; }).length;
      return { s: x, hits: hits, i: i };
    });

    var best = scored.slice().sort(function (a, b) { return b.hits - a.hits; })[0];

    // Take a contiguous run starting at the best sentence, so the result reads
    // as prose rather than as a set of clippings.
    var n = maxSentences || 3;
    var start = best && best.hits > 0 ? best.i : 0;
    if (start + n > sentences.length) start = Math.max(0, sentences.length - n);

    return sentences.slice(start, start + n).join(' ');
  }

  /**
   * A short, self-contained answer.
   * Pick the section that actually addresses the question rather than always
   * preferring the practical one — "what is sushumna" wants the analysis, not
   * a protocol for lowering arousal.
   */
  function summarise(rec, terms, sentences) {
    var candidates = [rec.a, rec.m, rec.f].filter(Boolean);
    var best = null, bestDensity = -1;

    candidates.forEach(function (src) {
      var low = translit(src);
      var hits = terms.reduce(function (n, t) {
        return n + (low.split(t).length - 1);
      }, 0);
      // Density, so a long section doesn't win on raw count alone.
      var density = hits / Math.max(1, low.length / 1000);
      if (density > bestDensity) { bestDensity = density; best = src; }
    });

    return bestPassage(best || candidates[0] || '', terms, sentences || 2);
  }

  /* ========================================================================== */

  root.SvaraKnowledge = {
    TATTVA_SIGNS: TATTVA_SIGNS,
    DIMENSIONS: DIMENSIONS,
    scoreTattva: scoreTattva,
    PRANAYAMA: PRANAYAMA,
    RETENTION_NOTE: RETENTION_NOTE,
    pranayamaFor: pranayamaFor,
    pranayamaToward: pranayamaToward,
    search: search,
    bestPassage: bestPassage,
    summarise: summarise,
    clean: clean,
    isCorpusLoaded: function () { return !!root.SVARA_CORPUS; },
    version: '1.0.0'
  };

}(typeof window !== 'undefined' ? window : globalThis));
