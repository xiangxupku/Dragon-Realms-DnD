// ===== Game data: classes, dragon tribes, maps, items, statuses =====
const COLS = 14, ROWS = 9;
const STAT_NAMES = { spd: 'Speed', str: 'Strength', eng: 'Energy', lck: 'Luck', res: 'Resistance' };
const STAT_HELP = {
  spd: 'More tiles to walk, act earlier, harder to hit',
  str: 'Bonus damage for weapon attacks',
  eng: 'More MP (magic energy), stronger spells & healing',
  lck: 'Better hit chance & critical hits',
  res: 'More HP, reduces damage & status length'
};
const START_POINTS = 20, LEVEL_POINTS = 10;

// Action spec fields: dice [n,sides], flat, range, stat, hits, aoe, auto (no miss), target ('enemy'|'self'|'party'),
// effect {type, turns:[a,b], chance}, lifesteal, self {type,turns}, party {type,turns}, partyHeal [n,s], selfHeal [n,s], shield, cleanse
const CLASSES = {
  barbarian: { name: 'Barbarian', icon: '🪓', color: '#c0392b', hp: 46, ac: 2, base: { spd: 3, str: 6, eng: 1, lck: 2, res: 4 }, desc: 'Raging warrior with huge HP.',
    atk: { name: 'Greataxe', dice: [1, 12], range: 1, stat: 'str' },
    ability: { name: 'Rage Strike', mp: 5, dice: [2, 12], range: 1, stat: 'str', self: { type: 'rage', turns: 3 }, desc: '2d12 blow, then Rage (+4 dmg) 3 turns' },
    spell: { name: 'War Cry', mp: 4, target: 'party', party: { type: 'inspired', turns: 3 }, desc: 'All allies Inspired (+3 hit & dmg)' },
    heal: [1, 6] },
  bard: { name: 'Bard', icon: '🎻', color: '#e67e22', hp: 34, ac: 1, base: { spd: 4, str: 2, eng: 4, lck: 5, res: 2 }, desc: 'Music magic, buffs and heals the team.',
    atk: { name: 'Rapier', dice: [1, 8], range: 1, stat: 'lck' },
    ability: { name: 'Song of Rest', mp: 5, target: 'party', partyHeal: [2, 6], party: { type: 'inspired', turns: 2 }, desc: 'Heal all allies 2d6 + Inspire' },
    spell: { name: 'Vicious Mockery', mp: 3, dice: [2, 6], range: 5, stat: 'eng', auto: true, effect: { type: 'blur', turns: [2, 3], chance: 1 }, desc: '2d6 psychic, dragon misses more' },
    heal: [1, 8] },
  cleric: { name: 'Cleric', icon: '✨', color: '#f1c40f', hp: 38, ac: 2, base: { spd: 2, str: 3, eng: 6, lck: 3, res: 4 }, desc: 'Holy healer. Best healing in the game.',
    atk: { name: 'Mace', dice: [1, 8], range: 1, stat: 'str' },
    ability: { name: 'Mass Heal', mp: 6, target: 'party', partyHeal: [2, 8], cleanse: true, desc: 'Heal all allies 2d8 + remove bad effects' },
    spell: { name: 'Sacred Flame', mp: 4, dice: [2, 8], range: 5, stat: 'eng', auto: true, desc: '2d8 holy fire, never misses' },
    heal: [2, 8], healer: true },
  druid: { name: 'Druid', icon: '🌿', color: '#27ae60', hp: 36, ac: 1, base: { spd: 3, str: 2, eng: 6, lck: 3, res: 4 }, desc: 'Nature magic, roots dragons, bear form.',
    atk: { name: 'Quarterstaff', dice: [1, 6], range: 1, stat: 'str' },
    ability: { name: 'Bear Form', mp: 5, target: 'self', shield: 20, self: { type: 'rage', turns: 3 }, desc: 'Gain 20 shield and +4 dmg 3 turns' },
    spell: { name: 'Thorn Whip', mp: 3, dice: [1, 10], range: 4, stat: 'eng', effect: { type: 'root', turns: [2, 2], chance: 0.8 }, desc: '1d10 and roots the dragon in place' },
    heal: [2, 6], healer: true },
  fighter: { name: 'Fighter', icon: '⚔️', color: '#7f8c8d', hp: 44, ac: 3, base: { spd: 3, str: 6, eng: 1, lck: 3, res: 4 }, desc: 'Master of weapons & armor.',
    atk: { name: 'Longsword', dice: [1, 10], range: 1, stat: 'str' },
    ability: { name: 'Action Surge', mp: 4, dice: [1, 10], hits: 2, range: 1, stat: 'str', desc: 'Attack twice' },
    spell: { name: 'Second Wind', mp: 3, target: 'self', selfHeal: [2, 10], shield: 6, desc: 'Heal 2d10 + 6 shield' },
    heal: [1, 6] },
  monk: { name: 'Monk', icon: '🥋', color: '#d35400', hp: 38, ac: 3, base: { spd: 7, str: 3, eng: 3, lck: 3, res: 1 }, desc: 'Fast martial artist, stuns foes.',
    atk: { name: 'Unarmed Strike', dice: [1, 8], range: 1, stat: 'spd' },
    ability: { name: 'Flurry of Blows', mp: 3, dice: [1, 6], hits: 3, range: 1, stat: 'spd', desc: '3 quick hits of 1d6' },
    spell: { name: 'Stunning Strike', mp: 4, dice: [1, 8], range: 1, stat: 'spd', effect: { type: 'stun', turns: [1, 1], chance: 0.65 }, desc: '1d8 + 65% stun' },
    heal: [1, 6] },
  paladin: { name: 'Paladin', icon: '🛡️', color: '#ecf0f1', hp: 44, ac: 3, base: { spd: 2, str: 5, eng: 3, lck: 2, res: 5 }, desc: 'Holy knight: smites and protects.',
    atk: { name: 'Warhammer', dice: [1, 10], range: 1, stat: 'str' },
    ability: { name: 'Divine Smite', mp: 5, dice: [3, 8], range: 1, stat: 'str', desc: '3d8 radiant smite' },
    spell: { name: 'Aura of Protection', mp: 4, target: 'party', shield: 10, desc: 'All allies gain 10 shield' },
    heal: [2, 8], healer: true },
  ranger: { name: 'Ranger', icon: '🏹', color: '#16a085', hp: 38, ac: 2, base: { spd: 5, str: 3, eng: 2, lck: 5, res: 2 }, desc: 'Long-range archer & hunter.',
    atk: { name: 'Longbow', dice: [1, 8], range: 6, stat: 'lck' },
    ability: { name: 'Volley', mp: 5, dice: [1, 10], range: 6, aoe: 1, stat: 'lck', desc: 'Arrows hit all dragons near target' },
    spell: { name: "Hunter's Mark", mp: 3, dice: [1, 4], range: 6, auto: true, effect: { type: 'hexed', turns: [4, 4], chance: 1 }, desc: 'Marked dragon takes +1d6 per hit' },
    heal: [1, 8] },
  rogue: { name: 'Rogue', icon: '🗡️', color: '#2c3e50', hp: 34, ac: 3, base: { spd: 6, str: 3, eng: 2, lck: 6, res: 1 }, desc: 'Sneaky, huge sneak-attack damage.',
    atk: { name: 'Twin Daggers', dice: [1, 6], hits: 2, range: 1, stat: 'lck' },
    ability: { name: 'Sneak Attack', mp: 4, dice: [4, 6], range: 1, stat: 'lck', desc: '4d6 sneak attack' },
    spell: { name: 'Smoke Bomb', mp: 3, target: 'self', self: { type: 'camo', turns: 2 }, desc: 'Hide: dragons miss you 50% for 2 turns' },
    heal: [1, 6] },
  sorcerer: { name: 'Sorcerer', icon: '🔥', color: '#e74c3c', hp: 30, ac: 0, base: { spd: 3, str: 1, eng: 7, lck: 4, res: 2 }, desc: 'Born with wild, explosive magic.',
    atk: { name: 'Fire Bolt', dice: [1, 10], range: 5, stat: 'eng' },
    ability: { name: 'Chaos Bolt', mp: 4, dice: [2, 8], range: 6, stat: 'eng', effect: { type: 'random', turns: [2, 3], chance: 0.7 }, desc: '2d8 + random effect' },
    spell: { name: 'Fireball', mp: 6, dice: [3, 6], range: 6, aoe: 1, stat: 'eng', auto: true, effect: { type: 'burn', turns: [2, 3], chance: 0.6 }, desc: '3d6 explosion around target, burns' },
    heal: [1, 6] },
  warlock: { name: 'Warlock', icon: '🔮', color: '#8e44ad', hp: 32, ac: 1, base: { spd: 3, str: 1, eng: 6, lck: 4, res: 3 }, desc: 'Pact magic: curses and blasts.',
    atk: { name: 'Eldritch Blast', dice: [1, 10], range: 6, stat: 'eng' },
    ability: { name: 'Hex', mp: 3, dice: [1, 6], range: 6, auto: true, effect: { type: 'hexed', turns: [4, 4], chance: 1 }, desc: 'Curse: dragon takes +1d6 per hit' },
    spell: { name: 'Hunger of Hadar', mp: 6, dice: [2, 6], range: 6, aoe: 1, auto: true, effect: { type: 'blur', turns: [2, 2], chance: 1 }, desc: 'Darkness: 2d6 area + blind' },
    heal: [1, 6] },
  wizard: { name: 'Wizard', icon: '🧙', color: '#3498db', hp: 30, ac: 0, base: { spd: 3, str: 1, eng: 8, lck: 3, res: 2 }, desc: 'Scholar of powerful spells.',
    atk: { name: 'Ray of Frost', dice: [1, 8], range: 5, stat: 'eng', effect: { type: 'slow', turns: [2, 2], chance: 0.5 } },
    ability: { name: 'Magic Missile', mp: 4, dice: [1, 4], flat: 2, hits: 3, range: 7, auto: true, stat: 'eng', desc: '3 darts that never miss' },
    spell: { name: 'Ice Storm', mp: 7, dice: [2, 8], range: 6, aoe: 1, stat: 'eng', auto: true, effect: { type: 'freeze', turns: [1, 1], chance: 0.4 }, desc: '2d8 area, may freeze' },
    heal: [1, 6] },
  knight: { name: 'Knight', icon: '🏰', color: '#95a5a6', hp: 48, ac: 4, base: { spd: 2, str: 5, eng: 2, lck: 2, res: 6 }, desc: 'Heavy armor, protects the team.', extra: true,
    atk: { name: 'Lance Thrust', dice: [1, 10], range: 2, stat: 'str' },
    ability: { name: 'Shield Bash', mp: 4, dice: [2, 6], range: 1, stat: 'str', effect: { type: 'stun', turns: [1, 1], chance: 0.6 }, desc: '2d6 + 60% stun' },
    spell: { name: 'Rally Banner', mp: 5, target: 'party', shield: 12, party: { type: 'inspired', turns: 2 }, desc: 'All allies: 12 shield + Inspired' },
    heal: [1, 8] },
  samurai: { name: 'Samurai', icon: '🎌', color: '#b03a2e', hp: 42, ac: 3, base: { spd: 5, str: 6, eng: 2, lck: 4, res: 2 }, desc: 'Master swordsman, deadly precise cuts.', extra: true,
    atk: { name: 'Katana', dice: [1, 10], range: 1, stat: 'str' },
    ability: { name: 'Iaido Strike', mp: 5, dice: [3, 8], range: 1, stat: 'str', effect: { type: 'bleed', turns: [3, 3], chance: 0.7 }, desc: '3d8 lightning draw + bleed' },
    spell: { name: 'Focus', mp: 3, target: 'self', self: { type: 'inspired', turns: 3 }, shield: 8, desc: 'Inspired 3 turns + 8 shield' },
    heal: [1, 6] },
  ninja: { name: 'Ninja', icon: '🥷', color: '#1c2833', hp: 34, ac: 4, base: { spd: 8, str: 3, eng: 3, lck: 5, res: 1 }, desc: 'Super fast shadow fighter.', extra: true,
    atk: { name: 'Shuriken', dice: [1, 6], hits: 2, range: 4, stat: 'spd' },
    ability: { name: 'Shadow Strike', mp: 4, dice: [3, 6], range: 1, stat: 'spd', auto: true, desc: '3d6 strike that never misses' },
    spell: { name: 'Vanish', mp: 3, target: 'self', self: { type: 'camo', turns: 2 }, desc: 'Disappear: 50% dodge 2 turns' },
    heal: [1, 6] },
  pirate: { name: 'Pirate', icon: '🏴‍☠️', color: '#784212', hp: 40, ac: 2, base: { spd: 4, str: 4, eng: 2, lck: 6, res: 2 }, desc: 'Lucky swashbuckler with a flintlock.', extra: true,
    atk: { name: 'Cutlass', dice: [1, 8], range: 1, stat: 'lck' },
    ability: { name: 'Flintlock Blast', mp: 4, dice: [2, 10], range: 5, stat: 'lck', desc: '2d10 pistol shot' },
    spell: { name: 'Grog Toast', mp: 4, target: 'party', partyHeal: [1, 8], party: { type: 'inspired', turns: 2 }, desc: 'Team heals 1d8 + Inspired' },
    heal: [1, 8] },
  shaman: { name: 'Shaman', icon: '🪶', color: '#1e8449', hp: 36, ac: 1, base: { spd: 3, str: 2, eng: 6, lck: 4, res: 3 }, desc: 'Spirit magic: totems, lightning and healing.', extra: true,
    atk: { name: 'Spirit Bolt', dice: [1, 8], range: 5, stat: 'eng' },
    ability: { name: 'Chain Lightning', mp: 5, dice: [2, 8], range: 5, aoe: 1, stat: 'eng', auto: true, effect: { type: 'stun', turns: [1, 1], chance: 0.3 }, desc: 'Lightning jumps around the target' },
    spell: { name: 'Healing Totem', mp: 5, target: 'party', partyHeal: [2, 6], cleanse: true, desc: 'Team heals 2d6 + cleansed' },
    heal: [2, 6], healer: true },
  alchemist: { name: 'Alchemist', icon: '⚗️', color: '#16a085', hp: 34, ac: 1, base: { spd: 3, str: 2, eng: 6, lck: 5, res: 2 }, desc: 'Throws potions: acid, fire and healing.', extra: true,
    atk: { name: 'Acid Flask', dice: [1, 8], range: 4, stat: 'eng', effect: { type: 'melt', turns: [2, 2], chance: 0.4 } },
    ability: { name: 'Explosive Brew', mp: 5, dice: [3, 6], range: 5, aoe: 1, stat: 'eng', auto: true, effect: { type: 'burn', turns: [2, 3], chance: 0.6 }, desc: 'Fiery area blast' },
    spell: { name: 'Elixir Rain', mp: 5, target: 'party', partyHeal: [2, 8], desc: 'Team heals 2d8' },
    heal: [2, 6], healer: true },
  gunslinger: { name: 'Gunslinger', icon: '🤠', color: '#a04000', hp: 36, ac: 2, base: { spd: 6, str: 2, eng: 2, lck: 7, res: 1 }, desc: 'Quick-draw sharpshooter.', extra: true,
    atk: { name: 'Revolver', dice: [1, 10], range: 6, stat: 'lck' },
    ability: { name: 'Fan the Hammer', mp: 4, dice: [1, 8], hits: 3, range: 5, stat: 'lck', desc: '3 fast shots' },
    spell: { name: 'Trick Shot', mp: 4, dice: [2, 8], range: 7, auto: true, effect: { type: 'blur', turns: [2, 2], chance: 1 }, desc: 'Ricochet that never misses + blind' },
    heal: [1, 6] },
  beastmaster: { name: 'Beast Master', icon: '🦁', color: '#ca6f1e', hp: 40, ac: 2, base: { spd: 4, str: 4, eng: 3, lck: 4, res: 3 }, desc: 'Fights with wild animals (pets are stronger!).', extra: true,
    atk: { name: 'Whip', dice: [1, 8], range: 2, stat: 'str' },
    ability: { name: 'Wolf Pack', mp: 5, dice: [1, 8], hits: 3, range: 4, stat: 'str', desc: '3 wolves bite the target' },
    spell: { name: 'Bear Hug', mp: 4, target: 'self', shield: 18, desc: 'Your bear shields you (18)' },
    heal: [1, 8] },
  chronomancer: { name: 'Chronomancer', icon: '⏳', color: '#5b2c6f', hp: 32, ac: 1, base: { spd: 5, str: 1, eng: 7, lck: 4, res: 2 }, desc: 'Time magic: freezes and speeds up time.', extra: true,
    atk: { name: 'Time Bolt', dice: [1, 10], range: 5, stat: 'eng' },
    ability: { name: 'Time Stop', mp: 6, dice: [2, 6], range: 5, stat: 'eng', auto: true, effect: { type: 'freeze', turns: [1, 2], chance: 0.8 }, desc: 'Freezes the target in time' },
    spell: { name: 'Rewind', mp: 5, target: 'party', partyHeal: [2, 6], cleanse: true, desc: 'Rewind wounds: team heals + cleansed' },
    heal: [1, 8] },
  artificer: { name: 'Artificer', icon: '🔧', color: '#a0522d', hp: 36, ac: 2, base: { spd: 3, str: 2, eng: 6, lck: 3, res: 4 }, desc: 'Magic inventor with turrets and gadgets.', extra: true,
    atk: { name: 'Thunder Cannon', dice: [1, 8], range: 5, stat: 'eng' },
    ability: { name: 'Flame Turret', mp: 5, dice: [2, 8], range: 5, aoe: 1, stat: 'eng', auto: true, effect: { type: 'burn', turns: [2, 2], chance: 0.5 }, desc: 'Turret sprays fire on an area' },
    spell: { name: 'Infuse Armor', mp: 4, target: 'party', shield: 8, cleanse: true, desc: 'All allies: 8 shield + remove bad effects' },
    heal: [1, 8] },
  vampire: { name: 'Vampire', icon: '🧛', color: '#7b0f1f', hp: 38, ac: 2, base: { spd: 5, str: 5, eng: 3, lck: 2, res: 2 }, desc: 'Drinks dragon blood to heal itself.',
    atk: { name: 'Bite', dice: [1, 8], range: 1, stat: 'str', lifesteal: 0.5 },
    ability: { name: 'Blood Drain', mp: 5, dice: [2, 10], range: 1, stat: 'str', lifesteal: 1, desc: '2d10, heals you for all damage' },
    spell: { name: 'Bat Swarm', mp: 5, dice: [1, 8], range: 4, aoe: 1, auto: true, effect: { type: 'blur', turns: [2, 2], chance: 0.8 }, desc: 'Bats bite & blind an area' },
    heal: [1, 8] },
  werewolf: { name: 'Werewolf', icon: '🐺', color: '#6d4c41', hp: 44, ac: 2, base: { spd: 5, str: 6, eng: 1, lck: 2, res: 3 }, desc: 'Savage beast, makes dragons bleed.',
    atk: { name: 'Claws', dice: [1, 10], range: 1, stat: 'str' },
    ability: { name: 'Frenzy', mp: 5, dice: [1, 10], hits: 2, range: 1, stat: 'str', effect: { type: 'bleed', turns: [3, 3], chance: 0.8 }, desc: '2 slashes + bleeding' },
    spell: { name: 'Moon Howl', mp: 3, target: 'party', party: { type: 'inspired', turns: 2 }, self: { type: 'rage', turns: 3 }, desc: 'Inspire allies, you Rage' },
    heal: [1, 6] },
  necromancer: { name: 'Necromancer', icon: '💀', color: '#4a235a', hp: 32, ac: 0, base: { spd: 2, str: 1, eng: 7, lck: 3, res: 4 }, desc: 'Dark magic, steals life.',
    atk: { name: 'Bone Dart', dice: [1, 8], range: 5, stat: 'eng' },
    ability: { name: 'Life Siphon', mp: 5, dice: [2, 8], range: 5, stat: 'eng', auto: true, lifesteal: 1, desc: '2d8, heals you for it all' },
    spell: { name: 'Bone Spear', mp: 5, dice: [3, 8], range: 6, stat: 'eng', desc: '3d8 piercing bone' },
    heal: [1, 8] },
  dragonslayer: { name: 'Dragonslayer', icon: '🐉', color: '#b7950b', hp: 44, ac: 3, base: { spd: 3, str: 6, eng: 2, lck: 3, res: 3 }, desc: 'Trained only to fight dragons.',
    atk: { name: 'Dragon Lance', dice: [1, 12], range: 2, stat: 'str' },
    ability: { name: 'Dragonbane', mp: 6, dice: [3, 10], range: 2, stat: 'str', desc: '3d10 dragon-killing strike' },
    spell: { name: 'Scale Shield', mp: 3, target: 'self', shield: 15, cleanse: true, desc: '15 shield + remove bad effects' },
    heal: [1, 6] },
};

