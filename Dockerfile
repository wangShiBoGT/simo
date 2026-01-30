# Simo 后端 - Node + Python 双运行时
FROM node:20-slim

# 安装 Python 和 OpenCV 依赖
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-opencv \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 设置 Python 别名
RUN ln -s /usr/bin/python3 /usr/bin/python

# 工作目录
WORKDIR /app

# 复制依赖文件
COPY package*.json ./
COPY requirements.txt ./

# 安装 Node 依赖
RUN npm install --production

# 安装 Python 依赖
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# 复制源代码
COPY . .

# 创建必要目录
RUN mkdir -p temp/frames data/faces

# 暴露端口
EXPOSE 3001

# 启动命令
CMD ["node", "server/index.js"]
