<?php

namespace App\Security;

use App\Entity\User;
use App\Entity\Ability;
use App\Enum\ModuleEnum;
use App\Enum\ActionEnum;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Authorization\Voter\Voter;

class AbilityVoter extends Voter
{
    /**
     * Format: MODULE:RESOURCE:ACTION[:CONSTRAINT]
     * Example: "AUTH:USER:READ:own"
     */
    protected function supports(string $attribute, mixed $subject): bool
    {
        if (!str_contains($attribute, ':')) {
            return false;
        }

        [$module, $resource, $action] = explode(':', $attribute) + [null, null, null];
        
        return isset($module, $resource, $action) &&
            ModuleEnum::tryFrom($module) !== null &&
            ActionEnum::tryFrom($action) !== null;
    }

    protected function voteOnAttribute(string $attribute, mixed $subject, TokenInterface $token): bool
    {
        $user = $token->getUser();
        if (!$user instanceof User) {
            return false;
        }

        [$module, $resource, $action, $constraint] = explode(':', $attribute) + [null, null, null, null];

        if (!$module || !$resource || !$action) {
            return false;
        }

        return $user->hasAbilityByAttributes($module, $resource, $action, $constraint);
    }
}