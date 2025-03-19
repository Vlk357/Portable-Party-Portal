<?php

namespace App\Tests\Unit\Entity;

use App\Entity\User;
use App\Entity\Role;
use App\Entity\Ability;
use App\Entity\UserRole;
use App\Entity\UserAbility;
use App\Enum\ActionEnum;
use App\Enum\ModuleEnum;
use App\Enum\UserStatus;
use App\Service\PasswordService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;

class UserTest extends TestCase
{
    private User $user;
    private Role $role1;
    private Role $role2;
    private Ability $ability1;
    private Ability $ability2;
    private Ability $ability3;

    protected function setUp(): void
    {
        // Initialize PasswordService with stub
        //WARNING: This is a stub, not a mock. It is used to provide the return value of the method hashPassword
        $hasher = $this->createStub(UserPasswordHasherInterface::class);
        $hasher->method('hashPassword')->willReturn('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
        PasswordService::initialize($hasher);


        // Create test user after PasswordService initialization
        $this->user = new User(
            username: 'testuser',
            password: 'password123',
            status: UserStatus::PENDING_ACTIVATION
        );

        // Create test abilities
        $this->ability1 = new Ability(
            ModuleEnum::AUTH,
            'USER',
            ActionEnum::READ,
            'own',
            'Can read own user data'
        );

        // Create test abilities
        $this->ability1 = new Ability(
            ModuleEnum::AUTH,
            'USER',
            ActionEnum::READ,
            'own',
            'Can read own user data'
        );
        $this->ability2 = new Ability(
            ModuleEnum::AUTH,
            'USER',
            ActionEnum::UPDATE,
            'own',
            'Can update own user data'
        );
        $this->ability3 = new Ability(
            ModuleEnum::AUTH,
            'USER',
            ActionEnum::READ,
            null,
            'Can read all user data'
        );

        // Create test roles
        $this->role1 = new Role('ROLE_USER', 'Basic user role');
        $this->role1->addAbility($this->ability1);
        $this->role1->addAbility($this->ability2);

        $this->role2 = new Role('ROLE_ADMIN', 'Admin role');
        $this->role2->addAbility($this->ability3);
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function constructor_sets_basic_properties(): void
    {
        $this->assertEquals('testuser', $this->user->getUsername());
        $this->assertTrue($this->user->getPassword() && strlen($this->user->getPassword()) == 60);
        $this->assertEquals(UserStatus::PENDING_ACTIVATION, $this->user->getStatus());
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function constructor_initializes_collections(): void
    {
        $this->assertEmpty($this->user->getRoles());
        $this->assertEmpty($this->user->getDirectAbilities());
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function user_identifier_returns_username(): void
    {
        $this->assertEquals('testuser', $this->user->getUserIdentifier());
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function user_identifier_throws_exception_when_username_is_null(): void
    {
        $this->expectException(\TypeError::class);
        $user = new User(null, null);
        $user->getUserIdentifier();
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function can_add_and_remove_roles(): void
    {
        $this->user->addRole($this->role1);
        $this->assertTrue($this->user->hasRole($this->role1));

        $this->user->removeRole($this->role1);
        $this->assertFalse($this->user->hasRole($this->role1));
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function can_add_and_remove_abilities(): void
    {
        $this->user->addAbility($this->ability1);
        $this->assertTrue($this->user->hasAbility($this->ability1));

        $this->user->removeAbility($this->ability1);
        $this->assertFalse($this->user->hasAbility($this->ability1));
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function gets_abilities_from_roles(): void
    {
        $this->user->addRole($this->role1);
        $this->assertTrue($this->user->hasAbility($this->ability1));
        $this->assertTrue($this->user->hasAbility($this->ability2));
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function converts_abilities_to_permission_strings(): void
    {
        $this->user->addRole($this->role1);
        $this->user->addAbility($this->ability3);

        $permissions = $this->user->getRoles();

        $this->assertContains('AUTH:USER:READ:own', $permissions);
        $this->assertContains('AUTH:USER:UPDATE:own', $permissions);
        $this->assertContains('AUTH:USER:READ', $permissions);
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function checks_ability_by_attributes(): void
    {
        $this->user->addRole($this->role1);

        $this->assertTrue($this->user->hasAbilityByAttributes(
            'AUTH',
            'USER',
            'READ',
            'own'
        ));

        $this->assertFalse($this->user->hasAbilityByAttributes(
            'AUTH',
            'USER',
            'DELETE'
        ));
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function serializes_to_json_correctly(): void
    {
        $this->user->addRole($this->role1);
        $this->user->addAbility($this->ability3);
        $this->user->setCreatedAt(new \DateTimeImmutable('2021-01-01 12:00:00'));

        $json = json_encode($this->user);
        $data = json_decode($json, true);

        $this->assertArrayHasKey('username', $data);
        $this->assertArrayHasKey('roles', $data);
        $this->assertArrayHasKey('abilities', $data);
        $this->assertCount(1, $data['roles']);
        $this->assertCount(1, $data['abilities']);
    }
}