const PHB_CLASSES = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'];

// Status effects: dot = damage each turn, skip = lose turn
const STATUS = {
  burn: { icon: '🔥', name: 'Burning', dot: 4, bad: true },
  freeze: { icon: '❄️', name: 'Frozen', skip: true, bad: true },
  stun: { icon: '💫', name: 'Stunned', skip: true, bad: true },
  poison: { icon: '☠️', name: 'Poisoned', dot: 3, bad: true },
  bleed: { icon: '🩸', name: 'Bleeding', dot: 3, bad: true },
  melt: { icon: '🧪', name: 'Acid', dot: 5, bad: true },
  root: { icon: '🌱', name: 'Rooted (no walking)', bad: true },
  slow: { icon: '🐌', name: 'Slowed (half walk)', bad: true },
  blur: { icon: '🌫️', name: 'Blurred (miss more)', bad: true },
  inspired: { icon: '🎵', name: 'Inspired (+3 hit/dmg)' },
  rage: { icon: '😡', name: 'Rage (+4 dmg)' },
  hexed: { icon: '🔮', name: 'Hexed (+1d6 dmg taken)', bad: true },
  camo: { icon: '👻', name: 'Hidden (50% dodge)' },
};

// Dragon tribes. a1 = 3d6+2 (5-20), a2 = 2d6-2 (0-10) + status for 2-5 turns
const TRIBES = {
  sky:   { name: 'SkyWing', el: 'Fire', body: '#c9341c', belly: '#f2a33a', wing: '#ff6b2d', fx: 'fire', style: 'hover', move: 4, ac: 12, fly: true,
           a1: { name: 'Talon Swipe', range: 1 }, a2: { name: 'Fire Breath', range: 3, status: 'burn' },
           desc: 'Aggressive flyer. Swoops in fast and burns you. In the desert it hides fire traps (burn 5-10 rounds)!' },
  ice:   { name: 'IceWing', el: 'Ice', body: '#bfe6ff', belly: '#ffffff', wing: '#8fd3ff', fx: 'ice', style: 'shimmer', move: 3, ac: 13,
           a1: { name: 'Serrated Claws', range: 1 }, a2: { name: 'Frost Breath', range: 3, status: 'freeze' },
           desc: 'Cold & patient. Frost breath FREEZES you (lose 2-5 turns).' },
  sea:   { name: 'SeaWing', el: 'Water', body: '#1f6fb2', belly: '#35d0c0', wing: '#2a9df4', fx: 'water', style: 'sway', move: 3, ac: 12,
           a1: { name: 'Tail Slam', range: 1 }, a2: { name: 'Tidal Surge', range: 3, status: 'slow', aoe: 1 },
           desc: 'Ocean fighter. Tidal Surge hits everyone near the target and slows them.' },
  sand:  { name: 'SandWing', el: 'Venom', body: '#e5c07b', belly: '#fff1c1', wing: '#d4a24c', fx: 'venom', style: 'tail', move: 3, ac: 12,
           a1: { name: 'Bite', range: 1 }, a2: { name: 'Venom Barb', range: 2, status: 'poison' },
           desc: 'Desert hunter with a poison tail barb.' },
  mud:   { name: 'MudWing', el: 'Earth', body: '#7a5230', belly: '#a77a4b', wing: '#5c3b20', fx: 'mud', style: 'wobble', move: 2, ac: 13,
           a1: { name: 'Mud Slam', range: 1, status: 'slow', chance: 0.5 }, a2: { name: 'Mud Spray', range: 3, status: 'blur' },
           desc: 'Tough & slow. Mud makes you SLOWER and BLURS your vision so you miss more. Heals in mud once.' },
  rain:  { name: 'RainWing', el: 'Acid', body: '#2ecc71', belly: '#f1c40f', wing: '#e84393', fx: 'acid', style: 'rainbow', move: 3, ac: 11,
           a1: { name: 'Prehensile Tail', range: 1 }, a2: { name: 'Venom Spit', range: 3, status: 'melt' },
           desc: 'Color-changer. Turns invisible (camouflage) and spits melting acid.' },
  night: { name: 'NightWing', el: 'Shadow', body: '#1b1b3a', belly: '#2d2d6b', wing: '#111133', fx: 'dark', style: 'fade', move: 3, ac: 13, fly: true,
           a1: { name: 'Shadow Bite', range: 1 }, a2: { name: 'Shadow Fire', range: 3, status: 'burn' },
           desc: 'Reads minds to dodge attacks and always hunts the weakest hero.' },
  silk:  { name: 'SilkWing', el: 'Silk', body: '#f8a5c2', belly: '#fde2ec', wing: '#a29bfe', fx: 'silk', style: 'flutter', move: 3, ac: 11,
           a1: { name: 'Wing Buffet', range: 1 }, a2: { name: 'Silk Web', range: 3, status: 'root' },
           desc: 'Four butterfly wings. Shoots silk webs that ROOT you in place.' },
  hive:  { name: 'HiveWing', el: 'Sting', body: '#f1c40f', belly: '#222222', wing: '#d35400', fx: 'sting', style: 'buzz', move: 3, ac: 12,
           a1: { name: 'Stinger Strike', range: 1 }, a2: { name: 'Paralyzing Venom', range: 2, status: 'stun' },
           desc: 'Buzzing and jittery. Paralyzing venom STUNS you.' },
  leaf:  { name: 'LeafWing', el: 'Plant', body: '#2d8f3c', belly: '#9be564', wing: '#3fae4a', fx: 'leaf', style: 'leafy', move: 3, ac: 12,
           a1: { name: 'Thorn Tail', range: 1, status: 'poison', chance: 0.4 }, a2: { name: 'Leafspeak Vines', range: 3, status: 'root' },
           desc: 'Commands plants: vines root you and thorns poison you.' },
};

