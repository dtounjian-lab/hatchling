// Species definitions: look, stats, diet.
import { smoothstep } from './core/util.js';

export const FOODS = {
  seagrass: { name: 'Seagrass', base: 0.024 },
  algae: { name: 'Algae', base: 0.022 },
  crab: { name: 'Crabs', base: 0.03 },
  shrimp: { name: 'Shrimp', base: 0.024 },
  conch: { name: 'Conch', base: 0.034 },
  jelly: { name: 'Jellyfish', base: 0.028 },
  sponge: { name: 'Sponges', base: 0.028 },
  squirt: { name: 'Sea squirts', base: 0.024 },
  plastic: { name: 'Plastic', base: 0 },
};

const I = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const FOOD_ICONS = {
  seagrass: I('<path d="M8 21c0-6 1-11-2-16M12 21c0-7 0-11 1-17M16 21c0-5 1-9 3-13" stroke="#7fd48a" stroke-width="1.8"/>'),
  algae: I('<path d="M12 21v-6m0 0c-4 0-6-3-5-6 2 1 4 2 5 6zm0 0c4 0 6-3 5-6-2 1-4 2-5 6zm0-4c-1-3 0-6 0-8 1 2 2 5 0 8z" stroke="#e0736a" stroke-width="1.6"/>'),
  crab: I('<ellipse cx="12" cy="14" rx="5" ry="3.4" fill="#ff8a5c"/><path d="M7 13l-3-2M7 15l-3 1M17 13l3-2M17 15l3 1M8 11l-2-4M16 11l2-4" stroke="#ff8a5c" stroke-width="1.5"/>'),
  shrimp: I('<path d="M6 16c0-6 6-9 11-7 2 1 2 4 0 5-3 1-5 0-6 3" stroke="#ffadc1" stroke-width="2"/><path d="M17 9l4-4M16 8l2-5" stroke="#ffadc1" stroke-width="1"/>'),
  conch: I('<path d="M5 17l12-10c2 3 2 8-2 11-3 2-7 1-10-1z" fill="#f7c9a0"/><path d="M9 16l6-5" stroke="#c98a60" stroke-width="1.2"/>'),
  jelly: I('<path d="M5 12a7 7 0 0114 0z" fill="#c9a8ff"/><path d="M8 12c0 4-1 6 0 9M12 12c0 4 1 6 0 9M16 12c0 4-1 6 0 9" stroke="#c9a8ff" stroke-width="1.4"/>'),
  sponge: I('<path d="M8 21V9c0-2 3-2 3 0v12M13 21V6c0-2 3-2 3 0v15" stroke="#ffb347" stroke-width="2.2"/>'),
  squirt: I('<path d="M9 20c-3-3-2-9 1-11 0-2 2-2 2 0 3 2 4 8 1 11z" fill="#8fd3ff"/><circle cx="11" cy="8.5" r="1" fill="#fff"/>'),
  plastic: I('<path d="M7 7h10l-1 13H8z" stroke="#ff6b6b" stroke-width="1.6"/><path d="M9 7c0-3 6-3 6 0" stroke="#ff6b6b" stroke-width="1.6"/><path d="M5 5l14 14" stroke="#ff6b6b" stroke-width="1.6"/>'),
};

const ANIMAL = ['crab', 'shrimp', 'conch', 'jelly'];

