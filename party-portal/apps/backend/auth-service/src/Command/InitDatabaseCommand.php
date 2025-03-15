<?php

namespace App\Command;

use App\Entity\User;
use App\Entity\Role;
use App\Entity\Ability;
use App\Enum\ModuleEnum;
use App\Enum\ActionEnum;
use App\Enum\UserStatus;
use Doctrine\ORM\EntityManagerInterface;
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

        $this->em->getConnection()->beginTransaction();
        try {
            $adminRole = $this->em->getRepository(Role::class)->findOneBy(['name' => 'admin']);
            if (!$adminRole) {
                $adminRole = new Role();
                $adminRole->setName('admin');
                $adminRole->setDescription('System administrator');

                $this->em->persist($adminRole);
            }

            $admin = $this->em->getRepository(User::class)->findOneBy(['username' => $adminUsername]);
            if (!$admin) {
                $admin = new User();
                $admin->setUsername($adminUsername);
                $admin->setPassword($this->passwordHasher->
                    hashPassword($admin, $adminPassword));
                $admin->setStatus(UserStatus::ACTIVE);

                $this->em->persist($admin);
            }

            // Create abilities
            $abilities = [];
            foreach (['user', 'role', 'ability', 'user_role', 'user_ability', 'role_ability'] as $resource) {
                foreach ([ActionEnum::CREATE, ActionEnum::READ, ActionEnum::UPDATE, ActionEnum::DELETE] as $action) {
                    $ability = $this->em->getRepository(Ability::class)->findOneBy([
                        'module' => ModuleEnum::AUTH,
                        'resource' => $resource,
                        'action' => $action
                    ]);
                    if (!$ability) {
                        $ability = new Ability(
                            ModuleEnum::AUTH,
                            $resource,
                            $action,
                            null,
                            "Can {$action->value} {$resource}s"
                        );
                        $this->em->persist($ability);
                    }
                    $abilities[] = $ability;
                }
            }

            foreach ($abilities as $ability) {
                if (!$adminRole->hasAbility($ability)) {
                    $adminRole->addAbility($ability);
                }
            }

            if (!$admin->hasRole($adminRole)) {
                $admin->addRole($adminRole);
            }

            $this->em->flush();
            $this->em->getConnection()->commit();

            $io->success('Database initialized successfully');
            return Command::SUCCESS;
        } catch (\Exception $e) {
            $this->em->getConnection()->rollBack();
            $io->error('Failed to initialize database: ' . $e->getMessage());
            return Command::FAILURE;
        }
    }
}