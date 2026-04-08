-- CreateTable
CREATE TABLE `character_relations` (
    `id` VARCHAR(191) NOT NULL,
    `novelPromotionProjectId` VARCHAR(191) NOT NULL,
    `fromName` VARCHAR(191) NOT NULL,
    `toName` VARCHAR(191) NOT NULL,
    `relationType` VARCHAR(191) NOT NULL,
    `direction` VARCHAR(191) NOT NULL DEFAULT 'unidirectional',
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `character_relations_novelPromotionProjectId_fromName_toName_key`(`novelPromotionProjectId`, `fromName`, `toName`),
    INDEX `character_relations_novelPromotionProjectId_idx`(`novelPromotionProjectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `character_relations` ADD CONSTRAINT `character_relations_novelPromotionProjectId_fkey` FOREIGN KEY (`novelPromotionProjectId`) REFERENCES `novel_promotion_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
