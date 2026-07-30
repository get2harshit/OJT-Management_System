export type UserRole = 'ADMIN' | 'MENTOR' | 'STUDENT';

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
  track?: string; // Associated track slug — tracks are admin-managed, see useTracks/apiListTracks
  tracks?: string[]; // Associated tracks
  capacity?: number; // Mentor allocation capacity (max students)
  is_available?: boolean; // Mentor availability status
}

export type ApiUserRole = 'student' | 'mentor' | 'external_mentor' | 'batch_manager' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  role: ApiUserRole;
  fullName?: string;
}

export interface AuthResult {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthUser;
}
