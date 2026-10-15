-- Addresses are now confirmed by a link before any session. Accounts created before that rule are
-- treated as confirmed: their owners have been using them, and would otherwise be locked out.
UPDATE "users" SET "email_verified" = true WHERE "email_verified" = false;
