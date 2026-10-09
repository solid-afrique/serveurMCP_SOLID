-- Compte en LECTURE SEULE pour connecter une base SQL Server aux assistants (Claude, ChatGPT, Copilot).
-- Recommandé pour toute connexion « Lecture seule » : la base elle-même refuse alors toute écriture.
-- Remplacez CHANGEZ-MOI et NomDeLaBase, puis répétez le bloc USE … pour chaque base à exposer.

CREATE LOGIN mcp_lecteur WITH PASSWORD = N'CHANGEZ-MOI', CHECK_POLICY = ON;
GO

USE NomDeLaBase;
GO
CREATE USER mcp_lecteur FOR LOGIN mcp_lecteur;
ALTER ROLE db_datareader ADD MEMBER mcp_lecteur;
-- Permet de lire la structure (colonnes, clés) pour l'outil describe_table.
GRANT VIEW DEFINITION TO mcp_lecteur;
GO
