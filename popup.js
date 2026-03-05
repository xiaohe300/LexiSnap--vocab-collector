// 生词采集插件 - Popup Script
// 负责显示生词列表、搜索、删除、导出功能

let vocabWords = [];
let filteredWords = [];
let searchTerm = '';

// DOM元素
const searchInput = document.getElementById('searchInput');
const vocabList = document.getElementById('vocabList');
const emptyState = document.getElementById('emptyState');
const exportBtn = document.getElementById('exportBtn');

// 初始化
async function init() {
  await loadVocabWords();
  setupEventListeners();
  renderVocabList();
}

// 加载生词数据
async function loadVocabWords() {
  const result = await chrome.storage.local.get('vocabWords');
  vocabWords = result.vocabWords || [];
  filteredWords = vocabWords;
}

// 设置事件监听器
function setupEventListeners() {
  // 搜索输入
  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value.toLowerCase();
    filterVocabWords();
    renderVocabList();
  });

  // 导出按钮
  exportBtn.addEventListener('click', exportVocab);
}

// 过滤生词
function filterVocabWords() {
  if (!searchTerm) {
    filteredWords = vocabWords;
    return;
  }

  filteredWords = vocabWords.filter(word => {
    const searchIn = [
      word.rawWord.toLowerCase(),
      word.translation.toLowerCase(),
      word.sourceTitle.toLowerCase(),
      word.context.toLowerCase()
    ].join(' ');
    
    return searchIn.includes(searchTerm);
  });
}

// 渲染生词列表
function renderVocabList() {
  vocabList.innerHTML = '';

  if (filteredWords.length === 0) {
    vocabList.appendChild(emptyState);
    return;
  }

  filteredWords.forEach(word => {
    const item = createVocabItem(word);
    vocabList.appendChild(item);
  });
}

// 创建生词项
function createVocabItem(word) {
  const item = document.createElement('div');
  item.className = 'vocab-item';
  item.dataset.id = word.id;

  const header = document.createElement('div');
  header.className = 'vocab-header';

  const wordElement = document.createElement('div');
  wordElement.className = 'vocab-word';
  wordElement.textContent = word.rawWord;

  const translationElement = document.createElement('div');
  translationElement.className = 'vocab-translation';
  translationElement.textContent = word.translation || '无释义';

  header.appendChild(wordElement);
  header.appendChild(translationElement);
  item.appendChild(header);

  const sourceElement = document.createElement('div');
  sourceElement.className = 'vocab-source';
  sourceElement.textContent = word.sourceTitle || '未知来源';
  item.appendChild(sourceElement);

  const timeElement = document.createElement('div');
  timeElement.className = 'vocab-time';
  timeElement.textContent = new Date(word.createdAt).toLocaleString();
  item.appendChild(timeElement);

  const detailElement = document.createElement('div');
  detailElement.className = 'vocab-detail';
  detailElement.innerHTML = `
    <div class="detail-row">
      <span class="detail-label">词性:</span>
      <span class="detail-value">${word.pos || '未知'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">释义:</span>
      <span class="detail-value">${word.definition || '无'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">上下文:</span>
      <span class="detail-value">${word.context || '无'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">URL:</span>
      <span class="detail-value">${word.sourceUrl || '无'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">页码:</span>
      <span class="detail-value">${word.pageInfo || '无'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">出现次数:</span>
      <span class="detail-value">${word.lookupCount}</span>
    </div>
    <button class="delete-btn">删除</button>
  `;

  item.appendChild(detailElement);

  // 点击展开/收起
  item.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-btn')) {
      handleDelete(word.id);
      return;
    }
    
    item.classList.toggle('expanded');
    detailElement.classList.toggle('show');
  });

  return item;
}

// 处理删除
async function handleDelete(id) {
  if (!confirm('确定要删除这个生词吗？')) {
    return;
  }

  vocabWords = vocabWords.filter(word => word.id !== id);
  await chrome.storage.local.set({ vocabWords });
  filterVocabWords();
  renderVocabList();
}

// 导出生词
function exportVocab() {
  if (vocabWords.length === 0) {
    alert('没有可导出的生词');
    return;
  }

  const data = {
    exportDate: new Date().toISOString(),
    totalWords: vocabWords.length,
    words: vocabWords
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `academic-vocab-${Date.now()}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
}

// 启动
init();