(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var Engine = window.OpenPrintTextEngine;
  var currentFont = null;
  var demoFont = null;
  var fontFailure = '';
  var fontLoading = false;
  var fontRequest = 0;
  var currentLayout = null;
  var currentSheet = null;
  var pageCapacity = 0;
  var mode = 'single';
  var renderTimer = null;

  function number(id) {
    var value = $(id).value.trim();
    return value === '' ? NaN : Number(value);
  }
  function mm(value) { return Number(value.toFixed(2)).toString(); }
  function errorMessage(error) { return error && error.message ? error.message : '处理失败，请检查文字和字体后重试。'; }
  function setError(message) {
    $('error-message').textContent = message;
    $('error-message').hidden = !message;
  }
  function mountSVG(host, svg) {
    var doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') {
      throw new Error('SVG 生成失败，请检查输入后重试。');
    }
    host.replaceChildren(document.importNode(doc.documentElement, true));
  }
  function disableDownloads() {
    ['download-single', 'download-sheet', 'print-sheet', 'fill-page'].forEach(function (id) { $(id).disabled = true; });
  }
  function sizeArtboard() {
    if (!currentLayout || mode !== 'single') return;
    var stage = $('single-stage');
    var availableWidth = Math.max(80, stage.clientWidth - (window.innerWidth < 520 ? 76 : 110));
    var availableHeight = Math.max(70, stage.clientHeight - 45);
    var width = Math.min(availableWidth, availableHeight * currentLayout.widthMm / currentLayout.heightMm);
    $('artboard').style.width = width + 'px';
    $('artboard').style.aspectRatio = currentLayout.widthMm + '/' + currentLayout.heightMm;
  }
  function updateMode(nextMode) {
    mode = nextMode;
    ['single', 'sheet'].forEach(function (key) {
      var active = mode === key;
      $('tab-' + key).classList.toggle('active', active);
      $('tab-' + key).setAttribute('aria-selected', String(active));
      $('tab-' + key).tabIndex = active ? 0 : -1;
      $('panel-' + key).hidden = !active;
    });
    updateChip();
    requestAnimationFrame(sizeArtboard);
  }
  function updateChip() {
    $('preview-chip').textContent = mode === 'sheet' ? 'A4 · 210 × 297 mm' : (currentLayout ? mm(currentLayout.widthMm) + ' × ' + mm(currentLayout.heightMm) + ' mm' : '等待有效输入');
  }
  function clearPreview() {
    currentLayout = null;
    currentSheet = null;
    pageCapacity = 0;
    $('single-svg').replaceChildren();
    $('sheet-svg').replaceChildren();
    $('ink-size').textContent = '—';
    $('path-count').textContent = '—';
    $('capacity-label').textContent = 'A4 · 四边页边距 10 mm';
    disableDownloads();
    updateChip();
  }
  function render() {
    clearTimeout(renderTimer);
    $('char-count').textContent = Array.from($('text-input').value).length + ' 个字符';
    $('download-status').textContent = '';
    disableDownloads();
    currentSheet = null;
    if (fontLoading || fontFailure || !currentFont || !Engine) {
      clearPreview();
      setError(fontFailure || (fontLoading ? '正在读取字体，请稍候…' : '工具未能完成加载，请重新打开页面。'));
      return;
    }
    try {
      currentLayout = Engine.layoutText(currentFont, {
        text: $('text-input').value,
        widthMm: number('width-mm'),
        heightMm: number('height-mm'),
        paddingMm: number('padding-mm'),
        letterSpacingMm: number('spacing-mm'),
        lineGapMm: number('line-gap-mm'),
        mirror: $('mirror').checked,
        fill: '#000000'
      });
      mountSVG($('single-svg'), currentLayout.svg);
      $('ruler-x').textContent = mm(currentLayout.widthMm) + ' mm';
      $('ruler-y').textContent = mm(currentLayout.heightMm) + ' mm';
      $('ink-size').textContent = mm(currentLayout.contentBounds.width) + ' × ' + mm(currentLayout.contentBounds.height) + ' mm';
      $('path-count').textContent = currentLayout.paths.length + ' 条 · ' + currentLayout.lineCount + ' 行';
      $('direction').textContent = ($('mirror').checked ? '镜像' : '正向') + ' · 黑色实心';
      $('download-single').disabled = false;
      setError('');
    } catch (error) {
      clearPreview();
      setError(errorMessage(error));
      return;
    }
    var sheetOptions = {
      pageWidthMm: 210, pageHeightMm: 297, marginMm: 10,
      gapXmm: number('sheet-gap-mm'), gapYmm: number('sheet-gap-mm'),
      count: number('copy-count'), guides: $('guides').checked
    };
    try {
      var capacityOptions = Object.assign({}, sheetOptions, { count: 1 });
      var capacityResult = Engine.composeSheet(currentLayout, capacityOptions);
      pageCapacity = capacityResult.capacity;
      $('capacity-label').textContent = '每页可排 ' + pageCapacity + ' 枚 · 页边距 10 mm';
      $('fill-page').disabled = false;
      currentSheet = Engine.composeSheet(currentLayout, sheetOptions);
      mountSVG($('sheet-svg'), currentSheet.svg);
      $('download-sheet').disabled = false;
      $('print-sheet').disabled = false;
    } catch (error) {
      $('sheet-svg').replaceChildren();
      setError('A4 拼版：' + errorMessage(error) + ' 单件 SVG 仍可正常下载。');
    }
    updateChip();
    sizeArtboard();
  }
  function scheduleRender() {
    disableDownloads();
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 100);
  }
  function readableFontName(font) {
    var names = font.names || {};
    var table = names.fullName || names.fontFamily || {};
    return table.zh || table.en || Object.values(table).find(function (value) { return typeof value === 'string'; }) || '自定义字体';
  }
  function loadDemo() {
    fontRequest += 1;
    fontFailure = '';
    fontLoading = false;
    try {
      if (!demoFont) {
        if (!window.opentype || !window.OPENPRINTTEXT_DEMO_FONT_BASE64) throw new Error('示例字体未加载，请确认下载包已完整解压。');
        var binary = atob(window.OPENPRINTTEXT_DEMO_FONT_BASE64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        demoFont = window.opentype.parse(bytes.buffer);
      }
      currentFont = demoFont;
      $('font-name').textContent = readableFontName(currentFont);
      $('font-detail').textContent = '示例字体 · 适合英文';
      $('font-file').value = '';
    } catch (error) {
      currentFont = null;
      fontFailure = errorMessage(error);
    }
    render();
  }
  async function loadFile(file) {
    if (!file) return;
    var request = ++fontRequest;
    fontLoading = true;
    fontFailure = '';
    render();
    try {
      if (!/\.(ttf|otf)$/i.test(file.name)) throw new Error('请加载静态 TTF 或 OTF 字体；当前不支持 TTC / WOFF 字体。');
      if (file.size > 20 * 1024 * 1024) throw new Error('字体文件超过 20 MB，请使用较小的静态字体文件。');
      var data = await file.arrayBuffer();
      if (request !== fontRequest) return;
      var font = window.opentype.parse(data);
      if (font.tables && font.tables.fvar) throw new Error('当前不支持可变字体。请使用该字体的静态 TTF / OTF 版本。');
      if (!font.glyphs || !font.unitsPerEm) throw new Error('这个字体缺少可用的轮廓数据，请换一个字体文件。');
      currentFont = font;
      $('font-name').textContent = readableFontName(font);
      $('font-detail').textContent = '本机字体 · ' + (file.size / 1024 / 1024).toFixed(2) + ' MB';
    } catch (error) {
      if (request !== fontRequest) return;
      currentFont = null;
      fontFailure = '字体加载失败：' + errorMessage(error) + ' 可点击“重置”恢复示例字体。';
      $('font-name').textContent = '未加载有效字体';
      $('font-detail').textContent = '请换一个字体或点击重置';
    }
    fontLoading = false;
    render();
  }
  function download(svg, name) {
    var blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    $('download-status').textContent = '已发起下载：' + name + '。若浏览器打开了预览，请使用“保存文件”。';
  }

  ['text-input', 'width-mm', 'height-mm', 'padding-mm', 'spacing-mm', 'line-gap-mm', 'copy-count', 'sheet-gap-mm'].forEach(function (id) { $(id).addEventListener('input', scheduleRender); });
  ['mirror', 'guides'].forEach(function (id) { $(id).addEventListener('change', render); });
  document.querySelectorAll('[data-text]').forEach(function (button) {
    button.addEventListener('click', function () { $('text-input').value = button.dataset.text; render(); });
  });
  $('font-file').addEventListener('change', function (event) { loadFile(event.target.files[0]); });
  $('reset-font').addEventListener('click', loadDemo);
  $('tab-single').addEventListener('click', function () { updateMode('single'); });
  $('tab-sheet').addEventListener('click', function () { updateMode('sheet'); });
  document.querySelector('[role="tablist"]').addEventListener('keydown', function (event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    updateMode(event.key === 'Home' ? 'single' : event.key === 'End' ? 'sheet' : mode === 'single' ? 'sheet' : 'single');
    $('tab-' + mode).focus();
  });
  $('fill-page').addEventListener('click', function () {
    $('copy-count').value = Math.min(Engine.limits.maxCopies, pageCapacity);
    render();
    updateMode('sheet');
    if (pageCapacity > Engine.limits.maxCopies) $('download-status').textContent = '为保持浏览器响应，单次导出最多 ' + Engine.limits.maxCopies + ' 枚。';
  });
  $('download-single').addEventListener('click', function () {
    if (!currentLayout) return;
    download(currentLayout.svg, 'openprinttext-label-' + mm(currentLayout.widthMm) + 'x' + mm(currentLayout.heightMm) + 'mm' + ($('mirror').checked ? '-mirror' : '') + '.svg');
  });
  $('download-sheet').addEventListener('click', function () {
    if (!currentSheet) return;
    download(currentSheet.svg, 'openprinttext-A4-' + currentSheet.actualCount + 'pcs' + ($('mirror').checked ? '-mirror' : '') + '.svg');
  });
  $('print-sheet').addEventListener('click', function () {
    if (!currentSheet) return;
    mountSVG($('print-area'), currentSheet.svg);
    window.print();
  });
  window.addEventListener('afterprint', function () { $('print-area').replaceChildren(); });
  var dialog = $('help-dialog');
  $('help-button').addEventListener('click', function () { dialog.showModal(); });
  $('close-help').addEventListener('click', function () { dialog.close(); });
  $('help-done').addEventListener('click', function () { dialog.close(); $('text-input').focus(); });
  dialog.addEventListener('click', function (event) { if (event.target === dialog) { var bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
  window.addEventListener('resize', sizeArtboard);
  if (window.ResizeObserver) new ResizeObserver(sizeArtboard).observe($('single-stage'));
  loadDemo();
}());