// ================= WORLD =================
// Each dragon map has ONE home tribe: dragons only appear where they come from.
// start = enemies at the start, kills = defeats needed before the exit opens,
// every = a new enemy appears every N rounds (anywhere), exit = tile you must walk to.
const MAPS = [
  { key: 'ship', type: 'dragon', name: 'The Storm Galleon', tribe: 'sea', icon: '🚢', stages: [
    { name: 'Deck 1 — Lower Hold', start: 1, kills: 2, every: 3, exit: [11, 4], exitIcon: '🪜' },
    { name: 'Deck 2 — Gun Deck', start: 2, kills: 3, every: 3, exit: [11, 4], exitIcon: '🪜' },
    { name: 'Deck 3 — Top Deck: the SeaWing Queen', start: 1, every: 3, queen: true } ] },
  { key: 'pond', type: 'dragon', name: 'The Muddy Pond', tribe: 'mud', icon: '🟤', stages: [
    { name: 'Reed Marsh', start: 1, kills: 3, every: 3, exit: [13, 7], exitIcon: '➡️' },
    { name: 'The Mud Wallow', start: 2, kills: 3, every: 3, exit: [7, 0], exitIcon: '⬆️' },
    { name: "The Queen's Nest: the MudWing Queen", start: 1, every: 3, queen: true } ] },
  { key: 'village', type: 'village', name: 'Peaceful Village', icon: '🏘️', stages: [
    { name: 'Peaceful Village', exit: [13, 4], exitIcon: '🏜️' } ] },
  { key: 'desert', type: 'dragon', name: 'The Scorching Desert', tribe: 'sky', icon: '🏜️', stages: [
    { name: 'Burning Dunes', start: 1, kills: 3, every: 3, exit: [7, 8], exitIcon: '⬇️' },
    { name: 'Canyon of Traps', start: 2, kills: 4, every: 2, exit: [13, 1], exitIcon: '➡️' },
    { name: 'Sky Fortress Ruins: the SkyWing Queen', start: 1, every: 3, queen: true } ] },
  { key: 'stronghold', type: 'dragon', name: 'The Stronghold', tribe: 'night', icon: '🏰', stages: [
    { name: 'Stronghold Gate', start: 2, kills: 4, every: 2, exit: [13, 4], exitIcon: '🚪' },
    { name: 'The Time Vault', start: 1, every: 3, boss: 'NightWing Timekeeper' } ] },
  { key: 'school', type: 'school', name: 'Yorkson Creek Middle School', icon: '🏫', stages: [
    { name: 'Floor 1', floor: 1, doors: 1 }, { name: 'Floor 2', floor: 2, doors: 1 }, { name: 'Floor 3', floor: 3, doors: 2 },
    { name: 'Floor 4', floor: 4, doors: 2 }, { name: 'Floor 5 — Dorm', floor: 5, doors: 2, bed: true } ] },
];
const QUEEN = { hp: 140, ac: 2, pow: 2, guardHp: 50 };
const TOTAL_QUEENS = MAPS.filter(m => m.stages.some(s => s.queen)).length;
const SCHOOL_DAYS = 5;

