export interface Ability {
  id: number;
  module: string;
  resource: string;
  resourceConstraint?: string | null;
  action: string;
  description?: string | null;
}
