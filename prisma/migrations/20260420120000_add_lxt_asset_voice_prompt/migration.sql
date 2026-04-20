-- AlterTable: add voicePrompt to lxt_project_assets
ALTER TABLE `lxt_project_assets`
  ADD COLUMN `voicePrompt` TEXT NULL;