// ================= SCHOOL PEOPLE =================
// Students are neutral and smart (talk to them for a test hint). Attack them and they fight back!
// Bullies always attack and chase you. dice = [count, sides, bonus]
const PEOPLE = {
  brainiac:  { kind: 'student', title: 'Brainiac', icon: '🧠', shirt: '#8e44ad', move: 2, ac: 11, hp: [30, 45],
    a1: { name: 'Textbook Bonk', range: 1, dice: [2, 6, 2] }, a2: { name: 'Big Brain Blast', range: 4, dice: [2, 6, 0], status: 'stun', chance: 0.5, turns: [1, 1] }, desc: 'Super smart. Big Brain Blast can stun you.' },
  athlete:   { kind: 'student', title: 'Athlete', icon: '🏀', shirt: '#e67e22', move: 5, ac: 13, hp: [40, 55],
    a1: { name: 'Body Check', range: 1, dice: [3, 6, 0] }, a2: { name: 'Fastball', range: 4, dice: [2, 6, 0], status: 'slow', turns: [2, 3] }, desc: 'Super Sprint: moves 5 tiles a turn.' },
  artist:    { kind: 'student', title: 'Artist', icon: '🎨', shirt: '#e84393', move: 3, ac: 11, hp: [28, 40],
    a1: { name: 'Brush Swipe', range: 1, dice: [2, 6, 0] }, a2: { name: 'Paint Splash', range: 3, dice: [1, 8, 0], status: 'blur', turns: [2, 3] }, desc: 'Paint Splash blurs your vision.' },
  gamer:     { kind: 'student', title: 'Gamer', icon: '🎮', shirt: '#27ae60', move: 3, ac: 12, hp: [30, 45],
    a1: { name: 'Controller Smack', range: 1, dice: [2, 6, 1] }, a2: { name: 'Combo Chain', range: 2, dice: [4, 4, 0] }, desc: 'Combo Chain hits 4 times.' },
  musician:  { kind: 'student', title: 'Musician', icon: '🎺', shirt: '#2980b9', move: 3, ac: 11, hp: [28, 40],
    a1: { name: 'Drumstick Tap', range: 1, dice: [2, 6, 0] }, a2: { name: 'Sonic Note', range: 3, aoe: 1, dice: [1, 8, 0], status: 'stun', chance: 0.3, turns: [1, 1] }, desc: 'Sonic Note hits everyone nearby.' },
  scientist: { kind: 'student', title: 'Science Kid', icon: '🧪', shirt: '#f1c40f', move: 3, ac: 11, hp: [28, 42],
    a1: { name: 'Beaker Bash', range: 1, dice: [2, 6, 0] }, a2: { name: 'Volcano Experiment', range: 3, aoe: 1, dice: [2, 6, 0], status: 'burn', turns: [2, 3] }, desc: 'Volcano Experiment burns an area.' },
  robotics:  { kind: 'student', title: 'Robotics Kid', icon: '🤖', shirt: '#7f8c8d', move: 3, ac: 13, hp: [32, 48], shieldPower: 15,
    a1: { name: 'Robo Punch', range: 1, dice: [2, 8, 0] }, a2: { name: 'Laser Pointer', range: 5, dice: [2, 6, 0], status: 'blur', turns: [1, 2] }, desc: 'Robo Buddy gives them a shield.' },
  // ---- bullies ----
  lockerlord: { kind: 'bully', title: 'Locker Lord', icon: '🚪', shirt: '#922b21', move: 3, ac: 13, hp: [45, 70],
    a1: { name: 'Shove', range: 1, dice: [3, 6, 2] }, a2: { name: 'Locker Slam', range: 1, dice: [2, 6, 2], status: 'stun', turns: [1, 2] }, desc: 'Slams you into a locker (stun).' },
  dodgeball:  { kind: 'bully', title: 'Dodgeball Demon', icon: '🔴', shirt: '#cb4335', move: 3, ac: 12, hp: [40, 60],
    a1: { name: 'Punch', range: 1, dice: [3, 6, 0] }, a2: { name: 'Dodgeball Barrage', range: 5, dice: [3, 6, 0] }, desc: 'Throws dodgeballs from far away.' },
  wedgie:     { kind: 'bully', title: 'Wedgie Wizard', icon: '🩲', shirt: '#6c3483', move: 4, ac: 12, hp: [40, 60],
    a1: { name: 'Noogie', range: 1, dice: [3, 6, 0] }, a2: { name: 'Mega Wedgie', range: 1, dice: [2, 6, 0], status: 'root', turns: [2, 3] }, desc: 'Mega Wedgie: you are stuck in place!' },
  spitball:   { kind: 'bully', title: 'Spitball Sniper', icon: '🎯', shirt: '#1e8449', move: 3, ac: 12, hp: [35, 55],
    a1: { name: 'Flick', range: 1, dice: [2, 6, 2] }, a2: { name: 'Spitball', range: 6, dice: [2, 6, 0], status: 'blur', turns: [2, 3] }, desc: 'Spitballs blur your vision from far away.' },
  ghost:      { kind: 'bully', title: 'Rumor Ghost', icon: '👻', shirt: '#566573', move: 3, ac: 13, hp: [35, 55], blink: true,
    a1: { name: 'Mean Whisper', range: 1, dice: [3, 6, 0] }, a2: { name: 'Spread Rumors', range: 3, aoe: 1, dice: [1, 8, 0], status: 'slow', turns: [2, 3] }, desc: 'Teleports right next to you!' },
  thief:      { kind: 'bully', title: 'Lunch Thief', icon: '🥪', shirt: '#b7950b', move: 4, ac: 12, hp: [35, 55], steal: true,
    a1: { name: 'Trip', range: 1, dice: [3, 6, 0] }, a2: { name: 'Steal Lunch', range: 1, dice: [1, 6, 0] }, desc: 'Steals your gold or items!' },
  monitor:    { kind: 'bully', title: 'Hall Monitor Tyrant', icon: '🚨', shirt: '#2e4053', move: 3, ac: 14, hp: [50, 75],
    a1: { name: 'Clipboard Whack', range: 1, dice: [3, 6, 2] }, a2: { name: 'Detention Beam', range: 4, dice: [2, 6, 0], status: 'freeze', turns: [1, 2] }, desc: 'Detention Beam freezes you!' },
};
const STUDENT_TYPES = Object.keys(PEOPLE).filter(k => PEOPLE[k].kind === 'student');
const BULLY_TYPES = Object.keys(PEOPLE).filter(k => PEOPLE[k].kind === 'bully');
// all made-up names
const FIRST_NAMES = ['Alex', 'Jordan', 'Riley', 'Sam', 'Casey', 'Taylor', 'Morgan', 'Jamie', 'Quinn', 'Avery', 'Rowan', 'Skyler', 'Dakota', 'Reese', 'Parker',
  'Emerson', 'Kai', 'Nova', 'Milo', 'Iris', 'Luca', 'Theo', 'Ivy', 'Owen', 'Hazel', 'Leo', 'Ruby', 'Finn', 'Maya', 'Zara', 'Eli', 'Nico', 'Juno', 'Remy', 'Sage'];
