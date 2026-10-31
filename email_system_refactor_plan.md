# Email Writing System Frontend Refactor Plan

## 项目概述

基于现有系统重构前端，实现一个完整的AI辅助邮件写作工具。

## 系统架构

### 技术栈
- **Frontend**: React + Ant Design + TypeScript
- **Chat Component**: @chatscope/chat-ui-kit-react
- **Rich Text Editor**: Slate.js + slate-react
- **State Management**: React Context/Redux (根据需要)
- **HTTP Client**: Axios
- **Storage**: 本地数据持久化 + 后端日志系统

### 核心依赖包
```json
{
  "dependencies": {
    "@chatscope/chat-ui-kit-react": "^2.0.0",
    "slate": "^0.100.0",
    "slate-react": "^0.100.0",
    "slate-history": "^0.93.0",
    "antd": "^5.0.0",
    "@ant-design/icons": "^5.0.0",
    "axios": "^1.0.0",
    "uuid": "^9.0.0",
    "dayjs": "^1.11.0"
  }
}
```

## 系统流程 (System Workflow)

### 页面流转
1. **ChatBot Page** - 任务输入对话页面
2. **Factor Selection Page** - Tone Factor 预览和筛选
3. **Email Editor Page** - 邮件内容编辑（富文本编辑器）
4. **Anchor Template Page** - 写作风格总结和模板保存

### 数据流
```
User Input → ChatBot → Factor Selection → Email Generation → Rich Text Editor → Anchor Templates → Data Logging
```

## 详细实现计划

### Phase 1: 项目结构重组

#### 1.1 目录结构
```
src/
├── components/
│   ├── ChatBot/
│   │   ├── ChatInterface.tsx
│   │   ├── MessageList.tsx
│   │   └── InputArea.tsx
│   ├── FactorSelection/
│   │   ├── FactorCard.tsx
│   │   ├── FactorList.tsx
│   │   └── FactorPreview.tsx
│   ├── EmailEditor/
│   │   ├── SlateEditor.tsx
│   │   ├── EditorToolbar.tsx
│   │   ├── EmailPreview.tsx
│   │   └── LocalizedEditing.tsx
│   ├── AnchorTemplate/
│   │   ├── PersonaTemplate.tsx
│   │   ├── SituationTemplate.tsx
│   │   └── TemplateSummary.tsx
│   └── Common/
│       ├── Layout.tsx
│       ├── Navigation.tsx
│       └── LoadingSpinner.tsx
├── pages/
│   ├── ChatBotPage.tsx
│   ├── FactorSelectionPage.tsx
│   ├── EmailEditorPage.tsx
│   └── AnchorTemplatePage.tsx
├── data/
│   ├── Prompts/
│   │   ├── chatbot/
│   │   ├── factor-analysis/
│   │   ├── email-generation/
│   │   ├── localized-editing/
│   │   └── anchor-generation/
│   └── PredefinedData/
│       ├── factor_list.json
│       └── aspects_list.json
├── services/
│   ├── api/
│   │   ├── chatService.ts
│   │   ├── factorService.ts
│   │   ├── emailService.ts
│   │   └── anchorService.ts
│   ├── logging/
│   │   ├── sessionLogger.ts
│   │   └── dataFormatter.ts
│   └── storage/
│       ├── sessionStorage.ts
│       └── fileManager.ts
├── types/
│   ├── session.ts
│   ├── factor.ts
│   ├── email.ts
│   └── anchor.ts
└── utils/
    ├── placeholderManager.ts
    ├── dataValidator.ts
    └── formatters.ts
```

#### 1.2 类型定义 (types/)
```typescript
// types/session.ts
export interface TaskSession {
  user: string;
  task_id: string;
  created_iso: string;
  original_task: string;
}

// types/factor.ts
export interface Factor {
  id: string;
  title: string;
  options: string[];
}

export interface FactorChoice {
  id: string;
  title: string;
  selected_option: string;
}

// types/email.ts
export interface EmailDraft {
  content: string;
  timestamp: string;
  version: number;
}

// types/anchor.ts
export interface PersonaAnchor {
  title: string;
  description: string;
}

export interface SituationAnchor {
  title: string;
  description: string;
}
```

### Phase 2: ChatBot 页面实现

#### 2.1 ChatBot 组件集成
- 使用 `@chatscope/chat-ui-kit-react`
- 实现用户任务输入对话
- 集成 AI 对话服务

