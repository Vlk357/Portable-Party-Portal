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
    private User $adminUser;
    private Role $basicUserRole;
    private Role $adminRole;
    private Ability $readOwnAbility;

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
            password: 'password123'
        );

        // Create test abilities
        $this->readOwnAbility = new Ability(
            ModuleEnum::AUTH,
            'USER',
            ActionEnum::READ,
            'own',
            'Can read own user data'
        );

        // Create test roles
        $this->basicUserRole = new Role('ROLE_USER', 'Basic user role');
        $this->basicUserRole->addAbility($this->readOwnAbility);

        $this->adminUser = new User(
            username: 'admin',
            password: 'password'
        );

        $this->adminRole = new Role('ROLE_ADMIN', 'Admin role');
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function createSimpleUser(): void
    {
        $user = new User(
            username: 'testuser',
            password: 'password123'
        );

        $this->assertTrue($user instanceof User);
    }

    public function testGetters(): void
    {
        $user = new User(
            username: 'testuser',
            password: 'password123'
        );

        $this->assertEquals('testuser', $user->getUsername());
        // $password = $user->getPassword();
        // $this->assertTrue(strlen($password) == 60);
        $this->assertEquals(UserStatus::PENDING_ACTIVATION, $user->getStatus());
        $this->assertEquals([], $user->getRoles());
        $this->assertEquals([], $user->getDirectAbilities());
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function constructorSetsBasicProperties(): void
    {
        $this->assertEquals('testuser', $this->user->getUsername());
        // $this->assertTrue($this->user->getPassword() && strlen($this->user->getPassword()) == 60);
        $this->assertEquals(UserStatus::PENDING_ACTIVATION, $this->user->getStatus());
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function constructorInitializesCollections(): void
    {
        $this->assertEmpty($this->user->getRoles());
        $this->assertEmpty($this->user->getDirectAbilities());
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function userIdentifierReturnsUsername(): void
    {
        $this->assertEquals('testuser', $this->user->getUserIdentifier());
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function userIdentifierThrowsExceptionWhenUsernameIsNull(): void
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
    public function canAddAndRemoveRoles(): void
    {
        $this->user->addRole($this->basicUserRole);
        $this->assertTrue($this->user->hasRole($this->basicUserRole));

        $this->user->removeRole($this->basicUserRole);
        $this->assertFalse($this->user->hasRole($this->basicUserRole));
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function canAddAndRemoveAbilities(): void
    {
        $this->user->addAbility($this->readOwnAbility);
        $this->assertTrue($this->user->hasAbility($this->readOwnAbility));

        $this->user->removeAbility($this->readOwnAbility);
        $this->assertFalse($this->user->hasAbility($this->readOwnAbility));
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function getsAbilitiesFromRoles(): void
    {
        $this->user->addRole($this->basicUserRole);
        $this->assertTrue($this->user->hasAbility($this->readOwnAbility));
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function convertsAbilitiesToPermissionStrings(): void
    {
        $this->user->addRole($this->basicUserRole);

        $permissions = $this->user->getRoles();

        $this->assertContains('AUTH:USER:READ:own', $permissions);
    }

    /**
     * @test
     * @group unit
     * @group entity
     */
    public function checksAbilityByAttributes(): void
    {
        $this->user->addRole($this->basicUserRole);

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
    public function serializesToJsonCorrectly(): void
    {
        $this->user->addRole($this->basicUserRole);
        $this->user->addAbility(new Ability(
            ModuleEnum::AUTH,
            'USER',
            ActionEnum::CREATE,
            null,
            'Can create users'
        ));
        $this->user->setCreatedAt(new \DateTimeImmutable('2021-01-01 12:00:00'));

        $json = json_encode($this->user);
        $data = json_decode($json, true);

        $this->assertArrayHasKey('username', $data);
        $this->assertArrayHasKey('roles', $data);
        $this->assertArrayHasKey('abilities', $data);
        $this->assertCount(1, $data['roles']);
        $this->assertCount(1, $data['abilities']);
    }

    /**
     * @test
     */
    public function userInheritsAbilitiesFromMultipleRoles(): void
    {
        // Given
        $readAbility = new Ability(ModuleEnum::AUTH, 'USER', ActionEnum::READ);
        $writeAbility = new Ability(ModuleEnum::AUTH, 'USER', ActionEnum::CREATE);

        $role1 = new Role('ROLE_1');
        $role1->addAbility($readAbility);

        $role2 = new Role('ROLE_2');
        $role2->addAbility($writeAbility);

        // When
        $user = new User('testuser', 'password');
        $user->addRole($role1);
        $user->addRole($role2);

        // Then
        $this->assertTrue($user->hasAbility($readAbility));
        $this->assertTrue($user->hasAbility($writeAbility));
    }
}