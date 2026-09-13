CREATE TABLE `accountSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(128) NOT NULL,
	`phone` varchar(40),
	`locale` varchar(12) NOT NULL DEFAULT 'ar-JO',
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Amman',
	`orderUpdates` int NOT NULL DEFAULT 1,
	`supportNotifications` int NOT NULL DEFAULT 1,
	`marketingNotifications` int NOT NULL DEFAULT 0,
	`profileVisibility` enum('private','support_only') NOT NULL DEFAULT 'private',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accountSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `accountSettings_userOpenId_unique` UNIQUE(`userOpenId`)
);
--> statement-breakpoint
CREATE TABLE `activityEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int,
	`actorRole` enum('customer','store','admin','system') NOT NULL,
	`eventType` enum('order_created','status_changed','message_sent','change_requested','customer_updated','store_update','system_note') NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text NOT NULL,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activityEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `courierAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`courierOpenId` varchar(128) NOT NULL,
	`assignedByOpenId` varchar(128) NOT NULL,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courierAssignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `courier_assignments_order_unique` UNIQUE(`orderId`)
);
--> statement-breakpoint
CREATE TABLE `courierLocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courierOpenId` varchar(128) NOT NULL,
	`orderId` int,
	`latitude` double NOT NULL,
	`longitude` double NOT NULL,
	`accuracyMeters` double,
	`heading` double,
	`speedKph` double,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courierLocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `courierLocations_courierOpenId_unique` UNIQUE(`courierOpenId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int,
	`storeId` int,
	`audience` enum('customer','store','owner') NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`isRead` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operationArchives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scope` varchar(20) NOT NULL,
	`entity` varchar(20) NOT NULL,
	`requestedByOpenId` varchar(128) NOT NULL,
	`fromDate` varchar(10) NOT NULL,
	`toDate` varchar(10) NOT NULL,
	`rowCount` int NOT NULL DEFAULT 0,
	`fileKey` varchar(500) NOT NULL,
	`fileUrl` varchar(1000) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operationArchives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orderItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`productId` int NOT NULL,
	`productName` varchar(160) NOT NULL,
	`quantity` int NOT NULL,
	`unitPriceCents` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orderMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`senderRole` enum('customer','store','admin','system') NOT NULL,
	`senderName` varchar(120) NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNumber` varchar(40) NOT NULL,
	`storeId` int NOT NULL,
	`customerOpenId` varchar(128),
	`customerName` varchar(160) NOT NULL,
	`customerPhone` varchar(40) NOT NULL,
	`customerAddress` varchar(300) NOT NULL,
	`customerNote` text,
	`status` enum('new','confirmed','ready','out_for_delivery','in_transit','delivered','cancelled') NOT NULL DEFAULT 'new',
	`statusReason` text,
	`totalCents` int NOT NULL,
	`discountCents` int NOT NULL DEFAULT 0,
	`deliveredAt` timestamp,
	`deliveryProofUrl` varchar(1000),
	`deliveryProofKey` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `productMedia` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`mediaType` enum('image','video') NOT NULL,
	`url` varchar(1000) NOT NULL,
	`storageKey` varchar(500),
	`altText` varchar(200),
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `productMedia_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `productReviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`customerOpenId` varchar(128) NOT NULL,
	`customerName` varchar(120) NOT NULL,
	`rating` int NOT NULL,
	`title` varchar(160),
	`body` text NOT NULL,
	`status` enum('published','hidden') NOT NULL DEFAULT 'published',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `productReviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_reviews_product_customer_unique` UNIQUE(`productId`,`customerOpenId`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text NOT NULL,
	`category` varchar(80) NOT NULL,
	`priceCents` int NOT NULL,
	`imageUrl` varchar(500) NOT NULL,
	`referenceCode` varchar(40),
	`badge` varchar(80),
	`stock` int NOT NULL DEFAULT 24,
	`approvalStatus` enum('draft','pending_review','approved','rejected','withdrawn') NOT NULL DEFAULT 'approved',
	`approvalNote` text,
	`submittedAt` timestamp,
	`approvedAt` timestamp,
	`approvedByOpenId` varchar(128),
	`withdrawnAt` timestamp,
	`withdrawnReason` text,
	`withdrawnByOpenId` varchar(128),
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_referenceCode_unique` UNIQUE(`referenceCode`)
);
--> statement-breakpoint
CREATE TABLE `staffInvitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`staffType` enum('support','courier','delivery_support') NOT NULL DEFAULT 'support',
	`invitedByOpenId` varchar(128) NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staffInvitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `staffInvitations_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `staffMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(128) NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`staffType` enum('support','courier','delivery_support') NOT NULL DEFAULT 'support',
	`status` enum('invited','active','suspended') NOT NULL DEFAULT 'active',
	`availability` enum('available','busy','unavailable') NOT NULL DEFAULT 'unavailable',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staffMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `staffMembers_userOpenId_unique` UNIQUE(`userOpenId`)
);
--> statement-breakpoint
CREATE TABLE `staffPasswordResets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(128) NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`createdByOpenId` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staffPasswordResets_id` PRIMARY KEY(`id`),
	CONSTRAINT `staffPasswordResets_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `staffRecoveryRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`userOpenId` varchar(128),
	`status` enum('pending','resolved') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	`resolvedByOpenId` varchar(128),
	CONSTRAINT `staffRecoveryRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staffShifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staffOpenId` varchar(128) NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`endedAt` timestamp,
	`startAvailability` enum('available','busy','unavailable') NOT NULL DEFAULT 'available',
	`endAvailability` enum('available','busy','unavailable'),
	`activeConversationCount` int NOT NULL DEFAULT 0,
	CONSTRAINT `staffShifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `storeSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`contactPhone` varchar(40),
	`address` varchar(300),
	`openingHours` text,
	`acceptingOrders` int NOT NULL DEFAULT 1,
	`orderNotifications` int NOT NULL DEFAULT 1,
	`supportNotifications` int NOT NULL DEFAULT 1,
	`publicProfile` int NOT NULL DEFAULT 1,
	`teamAccess` enum('owner_only','support_team') NOT NULL DEFAULT 'owner_only',
	`automaticCourierAssignment` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `storeSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `storeSettings_storeId_unique` UNIQUE(`storeId`)
);
--> statement-breakpoint
CREATE TABLE `storeSubscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`planId` int,
	`status` enum('none','trial','active','past_due','cancelled') NOT NULL DEFAULT 'none',
	`startedAt` timestamp,
	`trialEndsAt` timestamp,
	`endsAt` timestamp,
	`updatedByOpenId` varchar(128),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `storeSubscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `storeSubscriptions_storeId_unique` UNIQUE(`storeId`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(128),
	`name` varchar(160) NOT NULL,
	`handle` varchar(80) NOT NULL,
	`category` varchar(80) NOT NULL,
	`neighborhood` varchar(120) NOT NULL,
	`description` text NOT NULL,
	`latitude` double,
	`longitude` double,
	`verificationStatus` enum('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified',
	`verifiedAt` timestamp,
	`verifiedByOpenId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `stores_handle_unique` UNIQUE(`handle`)
);
--> statement-breakpoint
CREATE TABLE `subscriptionPlans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(60) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text NOT NULL,
	`featureSummary` text,
	`priceCents` int NOT NULL DEFAULT 0,
	`billingPeriod` enum('monthly','yearly') NOT NULL DEFAULT 'monthly',
	`trialDays` int NOT NULL DEFAULT 0,
	`isActive` int NOT NULL DEFAULT 1,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptionPlans_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptionPlans_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `supportAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`assigneeOpenId` varchar(128),
	`priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
	`slaDueAt` timestamp,
	`assignedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supportAssignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `supportAssignments_conversationId_unique` UNIQUE(`conversationId`)
);
--> statement-breakpoint
CREATE TABLE `supportConversationReads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`viewerRole` enum('customer','store','admin') NOT NULL,
	`viewerOpenId` varchar(128),
	`lastReadAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supportConversationReads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supportConversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int,
	`storeId` int,
	`channel` enum('customer_support','merchant_support') NOT NULL DEFAULT 'customer_support',
	`customerName` varchar(160) NOT NULL,
	`customerOpenId` varchar(128),
	`customerContact` varchar(120),
	`subject` varchar(200) NOT NULL,
	`status` enum('open','waiting_store','waiting_customer','escalated_store','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`closedAt` timestamp,
	`closedByRole` varchar(20),
	`closedByOpenId` varchar(128),
	`closedByName` varchar(120),
	CONSTRAINT `supportConversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supportEscalations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`fromRole` enum('admin','store') NOT NULL,
	`toRole` enum('store','admin') NOT NULL,
	`note` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supportEscalations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supportMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`senderRole` enum('customer','store','admin','system') NOT NULL,
	`senderName` varchar(120) NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supportMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supportParticipants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`role` enum('customer','store','admin') NOT NULL,
	`userOpenId` varchar(128),
	`displayName` varchar(120) NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supportParticipants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supportViewAudit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminOpenId` varchar(128) NOT NULL,
	`targetOpenId` varchar(128) NOT NULL,
	`targetRole` enum('user','store') NOT NULL,
	`reason` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supportViewAudit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','store','admin','staff') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerificationTokenHash` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerificationExpiresAt` timestamp;