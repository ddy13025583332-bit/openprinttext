'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const opentype = require('../dist/vendor/opentype.min.js');
const engine = require('../dist/engine.js');

function rectangle(left = 0, right = 600, height = 700) {
  const path = new opentype.Path();
  path.moveTo(left, 0);
  path.lineTo(right, 0);
  path.lineTo(right, height);
  path.lineTo(left, height);
  path.close();
  return path;
}

function makeFont() {
  const glyphs = [
    new opentype.Glyph({ name: '.notdef', advanceWidth: 600, path: rectangle() }),
    new opentype.Glyph({ name: 'A', unicode: 65, advanceWidth: 600, path: rectangle() }),
    new opentype.Glyph({ name: 'V', unicode: 86, advanceWidth: 600, path: rectangle() }),
    new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 250, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'B', unicode: 66, advanceWidth: 700, path: rectangle(80, 620) }),
    ...Array.from('<>&"').map(ch => new opentype.Glyph({
      name: 'symbol-' + ch.codePointAt(0), unicode: ch.codePointAt(0), advanceWidth: 600, path: rectangle()
    }))
  ];
  glyphs.forEach((glyph, index) => { glyph.index = index; });
  const font = new opentype.Font({ familyName: 'OpenPrintText test font', styleName: 'Regular',
    unitsPerEm: 1000, ascender: 800, descender: -200, glyphs });
  font.kerningPairs = { '1,2': -100 };
  return font;
}

