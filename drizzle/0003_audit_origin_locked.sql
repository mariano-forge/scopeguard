-- The version an event is about and where its request came from (IP, browser) are part of the proof:
-- like the rest of the event, they can never be changed once written.
CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'audit_events is append-only: events cannot be deleted';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.actor IS DISTINCT FROM OLD.actor
    OR NEW.comment_id IS DISTINCT FROM OLD.comment_id
    OR NEW.deliverable_id IS DISTINCT FROM OLD.deliverable_id
    OR NEW.data IS DISTINCT FROM OLD.data
    OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
    OR NEW.ip_address IS DISTINCT FROM OLD.ip_address
    OR NEW.user_agent IS DISTINCT FROM OLD.user_agent
    OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at THEN
    RAISE EXCEPTION 'audit_events is append-only: events cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