export const SPECIES = [
  {
    id: 'green',
    name: 'Green',
    latin: 'Chelonia mydas',
    desc: 'Balanced and steady. An omnivore as a hatchling, she turns to seagrass and algae as she grows.',
    colors: {
      shellA: '#4f5b2a', shellB: '#caa453', plastron: '#efe3b6', skinA: '#3b4526', skinB: '#e0d59a',
    },
    pattern: 0, skinPattern: 0,
    stats: { speed: 1.0, agility: 1.0, size: 1.0, dive: 1.0, health: 1.0 },
    pips: { Speed: 3, Agility: 3, Size: 3, Diving: 3 },
    shape: { head: 0.95, flipper: 1.0, shellW: 1.0, shellL: 1.0, snout: 0.0 },
    gaitSync: true,
    diet(type, growth) {
      if (type === 'seagrass' || type === 'algae') return 1;
      if (ANIMAL.includes(type)) return 1 - 0.8 * smoothstep(0.2, 0.5, growth);
      return 0.1;
    },
  },
  {
    id: 'loggerhead',
    name: 'Loggerhead',
    latin: 'Caretta caretta',
    desc: 'A great head and a crushing bite. She cracks crabs, shrimp and conch that other turtles cannot.',
    colors: {
      shellA: '#7c3d1c', shellB: '#c47a3a', plastron: '#f2d6a0', skinA: '#6e3f20', skinB: '#e8bc7a',
    },
    pattern: 1, skinPattern: 0,
    stats: { speed: 0.95, agility: 0.95, size: 1.08, dive: 1.1, health: 1.25 },
    pips: { Speed: 3, Agility: 2, Size: 4, Diving: 3 },
    shape: { head: 1.28, flipper: 0.95, shellW: 1.02, shellL: 1.0, snout: 0.0 },
    gaitSync: false,
    diet(type) {
      return { crab: 1, shrimp: 1, conch: 1, jelly: 0.3, sponge: 0.2, squirt: 0.3 }[type] ?? 0.1;
    },
  },
  {
    id: 'leatherback',
    name: 'Leatherback',
    latin: 'Dermochelys coriacea',
    desc: 'The giant. The deepest diver of all, but slow to turn. She lives on jellyfish alone.',
    colors: {
      shellA: '#18202c', shellB: '#c9d4de', plastron: '#d9d6d0', skinA: '#1c2433', skinB: '#d3dbe4',
    },
    pattern: 2, skinPattern: 1,
    stats: { speed: 1.08, agility: 0.72, size: 1.45, dive: 1.6, health: 1.2 },
    pips: { Speed: 4, Agility: 1, Size: 5, Diving: 5 },
    shape: { head: 1.05, flipper: 1.4, shellW: 0.94, shellL: 1.14, snout: 0.0 },
    gaitSync: true,
    diet(type) {
      if (type === 'jelly') return 1;
      if (type === 'squirt') return 0.35;
      return 0;
    },
  },
  {
    id: 'hawksbill',
    name: 'Hawksbill',
    latin: 'Eretmochelys imbricata',
    desc: 'The most agile, with a shell like polished tortoiseshell. She picks sponges and reef invertebrates from the coral.',
    colors: {
      shellA: '#3b1d0c', shellB: '#df922e', plastron: '#f0d89e', skinA: '#4a2d16', skinB: '#ecc37c',
    },
    pattern: 3, skinPattern: 0,
    stats: { speed: 1.0, agility: 1.38, size: 0.9, dive: 0.95, health: 0.95 },
    pips: { Speed: 3, Agility: 5, Size: 2, Diving: 2 },
    shape: { head: 0.95, flipper: 1.02, shellW: 0.96, shellL: 1.02, snout: 0.35 },
    gaitSync: false,
    diet(type) {
      return { sponge: 1, squirt: 1, algae: 0.3 }[type] ?? 0.1;
    },
  },
  {
    id: 'kemps',
    name: "Kemp's ridley",
    latin: 'Lepidochelys kempii',
    desc: 'The smallest and the fastest. A quick hunter of crabs and little crustaceans.',
    colors: {
      shellA: '#646a5c', shellB: '#a3a88f', plastron: '#f1eee0', skinA: '#676d5f', skinB: '#cdd1bd',
    },
    pattern: 4, skinPattern: 0,
    stats: { speed: 1.2, agility: 1.15, size: 0.78, dive: 0.9, health: 0.9 },
    pips: { Speed: 5, Agility: 4, Size: 1, Diving: 2 },
    shape: { head: 1.08, flipper: 0.95, shellW: 1.1, shellL: 0.94, snout: 0.0 },
    gaitSync: false,
    diet(type) {
      return { crab: 1, shrimp: 1, conch: 0.4 }[type] ?? 0.1;
    },
  },
];

export function speciesById(id) {
  return SPECIES.find((s) => s.id === id) || SPECIES[0];
}

// Diet guide for the HUD: returns { full:[], part:[] } food type ids.
export function dietGuide(sp, growth) {
  const full = [], part = [];
  for (const t of Object.keys(FOODS)) {
    if (t === 'plastic') continue;
    const v = sp.diet(t, growth);
    if (v >= 0.75) full.push(t);
    else if (v >= 0.25) part.push(t);
  }
  return { full, part };
}
