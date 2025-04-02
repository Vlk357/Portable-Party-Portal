<?php

// filepath: /home/martin/Osobni/Skola/CVUT/FEL-SIT/Bakalarska_prace/party-portal/apps/backend/auth-service/src/Service/ServiceCredentialsManager.php

namespace App\Service;

use Symfony\Component\DependencyInjection\ParameterBag\ParameterBagInterface;

class ServiceCredentialsManager
{
    private ParameterBagInterface $params;

    public function __construct(
        ParameterBagInterface $params
    ) {
        $this->params = $params;
    }

    /**
     * Validate service credentials against known services
     *
     * @param string $serviceId The service identifier
     * @param string $serviceSecret The service secret key
     * @return bool True if credentials are valid, false otherwise
     */
    public function validateCredentials(string $serviceId, string $serviceSecret): bool
    {
        // Get credentials from configuration
        $services = $this->params->get('app.service_credentials');

        // Ensure we have an array of services
        if (!is_array($services)) {
            return false;
        }

        // Check if service ID exists and secret matches
        return isset($services[$serviceId]) && $services[$serviceId] === $serviceSecret;
    }
}
