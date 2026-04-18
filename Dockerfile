# 本地先执行构建：yarn build
# 再执行 docker build，将 build 目录打入镜像
FROM nginx:alpine

COPY build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
