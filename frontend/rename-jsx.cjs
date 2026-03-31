const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src').filter(f => f.endsWith('.js'));
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf-8');
  // Simple heuristic to detect JSX elements and fragments
  if (content.match(/<\w+.*?>|<\/\w+>|<\/>|<>/) || content.includes('/>')) {
    fs.renameSync(f, f + 'x');
    console.log(`Renamed to JSX: ${f}`);
  }
});
