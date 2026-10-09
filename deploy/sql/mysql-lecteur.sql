-- Compte en LECTURE SEULE pour connecter une base MySQL / MariaDB aux assistants (Claude, ChatGPT, Copilot).
-- Recommandé pour toute connexion « Lecture seule » : la base elle-même refuse alors toute écriture.
-- Remplacez CHANGEZ-MOI et nom_de_la_base ; répétez le GRANT pour chaque base à exposer.
-- Si la base est sur un AUTRE serveur que le serveur MCP, remplacez 127.0.0.1 par l'IP du serveur MCP.

CREATE USER IF NOT EXISTS 'mcp_lecteur'@'127.0.0.1' IDENTIFIED BY 'CHANGEZ-MOI';
CREATE USER IF NOT EXISTS 'mcp_lecteur'@'localhost' IDENTIFIED BY 'CHANGEZ-MOI';

GRANT SELECT, SHOW VIEW ON nom_de_la_base.* TO 'mcp_lecteur'@'127.0.0.1';
GRANT SELECT, SHOW VIEW ON nom_de_la_base.* TO 'mcp_lecteur'@'localhost';