const BULLY_NAMES = ['Brick', 'Knuckles', 'Smash', 'Vex', 'Grim', 'Tank', 'Spike', 'Rocco', 'Crusher', 'Duke', 'Slick', 'Boulder'];
const SUBJECTS = ['Math', 'Science', 'Dragon Lore', 'Geography', 'English', 'History'];
const STUDENT_TIPS = ['Read every answer before you pick!', 'In math, check your work twice.', 'Dragons hatch from eggs, obviously.',
  'The Pacific is the biggest ocean.', 'Water boils at 100°C at sea level.', 'A noun is a person, place or thing.', 'Bullies hate it when you stick together.'];

// Quiz bank: q, answers, c = index of the correct answer
const QUESTIONS = {
  Science: [
    ['What planet is known as the Red Planet?', ['Venus', 'Mars', 'Jupiter', 'Saturn'], 1],
    ['What do plants need to make food from sunlight?', ['Photosynthesis', 'Digestion', 'Erosion', 'Gravity'], 0],
    ['At what temperature does water boil (sea level)?', ['50°C', '90°C', '100°C', '150°C'], 2],
    ['What gas do humans breathe in to live?', ['Carbon dioxide', 'Oxygen', 'Helium', 'Nitrogen'], 1],
    ['What is the center of an atom called?', ['Nucleus', 'Electron', 'Shell', 'Cell'], 0],
    ['Which organ pumps blood around the body?', ['Lungs', 'Brain', 'Heart', 'Liver'], 2],
    ['What force pulls things down to Earth?', ['Magnetism', 'Friction', 'Gravity', 'Wind'], 2],
    ['What is H2O?', ['Salt', 'Water', 'Air', 'Gold'], 1],
    ['Which is the closest star to Earth?', ['The Sun', 'Polaris', 'Sirius', 'The Moon'], 0],
    ['What do bees make?', ['Milk', 'Silk', 'Honey', 'Wax only'], 2],
  ],
  'Dragon Lore': [
    ['Which tribe lives in the sea in this game?', ['MudWings', 'SeaWings', 'SkyWings', 'IceWings'], 1],
    ['What does an IceWing breath do?', ['Burns', 'Freezes', 'Poisons', 'Heals'], 1],
    ['Which dragons turn invisible (camouflage)?', ['RainWings', 'SandWings', 'MudWings', 'SkyWings'], 0],
    ['MudWing mud makes you…', ['Faster', 'Slower & blurry', 'Invisible', 'Stronger'], 1],
    ['SkyWings in the desert hide…', ['Gold', 'Fire traps', 'Eggs', 'Water'], 1],
    ['What do dragons hatch from?', ['Cocoons', 'Eggs', 'Seeds', 'Clouds'], 1],
    ['Which tribe has a poison tail barb?', ['SandWings', 'SeaWings', 'IceWings', 'SilkWings'], 0],
    ['How many queens must you defeat for peace?', ['1', '2', '3', '10'], 2],
  ],
  Geography: [
    ['What is the largest ocean?', ['Atlantic', 'Indian', 'Arctic', 'Pacific'], 3],
    ['What is the capital of Canada?', ['Toronto', 'Vancouver', 'Ottawa', 'Montreal'], 2],
    ['Which continent is Egypt in?', ['Asia', 'Africa', 'Europe', 'South America'], 1],
    ['What is the longest river in the world?', ['Nile', 'Amazon', 'Fraser', 'Thames'], 0],
    ['Which is the biggest country by area?', ['Canada', 'USA', 'Russia', 'China'], 2],
    ['How many continents are there?', ['5', '6', '7', '8'], 2],
    ['What is the tallest mountain on Earth?', ['K2', 'Everest', 'Kilimanjaro', 'Denali'], 1],
    ['Which province is Vancouver in?', ['Alberta', 'Ontario', 'British Columbia', 'Quebec'], 2],
  ],
  English: [
    ['Which word is a noun?', ['Run', 'Happy', 'Dragon', 'Quickly'], 2],
    ['Which word is a verb?', ['Jump', 'Blue', 'Table', 'Soft'], 0],
    ['What is the plural of "mouse"?', ['Mouses', 'Mice', 'Meese', 'Mousies'], 1],
    ['Which is spelled correctly?', ['Recieve', 'Receive', 'Receeve', 'Riceive'], 1],
    ['What is the opposite of "ancient"?', ['Old', 'Modern', 'Huge', 'Dusty'], 1],
    ['Which word is an adjective?', ['Slowly', 'Brave', 'Swim', 'Castle'], 1],
    ['"Their / There / They\'re": ___ going to school.', ['Their', 'There', "They're", 'Thier'], 2],
  ],
  History: [
    ['Who were the first people to live in Canada?', ['Vikings', 'Indigenous peoples', 'Romans', 'Pirates'], 1],
    ['The pyramids were built in…', ['Egypt', 'France', 'Japan', 'Mexico only'], 0],
    ['Knights lived mostly in the…', ['Stone Age', 'Middle Ages', 'Space Age', 'Ice Age'], 1],
    ['What did people use before light bulbs?', ['Phones', 'Candles', 'Lasers', 'TVs'], 1],
    ['In what year did Canada become a country?', ['1492', '1867', '1967', '2001'], 1],
    ['Who built castles to protect kingdoms?', ['Kings & lords', 'Astronauts', 'Cowboys', 'Robots'], 0],
  ],
};

