/* Source checks only. This is not a browser, axe, screen-reader or layout test. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('docs/design-review.css');
const light = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
const dark = css.match(/html\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)[1];
const colors = block => Object.fromEntries([...block.matchAll(/(--ui-[\w-]+):\s*(#[\da-f]{6});/g)].map(m => [m[1], m[2]]));
function luminance(hex) {
  const rgb = [1,3,5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a,b) {
  const [lo,hi] = [luminance(a),luminance(b)].sort((a,b) => a-b);
  return (hi + .05) / (lo + .05);
}
const pairs = [
  ['text','surface',4.5],['text','bg',4.5],['text','soft',4.5],
  ['muted','surface',4.5],['muted','bg',4.5],['muted','soft',4.5],
  ['accent','surface',4.5],['accent','soft',4.5],['accent','accent-soft',4.5],
  ['on-accent','accent',4.5],['success','success-bg',4.5],['warning','warning-bg',4.5],
  ['danger','danger-bg',4.5],['info','info-bg',4.5],['internal','internal-bg',4.5],
  ['sidebar-text','sidebar',4.5],['sidebar-text','sidebar-active',4.5],
  ['focus','surface',3],['focus','soft',3],['focus','bg',3],['control-border','surface',3]
];
let assertions = 0;
for (const [theme, block] of [['light',light],['dark',dark]]) {
  const palette = colors(block);
  let minimum = Infinity;
  for (const [fg,bg,required] of pairs) {
    const actual = contrast(palette['--ui-'+fg], palette['--ui-'+bg]);
    assert(actual >= required, `${theme} ${fg}/${bg}: ${actual.toFixed(2)} < ${required}`);
    minimum = Math.min(minimum, actual);
    assertions++;
  }
  console.log(`${theme}: ${pairs.length} contrast pairs pass; lowest ratio ${minimum.toFixed(2)}:1`);
}
function contains(source, pattern, message) { assert(pattern.test(source), message); assertions++; }
contains(css, /@media\s*\(max-width:\s*1100px\)[\s\S]*?\.grid\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\)/, 'Tablet planner must not retain the overflowing two-column minimum.');
contains(css, /@media\s*\(max-width:\s*1240px\)[\s\S]*?\.register-table,\.overview,#clients table,#record-minutes table\s*\{[^}]*min-width:\s*0/, 'Main registers need mobile card reflow.');
contains(css, /td::before\s*\{\s*content:\s*attr\(data-label\)/, 'Mobile cards need visible labels.');
contains(css, /@media\s*\(pointer:\s*coarse\)/, 'Coarse pointer adaptations must be present.');
contains(css, /--ui-target-touch:\s*44px/, 'Requested 44px coarse target token is missing.');
contains(css, /:focus-visible\s*\{[^}]*var\(--ui-focus\)/, 'Focus must use the tested token.');
const plan = read('docs/project-plan.css');
contains(plan, /@media\(max-width:768px\)\{\s*\.pp-mobile-dates\{display:flex/, 'Hidden mobile chart requires its text equivalent.');
const meeting = read('docs/meeting-workspace.css');
assert(!/\.mw-(action|attendee)-table thead\{display:none\}/.test(meeting), 'Mobile sorting headers must not disappear.'); assertions++;
contains(meeting, /\.mw-action-table thead\{display:block/, 'Action sort toolbar missing.');
contains(meeting, /\.mw-attendee-table thead\{display:block/, 'Attendee sort toolbar missing.');
const html = read('docs/mockup.html');
assert(html.indexOf('href="design-review.css"') > html.indexOf('</style>'), 'Final shared stylesheet must load after inline legacy styles.'); assertions++;
// Bracket/string balance catches accidental truncation without pretending to parse CSS layout.
for (const file of ['docs/design-review.css','docs/project-plan.css','docs/meeting-workspace.css']) {
  const text = read(file).replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'');
  let depth = 0;
  for (const char of text) { if (char === '{') depth++; if (char === '}') depth--; assert(depth >= 0, file + ': unmatched closing brace'); }
  assert.equal(depth,0,file + ': unbalanced braces'); assertions++;
}
console.log(`${assertions} source/contrast checks pass. Rendered reflow, actual hit areas and assistive technology remain unverified.`);
