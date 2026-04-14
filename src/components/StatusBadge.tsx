import type { ProjectStatus } from '../lib/models'
import { projectStatusLabelMap } from '../lib/project-status'

export const StatusBadge = ({ status }: { status: ProjectStatus }) => (
  <span className={`status-badge status-${status}`}>{projectStatusLabelMap[status]}</span>
)
