// pdf-viewer.js
// 扩展内 PDF 阅读器核心脚本
// 依赖：viewer.html 中本地引入 pdf.js（不要用 CDN）
// 例如：
// <script src="./pdfjs/pdf.min.js"></script>
// <script src="./pdf-viewer.js"></script>

(function () {
  if (window.__vocabPdfViewerLoaded) {
    console.log('pdf-viewer.js 已加载，跳过重复执行');
    return;
  }
  window.__vocabPdfViewerLoaded = true;

  // ========== 基础状态 ==========  
  let pdfDoc = null;
  let currentScale = 1.35;
  let renderedPages = new Map(); // pageNumber -> { text, items }
  let saveButton = null;
  let isSaving = false;
  let currentSelection = '';
  let currentSelectionMeta = null;
  let lastMouseEvent = null;
  let currentPdfUrl = '';
  let currentPdfName = '';
  let renderTaskId = 0;

  // ========== 初始化 ==========
  init();

  function init() {
    ensurePdfJsReady();
    ensureLayout();
    bindGlobalEvents();

    const fileParam = new URLSearchParams(location.search).get('file');
    if (fileParam) {
      currentPdfUrl = decodeURIComponent(fileParam);
      currentPdfName = extractFileName(currentPdfUrl);
      updateTopBarTitle(currentPdfName);
      loadPdfFromUrl(currentPdfUrl);
    } else {
      showStatus('请选择 PDF 文件，或从 .pdf 页面自动跳转进入。', 'info');
    }
  }

  function ensurePdfJsReady() {
    if (!window.pdfjsLib) {
      console.error('pdfjsLib 未加载，请先在 viewer.html 里本地引入 pdf.min.js');
      showStatus('pdf.js 未加载，请检查 viewer.html 是否正确引入本地 pdf.min.js', 'error');
      return;
    }

    // 必须是本地 worker，MV3 不允许远程托管代码
    // 例如把 pdf.worker.min.js 放在 /pdfjs/ 目录
    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdfjs/pdf.worker.min.js');
    } catch (e) {
      console.warn('设置 pdf.worker 路径失败:', e);
    }
  }

  function ensureLayout() {
    // 顶部工具栏
    let app = document.getElementById('pdf-reader-app');
    if (!app) {
      app = document.createElement('div');
      app.id = 'pdf-reader-app';
      document.body.appendChild(app);
    }

    if (!document.getElementById('pdf-reader-style')) {
      const style = document.createElement('style');
      style.id = 'pdf-reader-style';
      style.textContent = `
        body {
          margin: 0;
          padding: 0;
          background: #f3f4f6;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #222;
        }

        #pdf-reader-toolbar {
          position: sticky;
          top: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: #ffffff;
          border-bottom: 1px solid #e5e7eb;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }

        #pdf-reader-title {
          flex: 1;
          font-weight: 600;
          font-size: 14px;
          color: #111827;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pdf-reader-btn {
          border: none;
          background: #2563eb;
          color: #fff;
          padding: 8px 12px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
        }

        .pdf-reader-btn:hover {
          background: #1d4ed8;
        }

        .pdf-reader-btn.secondary {
          background: #e5e7eb;
          color: #111827;
        }

        .pdf-reader-btn.secondary:hover {
          background: #d1d5db;
        }

        #pdf-file-input {
          display: none;
        }

        #pdf-reader-status {
          padding: 10px 16px;
          font-size: 13px;
          color: #374151;
          background: #eef2ff;
          border-bottom: 1px solid #dbeafe;
          display: none;
        }

        #pdf-reader-container {
          width: min(980px, calc(100vw - 24px));
          margin: 16px auto 40px;
        }

        .pdf-page-wrap {
          position: relative;
          margin: 0 auto 18px;
          background: #fff;
          box-shadow: 0 4px 14px rgba(0,0,0,0.12);
          border-radius: 8px;
          overflow: hidden;
        }

        .pdf-page-meta {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 3;
          background: rgba(17,24,39,0.72);
          color: #fff;
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 999px;
          pointer-events: none;
        }

        canvas.pdf-page-canvas {
          display: block;
        }

        .textLayer {
          position: absolute;
          inset: 0;
          overflow: hidden;
          opacity: 1;
          line-height: 1;
          -webkit-text-size-adjust: none;
          -moz-text-size-adjust: none;
          text-size-adjust: none;
          forced-color-adjust: none;
          transform-origin: 0 0;
          z-index: 2;
        }

        .textLayer span,
        .textLayer br {
          color: transparent;
          position: absolute;
          white-space: pre;
          cursor: text;
          transform-origin: 0 0;
        }

        .textLayer ::selection {
          background: rgba(59, 130, 246, 0.28);
        }

        #vocab-save-button {
          position: fixed !important;
          z-index: 2147483647 !important;
          background: #4285f4 !important;
          color: white !important;
          border: none !important;
          border-radius: 8px !important;
          padding: 10px 18px !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          box-shadow: 0 8px 20px rgba(0,0,0,0.22) !important;
          display: none;
        }

        #vocab-translation-tip {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 2147483647;
          width: min(420px, calc(100vw - 32px));
          border-radius: 10px;
          box-shadow: 0 10px 28px rgba(0,0,0,0.18);
          background: #fff;
          overflow: hidden;
        }

        .vocab-tip-inner {
          padding: 14px 16px;
        }

        .vocab-tip-title {
          font-size: 18px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .vocab-tip-translation {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 6px;
        }

        .vocab-tip-pos {
          font-size: 13px;
          color: #6b7280;
          margin-bottom: 8px;
          font-style: italic;
        }

        .vocab-tip-definition {
          font-size: 14px;
          line-height: 1.6;
          color: #111827;
          white-space: normal;
          word-break: break-word;
        }

        .vocab-tip-close {
          position: absolute;
          top: 8px;
          right: 10px;
          border: none;
          background: transparent;
          color: #9ca3af;
          cursor: pointer;
          font-size: 16px;
        }
      `;
      document.head.appendChild(style);
    }

    let toolbar = document.getElementById('pdf-reader-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'pdf-reader-toolbar';
      toolbar.innerHTML = `
        <button id="pdf-open-btn" class="pdf-reader-btn">打开 PDF</button>
        <input id="pdf-file-input" type="file" accept="application/pdf" />
        <button id="pdf-zoom-out" class="pdf-reader-btn secondary">缩小</button>
        <button id="pdf-zoom-in" class="pdf-reader-btn secondary">放大</button>
        <div id="pdf-reader-title">未加载 PDF</div>
      `;
      app.appendChild(toolbar);
    }

    let status = document.getElementById('pdf-reader-status');
    if (!status) {
      status = document.createElement('div');
      status.id = 'pdf-reader-status';
      app.appendChild(status);
    }

    let container = document.getElementById('pdf-reader-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pdf-reader-container';
      app.appendChild(container);
    }

    if (!saveButton) {
      createSaveButton();
    }

    // 工具栏事件
    document.getElementById('pdf-open-btn')?.addEventListener('click', () => {
      document.getElementById('pdf-file-input')?.click();
    });

    document.getElementById('pdf-file-input')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      currentPdfName = file.name;
      updateTopBarTitle(currentPdfName);
      await loadPdfFromFile(file);
    });

    document.getElementById('pdf-zoom-in')?.addEventListener('click', async () => {
      if (!pdfDoc) return;
      currentScale = Math.min(2.5, currentScale + 0.15);
      await rerenderAllPages();
    });

    document.getElementById('pdf-zoom-out')?.addEventListener('click', async () => {
      if (!pdfDoc) return;
      currentScale = Math.max(0.7, currentScale - 0.15);
      await rerenderAllPages();
    });
  }

  function bindGlobalEvents() {
    document.addEventListener('mousemove', (e) => {
      lastMouseEvent = e;
    }, { passive: true });

    document.addEventListener('mouseup', handleSelectionChange, true);
    document.addEventListener('keyup', handleSelectionChange, true);
    document.addEventListener('selectionchange', () => {
      setTimeout(handleSelectionChange, 50);
    }, true);

    window.addEventListener('pagehide', cleanup);
    window.addEventListener('beforeunload', cleanup);
  }

  function cleanup() {
    if (saveButton) {
      saveButton.remove();
      saveButton = null;
    }
  }

  function updateTopBarTitle(text) {
    const el = document.getElementById('pdf-reader-title');
    if (el) el.textContent = text || '未加载 PDF';
    document.title = text ? `PDF 阅读 - ${text}` : 'PDF 阅读';
  }

  function showStatus(message, type = 'info') {
    const el = document.getElementById('pdf-reader-status');
    if (!el) return;

    el.style.display = 'block';
    el.textContent = message;

    if (type === 'error') {
      el.style.background = '#fee2e2';
      el.style.color = '#991b1b';
      el.style.borderBottom = '1px solid #fecaca';
    } else if (type === 'success') {
      el.style.background = '#dcfce7';
      el.style.color = '#166534';
      el.style.borderBottom = '1px solid #bbf7d0';
    } else {
      el.style.background = '#eef2ff';
      el.style.color = '#374151';
      el.style.borderBottom = '1px solid #dbeafe';
    }
  }

  async function loadPdfFromUrl(url) {
    if (!window.pdfjsLib) return;

    const myTaskId = ++renderTaskId;
    clearPages();
    renderedPages.clear();

    showStatus('正在加载 PDF...', 'info');

    try {
      pdfDoc = await window.pdfjsLib.getDocument({
        url,
        withCredentials: false
      }).promise;

      if (myTaskId !== renderTaskId) return;

      showStatus(`加载成功：共 ${pdfDoc.numPages} 页`, 'success');
      await renderAllPages(myTaskId);
    } catch (error) {
      console.error('加载 PDF URL 失败:', error);
      showStatus(
        '无法直接读取该 PDF。请确认已开启"Allow access to file URLs"，或点击"打开 PDF"手动选择文件。',
        'error'
      );
    }
  }

  async function loadPdfFromFile(file) {
    if (!window.pdfjsLib) return;

    const myTaskId = ++renderTaskId;
    clearPages();
    renderedPages.clear();

    showStatus('正在读取本地 PDF...', 'info');

    try {
      const buffer = await file.arrayBuffer();
      pdfDoc = await window.pdfjsLib.getDocument({
        data: buffer
      }).promise;

      if (myTaskId !== renderTaskId) return;

      showStatus(`加载成功：共 ${pdfDoc.numPages} 页`, 'success');
      await renderAllPages(myTaskId);
    } catch (error) {
      console.error('加载本地 PDF 失败:', error);
      showStatus('读取 PDF 失败，请确认文件未损坏。', 'error');
    }
  }

  function clearPages() {
    const container = document.getElementById('pdf-reader-container');
    if (container) {
      container.innerHTML = '';
    }
  }

  async function rerenderAllPages() {
    if (!pdfDoc) return;
    const myTaskId = ++renderTaskId;
    clearPages();
    renderedPages.clear();
    showStatus(`正在重新渲染（缩放 ${currentScale.toFixed(2)}）...`, 'info');
    await renderAllPages(myTaskId);
    showStatus(`渲染完成（缩放 ${currentScale.toFixed(2)}）`, 'success');
  }

  async function renderAllPages(myTaskId) {
    const container = document.getElementById('pdf-reader-container');
    if (!container || !pdfDoc) return;

    for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
      if (myTaskId !== renderTaskId) return;
      await renderPage(pageNumber, container, myTaskId);
    }
  }

  async function renderPage(pageNumber, container, myTaskId) {
    const page = await pdfDoc.getPage(pageNumber);
    if (myTaskId !== renderTaskId) return;

    const viewport = page.getViewport({ scale: currentScale });

    const wrap = document.createElement('div');
    wrap.className = 'pdf-page-wrap';
    wrap.dataset.pageNumber = String(pageNumber);
    wrap.style.width = `${viewport.width}px`;
    wrap.style.minHeight = `${viewport.height}px`;

    const meta = document.createElement('div');
    meta.className = 'pdf-page-meta';
    meta.textContent = `第 ${pageNumber} 页`;
    wrap.appendChild(meta);

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page-canvas';
    const ctx = canvas.getContext('2d');

    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const transform = outputScale !== 1
      ? [outputScale, 0, 0, outputScale, 0, 0]
      : null;

    wrap.appendChild(canvas);
    container.appendChild(wrap);

    await page.render({
      canvasContext: ctx,
      viewport,
      transform
    }).promise;

    const textContent = await page.getTextContent();
    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    textLayer.style.width = `${viewport.width}px`;
    textLayer.style.height = `${viewport.height}px`;

    wrap.appendChild(textLayer);

    // 兼容常见 pdf.js 构建
    if (typeof window.pdfjsLib.renderTextLayer === 'function') {
      await window.pdfjsLib.renderTextLayer({
        textContent,
        container: textLayer,
        viewport,
        textDivs: []
      }).promise?.catch?.(() => {}) || undefined;
    } else {
      // 如果当前 pdf.js 版本没有 renderTextLayer，可退化为简单 spans
      buildFallbackTextLayer(textLayer, textContent);
    }

    renderedPages.set(pageNumber, buildTextIndex(textContent));
  }

  function buildFallbackTextLayer(container, textContent) {
    // 退化方案：至少让文本可被选择、可做上下文
    // 位置不如官方 textLayer 准，但总比没有强
    let y = 8;
    for (const item of textContent.items || []) {
      const span = document.createElement('span');
      span.textContent = item.str || '';
      span.style.left = '8px';
      span.style.top = `${y}px`;
      span.style.fontSize = '12px';
      span.style.color = 'transparent';
      span.style.position = 'absolute';
      container.appendChild(span);
      y += 14;
    }
  }

  function buildTextIndex(textContent) {
    const items = (textContent?.items || []).map(item => (item.str || '').trim()).filter(Boolean);
    const text = normalizeContextText(items.join(' '));
    return { text, items };
  }

  function normalizeContextText(text) {
    return (text || '')
      .replace(/\s+/g, ' ')
      .replace(/\u0000/g, '')
      .trim();
  }

  function handleSelectionChange() {
    if (isSaving) return;

    const data = getCurrentSelectionData();
    if (!data || !data.text) {
      hideSaveButton();
      return;
    }

    if (data.text.length > 100) {
      hideSaveButton();
      return;
    }

    currentSelection = data.text;
    currentSelectionMeta = data;
    showSaveButtonAtRect(data.rect);
  }

  function getCurrentSelectionData() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const text = selection.toString().trim();
    if (!text) return null;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    let pageWrap = null;
    let node = range.commonAncestorContainer;

    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }

    while (node && node !== document.body) {
      if (node.classList?.contains('pdf-page-wrap')) {
        pageWrap = node;
        break;
      }
      node = node.parentElement;
    }

    if (!pageWrap) {
      const fromPoint = document.elementFromPoint(
        rect.left + Math.min(5, rect.width || 0),
        rect.top + Math.min(5, rect.height || 0)
      );
      let p = fromPoint;
      while (p && p !== document.body) {
        if (p.classList?.contains('pdf-page-wrap')) {
          pageWrap = p;
          break;
        }
        p = p.parentElement;
      }
    }

    const pageNumber = pageWrap ? parseInt(pageWrap.dataset.pageNumber, 10) : null;

    return {
      text,
      rect,
      pageNumber,
      pageWrap
    };
  }

  function createSaveButton() {
    saveButton = document.createElement('button');
    saveButton.id = 'vocab-save-button';
    saveButton.textContent = '保存生词';
    saveButton.addEventListener('click', handleSaveClick);
    document.body.appendChild(saveButton);
  }

  function showSaveButtonAtRect(rect) {
    if (!saveButton || !rect) return;

    const buttonWidth = 120;
    const buttonHeight = 44;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.right + 12;
    let top = rect.bottom + 12;

    if (left + buttonWidth > viewportWidth) {
      left = rect.left - buttonWidth - 12;
    }
    if (top + buttonHeight > viewportHeight) {
      top = rect.top - buttonHeight - 12;
    }

    if (left < 10 && lastMouseEvent) {
      left = Math.min(lastMouseEvent.clientX + 18, viewportWidth - buttonWidth - 10);
    }
    if (top < 10 && lastMouseEvent) {
      top = Math.min(lastMouseEvent.clientY + 18, viewportHeight - buttonHeight - 10);
    }

    left = Math.max(10, Math.min(left, viewportWidth - buttonWidth - 10));
    top = Math.max(10, Math.min(top, viewportHeight - buttonHeight - 10));

    saveButton.style.display = 'block';
    saveButton.style.left = `${left}px`;
    saveButton.style.top = `${top}px`;
  }

  function hideSaveButton() {
    if (saveButton && !isSaving) {
      saveButton.style.display = 'none';
    }
  }

  async function handleSaveClick() {
    if (!currentSelection || !currentSelectionMeta || isSaving) return;

    isSaving = true;
    saveButton.textContent = '保存中...';
    saveButton.disabled = true;
    saveButton.style.background = '#5c6bc0';

    const context = buildSelectionContext(currentSelectionMeta);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_WORD',
        word: currentSelection,
        context
      });

      if (response && (response.status === 'saved' || response.status === 'updated')) {
        saveButton.textContent = '✓ 已保存';
        saveButton.style.background = '#16a34a';

        const t = response.translation || {};
        showTranslationTip(
          currentSelection,
          t.translation || '保存成功',
          t.pos || '',
          t.definition || '生词已保存',
          (t.error || '').includes('无效') ? 'error' : 'success'
        );
      } else {
        showTranslationTip(
          currentSelection,
          '保存失败',
          '',
          response?.error || '未知错误',
          'error'
        );
        saveButton.textContent = '✗ 失败';
        saveButton.style.background = '#dc2626';
      }
    } catch (error) {
      console.error('保存失败:', error);
      showTranslationTip(
        currentSelection,
        '保存失败',
        '',
        error?.message || '通信失败',
        'error'
      );
      saveButton.textContent = '✗ 失败';
      saveButton.style.background = '#dc2626';
    }

    setTimeout(() => {
      if (!saveButton) return;
      saveButton.textContent = '保存生词';
      saveButton.disabled = false;
      saveButton.style.background = '#4285f4';
      hideSaveButton();
      isSaving = false;
    }, 1600);
  }

  function buildSelectionContext(meta) {
    const selectedText = meta.text || '';
    const pageNumber = meta.pageNumber || '';
    const pageText = renderedPages.get(pageNumber)?.text || '';

    let contextText = selectedText;

    if (pageText && selectedText) {
      const normalizedSelected = normalizeContextText(selectedText);
      const index = pageText.toLowerCase().indexOf(normalizedSelected.toLowerCase());

      if (index !== -1) {
        const start = Math.max(0, index - 120);
        const end = Math.min(pageText.length, index + normalizedSelected.length + 120);
        contextText = pageText.slice(start, end);
      } else {
        // 找不到时退化到“包含若干 item 的页文本前段”
        contextText = pageText.slice(0, 240) || selectedText;
      }
    }

    return {
      text: contextText,
      title: currentPdfName || document.title || 'PDF 文档',
      url: currentPdfUrl || location.href,
      pageInfo: pageNumber ? `第${pageNumber}页` : ''
    };
  }

  function showTranslationTip(word, translation, pos, definition, type = 'info') {
    const old = document.getElementById('vocab-translation-tip');
    if (old) old.remove();

    const tip = document.createElement('div');
    tip.id = 'vocab-translation-tip';

    let borderColor = '#f59e0b';
    let bg = '#fff7ed';
    let titleColor = '#b45309';

    if (type === 'success') {
      borderColor = '#16a34a';
      bg = '#f0fdf4';
      titleColor = '#166534';
    } else if (type === 'error') {
      borderColor = '#dc2626';
      bg = '#fef2f2';
      titleColor = '#991b1b';
    }

    tip.style.borderLeft = `6px solid ${borderColor}`;
    tip.style.background = bg;

    tip.innerHTML = `
      <button class="vocab-tip-close" aria-label="关闭">✕</button>
      <div class="vocab-tip-inner">
        <div class="vocab-tip-title" style="color:${titleColor};">${escapeHtml(word)}</div>
        <div class="vocab-tip-translation" style="color:${borderColor};">${escapeHtml(translation)}</div>
        ${pos ? `<div class="vocab-tip-pos">${escapeHtml(pos)}</div>` : ''}
        <div class="vocab-tip-definition">${escapeHtml(definition || '')}</div>
      </div>
    `;

    document.body.appendChild(tip);

    tip.querySelector('.vocab-tip-close')?.addEventListener('click', () => tip.remove());

    setTimeout(() => {
      if (tip.parentNode) tip.remove();
    }, type === 'error' ? 8000 : 5000);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function extractFileName(url) {
    try {
      const clean = url.split('#')[0].split('?')[0];
      return decodeURIComponent(clean.substring(clean.lastIndexOf('/') + 1)) || 'PDF 文档';
    } catch {
      return 'PDF 文档';
    }
  }
})();