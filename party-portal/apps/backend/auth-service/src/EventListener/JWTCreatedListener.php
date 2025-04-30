<?php
// filepath: /home/martin/Osobni/Skola/CVUT/FEL-SIT/Bakalarska_prace/party-portal/apps/backend/auth-service/src/EventListener/JWTCreatedListener.php

namespace App\EventListener;

use Lexik\Bundle\JWTAuthenticationBundle\Event\JWTCreatedEvent;
use App\Entity\User; // Your User entity namespace
use Symfony\Component\Security\Core\User\UserInterface;

class JWTCreatedListener
{
    /**
     * Adds the user's database ID as the 'sub' claim to the JWT payload.
     *
     * @param JWTCreatedEvent $event
     */
    public function onJWTCreated(JWTCreatedEvent $event): void
    {
        $payload = $event->getData();
        $user = $event->getUser();

        // Ensure the user is your User entity and has an ID
        if ($user instanceof User && $user->getId() !== null) {
            // Add the 'sub' (subject) claim with the user's ID
            $payload['sub'] = $user->getId();

            // Optionally add other custom claims
            // $payload['custom_claim'] = 'some_value';
        }
        // If user is not an instance of your User class or ID is null,
        // you might want to log a warning or handle it appropriately.

        $event->setData($payload);
    }
}