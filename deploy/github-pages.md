# Simo 部署到 GitHub Pages + Render

## 架构说明

```
GitHub Pages (免费)     →  前端静态文件
     ↓ API 请求
Render.com (免费)       →  后端 Node.js API
```

---

## 第一步：部署后端到 Render（免费）

### 1.1 准备后端仓库

创建一个新的 GitHub 仓库 `simo-api`，只包含后端代码：

```
simo-api/
├── server/
│   ├── index.js
│   └── hardware.config.js
├── package.json
└── render.yaml
```

### 1.2 修改 package.json

```json
{
  "name": "simo-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server/index.js"
  },
  "dependencies": {
    "dotenv": "^17.2.3",
    "edge-tts": "^1.0.1"
  }
}
```

### 1.3 在 Render 部署

1. 访问 https://render.com
2. 注册/登录（可用 GitHub 账号）
3. 点击 "New" → "Web Service"
4. 连接你的 `simo-api` 仓库
5. 配置：
   - Name: `simo-api`
   - Build Command: `npm install`
   - Start Command: `node server/index.js`
6. 点击 "Create Web Service"

部署完成后会得到一个 URL，如：
```
https://simo-api.onrender.com
```

---

## 第二步：修改前端 API 地址

修改 `vite.config.js`，添加生产环境 API 地址：

```javascript
export default defineConfig({
  // ... 其他配置
  define: {
    // 生产环境使用 Render 后端地址
    'import.meta.env.VITE_API_BASE': JSON.stringify(
      process.env.NODE_ENV === 'production' 
        ? 'https://simo-api.onrender.com/api'  // 改成你的 Render URL
        : '/api'
    )
  }
})
```

修改 `src/services/simo.js`：

```javascript
const API_BASE = import.meta.env.VITE_API_BASE || '/api'
```

---

## 第三步：部署前端到 GitHub Pages

### 3.1 修改 vite.config.js

```javascript
export default defineConfig({
  base: '/simo/',  // 改成你的仓库名
  // ... 其他配置
})
```

### 3.2 创建 GitHub Actions 自动部署

创建 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          
      - name: Install dependencies
        run: npm install
        
      - name: Build
        run: npm run build
        
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

### 3.3 启用 GitHub Pages

1. 进入仓库 Settings → Pages
2. Source 选择 `gh-pages` 分支
3. 保存

---

## 第四步：访问

```
https://你的用户名.github.io/simo/
```

---

## 注意事项

1. **Render 免费版会休眠**：15分钟无请求会休眠，首次访问需等待约30秒唤醒
2. **CORS 配置**：后端需要允许 GitHub Pages 域名跨域
3. **API Key**：仍然在浏览器设置面板配置，不存储在服务器

---

## 后端 CORS 配置

修改 `server/index.js`，添加 CORS 头：

```javascript
// 在 handleRequest 函数开头添加
res.setHeader('Access-Control-Allow-Origin', '*')
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

if (req.method === 'OPTIONS') {
  res.writeHead(204)
  res.end()
  return
}
```
