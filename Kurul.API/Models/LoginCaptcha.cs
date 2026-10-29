using System.ComponentModel.DataAnnotations;

namespace Kurul.API.Models;

public class LoginCaptcha
{
    public Guid Id { get; set; }

    [MaxLength(32)]
    public byte[] AnswerHash { get; set; } = Array.Empty<byte>();

    public DateTime ExpiresAt { get; set; }
}