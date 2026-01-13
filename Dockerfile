FROM node:22-alpine AS build

# Set the base path for the web editor
ENV CLIENT_URL=/editor/

# Copy source code
COPY . /src/openeo-web-editor
WORKDIR /src/openeo-web-editor

# Build
RUN npm install
RUN npm run build

# Copy build folder and run with nginx
FROM nginx:1.28.0-alpine

# Copy built files to /editor/ subdirectory to match the URL path
COPY --from=build /src/openeo-web-editor/dist /usr/share/nginx/html/editor

# Configure nginx for SPA routing under /editor/
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
\n\
    location /editor/ {\n\
        try_files $uri $uri/ /editor/index.html;\n\
    }\n\
\n\
    location = /editor {\n\
        return 301 /editor/;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf
