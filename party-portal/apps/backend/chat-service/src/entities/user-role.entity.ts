// src/entities/user-role.entity.ts
import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { Role } from './role.entity';

@Entity('user_roles')
export class UserRole {
  @PrimaryColumn()
  userId: number;

  @ManyToOne(() => Role, (role) => role.userRoles, { eager: true })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @PrimaryColumn({ name: 'role_id' })
  roleId: number;

  @Column({ name: 'expires_at', nullable: true })
  expiresAt: Date | null;
}
