// 生词采集插件 - 内容脚本（防重复注入版）
(function() {
  // ====== PDF 自动跳转到扩展阅读器（加在 content.js 最前面）======
  (function redirectPdfToExtensionViewer() {
    try {
      const url = window.location.href;
      const isDirectPdf =
        /\.pdf($|[?#])/i.test(url) ||
        url.toLowerCase().startsWith('file://') && url.toLowerCase().includes('.pdf');

      const isAlreadyViewer = url.startsWith(chrome.runtime.getURL('viewer.html'));

      if (isDirectPdf && !isAlreadyViewer) {
        const target = chrome.runtime.getURL('viewer.html') + '?file=' + encodeURIComponent(url);
        console.log('检测到 PDF，跳转到扩展阅读器:', target);
        window.location.replace(target);
        return;
      }
    } catch (e) {
      console.warn('PDF 自动跳转失败:', e);
    }
  })();

  // 检查是否已经加载过
  if (window.__vocabContentLoaded) {
    console.log('content.js 已加载，跳过重复执行');
    return;
  }
  window.__vocabContentLoaded = true;

  // ==================== 原 content.js 代码从这里开始 ====================

let currentSelection = '';
let currentSelectionText = '';
let saveButton = null;
let isPDF = false;
let pdfCheckInterval = null;
let lastSelectionTime = 0;
let lastButtonHideTime = 0;
let isSaving = false;

// 创建浮动保存按钮
function createSaveButton() {
  if (saveButton) {
    saveButton.remove();
  }

  saveButton = document.createElement('button');
  saveButton.id = 'vocab-save-button';
  saveButton.textContent = '保存生词';
  saveButton.style.cssText = `
    position: fixed !important;
    z-index: 2147483647 !important;
    background: #4285f4 !important;
    color: white !important;
    border: none !important;
    border-radius: 6px !important;
    padding: 10px 20px !important;
    font-size: 15px !important;
    font-weight: 500 !important;
    cursor: pointer !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25) !important;
    transition: all 0.2s ease !important;
    display: none;
    pointer-events: auto !important;
    min-width: 100px !important;
    text-align: center !important;
    letter-spacing: 0.5px !important;
    border: 1px solid rgba(255,255,255,0.2) !important;
  `;

  saveButton.addEventListener('mouseenter', () => {
    if (!isSaving) {
      saveButton.style.background = '#3367d6';
      saveButton.style.transform = 'translateY(-2px)';
      saveButton.style.boxShadow = '0 6px 16px rgba(0,0,0,0.3)';
    }
  });

  saveButton.addEventListener('mouseleave', () => {
    if (!isSaving) {
      saveButton.style.background = '#4285f4';
      saveButton.style.transform = 'translateY(0)';
      saveButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
    }
  });

  saveButton.addEventListener('click', handleSaveClick);
  document.body.appendChild(saveButton);
  
  console.log('PDF模式:', isPDF ? '是' : '否', '- 按钮已创建');
}

// PDF专用选择检测
function setupPDFSelectionDetection() {
  console.log('设置PDF选择检测');
  
  if (pdfCheckInterval) {
    clearInterval(pdfCheckInterval);
  }
  
  pdfCheckInterval = setInterval(() => {
    checkPDFSelection();
  }, 300);
  
  document.addEventListener('mouseup', checkPDFSelection, true);
  document.addEventListener('selectionchange', checkPDFSelection, true);
  document.addEventListener('click', checkPDFSelection, true);
}

function checkPDFSelection() {
  if (isSaving) return;
  
  const selection = window.getSelection();
  if (!selection) return;
  
  const selectedText = selection.toString().trim();
  
  const now = Date.now();
  if (now - lastSelectionTime < 150) return;
  lastSelectionTime = now;
  
  if (selectedText && selectedText.length > 0 && selectedText.length <= 100) {
    console.log('PDF中检测到选中文本:', selectedText.substring(0, 30) + (selectedText.length > 30 ? '...' : ''));
    currentSelection = selectedText;
    currentSelectionText = selectedText;
    
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      if (rect && rect.width > 0 && rect.height > 0) {
        showSaveButtonInPDF(rect);
      } else {
        showSaveButtonAtMousePosition();
      }
    } else {
      showSaveButtonAtMousePosition();
    }
  } else if (selectedText && selectedText.length > 100) {
    hideSaveButton();
  } else {
    if (now - lastButtonHideTime > 500) {
      hideSaveButton();
    }
  }
}

function showSaveButtonInPDF(rect) {
  if (!saveButton) {
    createSaveButton();
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const buttonWidth = 120;
  const buttonHeight = 44;
  
  let left = rect.right + 15;
  let top = rect.bottom + 15;
  
  if (left + buttonWidth > viewportWidth) {
    left = rect.left - buttonWidth - 15;
  }
  
  if (top + buttonHeight > viewportHeight) {
    top = rect.top - buttonHeight - 15;
  }
  
  if (left < 10) {
    left = Math.min(rect.right + 15, viewportWidth - buttonWidth - 15);
  }
  
  left = Math.max(10, Math.min(left, viewportWidth - buttonWidth - 10));
  top = Math.max(10, Math.min(top, viewportHeight - buttonHeight - 10));
  
  saveButton.style.display = 'block';
  saveButton.style.left = left + 'px';
  saveButton.style.top = top + 'px';
  saveButton.style.position = 'fixed';
  
  console.log('PDF按钮显示位置:', left, top);
}

function showSaveButtonAtMousePosition() {
  if (!saveButton) {
    createSaveButton();
  }

  const lastMouseEvent = window.lastMouseEvent;
  if (lastMouseEvent) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const buttonWidth = 120;
    const buttonHeight = 44;
    
    let left = lastMouseEvent.clientX + 20;
    let top = lastMouseEvent.clientY + 20;
    
    left = Math.max(10, Math.min(left, viewportWidth - buttonWidth - 10));
    top = Math.max(10, Math.min(top, viewportHeight - buttonHeight - 10));
    
    saveButton.style.display = 'block';
    saveButton.style.left = left + 'px';
    saveButton.style.top = top + 'px';
    saveButton.style.position = 'fixed';
  } else {
    saveButton.style.display = 'block';
    saveButton.style.left = '50%';
    saveButton.style.top = '70%';
    saveButton.style.transform = 'translateX(-50%)';
    saveButton.style.position = 'fixed';
  }
}

function showSaveButton() {
  if (isSaving) return;
  
  if (!saveButton) {
    createSaveButton();
  }

  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const buttonWidth = 120;
    const buttonHeight = 44;
    
    let left = rect.right + 15;
    let top = rect.bottom + 15;
    
    if (left + buttonWidth > viewportWidth) {
      left = rect.left - buttonWidth - 15;
    }
    
    if (top + buttonHeight > viewportHeight) {
      top = rect.top - buttonHeight - 15;
    }
    
    if (left < 10) {
      left = Math.min(rect.right + 15, viewportWidth - buttonWidth - 15);
    }
    
    left = Math.max(10, Math.min(left, viewportWidth - buttonWidth - 10));
    top = Math.max(10, Math.min(top, viewportHeight - buttonHeight - 10));
    
    saveButton.style.display = 'block';
    saveButton.style.left = left + 'px';
    saveButton.style.top = top + 'px';
    saveButton.style.position = 'fixed';
    saveButton.style.transform = 'none';
  }
}

function hideSaveButton() {
  if (saveButton && !isSaving) {
    saveButton.style.display = 'none';
    lastButtonHideTime = Date.now();
  }
}

async function handleSaveClick() {
  if (!currentSelection || currentSelection.trim().length === 0 || isSaving) {
    return;
  }

  isSaving = true;
  const wordToSave = currentSelection;

  const context = await getContext();
  
  saveButton.textContent = '保存中...';
  saveButton.disabled = true;
  saveButton.style.background = '#5c6bc0';
  
  try {
    console.log('发送保存请求:', wordToSave);
    
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_WORD',
      word: wordToSave,
      context: context
    });
    
    console.log('保存响应:', response);
    
    if (response && (response.status === 'saved' || response.status === 'updated')) {
      saveButton.textContent = '✓ 已保存';
      saveButton.style.background = '#4caf50';
      
      if (response.translation) {
        showTranslationTip(
          wordToSave, 
          response.translation.translation || '翻译失败', 
          response.translation.pos || '', 
          response.translation.definition || '无释义',
          response.translation.translation.includes('失败') || response.translation.translation.includes('超时') ? 'error' : 'success'
        );
      } else {
        showTranslationTip(
          wordToSave, 
          '保存成功', 
          '', 
          '生词已保存',
          'success'
        );
      }
      
      setTimeout(() => {
        resetSaveButton();
        hideSaveButton();
        currentSelection = '';
        currentSelectionText = '';
        isSaving = false;
      }, 2000);
      
    } else {
      let errorMessage = '保存失败';
      if (response && response.error) {
        errorMessage = response.error;
      } else if (response && response.translationError) {
        errorMessage = response.translationError;
      } else {
        errorMessage = '未知错误';
      }
      
      saveButton.textContent = '✗ 保存失败';
      saveButton.style.background = '#f44336';
      
      showTranslationTip(wordToSave, '保存失败', '', errorMessage, 'error');
      
      setTimeout(() => {
        resetSaveButton();
        hideSaveButton();
        currentSelection = '';
        currentSelectionText = '';
        isSaving = false;
      }, 2000);
    }
    
  } catch (error) {
    console.error('保存过程中出错:', error);
    
    saveButton.textContent = '✗ 保存失败';
    saveButton.style.background = '#f44336';
    
    showTranslationTip(wordToSave, '保存失败', '', error.message || '网络错误', 'error');
    
    setTimeout(() => {
      resetSaveButton();
      hideSaveButton();
      currentSelection = '';
      currentSelectionText = '';
      isSaving = false;
    }, 2000);
  }
}

