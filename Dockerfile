# 使用 Node.js 22 镜像
FROM node:22-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制项目所有文件
COPY . .

# 构建前端 (Vite)
RUN npm run build

# 暴露端口 (Socket.IO 服务端口)
EXPOSE 3000

# 启动服务
CMD ["npm", "start"]
