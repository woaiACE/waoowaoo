CREATE TABLE `lxt_project_assets` (
  `id` VARCHAR(191) NOT NULL,
  `lxtProjectId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `summary` TEXT NULL,
  `globalCharacterId` VARCHAR(191) NULL,
  `globalLocationId` VARCHAR(191) NULL,
  `globalPropId` VARCHAR(191) NULL,
  `voiceId` VARCHAR(191) NULL,
  `voiceType` VARCHAR(191) NULL,
  `customVoiceUrl` TEXT NULL,
  `imageUrl` TEXT NULL,
  `imageMediaId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `lxt_project_assets_lxtProjectId_kind_name_key`(`lxtProjectId`, `kind`, `name`),
  INDEX `lxt_project_assets_lxtProjectId_idx`(`lxtProjectId`),
  INDEX `lxt_project_assets_kind_idx`(`kind`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `lxt_project_assets`
  ADD CONSTRAINT `lxt_project_assets_lxtProjectId_fkey`
  FOREIGN KEY (`lxtProjectId`) REFERENCES `lxt_projects`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
