-- The audit trail is the proof of what was asked, quoted and accepted: an event, once written,
-- can never be changed or deleted, nor who the server saw writing it (recorded_by). Only its
-- display position may move.
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
    OR NEW.data IS DISTINCT FROM OLD.data
    OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
    OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at THEN
    RAISE EXCEPTION 'audit_events is append-only: events cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();
