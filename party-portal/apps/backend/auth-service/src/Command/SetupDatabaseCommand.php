<?php
// src/Command/SetupDatabaseCommand.php

namespace App\Command;

use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\Process\Process;

#[AsCommand(
    name: 'app:setup-database',
    description: 'Set up the database schema and audit triggers',
)]
class SetupDatabaseCommand extends Command
{
    private EntityManagerInterface $entityManager;
    private string $projectDir;

    public function __construct(EntityManagerInterface $entityManager, string $projectDir)
    {
        $this->entityManager = $entityManager;
        $this->projectDir = $projectDir;
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('force', 'f', InputOption::VALUE_NONE, 'Force recreating the schema (warning: data will be lost)')
            ->addOption('check-only', 'c', InputOption::VALUE_NONE, 'Only check if setup is needed');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $io->title('Setting up database');

        $conn = $this->entityManager->getConnection();
        $forceSetup = $input->getOption('force');
        $checkOnly = $input->getOption('check-only');

        try {
            // Check if schema exists by looking for key tables
            $schemaManager = $conn->createSchemaManager();
            $tablesExist = false;

            try {
                $existingTables = $schemaManager->listTableNames();
                $requiredTables = ['users', 'abilities', 'roles'];
                $tablesExist = count(array_intersect($requiredTables, $existingTables)) === count($requiredTables);
            } catch (\Exception $e) {
                // Schema probably doesn't exist
                $tablesExist = false;
            }

            if ($checkOnly) {
                if ($tablesExist) {
                    $io->success('Database schema is already set up.');
                } else {
                    $io->note('Database schema needs to be set up.');
                }
                return Command::SUCCESS;
            }

            if ($tablesExist && !$forceSetup) {
                $io->info('Schema already exists. Use --force to recreate it (warning: all data will be lost).');

                // Check if audit triggers exist
                $triggerExists = false;
                try {
                    $triggerExists = (bool) $conn->executeQuery(
                        "SELECT 1 FROM pg_trigger WHERE tgname = 'audit_trigger_users'"
                    )->fetchOne();
                } catch (\Exception $e) {
                    // Trigger does not exist
                }

                if (!$triggerExists) {
                    $io->note('Audit triggers not found. Installing them...');
                    $this->installAuditTriggers($io);
                } else {
                    $io->info('Audit triggers already installed.');
                }

                return Command::SUCCESS;
            }

            // Create or recreate schema
            if ($forceSetup && $tablesExist) {
                $io->warning('Dropping existing schema. ALL DATA WILL BE LOST!');
                $schemaTool = new SchemaTool($this->entityManager);
                $metadata = $this->entityManager->getMetadataFactory()->getAllMetadata();
                $schemaTool->dropSchema($metadata);
            }

            $io->info('Creating database schema...');
            $process = new Process(['php', 'bin/console', 'doctrine:schema:create']);
            $process->setWorkingDirectory($this->projectDir);
            $process->run();

            if (!$process->isSuccessful()) {
                $io->error('Failed to create schema: ' . $process->getErrorOutput());
                return Command::FAILURE;
            }

            $io->success('Schema created successfully.');

            // Install audit triggers
            $this->installAuditTriggers($io);

            return Command::SUCCESS;
        } catch (\Exception $e) {
            $io->error("Error setting up database: {$e->getMessage()}");
            return Command::FAILURE;
        }
    }

    private function installAuditTriggers(SymfonyStyle $io): void
    {
        $io->info('Installing audit triggers...');
        $process = new Process(['php', 'bin/console', 'app:install-audit-triggers']);
        $process->setWorkingDirectory($this->projectDir);
        $process->run();

        if ($process->isSuccessful()) {
            $io->success('Audit triggers installed.');
        } else {
            $io->warning('Failed to install audit triggers: ' . $process->getErrorOutput());
        }
    }
}