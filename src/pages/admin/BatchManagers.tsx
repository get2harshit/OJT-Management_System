import { useState, useEffect } from 'react';
import DataTable from '../../components/DataTable';
import SpinnerSquare from '../../components/SpinnerSquare';
import type { ApiBatchManager } from '../../lib/types';
import { apiListBatchManagers } from '../../lib/api';

export default function AdminBatchManagers() {
  const [batchManagers, setBatchManagers] = useState<ApiBatchManager[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiListBatchManagers()
      .then(setBatchManagers)
      .catch(() => setBatchManagers([]))
      .finally(() => setLoading(false));
  }, []);

  const data = batchManagers.map(bm => ({
    id: bm.id,
    name: bm.fullName ?? '-',
    email: bm.email ?? '-',
    phoneNumber: bm.phoneNumber ?? '-',
    activeStatus: bm.activeStatus,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Batch Managers</h1>
        <p className="text-gray-400 text-sm mt-1">All registered Batch Managers</p>
      </div>

      {loading ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <DataTable
          columns={[
            { key: 'name', header: 'Name' },
            { key: 'email', header: 'Email' },
            { key: 'phoneNumber', header: 'Phone Number' },
            {
              key: 'activeStatus',
              header: 'Status',
              render: (row: any) => (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                  row.activeStatus === false ? 'bg-red-500/10 text-red-400' : 'bg-green-400/10 text-green-400'
                }`}>
                  {row.activeStatus === false ? 'Inactive' : 'Active'}
                </span>
              ),
            },
          ]}
          data={data}
          searchPlaceholder="Search batch managers..."
        />
      )}
    </div>
  );
}
