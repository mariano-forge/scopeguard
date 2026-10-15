-- Who the server saw writing an event (a user id, or "review-link:<key>" for a client) is part of
-- the proof: it can no more be changed than the rest of the event.
CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'audit_events is append-only: events cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
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
