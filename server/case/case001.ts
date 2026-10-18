import type { CaseDefinition } from './types';

/**
 * CASE 001 — THE 11-MINUTE BLACKOUT
 *
 * What really happened (plain version — never changes, never generated):
 *   Weeks before  Facilities set the stage's new automatic power box to do a "check-up" every
 *                 Friday at 9:00 PM (with a 4-minute warning). During a check-up the stage
 *                 power goes off, but the backup generator is meant to switch on in 10 seconds.
 *                 Nobody remembered that festival night was a Friday.
 *   6:40 PM       The generator's battery charger breaks. Its battery slowly goes flat.
 *   9:00 PM       The power box sends "power off in 4 minutes" to the sound desk. Ignored.
 *   9:04 PM       The check-up starts. Stage power off. The electrical-room door lock
 *                 loses power too, so the door unlocks.
 *   9:04 PM       The generator tries to start 3 times on a flat battery, and fails.
 *   9:06 PM       Kabir (stage-crew leader) runs into the electrical room to fix it.
 *   9:14–9:15 PM  He gets the code from facilities, cancels the check-up. Power is back.
 *
 * Card `facts` use 24-hour times so tests can check every card against this timeline.
 */
export const case001: CaseDefinition = {
  public: {
    id: 'case-001',
    number: '001',
    title: 'The 11-Minute Blackout',
    festival: "Aurora '26 — headline night",
    venue: 'Outdoor main stage',
    date: 'Friday night',
    briefing: [
      "It's the biggest night of the college festival. The band is on stage and the crowd is huge.",
      '9:04 PM — the stage suddenly goes dark. Lights, speakers and the emergency screen all die. The backup generator never kicks in.',
      '9:15 PM — eleven minutes later, the power comes back on.',
      'Someone in a hoodie was seen running into the electrical room.',
    ],
    symptoms: [
      { time: '9:04 PM', label: 'Stage lights and speakers die' },
      { time: '9:04 PM', label: 'Emergency screen goes black' },
      { time: '9:04 PM', label: 'Backup generator never starts' },
      { time: '9:15 PM', label: 'Power comes back' },
    ],
    dilemma: 'Was it sabotage, a technical failure, or a repair gone wrong?',
    roles: [
      {
        id: 'tech',
        title: 'Sound Technician',
        post: 'At the sound desk',
        perspective: 'You ran the sound for the show. You saw the messages on the sound desk screen.',
      },
      {
        id: 'volunteer',
        title: 'Event Volunteer',
        post: 'At the backstage gate, next to the backup generator',
        perspective: 'You stood right next to the backup generator all evening.',
      },
      {
        id: 'guard',
        title: 'Security Guard',
        post: 'Outside the electrical room',
        perspective: 'You guarded the corridor to the electrical room — and saw who went in.',
      },
    ],
    hypotheses: [
      { id: 'h-sabotage', title: 'Sabotage', blurb: 'Someone wanted to ruin the show and cut the power on purpose.' },
      { id: 'h-failure', title: 'Equipment failure', blurb: 'Something overloaded or simply broke.' },
      { id: 'h-repair', title: 'A repair gone wrong', blurb: 'Someone messing with the electrics caused it or made it worse.' },
      { id: 'h-system', title: 'An automatic system', blurb: 'Something automatic or scheduled switched the power off. Nobody meant to.' },
    ],
    confidences: [
      { id: 'hunch', label: 'Hunch' },
      { id: 'fairly', label: 'Fairly sure' },
      { id: 'certain', label: 'Certain' },
    ],
    events: [
      { id: 'e1', title: 'The generator’s warning light starts beeping', icon: 'alarm' },
      { id: 'e2', title: 'A warning message pops up at the sound desk', icon: 'notice' },
      { id: 'e3', title: 'The stage goes dark', icon: 'dark', briefing: '9:04 PM' },
      { id: 'e4', title: 'The backup generator tries to start — and fails', icon: 'generator' },
      { id: 'e5', title: 'Someone runs into the electrical room', icon: 'door' },
      { id: 'e6', title: 'The power comes back', icon: 'power', briefing: '9:15 PM' },
    ],
    questions: [
      {
        id: 'cause',
        prompt: 'What switched the power off at 9:04?',
        options: [
          { id: 'cause-sabotage', label: 'Someone switched it off on purpose' },
          { id: 'cause-overload', label: 'Too much equipment overloaded it' },
          { id: 'cause-maintenance', label: 'The power box’s automatic Friday check-up' },
          { id: 'cause-repair', label: 'A repair in the electrical room went wrong' },
        ],
      },
      {
        id: 'generator',
        prompt: 'Why didn’t the backup generator start?',
        options: [
          { id: 'gen-disabled', label: 'Someone switched it off on purpose' },
          { id: 'gen-blocked', label: 'The power box stopped it from starting' },
          { id: 'gen-fault', label: 'Its own battery was flat — it tried and failed' },
          { id: 'gen-unwired', label: 'It wasn’t connected to the stage' },
        ],
      },
      {
        id: 'visitor',
        prompt: 'The person who ran into the electrical room at 9:06 was…',
        options: [
          { id: 'vis-saboteur', label: '…the one who caused the blackout' },
          { id: 'vis-botched', label: '…trying to help, but made it worse' },
          { id: 'vis-restorer', label: '…trying to fix it — and did' },
          { id: 'vis-unrelated', label: '…not involved at all' },
        ],
      },
    ],
  },

  roleOrder: ['tech', 'volunteer', 'guard'],

  cards: [
    // ─────────────── SOUND TECHNICIAN — knows WHY the power went off ───────────────
    {
      id: 'tech-log',
      code: 'A·1',
      roleId: 'tech',
      title: 'Sound Desk Screen Log',
      source: 'Messages shown on the sound desk',
      when: 'Printed after the show',
      body: {
        kind: 'log',
        header: 'SOUND DESK · MESSAGE LOG',
        lines: [
          { time: '9:00 PM', tag: 'MSG', text: 'Power box: check-up starts in 4 minutes. Stage power will go off.', refs: ['e2'] },
          { time: '9:00 PM', tag: 'YOU', text: 'Message closed.' },
          { time: '9:04 PM', tag: 'MSG', text: 'Power box: check-up started. Stage power OFF.', refs: ['e3'] },
          { time: '9:15 PM', tag: 'MSG', text: 'Power box: check-up cancelled with the code, at the box. Power ON.', refs: ['e6'] },
        ],
      },
      facts: [
        { event: 'e2', time: '21:00', relation: 'at' },
        { event: 'e3', time: '21:04', relation: 'at' },
        { event: 'e6', time: '21:15', relation: 'at' },
      ],
      supports: { cause: 'proves', visitor: 'suggests' },
      establishes: [
        'The power box warned about a check-up at 9:00 PM, then switched the stage off at 9:04 PM.',
        'The blackout ended when someone typed the code into the power box.',
      ],
      suggests: ['Whoever was at the power box ended the blackout.'],
      caution: 'It says nothing about the generator, or about who went into the electrical room.',
    },
    {
      id: 'tech-cues',
      code: 'A·2',
      roleId: 'tech',
      title: 'My Show Notes',
      source: "Sound technician's notes",
      when: 'Scribbled during the show',
      body: {
        kind: 'cuesheet',
        header: 'BAND SET LIST',
        rows: [
          { cue: '5', item: 'Neon Rain', time: '8:52 PM' },
          { cue: '6', item: 'Static Hearts', time: '8:58 PM' },
        ],
        notes: [
          { text: '9:00 — a popup said something about a "check-up". Thought it was a test. Closed it.', refs: ['e2'] },
          { text: '9:04 — EVERYTHING went dead mid-song!', refs: ['e3'] },
          { text: 'Popup again: "CHECK-UP STARTED". Who plans that during a show??', refs: ['e3'] },
          { text: '9:15 — power back. Phew.', refs: ['e6'] },
        ],
      },
      facts: [
        { event: 'e2', time: '21:00', relation: 'at' },
        { event: 'e3', time: '21:04', relation: 'at' },
        { event: 'e6', time: '21:15', relation: 'at' },
      ],
      supports: { cause: 'suggests' },
      establishes: ['A "check-up" warning popped up at 9:00, and "check-up started" appeared the moment the power died at 9:04.'],
      suggests: ['The power was switched off by a planned check-up, not by something breaking.'],
      caution: 'A popup only says what happened — not why the generator didn’t take over.',
    },
    {
      id: 'tech-email',
      code: 'A·3',
      roleId: 'tech',
      title: 'Email from Facilities',
      source: 'Pinned up in the sound booth',
      when: 'Sent weeks before the festival',
      body: {
        kind: 'email',
        from: 'Facilities Office',
        to: 'Stage crew',
        date: 'Weeks before the festival',
        subject: 'New power box — Friday check-ups',
        paragraphs: [
          {
            text: 'Our new automatic power box switches the stage power off for a quick check-up every FRIDAY at 9:00 PM. It shows a 4-minute warning first.',
            refs: ['e2', 'e3'],
          },
          { text: 'Don’t worry: the backup generator turns on by itself within 10 seconds, so you’ll barely notice.' },
          { text: 'To cancel a check-up early, type the facilities code into the power box in the electrical room.' },
        ],
        signature: '— Facilities',
        stamp: 'Pinned in sound booth',
      },
      facts: [
        { event: 'e2', time: '21:00', relation: 'derived' },
        { event: 'e3', time: '21:04', relation: 'derived' },
      ],
      supports: { cause: 'suggests', generator: 'suggests', visitor: 'suggests' },
      establishes: [
        'Every Friday the power box switches the stage off at 9:00 + 4 minutes = 9:04. Festival night was a Friday.',
        'Normally the generator covers this in 10 seconds, so the check-up alone should only cause a flicker.',
      ],
      suggests: ['Something else must have been wrong with the generator.', 'Someone at the power box with the code could end it.'],
      caution: 'An email shows what was planned, not what actually happened that night.',
    },

    // ─────────────── EVENT VOLUNTEER — knows why the BACKUP failed ───────────────
    {
      id: 'vol-notebook',
      code: 'B·1',
      roleId: 'volunteer',
      title: 'My Notebook',
      source: "Volunteer's notebook",
      when: 'Written during the shift',
      body: {
        kind: 'notebook',
        heading: 'Festival night — my shift',
        lines: [
          { text: '6:40 PM — the generator’s warning light started beeping. A guard said “it always does that.”', refs: ['e1'] },
          { text: '9:04 PM — all the lights went out!', refs: ['e3'] },
          { text: 'Right after, the generator tried to start 3 times… then nothing.', refs: ['e4'] },
          { text: '9:06 PM — Kabir from the stage crew ran past me to the electrical room.', refs: ['e5'] },
        ],
      },
      facts: [
        { event: 'e1', time: '18:40', relation: 'at' },
        { event: 'e3', time: '21:04', relation: 'at' },
        { event: 'e4', time: '21:04', relation: 'at' },
        { event: 'e5', time: '21:06', relation: 'at' },
      ],
      supports: { generator: 'suggests', visitor: 'suggests' },
      establishes: [
        'The generator tried to start three times right after the lights went out, and failed.',
        'Its warning light had been beeping since 6:40 PM.',
      ],
      suggests: ['The generator had its own problem hours earlier.', 'Kabir ran in after the lights were already out.'],
      caution: 'It doesn’t say what switched the power off in the first place.',
    },
    {
      id: 'vol-photo',
      code: 'B·2',
      roleId: 'volunteer',
      title: 'Photo: Generator Screen',
      source: "Volunteer's phone camera",
      when: 'Taken at 9:05 PM',
      body: {
        kind: 'panel',
        device: 'BACKUP GENERATOR',
        status: 'FAILED TO START',
        lines: [
          { text: '9:04 PM  Main power lost → starting', refs: ['e4'] },
          { text: 'Try 1 … failed', refs: ['e4'] },
          { text: 'Try 2 … failed', refs: ['e4'] },
          { text: 'Try 3 … failed', refs: ['e4'] },
          { text: 'BATTERY: FLAT' },
          { text: 'Warning since 6:40 PM: battery charger broken', refs: ['e1'] },
        ],
        annotation: 'it DID try to start!',
      },
      facts: [
        { event: 'e1', time: '18:40', relation: 'at' },
        { event: 'e4', time: '21:04', relation: 'at' },
      ],
      supports: { generator: 'proves' },
      establishes: [
        'The generator noticed the power was gone and tried to start at 9:04 PM.',
        'It failed 3 times because its battery was flat.',
        'Its battery charger had been broken since 6:40 PM.',
      ],
      suggests: ['Nobody switched the generator off — it failed on its own.'],
      caution: 'The generator only knows the power disappeared — not why.',
    },
    {
      id: 'vol-chat',
      code: 'B·3',
      roleId: 'volunteer',
      title: 'Volunteer Group Chat',
      source: 'Screenshot from your phone',
      when: 'Taken after the show',
      body: {
        kind: 'chat',
        group: 'festival volunteers 🎪',
        messages: [
          { time: '6:41 PM', who: 'Meera', text: 'why is the generator beeping 😭', refs: ['e1'] },
          { time: '6:43 PM', who: 'Rohan', text: 'guard says it always beeps, ignore it' },
          { time: '9:04 PM', who: 'You', mine: true, text: 'STAGE IS DARK', refs: ['e3'] },
          { time: '9:04 PM', who: 'Sana', text: 'generator tried 3 times and died??', refs: ['e4'] },
          { time: '9:06 PM', who: 'You', mine: true, text: 'kabir just ran into the electrical room 👀', refs: ['e5'] },
          { time: '9:09 PM', who: 'Sana', text: 'heard the power box says "check-up" 💀' },
          { time: '9:15 PM', who: 'Meera', text: 'WE’RE BACK 🎉', refs: ['e6'] },
        ],
      },
      facts: [
        { event: 'e1', time: '18:41', relation: 'by' },
        { event: 'e3', time: '21:04', relation: 'at' },
        { event: 'e4', time: '21:04', relation: 'at' },
        { event: 'e5', time: '21:06', relation: 'at' },
        { event: 'e6', time: '21:15', relation: 'at' },
      ],
      supports: { generator: 'suggests', cause: 'suggests', visitor: 'suggests' },
      establishes: [
        'The generator was already beeping at 6:41 PM.',
        'It tried to start 3 times after the stage went dark, and died.',
      ],
      suggests: ['A rumour that the power box said "check-up".', 'Kabir ran in two minutes after the lights went out.'],
      caution: '“Heard that…” is a rumour, not proof.',
    },

    // ─────────────── SECURITY GUARD — knows WHO went in, and WHEN ───────────────
    {
      id: 'sec-cctv',
      code: 'C·1',
      roleId: 'guard',
      title: 'CCTV Photo',
      source: 'Security camera outside the electrical room',
      when: 'Taken at 9:06 PM',
      body: {
        kind: 'cctv',
        camera: 'CAMERA 7 · ELECTRICAL ROOM',
        stamp: '9:06 PM',
        inset: { stamp: '9:16 PM', caption: 'He walks out' },
        annotations: ['Hooded crew member', 'No ID card swiped'],
        log: [
          { time: '5:45 PM', text: 'Facilities staff in' },
          { time: '5:52 PM', text: 'Facilities staff out — room empty' },
          { time: '9:04 PM', text: 'Lock lost power — door unlocked', refs: ['e3'] },
          { time: '9:06 PM', text: 'Door opened (no ID card)', refs: ['e5'] },
        ],
      },
      facts: [
        { event: 'e3', time: '21:04', relation: 'at' },
        { event: 'e5', time: '21:06', relation: 'at' },
      ],
      supports: { visitor: 'suggests' },
      establishes: [
        'The electrical room was empty from 5:52 PM until 9:06 PM — nobody was inside when the power went off.',
        'The door only opened without an ID card because the blackout had already cut power to its lock.',
      ],
      suggests: ['The hooded person reacted to the blackout — they didn’t cause it.'],
      caution: 'A hoodie and no ID card look suspicious. The times matter more than the look.',
    },
    {
      id: 'sec-radio',
      code: 'C·2',
      roleId: 'guard',
      title: 'Security Radio',
      source: 'What was said on the security radio',
      when: '9:04 PM – 9:15 PM',
      body: {
        kind: 'radio',
        channel: 'SECURITY RADIO',
        entries: [
          { time: '9:04', who: 'GUARD', text: 'The stage is dark!', refs: ['e3'] },
          { time: '9:06', who: 'GUARD', text: 'Someone in a hoodie just ran into the electrical room!', refs: ['e5'] },
          { time: '9:08', who: 'STAGE MGR', text: 'That’s Kabir, our crew leader. He’s trying to fix it.' },
          { time: '9:09', who: 'KABIR', text: 'The power box says “check-up — enter code”. I need the code!' },
          { time: '9:14', who: 'CONTROL', text: 'Kabir, here’s the code from facilities.' },
          { time: '9:15', who: 'GUARD', text: 'Lights are back!', refs: ['e6'] },
        ],
      },
      facts: [
        { event: 'e3', time: '21:04', relation: 'at' },
        { event: 'e5', time: '21:06', relation: 'at' },
        { event: 'e6', time: '21:15', relation: 'at' },
      ],
      supports: { visitor: 'proves', cause: 'suggests' },
      establishes: [
        'The hooded person was Kabir, the crew leader, and he went in to fix the problem.',
        'He found the power box asking for a code, got it, and the lights came back right after.',
      ],
      suggests: ['The power box was in a "check-up" — nothing was broken or cut.'],
      caution: 'It doesn’t explain why the backup generator didn’t help.',
    },
    {
      id: 'sec-report',
      code: 'C·3',
      roleId: 'guard',
      title: 'Incident Report',
      source: "Guard's report form",
      when: 'Filled in after the show',
      body: {
        kind: 'report',
        fields: [
          { label: 'Incident', value: 'Stage blackout' },
          { label: 'Time', value: '9:04 – 9:15 PM' },
          { label: 'Reported by', value: 'Guard' },
          { label: 'Type', value: 'Entry without permission' },
        ],
        narrative: [
          { text: 'Electrical room was LOCKED when I checked at 8:50. Nobody went in before the blackout.' },
          { text: '9:04 — the stage lost power.', refs: ['e3'] },
          { text: '9:06 — a guy in a crew hoodie ran past me into the electrical room.', refs: ['e5'] },
          { text: 'He came out at 9:16, after the power was back. He said “I fixed it.”', refs: ['e6'] },
        ],
        recommendation: 'Investigate: entered without permission',
      },
      facts: [
        { event: 'e3', time: '21:04', relation: 'at' },
        { event: 'e5', time: '21:06', relation: 'at' },
        { event: 'e6', time: '21:16', relation: 'by' },
      ],
      supports: { visitor: 'suggests' },
      establishes: [
        'Nobody went into the electrical room before the blackout.',
        'The hooded person went in 2 minutes after the lights went out and stayed until the power was back.',
      ],
      suggests: ['By his own words, he fixed it.'],
      caution: 'Breaking a rule (no permission) isn’t the same as causing the blackout.',
    },
  ],

  canonical: [
    {
      id: 'e1',
      window: ['18:40:00', '18:40:59'],
      time: '6:40 PM',
      title: 'The generator’s battery charger breaks',
      detail: 'A warning light starts beeping. Everyone ignores it, and the generator’s battery slowly goes flat.',
    },
    {
      id: 'e2',
      window: ['21:00:00', '21:00:59'],
      time: '9:00 PM',
      title: 'The power box warns: “check-up in 4 minutes”',
      detail: 'It’s the weekly Friday check-up. The message pops up at the sound desk and gets closed as a test.',
    },
    {
      id: 'e3',
      window: ['21:04:00', '21:04:00'],
      time: '9:04 PM',
      title: 'The check-up switches the stage power off',
      detail: 'Lights and speakers die. The electrical-room door lock loses power too, so it unlocks.',
    },
    {
      id: 'e4',
      window: ['21:04:01', '21:04:25'],
      time: '9:04 PM',
      title: 'The generator tries to start — and fails',
      detail: 'It tries 3 times, but its battery is flat. What should have been a 10-second flicker becomes a blackout.',
    },
    {
      id: 'e5',
      window: ['21:06:00', '21:06:59'],
      time: '9:06 PM',
      title: 'Kabir runs into the electrical room',
      detail: 'Two minutes after the lights went out. He’s the stage-crew leader, and he’s there to fix it.',
    },
    {
      id: 'e6',
      window: ['21:14:58', '21:15:00'],
      time: '9:15 PM',
      title: 'Kabir types in the code — power comes back',
      detail: 'He got the code from facilities over the radio and cancelled the check-up.',
    },
  ],

  // Deliberately scrambled starting order (5 of 15 pairs already in the right order).
  initialOrder: ['e5', 'e3', 'e6', 'e1', 'e4', 'e2'],

  answerKey: {
    cause: 'cause-maintenance',
    generator: 'gen-fault',
    visitor: 'vis-restorer',
  },

  hypothesisForCause: {
    'cause-sabotage': 'h-sabotage',
    'cause-overload': 'h-failure',
    'cause-maintenance': 'h-system',
    'cause-repair': 'h-repair',
  },
  truthHypothesis: 'h-system',

  weights: { cause: 30, generator: 20, visitor: 20, timelinePerPair: 2 },

  explanations: {
    'cause-maintenance': 'The power box does a check-up every Friday at 9:00 PM with a 4-minute warning — so the power went off at 9:04.',
    'cause-sabotage': 'Nobody was in the electrical room when the power went off. The only person who went in arrived at 9:06 — after.',
    'cause-overload': 'An overload doesn’t send a warning 4 minutes early. The power box did: “check-up starts in 4 minutes.”',
    'cause-repair': 'Nobody was repairing anything at 9:04. The only repair started at 9:06 — and it’s what ended the blackout.',
    'gen-fault': 'It tried to start 3 times, but its battery was flat because the charger had broken at 6:40 PM.',
    'gen-disabled': 'Nobody touched the generator. It tried to start 3 times — its battery was just flat.',
    'gen-blocked': 'The power box never blocks the generator — it relies on it. The generator did try to start; its battery was flat.',
    'gen-unwired': 'It was connected — it noticed the power was gone and tried to start right away.',
    'vis-restorer': 'Kabir ran in at 9:06, got the code over the radio, cancelled the check-up — and the power came back at 9:15.',
    'vis-saboteur': 'He arrived 2 minutes after the lights went out. The door only opened because the blackout had unlocked it.',
    'vis-botched': 'He didn’t make anything worse — typing in the code is what brought the power back.',
    'vis-unrelated': 'He was very involved: he’s the one who brought the power back.',
  },

  headline: 'Two problems at once. No villain.',
  moral:
    'The check-up alone would have caused a 10-second flicker. The flat generator alone wouldn’t have mattered at all. Together, they caused 11 minutes of darkness.',

  narrative: [
    {
      art: 'schedule',
      time: 'Weeks before',
      title: 'A check-up nobody remembered',
      text: 'Facilities set the stage’s new power box to switch off for a check-up every Friday at 9:00 PM. The backup generator would cover it in 10 seconds. Festival night was a Friday.',
    },
    {
      art: 'charger',
      time: '6:40 PM',
      title: 'The generator’s charger breaks',
      text: 'A warning light starts beeping. People are told “it always beeps”, so its battery quietly goes flat.',
    },
    {
      art: 'warning',
      time: '9:00 PM',
      title: 'A warning nobody reads',
      text: 'The power box sends “check-up in 4 minutes” to the sound desk. The technician thinks it’s a test and closes it.',
    },
    {
      art: 'blackout',
      time: '9:04 PM',
      title: 'Lights out — and no backup',
      text: 'The check-up switches the stage off. The generator tries to start 3 times, but its battery is flat. The flicker becomes a blackout.',
    },
    {
      art: 'visitor',
      time: '9:06 PM',
      title: 'The “suspicious” person',
      text: 'Kabir, the crew leader, runs into the electrical room to help. The door is open only because the blackout unlocked it.',
    },
    {
      art: 'fix',
      time: '9:15 PM',
      title: 'The fix',
      text: 'The power box asks for a code. Kabir gets it from facilities over the radio, cancels the check-up, and the power comes back.',
    },
  ],

  insights: [
    {
      id: 'k-schedule',
      title: '9:00 PM warning + 4 minutes = 9:04 PM',
      text: 'The power didn’t just fail. A scheduled check-up switched it off, right on time.',
      requires: ['cause'],
    },
    {
      id: 'k-generator',
      title: 'The generator tried — its battery was flat',
      text: 'Nobody stopped it. It tried 3 times, but its charger had broken at 6:40 PM.',
      requires: ['generator'],
    },
    {
      id: 'k-visitor',
      title: 'The hooded person came after the lights went out',
      text: 'Nobody was in the electrical room before 9:06. The person everyone suspected is the one who fixed it.',
      requires: ['visitor'],
    },
    {
      id: 'k-both',
      title: 'It took two problems at once',
      text: 'Check-up alone = a 10-second flicker. Flat generator alone = nothing. Together = 11 minutes of darkness.',
      requires: ['cause', 'generator'],
    },
  ],

  hypothesisReflections: {
    'h-sabotage': 'Sabotage is what the CCTV makes you think: a hooded figure, no ID card, a dark stage. It looks bad — until you check the times.',
    'h-failure': 'Equipment failure is half right: the generator really did fail. But the stage power was switched off on purpose by a schedule.',
    'h-repair': 'A repair gone wrong fits someone messing with the power box. But that repair is what fixed the blackout.',
    'h-system': 'An automatic system was right: the power box’s Friday check-up switched the stage off.',
    none: 'No theory was locked — sometimes not guessing is a fair call.',
  },

  roleNotes: {
    tech: 'At the sound desk you saw why the power went off — but nothing about the generator or the hooded person.',
    volunteer: 'Next to the generator you saw why the backup failed — but not what switched the power off.',
    guard: 'Outside the electrical room you saw the most suspicious clue — and it turned out to be innocent.',
  },

  bands: [
    { min: 90, title: 'Case cracked', line: 'You saw through every assumption.' },
    { min: 70, title: 'Sharp eyes', line: 'Most of the picture — one blind spot.' },
    { min: 45, title: 'Half the picture', line: 'Some links found, some missed.' },
    { min: 0, title: 'Lost in the dark', line: 'A believable story from a few clues — just not the true one.' },
  ],
};
