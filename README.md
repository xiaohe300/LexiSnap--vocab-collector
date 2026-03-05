# 学术生词采集器

一个纯自用的Chrome浏览器插件，用于在阅读学术文献时快速保存生词并生成中文释义。

## 功能特点

- ✅ 划词识别和浮动保存按钮
- ✅ 自动调用AI生成中文释义
- ✅ 本地存储，数据不丢失
- ✅ 弹窗查看和管理生词
- ✅ 搜索和导出功能
- ✅ 自定义API配置

## 使用方法

1. **安装插件**
   - 打开Chrome浏览器
   - 访问 `chrome://extensions/`
   - 打开右上角"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择 `academic-vocab-plugin` 文件夹

2. **配置API**
   - 点击插件图标
   - 选择"选项"
   - API Key
   - 测试连接

3. **使用插件**
   - 在网页上选中单词
   - 点击出现的"保存生词"按钮
   - 在弹窗中查看和管理生词

## 开发说明

- 技术栈：原生HTML/CSS/JavaScript
- 存储方式：chrome.storage.local
- AI接口：
- Manifest V3

## 文件结构

```
academic-vocab-plugin/
├── manifest.json          # 插件配置
├── content.js            # 内容脚本（划词识别）
├── background.js         # 后台脚本（处理保存和AI）
├── popup.html            # 弹窗界面
├── popup.js              # 弹窗逻辑
├── options.html          # 设置页面
├── options.js            # 设置逻辑
├── styles.css            # 全局样式
├── icons/                # 图标文件
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md             # 说明文档
```

## API配置

在设置页面配置API：
- API Key: `sk-b`
- 模型: `deepseek-ai/DeepSeek-R1`
- Base URL: `https://api.siliconflow.cn/v1/chat/completions`
