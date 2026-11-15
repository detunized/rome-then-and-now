import { createViewer } from './viewer.js';
import { buildAncient } from './ancient.js';
import { buildToday } from './today.js';

const VIEWS = [
  { name: 'Overview', position: [30, 82, 132], target: [-8, 4, -12] },
  { name: 'Temple', position: [-20, 4.5, 17], target: [-56, 13, -1] },
  { name: 'Colonnade', position: [58, 2.9, -28.6], target: [-40, 5.2, -28.2] },
  { name: 'From above', position: [-2, 270, 34], target: [-2, 0, -6] },
];

const LABELS = [
  { text: 'Temple of Venus Genetrix', at: [-62, 28, 0], era: 'ancient', core: true },
  { text: 'Double colonnade', at: [10, 14.5, -29], era: 'ancient', core: true },
  { text: 'Tabernae (shops and offices)', at: [-25, 21.5, -42], era: 'ancient', core: true },
  { text: 'Statue of Caesar', at: [-8, 8.5, 0], era: 'ancient', core: true },
  { text: 'Curia Julia', at: [94, 27, -28], era: 'both' },
  { text: 'Forum of Augustus', at: [-20, 30, 120], era: 'ancient' },
  { text: 'Capitoline Hill (Arx)', at: [-60, 52, -170], era: 'ancient' },
  { text: 'Temple podium, three columns re-erected', at: [-62, 20, -11], era: 'today', ruin: true },
  { text: 'Standing portico columns', at: [0, 10.5, -26], era: 'today', ruin: true },
  { text: 'Tabernae ruins', at: [-20, 15, -41], era: 'today', ruin: true },
  { text: 'Via dei Fori Imperiali', at: [-10, 12, 48], era: 'today' },
  { text: 'Santi Luca e Martina', at: [88, 44, -1], era: 'today' },
  { text: 'Vittoriano', at: [-185, 84, -100], era: 'today' },
];

createViewer({
  views: VIEWS,
  labels: LABELS,
  places: [{ name: 'Forum square', at: [20, 30, 0], look: [-56, 0] }],
  rebuildTop: 29,
  text: {
    today: 'Rome, today',
    rebuild: 'Today\'s ruins with the ancient forum drawn on top',
    ancient: 'Rome, 2nd century AD, after Trajan\'s rebuild',
    compare: 'Ancient on the left, today on the right',
  },
  build(sets) {
    const ancient = buildAncient(sets.context, sets.core);
    const today = buildToday(sets.remains, sets.modern);
    const ghostSkip = ['interior', 'dark', 'dirt', 'water', 'timber'].map((name) => sets.core[name]);
    return { ancient, today, ghostSkip, columnSets: ancient.columnSets };
  },
});
