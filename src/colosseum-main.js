import { createViewer } from './viewer.js';
import { buildColosseum } from './colosseum.js';

createViewer({
  views: [
    { name: 'Overview', position: [-215, 80, -150], target: [-5, 18, 5] },
    { name: 'North side', position: [-30, 9, -150], target: [5, 24, -70] },
    { name: 'Broken edge', position: [-165, 24, 60], target: [-70, 22, 12] },
    { name: 'Arena', position: [34, 27, 6], target: [-28, -2, 0] },
    { name: 'From above', position: [0, 340, 45], target: [0, 0, 0] },
  ],
  labels: [
    { text: 'Colosseum (Flavian Amphitheatre)', at: [0, 60, 0], era: 'both' },
    { text: 'Outer wall, standing on the north side only', at: [10, 54, -76], era: 'today', ruin: true },
    { text: 'Buttress of 1826', at: [-92, 40, -8], era: 'today' },
    { text: 'Buttress of 1807', at: [80, 40, -40], era: 'today' },
    { text: 'Inner ring, the facade seen today', at: [10, 38, 64], era: 'today', ruin: true },
    { text: 'Hypogeum under the arena', at: [-10, 3, 0], era: 'today', ruin: true },
    { text: 'Arena', at: [-10, 3, 0], era: 'ancient', core: true },
    { text: 'Awning masts', at: [10, 60, -78], era: 'ancient', core: true },
    { text: 'Arch of Constantine', at: [-128, 26, 78], era: 'both' },
    { text: 'Meta Sudans fountain', at: [-124, 20, 34], era: 'ancient', core: true },
    { text: 'Colossus of the Sun', at: [-128, 44, -46], era: 'ancient', core: true },
    { text: 'Temple of Venus and Roma', at: [-262, 44, 0], era: 'ancient', core: true },
  ],
  rebuildTop: 57,
  sun: [-0.8, 0.52, -0.36],
  shadowExtent: [250, 215],
  remainsMatchCore: true,
  text: {
    today: 'Rome, today',
    rebuild: 'What still stands, with the missing parts drawn in',
    ancient: 'Rome, around 320 AD',
    compare: 'Ancient on the left, today on the right',
  },
  build: buildColosseum,
});
