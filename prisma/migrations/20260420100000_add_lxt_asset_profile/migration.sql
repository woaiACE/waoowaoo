-- AlterTable: add profileData, description, profileConfirmed to lxt_project_assets
ALTER TABLE `lxt_project_assets`
  ADD COLUMN `profileData` TEXT NULL,
  ADD COLUMN `description` TEXT NULL,
  ADD COLUMN `profileConfirmed` BOOLEAN NOT NULL DEFAULT false;
