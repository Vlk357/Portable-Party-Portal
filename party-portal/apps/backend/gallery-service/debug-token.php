<?php
// filepath: /home/martin/Osobni/Skola/CVUT/FEL-SIT/Bakalarska_prace/party-portal/apps/backend/gallery-service/debug-token.php
// Simple script to decode the JWT header and payload (without verification)
if ($argc < 2) {
    echo "Usage: php debug-token.php <jwt-token>\n";
    exit(1);
}

$token = $argv[1];
$parts = explode('.', $token);

if (count($parts) != 3) {
    echo "Invalid JWT format - must have 3 dot-separated parts\n";
    exit(1);
}

echo "Header: \n";
echo json_encode(json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $parts[0]))), JSON_PRETTY_PRINT) . "\n\n";

echo "Payload: \n";
echo json_encode(json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $parts[1]))), JSON_PRETTY_PRINT) . "\n";

echo "\nSignature: [binary data]\n";