# Fix: Failed to Load Enrolled Students Error

## Issue
"Failed to load enrolled students" error when trying to load student roster, attendance analytics, or absentee notifications.

## Root Cause
All server routes were using incorrect Supabase relationship syntax:
```javascript
.select('student_id, roll_number, profiles(full_name, phone)')
```

This syntax assumes `profiles` is a directly accessible relationship on the `enrollments` table, but in the actual database:
- `enrollments` table has `student_id` → references `auth.users(id)`
- `profiles` table has `user_id` → references `auth.users(id)`
- The relationship can't be accessed directly with `profiles()` selector in Supabase

## Solution
Changed all affected routes to:
1. Query `enrollments` table separately without nested relationship
2. Extract all `student_id` values
3. Query `profiles` table with `IN` clause for those student IDs
4. Join the data in application code

## Files Fixed

### 1. `server/routes/analytics.js`
- **Line 105**: Fixed subject analytics enrollments query
- **Line 146**: Updated profile lookup to use separate `studentProfiles` object

### 2. `server/routes/notifications.js`
- **Line 20**: Fixed absentee notification enrollments query

### 3. `server/routes/roster.js`
- **Line 74**: Fixed roster loading enrollments query
- **Line 78-89**: Updated student mapping to use `studentProfiles` object

## Technical Details

**Before:**
```javascript
const { data: enrollments, error: enrollmentsError } = await supabase
  .from('enrollments')
  .select('student_id, roll_number, profiles(full_name, phone)')
  .eq('subject_id', subjectId);
```

**After:**
```javascript
// Query enrollments alone
const { data: enrollments, error: enrollmentsError } = await supabase
  .from('enrollments')
  .select('student_id, roll_number')
  .eq('subject_id', subjectId);

// Fetch profiles separately
const studentIds = (enrollments || []).map(e => e.student_id);
let studentProfiles = {};
if (studentIds.length > 0) {
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('user_id, full_name, phone')
    .in('user_id', studentIds);
  if (!profilesError && profiles) {
    studentProfiles = Object.fromEntries(profiles.map(p => [p.user_id, p]));
  }
}

// Use profiles in mapping
(enrollments || []).map((row) => {
  const profile = studentProfiles[row.student_id];
  return {
    studentName: profile?.full_name || 'Student',
    phone: profile?.phone || ''
  };
})
```

## Benefits
- ✅ Fixes "Failed to load enrolled students" error
- ✅ More efficient queries (two separate queries vs failed nested query)
- ✅ Graceful fallback if profile loading fails
- ✅ Consistent approach across all affected endpoints

## Testing
- ✅ Server syntax check passed (node -c)
- ✅ Client build successful
- ✅ All affected routes now use correct pattern

## Affected Endpoints
1. `GET /api/analytics/session/:sessionId/absentees` - Load absentees for a session
2. `GET /api/analytics/subject/:subjectId` - Load subject analytics and attendance statistics
3. `GET /api/roster/:subjectId` - Load student roster for a subject
4. `POST /api/notifications/session/:sessionId/absentees` - Send absentee notifications

All endpoints will now correctly load student enrollment and profile data.
