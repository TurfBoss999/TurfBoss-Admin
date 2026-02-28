interface StatusBadgeProps {
  status: 'Pending' | 'In Progress' | 'Completed';
}

const statusStyles = {
  Pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'In Progress': 'bg-blue-100 text-blue-800 border-blue-200',
  Completed: 'bg-green-100 text-green-800 border-green-200',
};

const statusDots = {
  Pending: 'bg-yellow-500',
  'In Progress': 'bg-blue-500',
  Completed: 'bg-green-500',
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center space-x-1.5 rounded-full border px-3 py-1 text-xs font-medium ${statusStyles[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${statusDots[status]}`}></span>
      <span>{status}</span>
    </span>
  );
}
