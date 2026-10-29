IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE TABLE [AcademicUnits] (
        [Id] int NOT NULL IDENTITY,
        [Code] nvarchar(50) NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [UnitType] nvarchar(max) NOT NULL,
        [ParentName] nvarchar(max) NOT NULL,
        [BoardName] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_AcademicUnits] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE TABLE [AuditLogs] (
        [Id] bigint NOT NULL IDENTITY,
        [AcademicUnitId] int NULL,
        [UserId] int NULL,
        [Username] nvarchar(max) NULL,
        [Level] nvarchar(max) NOT NULL,
        [Message] nvarchar(max) NOT NULL,
        [Detail] nvarchar(max) NULL,
        [Ip] nvarchar(max) NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_AuditLogs] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE TABLE [Users] (
        [Id] int NOT NULL IDENTITY,
        [FullName] nvarchar(max) NOT NULL,
        [Title] nvarchar(max) NOT NULL,
        [Username] nvarchar(100) NOT NULL,
        [Email] nvarchar(200) NOT NULL,
        [PasswordHash] nvarchar(max) NOT NULL,
        [Role] nvarchar(max) NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_Users] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE TABLE [Roles] (
        [Id] int NOT NULL IDENTITY,
        [AcademicUnitId] int NOT NULL,
        [Name] nvarchar(100) NOT NULL,
        [Kind] nvarchar(max) NOT NULL,
        [IsSystem] bit NOT NULL,
        [PermissionsJson] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_Roles] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Roles_AcademicUnits_AcademicUnitId] FOREIGN KEY ([AcademicUnitId]) REFERENCES [AcademicUnits] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE TABLE [Decisions] (
        [Id] int NOT NULL IDENTITY,
        [AcademicUnitId] int NOT NULL,
        [MeetingDate] date NOT NULL,
        [MeetingYear] int NOT NULL,
        [MeetingNo] int NOT NULL,
        [DecisionNo] int NOT NULL,
        [Reference] nvarchar(max) NOT NULL,
        [Agenda] nvarchar(max) NOT NULL,
        [Content] nvarchar(max) NOT NULL,
        [AttachmentsNote] nvarchar(max) NOT NULL,
        [TableColumnsJson] nvarchar(max) NOT NULL,
        [TableRowsJson] nvarchar(max) NOT NULL,
        [Status] nvarchar(max) NOT NULL,
        [VoteOutcome] nvarchar(max) NULL,
        [CreatedById] int NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [SignedAt] datetime2 NULL,
        [DocumentHash] nvarchar(max) NULL,
        [SealedAt] datetime2 NULL,
        CONSTRAINT [PK_Decisions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Decisions_AcademicUnits_AcademicUnitId] FOREIGN KEY ([AcademicUnitId]) REFERENCES [AcademicUnits] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Decisions_Users_CreatedById] FOREIGN KEY ([CreatedById]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE TABLE [UserUnits] (
        [Id] int NOT NULL IDENTITY,
        [UserId] int NOT NULL,
        [AcademicUnitId] int NOT NULL,
        [RoleId] int NOT NULL,
        [UnitRole] nvarchar(max) NOT NULL,
        [Duty] nvarchar(max) NOT NULL,
        [IsBoardMember] bit NOT NULL,
        [SortOrder] int NOT NULL,
        [IsActive] bit NOT NULL,
        CONSTRAINT [PK_UserUnits] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_UserUnits_AcademicUnits_AcademicUnitId] FOREIGN KEY ([AcademicUnitId]) REFERENCES [AcademicUnits] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_UserUnits_Roles_RoleId] FOREIGN KEY ([RoleId]) REFERENCES [Roles] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_UserUnits_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE TABLE [Attachments] (
        [Id] int NOT NULL IDENTITY,
        [DecisionId] int NOT NULL,
        [OriginalName] nvarchar(max) NOT NULL,
        [StoredPath] nvarchar(max) NOT NULL,
        [SizeBytes] bigint NOT NULL,
        [UploadedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_Attachments] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Attachments_Decisions_DecisionId] FOREIGN KEY ([DecisionId]) REFERENCES [Decisions] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE TABLE [DecisionParticipants] (
        [Id] int NOT NULL IDENTITY,
        [DecisionId] int NOT NULL,
        [UserId] int NOT NULL,
        [DisplayName] nvarchar(max) NOT NULL,
        [Duty] nvarchar(max) NOT NULL,
        [SortOrder] int NOT NULL,
        [IsChair] bit NOT NULL,
        [Attendance] nvarchar(max) NOT NULL,
        [Vote] nvarchar(max) NULL,
        [VoteReason] nvarchar(max) NULL,
        [VotedAt] datetime2 NULL,
        [SignedAt] datetime2 NULL,
        [SignatureRef] nvarchar(max) NULL,
        CONSTRAINT [PK_DecisionParticipants] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_Participant_NoVoteWhenAbsent] CHECK ([Attendance] = 'Katilir' OR [Vote] IS NULL),
        CONSTRAINT [CK_Participant_RetReason] CHECK ([Vote] <> 'Ret' OR LEN(LTRIM(RTRIM(ISNULL([VoteReason], '')))) > 0),
        CONSTRAINT [FK_DecisionParticipants_Decisions_DecisionId] FOREIGN KEY ([DecisionId]) REFERENCES [Decisions] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_DecisionParticipants_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_AcademicUnits_Code] ON [AcademicUnits] ([Code]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Attachments_DecisionId] ON [Attachments] ([DecisionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_DecisionParticipants_DecisionId_UserId] ON [DecisionParticipants] ([DecisionId], [UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_DecisionParticipants_UserId] ON [DecisionParticipants] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Decisions_AcademicUnitId_MeetingYear_MeetingNo_DecisionNo] ON [Decisions] ([AcademicUnitId], [MeetingYear], [MeetingNo], [DecisionNo]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Decisions_CreatedById] ON [Decisions] ([CreatedById]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Roles_AcademicUnitId_Name] ON [Roles] ([AcademicUnitId], [Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Users_Email] ON [Users] ([Email]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Users_Username] ON [Users] ([Username]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_UserUnits_AcademicUnitId] ON [UserUnits] ([AcademicUnitId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_UserUnits_RoleId] ON [UserUnits] ([RoleId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_UserUnits_UserId_AcademicUnitId] ON [UserUnits] ([UserId], [AcademicUnitId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013124753_InitialCreate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261013124753_InitialCreate', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013191534_AttachmentFields'
)
BEGIN
    ALTER TABLE [Attachments] ADD [ContentType] nvarchar(max) NOT NULL DEFAULT N'';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013191534_AttachmentFields'
)
BEGIN
    ALTER TABLE [Attachments] ADD [Sha256] nvarchar(max) NOT NULL DEFAULT N'';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013191534_AttachmentFields'
)
BEGIN
    ALTER TABLE [Attachments] ADD [UploadedById] int NOT NULL DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013191534_AttachmentFields'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261013191534_AttachmentFields', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014134408_DecisionConcurrency'
)
BEGIN
    ALTER TABLE [Decisions] ADD [RowVersion] rowversion NOT NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014134408_DecisionConcurrency'
)
BEGIN
    ALTER TABLE [Decisions] ADD [UpdatedAt] datetime2 NOT NULL DEFAULT '0001-01-01T00:00:00.0000000';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014134408_DecisionConcurrency'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014134408_DecisionConcurrency', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014202009_AddUserSessionStamp'
)
BEGIN
    ALTER TABLE [Users] ADD [SessionStamp] uniqueidentifier NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014202009_AddUserSessionStamp'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014202009_AddUserSessionStamp', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203914_ProtectAccountDeletion'
)
BEGIN
    ALTER TABLE [UserUnits] DROP CONSTRAINT [FK_UserUnits_Users_UserId];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203914_ProtectAccountDeletion'
)
BEGIN
    CREATE INDEX [IX_Attachments_UploadedById] ON [Attachments] ([UploadedById]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203914_ProtectAccountDeletion'
)
BEGIN
    ALTER TABLE [Attachments] ADD CONSTRAINT [FK_Attachments_Users_UploadedById] FOREIGN KEY ([UploadedById]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203914_ProtectAccountDeletion'
)
BEGIN
    ALTER TABLE [UserUnits] ADD CONSTRAINT [FK_UserUnits_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261014203914_ProtectAccountDeletion'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261014203914_ProtectAccountDeletion', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015084811_DecisionLifecycle'
)
BEGIN
    ALTER TABLE [Decisions] ADD [CancellationReason] nvarchar(2000) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015084811_DecisionLifecycle'
)
BEGIN
    ALTER TABLE [Decisions] ADD [CancelledAt] datetime2 NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015084811_DecisionLifecycle'
)
BEGIN
    ALTER TABLE [Decisions] ADD [CancelledById] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015084811_DecisionLifecycle'
)
BEGIN
    ALTER TABLE [Decisions] ADD [CancelledByName] nvarchar(300) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015084811_DecisionLifecycle'
)
BEGIN
    ALTER TABLE [Decisions] ADD [ReconsiderationDecisionId] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015084811_DecisionLifecycle'
)
BEGIN
    ALTER TABLE [Decisions] ADD [SourceDecisionId] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015084811_DecisionLifecycle'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015084811_DecisionLifecycle', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015142204_RequirePasswordChange'
)
BEGIN
    ALTER TABLE [Users] ADD [MustChangePassword] bit NOT NULL DEFAULT CAST(0 AS bit);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015142204_RequirePasswordChange'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015142204_RequirePasswordChange', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015191529_UnitPresentation'
)
BEGIN
    ALTER TABLE [AcademicUnits] ADD [TitleLine1] nvarchar(200) NOT NULL DEFAULT N'';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015191529_UnitPresentation'
)
BEGIN
    ALTER TABLE [AcademicUnits] ADD [TitleLine2] nvarchar(200) NOT NULL DEFAULT N'';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015191529_UnitPresentation'
)
BEGIN
    ALTER TABLE [AcademicUnits] ADD [MembersLabel] nvarchar(200) NOT NULL DEFAULT N'';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015191529_UnitPresentation'
)
BEGIN
    ALTER TABLE [AcademicUnits] ADD [LogoPath] nvarchar(300) NOT NULL DEFAULT N'';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015191529_UnitPresentation'
)
BEGIN
    UPDATE [AcademicUnits]
    SET
        [TitleLine1] = N'BİLGİSAYAR MÜHENDİSLİĞİ',
        [TitleLine2] = N'BÖLÜM KURUL KARARI',
        [MembersLabel] = N'Bölüm Kurulu Üyeleri',
        [LogoPath] = N'/su_bilgisayar.png'
    WHERE [Code] = N'bilgisayar-bolum';

    UPDATE [AcademicUnits]
    SET
        [TitleLine1] = N'BİLGİSAYAR MÜHENDİSLİĞİ',
        [TitleLine2] = N'ANABİLİM DALI KURUL KARARI',
        [MembersLabel] = N'Anabilim Dalı Kurul Üyeleri',
        [LogoPath] = N'/su_fbe.png'
    WHERE [Code] = N'bilgisayar-abd';

    UPDATE [AcademicUnits]
    SET
        [TitleLine1] = N'BİLİŞİM TEKNOLOJİLERİ MÜHENDİSLİĞİ',
        [TitleLine2] = N'ANABİLİM DALI KURUL KARARI',
        [MembersLabel] = N'Anabilim Dalı Kurul Üyeleri',
        [LogoPath] = N'/su_fbe.png'
    WHERE [Code] = N'bilisim-abd';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015191529_UnitPresentation'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015191529_UnitPresentation', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193733_LogQueryIndexes'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_AcademicUnitId_CreatedAt] ON [AuditLogs] ([AcademicUnitId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193733_LogQueryIndexes'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_AcademicUnitId_Id] ON [AuditLogs] ([AcademicUnitId], [Id]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261015193733_LogQueryIndexes'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261015193733_LogQueryIndexes', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016111338_ContentBoundDemoSignatures'
)
BEGIN
    ALTER TABLE [Decisions] ADD [SignatureVersion] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016111338_ContentBoundDemoSignatures'
)
BEGIN
    ALTER TABLE [Decisions] ADD [SigningContentFrozenAt] datetime2 NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016111338_ContentBoundDemoSignatures'
)
BEGIN
    ALTER TABLE [Decisions] ADD [SigningContentHash] nvarchar(64) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016111338_ContentBoundDemoSignatures'
)
BEGIN
    ALTER TABLE [DecisionParticipants] ADD [SignatureChallengeExpiresAt] datetime2 NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016111338_ContentBoundDemoSignatures'
)
BEGIN
    ALTER TABLE [DecisionParticipants] ADD [SignatureChallengeId] uniqueidentifier NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016111338_ContentBoundDemoSignatures'
)
BEGIN
    ALTER TABLE [DecisionParticipants] ADD [SignatureData] nvarchar(64) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016111338_ContentBoundDemoSignatures'
)
BEGIN
    ALTER TABLE [DecisionParticipants] ADD [SignedContentHash] nvarchar(64) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016111338_ContentBoundDemoSignatures'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016111338_ContentBoundDemoSignatures', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016232816_BindSigningPdf'
)
BEGIN
    ALTER TABLE [Decisions] ADD [SigningPdfBytes] varbinary(max) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016232816_BindSigningPdf'
)
BEGIN
    ALTER TABLE [Decisions] ADD [SigningPdfFrozenAt] datetime2 NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016232816_BindSigningPdf'
)
BEGIN
    ALTER TABLE [Decisions] ADD [SigningPdfHash] nvarchar(64) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261016232816_BindSigningPdf'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261016232816_BindSigningPdf', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019132029_AddLoginCaptcha'
)
BEGIN
    CREATE TABLE [LoginCaptchas] (
        [Id] uniqueidentifier NOT NULL,
        [AnswerHash] varbinary(32) NOT NULL,
        [ExpiresAt] datetime2 NOT NULL,
        CONSTRAINT [PK_LoginCaptchas] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019132029_AddLoginCaptcha'
)
BEGIN
    CREATE INDEX [IX_LoginCaptchas_ExpiresAt] ON [LoginCaptchas] ([ExpiresAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019132029_AddLoginCaptcha'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261019132029_AddLoginCaptcha', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019134002_AddMeetingManagement'
)
BEGIN
    ALTER TABLE [Decisions] ADD [MeetingId] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019134002_AddMeetingManagement'
)
BEGIN
    CREATE TABLE [Meetings] (
        [Id] int NOT NULL IDENTITY,
        [AcademicUnitId] int NOT NULL,
        [MeetingDate] date NOT NULL,
        [MeetingYear] int NOT NULL,
        [MeetingNo] int NOT NULL,
        [LastDecisionNo] int NOT NULL,
        [CreatedById] int NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [AttendanceLockedAt] datetime2 NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_Meetings] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_Meeting_LastDecisionNo] CHECK ([LastDecisionNo] >= 0),
        CONSTRAINT [CK_Meeting_PositiveNumber] CHECK ([MeetingNo] > 0),
        CONSTRAINT [CK_Meeting_YearMatchesDate] CHECK ([MeetingYear] = DATEPART(year, [MeetingDate])),
        CONSTRAINT [FK_Meetings_AcademicUnits_AcademicUnitId] FOREIGN KEY ([AcademicUnitId]) REFERENCES [AcademicUnits] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Meetings_Users_CreatedById] FOREIGN KEY ([CreatedById]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019134002_AddMeetingManagement'
)
BEGIN
    CREATE TABLE [MeetingParticipants] (
        [Id] int NOT NULL IDENTITY,
        [MeetingId] int NOT NULL,
        [UserId] int NOT NULL,
        [DisplayName] nvarchar(max) NOT NULL,
        [Duty] nvarchar(max) NOT NULL,
        [SortOrder] int NOT NULL,
        [IsChair] bit NOT NULL,
        [Attendance] nvarchar(20) NOT NULL,
        CONSTRAINT [PK_MeetingParticipants] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_MeetingParticipant_Attendance] CHECK ([Attendance] IN ('Katilir', 'Izinli', 'Gorevli')),
        CONSTRAINT [FK_MeetingParticipants_Meetings_MeetingId] FOREIGN KEY ([MeetingId]) REFERENCES [Meetings] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MeetingParticipants_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019134002_AddMeetingManagement'
)
BEGIN
    CREATE INDEX [IX_Decisions_MeetingId] ON [Decisions] ([MeetingId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019134002_AddMeetingManagement'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MeetingParticipants_MeetingId_UserId] ON [MeetingParticipants] ([MeetingId], [UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019134002_AddMeetingManagement'
)
BEGIN
    CREATE INDEX [IX_MeetingParticipants_UserId] ON [MeetingParticipants] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019134002_AddMeetingManagement'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Meetings_AcademicUnitId_MeetingYear_MeetingNo] ON [Meetings] ([AcademicUnitId], [MeetingYear], [MeetingNo]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019134002_AddMeetingManagement'
)
BEGIN
    CREATE INDEX [IX_Meetings_CreatedById] ON [Meetings] ([CreatedById]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019134002_AddMeetingManagement'
)
BEGIN
    ALTER TABLE [Decisions] ADD CONSTRAINT [FK_Decisions_Meetings_MeetingId] FOREIGN KEY ([MeetingId]) REFERENCES [Meetings] ([Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261019134002_AddMeetingManagement'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261019134002_AddMeetingManagement', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261022111546_AddPhoneNumberToAppUser'
)
BEGIN
    ALTER TABLE [Users] ADD [PhoneNumber] nvarchar(max) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261022111546_AddPhoneNumberToAppUser'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261022111546_AddPhoneNumberToAppUser', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261023190337_AddAnnouncementsAndNotifications'
)
BEGIN
    ALTER TABLE [Meetings] ADD [IsPublished] bit NOT NULL DEFAULT CAST(0 AS bit);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261023190337_AddAnnouncementsAndNotifications'
)
BEGIN
    ALTER TABLE [Meetings] ADD [PublishedAt] datetime2 NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261023190337_AddAnnouncementsAndNotifications'
)
BEGIN
    CREATE TABLE [MeetingAgendas] (
        [Id] int NOT NULL IDENTITY,
        [MeetingId] int NOT NULL,
        [Title] nvarchar(250) NOT NULL,
        [Description] nvarchar(1000) NULL,
        [OrderNo] int NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_MeetingAgendas] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MeetingAgendas_Meetings_MeetingId] FOREIGN KEY ([MeetingId]) REFERENCES [Meetings] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261023190337_AddAnnouncementsAndNotifications'
)
BEGIN
    CREATE TABLE [Notifications] (
        [Id] int NOT NULL IDENTITY,
        [UserId] int NOT NULL,
        [UnitId] int NULL,
        [MeetingId] int NULL,
        [Title] nvarchar(200) NOT NULL,
        [Message] nvarchar(500) NULL,
        [IsRead] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_Notifications] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Notifications_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261023190337_AddAnnouncementsAndNotifications'
)
BEGIN
    CREATE INDEX [IX_MeetingAgendas_MeetingId] ON [MeetingAgendas] ([MeetingId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261023190337_AddAnnouncementsAndNotifications'
)
BEGIN
    CREATE INDEX [IX_Notifications_UserId] ON [Notifications] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261023190337_AddAnnouncementsAndNotifications'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261023190337_AddAnnouncementsAndNotifications', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261024143753_AddAnnouncementVersions'
)
BEGIN
    DROP INDEX [IX_Notifications_UserId] ON [Notifications];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261024143753_AddAnnouncementVersions'
)
BEGIN
    ALTER TABLE [Notifications] ADD [PublicationId] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261024143753_AddAnnouncementVersions'
)
BEGIN
    CREATE TABLE [MeetingAgendaPublications] (
        [Id] int NOT NULL IDENTITY,
        [MeetingId] int NOT NULL,
        [Version] int NOT NULL,
        [ContentHash] nvarchar(64) NOT NULL,
        [ItemsJson] nvarchar(max) NOT NULL,
        [PublishedById] int NOT NULL,
        [PublishedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_MeetingAgendaPublications] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_MeetingAgendaPublications_Meetings_MeetingId] FOREIGN KEY ([MeetingId]) REFERENCES [Meetings] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MeetingAgendaPublications_Users_PublishedById] FOREIGN KEY ([PublishedById]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261024143753_AddAnnouncementVersions'
)
BEGIN
    CREATE INDEX [IX_Notifications_PublicationId] ON [Notifications] ([PublicationId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261024143753_AddAnnouncementVersions'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_Notifications_UserId_PublicationId] ON [Notifications] ([UserId], [PublicationId]) WHERE [PublicationId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261024143753_AddAnnouncementVersions'
)
BEGIN
    CREATE INDEX [IX_Notifications_UserId_UnitId_IsRead] ON [Notifications] ([UserId], [UnitId], [IsRead]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261024143753_AddAnnouncementVersions'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MeetingAgendaPublications_MeetingId_Version] ON [MeetingAgendaPublications] ([MeetingId], [Version]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261024143753_AddAnnouncementVersions'
)
BEGIN
    CREATE INDEX [IX_MeetingAgendaPublications_PublishedById] ON [MeetingAgendaPublications] ([PublishedById]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261024143753_AddAnnouncementVersions'
)
BEGIN
    ALTER TABLE [Notifications] ADD CONSTRAINT [FK_Notifications_MeetingAgendaPublications_PublicationId] FOREIGN KEY ([PublicationId]) REFERENCES [MeetingAgendaPublications] ([Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261024143753_AddAnnouncementVersions'
)
BEGIN

                    INSERT INTO [MeetingAgendaPublications] ([MeetingId], [Version], [ContentHash], [ItemsJson], [PublishedById], [PublishedAt]) SELECT m.[Id], 1, '', ISNULL((SELECT a.[Title] AS [title], ISNULL(a.[Description], '') AS [description] FROM [MeetingAgendas] a WHERE a.[MeetingId] = m.[Id] ORDER BY a.[OrderNo] FOR JSON PATH), '[]'), m.[CreatedById], ISNULL(m.[PublishedAt], SYSUTCDATETIME()) FROM [Meetings] m WHERE m.[IsPublished] = 1;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261024143753_AddAnnouncementVersions'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261024143753_AddAnnouncementVersions', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029095109_AddCustomAnnouncements'
)
BEGIN
    ALTER TABLE [Notifications] ADD [AttendanceIntent] nvarchar(20) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029095109_AddCustomAnnouncements'
)
BEGIN
    ALTER TABLE [Notifications] ADD [CustomAnnouncementId] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029095109_AddCustomAnnouncements'
)
BEGIN
    CREATE TABLE [CustomAnnouncements] (
        [Id] int NOT NULL IDENTITY,
        [UnitId] int NOT NULL,
        [PublishedById] int NOT NULL,
        [Content] nvarchar(4000) NOT NULL,
        [MeetingDate] date NULL,
        [MeetingTime] nvarchar(5) NULL,
        [Location] nvarchar(200) NULL,
        [OnlineLink] nvarchar(500) NULL,
        [AgendaItemsJson] nvarchar(max) NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_CustomAnnouncements] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_CustomAnnouncements_AcademicUnits_UnitId] FOREIGN KEY ([UnitId]) REFERENCES [AcademicUnits] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CustomAnnouncements_Users_PublishedById] FOREIGN KEY ([PublishedById]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029095109_AddCustomAnnouncements'
)
BEGIN
    CREATE INDEX [IX_Notifications_CustomAnnouncementId] ON [Notifications] ([CustomAnnouncementId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029095109_AddCustomAnnouncements'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_Notifications_UserId_CustomAnnouncementId] ON [Notifications] ([UserId], [CustomAnnouncementId]) WHERE [CustomAnnouncementId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029095109_AddCustomAnnouncements'
)
BEGIN
    CREATE INDEX [IX_CustomAnnouncements_PublishedById] ON [CustomAnnouncements] ([PublishedById]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029095109_AddCustomAnnouncements'
)
BEGIN
    CREATE INDEX [IX_CustomAnnouncements_UnitId_CreatedAt] ON [CustomAnnouncements] ([UnitId], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029095109_AddCustomAnnouncements'
)
BEGIN
    ALTER TABLE [Notifications] ADD CONSTRAINT [FK_Notifications_CustomAnnouncements_CustomAnnouncementId] FOREIGN KEY ([CustomAnnouncementId]) REFERENCES [CustomAnnouncements] ([Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029095109_AddCustomAnnouncements'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261029095109_AddCustomAnnouncements', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029122415_AddDecisionNotifications'
)
BEGIN
    ALTER TABLE [Notifications] ADD [DecisionId] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029122415_AddDecisionNotifications'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261029122415_AddDecisionNotifications', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029125317_AddDecisionSubmittedAt'
)
BEGIN
    ALTER TABLE [Decisions] ADD [SubmittedAt] datetime2 NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029125317_AddDecisionSubmittedAt'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261029125317_AddDecisionSubmittedAt', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029134135_AddSignatureImages'
)
BEGIN
    ALTER TABLE [Users] ADD [SavedSignaturePng] varbinary(max) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029134135_AddSignatureImages'
)
BEGIN
    ALTER TABLE [Users] ADD [SavedSignatureUpdatedAt] datetime2 NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029134135_AddSignatureImages'
)
BEGIN
    ALTER TABLE [DecisionParticipants] ADD [SignatureImagePng] varbinary(max) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029134135_AddSignatureImages'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261029134135_AddSignatureImages', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029144753_AddDecisionVerificationAndSeal'
)
BEGIN
    ALTER TABLE [Decisions] ADD [FinalPdfBytes] varbinary(max) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029144753_AddDecisionVerificationAndSeal'
)
BEGIN
    ALTER TABLE [Decisions] ADD [FinalPdfHash] nvarchar(64) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029144753_AddDecisionVerificationAndSeal'
)
BEGIN
    ALTER TABLE [Decisions] ADD [FinalPdfSealedAt] datetime2 NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029144753_AddDecisionVerificationAndSeal'
)
BEGIN
    ALTER TABLE [Decisions] ADD [VerificationCode] nvarchar(20) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029144753_AddDecisionVerificationAndSeal'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_Decisions_VerificationCode] ON [Decisions] ([VerificationCode]) WHERE [VerificationCode] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029144753_AddDecisionVerificationAndSeal'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261029144753_AddDecisionVerificationAndSeal', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029165220_RemoveViewerRole'
)
BEGIN
    UPDATE uu
    SET uu.RoleId = member.Id,
        uu.UnitRole = member.Kind,
        uu.Duty = CASE WHEN uu.Duty = viewer.Name THEN member.Name ELSE uu.Duty END
    FROM UserUnits uu
    INNER JOIN Roles viewer ON viewer.Id = uu.RoleId
    INNER JOIN Roles member
        ON member.AcademicUnitId = viewer.AcademicUnitId
       AND member.IsSystem = 1
       AND member.Kind = 'Uye'
    WHERE viewer.IsSystem = 1 AND viewer.Kind = 'Goruntuleyici';

    DELETE FROM Roles WHERE IsSystem = 1 AND Kind = 'Goruntuleyici'
        AND NOT EXISTS (SELECT 1 FROM UserUnits uu WHERE uu.RoleId = Roles.Id);

    UPDATE Roles SET Kind = 'OyKullanmayan' WHERE Kind = 'Goruntuleyici';
    UPDATE UserUnits SET UnitRole = 'OyKullanmayan' WHERE UnitRole = 'Goruntuleyici';

    UPDATE Users
    SET Email = LEFT(Email, LEN(Email) - LEN('@kurul.test')) + '@selcuk.edu.tr'
    WHERE Email LIKE '%@kurul.test'
      AND NOT EXISTS (
          SELECT 1 FROM Users other
          WHERE other.Email = LEFT(Users.Email, LEN(Users.Email) - LEN('@kurul.test')) + '@selcuk.edu.tr');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029165220_RemoveViewerRole'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261029165220_RemoveViewerRole', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029165822_AddDecisionTemplates'
)
BEGIN
    CREATE TABLE [DecisionTemplates] (
        [Id] int NOT NULL IDENTITY,
        [AcademicUnitId] int NOT NULL,
        [Name] nvarchar(200) NOT NULL,
        [Reference] nvarchar(2000) NOT NULL,
        [Agenda] nvarchar(2000) NOT NULL,
        [Content] nvarchar(max) NOT NULL,
        [AttachmentsNote] nvarchar(2000) NOT NULL,
        [TableColumnsJson] nvarchar(max) NOT NULL,
        [IsDraft] bit NOT NULL,
        [CreatedById] int NOT NULL,
        [CreatedByName] nvarchar(300) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_DecisionTemplates] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_DecisionTemplates_AcademicUnits_AcademicUnitId] FOREIGN KEY ([AcademicUnitId]) REFERENCES [AcademicUnits] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029165822_AddDecisionTemplates'
)
BEGIN
    CREATE UNIQUE INDEX [IX_DecisionTemplates_AcademicUnitId_Name] ON [DecisionTemplates] ([AcademicUnitId], [Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029165822_AddDecisionTemplates'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261029165822_AddDecisionTemplates', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029214613_AddParticipantPreSignature'
)
BEGIN
    ALTER TABLE [DecisionParticipants] ADD [PreSignatureImagePng] varbinary(max) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029214613_AddParticipantPreSignature'
)
BEGIN
    ALTER TABLE [DecisionParticipants] ADD [PreSignedAt] datetime2 NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261029214613_AddParticipantPreSignature'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261029214613_AddParticipantPreSignature', N'10.0.12');
END;

COMMIT;
GO

