-- AlterTable: add finalFilmContent to lxt_episodes (JSON string serialized rows)
ALTER TABLE `lxt_episodes`
  ADD COLUMN `finalFilmContent` TEXT NULL;
