-- Migration: add colorGradePreset and targetPlatform to novel_promotion_projects
-- Compatible with MySQL 8 / MariaDB 11 (portable version)

ALTER TABLE `novel_promotion_projects`
  ADD COLUMN `colorGradePreset` VARCHAR(191) NOT NULL DEFAULT 'auto',
  ADD COLUMN `targetPlatform`   VARCHAR(191) NOT NULL DEFAULT 'douyin';
