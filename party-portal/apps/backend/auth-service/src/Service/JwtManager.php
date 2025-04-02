<?php

// filepath: /home/martin/Osobni/Skola/CVUT/FEL-SIT/Bakalarska_prace/party-portal/apps/backend/auth-service/src/Service/JwtManager.php

namespace App\Service;

use Lexik\Bundle\JWTAuthenticationBundle\Encoder\JWTEncoderInterface;

class JwtManager
{
    private JWTEncoderInterface $jwtEncoder;

    public function __construct(
        JWTEncoderInterface $jwtEncoder
    ) {
        $this->jwtEncoder = $jwtEncoder;
    }

    /**
     * Create a JWT token for a service
     *
     * @param string $serviceId The ID of the service
     * @return string The JWT token
     */
    public function createFromService(string $serviceId): string
    {
        // Create payload with service claims
        $payload = [
            'sub' => $serviceId,          // Subject - required by JWT standard
            'iat' => time(),              // Issued at time
            'exp' => time() + 1000 * 60 * 24 * 30,    // Expiration (30 days)
            'serviceId' => $serviceId,    // Custom service identifier
            'roles' => ['ROLE_SERVICE']   // Roles for authorization
        ];

        // Use the encoder directly which doesn't require a UserInterface
        return $this->jwtEncoder->encode($payload);
    }
}
