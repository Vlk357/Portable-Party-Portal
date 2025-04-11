<?php
// src/Command/InstallAuditTriggersCommand.php

namespace App\Command;

use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:install-audit-triggers',
    description: 'Install PostgreSQL audit triggers',
)]
class InstallAuditTriggersCommand extends Command
{
    private Connection $connection;
    private string $projectDir;

    public function __construct(Connection $connection, string $projectDir)
    {
        $this->connection = $connection;
        $this->projectDir = $projectDir;
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $io->title('Installing PostgreSQL audit triggers');

        try {
            // Check if required tables exist
            $tablesExist = $this->checkTablesExist(['users', 'abilities', 'roles']);

            if (!$tablesExist) {
                $io->error('Required tables do not exist. Please run doctrine:schema:create first.');
                return Command::FAILURE;
            }

            // Find the SQL file
            $sqlPath = $this->projectDir . '/src/sql/audit_triggers.sql';

            if (!file_exists($sqlPath)) {
                $io->error("Audit triggers SQL file not found: $sqlPath");
                return Command::FAILURE;
            }

            // Install triggers
            $sql = file_get_contents($sqlPath);
            $this->connection->executeStatement($sql);

            $io->success('Audit triggers installed successfully.');
            return Command::SUCCESS;
        } catch (\Exception $e) {
            $io->error("Error installing audit triggers: {$e->getMessage()}");
            return Command::FAILURE;
        }
    }

    private function checkTablesExist(array $tables): bool
    {
        try {
            $existingTables = $this->connection->createSchemaManager()->listTableNames();

            foreach ($tables as $table) {
                if (!in_array($table, $existingTables)) {
                    return false;
                }
            }

            return true;
        } catch (\Exception $e) {
            return false;
        }
    }
}