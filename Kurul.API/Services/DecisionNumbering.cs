using Kurul.API.Data;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Services;

// Yeni Karar sihirbazı toplantı seçtirmez; toplantı numarası tarihten önerilir.
// - Aynı tarihte daha önce (toplantı kaydı olmadan) karar açıldıysa o toplantı numarası kullanılır.
// - Yoksa o yılın en büyük toplantı numarasının bir fazlası önerilir (karar ve toplantı kayıtlarının ikisi de dikkate alınır).
// - Karar numarası, o toplantıdaki en büyük karar numarasının bir fazlasıdır.
// Kesin numara karar kaydedilirken yeniden hesaplanır; burada yalnızca öneri/önizleme üretilir.
public static class DecisionNumbering
{
    public static async Task<(int MeetingNo, int DecisionNo)> SuggestAsync(
        AppDbContext db,
        int unitId,
        DateOnly meetingDate,
        int? meetingNo,
        CancellationToken ct = default)
    {
        var year = meetingDate.Year;

        var no = meetingNo ?? await db.Decisions
            .Where(d =>
                d.AcademicUnitId == unitId &&
                d.MeetingId == null &&
                d.MeetingDate == meetingDate)
            .Select(d => (int?)d.MeetingNo)
            .MaxAsync(ct);

        if (no == null)
        {
            var maxDecisionMeeting = await db.Decisions
                .Where(d => d.AcademicUnitId == unitId && d.MeetingYear == year)
                .Select(d => (int?)d.MeetingNo)
                .MaxAsync(ct) ?? 0;

            var maxMeeting = await db.Meetings
                .Where(m => m.AcademicUnitId == unitId && m.MeetingYear == year)
                .Select(m => (int?)m.MeetingNo)
                .MaxAsync(ct) ?? 0;

            no = Math.Max(maxDecisionMeeting, maxMeeting) + 1;
        }

        var maxDecisionNo = await db.Decisions
            .Where(d =>
                d.AcademicUnitId == unitId &&
                d.MeetingYear == year &&
                d.MeetingNo == no)
            .Select(d => (int?)d.DecisionNo)
            .MaxAsync(ct) ?? 0;

        return (no.Value, maxDecisionNo + 1);
    }
}
