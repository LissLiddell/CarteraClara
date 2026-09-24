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
    WHERE [MigrationId] = N'20260923195425_InitialCreate'
)
BEGIN
    CREATE TABLE [Accounts] (
        [Id] nvarchar(16) NOT NULL,
        [Client] nvarchar(120) NOT NULL,
        [Concept] nvarchar(200) NOT NULL,
        [OpeningBalanceCents] bigint NOT NULL,
        [BalanceCents] bigint NOT NULL,
        [AssignedTo] nvarchar(20) NULL,
        [Revision] int NOT NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_Accounts] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_Accounts_Balance] CHECK ([BalanceCents] >= 0 AND [BalanceCents] <= [OpeningBalanceCents])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260923195425_InitialCreate'
)
BEGIN
    CREATE TABLE [Contacts] (
        [Id] nvarchar(24) NOT NULL,
        [AccountId] nvarchar(16) NOT NULL,
        [Sequence] int NOT NULL,
        [At] datetimeoffset NOT NULL,
        [ActorId] nvarchar(20) NOT NULL,
        [Outcome] nvarchar(20) NOT NULL,
        [Note] nvarchar(240) NOT NULL,
        CONSTRAINT [PK_Contacts] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Contacts_Accounts_AccountId] FOREIGN KEY ([AccountId]) REFERENCES [Accounts] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260923195425_InitialCreate'
)
BEGIN
    CREATE TABLE [Events] (
        [Id] nvarchar(24) NOT NULL,
        [AccountId] nvarchar(16) NOT NULL,
        [Sequence] int NOT NULL,
        [Type] nvarchar(20) NOT NULL,
        [Kind] nvarchar(30) NULL,
        [ActorId] nvarchar(20) NOT NULL,
        [ActorName] nvarchar(100) NOT NULL,
        [At] datetimeoffset NOT NULL,
        [Detail] nvarchar(700) NOT NULL,
        CONSTRAINT [PK_Events] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Events_Accounts_AccountId] FOREIGN KEY ([AccountId]) REFERENCES [Accounts] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260923195425_InitialCreate'
)
BEGIN
    CREATE TABLE [Promises] (
        [Id] nvarchar(24) NOT NULL,
        [AccountId] nvarchar(16) NOT NULL,
        [Sequence] int NOT NULL,
        [AmountCents] bigint NOT NULL,
        [CoveredCents] bigint NOT NULL,
        [DueDate] date NOT NULL,
        [Status] nvarchar(20) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [ActorId] nvarchar(20) NOT NULL,
        CONSTRAINT [PK_Promises] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_Promises_Covered] CHECK ([AmountCents] > 0 AND [CoveredCents] >= 0 AND [CoveredCents] <= [AmountCents]),
        CONSTRAINT [FK_Promises_Accounts_AccountId] FOREIGN KEY ([AccountId]) REFERENCES [Accounts] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260923195425_InitialCreate'
)
BEGIN
    CREATE TABLE [Payments] (
        [Id] nvarchar(24) NOT NULL,
        [AccountId] nvarchar(16) NOT NULL,
        [Sequence] int NOT NULL,
        [At] datetimeoffset NOT NULL,
        [ActorId] nvarchar(20) NOT NULL,
        [Reference] nvarchar(40) NOT NULL,
        [ReferenceKey] nvarchar(40) NOT NULL,
        [AmountCents] bigint NOT NULL,
        [AppliedToPromiseCents] bigint NOT NULL,
        [PromiseId] nvarchar(24) NULL,
        CONSTRAINT [PK_Payments] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_Payments_Amounts] CHECK ([AmountCents] > 0 AND [AppliedToPromiseCents] >= 0 AND [AppliedToPromiseCents] <= [AmountCents]),
        CONSTRAINT [FK_Payments_Accounts_AccountId] FOREIGN KEY ([AccountId]) REFERENCES [Accounts] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_Payments_Promises_PromiseId] FOREIGN KEY ([PromiseId]) REFERENCES [Promises] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260923195425_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Accounts_AssignedTo] ON [Accounts] ([AssignedTo]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260923195425_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Contacts_AccountId_Sequence] ON [Contacts] ([AccountId], [Sequence]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260923195425_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Events_AccountId_Sequence] ON [Events] ([AccountId], [Sequence]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260923195425_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Payments_AccountId_Sequence] ON [Payments] ([AccountId], [Sequence]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260923195425_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Payments_PromiseId] ON [Payments] ([PromiseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260923195425_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Payments_ReferenceKey] ON [Payments] ([ReferenceKey]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260923195425_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Promises_AccountId_Sequence] ON [Promises] ([AccountId], [Sequence]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260923195425_InitialCreate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260923195425_InitialCreate', N'10.0.12');
END;

COMMIT;
GO

