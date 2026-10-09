-- Base MySQL de l'application (utilisateurs, administrateurs, connexions chiffrées, jetons OAuth).
-- À exécuter avec un compte administrateur MySQL, par exemple :
--   mysql -u root -p < mysql-application.sql
-- Remplacez CHANGEZ-MOI par un mot de passe long, puis reportez-le dans DB_PASSWORD (.env).

CREATE DATABASE IF NOT EXISTS mcp_server CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- L'application se connecte en local (DB_HOST=127.0.0.1).
CREATE USER IF NOT EXISTS 'mcp_server'@'127.0.0.1' IDENTIFIED BY 'CHANGEZ-MOI';
CREATE USER IF NOT EXISTS 'mcp_server'@'localhost' IDENTIFIED BY 'CHANGEZ-MOI';

-- Droits limités à cette base ; « php artisan migrate » crée et fait évoluer les tables.
GRANT ALL PRIVILEGES ON mcp_server.* TO 'mcp_server'@'127.0.0.1';
GRANT ALL PRIVILEGES ON mcp_server.* TO 'mcp_server'@'localhost';
