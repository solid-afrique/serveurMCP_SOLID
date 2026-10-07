-- Base de stockage du serveur MCP (comptes, connexions chiffrées, autorisations, jetons).
-- À exécuter dans SQL Server Management Studio (ou sqlcmd) avec un compte administrateur.
-- Prérequis : authentification « SQL Server et Windows » (mode mixte) activée sur l'instance.
-- Remplacez CHANGEZ-MOI par un mot de passe long, puis reportez-le dans STORE_URL.

CREATE DATABASE mcp_server;
GO

CREATE LOGIN mcp_server WITH PASSWORD = N'CHANGEZ-MOI', CHECK_POLICY = ON, DEFAULT_DATABASE = mcp_server;
GO

USE mcp_server;
GO

-- Droits limités à cette base : lire, écrire et créer ses deux tables (mcp_kv, mcp_set).
CREATE USER mcp_server FOR LOGIN mcp_server;
ALTER ROLE db_datareader ADD MEMBER mcp_server;
ALTER ROLE db_datawriter ADD MEMBER mcp_server;
GRANT CREATE TABLE TO mcp_server;
GRANT ALTER ON SCHEMA::dbo TO mcp_server;
GO
