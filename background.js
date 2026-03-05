// 生词采集插件 - Background Script
// 负责处理保存请求、调用AI接口和存储数据

// ==================== 内置配置（默认使用 DeepSeek 官方 Key）====================
const BUILTIN_API_KEY = 'sk-60edcc36c30c43a3ad46af9ddc3fdce5';
const BUILTIN_BASE_URL = 'https://api.deepseek.com/v1/chat/completions';
const BUILTIN_MODEL = 'deepseek-chat'; // 使用 DeepSeek-V3，速度快

let apiConfig = {
  apiKey: BUILTIN_API_KEY,
  baseUrl: BUILTIN_BASE_URL,
  model: BUILTIN_MODEL
};

// ==================== 离线词典（英汉 ECDICT）====================
const ECDICT_PATH = 'dict/ecdict.min.json'; // 已生成的精简 JSON 文件
let offlineDictReady = false;
let offlineDict = new Map(); // key: 英文单词（小写）, value: { translation, pos, definition }

// 加载离线词典（启动时异步加载）
async function loadOfflineDict() {
  if (offlineDictReady) return;
  try {
    const url = chrome.runtime.getURL(ECDICT_PATH);
    const resp = await fetch(url);
    const data = await resp.json(); // data 是一个大对象 { word: {translation, pos, definition} }
    offlineDict = new Map(Object.entries(data));
    offlineDictReady = true;
    console.log('英汉离线词典加载完成，条目数:', offlineDict.size);
  } catch (e) {
    console.warn('英汉词典加载失败，离线翻译不可用:', e);
    offlineDictReady = false;
  }
}

// 离线查询
async function offlineLookup(word) {
  const w = (word || '').trim().toLowerCase();
  if (!w) return null;
  if (!offlineDictReady) await loadOfflineDict(); // 确保词典已加载
  if (!offlineDictReady) return null;

  // 直接命中
  if (offlineDict.has(w)) return offlineDict.get(w);

  // 尝试去掉标点/复数形式
  const w2 = w.replace(/[^\w\s-]/g, '');
  if (offlineDict.has(w2)) return offlineDict.get(w2);
  if (w2.endsWith('s') && offlineDict.has(w2.slice(0, -1))) {
    return offlineDict.get(w2.slice(0, -1));
  }
  if (w2.endsWith('es') && offlineDict.has(w2.slice(0, -2))) {
    return offlineDict.get(w2.slice(0, -2));
  }
  if (w2.endsWith('ed') && offlineDict.has(w2.slice(0, -2))) {
    return offlineDict.get(w2.slice(0, -2));
  }
  if (w2.endsWith('ing') && offlineDict.has(w2.slice(0, -3))) {
    return offlineDict.get(w2.slice(0, -3));
  }

  return null;
}

// 缓存最近翻译，避免重复请求
const translationCache = new Map();
const CACHE_MAX_SIZE = 50;
const CACHE_TTL = 3600000; // 1小时

// 从存储中加载用户配置（如果存在则覆盖内置配置）
async function loadConfig() {
  try {
    const result = await chrome.storage.local.get(['apiKey', 'model', 'baseUrl']);
    
    if (result.apiKey) {
      apiConfig.apiKey = result.apiKey;
      console.log('使用用户配置的 API Key');
    } else {
      console.log('使用内置 API Key（未找到用户配置）');
    }

    apiConfig.model = result.model || BUILTIN_MODEL;
    apiConfig.baseUrl = result.baseUrl || BUILTIN_BASE_URL;

    console.log('配置加载完成，API Key 存在:', !!apiConfig.apiKey, '模型:', apiConfig.model);
  } catch (error) {
    console.error('加载配置失败，使用默认内置配置:', error);
  }
}

