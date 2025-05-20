<?php

namespace App\Security;

use Symfony\Component\Security\Core\Exception\UnsupportedUserException;
use Symfony\Component\Security\Core\Exception\UserNotFoundException;
use Symfony\Component\Security\Core\User\InMemoryUser;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Security\Core\User\UserProviderInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Security\User\PayloadAwareUserProviderInterface;

/**
 * @template TUser of \Symfony\Component\Security\Core\User\InMemoryUser
 * @implements \Symfony\Component\Security\Core\User\UserProviderInterface<TUser>
 */
class JwtUserProvider implements UserProviderInterface, PayloadAwareUserProviderInterface
{
    /**
     * Creates a user from a JWT payload
     *
     * @param array<string, mixed> $payload The JWT payload
     * @return InMemoryUser
     */
    public function createUserFromPayload(array $payload): InMemoryUser
    {
        error_log('[JwtUserProvider] Attempting to create user from payload: ' . print_r($payload, true));

        $usernameValue = $payload['username'] ?? ($payload['sub'] ?? 'anonymous');
        $username = is_string($usernameValue) ? $usernameValue : 'anonymous';
        error_log('[JwtUserProvider] Username from payload: ' . $username);


        $rolesValue = $payload['roles'] ?? []; 
        $roles = is_array($rolesValue) ? array_filter($rolesValue, 'is_string') : [];
        
        $roles = array_values(array_filter(array_map('strval', $roles), fn($role) => !empty($role)));
        
        // WORKAROUND: If CINEMA:MOVIE:MANAGE is present, add ROLE_ADMIN
        if (in_array('CINEMA:MOVIE:MANAGE', $roles, true)) {
            if (!in_array('ROLE_ADMIN', $roles, true)) {
                $roles[] = 'ROLE_ADMIN';
                error_log('[JwtUserProvider] WORKAROUND: Added ROLE_ADMIN because CINEMA:MOVIE:MANAGE was found.');
            }
        }

        if (empty($roles)) {
            $roles = ['ROLE_USER']; 
        }
        
        error_log('[JwtUserProvider] Roles being assigned: ' . print_r($roles, true)); 
        
        return new InMemoryUser($username, null, $roles);
    }

    /**
     * Load user by identifier and payload (from JWT)
     * @param array<string, mixed> $payload
     * @return InMemoryUser
     */
    public function loadUserByIdentifierAndPayload(string $identifier, array $payload): InMemoryUser
    {
        error_log('[JwtUserProvider] loadUserByIdentifierAndPayload called. Identifier: ' . $identifier); // ADDED LOG
        return $this->createUserFromPayload($payload);
    }

    /**
     * Load user by identifier (username)
     * @return UserInterface
     */
    public function loadUserByIdentifier(string $identifier): UserInterface
    {
        error_log('[JwtUserProvider] loadUserByIdentifier called with identifier: ' . $identifier . ' - THIS SHOULD NOT BE THE PRIMARY PATH FOR JWT AUTH.'); // MODIFIED LOG
        // This method is problematic as it tries to use a non-existent $userRepository
        // For a pure JWT InMemoryUser provider, this method might not be strictly needed
        // or should be implemented differently if fallback/other auth mechanisms are used.
        // Throwing an exception is safer if it's not supposed to be used.
        throw new UserNotFoundException(sprintf('User "%s" not found via loadUserByIdentifier. This provider primarily uses JWT payload.', $identifier));
    }

    /**
     * @deprecated since Symfony 5.4, use loadUserByIdentifier() instead
     */
    public function loadUserByUsername(string $username): UserInterface // Return type changed to UserInterface
    {
        error_log('[JwtUserProvider] loadUserByUsername (deprecated) called with username: ' . $username); // ADDED LOG
        return $this->loadUserByIdentifier($username);
    }

    public function refreshUser(UserInterface $user): UserInterface // Return type changed to UserInterface
    {
        if (!$user instanceof InMemoryUser) {
            throw new UnsupportedUserException(sprintf('Unsupported user class "%s". Expected "%s".', get_class($user), InMemoryUser::class));
        }
        error_log('[JwtUserProvider] refreshUser called for user: ' . $user->getUserIdentifier()); // ADDED LOG
        return $user;
    }

    public function supportsClass(string $class): bool
    {
        return InMemoryUser::class === $class || is_subclass_of($class, InMemoryUser::class);
    }
}
