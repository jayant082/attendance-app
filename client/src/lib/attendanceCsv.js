export const createAttendanceCsv = (rows) => {
  const escapeCsv = (value) => {
    const content = String(value ?? '');
    const safeContent = /^[=+\-@\t\r]/.test(content) ? `'${content}` : content;
    return `"${safeContent.replaceAll('"', '""')}"`;
  };
  const header = ['Student Name', 'Roll Number', 'Time of Scan'];
  const csvRows = rows.map((row) => [
    row.student_name || 'N/A',
    row.roll_number || 'N/A',
    new Date(row.marked_at).toLocaleString()
  ]);
  return [header, ...csvRows].map((line) => line.map(escapeCsv).join(',')).join('\r\n');
};

export const downloadAttendanceCsv = (sessionId, rows) => {
  const blob = new Blob([createAttendanceCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `attendance-${sessionId}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
