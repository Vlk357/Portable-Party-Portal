<?php

namespace App\Security;

use Symfony\Component\Security\Core\Exception\UnsupportedUserException;
use Symfony\Component\Security\Core\Exception\UserNotFoundException;
use Symfony\Component\Security\Core\User\InMemoryUser;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Security\Core\User\UserProviderInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Security\User\PayloadAwareUserProviderInterface;

class JwtUserProvider implements UserProviderInterface, PayloadAwareUserProviderInterface
{
    /**
     * Creates a user from a JWT payload
     * 
     * @param array $payload The JWT payload
     * @return UserInterface
     */
    public function createUserFromPayload(array $payload): UserInterface
    {
        // Extract username from payload, fallback to 'anonymous' if not found
        $username = $payload['username'] ?? ($payload['sub'] ?? 'anonymous');

        // Extract roles from payload or use default
        $roles = isset($payload['roles']) && is_array($payload['roles'])
            ? $payload['roles']
            : ['ROLE_USER'];

        // Add default ROLE_USER if no roles are present
        if (empty($roles)) {
            $roles[] = 'ROLE_USER';
        }

        // Create a user object with the payload data
        return new InMemoryUser($username, null, $roles);
    }

    /**
     * Load user by identifier and payload (from JWT)
     * This is the key method that Lexik JWT will use 
     */
    public function loadUserByIdentifierAndPayload(string $identifier, array $payload): UserInterface
    {
        return $this->createUserFromPayload($payload);
    }

    /**
     * Load user by identifier (username)
     */
    public function loadUserByIdentifier(string $identifier): UserInterface
    {
        // This provider doesn't actually load users by identifier
        // JWT authentication happens before this is called
        throw new UserNotFoundException('User not found. JWT authentication required.');
    }

    /**
     * For BC with Symfony < 6.0
     */
    public function loadUserByUsername(string $username): UserInterface
    {
        return $this->loadUserByIdentifier($username);
    }

    /**
     * Refresh the user - in stateless JWT auth, we just return the same user
     */
    public function refreshUser(UserInterface $user): UserInterface
    {
        if (!$this->supportsClass(get_class($user))) {
            throw new UnsupportedUserException(sprintf('Unsupported user class "%s"', get_class($user)));
        }
        
        return $user; // Stateless auth - return as is
    }
    
    /**
     * Check if this provider supports the given user class
     */
    public function supportsClass(string $class): bool
    {
        return InMemoryUser::class === $class;
    }
}