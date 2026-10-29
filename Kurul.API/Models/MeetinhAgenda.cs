using System.ComponentModel.DataAnnotations;

namespace Kurul.API.Models;

public class MeetingAgenda
{
    public int Id { get; set; }

    public int MeetingId { get; set; }
    public Meeting Meeting { get; set; } = null!;

    [Required]
    [MaxLength(250)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    public int OrderNo { get; set; } = 1;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}