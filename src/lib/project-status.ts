import type { ProjectStatus } from './models'

export const projectStatusLabelMap: Record<ProjectStatus, string> = {
  draft: 'Draft',
  bidding: 'Bidding',
  submitted: 'Submitted',
  won: 'Won',
  active: 'Active',
  completed: 'Completed',
  lost: 'Not awarded',
  archived: 'Archived',
}
