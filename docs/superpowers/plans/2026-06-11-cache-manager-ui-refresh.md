# 缓存管理界面优化实施计划

> **给 agentic workers：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务执行。本计划使用 checkbox 语法跟踪进度。

**目标：** 将“请求管理”升级为用户可见的“缓存管理”，并按现代工作台方向优化管理页布局。

**架构：** 只改前端静态 UI，不改变缓存 API、数据结构和 JSON 编辑器集成。HTML 负责补充工作台语义结构，CSS 负责现代化布局和视觉层级，`public/app.js` 只调整渲染文案和少量列表辅助信息。

**技术栈：** 原生 HTML/CSS/JavaScript、现有 `vanilla-jsoneditor`、Node test、TypeScript 构建。

---

## 文件结构

- 修改 `public/index.html`：把用户可见入口改为“缓存管理”，增加管理页标题、说明、列表头和详情/编辑器工作区容器。
- 修改 `public/styles.css`：重写管理页相关样式，形成左侧列表、右侧详情、编辑器工作台的现代布局。
- 修改 `public/app.js`：更新用户可见文案，列表空态改为“缓存”，渲染左侧结果统计，并把“在请求管理中打开”改为“在缓存管理中打开”。
- 修改 `test/uiServer/clearAll.test.ts`：用失败测试约束新文案和关键样式钩子。

---

### 任务 1：命名和静态测试

**文件：**

- 修改：`test/uiServer/clearAll.test.ts`
- 修改：`public/index.html`
- 修改：`public/app.js`

- [ ] **步骤 1：写失败测试**

在 `test/uiServer/clearAll.test.ts` 的第一个测试中加入断言：

```ts
assert.ok(/缓存管理/.test(html));
assert.ok(!/请求管理/.test(html));
assert.ok(/在缓存管理中打开/.test(app));
assert.ok(/缓存管理 Method 过滤/.test(html));
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
rtk npm run build:test && rtk node --test --test-concurrency=1 .tmp/test/test/uiServer/clearAll.test.js
```

预期：测试失败，失败原因是 `public/index.html` 或 `public/app.js` 仍包含“请求管理”。

- [ ] **步骤 3：实现命名修改**

修改 `public/index.html`：

```html
<button id="requestManagerTab" type="button" role="tab" aria-selected="false">缓存管理</button>
<select id="managerMethodSelect" aria-label="缓存管理 Method 过滤">
```

修改 `public/app.js` 中的入口按钮文案：

```js
<button type="button" data-action="manage" data-id="${escapeHtml(entry.id)}">在缓存管理中打开</button>
```

- [ ] **步骤 4：运行测试确认通过**

运行：

```bash
rtk npm run build:test && rtk node --test --test-concurrency=1 .tmp/test/test/uiServer/clearAll.test.js
```

预期：UI server 测试通过。

- [ ] **步骤 5：提交**

```bash
rtk git add test/uiServer/clearAll.test.ts public/index.html public/app.js
rtk git commit -m "feat: rename request manager to cache manager"
```

---

### 任务 2：工作台结构和渲染文案

**文件：**

- 修改：`test/uiServer/clearAll.test.ts`
- 修改：`public/index.html`
- 修改：`public/app.js`

- [ ] **步骤 1：写失败测试**

在 `test/uiServer/clearAll.test.ts` 的第一个测试中加入断言：

```ts
assert.ok(/managerShell/.test(html));
assert.ok(/managerListHeader/.test(html));
assert.ok(/managerEditorPanel/.test(html));
assert.ok(/managerRequestSummary/.test(app));
assert.ok(/没有符合条件的缓存/.test(app));
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
rtk npm run build:test && rtk node --test --test-concurrency=1 .tmp/test/test/uiServer/clearAll.test.js
```

预期：测试失败，失败原因是新结构类名或新空态文案不存在。

- [ ] **步骤 3：增加工作台结构**

在 `public/index.html` 的 `requestManagerView` 内，将工具条和布局包进工作台容器，并增加列表头、详情容器和编辑器容器：

