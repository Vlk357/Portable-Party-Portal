<?php
// filepath: /home/martin/Osobni/Skola/CVUT/FEL-SIT/Bakalarska_prace/party-portal/apps/backend/gallery-service/test-jwt-verify.php
require __DIR__.'/vendor/autoload.php';
require __DIR__.'/config/bootstrap.php';

use Symfony\Component\Security\Core\Exception\BadCredentialsException;

// Get the JWT token from command line
if ($argc < 2) {
    echo "Usage: php test-jwt-verify.php <jwt-token>\n";
    exit(1);
}

$token = $argv[1];

// Boot the kernel to get the container
$kernel = new \App\Kernel($_SERVER['APP_ENV'] ?? 'dev', (bool)($_SERVER['APP_DEBUG'] ?? true));
$kernel->boot();
$container = $kernel->getContainer();

// Get the JWT encoder service
$jwtEncoder = $container->get('lexik_jwt_authentication.encoder');

try {
    // Try to decode and verify the token
    echo "Attempting to decode and verify JWT...\n";
    $decodedToken = $jwtEncoder->decode($token);
    
    echo "✅ TOKEN VERIFIED SUCCESSFULLY!\n\n";
    echo "Decoded token payload:\n";
    print_r($decodedToken);
    
} catch (BadCredentialsException $e) {
    echo "❌ Token verification failed: " . $e->getMessage() . "\n";
} catch (\Exception $e) {
    echo "❌ Error: " . get_class($e) . ": " . $e->getMessage() . "\n";
}