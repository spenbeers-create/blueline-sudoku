/* Measure Up: things with a well-known height, in meters. Buildings are measured to
   their highest point, animals as an adult standing normally (elephants, horses and
   moose at the shoulder), mountains above sea level. Rounded; "about" applies.
   The optional fourth value is the silhouette to draw when the emoji's own shape
   would mislead (a named outline in measure-stage.js, or another emoji). */
(function (root) {
  'use strict';
  const HEIGHTS = [
    // Landmarks and buildings
    ['Burj Khalifa', 828, '🏙️'], ['Tokyo Skytree', 634, '🗼'], ['Shanghai Tower', 632, '🏙️'], ['CN Tower', 553, '🗼'],
    ['One World Trade Center', 541, '🏙️'], ['Petronas Towers', 452, '🏙️'], ['Empire State Building', 443, '🏙️'],
    ['The Strat tower in Las Vegas', 350, '🗼'], ['Eiffel Tower', 330, '🗼'], ['Burj Al Arab', 321, '🏨', 'sail'],
    ['Golden Gate Bridge towers', 227, '🌉'], ['Gateway Arch', 192, '🌈', 'arch'], ['Space Needle', 184, '🛸', 'needle'],
    ['Washington Monument', 169, '🗿', 'obelisk'], ['Great Pyramid of Giza', 139, '🔺'], ['London Eye', 135, '🎡'],
    ['Atomium in Brussels', 102, '⚛️'], ['Big Ben’s clock tower', 96, '🕰️', 'clocktower'], ['Statue of Liberty, ground to torch', 93, '🗽'],
    ['Taj Mahal', 73, '🕌'], ['Sydney Opera House', 65, '🎭', 'shells'], ['Leaning Tower of Pisa', 56, '🏛️', 'leaning'],
    ['Arc de Triomphe', 50, '🏛️'], ['Colosseum', 48, '🏟️'], ['Christ the Redeemer statue', 30, '🗿', 'arms'],
    ['El Castillo pyramid at Chichén Itzá', 30, '🔺'], ['Great Sphinx of Giza', 20, '🦁'], ['Angel of the North sculpture', 20, '👼', 'wings'],
    ['A face on Mount Rushmore', 18, '🗿'], ['Letters of the Hollywood Sign', 14, '🎬', 'letter'], ['Lincoln Memorial statue (seated)', 5.8, '🪑'],
    ['Michelangelo’s David', 5.17, '🗿', '🧍'], ['Rodin’s The Thinker', 1.86, '🤔'], ['Stonehenge’s big sarsen stones', 4.1, '🪨'],
    // Nature
    ['Mount Everest', 8849, '🏔️'], ['K2', 8611, '🏔️'], ['Denali', 6190, '🏔️'], ['Mount Kilimanjaro', 5895, '🏔️'],
    ['Mont Blanc', 4806, '🏔️'], ['Matterhorn', 4478, '🏔️'], ['Mount Fuji', 3776, '🗻'], ['Ben Nevis', 1345, '⛰️'],
    ['Angel Falls', 979, '💧'], ['Victoria Falls', 108, '💧'], ['Niagara’s Horseshoe Falls', 57, '💧'],
    ['Hyperion, the tallest known tree', 116, '🌲'], ['General Sherman, a giant sequoia', 84, '🌳'],
    // Animals
    ['Brachiosaurus', 12, '🦕'], ['Tyrannosaurus rex, at the hip', 4, '🦖'], ['Giraffe', 5.5, '🦒'],
    ['African elephant, at the shoulder', 3.3, '🐘'], ['Asian elephant, at the shoulder', 2.7, '🐘'], ['Polar bear standing up', 3, '🐻‍❄️'],
    ['Ostrich', 2.5, '🐦'], ['Moose, at the shoulder', 2, '🫎'], ['Camel, at the hump', 2, '🐪'], ['Emu', 1.7, '🐦'],
    ['Gorilla standing up', 1.7, '🦍'], ['Horse, at the shoulder', 1.6, '🐎'], ['Red kangaroo standing', 1.5, '🦘'],
    ['Flamingo', 1.3, '🦩'], ['Emperor penguin', 1.15, '🐧'], ['Great Dane, at the shoulder', 0.8, '🐕'],
    ['House cat, at the shoulder', 0.25, '🐈'], ['Chihuahua, at the shoulder', 0.2, '🐕'],
    // People
    ['Robert Wadlow, the tallest person ever', 2.72, '🧍'], ['Yao Ming', 2.29, '🏀', '🧍‍♂️'], ['Shaquille O’Neal', 2.16, '🏀', '🧍‍♂️'],
    ['Average American man', 1.75, '🧍‍♂️'], ['Average American woman', 1.62, '🧍‍♀️'],
    // Sports
    ['American football goalposts', 13.7, '🏈', 'goalpost'], ['Olympic diving platform', 10, '🤽', 'platform'], ['Basketball hoop', 3.05, '🏀', 'hoop'],
    ['Volleyball net (men)', 2.43, '🏐', 'net'], ['Soccer goal', 2.44, '⚽', 'goal'], ['Golf flagstick', 2.13, '⛳'],
    ['Tennis net, in the middle', 0.914, '🎾', 'lownet'], ['Bowling pin', 0.38, '🎳'], ['Basketball', 0.24, '🏀'],
    ['Soccer ball', 0.22, '⚽'], ['Table tennis net', 0.1525, '🏓', 'lownet'], ['Golf ball', 0.0427, '⛳', 'ball'],
    // Vehicles
    ['Saturn V moon rocket', 110.6, '🚀'], ['Titanic, keel to funnel top', 53, '🚢'], ['Airbus A380', 24.1, '✈️'],
    ['Boeing 747', 19.4, '✈️'], ['London double-decker bus', 4.4, '🚌'], ['Semi-truck trailer', 4.1, '🚛'],
    ['Yellow school bus', 3.2, '🚌'], ['Sedan car', 1.45, '🚗'],
    // Around the house and town
    ['Telephone pole', 12, '🪵', 'pole'], ['Room ceiling', 2.44, '🏠'], ['Front door', 2.03, '🚪'], ['Kitchen counter', 0.91, '🍳', 'counter'],
    ['Stanley Cup', 0.895, '🏒', '🏆'], ['Lombardi Trophy', 0.56, '🏆'], ['FIFA World Cup trophy', 0.368, '🏆'],
    ['Oscar statuette', 0.343, '🏆'], ['Barbie doll', 0.29, '👗'], ['Unsharpened pencil', 0.19, '✏️', 'pencil'],
    ['Soda can', 0.122, '🥤', 'can'], ['LEGO minifigure', 0.04, '🧍'],
  ].map(([t, v, e, s]) => (s ? { t, v, e, s } : { t, v, e }));

  root.MEASURE_DATA = HEIGHTS;
  if (typeof module === 'object' && module.exports) module.exports = HEIGHTS;
})(typeof self !== 'undefined' ? self : globalThis);
