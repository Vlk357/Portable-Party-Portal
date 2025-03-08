<?php

use App\Kernel;

require_once dirname(__DIR__).'/vendor/autoload_runtime.php';

return function (array $context) {
    $environment = isset($context['APP_ENV']) && is_string($context['APP_ENV']) 
        ? $context['APP_ENV'] 
        : 'dev';
    
    return new Kernel($environment, (bool) $context['APP_DEBUG']);
};