const font = makeFont();
const base = { text: 'AV', widthMm: 60, heightMm: 10, paddingMm: 1 };
function layout(overrides = {}, selectedFont = font) {
  return engine.layoutText(selectedFont, { ...base, ...overrides });
}
function near(actual, expected, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected}`);
}
function throwsCode(fn, code) {
  assert.throws(fn, error => error instanceof Error && error.code === code, `Expected ${code}`);
}
function firstMove(path) {
  const match = path.d.match(/^M(-?[\d.]+) (-?[\d.]+)/);
  assert.ok(match, 'Path must start with a numeric M command');
  return { x: Number(match[1]), y: Number(match[2]) };
}

test('exports real outlines in exact physical dimensions, with no font-dependent text', () => {
  const result = layout();
  assert.match(result.svg, /^<svg[^>]+width="60mm" height="10mm" viewBox="0 0 60 10"/);
  assert.match(result.svg, /<path fill="#000000" d="M/);
  assert.doesNotMatch(result.svg, /<text|font-family|<image|<script|<rect/);
  assert.ok(result.paths.length > 0);
  assert.equal(result.visibleGlyphCount, 2);
  near(result.contentBounds.height, 8);
  near(result.contentBounds.y, 1);
  near(result.contentBounds.x + result.contentBounds.width / 2, 30);
});

test('fitting is uniform in both axes and respects actual glyph kerning', () => {
  const result = layout({ widthMm: 50, heightMm: 100, paddingMm: 0 });
  near(result.scale, 50 / 1100); // 600 + (600 - 100 AV kerning).
  near(result.contentBounds.width, 50);
  near(result.contentBounds.height, 700 * result.scale);
  const unkernedFont = makeFont();
  unkernedFont.kerningPairs = {};
  near(layout({ widthMm: 50, heightMm: 100, paddingMm: 0 }, unkernedFont).scale, 50 / 1200);
});

test('positive and negative spacing retain their final millimetre values during fitting', () => {
  const positive = layout({ text: 'AA', widthMm: 100, heightMm: 200, paddingMm: 0, letterSpacingMm: 5 });
  const negative = layout({ text: 'AA', widthMm: 100, heightMm: 200, paddingMm: 0, letterSpacingMm: -5 });
  near(positive.scale, 95 / 1200);
  near(negative.scale, 105 / 1200);
  near(positive.contentBounds.width, 100);
  near(negative.contentBounds.width, 100);
  const single = layout({ text: 'A', letterSpacingMm: 100 });
  near(single.scale, layout({ text: 'A', letterSpacingMm: 0 }).scale);
});

test('spacing infeasibility is explicit, including the nonmonotonic negative-spacing case', () => {
  throwsCode(() => layout({ text: 'AA', widthMm: 2, heightMm: 20, paddingMm: 0, letterSpacingMm: 100 }), 'TEXT_DOES_NOT_FIT');
  throwsCode(() => layout({ text: 'AA', widthMm: 2, heightMm: 20, paddingMm: 0, letterSpacingMm: -100 }), 'TEXT_DOES_NOT_FIT');
});

test('visual ink bounds, not advance padding, determine centring and fitted width', () => {
  const result = layout({ text: 'BB', widthMm: 100, heightMm: 200, paddingMm: 0 });
  near(result.scale, 100 / 1240); // First ink starts at 80, final ink ends at 700 + 620.
  near(result.contentBounds.x, 0);
  near(result.contentBounds.width, 100);
  const spaced = layout({ text: '  BB  ', widthMm: 100, heightMm: 200, paddingMm: 0 });
  near(spaced.scale, result.scale);
  near(spaced.contentBounds.x, result.contentBounds.x);
});

test('multiline layout uses physical line gaps and a common scale', () => {
  const result = layout({ text: 'A\nA', widthMm: 60, heightMm: 40, paddingMm: 2, lineGapMm: 3 });
  assert.equal(result.lineCount, 2);
  assert.equal(result.paths.length, 2);
  near(result.scale, 33 / 1400);
  near(result.contentBounds.height, 36);
  near(result.contentBounds.y, 2);
  near(firstMove(result.paths[1]).y - firstMove(result.paths[0]).y, 700 * result.scale + 3, 2e-6);
  throwsCode(() => layout({ text: 'A\nA', heightMm: 10, lineGapMm: 10 }), 'TEXT_DOES_NOT_FIT');
});

test('empty middle lines keep their place without generating text elements', () => {
  const result = layout({ text: 'A\n\nA', widthMm: 100, heightMm: 50, paddingMm: 0, lineGapMm: 2 });
  assert.equal(result.lineCount, 3);
  assert.equal(result.paths.length, 2);
  near(result.scale, 46 / 2400); // 700 + nominal blank-line height 1000 + 700.
  near(result.contentBounds.height, 50);
});

test('horizontal mirroring reflects outline coordinates in the label without altering dimensions', () => {
  const normal = layout({ text: 'B' });
  const mirrored = layout({ text: 'B', mirror: true });
  const a = firstMove(normal.paths[0]);
  const b = firstMove(mirrored.paths[0]);
  near(b.x, 60 - a.x, 2e-6);
  near(b.y, a.y, 2e-6);
  near(normal.scale, mirrored.scale);
  near(normal.contentBounds.width, mirrored.contentBounds.width);
  assert.equal(mirrored.mirrored, true);
});

test('missing glyphs are reported explicitly rather than replaced by .notdef', () => {
  assert.throws(() => layout({ text: 'A中中' }), error => {
    assert.equal(error.code, 'MISSING_GLYPH');
    assert.deepEqual(error.missingCharacters, ['中']);
    return true;
  });
});

test('a broken cmap cannot disguise a .notdef fallback as a real glyph', () => {
  const broken = makeFont();
  const notdef = broken.glyphs.get(0);
  broken.charToGlyphIndex = () => 99999;
  broken.charToGlyph = () => notdef;
  throwsCode(() => layout({ text: 'A' }, broken), 'MISSING_GLYPH');
});

test('complex scripts, bidi controls, tabs and unsupported combining marks are rejected', () => {
  throwsCode(() => layout({ text: 'مرحبا' }), 'UNSUPPORTED_SCRIPT');
  throwsCode(() => layout({ text: 'שלום' }), 'UNSUPPORTED_SCRIPT');
  throwsCode(() => layout({ text: 'A\u0350' }), 'UNSUPPORTED_SCRIPT');
  throwsCode(() => layout({ text: 'A\u200dA' }), 'UNSUPPORTED_CHARACTER');
  throwsCode(() => layout({ text: 'A\tA' }), 'UNSUPPORTED_CHARACTER');
  throwsCode(() => layout({ text: '\u1100' }), 'UNSUPPORTED_SCRIPT');
  throwsCode(() => layout({ text: '\u{10D00}' }), 'UNSUPPORTED_SCRIPT');
});

test('empty, overlong and excessively multiline input has bounded, clear errors', () => {
  throwsCode(() => layout({ text: ' \n  ' }), 'EMPTY_TEXT');
  throwsCode(() => layout({ text: 'A'.repeat(2001) }), 'TEXT_TOO_LONG');
  throwsCode(() => layout({ text: Array(21).fill('A').join('\n') }), 'TOO_MANY_LINES');
  throwsCode(() => layout({ text: null }), 'INVALID_INPUT');
  throwsCode(() => engine.layoutText(null, base), 'INVALID_FONT');
});

test('SVG markup in source text is outlined, and fill cannot inject SVG or CSS', () => {
  const result = layout({ text: '<>&"' });
  assert.equal(result.visibleGlyphCount, 4);
  assert.doesNotMatch(result.svg, /&|<text|<script|onload|&quot;/);
  throwsCode(() => layout({ fill: '"><script>alert(1)</script>' }), 'INVALID_FILL');
  throwsCode(() => layout({ fill: 'url(https://example.invalid/image)' }), 'INVALID_FILL');
  assert.match(layout({ fill: '#123ABC' }).svg, /fill="#123ABC"/);
});

test('nonfinite or invalid dimensions cannot create invalid SVG or hanging loops', () => {
  for (const widthMm of [0, -1, NaN, Infinity, '60']) throwsCode(() => layout({ widthMm }), 'INVALID_INPUT');
  throwsCode(() => layout({ paddingMm: 5 }), 'INVALID_INPUT');
  throwsCode(() => layout({ mirror: 'false' }), 'INVALID_INPUT');
  throwsCode(() => layout({ letterSpacingMm: Infinity }), 'INVALID_INPUT');
});

test('invalid font outlines and nonprinting glyphs do not silently export blank labels', () => {
  const broken = makeFont();
  broken.charToGlyph('A').path.commands[0].x = NaN;
  throwsCode(() => layout({ text: 'A' }, broken), 'INVALID_FONT');
  const empty = makeFont();
  empty.charToGlyph('A').path.commands = [];
  throwsCode(() => layout({ text: 'A' }, empty), 'UNSUPPORTED_GLYPH_OUTLINE');
});

test('A4 capacity is exact and every label remains inside margins', () => {
  const result = engine.composeSheet(layout(), { count: 63 });
  assert.equal(result.cols, 3);
  assert.equal(result.rows, 21);
  assert.equal(result.capacity, 63);
  assert.equal(result.actualCount, 63);
  assert.equal(result.placements.length, 63);
  assert.match(result.svg, /width="210mm" height="297mm"/);
  assert.equal((result.svg.match(/<g transform=/g) || []).length, 63);
  for (const placement of result.placements) {
    assert.ok(placement.x >= 10 && placement.y >= 10);
    assert.ok(placement.x + 60 <= 200 + 1e-9);
    assert.ok(placement.y + 10 <= 287 + 1e-9);
  }
});

test('over-capacity and unreasonable copy counts are errors, never silent truncation', () => {
  assert.throws(() => engine.composeSheet(layout(), { count: 64 }), error => {
    assert.equal(error.code, 'OVER_CAPACITY');
    assert.equal(error.capacity, 63);
    assert.equal(error.requestedCount, 64);
    return true;
  });
  for (const count of [0, -1, 1.5, NaN, Infinity, 1001]) {
    throwsCode(() => engine.composeSheet(layout(), { count }), 'INVALID_INPUT');
  }
  throwsCode(() => engine.composeSheet(layout({ widthMm: 500 }), { count: 1 }), 'LABEL_TOO_LARGE');
  throwsCode(() => engine.composeSheet(layout(), { marginMm: 200 }), 'INVALID_INPUT');
});

test('print guides are optional, and user-provided svg strings are never embedded', () => {
  const label = layout();
  label.svg = '<script>alert(1)</script>';
  const clean = engine.composeSheet(label, { count: 2 });
  const guided = engine.composeSheet(label, { count: 2, guides: true });
  assert.doesNotMatch(clean.svg, /<rect|stroke-dasharray|<script|<text/);
  assert.equal((guided.svg.match(/<rect /g) || []).length, 2);
  throwsCode(() => engine.composeSheet({ ...label, paths: [{ d: '"><script>alert(1)</script>' }] }), 'INVALID_LAYOUT');
});

test('curve outlines retain cubic and quadratic commands after scaling and reflection', () => {
  const curve = new opentype.Path();
  curve.moveTo(0, 0);
  curve.quadTo(200, 900, 400, 500);
  curve.curveTo(700, 900, 900, 100, 600, 0);
  curve.close();
  const curvedFont = makeFont();
  curvedFont.charToGlyph('A').path = curve;
  const result = layout({ text: 'A', mirror: true }, curvedFont);
  assert.match(result.paths[0].d, /Q/);
  assert.match(result.paths[0].d, /C/);
  assert.doesNotMatch(result.paths[0].d, /NaN|Infinity/);
  assert.ok(result.contentBounds.x >= 1 - 1e-7);
  assert.ok(result.contentBounds.y >= 1 - 1e-7);
  assert.ok(result.contentBounds.x + result.contentBounds.width <= 59 + 1e-7);
  assert.ok(result.contentBounds.y + result.contentBounds.height <= 9 + 1e-7);
});

test('line-ending normalization does not leak raw user text into the SVG', () => {
  const checked = engine.validateFontText(font, 'A\r\nB');
  assert.equal(checked.text, 'A\nB');
  assert.equal(checked.lineCount, 2);
  assert.equal(layout({ text: 'A\rB', heightMm: 30 }).lineCount, 2);
});

test('the bundled real DejaVu font parses and exports common production sample text', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/assets/demo-font.js'), 'utf8'), context);
  const buffer = Buffer.from(context.window.OPENPRINTTEXT_DEMO_FONT_BASE64, 'base64');
  const realFont = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  for (const text of ['CUSTOM TEXT', 'TEAM 2027', 'THANK YOU', 'HELLO\nWORLD']) {
    const result = engine.layoutText(realFont, { ...base, text, letterSpacingMm: 0.2 });
    assert.ok(result.visibleGlyphCount > 0);
    assert.ok(result.contentBounds.x >= 1 - 1e-7);
    assert.ok(result.contentBounds.y >= 1 - 1e-7);
    assert.ok(result.contentBounds.x + result.contentBounds.width <= 59 + 1e-7);
    assert.ok(result.contentBounds.y + result.contentBounds.height <= 9 + 1e-7);
    assert.doesNotMatch(result.svg, /NaN|Infinity|<text/);
  }
  throwsCode(() => engine.layoutText(realFont, { ...base, text: '定制手环' }), 'MISSING_GLYPH');
});


test('default A4 count respects the export safety cap for tiny labels', () => {
  const tiny = layout({ text: 'A', widthMm: 1, heightMm: 1, paddingMm: 0 });
  const result = engine.composeSheet(tiny, { marginMm: 0, gapXmm: 0, gapYmm: 0 });
  assert.ok(result.capacity > engine.limits.maxCopies);
  assert.equal(result.actualCount, engine.limits.maxCopies);
  assert.equal(result.placements.length, engine.limits.maxCopies);
  throwsCode(() => engine.composeSheet(tiny, { marginMm: 0, gapXmm: 0, gapYmm: 0, count: 1001 }), 'INVALID_INPUT');
});
