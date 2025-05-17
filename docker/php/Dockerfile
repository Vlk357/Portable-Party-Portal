FROM php:8.4-fpm-alpine

# Install dependencies
RUN apk add --no-cache \
    postgresql-dev \
    linux-headers \
    $PHPIZE_DEPS \
    icu-dev \
    git \
    unzip \
    vim \
    bash \
    openssh \
    libzip-dev \
    ffmpeg

# Install PHP extensions
RUN docker-php-ext-install \
    pdo \
    pdo_pgsql \
    intl \
    zip \
    opcache \
    exif

# Configure Xdebug
RUN pecl install xdebug && \
    docker-php-ext-enable xdebug && \
    echo "xdebug.mode=debug" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini && \
    echo "xdebug.client_host=host.docker.internal" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini && \
    echo "xdebug.start_with_request=yes" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini

# Install Composer
COPY --from=composer:2.8.5 /usr/bin/composer /usr/bin/composer

# Create dev user for VSCode remote development
RUN adduser -D -u 1000 dev && \
    addgroup dev www-data && \
    mkdir -p /home/dev/.composer && \
    chown -R dev:dev /home/dev

# Set proper permissions
RUN chown -R dev:www-data /var/www/html && \
    chmod -R 775 /var/www/html

# Set PHP memory limit
RUN echo "memory_limit = 256M" > /usr/local/etc/php/conf.d/memory-limit.ini

# Add custom PHP settings for uploads
COPY docker/php/custom-upload-settings.ini /usr/local/etc/php/conf.d/custom-upload-settings.ini

WORKDIR /var/www/html

# Copy composer files
COPY --chown=dev:www-data party-portal/apps/backend/auth-service/composer.json \
    party-portal/apps/backend/auth-service/composer.lock \
    ./

# Configure Composer to allow plugins
RUN composer config --no-plugins allow-plugins.dealerdirect/phpcodesniffer-composer-installer true && \
    composer config --no-plugins allow-plugins.symfony/runtime true && \
    composer config --no-plugins allow-plugins.symfony/flex true && \
    composer config --no-plugins allow-plugins.php-http/discovery true

# Install dependencies and dump autoload
RUN composer install --no-scripts --no-interaction && \
    composer dump-autoload

# Copy the rest of the application
COPY --chown=dev:www-data party-portal/apps/backend/auth-service .

# Create the gallery uploads directory and set permissions
RUN mkdir -p /var/www/apps/gallery/public/media/gallery_files && \
    chown -R www-data:www-data /var/www/apps/gallery/public/media && \
    chmod -R 775 /var/www/apps/gallery/public/media

# Set development PHP configuration
RUN mv "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini"

USER dev

CMD ["php-fpm"]