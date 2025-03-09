<?php

declare(strict_types=1);

namespace App\Command;

use Doctrine\ORM\EntityManagerInterface;
use Doctrine\DBAL\Schema\AbstractSchemaManager;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

class GenerateEntitiesCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly string $projectDir
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->setName('app:generate-entities')
            ->setDescription('Generate entities from database schema');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        try {
            /** @var AbstractSchemaManager $schemaManager */
            $schemaManager = $this->entityManager->getConnection()->createSchemaManager();

            $tables = $schemaManager->listTables();

            foreach ($tables as $table) {
                $className = $this->tableNameToClassName($table->getName());
                $entityFile = sprintf('%s/src/Entity/%s.php', $this->projectDir, $className);

                if (!file_exists($entityFile)) {
                    $this->generateEntity($table, $className, $entityFile);
                    $io->info(sprintf('Generated entity for table "%s"', $table->getName()));
                }
            }

            $io->success('Entities generated successfully');
            return Command::SUCCESS;
        } catch (\Exception $e) {
            $io->error('Failed to generate entities: ' . $e->getMessage());
            return Command::FAILURE;
        }
    }

    private function tableNameToClassName(string $tableName): string
    {
        return str_replace(' ', '', ucwords(str_replace('_', ' ', $tableName)));
    }

    private function generateEntity($table, string $className, string $filePath): void
    {
        $columns = $table->getColumns();
        $template = $this->getEntityTemplate($className, $table, $columns);
        file_put_contents($filePath, $template);
    }

    private function getEntityTemplate(string $className, $table, $columns): string
    {
        $properties = [];
        $gettersSetters = [];

        foreach ($columns as $column) {
            $propertyName = lcfirst($this->tableNameToClassName($column->getName()));
            $type = $this->mapColumnType($column);

            $properties[] = sprintf('    private %s $%s;', $type, $propertyName);

            // Generate getter
            $gettersSetters[] = sprintf(
                '    public function get%s(): %s
    {
        return $this->%s;
    }',
                ucfirst($propertyName),
                $type,
                $propertyName
            );

            // Generate setter
            $gettersSetters[] = sprintf(
                '    public function set%s(%s $%s): self
    {
        $this->%s = $%s;
        return $this;
    }',
                ucfirst($propertyName),
                $type,
                $propertyName,
                $propertyName,
                $propertyName
            );
        }

        return sprintf(
            '<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: \'%s\')]
class %s
{
%s

%s
}
',
            $table->getName(),
            $className,
            implode("\n\n", $properties),
            implode("\n\n", $gettersSetters)
        );
    }

    private function mapColumnType($column): string
    {
        return match ($column->getType()->getName()) {
            'integer' => 'int',
            'string' => 'string',
            'text' => 'string',
            'datetime' => '\DateTimeImmutable',
            'boolean' => 'bool',
            default => 'string',
        };
    }
}
