BEGIN;

-- Create admin role
INSERT INTO roles (name, description)
VALUES ('admin', 'System administrator');

-- Create basic abilities
INSERT INTO abilities (module, resource, action, description)
VALUES 
    ('AUTH', 'user', 'CREATE', 'Can create new users'),
    ('AUTH', 'user', 'READ', 'Can view user details'),
    ('AUTH', 'user', 'UPDATE', 'Can modify users'),
    ('AUTH', 'role', 'MANAGE', 'Can manage roles');

COMMIT;