```html
<div class="managerShell">
  <div class="managerIntro">
    <div>
      <h3>缓存管理</h3>
      <p>查看、筛选、编辑缓存响应。</p>
    </div>
  </div>
  <div class="managerToolbar">...</div>
  <div class="managerLayout">
    <aside class="managerListPanel">
      <div class="managerListHeader">
        <strong>缓存条目</strong>
        <span id="managerRequestSummary">0 条结果</span>
      </div>
      <div id="managerRequestList" class="managerRequestList"></div>
    </aside>
    <div class="managerDetail">
      <div id="managerEntryInfo" class="managerEntryInfo"></div>
      <div class="managerEditorPanel">...</div>
    </div>
  </div>
</div>
```

- [ ] **步骤 4：接入新 DOM 并更新文案**

在 `public/app.js` 的 `elements` 中加入：

```js
managerRequestSummary: document.querySelector('#managerRequestSummary'),
```

在 `renderRequestManager()` 中设置结果统计并更新空态：

```js
elements.managerRequestSummary.textContent = `${entries.length} 条结果${state.managerSelectedId ? ' · 1 条已选' : ''}`;
elements.managerRequestList.innerHTML = entries.length ? entries.map(...) : '<div class="empty compact">没有符合条件的缓存。</div>';
```

- [ ] **步骤 5：运行测试确认通过**

运行：

```bash
rtk npm run build:test && rtk node --test --test-concurrency=1 .tmp/test/test/uiServer/clearAll.test.js
```

预期：UI server 测试通过。

- [ ] **步骤 6：提交**

```bash
rtk git add test/uiServer/clearAll.test.ts public/index.html public/app.js
rtk git commit -m "feat: add cache manager workbench structure"
```

---

### 任务 3：现代化样式和验证

**文件：**

- 修改：`test/uiServer/clearAll.test.ts`
- 修改：`public/styles.css`

- [ ] **步骤 1：写失败测试**

在 `test/uiServer/clearAll.test.ts` 的第一个测试中加入断言：

```ts
assert.ok(/\\.managerShell/.test(styles));
assert.ok(/\\.managerListPanel/.test(styles));
assert.ok(/\\.managerEditorPanel/.test(styles));
assert.ok(/\\.jsonEditorHost\\s*\\{[^}]*--jse-theme-color/s.test(styles));
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
rtk npm run build:test && rtk node --test --test-concurrency=1 .tmp/test/test/uiServer/clearAll.test.js
```

预期：测试失败，失败原因是新样式类或 JSONEditor 主题变量不存在。

- [ ] **步骤 3：实现现代工作台样式**

在 `public/styles.css` 中替换管理页相关样式，目标规则包括：

```css
.workspaceTabs {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  border: 1px solid #d8dee8;
  border-radius: 10px;
  background: #eef2f7;
}

.managerShell {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e1e6ef;
  border-radius: 10px;
  background: #f6f8fb;
}

.managerLayout {
  display: grid;
  grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
  gap: 12px;
}

.managerListPanel,
.managerEditorPanel,
.managerEntryInfo {
  border: 1px solid #e1e6ef;
  border-radius: 8px;
  background: #ffffff;
}

.jsonEditorHost {
  --jse-theme-color: #2563eb;
}
```

保留窄屏规则：

```css
@media (max-width: 960px) {
  .managerToolbar,
  .managerLayout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **步骤 4：运行测试、构建和语法检查**

运行：

```bash
node --check public/app.js
rtk npm test
rtk npm run build
```

预期：语法检查通过，完整测试通过，生产构建通过。

- [ ] **步骤 5：提交**

```bash
rtk git add test/uiServer/clearAll.test.ts public/styles.css
rtk git commit -m "style: refresh cache manager workbench"
```

---

## 自检

- 覆盖 spec 中的命名、结构、视觉层级和验证要求。
- 不包含占位项。
- 不改缓存 API、存储、回放或 JSON 编辑器行为。
