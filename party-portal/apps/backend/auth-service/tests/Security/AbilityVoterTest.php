<?php

namespace App\Tests\Security;

use App\Entity\User;
use App\Entity\Ability;
use App\Entity\Role;
use App\Enum\ModuleEnum;
use App\Enum\ActionEnum;
use App\Security\AbilityVoter;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Authorization\Voter\Voter;

class AbilityVoterTest extends TestCase
{
    private AbilityVoter $voter;
    private User $user;
    private TokenInterface $token;

    protected function setUp(): void
    {
        $this->voter = new AbilityVoter();
        $this->user = new User();
        $this->token = $this->createMock(TokenInterface::class);
        
        // Configure token mock
        $this->token->expects($this->any())
            ->method('getUser')
            ->willReturn($this->user);
    }

    public function testSupportsValidAttribute(): void
    {
        $this->assertTrue(
            $this->voter->supportsAttribute('AUTH:USER:READ')
        );
    }

    public function testVoterDeniesAccessForInvalidAttribute(): void
    {
        $subject = new \stdClass();
        $result = $this->voter->vote($this->token, $subject, ['INVALID:FORMAT']);
        
        $this->assertEquals(Voter::ACCESS_DENIED, $result);
    }
}