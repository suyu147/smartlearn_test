# 多用户隔离 Bug 修复报告

## 问题描述
用户反映的严重 Bug：
1. **场景**：新用户注册 → 登录 → 进入个人画像构建（onboarding）
2. **问题**：关闭浏览器重新打开后，应返回 `/onboarding`，但却：
   - 直接进入 `/chat`
   - 看到**其他账号的聊天记录**

## 根本原因分析

### localStorage 跨用户污染
Zustand 存储使用了 localStorage 持久化中间件，当用户登出时：
- localStorage 中的数据**未被清除**
- 新用户登录后，浏览器恢复了上一个用户的 localStorage 数据
- 16 个不同的 store 全部有 localStorage 持久化，包括：
  - `learning-profile-storage` (包含用户的学习画像和聊天记录)
  - `chat-storage` (包含聊天消息)
  - `session-storage` 等

### 数据流顺序问题
1. 用户 A 登录 → store 通过 persist 恢复 localStorage 数据
2. hasProfile = true (从 User A 的 localStorage 读取)
3. 用户 A 登出（仅清除 auth 状态，不清除其他 store）
4. 用户 B 登录
5. providers.tsx AppShell 尚未调用 `/api/v1/auth/status` 时
6. useLearningProfileStore 和 useChatStore 已通过 persist 恢复了 User A 的 localStorage 数据
7. 路由守卫看到 hasProfile=true（来自 User A），直接跳转到 `/chat`
8. 用户 B 看到了 User A 的聊天记录

## 修复方案

### 1. 创建 localStorage 清理工具 (`lib/store/clear-user-data.ts`)
```typescript
export function clearAllUserData(): void {
  // 清除所有 16 个 store 的 localStorage 数据
  const PERSISTED_STORE_KEYS = [
    'user-profile-storage',
    'learning-profile-storage',
    'chat-storage',
    'session-storage',
    'settings-storage',
    // ... 其他 11 个 store
  ];
  
  PERSISTED_STORE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });
}
```

### 2. 修改 `logout()` 方法 (lib/store/auth-store.ts)
在 `logout()` 时调用 `clearAllUserData()`：
```typescript
logout: () => {
  setApiToken(null);
  clearAllUserData(); // ← 新增：清除所有 user store
  set({ token: null, user: null, hasProfile: false });
}
```

### 3. 为关键 Store 添加 `resetForNewUser()` 方法

**LearningProfileStore** (`lib/store/learning-profile.ts`)：
```typescript
resetForNewUser: () => {
  set({ 
    profile: null,
    profileHistory: [],
    archivedProfiles: {},
    isChatOpen: false,
    isGenerating: false,
    synced: false,  // ← 重置同步状态，强制重新从服务器获取
    saveError: null
  });
}
```

**ChatStore** (`lib/store/chat-store.ts`)：
```typescript
resetForNewUser: () => set({ 
  messages: [], 
  isStreaming: false, 
  currentCapability: 'chat', 
  selectedModel: 'gpt-4o' 
})
```

### 4. 在登录/注册时调用 `resetForNewUser()`

**Login Page** (`app/auth/login/page.tsx`)：
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  try {
    await login(username, password);
    resetLearningProfile();  // ← 新增
    resetChat();             // ← 新增
    // ... 继续登录流程
  }
}
```

**Register Page** (`app/auth/register/page.tsx`)：
同样在注册成功后调用 `resetLearningProfile()` 和 `resetChat()`

## 修复的多层防护

### 第 1 层：logout 时清除 localStorage
确保用户完全登出时，浏览器本地存储被完全清空

### 第 2 层：login/register 时重置 Store 内存状态
即使 localStorage 有遗留数据，新登录时也会主动重置所有 store

### 第 3 层：重置 synced 标志
使 `syncFromServer()` 在下次登录时强制从服务器重新获取用户数据，而不是使用旧的缓存

## 验证清单

- ✅ TypeScript 编译通过（`npx tsc --noEmit`）
- ✅ npm run build 成功通过
- ✅ 所有相关文件已更新：
  - `lib/store/clear-user-data.ts` (新建)
  - `lib/store/auth-store.ts` (修改)
  - `lib/store/learning-profile.ts` (添加 resetForNewUser)
  - `lib/store/chat-store.ts` (添加 resetForNewUser + 修正 localStorage key)
  - `app/auth/login/page.tsx` (新增 reset 调用)
  - `app/auth/register/page.tsx` (新增 reset 调用)

## 预期效果

### 修复前
1. User A 登录 → 进入 /chat
2. User A 登出
3. User B 登录 → **错误**进入 /chat，看到 User A 的数据

### 修复后
1. User A 登录 → 进入 /chat
2. User A 登出 → **localStorage 被完全清空**
3. User B 登录 → **正确**进入 /onboarding（新用户），localStorage 是干净的
4. 即使浏览器中意外有遗留的 localStorage，登录时的 `resetForNewUser()` 也会重置内存状态

## 后续改进建议

1. **Session Storage 而非 LocalStorage**：
   - 考虑将敏感数据（聊天记录、学习画像）改为 sessionStorage
   - sessionStorage 在浏览器标签页关闭时自动清空

2. **基于 userId 的 Store Key**：
   - 为 localStorage key 添加 userId 前缀：`learning-profile-${userId}`
   - 这样每个用户的数据物理隔离

3. **定期清理机制**：
   - 在 AppShell 初始化时检查当前登录用户 ID
   - 如果与 localStorage 中的用户 ID 不同，自动清理

---

完成时间：2026-07-12  
修复状态：✅ 已完成并通过编译验证
