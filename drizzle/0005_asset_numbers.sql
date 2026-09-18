CREATE TABLE `nl_asset_numbers` (
	`number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nl_asset_numbers_asset_id_unique` ON `nl_asset_numbers` (`asset_id`);
--> statement-breakpoint
-- Continue beyond any historical number; preserve all existing printed serials.
INSERT INTO nl_asset_numbers(number,asset_id)
SELECT MAX(CAST(substr(serial,4) AS INTEGER)), '__migration_seed__'
FROM nl_assets WHERE serial GLOB 'NL-[0-9]*' AND substr(serial,4) NOT GLOB '*[^0-9]*'
HAVING MAX(CAST(substr(serial,4) AS INTEGER)) > 0;
--> statement-breakpoint
DELETE FROM nl_asset_numbers WHERE asset_id='__migration_seed__';
--> statement-breakpoint
INSERT INTO nl_asset_numbers(asset_id) SELECT id FROM nl_assets ORDER BY created,id;
--> statement-breakpoint
UPDATE nl_assets SET serial=(SELECT 'NL-' || printf('%08d',number) FROM nl_asset_numbers WHERE asset_id=nl_assets.id)
WHERE serial IS NULL OR trim(serial)='';
