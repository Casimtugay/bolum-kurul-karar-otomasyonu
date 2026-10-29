namespace Kurul.API.Models;

public class MeetingParticipant
{
    public int Id { get; set; }

    public int MeetingId { get; set; }
    public Meeting Meeting { get; set; } = null!;

    public int UserId { get; set; }
    public AppUser User { get; set; } = null!;

    public string DisplayName { get; set; } = string.Empty;
    public string Duty { get; set; } = string.Empty;

    public int SortOrder { get; set; }
    public bool IsChair { get; set; }

    public string Attendance { get; set; } = AttendanceStatus.Katilir;
}