```typescript
// components/ChatBot/ChatInterface.tsx
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput
} from '@chatscope/chat-ui-kit-react';

const ChatInterface = () => {
  // 实现聊天逻辑
  // 处理用户输入
  // 调用AI服务
  // 管理对话状态
};
```

#### 2.2 任务提取和验证
- 解析用户输入的任务描述
- 生成唯一的 `task_id`
- 初始化会话数据结构

### Phase 3: Factor Selection 页面

#### 3.1 Factor 数据管理
- 加载 `PredefinedData/factor_list.json`
- 实现 Factor 预览功能
- 用户选择界面

#### 3.2 Intent 分析
- 基于用户选择生成 Intent 数据
- 实现 `{{INTENT_CURRENT}}` 数据结构
- 保存到 `intents/current.json`

### Phase 4: 富文本邮件编辑器（重点修改）

#### 4.1 Slate.js 编辑器集成
```typescript
// components/EmailEditor/SlateEditor.tsx
import { createEditor } from 'slate';
import { Slate, Editable, withReact } from 'slate-react';
import { withHistory } from 'slate-history';

const SlateEditor = () => {
  const editor = useMemo(() => withHistory(withReact(createEditor())), []);
  
  // 实现富文本编辑功能
  // 支持格式化操作
  // 局部内容选择和编辑
  // 实时保存草稿
};
```

#### 4.2 局部编辑功能
- 实现 `{{SELECTED_CONTENT}}` 选择机制
- 支持局部内容的AI重写
- 变体生成和选择 (`{{VARIATION_OPTION}}`)
- 编辑历史追踪 (`{{EDIT_ACTION}}`)

#### 4.3 编辑器工具栏
- 格式化工具
- AI 辅助编辑按钮
- 保存和版本管理

### Phase 5: Anchor Template 页面（新增）

#### 5.1 模板生成
- 基于用户写作历史分析风格
- 生成 `{{PERSONA_ANCHOR}}` 和 `{{SITUATION_ANCHOR}}`
- 模板预览和编辑

#### 5.2 模板管理
- 保存到 `anchors.json`
- 模板列表和版本管理
- 模板应用到新任务

### Phase 6: 数据日志系统

#### 6.1 会话数据结构
按照文档中的 File Tree 结构实现：
```
SessionData/<TaskId>/
├── meta/
│   └── task.json           # {{USER_TASK}}, {{TASK_ID}}
├── factors/
│   └── choices.json        # {{FACTOR_CHOICES}}
├── intents/
│   ├── current.json        # {{INTENT_CURRENT}}
│   └── history.json        # Intent 变更历史
├── drafts/
│   ├── latest.md           # {{DRAFT_LATEST}}
│   └── versions/           # 历史版本
├── localized/
│   ├── 001_variation.json  # 变体生成记录
│   ├── 002_direct_rewrite.json # 直接编辑记录
│   └── ...
└── anchors.json            # {{PERSONA_ANCHOR}}, {{SITUATION_ANCHOR}}
```

#### 6.2 日志记录服务
```typescript
// services/logging/sessionLogger.ts
class SessionLogger {
  async logFactorSelection(taskId: string, choices: FactorChoice[]) {
    // 保存到 factors/choices.json
  }
  
  async logIntentChange(taskId: string, change: IntentChange) {
    // 保存到 intents/history.json
  }
  
  async logLocalizedEdit(taskId: string, edit: LocalizedEdit) {
    // 保存到 localized/NNN_<agent>.json
  }
  
  async logDraftUpdate(taskId: string, content: string) {
    // 保存到 drafts/latest.md
  }
}
```

### Phase 7: AI 服务集成

#### 7.1 Prompt 管理
在 `src/data/Prompts/` 中组织各类 Prompt：
```
Prompts/
├── chatbot/
│   ├── task-extraction.md
│   └── clarification.md
├── factor-analysis/
│   ├── intent-analysis.md
│   └── factor-matching.md
├── email-generation/
│   ├── initial-draft.md
│   ├── snippet-generation.md
│   └── content-refinement.md
├── localized-editing/
│   ├── variation-generation.md
│   ├── direct-rewrite.md
│   └── style-adjustment.md
└── anchor-generation/
    ├── persona-analysis.md
    └── situation-summary.md
```

