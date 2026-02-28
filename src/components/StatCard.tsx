interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'green' | 'blue' | 'yellow' | 'purple';
}

const colorClasses = {
  green: 'bg-green-100 text-green-600',
  blue: 'bg-blue-100 text-blue-600',
  yellow: 'bg-yellow-100 text-yellow-600',
  purple: 'bg-purple-100 text-purple-600',
};

const bgGradients = {
  green: 'from-green-500 to-green-600',
  blue: 'from-blue-500 to-blue-600',
  yellow: 'from-yellow-500 to-yellow-600',
  purple: 'from-purple-500 to-purple-600',
};

export default function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
      <div className={`mt-4 h-1 w-full rounded-full bg-gradient-to-r ${bgGradients[color]} opacity-20`}></div>
    </div>
  );
}
