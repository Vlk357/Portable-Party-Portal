CREATE OR REPLACE FUNCTION process_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
    audit_user_id INT;
    audit_ip_address VARCHAR(45);
BEGIN
    -- Get audit context from session variables
    audit_user_id := current_setting('app.audit_user_id', TRUE)::INT;
    audit_ip_address := current_setting('app.audit_ip_address', TRUE);
    
    IF audit_user_id IS NULL THEN
        RAISE EXCEPTION 'Audit user ID must be set before making changes';
    END IF;

    INSERT INTO audit_log (
        entity_type,
        entity_id,
        change_type,
        changed_at,
        changed_by,
        ip_address
    ) VALUES (
        TG_ARGV[0]::entity_type,
        CASE TG_OP
            WHEN 'DELETE' THEN OLD.id
            ELSE NEW.id
        END,
        CASE TG_OP
            WHEN 'INSERT' THEN 'CREATED'
            WHEN 'UPDATE' THEN 'UPDATED'
            WHEN 'DELETE' THEN 'DELETED'
        END,
        CURRENT_TIMESTAMP,
        audit_user_id,
        audit_ip_address
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;