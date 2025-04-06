# Portable-Party-Portal

Travel portal for offline chatting and movie watching on the go.

## Useful commands

### Init the database

```bash
docker-compose exec auth bin/console app:init-database
```

### View postgres databases

```bash
# List all databases
docker-compose exec postgres psql -U postgres -c "\l"

# Connect to the auth_db and list its tables
docker-compose exec postgres psql -U postgres -d auth_db -c "\dt"

# Check if the migration was executed
docker-compose exec postgres ls -l /docker-entrypoint-initdb.d/migrations/
```
