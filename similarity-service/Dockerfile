FROM php:8.3-cli
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev \
    && docker-php-ext-install pdo_pgsql \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
# php -S serves one request at a time by default; this lets it handle several at once (Linux only)
ENV PHP_CLI_SERVER_WORKERS=4
# Render passes the port in $PORT
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-8080} -t public public/index.php"]