// 调用AI生成释义 - 极速优化版（超时30秒）
async function generateTranslation(word, context) {
  // 检查缓存
  const cacheKey = `${word}_${context.text?.substring(0, 50)}`;
  const cached = translationCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('使用缓存翻译:', word);
    return cached.data;
  }

  const prompt = `单词: ${word}
上下文: ${context.text || '无'}
输出JSON格式: {"translation":"中文翻译","pos":"词性","definition":"结合语境的简短解释"}`;

  try {
    console.log(`调用 AI 翻译: ${word}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

    const response = await fetch(apiConfig.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`
      },
      body: JSON.stringify({
        model: apiConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 150,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API响应错误:', response.status, errorText.substring(0, 200));
      
      if (response.status === 401) {
        return {
          translation: 'API Key 无效',
          pos: '',
          definition: '当前使用的 API Key 无效，请点击插件图标 → 设置，填写有效的 DeepSeek API Key。',
          error: 'API Key 无效'
        };
      }
      
      return {
        translation: '翻译失败',
        pos: '',
        definition: `API请求失败: ${response.status}`,
        error: `API请求失败: ${response.status}`
      };
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return {
        translation: '翻译失败',
        pos: '',
        definition: 'API返回格式错误',
        error: 'API返回格式错误'
      };
    }

    const content = data.choices[0].message.content;
    console.log('AI返回内容:', content.substring(0, 200));
    
    let result;
    
    try {
      result = JSON.parse(content);
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          result = {
            translation: word,
            pos: '',
            definition: content.substring(0, 100),
            error: 'AI返回非JSON格式'
          };
        }
      } else {
        result = {
          translation: word,
          pos: '',
          definition: content.substring(0, 100),
          error: 'AI返回非JSON格式'
        };
      }
    }
    
    result = {
      translation: result.translation || word,
      pos: result.pos || '',
      definition: result.definition || '无释义',
      error: result.error
    };
    
    // 存入缓存
    if (translationCache.size >= CACHE_MAX_SIZE) {
      const oldestKey = translationCache.keys().next().value;
      translationCache.delete(oldestKey);
    }
    translationCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    return result;
    
  } catch (error) {
    console.error('AI调用过程中发生错误:', error);
    
    if (error.name === 'AbortError') {
      return {
        translation: '翻译超时',
        pos: '',
        definition: '请求超时（30秒），请稍后重试',
        error: '请求超时'
      };
    }
    
    return {
      translation: '翻译失败',
      pos: '',
      definition: error.message || '网络错误',
      error: error.message
    };
  }
}

// 标准化单词
function normalizeWord(word) {
  return word.trim().toLowerCase().replace(/[^\w\s-]/g, '');
}

// 生成唯一ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 用于跟踪正在进行的 AI 补全任务（避免重复）
const pendingAI = new Map();

// 后台 AI 补全函数：调用 AI 并更新存储，然后通知前端
async function translateAndUpdateAI(word, normalizedWord, context, tabId) {
  const key = `${normalizedWord}_${(context.text || '').slice(0, 60)}`;
  if (pendingAI.has(key)) return pendingAI.get(key);

  const task = (async () => {
    try {
      // 调用 AI 翻译
      const aiResult = await generateTranslation(word, context);
      
      // 如果翻译失败或无有效结果，则静默退出（不更新存储）
      if (!aiResult || aiResult.error || aiResult.translation === '翻译失败' || aiResult.translation === '翻译超时') {
        console.log(`AI 补全失败或无效，单词: ${word}`);
        return;
      }

      // 更新存储中的对应条目
      const store = await chrome.storage.local.get('vocabWords');
      const vocabWords = store.vocabWords || [];
      const idx = vocabWords.findIndex(item => item.normalizedWord === normalizedWord);
      if (idx === -1) return;

      // 更新翻译字段，保留原有其他信息
      vocabWords[idx].translation = aiResult.translation;
      vocabWords[idx].pos = aiResult.pos || '';
      vocabWords[idx].definition = aiResult.definition || '无释义';
      vocabWords[idx].translationStatus = 'done';
      vocabWords[idx].updatedAt = Date.now();

      await chrome.storage.local.set({ vocabWords });

      // 通知当前标签页翻译已更新（如果 tabId 存在）
      if (typeof tabId === 'number') {
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: 'TRANSLATION_UPDATED',
            word: word,
            normalizedWord: normalizedWord,
            translation: {
              translation: aiResult.translation,
              pos: aiResult.pos,
              definition: aiResult.definition
            }
          });
        } catch (e) {
          // 忽略发送失败（如页面已关闭）
        }
      }
    } finally {
      pendingAI.delete(key);
    }
  })();

  pendingAI.set(key, task);
  return task;
}

