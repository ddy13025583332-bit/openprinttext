/* OpenPrintText — local, outline-only label layout. MIT License. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OpenPrintTextEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LIMITS = Object.freeze({ maxCharacters: 2000, maxLines: 20, maxCopies: 1000,
    maxCommands: 200000, maxLabelSvgCharacters: 8000000, maxSheetSvgCharacters: 20000000 });
  var EPSILON = 1e-9;

  function fail(code, message, details) {
    var error = new Error(message);
    error.code = code;
    if (details) Object.keys(details).forEach(function (key) { error[key] = details[key]; });
    throw error;
  }

  function number(value, name, fallback, min, max) {
    if (value === undefined) value = fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      fail('INVALID_INPUT', name + '必须是 ' + min + ' 到 ' + max + ' 之间的有限数字。');
    }
    return value;
  }

  function boolean(value, name) {
    if (value === undefined) return false;
    if (typeof value !== 'boolean') fail('INVALID_INPUT', name + '必须是布尔值。');
    return value;
  }

  function format(value) {
    if (!Number.isFinite(value)) fail('INVALID_FONT', '字体产生了无效坐标，请更换字体。');
    var rounded = Math.round(value * 1000000) / 1000000;
    return String(Object.is(rounded, -0) ? 0 : rounded);
  }

  function color(value) {
    if (value === undefined) return '#000000';
    if (typeof value !== 'string' || !/^(?:#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|black|white)$/.test(value)) {
      fail('INVALID_FILL', '填充颜色仅支持 #RGB、#RRGGBB、black 或 white。');
    }
    return value;
  }

  function checkFont(font) {
    if (!font || typeof font.charToGlyph !== 'function' || typeof font.getKerningValue !== 'function' ||
        !Number.isFinite(font.unitsPerEm) || font.unitsPerEm < 16 || font.unitsPerEm > 65536) {
      fail('INVALID_FONT', '请先加载有效的 TTF 或 OTF 轮廓字体。');
    }
  }

  // These scripts require a shaping/bidi engine, which this small offline tool does not include.
  // Reject them explicitly rather than exporting plausible-looking but incorrect glyph order.
  function requiresShaping(cp) {
    return (cp >= 0x0590 && cp <= 0x109f) || (cp >= 0x1700 && cp <= 0x18af) ||
      (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0xa960 && cp <= 0xa97f) ||
      (cp >= 0xd7b0 && cp <= 0xd7ff) || (cp >= 0x10800 && cp <= 0x10fff) ||
      (cp >= 0x1900 && cp <= 0x1cff) || (cp >= 0xa800 && cp <= 0xaadf) ||
      (cp >= 0xabc0 && cp <= 0xabff) || (cp >= 0xfb1d && cp <= 0xfdff) ||
      (cp >= 0xfe70 && cp <= 0xfeff) || (cp >= 0x11000 && cp <= 0x11fff) ||
      (cp >= 0x1e900 && cp <= 0x1e95f);
  }

  function normalizeText(text) {
    if (typeof text !== 'string') fail('INVALID_INPUT', '请输入需要转曲的文字。');
    if (text.length > LIMITS.maxCharacters * 2 || Array.from(text).length > LIMITS.maxCharacters) {
      fail('TEXT_TOO_LONG', '文字最多支持 ' + LIMITS.maxCharacters + ' 个字符。');
    }
    text = text.replace(/\r\n?/g, '\n').normalize('NFC');
    if (!text.trim()) fail('EMPTY_TEXT', '请输入至少一个可见字符，不能只有空格或换行。');
    if (text.split('\n').length > LIMITS.maxLines) fail('TOO_MANY_LINES', '最多支持 ' + LIMITS.maxLines + ' 行文字。');
    Array.from(text).forEach(function (ch) {
      if (ch === '\n') return;
      var cp = ch.codePointAt(0);
      if (cp < 32 || (cp >= 0x7f && cp <= 0x9f) || /\p{Cf}/u.test(ch)) {
        fail('UNSUPPORTED_CHARACTER', '文字包含制表符、方向控制符或不可见控制字符，请移除后重试。');
      }
      if (requiresShaping(cp) || /\p{Mark}/u.test(ch)) {
        fail('UNSUPPORTED_SCRIPT', '当前版本不支持需要复杂塑形的文字、双向排版或未合成的组合符。请使用普通拉丁字母或字体覆盖的中日韩字符。');
      }
    });
    return text;
  }

  function lookupGlyph(font, ch) {
    var glyph;
    var index;
    try {
      // Query the cmap before charToGlyph: some valid constructed fonts return null
      // for absent code points, and their charToGlyph method would otherwise throw.
      if (typeof font.charToGlyphIndex === 'function') {
        index = font.charToGlyphIndex(ch);
        if (!Number.isInteger(index) || index <= 0) return null;
      }
      glyph = font.charToGlyph(ch);
    }
    catch (error) { fail('INVALID_FONT', '无法读取字体中的字符，请更换字体。'); }
    if (index === undefined) index = glyph && glyph.index;
    if (!glyph || !Number.isInteger(index) || index <= 0 || glyph.index === 0 || glyph.name === '.notdef') return null;
    return glyph;
  }

  function validateFontText(font, text) {
    checkFont(font);
    text = normalizeText(text);
    var missing = [];
    var seen = new Set();
    Array.from(text).forEach(function (ch) {
      if (ch === '\n' || seen.has(ch)) return;
      seen.add(ch);
      if (!lookupGlyph(font, ch)) missing.push(ch);
    });
    if (missing.length) {
      fail('MISSING_GLYPH', '当前字体缺少字符：' + missing.slice(0, 16).join(' ') +
        (missing.length > 16 ? ' …' : '') + '。请导入包含这些字符的字体。', { missingCharacters: missing });
    }
    return { text: text, lineCount: text.split('\n').length, missingCharacters: [] };
  }

  function glyphOutline(glyph, font, ch) {
    var path;
    try { path = glyph.getPath(0, 0, font.unitsPerEm); }
    catch (error) { fail('INVALID_FONT', '无法解析字符轮廓：' + ch + '。请更换字体。'); }
    if (!path || !Array.isArray(path.commands) || typeof path.getBoundingBox !== 'function') {
      fail('INVALID_FONT', '字体没有可读取的矢量轮廓。');
    }
    if (!Number.isFinite(glyph.advanceWidth) || glyph.advanceWidth < 0 || glyph.advanceWidth > 10000000) {
      fail('INVALID_FONT', '字体包含无效的字宽。');
    }
    if (!path.commands.length) {
      if (/\s/u.test(ch)) return { commands: [], advance: glyph.advanceWidth, glyph: glyph };
      fail('UNSUPPORTED_GLYPH_OUTLINE', '字符“' + ch + '”没有可导出的轮廓；当前版本不支持仅位图或彩色图层的字形。');
    }
    path.commands.forEach(function (command) {
      var fields = { M: ['x', 'y'], L: ['x', 'y'], Q: ['x1', 'y1', 'x', 'y'],
        C: ['x1', 'y1', 'x2', 'y2', 'x', 'y'], Z: [] }[command.type];
      if (!fields) fail('INVALID_FONT', '字体包含不支持的轮廓命令。');
      fields.forEach(function (field) {
        if (!Number.isFinite(command[field]) || Math.abs(command[field]) > 10000000) {
          fail('INVALID_FONT', '字体包含无效或过大的轮廓坐标。');
        }
      });
    });
    var bounds = path.getBoundingBox();
    if (!['x1', 'y1', 'x2', 'y2'].every(function (key) { return Number.isFinite(bounds[key]); }) ||
        bounds.x2 <= bounds.x1 || bounds.y2 <= bounds.y1) {
      fail('UNSUPPORTED_GLYPH_OUTLINE', '字符“' + ch + '”没有可见的闭合轮廓。');
    }
    return { commands: path.commands, bounds: bounds, advance: glyph.advanceWidth, glyph: glyph };
  }

  function svgRoot(width, height, content) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + format(width) + 'mm" height="' + format(height) +
      'mm" viewBox="0 0 ' + format(width) + ' ' + format(height) + '">' + content + '</svg>';
  }

  function pathsMarkup(paths, fill) {
    return paths.map(function (path) { return '<path fill="' + fill + '" d="' + path.d + '"/>'; }).join('');
  }

  /**
   * Fit visible outlines without stretching. Spacing values are final physical millimetres.
   * Every line is visually centred; lineGapMm separates line ink boxes. Empty lines use
   * one ascender/descender line box. scale is millimetres per font unit.
   */
  function layoutText(font, options) {
    options = options || {};
    var checked = validateFontText(font, options.text);
    var width = number(options.widthMm, '区域宽度', undefined, 0.1, 2000);
    var height = number(options.heightMm, '区域高度', undefined, 0.1, 2000);
    var padding = number(options.paddingMm, '内边距', 0, 0, 1000);
    var spacing = number(options.letterSpacingMm, '字距', 0, -100, 100);
    var gap = number(options.lineGapMm, '行间隙', 1, 0, 1000);
    var mirrored = boolean(options.mirror, '镜像');
    var fill = color(options.fill);
    var availableWidth = width - padding * 2;
    var availableHeight = height - padding * 2;
    if (availableWidth <= 0 || availableHeight <= 0) fail('INVALID_INPUT', '内边距过大，区域内没有可用空间。');
    var cache = new Map();
    var commandCount = 0;
    var visibleGlyphCount = 0;
    var nominalHeight = font.ascender - font.descender;
    if (!Number.isFinite(nominalHeight) || nominalHeight <= 0 || nominalHeight > 10000000) nominalHeight = font.unitsPerEm;
    var lines = checked.text.split('\n').map(function (lineText) {
      var pen = 0;
      var previous = null;
      var entries = [];
      var minY = Infinity;
      var maxY = -Infinity;
      Array.from(lineText).forEach(function (ch, index) {
        var outline = cache.get(ch);
        if (!outline) {
          outline = glyphOutline(lookupGlyph(font, ch), font, ch);
          cache.set(ch, outline);
        }
        if (previous) {
          var kern = font.getKerningValue(previous, outline.glyph);
          if (!Number.isFinite(kern) || Math.abs(kern) > 10000000) fail('INVALID_FONT', '字体包含无效的字偶距。');
          pen += kern;
        }
        if (outline.commands.length) {
          commandCount += outline.commands.length;
          if (commandCount > LIMITS.maxCommands) fail('TEXT_TOO_COMPLEX', '文字轮廓过于复杂，请减少文字或更换较简单的字体。');
          visibleGlyphCount++;
          entries.push({ outline: outline, baseX: pen, spacingX: index * spacing,
            left: pen + outline.bounds.x1, right: pen + outline.bounds.x2 });
          minY = Math.min(minY, outline.bounds.y1);
          maxY = Math.max(maxY, outline.bounds.y2);
        }
        pen += outline.advance;
        previous = outline.glyph;
      });
      if (!entries.length) { minY = 0; maxY = nominalHeight; }
      return { entries: entries, minY: minY, maxY: maxY, height: maxY - minY };
    });
    if (!visibleGlyphCount) fail('EMPTY_TEXT', '这些字符没有可见轮廓，请输入可见文字。');
    var totalUnitsHeight = lines.reduce(function (sum, line) { return sum + line.height; }, 0);
    var fixedHeight = (lines.length - 1) * gap;
    var lowerScale = 0;
    var upperScale = (availableHeight - fixedHeight) / totalUnitsHeight;

    // For every right/left outline edge pair: (right - left) * scale + spacingDelta <= width.
    // This solves both positive and negative physical spacing exactly, including overhangs;
    // binary-search fitting would be incorrect for some negative-spacing cases.
    lines.forEach(function (line) {
      line.entries.forEach(function (right) {
        line.entries.forEach(function (left) {
          var coefficient = right.right - left.left;
          var remaining = availableWidth - (right.spacingX - left.spacingX);
          if (coefficient > EPSILON) upperScale = Math.min(upperScale, remaining / coefficient);
          else if (coefficient < -EPSILON) lowerScale = Math.max(lowerScale, remaining / coefficient);
          else if (remaining < -EPSILON) upperScale = -1;
        });
      });
    });
    if (!Number.isFinite(upperScale) || upperScale <= EPSILON || lowerScale > upperScale + EPSILON) {
      fail('TEXT_DOES_NOT_FIT', '当前字距或行间隙无法放入区域。请缩小间距、减少文字或增大区域。');
    }
    var scale = upperScale;
    var blockHeight = totalUnitsHeight * scale + fixedHeight;
    var nextTop = (height - blockHeight) / 2;
    var paths = [];
    var ink = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };

    lines.forEach(function (line) {
      var minX = Infinity;
      var maxX = -Infinity;
      line.entries.forEach(function (entry) {
        minX = Math.min(minX, entry.left * scale + entry.spacingX);
        maxX = Math.max(maxX, entry.right * scale + entry.spacingX);
      });
      var shiftX = line.entries.length ? (width - (maxX - minX)) / 2 - minX : 0;
      var baseline = nextTop - line.minY * scale;
      var segments = [];
      line.entries.forEach(function (entry) {
        var xOffset = entry.baseX * scale + entry.spacingX + shiftX;
        function x(value) { var result = value * scale + xOffset; return format(mirrored ? width - result : result); }
        function y(value) { return format(value * scale + baseline); }
        entry.outline.commands.forEach(function (command) {
          if (command.type === 'M' || command.type === 'L') segments.push(command.type + x(command.x) + ' ' + y(command.y));
          else if (command.type === 'Q') segments.push('Q' + x(command.x1) + ' ' + y(command.y1) + ' ' + x(command.x) + ' ' + y(command.y));
          else if (command.type === 'C') segments.push('C' + x(command.x1) + ' ' + y(command.y1) + ' ' + x(command.x2) + ' ' + y(command.y2) + ' ' + x(command.x) + ' ' + y(command.y));
          else segments.push('Z');
        });
        var bounds = entry.outline.bounds;
        var x1 = bounds.x1 * scale + xOffset;
        var x2 = bounds.x2 * scale + xOffset;
        ink.x1 = Math.min(ink.x1, mirrored ? width - x2 : x1);
        ink.x2 = Math.max(ink.x2, mirrored ? width - x1 : x2);
        ink.y1 = Math.min(ink.y1, bounds.y1 * scale + baseline);
        ink.y2 = Math.max(ink.y2, bounds.y2 * scale + baseline);
      });
      if (segments.length) paths.push({ d: segments.join(' ') });
      nextTop += line.height * scale + gap;
    });
    var svg = svgRoot(width, height, pathsMarkup(paths, fill));
    if (svg.length > LIMITS.maxLabelSvgCharacters) fail('TEXT_TOO_COMPLEX', '导出轮廓过大，请减少文字。');
    return { svg: svg, paths: paths, widthMm: width, heightMm: height, fill: fill,
      contentBounds: { x: ink.x1, y: ink.y1, width: ink.x2 - ink.x1, height: ink.y2 - ink.y1 },
      scale: scale, fontSizeMm: scale * font.unitsPerEm, lineCount: lines.length,
      mirrored: mirrored, visibleGlyphCount: visibleGlyphCount, normalizedText: checked.text, warnings: [] };
  }

  /** Repeat already-outlined labels on a page. No silent truncation and no font references. */
  function composeSheet(layout, options) {
    options = options || {};
    if (!layout || !Array.isArray(layout.paths) || !layout.paths.length || layout.paths.length > LIMITS.maxLines) {
      fail('INVALID_LAYOUT', '请先生成有效的文字轮廓。');
    }
    var labelWidth = number(layout.widthMm, '标签宽度', undefined, 0.1, 2000);
    var labelHeight = number(layout.heightMm, '标签高度', undefined, 0.1, 2000);
    var fill = color(layout.fill);
    var pathCharacters = 0;
    layout.paths.forEach(function (path) {
      if (!path || typeof path.d !== 'string' || !path.d.length || !/^[MLCQZ0-9.,+\-\s]+$/.test(path.d)) {
        fail('INVALID_LAYOUT', '文字轮廓数据无效，请重新生成。');
      }
      pathCharacters += path.d.length;
    });
    if (pathCharacters > LIMITS.maxLabelSvgCharacters) fail('INVALID_LAYOUT', '文字轮廓过大，请重新生成较短的文字。');
    var pageWidth = number(options.pageWidthMm, '纸张宽度', 210, 1, 2000);
    var pageHeight = number(options.pageHeightMm, '纸张高度', 297, 1, 2000);
    var margin = number(options.marginMm, '纸张边距', 10, 0, 1000);
    var gapX = number(options.gapXmm, '横向间隔', 3, 0, 1000);
    var gapY = number(options.gapYmm, '纵向间隔', 3, 0, 1000);
    var guides = boolean(options.guides, '辅助框');
    var usableWidth = pageWidth - 2 * margin;
    var usableHeight = pageHeight - 2 * margin;
    if (usableWidth <= 0 || usableHeight <= 0) fail('INVALID_INPUT', '纸张边距过大，没有可用区域。');
    var cols = Math.max(0, Math.floor((usableWidth + gapX + EPSILON) / (labelWidth + gapX)));
    var rows = Math.max(0, Math.floor((usableHeight + gapY + EPSILON) / (labelHeight + gapY)));
    var capacity = cols * rows;
    if (!capacity) fail('LABEL_TOO_LARGE', '当前标签无法放入纸张，请缩小标签或调整纸张边距。', { capacity: 0 });
    var count = number(options.count, '排版数量', capacity, 1, LIMITS.maxCopies);
    if (!Number.isInteger(count)) fail('INVALID_INPUT', '排版数量必须是整数。');
    if (count > capacity) fail('OVER_CAPACITY', '当前纸张最多放置 ' + capacity + ' 个标签，请减少数量或调整间距。', { capacity: capacity, requestedCount: count });
    var labelMarkup = pathsMarkup(layout.paths, fill);
    if ((labelMarkup.length + 300) * count > LIMITS.maxSheetSvgCharacters) {
      fail('SHEET_TOO_COMPLEX', '整页 SVG 过大，请减少排版数量或文字复杂度。');
    }
    var body = [];
    var placements = [];
    for (var index = 0; index < count; index++) {
      var col = index % cols;
      var row = Math.floor(index / cols);
      var x = margin + col * (labelWidth + gapX);
      var y = margin + row * (labelHeight + gapY);
      placements.push({ x: x, y: y, row: row, col: col });
      body.push('<g transform="translate(' + format(x) + ' ' + format(y) + ')">' + labelMarkup + '</g>');
      if (guides) body.push('<rect x="' + format(x) + '" y="' + format(y) + '" width="' + format(labelWidth) +
        '" height="' + format(labelHeight) + '" fill="none" stroke="#9ca3af" stroke-width="0.1" stroke-dasharray="1 1"/>');
    }
    return { svg: svgRoot(pageWidth, pageHeight, body.join('')), capacity: capacity, actualCount: count,
      cols: cols, rows: rows, pageWidthMm: pageWidth, pageHeightMm: pageHeight, placements: placements };
  }

  return Object.freeze({ version: '0.1.0', limits: LIMITS, validateFontText: validateFontText,
    layoutText: layoutText, composeSheet: composeSheet });
});
