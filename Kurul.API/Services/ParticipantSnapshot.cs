using Kurul.API.Data;
using Kurul.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Services;

// Yeni bir karar oluşturulurken, o andaki kurul üyelerinin listesini (katılımcıları) çıkarır.
public static class ParticipantSnapshot
{
    // attendeeIds verilirse yalnızca bu üyeler "Katılır" olur; diğerleri "İzinli" kaydedilir.
    // Böylece toplantı yeter sayısı tüm kurul üzerinden hesaplanmaya devam eder.
    public static async Task<List<DecisionParticipant>> BuildAsync(
        AppDbContext db,
        int academicUnitId,
        IReadOnlyCollection<int>? attendeeIds = null)
    {
        var members = await db.UserUnits
            .Include(x => x.User)
            .Where(x => x.AcademicUnitId == academicUnitId && x.IsBoardMember && x.IsActive && x.User.IsActive)
            .OrderBy(x => x.SortOrder)
            .ToListAsync();

        return members.Select(m => new DecisionParticipant
        {
            UserId = m.UserId,
            SortOrder = m.SortOrder,
            IsChair = m.UnitRole == UnitRoles.Baskan,
            DisplayName = string.IsNullOrWhiteSpace(m.User.Title) ? m.User.FullName : $"{m.User.Title} {m.User.FullName}",
            Duty = m.Duty,
            Attendance = attendeeIds == null || attendeeIds.Contains(m.UserId)
                ? AttendanceStatus.Katilir
                : AttendanceStatus.Izinli
        }).ToList();
    }
}