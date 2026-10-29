using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Kurul.API.Models;
using Microsoft.IdentityModel.Tokens;

namespace Kurul.API.Services;

public class TokenService
{
    private readonly IConfiguration _config;

    public TokenService(IConfiguration config)
    {
        _config = config;
    }

    public string Create(
        AppUser user,
        AcademicUnit? unit = null,
        string? unitRole = null)
    {
        var claims = new List<Claim>
        {
            new(
                ClaimTypes.NameIdentifier,
                user.Id.ToString(CultureInfo.InvariantCulture)),

            new(ClaimTypes.Name, user.Username),
            new("fullName", user.FullName),
            new(ClaimTypes.Role, user.Role),

            // Parola veya hesap durumu değişince eski token reddedilir.
            new("sessionStamp", user.SessionStamp.ToString("N")),

            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))
        };

        if (unit != null)
        {
            claims.Add(new Claim(
                "unitId",
                unit.Id.ToString(CultureInfo.InvariantCulture)));

            claims.Add(new Claim("unitCode", unit.Code));

            claims.Add(new Claim(
                "unitRole",
                unitRole ?? UnitRoles.OyKullanmayan));
        }

        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddHours(8),
            signingCredentials: new SigningCredentials(
                key,
                SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}