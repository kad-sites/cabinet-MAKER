const fs = require('fs');
const code = fs.readFileSync('bin-packer.js', 'utf8');
eval(code); // Load BinPacker

const packer = new BinPacker(96, 48, 0.125);
console.log("Insert 60x22 (Part 1):", packer.insert(60, 22, "Left", true));
console.log("Insert 60x22 (Part 2):", packer.insert(60, 22, "Right", true));
console.log("Insert 34.5x58.5 (Part 3):", packer.insert(34.5, 58.5, "Back", true));
console.log("Insert 34.5x22 (Part 4):", packer.insert(34.5, 22, "Top", true));
console.log("Insert 34.5x22 (Part 5):", packer.insert(34.5, 22, "Bottom", true));

console.log("Free Rects:", packer.freeRects);
