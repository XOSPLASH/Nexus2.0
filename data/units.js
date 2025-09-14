// data/units.js
// Unit definitions for Nexus. Each unit has up to two abilities.

export const UNIT_TYPES = {
  soldier: {
    id: 'soldier',
    name: 'Soldier',
    symbol: '⚔',
    description: 'Reliable frontline infantry. Cheap and versatile.',
    cost: 3,
    hp: 6,
    atk: 2,
    range: 1,
    move: 2,
    abilities: [
      { name: 'Charge', type: 'active', text: 'Move 1 and attack an adjacent enemy.', cooldown: 2, target: 'auto' },
      { name: 'Resolute', type: 'passive', text: 'Takes slightly less damage (flavor).' }
    ]
  },

  archer: {
    id: 'archer',
    name: 'Archer',
    symbol: '🏹',
    description: 'Ranged unit – stays back and fires far.',
    cost: 4,
    hp: 4,
    atk: 2,
    range: 3,
    move: 2,
    abilities: [
      { name: 'Volley', type: 'active', text: 'Volley: hover to preview the 3x3 impact area, click any in-range tile to confirm.', cooldown: 2, target: 'enemy_in_range' },
      { name: 'Eagle Eye', type: 'passive', text: 'Slightly ignores defensive bonuses.' }
    ]
  },

  builder: {
    id: 'builder',
    name: 'Builder',
    symbol: '🔧',
    description: 'Can construct bridges on adjacent water tiles.',
    cost: 5,
    hp: 5,
    atk: 1,
    range: 1,
    move: 2,
    abilities: [
      { name: 'Build Bridge', type: 'active', text: 'Build Bridge: hover to preview the single tile impact area, click any adjacent water tile to confirm.', cooldown: 1, target: 'adjacent_water' },
      { name: 'Handy', type: 'passive', text: 'Builds more efficiently (flavor).' }
    ]
  },

  naval: {
    id: 'naval',
    name: 'Gunship',
    symbol: '⛵',
    description: 'Naval craft – must be placed on water.',
    cost: 6,
    hp: 7,
    atk: 3,
    range: 2,
    move: 3,
    waterOnly: true,
    abilities: [
      { name: 'Bombard', type: 'active', text: 'Bombard: hover to preview the single tile impact area, click any target within 2 tiles to confirm.', cooldown: 2, target: 'manhattan_2_enemy' },
      { name: 'Seaborne', type: 'passive', text: 'Excellent movement on water (flavor).' }
    ]
  },

  medic: {
    id: 'medic',
    name: 'Medic',
    symbol: '✚',
    description: 'Heals adjacent friendly units.',
    cost: 5,
    hp: 5,
    atk: 1,
    range: 1,
    move: 2,
    abilities: [
      { name: 'Heal', type: 'active', text: 'Heal: hover to preview the single tile impact area, click any adjacent friendly unit to confirm.', cooldown: 2, target: 'adjacent_friendly' },
      { name: 'Tender', type: 'passive', text: 'Heals are slightly more effective (flavor).' }
    ]
  },

  scout: {
    id: 'scout',
    name: 'Scout',
    symbol: '🔍',
    description: 'Fast mover. Great for capturing objectives.',
    cost: 2,
    hp: 3,
    atk: 1,
    range: 1,
    move: 4,
    abilities: [
      { name: 'Dash', type: 'active', text: 'Dash: hover to preview the movement path, click to confirm.', cooldown: 2, target: 'self' },
      { name: 'Light Foot', type: 'passive', text: 'Harder to hit in open terrain (flavor).' }
    ]
  },

  tank: {
    id: 'tank',
    name: 'Tank',
    symbol: '⛨',
    description: 'Armored unit – slow and powerful.',
    cost: 8,
    hp: 12,
    atk: 4,
    range: 1,
    move: 1,
    abilities: [
      { name: 'Overrun', type: 'active', text: 'Overrun: hover to preview the single tile impact area, click any adjacent enemy to confirm.', cooldown: 2, target: 'adjacent_enemy' },
      { name: 'Bulwark', type: 'passive', text: 'Reduces incoming damage (flavor).' }
    ]
  },

  shadow: {
    id: 'shadow',
    name: 'Shade',
    symbol: '☽',
    description: 'A unit from the shadow realm with stealthy tricks.',
    cost: 7,
    hp: 5,
    atk: 3,
    range: 1,
    move: 3,
    abilities: [
      { name: 'Vanish', type: 'active', text: 'Become hidden for a turn (engine support required).', cooldown: 3, target: 'self' },
      { name: 'Nightstalker', type: 'passive', text: 'Stronger when near other shadow units.' }
    ]
  },

  // summon-only beasts – not shown in the shop
  wolf: {
    id: 'wolf',
    name: 'Wolf',
    symbol: '🐺',
    description: 'A summoned beast. Not available in shop.',
    cost: 0,
    hp: 3,
    atk: 2,
    range: 1,
    move: 3,
    summonOnly: true,
    abilities: [
      { name: 'Feral', type: 'passive', text: 'Attacks with ferocity.' }
    ]
  },

  // bridge placeholder (tile-like)
  bridge: {
    id: 'bridge',
    name: 'Bridge',
    symbol: '⛩',
    description: 'Constructed bridge tile. Not buyable.',
    cost: 0,
    hp: 999,
    atk: 0,
    range: 0,
    move: 0,
    isTerrain: true,
    summonOnly: true,
    abilities: []
  }
};

// Make available globally for compatibility
if (typeof window !== 'undefined') {
  window.UNIT_TYPES = UNIT_TYPES;
}