// ================= GEAR & ITEMS =================
// Equipment slots: weapon, armor (has durability), offhand (shield or other thing)
const ITEMS = {
  potion: { name: 'Healing Potion', icon: '🧪', desc: 'Heal 25 HP (you or an ally)', target: 'ally', price: 20 },
  mana:   { name: 'Mana Potion', icon: '🔷', desc: '+15 MP', target: 'self', price: 20 },
  herb:   { name: 'Cleansing Herb', icon: '🌿', desc: 'Removes burn, freeze, poison, blur…', target: 'ally', price: 15 },
  bomb:   { name: 'Fire Bomb', icon: '💣', desc: 'Throw at an enemy: 3d6 damage (range 5)', target: 'enemy', price: 30 },
  scale:  { name: 'Dragon Scale', icon: '🐲', desc: 'Gain 15 shield', target: 'self', price: 35 },
  clover: { name: 'Lucky Clover', icon: '🍀', desc: 'Inspired for 3 turns', target: 'self', price: 25 },
  elixir: { name: 'Phoenix Elixir', icon: '🪶', desc: 'Revive a fallen ally at 50% HP (or full heal)', target: 'ally', dead: true, price: 80 },
  repair: { name: 'Repair Kit', icon: '🔧', desc: 'Restore 15 armor durability', target: 'self', price: 25 },
  ticket: { name: 'Wheel Ticket', icon: '🎟️', desc: 'Spin the Wheel of Fortune for free!', target: 'self', price: 25 },
  treat:  { name: 'Dragon Treat', icon: '🍖', desc: 'Feed your pet dragon: +1 level (max 5)', target: 'self', price: 40 },
  egg_guard:  { name: 'Guardian Dragon Egg', icon: '🥚', desc: 'Hatches a Guardian dragon: gives you bonus HP', target: 'self', price: 120, egg: 'guard' },
  egg_fury:   { name: 'Fury Dragon Egg', icon: '🥚', desc: 'Hatches a Fury dragon: gives you bonus damage', target: 'self', price: 120, egg: 'fury' },
  egg_battle: { name: 'Battle Dragon Egg', icon: '🥚', desc: 'Hatches a Battle dragon that fights with you', target: 'self', price: 140, egg: 'battle' },
  // weapons (+dmg to every attack, +hit)
  w_dagger: { name: 'Iron Dagger', icon: '🗡️', slot: 'weapon', dmg: 2, hit: 1, price: 40, desc: '+2 damage, +1 hit' },
  w_sword:  { name: 'Steel Sword', icon: '⚔️', slot: 'weapon', dmg: 4, hit: 1, price: 90, desc: '+4 damage, +1 hit' },
  w_staff:  { name: 'Crystal Staff', icon: '🪄', slot: 'weapon', dmg: 3, hit: 2, mp: 10, price: 100, desc: '+3 damage, +2 hit, +10 max MP' },
  w_axe:    { name: 'Dragonbone Axe', icon: '🪓', slot: 'weapon', dmg: 6, hit: 0, price: 160, desc: '+6 damage' },
  w_laser:  { name: 'Laser Sword', icon: '🔆', slot: 'weapon', dmg: 8, hit: 2, price: 300, desc: '+8 damage, +2 hit (from the future!)' },
  // armor (+armor class, durability goes down when you get hit)
  a_cloth:  { name: 'Cloth Tunic', icon: '👕', slot: 'armor', ac: 1, dur: 12, price: 10, desc: '+1 armor' },
  a_leather:{ name: 'Leather Armor', icon: '🦺', slot: 'armor', ac: 2, dur: 20, price: 50, desc: '+2 armor' },
  a_chain:  { name: 'Chain Mail', icon: '⛓️', slot: 'armor', ac: 4, dur: 30, price: 110, desc: '+4 armor' },
  a_scale:  { name: 'Dragon Scale Mail', icon: '🧥', slot: 'armor', ac: 6, dur: 40, price: 200, desc: '+6 armor' },
  // off-hand
  o_shield: { name: 'Wooden Shield', icon: '🛡️', slot: 'offhand', ac: 2, block: 0.15, price: 40, desc: '+2 armor, 15% block (half damage)' },
  o_tower:  { name: 'Tower Shield', icon: '🔰', slot: 'offhand', ac: 3, block: 0.25, price: 100, desc: '+3 armor, 25% block' },
  o_torch:  { name: 'Torch', icon: '🔥', slot: 'offhand', burn: 0.25, price: 30, desc: 'Your hits may set enemies on fire' },
  o_tome:   { name: 'Spell Tome', icon: '📕', slot: 'offhand', spell: 3, price: 80, desc: '+3 damage on Energy attacks' },
  o_charm:  { name: 'Lucky Charm', icon: '🧿', slot: 'offhand', hit: 3, price: 60, desc: '+3 hit chance' },
};
const iid = e => e ? String(e).split(':')[0] : null;           // inventory entry -> item id ("a_chain:17" -> "a_chain")
const idur = e => { const p = String(e).split(':'); return p[1] != null ? +p[1] : (ITEMS[p[0]] && ITEMS[p[0]].dur) || 0; };
const BAGS = { bag_small: { name: 'Leather Backpack', icon: '🎒', price: 60, slots: 5, desc: '+5 inventory slots' },
               bag_big: { name: "Adventurer's Pack", icon: '🧳', price: 120, slots: 10, desc: '+10 inventory slots' } };
