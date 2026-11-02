-- Shift existing rental wizard steps: 1 (management) -> 2, 2 (issuance) -> 3
-- so 1 can be "location and contract".
UPDATE "rental_licenses"
SET "formationStep" = "formationStep" + 1
WHERE "formationStep" >= 1;

UPDATE "rental_requests"
SET "formationStep" = "formationStep" + 1
WHERE "formationStep" >= 1;
