// StatusBadge component
const STATUS_CONFIG = {
  DRAFT: { label: 'Rascunho', className: 'badge-draft' },
  PENDING_APPROVAL: { label: 'Aguardando Aprovação', className: 'badge-pending' },
  APPROVED: { label: 'Aprovado', className: 'badge-approved' },
  REJECTED: { label: 'Rejeitado', className: 'badge-rejected' },
  REVISION_REQUESTED: { label: 'Revisão Solicitada', className: 'badge-revision' },
  PENDING: { label: 'Pendente', className: 'badge-pending' },
};

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || { label: status, className: 'badge-draft' };
  return <span className={config.className}>{config.label}</span>;
}