#### 7.2 Placeholder 替换系统
```typescript
// utils/placeholderManager.ts
class PlaceholderManager {
  static replacePlaceholders(template: string, data: Record<string, any>): string {
    // 实现 {{PLACEHOLDER}} 替换逻辑
    // 支持所有文档中定义的占位符
  }
  
  static validatePlaceholders(template: string): string[] {
    // 验证模板中的占位符
  }
}
```

#### 7.3 AI 服务接口
```typescript
// services/api/
export class ChatService {
  async processUserInput(input: string, context: any) {
    const prompt = await this.loadPrompt('chatbot/task-extraction.md');
    const processedPrompt = PlaceholderManager.replacePlaceholders(prompt, context);
    // 调用 AI API
  }
}

export class EmailService {
  async generateInitialDraft(factors: FactorChoice[], intent: Intent[]) {
    // 生成初始邮件草稿
  }
  
  async generateVariations(selectedContent: string, userPrompt: string) {
    // 生成内容变体
  }
}
```

### Phase 8: UI/UX 实现

#### 8.1 Ant Design 组件使用
- Layout: 主页面布局
- Steps: 流程进度指示
- Card: 内容卡片展示
- Button: 操作按钮
- Modal: 弹窗交互
- Notification: 消息提示

#### 8.2 响应式设计
- 移动端适配
- 各设备屏幕尺寸支持

#### 8.3 交互体验优化
- 加载状态处理
- 错误处理和提示
- 快捷键支持
- 自动保存功能

## 开发阶段

### 阶段 1: 基础框架搭建 (Week 1-2)
- 项目结构重组
- 基础组件和页面创建
- 路由和导航实现
- 数据类型定义

### 阶段 2: ChatBot 功能实现 (Week 3)
- ChatScope 集成
- 对话逻辑实现
- 任务提取功能
- 会话初始化

### 阶段 3: Factor Selection 实现 (Week 4)
- Factor 数据加载和展示
- 用户选择界面
- Intent 分析和保存

### 阶段 4: 富文本编辑器核心功能 (Week 5-6)
- Slate.js 编辑器集成
- 基础编辑功能
- 局部选择和编辑
- 草稿保存机制

### 阶段 5: 高级编辑功能 (Week 7)
- AI 辅助编辑
- 变体生成
- 编辑历史管理
- 协作编辑支持

### 阶段 6: Anchor Template 功能 (Week 8)
- 模板生成逻辑
- 模板展示和编辑
- 模板保存和管理

### 阶段 7: 数据系统完善 (Week 9)
- 完整的日志记录系统
- 数据持久化
- 数据导入导出
- 会话恢复功能

### 阶段 8: 测试和优化 (Week 10)
- 单元测试
- 集成测试
- 性能优化
- 用户体验优化

## 技术要点

### 1. 数据持久化策略
- 本地 Session Storage 用于临时数据
- 服务端 API 用于持久化存储
- 增量同步机制
- 离线模式支持

### 2. 性能优化
- 组件懒加载
- 虚拟滚动（长列表）
- 防抖处理（搜索、自动保存）
- 缓存策略

### 3. 错误处理
- 网络错误恢复
- 数据验证
- 用户友好的错误提示
- 错误日志收集

### 4. 安全考虑
- 输入验证和清理
- XSS 防护
- 敏感数据处理
- API 安全调用

## 测试策略

### 单元测试
- 组件测试 (Jest + React Testing Library)
- 工具函数测试
- API 服务测试

### 集成测试
- 页面流转测试
- 数据流测试
- AI 服务集成测试

### E2E 测试
- 完整用户流程测试
- 跨浏览器兼容性测试

## 部署和监控

### 构建优化
- 代码分割
- 资源压缩
- CDN 配置

### 监控指标
- 页面加载时间
- AI 服务响应时间
- 用户行为分析
- 错误率监控

---

## 开发注意事项

1. **严格遵循文档中的数据结构定义**
2. **所有 Placeholder 都必须按照文档规范实现**
3. **保持代码模块化和可维护性**
4. **注重用户体验和交互设计**
5. **确保数据一致性和完整性**
6. **定期备份和版本控制**

## 交付物

1. 完整的前端应用代码
2. 部署配置文件
3. API 接口文档
4. 用户使用手册
5. 开发者文档
6. 测试报告

---

此计划作为开发指导，具体实现过程中可根据实际情况进行调整和优化。