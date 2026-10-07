export interface Actor {
  id: string;
  role: "admin" | "user";
  email: string;
  name: string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  status: "invited" | "active" | "disabled";
  role?: "user" | "admin";
  createdAt: number;
  lastLoginAt?: number;
  ownedConnections: number;
  assignedConnections: number;
}