function resetSaveButton() {
  if (saveButton) {
    saveButton.textContent = '保存生词';
    saveButton.style.background = '#4285f4';
    saveButton.disabled = false;
  }
}

function showTranslationTip(word, translation, pos, definition, type = 'info') {
  const existingTip = document.getElementById('vocab-translation-tip');
  if (existingTip) {
    existingTip.remove();
  }
  
  const tip = document.createElement('div');
  tip.id = 'vocab-translation-tip';
  
  let borderColor, bgColor, titleColor;
  switch(type) {
    case 'success':
      borderColor = '#4caf50';
      bgColor = '#f1f8e9';
      titleColor = '#2e7d32';
      break;
    case 'error':
      borderColor = '#f44336';
      bgColor = '#ffebee';
      titleColor = '#c62828';
      break;
    default:
      borderColor = '#ff9800';
      bgColor = '#fff3e0';
      titleColor = '#e65100';
  }
  
  tip.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    background: ${bgColor};
    border-left: 6px solid ${borderColor};
    border-radius: 8px;
    padding: 16px 20px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    z-index: 2147483647;
    max-width: 380px;
    min-width: 280px;
    animation: slideUp 0.3s ease;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    backdrop-filter: blur(10px);
  `;
  
  const safeWord = escapeHtml(word);
  const safeTranslation = escapeHtml(translation);
  const safePos = escapeHtml(pos);
  const safeDefinition = escapeHtml(definition);
  
  const formattedDefinition = safeDefinition.length > 150 ? 
    safeDefinition.substring(0, 150) + '...' : safeDefinition;
  
  tip.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
      <div style="font-weight: 700; font-size: 18px; color: ${titleColor};">${safeWord}</div>
      <div style="color: #999; font-size: 12px; cursor: pointer; padding: 4px;" onclick="this.parentElement.parentElement.remove()">✕</div>
    </div>
    <div style="color: ${borderColor}; font-size: 16px; margin-bottom: 8px; font-weight: 600;">${safeTranslation}</div>
    ${safePos ? `<div style="color: #666; font-size: 14px; margin-bottom: 6px; font-style: italic;">${safePos}</div>` : ''}
    <div style="color: #333; font-size: 14px; line-height: 1.6; max-height: 200px; overflow-y: auto;">${formattedDefinition}</div>
    ${safeDefinition.length > 150 ? '<div style="color: #999; font-size: 11px; margin-top: 8px;">(内容较长，已截断)</div>' : ''}
    <div style="margin-top: 12px; font-size: 11px; color: #999; text-align: right; border-top: 1px solid #eee; padding-top: 10px;">点击关闭</div>
  `;
  
  document.body.appendChild(tip);
  
  tip.addEventListener('click', (e) => {
    if (e.target === tip || e.target.tagName === 'DIV') {
      tip.remove();
    }
  });
  
  const timeout = type === 'info' ? 10000 : (type === 'error' ? 8000 : 5000);
  
  setTimeout(() => {
    if (tip.parentNode) {
      tip.remove();
    }
  }, timeout);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addStyles() {
  if (document.getElementById('vocab-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'vocab-styles';
  style.textContent = `
    @keyframes slideUp {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    
    #vocab-save-button {
      user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    #vocab-save-button:active {
      transform: scale(0.98) !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * 获取包含给定 Range 的完整句子（以 .!?。！？ 为边界）
 * @param {Range} range - 用户选中的范围
 * @returns {string} 完整句子文本
 */
function getFullSentence(range) {
  // 句子结束符（包括中英文）
  const sentenceEndRegex = /[.!?。！？]/;

  // 辅助函数：从指定节点和偏移量向前查找句子开始位置
  function findSentenceStart(node, offset) {
    if (!node) return null;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      // 从 offset-1 向前扫描
      for (let i = offset - 1; i >= 0; i--) {
        if (sentenceEndRegex.test(text[i])) {
          // 找到句号，返回下一个位置作为起始
          return { node: node, offset: i + 1 };
        }
      }
      // 当前节点未找到，尝试前一个兄弟节点
      let prevNode = node.previousSibling;
      if (prevNode) {
        if (prevNode.nodeType === Node.TEXT_NODE) {
          return findSentenceStart(prevNode, prevNode.textContent.length);
        } else {
          // 元素节点，递归查找其最后一个文本节点
          const lastText = getLastTextNode(prevNode);
          if (lastText) {
            return findSentenceStart(lastText, lastText.textContent.length);
          } else {
            return findSentenceStart(prevNode, 0);
          }
        }
      } else {
        // 没有前一个兄弟，尝试父节点的前一个兄弟
        const parent = node.parentNode;
        if (parent && parent.previousSibling) {
          return findSentenceStart(parent.previousSibling, 0);
        } else {
          // 没有更前的了，返回当前节点起始
          return { node: node, offset: 0 };
        }
      }
    } else {
      // 节点不是文本节点，尝试其最后一个文本节点
      const lastText = getLastTextNode(node);
      if (lastText) {
        return findSentenceStart(lastText, lastText.textContent.length);
      } else {
        // 无文本，尝试前一个兄弟
        if (node.previousSibling) {
          return findSentenceStart(node.previousSibling, 0);
        } else if (node.parentNode) {
          return findSentenceStart(node.parentNode, 0);
        }
        return { node: node, offset: 0 };
      }
    }
  }

  // 辅助函数：获取节点内的最后一个文本节点
  function getLastTextNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node;
    if (node.nodeType === Node.ELEMENT_NODE) {
      for (let i = node.childNodes.length - 1; i >= 0; i--) {
        const child = node.childNodes[i];
        const found = getLastTextNode(child);
        if (found) return found;
      }
    }
    return null;
  }

  // 辅助函数：从指定节点和偏移量向后查找句子结束位置
  function findSentenceEnd(node, offset) {
    if (!node) return null;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      for (let i = offset; i < text.length; i++) {
        if (sentenceEndRegex.test(text[i])) {
          // 找到句号，返回 i+1 作为结束（包含句号）
          return { node: node, offset: i + 1 };
        }
      }
      // 当前节点未找到，尝试下一个兄弟节点
      let nextNode = node.nextSibling;
      if (nextNode) {
        if (nextNode.nodeType === Node.TEXT_NODE) {
          return findSentenceEnd(nextNode, 0);
        } else {
          // 元素节点，查找其第一个文本节点
          const firstText = getFirstTextNode(nextNode);
          if (firstText) {
            return findSentenceEnd(firstText, 0);
          } else {
            return findSentenceEnd(nextNode, 0);
          }
        }
      } else {
        // 没有下一个兄弟，尝试父节点的下一个兄弟
        let parent = node.parentNode;
        while (parent && !parent.nextSibling) {
          parent = parent.parentNode;
        }
        if (parent && parent.nextSibling) {
          return findSentenceEnd(parent.nextSibling, 0);
        } else {
          // 到头了，返回当前节点末尾
          return { node: node, offset: text.length };
        }
      }
    } else {
      // 不是文本节点，尝试其第一个文本节点
      const firstText = getFirstTextNode(node);
      if (firstText) {
        return findSentenceEnd(firstText, 0);
      } else {
        if (node.nextSibling) {
          return findSentenceEnd(node.nextSibling, 0);
        } else if (node.parentNode) {
          return findSentenceEnd(node.parentNode, 0);
        }
        return { node: node, offset: 0 };
      }
    }
  }

  function getFirstTextNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node;
    if (node.nodeType === Node.ELEMENT_NODE) {
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        const found = getFirstTextNode(child);
        if (found) return found;
      }
    }
    return null;
  }

  // 获取选区起始和结束节点/偏移
  const startContainer = range.startContainer;
  const startOffset = range.startOffset;
  const endContainer = range.endContainer;
  const endOffset = range.endOffset;

  // 找到句子开始位置
  const sentenceStart = findSentenceStart(startContainer, startOffset) || { node: startContainer, offset: startOffset };
  // 找到句子结束位置
  const sentenceEnd = findSentenceEnd(endContainer, endOffset) || { node: endContainer, offset: endOffset };

  // 从句子开始到结束创建一个新 Range
  const sentenceRange = document.createRange();
  try {
    sentenceRange.setStart(sentenceStart.node, sentenceStart.offset);
    sentenceRange.setEnd(sentenceEnd.node, sentenceEnd.offset);
  } catch (e) {
    console.warn('创建句子范围失败，回退到选区文本', e);
    return range.toString();
  }

  return sentenceRange.toString();
}

async function getContext() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { text: '', title: document.title, url: window.location.href, pageInfo: '' };
  }

  const selectedText = selection.toString().trim();
  const pageTitle = document.title;
  const pageUrl = window.location.href;
  let pageInfo = isPDF ? await getPDFPageNumber() : '';
  let contextText = '';

  try {
    const range = selection.getRangeAt(0);
    contextText = getFullSentence(range);
  } catch (e) {
    console.log('获取上下文失败，回退到选中文本:', e);
    contextText = selectedText;
  }

  // 如果获取失败或为空，保底使用选中文本
  if (!contextText || contextText.trim() === '') {
    contextText = selectedText;
  }

  return {
    text: contextText,
    title: pageTitle,
    url: pageUrl,
    pageInfo: pageInfo
  };
}
async function getPDFPageNumber() {
  try {
    const pdfViewer = document.querySelector('embed[type="application/pdf"], iframe[src*=".pdf"]');
    if (pdfViewer) {
      const pageInfo = document.querySelector('#pageNumber, .pageNumber, input[aria-label*="page"]');
      if (pageInfo) {
        return pageInfo.value || pageInfo.textContent;
      }
    }
    
    const url = window.location.href;
    const pageMatch = url.match(/[#&]page=(\d+)/i);
    if (pageMatch) {
      return pageMatch[1];
    }
  } catch (e) {
    console.log('获取PDF页码失败:', e);
  }
  return '';
}

function detectPDF() {
  const url = window.location.href;
  const isPDFFile = url.toLowerCase().endsWith('.pdf') || 
                    url.toLowerCase().includes('.pdf#') ||
                    url.toLowerCase().includes('.pdf?') ||
                    url.toLowerCase().includes('/pdf/');
  
  const isPDFViewer = document.querySelector('embed[type="application/pdf"], iframe[src*=".pdf"]') !== null;
  
  return isPDFFile || isPDFViewer;
}

function trackMousePosition() {
  document.addEventListener('mousemove', (e) => {
    window.lastMouseEvent = e;
  }, { passive: true });
}

function init() {
  console.log('学术生词采集器初始化');
  
  isPDF = detectPDF();
  console.log('PDF检测结果:', isPDF);
  
  addStyles();
  trackMousePosition();
  
  if (isPDF) {
    console.log('PDF模式启动');
    setupPDFSelectionDetection();
  } else {
    console.log('普通网页模式启动');
    setupNormalSelectionDetection();
  }
  
  createSaveButton();
  
  setTimeout(() => {
    checkPDFSelection();
  }, 1000);
}

function setupNormalSelectionDetection() {
  document.addEventListener('selectionchange', () => {
    setTimeout(() => {
      if (isSaving) return;
      
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const selectedText = selection.toString().trim();
        if (selectedText.length > 0 && selectedText.length <= 100) {
          currentSelection = selectedText;
          currentSelectionText = selectedText;
          showSaveButton();
        } else {
          hideSaveButton();
        }
      } else {
        hideSaveButton();
      }
    }, 100);
  });
  
  document.addEventListener('mouseup', checkSelection, true);
  document.addEventListener('keyup', checkSelection, true);
}

function checkSelection() {
  if (isSaving) return;
  
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const selectedText = selection.toString().trim();
    if (selectedText.length > 0 && selectedText.length <= 100) {
      currentSelection = selectedText;
      currentSelectionText = selectedText;
      showSaveButton();
    } else {
      hideSaveButton();
    }
  } else {
    hideSaveButton();
  }
}

function cleanup() {
  if (pdfCheckInterval) {
    clearInterval(pdfCheckInterval);
    pdfCheckInterval = null;
  }
  if (saveButton) {
    saveButton.remove();
    saveButton = null;
  }
  currentSelection = '';
  currentSelectionText = '';
  isSaving = false;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TRANSLATION_UPDATED') {
    console.log('收到翻译更新:', message);
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.addEventListener('pagehide', cleanup);
window.addEventListener('beforeunload', cleanup);

// 卡死检测（45秒）
setInterval(() => {
  if (isSaving && saveButton && saveButton.textContent === '保存中...') {
    console.log('检测到可能的卡死状态（45秒），重置按钮');
    resetSaveButton();
    isSaving = false;
    hideSaveButton();
    showTranslationTip(
      currentSelection || '未知单词', 
      '保存超时', 
      '', 
      '后端响应时间过长，请检查网络',
      'error'
    );
  }
}, 45000);

  // ==================== 原 content.js 代码结束 ====================
})();