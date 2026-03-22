function AttendanceTable({ rows }) {
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
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row, index) => (
            <tr key={`${row.roll_number}-${index}`}>
              <td className="px-4 py-3 text-sm text-slate-800">{row.student_name || 'N/A'}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{row.roll_number || 'N/A'}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{new Date(row.marked_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AttendanceTable;
