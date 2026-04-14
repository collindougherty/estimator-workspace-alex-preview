import { Link } from 'react-router-dom'

import { formatCurrency, formatDate } from '../lib/formatters'
import type { ProjectSummary } from '../lib/models'
import { StatusBadge } from './StatusBadge'

export const ProjectCard = ({ project }: { project: ProjectSummary }) => (
  <Link className="project-card" to={`/projects/${project.project_id}`}>
    <div className="project-card-header">
      <div>
        <p className="project-card-eyebrow">{project.customer_name ?? 'Unassigned customer'}</p>
        <h3>{project.name ?? 'Untitled project'}</h3>
      </div>
      {project.status ? <StatusBadge status={project.status} /> : null}
    </div>
    <p className="project-card-location">{project.location ?? 'Location pending'}</p>
    <div className="project-card-meta">
      <span>Due {formatDate(project.bid_due_date)}</span>
      <strong>{formatCurrency(project.estimated_total_cost)}</strong>
    </div>
  </Link>
)
