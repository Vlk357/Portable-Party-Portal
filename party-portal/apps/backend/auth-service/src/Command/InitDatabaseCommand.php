<?php

namespace App\Command;

use App\Entity\User;
use App\Entity\Role;
use App\Entity\Ability;
use App\Enum\ModuleEnum;
use App\Enum\ActionEnum;
use App\Enum\UserStatus;
use Doctrine\ORM\EntityManagerInterface;
use Exception;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

#[AsCommand(
    name: 'app:init-database',
    description: 'Initialize database with admin user and default abilities',
)]
class InitDatabaseCommand extends Command
{
    public function __construct(
        private EntityManagerInterface $em,
        private UserPasswordHasherInterface $passwordHasher
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $adminUsername = getenv('ADMIN_USERNAME') ?: null;
        $adminPassword = getenv('ADMIN_PASSWORD') ?: null;

        if (!$adminUsername || !$adminPassword) {
            $io->error('ADMIN_USERNAME and ADMIN_PASSWORD must be set in .env file');
            return Command::FAILURE;
        }

        $chatUsername = getenv('CHAT_SERVICE_API_USER') ?: null;
        $chatPassword = getenv('CHAT_SERVICE_API_PASSWORD') ?: null;

        if (!$chatUsername || !$chatPassword) {
            $io->error('CHAT_SERVICE_API_USER and CHAT_SERVICE_API_PASSWORD must be set in .env file');
            return Command::FAILURE;
        }

        $this->em->clear();
        $this->em->getConnection()->beginTransaction();
        try {
            $adminRole = $this->em->getRepository(Role::class)->findOneBy(['name' => 'admin']);
            if (!$adminRole) {
                $io->note('Creating admin role...');
                $adminRole = new Role('admin', 'System administrator - has all non-constrained abilities in the system');

                $this->em->persist($adminRole);
                $this->em->flush();
            }

            // TODO: Admin has to be created at the end to receive all abilities from all modules
            $admin = $this->em->getRepository(User::class)->findOneBy(['username' => $adminUsername]);
            if (!$admin) {
                $io->note('Creating admin user...');
                $admin = new User($adminUsername, $adminPassword);
                $admin->setStatus(UserStatus::ACTIVE);

                $this->em->persist($admin);
            }
            $admin->setPlainPassword($adminPassword);
            $admin->hashPassword();
            $this->em->flush();

            $existingAbilities = $this->em->getRepository(Ability::class)->findBy([
                'module' => ModuleEnum::AUTH,
            ]);
            if (count($existingAbilities) > 0) {
                $io->note('Found existing abilities for Auth module');
            } else {
                $io->note('No existing abilities for Auth module found');
            }
            $existingAuthAbilityMap = [];
            foreach ($existingAbilities as $ability) {
                if ($ability->getResourceConstraint()) {
                    $io->note('Skipping ability with resource constraint');
                    continue;
                }
                $key = sprintf(
                    '%s:%s:%s',
                    $ability->getModule()->value,
                    $ability->getResource(),
                    $ability->getAction()->value
                );
                $existingAuthAbilityMap[$key] = $ability;
            }

            // Create abilities for Auth module
            // $io->note('Creating abilities for Auth module...');
            $newAuthAbilities = [];
            foreach (['USER', 'ROLE', 'ABILITY', 'USER_ROLE', 'USER_ABILITY', 'ROLE_ABILITY'] as $resource) {
                foreach ([ActionEnum::CREATE, ActionEnum::READ, ActionEnum::UPDATE, ActionEnum::DELETE] as $action) {
                    $key = sprintf('%s:%s:%s', ModuleEnum::AUTH->value, $resource, $action->value);
                    for ($i = 0; $i < 2; $i++) {
                        if (!isset($existingAuthAbilityMap[$key])) {
                            // $io->note("Creating ability $key");
                            $ability = new Ability(
                                ModuleEnum::AUTH,
                                $resource,
                                $action,
                                $i === 1 ? "OWN" : null,
                                "Can {$action->value} {$resource}s"
                            );
                            $this->em->persist($ability);
                            $newAuthAbilities[] = $ability;
                        }
                    }
                }
            }
            $this->em->flush();

            $io->note('There have been ' . count($newAuthAbilities) . ' new Auth abilities created.');

            $addedAbilities = 0;
            foreach ($newAuthAbilities as $ability) {
                if (!$adminRole->hasAbility($ability)) {
                    // $io->note(sprintf(
                    //     "Adding ability %s:%s:%s%s to admin role",
                    //     $ability->getModule()->value,
                    //     $ability->getResource(),
                    //     $ability->getAction()->value,
                    //     $ability->getResourceConstraint() ? ":{$ability->getResourceConstraint()}" : ""
                    // ));
                    $adminRole->addAbility($ability);
                    $addedAbilities++;
                }
            }

            $this->em->persist($adminRole);
            $this->em->flush();

            if ($addedAbilities > 0) {
                $io->note("Added $addedAbilities abilities to admin role");
            }

            if (!$admin->hasRole($adminRole)) {
                $io->note('Adding admin role to admin user');
                $admin->addRole($adminRole);
            }

            // $io->note(json_encode($admin->jsonSerialize()));
            // $io->note(json_encode($adminRole->jsonSerialize()));

            $this->em->persist($admin);
            $this->em->flush();

            /*             // Create default abilities for chat module

                        $existingChatAbilities = $this->em->getRepository(Ability::class)->findBy([
                            'module' => ModuleEnum::CHAT,
                        ]);
                        if (count($existingChatAbilities) > 0) {
                            $io->note('Found existing abilities for Chat module');
                        } else {
                            $io->note('No existing abilities for Chat module found');
                        }
                        $existingChatAbilityMap = [];
                        foreach ($existingChatAbilities as $ability) {
                            if ($ability->getResourceConstraint()) {
                                $io->note('Skipping ability with resource constraint');
                                continue;
                            }
                            $key = sprintf(
                                '%s:%s:%s',
                                $ability->getModule()->value,
                                $ability->getResource(),
                                $ability->getAction()->value
                            );
                            $existingChatAbilityMap[$key] = $ability;
                        }

                        $io->note('Creating abilities for Chat module...');
                        $newChatAbilities = [];

                        foreach (['MESSAGE', 'CHAT_ROOM', 'CHAT_ROOM_USER_HISTORY'] as $resource) {
                            foreach ([ActionEnum::CREATE, ActionEnum::READ, ActionEnum::UPDATE, ActionEnum::DELETE] as $action) {
                                $key = sprintf('%s:%s:%s', ModuleEnum::CHAT->value, $resource, $action->value);
                                if (!isset($existingChatAbilityMap[$key])) {
                                    $io->note("Creating ability $key");
                                    $ability = new Ability(
                                        ModuleEnum::CHAT,
                                        $resource,
                                        $action,
                                        null,
                                        "Can {$action->value} {$resource}s"
                                    );
                                    $this->em->persist($ability);
                                    $newChatAbilities[] = $ability;
                                }
                            }
                        }

                        $this->em->flush();

                        $io->note('There have been ' . count($newChatAbilities) . ' new Chat abilities created.');

                        // Create chat service role
                        $chatRole = $this->em->getRepository(Role::class)->findOneBy(['name' => $chatUsername]);
                        if (!$chatRole) {
                            $io->note('Creating chat service role...');
                            $chatRole = new Role($chatUsername, 'Chat service role - has all abilities in the chat module');
                            foreach ($newChatAbilities as $ability) {
                                if (!$chatRole->hasAbility($ability)) {
                                    $io->note(sprintf(
                                        "Adding ability %s:%s:%s to %s role",
                                        $ability->getModule()->value,
                                        $ability->getResource(),
                                        $ability->getAction()->value,
                                        $chatRole->getName()
                                    ));
                                    $chatRole->addAbility($ability);
                                }
                            }
                            $this->em->persist($chatRole);
                        }

                        // Add abilities to get roles, abilities and users to cache in chat service
                        $readAuthAbility = $this->em->getRepository(Ability::class)->findOneBy(['module' => 'AUTH', 'action' => 'READ', 'resource' => 'ABILITY']);
                        if ($readAuthAbility && !$chatRole->hasAbility($readAuthAbility)) {
                            $io->note("Adding AUTH:ABILITY:READ to chatRole");
                            $chatRole->addAbility($readAuthAbility);
                        } else {
                            $io->note("Ability AUTH:ABILITY:READ couldn't be found or is already assigned to chatRole");
                        }

                        $readAuthRole = $this->em->getRepository(Ability::class)->findOneBy(['module' => 'AUTH', 'action' => 'READ', 'resource' => 'ROLE']);
                        if ($readAuthRole && !$chatRole->hasAbility($readAuthRole)) {
                            $io->note("Adding AUTH:ROLE:READ to chatRole");
                            $chatRole->addAbility($readAuthRole);
                        } else {
                            $io->note("Ability AUTH:ROLE:READ couldn't be found or is already assigned to chatRole");
                        }
                        $readAuthUser = $this->em->getRepository(Ability::class)->findOneBy(['module' => 'AUTH', 'action' => 'READ', 'resource' => 'USER']);
                        if ($readAuthUser && !$chatRole->hasAbility($readAuthUser)) {
                            $io->note("Adding AUTH:USER:READ to chatRole");
                            $chatRole->addAbility($readAuthUser);
                        } else {
                            $io->note("Ability AUTH:USER:READ couldn't be found or is already assigned to chatRole");
                        }

                        $this->em->flush();

                        // Create chat service user

                        if (!$chatUser->hasRole($chatRole)) {
                            $io->note('Adding chat service role to chat service user');
                            $chatUser->addRole($chatRole);
                        } */

            $chatUser = $this->em->getRepository(User::class)->findOneBy(['username' => $chatUsername]);
            if (!$chatUser) {
                $io->note('Creating chat service user...');
                $chatUser = new User($chatUsername, $chatPassword);
                $chatUser->hashPassword();
                $chatUser->setStatus(UserStatus::ACTIVE);
                $this->em->persist($chatUser);
            }
            $chatUser->setPlainPassword($chatPassword);
            $admin->hashPassword();
            $authReadUser = $this->em->getRepository(Ability::class)->findOneBy(['module' => 'AUTH', 'resource' => 'USER', 'action' => 'READ', 'resourceConstraint' => null]);
            $chatUser->addAbility($authReadUser);
            $this->em->flush();

            $this->em->getConnection()->commit();

            $io->success('Database initialized successfully');
            return Command::SUCCESS;
        } catch (\Exception $e) {
            try {
                if ($this->em->getConnection()->isTransactionActive()) {
                    $this->em->getConnection()->rollBack();
                }
                // Clear the entity manager to remove any cached entities
                $this->em->clear();
                $io->error('Failed to initialize database: ' . $e->getMessage());
                return Command::FAILURE;
            } catch (Exception $e) {
                $io->error('Failed to rollback transaction: ' . $e->getMessage());
                return Command::FAILURE;
            }
        }
    }

    private function dumpUserRoles(SymfonyStyle $io): void
    {
        $rows = $this->em->getConnection()
            ->executeQuery('SELECT u.username, r.name as role_name, ur.user_id, ur.role_id 
                       FROM user_roles ur 
                       JOIN users u ON ur.user_id = u.id 
                       JOIN roles r ON ur.role_id = r.id')
            ->fetchAllAssociative();

        $io->section('Current user_roles state:');
        foreach ($rows as $row) {
            $io->text(sprintf(
                'user: %s (id: %d) -> role: %s (id: %d)',
                $row['username'],
                $row['user_id'],
                $row['role_name'],
                $row['role_id']
            ));
        }
    }
}
