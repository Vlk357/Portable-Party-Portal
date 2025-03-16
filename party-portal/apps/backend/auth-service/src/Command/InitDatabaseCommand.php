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

        $adminUsername = $_ENV['ADMIN_USERNAME'] ?? null;
        $adminPassword = $_ENV['ADMIN_PASSWORD'] ?? null;

        if (!$adminUsername || !$adminPassword) {
            $io->error('ADMIN_USERNAME and ADMIN_PASSWORD must be set in .env file');
            return Command::FAILURE;
        }

        $this->em->clear();
        $this->em->getConnection()->beginTransaction();
        try {

            $adminRole = $this->em->getRepository(Role::class)->findOneBy(['name' => 'admin']);
            if (!$adminRole) {
                $io->note('Creating admin role...');
                $adminRole = new Role();
                $adminRole->setName('admin');
                $adminRole->setDescription('System administrator - has all abilities in the system');

                $this->em->persist($adminRole);
                $this->em->flush();
            }

            $admin = $this->em->getRepository(User::class)->findOneBy(['username' => $adminUsername]);
            if (!$admin) {
                $io->note('Creating admin user...');
                $admin = new User();
                $admin->setUsername($adminUsername);
                $admin->setStatus(UserStatus::ACTIVE);

                $this->em->persist($admin);
            }
            $admin->setPassword($adminPassword);
            $this->em->flush();

            $existingAbilities = $this->em->getRepository(Ability::class)->findAll();
            $existingAbilityMap = [];
            foreach ($existingAbilities as $ability) {
                $key = sprintf('%s:%s:%s', $ability->getModule()->value, $ability->getResource(), $ability->getAction()->value);
                $existingAbilityMap[$key] = $ability;
            }

            // Create abilities
            $newAbilities = [];
            foreach (['USER', 'ROLE', 'ABILITY', 'USER_ROLE', 'USER_ABILITY', 'ROLE_ABILITY'] as $resource) {
                foreach ([ActionEnum::CREATE, ActionEnum::READ, ActionEnum::UPDATE, ActionEnum::DELETE] as $action) {
                    $key = sprintf('%s:%s:%s', ModuleEnum::AUTH->value, $resource, $action->value);
                    if (!isset($existingAbilityMap[$key])) {
                        $io->note("Creating ability $key");
                        $ability = $this->em->getRepository(Ability::class)->findOneBy([
                            'module' => ModuleEnum::AUTH,
                            'resource' => $resource,
                            'action' => $action
                        ]);
                        $ability = new Ability(
                            ModuleEnum::AUTH,
                            $resource,
                            $action,
                            null,
                            "Can {$action->value} {$resource}s"
                        );
                        $this->em->persist($ability);
                        $newAbilities[] = $ability;
                    } else {
                        $newAbilities[] = $existingAbilityMap[$key];
                    }
                }
            }
            $this->em->flush();

            $io->note('There is a total of ' . count($newAbilities) . ' abilities');

            $addedAbilities = 0;
            foreach ($newAbilities as $ability) {
                if (!$adminRole->hasAbility($ability)) {
                    $io->note("Adding ability {$ability->getId()} to admin role");
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