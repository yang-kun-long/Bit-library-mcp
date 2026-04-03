# Bug Report - 北理工登录兜底策略失败

## 问题描述

北理工（BIT）登录流程中的兜底策略（统一检索同步）无法正常工作。

## 复现步骤

1. 调用 `login_library` 工具，参数 `university: "BIT"`
2. 图书馆登录成功
3. 发现系统未登录，触发兜底策略
4. 兜底策略失败

## 预期行为

兜底策略应该：
1. 打开图书馆首页 `https://lib.bit.edu.cn/`
2. 在搜索框填入内容
3. 点击搜索按钮
4. 页面跳转到超星发现系统，触发 session 同步
5. 发现系统自动登录

## 实际行为

多种失败情况：
1. **未找到搜索框或按钮** - content script 未正确注入或元素未加载
2. **已阻止窗口弹出** - 搜索按钮调用 `window.open()` 被浏览器拦截
3. **等待跳转超时** - 页面未跳转到发现系统

## 技术细节

### 搜索按钮行为

北理工图书馆搜索按钮：
```html
<button type="button" class="btn btn-search" onclick="searchTemp47.link(this, 1)">搜索</button>
```

`searchTemp47.link()` 函数内部构造 URL 并调用 `window.open()` 打开新窗口。

### 尝试过的方案

1. ✅ **手动点击** - 成功（有用户手势）
2. ✅ **控制台执行** - 成功（开发者特权）
3. ❌ **content script sendMessage + 点击** - 失败（弹窗被拦截）
4. ❌ **chrome.scripting.executeScript + 点击** - 失败（弹窗被拦截）
5. ❌ **劫持 window.open() 捕获 URL** - 失败（window.open 未被调用）
6. ❌ **读取 searchTemp47 对象属性** - 未完成测试

### 根本原因

插件注入的脚本触发的点击事件**没有用户手势上下文**，导致：
- `window.open()` 被浏览器弹窗拦截器阻止
- 页面无法跳转到搜索结果页

## 可能的解决方案

### 方案 1：直接构造搜索 URL
- 分析 `searchTemp47.link()` 函数逻辑
- 手动构造搜索 URL
- 用 `chrome.tabs.update()` 跳转（绕过弹窗拦截）

### 方案 2：使用 chrome.debugger API
- 用 `chrome.debugger` 模拟真实用户点击
- 可以绕过弹窗拦截，但需要额外权限

### 方案 3：优化流程，复用已打开的标签页
- 当前流程：验证图书馆登录 → 关闭标签页 → 兜底时重新打开
- 优化后：验证图书馆登录 → 保留标签页 → 兜底时复用

### 方案 4：放弃兜底策略
- 如果图书馆登录成功但发现系统未登录，提示用户手动访问发现系统
- 简化实现，避免复杂的自动化逻辑

## 相关文件

- `extension/providers/bit-provider.js` - 登录流程实现
- `extension/content.js` - content script，处理 `PERFORM_UNIFIED_SEARCH` 消息

## 日志示例

```
[BitProvider] 步骤4: 发现系统未登录，执行统一检索兜底
[BitProvider] 触发搜索失败: 未找到搜索框或按钮
[BitProvider] 统一检索同步失败: Error: 触发搜索失败: 未找到搜索框或按钮
```

或

```
[BitProvider] 搜索已触发，等待页面跳转到发现系统
[BitProvider] 统一检索同步失败: Error: 等待跳转到发现系统超时
```

浏览器提示：**已阻止窗口弹出**

## 状态

🔴 **未解决** - 需要进一步调查和测试

## 日期

2026-04-03
