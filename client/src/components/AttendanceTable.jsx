function AttendanceTable({ rows, onRemove, removingId }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 text-center">
        No attendance records yet for this session.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Student Name</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Roll Number</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Time of Scan</th>
            {onRemove && <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Action</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row, index) => (
            <tr key={row.id || `${row.roll_number}-${index}`}>
              <td className="px-4 py-3 text-sm text-slate-800">{row.student_name || 'N/A'}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{row.roll_number || 'N/A'}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{new Date(row.marked_at).toLocaleString()}</td>
              {onRemove && (
                <td className="px-4 py-3 text-sm text-slate-700">
                  <button
                    onClick={() => onRemove(row)}
                    disabled={!row.id || removingId === row.id}
                    className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {removingId === row.id ? 'Removing...' : 'Remove'}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AttendanceTable;
