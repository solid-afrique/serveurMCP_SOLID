-- Base de stockage du serveur MCP (comptes, connexions chiffrées, autorisations, jetons).
-- À exécuter avec un compte administrateur MySQL / MariaDB, par exemple :
--   mysql -u root -p < mysql-stockage.sql
-- Remplacez CHANGEZ-MOI par un mot de passe long, puis reportez-le dans STORE_URL.

CREATE DATABASE IF NOT EXISTS mcp_server CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Le serveur MCP se connecte en local (STORE_URL avec 127.0.0.1).
CREATE USER IF NOT EXISTS 'mcp_server'@'127.0.0.1' IDENTIFIED BY 'CHANGEZ-MOI';
CREATE USER IF NOT EXISTS 'mcp_server'@'localhost' IDENTIFIED BY 'CHANGEZ-MOI';

-- Droits limités à cette base : lire, écrire et créer ses deux tables (mcp_kv, mcp_set).
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX ON mcp_server.* TO 'mcp_server'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX ON mcp_server.* TO 'mcp_server'@'localhost';