// 保存生词 - 离线优先 + AI 异步补全
async function saveWord(word, context, senderTabId) {
  console.log('saveWord被调用:', word);
  const normalizedWord = normalizeWord(word);
  
  // 1) 先离线查询
  const offline = await offlineLookup(normalizedWord);
  
  // 2) 加载现有数据
  const result = await chrome.storage.local.get('vocabWords');
  let vocabWords = result.vocabWords || [];
  const existingIndex = vocabWords.findIndex(item => item.normalizedWord === normalizedWord);
  
  // 3) 构造立即返回的翻译数据
  let immediateTranslation;
  if (offline) {
    // 离线命中：使用离线结果
    immediateTranslation = {
      translation: offline.translation || '',
      pos: offline.pos || '',
      definition: offline.definition || '',
      offline: true
    };
  } else {
    // 离线未命中：返回 pending 状态
    immediateTranslation = {
      translation: '翻译中...',
      pos: '',
      definition: '已保存，AI 正在后台生成完整释义',
      pending: true
    };
  }

  const now = Date.now();

  if (existingIndex !== -1) {
    // 更新现有条目
    vocabWords[existingIndex].lookupCount += 1;
    vocabWords[existingIndex].updatedAt = now;
    vocabWords[existingIndex].context = context.text || '';
    vocabWords[existingIndex].sourceTitle = context.title || vocabWords[existingIndex].sourceTitle;
    vocabWords[existingIndex].sourceUrl = context.url || vocabWords[existingIndex].sourceUrl;
    vocabWords[existingIndex].pageInfo = context.pageInfo || vocabWords[existingIndex].pageInfo;
    // 更新翻译字段（覆盖之前的 pending 或旧翻译）
    vocabWords[existingIndex].translation = immediateTranslation.translation;
    vocabWords[existingIndex].pos = immediateTranslation.pos;
    vocabWords[existingIndex].definition = immediateTranslation.definition;
    vocabWords[existingIndex].translationStatus = offline ? 'offline' : 'pending';
  } else {
    // 新建条目
    const newWord = {
      id: generateId(),
      rawWord: word,
      normalizedWord: normalizedWord,
      context: context.text || '',
      translation: immediateTranslation.translation,
      pos: immediateTranslation.pos,
      definition: immediateTranslation.definition,
      sourceTitle: context.title || '',
      sourceUrl: context.url || '',
      pageInfo: context.pageInfo || '',
      createdAt: now,
      updatedAt: now,
      lookupCount: 1,
      translationStatus: offline ? 'offline' : 'pending'
    };
    vocabWords.push(newWord);
  }

  // 4) 立即保存到存储
  await chrome.storage.local.set({ vocabWords });

  // 5) 立即响应给前端（秒回）
  const response = {
    status: existingIndex !== -1 ? 'updated' : 'saved',
    translation: immediateTranslation,
    translationError: null
  };

  // 6) 如果离线未命中，启动后台 AI 补全（不等待）
  if (!offline) {
    translateAndUpdateAI(word, normalizedWord, context, senderTabId).catch(err => {
      console.log('后台 AI 补全失败（静默）:', err?.message || err);
    });
  }

  return response;
}

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('background收到消息:', message.type);
  
  if (message.type === 'SAVE_WORD') {
    console.log('收到保存请求:', message.word);
    const tabId = sender?.tab?.id;
    
    // 确保配置已加载（如果 API Key 不存在，则先加载配置，但离线优先不依赖 API Key）
    if (!apiConfig.apiKey) {
      loadConfig().then(() => {
        return saveWord(message.word, message.context, tabId);
      }).then(result => {
        console.log('保存结果:', result);
        sendResponse(result);
      }).catch(error => {
        console.error('保存过程中发生错误:', error);
        sendResponse({ 
          status: 'error', 
          error: error.message,
          translation: { 
            translation: '保存失败',
            definition: error.message 
          }
        });
      });
    } else {
      // 直接保存
      saveWord(message.word, message.context, tabId)
        .then(result => {
          console.log('保存结果:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('保存过程中发生错误:', error);
          sendResponse({ 
            status: 'error', 
            error: error.message,
            translation: { 
              translation: '保存失败',
              definition: error.message 
            }
          });
        });
    }
    return true; // 保持消息通道打开
  }
  
  if (message.type === 'PING') {
    sendResponse({ status: 'alive', apiKeyConfigured: !!apiConfig.apiKey });
    return true;
  }
});

// 初始化：加载配置 和 离线词典（并行执行，不阻塞）
loadConfig();
loadOfflineDict(); // 启动时加载离线词典

// 定期清理缓存
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of translationCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      translationCache.delete(key);
    }
  }
}, 60000);

// 文件协议注入逻辑（保持不变）
async function injectContentScriptIfNeeded(tabId, url) {
  if (!url || !url.startsWith('file://')) return;
  
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => window.__vocabInjected__ === true
    });
    
    if (results && results[0] && results[0].result === true) {
      console.log('文件页面已注入 content script，跳过');
      return;
    }
    
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        window.__vocabInjected__ = true;
      }
    });
    
    console.log('成功将 content.js 注入到文件页面:', url);
  } catch (error) {
    console.error('注入 content script 到文件页面失败:', error);
  }
}

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    injectContentScriptIfNeeded(tabId, tab.url);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.url) {
    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        injectContentScriptIfNeeded(tab.id, tab.url);
      }
    });
  }
});