const START_SLOTS = 10, MAX_SLOTS = 20, START_GOLD = 30;
const GOLD_PER_KILL = [15, 30], GOLD_PER_QUEEN = 100;
const LOOT_TABLE = ['potion', 'potion', 'potion', 'mana', 'mana', 'herb', 'herb', 'bomb', 'scale', 'clover', 'elixir', 'repair', 'ticket', 'w_dagger', 'o_shield', 'a_leather'];

// ================= PET DRAGONS =================
const PETS = {
  guard:  { name: 'Guardian', tribe: 'ice', desc: '+8 max HP per level' },
  fury:   { name: 'Fury', tribe: 'sky', desc: '+1 damage +1 per level' },
  battle: { name: 'Battle', tribe: 'night', desc: 'Attacks a nearby enemy every turn (1d6 + 2×level)' },
};
const PET_NAMES = ['Ember', 'Frost', 'Shadow', 'Pebble', 'Sparky', 'Nibbles', 'Comet', 'Biscuit', 'Storm', 'Mochi'];
const PET_MAX = 5;

// ================= VILLAGE =================
// house = [x, y, roof color] (2x2 building), npc stands at x,y
const VILLAGE_NPCS = [
  { role: 'inn', name: 'Innkeeper Rosa', icon: '🛏️', shirt: '#c0392b', x: 2, y: 2, house: [1, 0, '#a0412d'], sign: 'Inn', greet: 'Welcome, heroes! Rest here — healing is free.' },
  { role: 'store', name: 'Shopkeeper Bram', icon: '🧪', shirt: '#27ae60', x: 5, y: 2, house: [5, 0, '#2e7d4f'], sign: 'General Store', greet: 'Potions, bombs, tickets… I have it all!',
    goods: ['potion', 'mana', 'herb', 'bomb', 'scale', 'clover', 'elixir', 'repair', 'ticket'] },
  { role: 'bags', name: 'Bag Maker Wren', icon: '🎒', shirt: '#8e44ad', x: 9, y: 2, house: [9, 0, '#6b4c9a'], sign: 'Bag Maker', greet: 'Out of space? My backpacks hold more!', goods: ['bag_small', 'bag_big'] },
  { role: 'smith', name: 'Blacksmith Hilda', icon: '⚒️', shirt: '#34495e', x: 2, y: 6, house: [1, 7, '#3d6e9e'], sign: 'Blacksmith', greet: 'Weapons, armor, shields — and I fix broken armor!',
    goods: ['w_dagger', 'w_sword', 'w_staff', 'w_axe', 'a_leather', 'a_chain', 'a_scale', 'o_shield', 'o_tower', 'o_torch', 'o_tome', 'o_charm'], repair: true },
  { role: 'dragon', name: 'Dragon Keeper Ash', icon: '🥚', shirt: '#b9770e', x: 6, y: 6, house: [5, 7, '#b9770e'], sign: 'Dragon Nest', greet: 'Hatch a baby dragon, or let me train yours!',
    goods: ['egg_guard', 'egg_fury', 'egg_battle', 'treat'], train: true },
  { role: 'wheel', name: 'Wheel Master Zed', icon: '🎡', shirt: '#d4ac0d', x: 10, y: 6, house: [9, 7, '#d4ac0d'], sign: 'Wheel of Fortune', greet: 'Step right up! 25 gold a spin!', wheel: true },
];
const WHEEL_COST = 25;
const WHEEL = [
  { label: '50 gold', color: '#f1c40f', gold: 50, w: 3 },
  { label: '2 Potions', color: '#e74c3c', items: ['potion', 'potion'], w: 3 },
  { label: 'Dragon Egg!', color: '#9b59b6', egg: true, w: 1 },
  { label: 'Nothing', color: '#7f8c8d', w: 3 },
  { label: '150 gold', color: '#f39c12', gold: 150, w: 1 },
  { label: 'Steel Sword', color: '#3498db', items: ['w_sword'], w: 1 },
  { label: 'Mana + Herb', color: '#1abc9c', items: ['mana', 'herb'], w: 2 },
  { label: 'Phoenix Elixir', color: '#e67e22', items: ['elixir'], w: 1 },
  { label: 'Repair Kit', color: '#95a5a6', items: ['repair'], w: 2 },
  { label: 'Dragon Treat', color: '#d35400', items: ['treat'], w: 2 },
];
