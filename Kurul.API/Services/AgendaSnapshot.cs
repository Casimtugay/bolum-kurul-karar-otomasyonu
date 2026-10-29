using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Kurul.API.Services;

// Gündem maddelerinin sürüm olarak saklanması ve karşılaştırılması.
public static class AgendaSnapshot
{
    public sealed record Item(string Title, string Description);

    private static readonly JsonSerializerOptions Json =
        new(JsonSerializerDefaults.Web);

    public static string Serialize(IEnumerable<Item> items) =>
        JsonSerializer.Serialize(items, Json);

    public static List<Item> Deserialize(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new List<Item>();

        try
        {
            return JsonSerializer.Deserialize<List<Item>>(json, Json)
                   ?? new List<Item>();
        }
        catch (JsonException)
        {
            return new List<Item>();
        }
    }

    public static string Hash(IEnumerable<Item> items)
    {
        var sb = new StringBuilder();

        foreach (var item in items)
        {
            sb.Append(item.Title).Append('\u001f')
              .Append(item.Description).Append('\u001e');
        }

        return Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(sb.ToString())));
    }
}