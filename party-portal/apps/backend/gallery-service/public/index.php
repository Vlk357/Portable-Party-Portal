<?php

use App\Kernel;

require_once dirname(__DIR__) . '/vendor/autoload_runtime.php';

return function (array $context) {
    $envValue = $context['APP_ENV'] ?? 'dev'; // Default to 'dev' if not set or null
    $appEnv = 'dev'; // Final default

    if (is_string($envValue)) {
        $appEnv = $envValue;
    } elseif (is_scalar($envValue)) {
        // If it's another scalar type (int, float, bool), convert it to string.
        // This handles cases where APP_ENV might be set to e.g. 0, 1, true, false.
        $appEnv = (string) $envValue;
    }
    // If $envValue was an array or object, $appEnv remains 'dev'.

    // The original casting for APP_DEBUG is generally less problematic for PHPStan,
    // as casting arrays or objects to bool is well-defined (e.g., empty array is false, object is true).
    $appDebug = (bool) ($context['APP_DEBUG'] ?? false);

    return new Kernel($appEnv, $appDebug);
};
