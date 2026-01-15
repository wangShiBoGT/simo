# Simo 简单部署（无 Docker）

## 最简单的方式：上传 → 访问

### 步骤 1：本地构建

在你的电脑上运行：

```bash
cd simo
npm install
npm run build
```

构建完成后会生成 `dist` 文件夹。

### 步骤 2：上传到服务器

需要上传的文件：

```
simo/
├── dist/           # 前端静态文件（必须）
├── server/         # 后端代码（必须）
├── node_modules/   # 依赖（必须）
└── package.json    # 配置文件
```

### 步骤 3：服务器启动

```bash
# 进入项目目录
cd /你的路径/simo

# 启动后端（后台运行）
nohup node server/index.js > simo.log 2>&1 &

# 安装静态服务器（如果没有）
npm install -g serve

# 启动前端（后台运行）
nohup serve -s dist -l 3000 > web.log 2>&1 &
```

### 步骤 4：访问

```
http://你的服务器IP:3000
```

---

## 如果服务器已有 Nginx

只需要上传 `dist` 和 `server` 文件夹：

```bash
# 1. 上传 dist 到 Nginx 网站目录
scp -r dist/* user@server:/var/www/simo/

# 2. 上传 server 到任意目录
scp -r server user@server:/opt/simo/

# 3. 在服务器启动后端
cd /opt/simo
npm install
nohup node server/index.js > simo.log 2>&1 &
```

Nginx 配置：

```nginx
server {
    listen 80;
    server_name simo.yourdomain.com;
    
    root /var/www/simo;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://127.0.0.1:3001;
    }
}
```

---

## 常用命令

```bash
# 查看后端是否运行
ps aux | grep node

# 停止后端
pkill -f "node server/index.js"

# 查看日志
tail -f simo.log
```

---

## 配置说明

**所有配置在浏览器完成：**

1. 打开网页
2. 点击右上角设置
3. 填入 API Key（智谱免费）
4. 保存

服务器不存储任何密钥。
