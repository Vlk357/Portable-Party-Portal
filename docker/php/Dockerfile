FROM php:8.4-fpm-alpine

# Install dependencies
RUN apk add --no-cache \
    postgresql-dev \
    linux-headers \
    $PHPIZE_DEPS \
    icu-dev \
    git \
    unzip \
    # Additional dev tools
    vim \
    bash \
    openssh

# Install PHP extensions
RUN docker-php-ext-install \
    pdo \
    pdo_pgsql \
    intl

# Install Xdebug for development
RUN pecl install xdebug && \
    docker-php-ext-enable xdebug

# Install Composer
COPY --from=composer:2.8.5 /usr/bin/composer /usr/bin/composer

# Create dev user for VSCode remote development
RUN adduser -D -u 1000 dev && \
    addgroup dev www-data && \
    mkdir -p /home/dev/.composer && \
    chown -R dev:dev /home/dev

WORKDIR /var/www/html

CMD ["php-fpm"]