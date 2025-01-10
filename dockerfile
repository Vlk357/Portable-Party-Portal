FROM dockage/alpine-nginx-php-fpm

# Install PHP 8 and necessary extensions
RUN apk add php
# php8-fpm php8-opcache php8-gd php8-mysqli php8-zlib php8-curl php8-mbstring php8-json php8-session 

# COPY nginx.conf /etc/nginx/nginx.conf

# Copy application files
# COPY /home/martin/Osobni/Skola/CVUT/FEL-SIT/Bakalarska_prace /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]