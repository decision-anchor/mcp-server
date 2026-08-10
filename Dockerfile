# Glama 검사용 최소 구성 — 기동 + introspection(tools/list) 응답.
# DA_API_URL 은 기본값이 내장되어 있어 환경변수 없이 기동한다.
# 시크릿(MCP_ORIGIN_SECRET 등)은 여기에 값을 넣지 않는다 — 런타임 주입.
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.js ./
COPY lib ./lib
COPY tools ./tools
ENV PORT=3003
EXPOSE 3003
CMD ["node", "index.js", "--http", "3003"]
