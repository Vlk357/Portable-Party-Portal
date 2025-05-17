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
        // Extract username from payload, fallback to 'anonymous' if not found
        // Ensure username is a string
        $usernameValue = $payload['username'] ?? ($payload['sub'] ?? 'anonymous');
        $username = is_string($usernameValue) ? $usernameValue : 'anonymous';


        // Extract roles from payload or use default
        $rolesValue = $payload['roles'] ?? ['ROLE_USER'];
        $roles = is_array($rolesValue) ? array_filter($rolesValue, 'is_string') : ['ROLE_USER'];

        // Ensure all roles are strings and add default ROLE_USER if no roles are present or after filtering
        if (empty($roles)) {
            $roles[] = 'ROLE_USER';
        } else {
            // Ensure ROLE_USER is present if other roles are, but it's missing
            if (!in_array('ROLE_USER', $roles, true)) {
                $roles[] = 'ROLE_USER';
            }
        }
        // Ensure no empty strings in roles, and all are strings
        $roles = array_values(array_filter(array_map('strval', $roles), fn($role) => !empty($role)));
        if (empty($roles)) { // If filtering made it empty, restore default
            $roles = ['ROLE_USER'];
        }


        // Create a user object with the payload data
        return new InMemoryUser($username, null, $roles);
    }

    /**
     * Load user by identifier and payload (from JWT)
     * This is the key method that Lexik JWT will use
     * @param array<string, mixed> $payload
     * @return InMemoryUser
     */
    public function loadUserByIdentifierAndPayload(string $identifier, array $payload): InMemoryUser
    {
        // The identifier from JWT (usually 'sub' or 'username') is in the payload.
        // We can optionally verify if $identifier matches $payload['username'] or $payload['sub']
        // For now, we directly use the payload as the source of truth.
        return $this->createUserFromPayload($payload);
    }

    /**
     * Load user by identifier (username)
     * @return InMemoryUser
     */
    public function loadUserByIdentifier(string $identifier): InMemoryUser
    {
        // This provider doesn't actually load users by identifier from a persistent store.
        // JWT authentication creates the user from the token payload.
        // This method might be called in other contexts (e.g. switch_user)
        // but for pure JWT flow, it's less critical.
        // For stateless JWT, creating a user here might not make sense unless
        // you have a way to validate the identifier against something.
        // Typically, UserNotFoundException is appropriate if this method is called
        // in a context where a JWT is not available or not the primary auth method.
        throw new UserNotFoundException('User not found. This provider creates users from JWT payloads only.');
    }

    /**
     * For BC with Symfony < 6.0
     * @return InMemoryUser
     * @deprecated since Symfony 5.4, use loadUserByIdentifier() instead
     */
    public function loadUserByUsername(string $username): InMemoryUser
    {
        return $this->loadUserByIdentifier($username);
    }

    /**
     * Refresh the user - in stateless JWT auth, we just return the same user
     * @param UserInterface $user
     * @return InMemoryUser
     */
    public function refreshUser(UserInterface $user): InMemoryUser
    {
        if (!$user instanceof InMemoryUser) {
            throw new UnsupportedUserException(sprintf('Unsupported user class "%s". Expected "%s".', get_class($user), InMemoryUser::class));
        }

        // For stateless JWT, the user object is created fresh from the token on each request.
        // There's no "refreshing" from a database. We can return the same user instance
        // or, to be absolutely sure it's based on the latest possible info (though not applicable here),
        // one might re-create it if the payload could be fetched again, but that's not typical.
        return $user;
    }

    /**
     * Check if this provider supports the given user class
     */
    public function supportsClass(string $class): bool
    {
        return InMemoryUser::class === $class || is_subclass_of($class, InMemoryUser::class);
    }
}
