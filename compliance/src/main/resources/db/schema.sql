-- ============================================================
-- Compliance System - SQL Server Schema
-- Server   : localhost
-- Database : one-for-all
-- ============================================================

-- Create database (run as sa or sysadmin if it doesn't exist yet)
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'one-for-all')
BEGIN
    CREATE DATABASE [one-for-all];
END
GO

USE [one-for-all];
GO

-- ============================================================
-- Table: users
-- Tracks registered users and their declared submission type
-- ============================================================
IF OBJECT_ID('dbo.users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.users (
        id               BIGINT IDENTITY(1,1)  NOT NULL,
        account          NVARCHAR(255)         NOT NULL,
        submission_type  NVARCHAR(255)         NOT NULL,
        created_at       DATETIME2             NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_users PRIMARY KEY (id),
        CONSTRAINT UQ_users_account UNIQUE (account)
    );
END
GO

-- ============================================================
-- Table: submissions
-- Stores every form submission with image metadata and AI result
-- ============================================================
IF OBJECT_ID('dbo.submissions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.submissions (
        id                  BIGINT IDENTITY(1,1)  NOT NULL,
        account             NVARCHAR(255)         NOT NULL,
        submission_type     NVARCHAR(255)         NOT NULL,
        image_path          NVARCHAR(500)         NULL,
        image_url           NVARCHAR(500)         NULL,
        image_original_name NVARCHAR(255)         NULL,
        image_saved_name    NVARCHAR(255)         NULL,
        status              NVARCHAR(20)          NOT NULL DEFAULT 'PENDING',
        validation_result   NVARCHAR(MAX)         NULL,
        validation_checklist NVARCHAR(MAX)        NULL,
        has_clock           BIT                   NULL,
        has_windows_update  BIT                   NULL,
        has_device_name     BIT                   NULL,
        has_device_serial   BIT                   NULL,
        has_dashboard       BIT                   NULL,
        has_seed_dashboard  BIT                   NULL,
        has_trellix         BIT                   NULL,
        has_timestamp       BIT                   NULL,
        has_mac_info        BIT                   NULL,
        confidence_score    INT                   NULL,
        submission_date     DATETIME2             NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_submissions PRIMARY KEY (id),
        CONSTRAINT CK_submissions_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
    );

    CREATE INDEX IX_submissions_account ON dbo.submissions (account);
    CREATE INDEX IX_submissions_status  ON dbo.submissions (status);
END
GO

-- ============================================================
-- Table: admins
-- Admin accounts for the management portal
-- ============================================================
IF OBJECT_ID('dbo.admins', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.admins (
        id        BIGINT IDENTITY(1,1)  NOT NULL,
        username  NVARCHAR(255)         NOT NULL,
        password  NVARCHAR(255)         NOT NULL,   -- BCrypt hashed
        email     NVARCHAR(255)         NULL,

        CONSTRAINT PK_admins PRIMARY KEY (id),
        CONSTRAINT UQ_admins_username UNIQUE (username)
    );
END
GO

-- ============================================================
-- Seed: default admin account
-- Username : admin
-- Password : Admin@123   (BCrypt strength 10)
-- Change this password immediately after first login!
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM dbo.admins WHERE username = 'admin')
BEGIN
    INSERT INTO dbo.admins (username, password, email)
    VALUES (
        'admin',
        '$2a$10$cxA4mKDNAMBZPhhnlen.zOvc9yqA9GxYK2b4hxLsNrF61SPT5nYDy',
        'admin@compliance.local'
    );
END
GO

-- ============================================================
-- Verify tables created
-- ============================================================
SELECT TABLE_NAME, TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME IN ('users', 'submissions', 'admins')
ORDER BY TABLE_NAME;
GO
