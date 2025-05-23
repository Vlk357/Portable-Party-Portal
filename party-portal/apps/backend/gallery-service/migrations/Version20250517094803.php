<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20250517094803 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            DROP INDEX uniq_583396edf8eb9b7
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE gallery_items ADD taken_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE gallery_items ALTER mime_type TYPE VARCHAR(255)
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE gallery_items ALTER mime_type SET NOT NULL
        SQL);
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql(<<<'SQL'
            ALTER TABLE gallery_items DROP taken_at
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE gallery_items ALTER mime_type TYPE VARCHAR(100)
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE gallery_items ALTER mime_type DROP NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            CREATE UNIQUE INDEX uniq_583396edf8eb9b7 ON gallery_items (stored_filename)
        SQL);
    }
}
