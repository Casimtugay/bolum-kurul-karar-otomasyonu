using System.Buffers.Binary;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using Kurul.API.Data;
using Kurul.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Services;

public record LoginCaptchaResponse(
    Guid Id,
    string Image,
    DateTime ExpiresAt);

public sealed class LoginCaptchaService
{
    // Yaklaşık 20 kişilik kullanım için 4 rakam yeterli; okunabilirlik yerine
    // bozulmuş el yazısı görünümü ve üstü çizili çizgi bot okumasını zorlaştırır.
    public const int AnswerLength = 4;

    private readonly AppDbContext _db;
    private readonly byte[] _key;

    public LoginCaptchaService(
        AppDbContext db,
        IConfiguration configuration)
    {
        _db = db;

        var jwtKey = configuration["Jwt:Key"];

        if (string.IsNullOrWhiteSpace(jwtKey))
            throw new InvalidOperationException("Jwt:Key bulunamadı.");

        // JWT imzalama anahtarından farklı kullanım alanına sahip
        // bir CAPTCHA anahtarı türetir.
        _key = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(jwtKey),
            Encoding.UTF8.GetBytes("Kurul.LoginCaptcha.Key.v1"));
    }

    public async Task<LoginCaptchaResponse> CreateAsync(
        CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;

        // Temizlik her istekte sınırlı sayıda kayıt üzerinde çalışır.
        var expiredIds = await _db.LoginCaptchas
            .AsNoTracking()
            .Where(x => x.ExpiresAt <= now)
            .OrderBy(x => x.ExpiresAt)
            .Take(500)
            .Select(x => x.Id)
            .ToArrayAsync(ct);

        if (expiredIds.Length > 0)
        {
            await _db.LoginCaptchas
                .Where(x => expiredIds.Contains(x.Id))
                .ExecuteDeleteAsync(ct);
        }

        var id = Guid.NewGuid();

        var answer = new string(
            Enumerable.Range(0, AnswerLength)
                .Select(_ => (char)('0' + RandomNumberGenerator.GetInt32(10)))
                .ToArray());

        // Görsel üretimi başarısız olursa DB kaydı oluşturulmaz.
        var png = RenderPng(answer);
        var expiresAt = now.AddMinutes(2);

        _db.LoginCaptchas.Add(new LoginCaptcha
        {
            Id = id,
            AnswerHash = HashAnswer(id, answer),
            ExpiresAt = expiresAt
        });

        await _db.SaveChangesAsync(ct);

        return new LoginCaptchaResponse(
            id,
            $"data:image/png;base64,{Convert.ToBase64String(png)}",
            expiresAt);
    }

    public async Task<bool> ConsumeAsync(
        Guid id,
        string? answer,
        CancellationToken ct = default)
    {
        if (id == Guid.Empty)
            return false;

        var entry = await _db.LoginCaptchas
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == id, ct);

        if (entry == null)
            return false;

        // Doğru/yanlış cevap ayrımı yapılmadan ilk deneme kaydı tüketir.
        // Eşzamanlı isteklerden sadece biri 1 satır silebilir.
        var deleted = await _db.LoginCaptchas
            .Where(x => x.Id == id)
            .ExecuteDeleteAsync(ct);

        if (deleted != 1 || entry.ExpiresAt <= DateTime.UtcNow)
            return false;

        var normalized = answer?.Trim() ?? "";

        if (normalized.Length != AnswerLength ||
            normalized.Any(c => c < '0' || c > '9'))
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(
            entry.AnswerHash,
            HashAnswer(id, normalized));
    }

    private byte[] HashAnswer(Guid id, string answer)
    {
        return HMACSHA256.HashData(
            _key,
            Encoding.UTF8.GetBytes(
                $"Kurul.LoginCaptcha.Answer.v1\n{id:N}\n{answer}"));
    }

    // Her rakam için 5x7 nokta matrisi.
    // PNG içinde metin, cevap veya açıklama alanı bulunmaz.
    private static readonly string[] Digits =
    {
        "01110/10001/10011/10101/11001/10001/01110",
        "00100/01100/00100/00100/00100/00100/01110",
        "01110/10001/00001/00010/00100/01000/11111",
        "11110/00001/00001/01110/00001/00001/11110",
        "00010/00110/01010/10010/11111/00010/00010",
        "11111/10000/10000/11110/00001/00001/11110",
        "01110/10000/10000/11110/10001/10001/01110",
        "11111/00001/00010/00100/01000/01000/01000",
        "01110/10001/10001/01110/10001/10001/01110",
        "01110/10001/10001/01111/00001/00001/01110"
    };

    private static byte[] RenderPng(string answer)
    {
        const int width = 180;
        const int height = 64;
        const int cell = 6;

        int Rnd(int min, int max) => RandomNumberGenerator.GetInt32(min, max);

        // 1. Rakamlar ayrı bir "mürekkep" katmanına kalın, yuvarlak uçlu çizgilerle çizilir.
        var ink = new float[width * height];

        void Dot(double cx, double cy, double r)
        {
            for (var y = (int)(cy - r - 1); y <= cy + r + 1; y++)
            for (var x = (int)(cx - r - 1); x <= cx + r + 1; x++)
            {
                if (x < 0 || x >= width || y < 0 || y >= height) continue;
                var d = Math.Sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
                var v = (float)Math.Clamp(r + 0.5 - d, 0, 1);
                if (v > ink[y * width + x]) ink[y * width + x] = v;
            }
        }

        void Stroke(double x1, double y1, double x2, double y2, double r)
        {
            var steps = Math.Max(1, (int)(Math.Sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)) * 2));
            for (var i = 0; i <= steps; i++)
                Dot(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps, r);
        }

        for (var index = 0; index < answer.Length; index++)
        {
            var rows = Digits[answer[index] - '0'].Split('/');
            var originX = 18 + index * 38 + Rnd(-3, 4);
            var originY = 11 + Rnd(-3, 4);
            var shear = Rnd(-30, 31) / 100.0;     // her rakam farklı eğimde
            var scale = Rnd(90, 116) / 100.0;
            var r = Rnd(18, 26) / 10.0;

            (double X, double Y) Center(int row, int col) =>
                (originX + (col * cell + (6 - row) * cell * shear) * scale,
                 originY + row * cell * scale);

            for (var row = 0; row < 7; row++)
            for (var col = 0; col < 5; col++)
            {
                if (rows[row][col] != '1') continue;
                var (x, y) = Center(row, col);
                Dot(x, y, r);

                // Komşu dolu hücreler birleştirilir: nokta matrisi yerine akıcı çizgi.
                foreach (var (dr, dc) in new[] { (0, 1), (1, 0), (1, 1), (1, -1) })
                {
                    int nr = row + dr, nc = col + dc;
                    if (nr >= 7 || nc < 0 || nc >= 5 || rows[nr][nc] != '1') continue;
                    if (dr == 1 && dc != 0 && (rows[row][nc] == '1' || rows[nr][col] == '1')) continue;
                    var (x2, y2) = Center(nr, nc);
                    Stroke(x, y, x2, y2, r);
                }
            }
        }

        // 2. Rakamların üzerinden geçen, mürekkeple aynı renkte bir çizgi (renk filtresiyle ayrılamaz).
        {
            var y0 = height / 2 + Rnd(-6, 7);
            var amp = Rnd(3, 7);
            var phase = Rnd(0, 100);
            double prevX = 8, prevY = y0;
            for (var x = 8; x < width - 8; x += 2)
            {
                var y = y0 + amp * Math.Sin((x + phase) / 23.0);
                Stroke(prevX, prevY, x, y, 1.2);
                prevX = x;
                prevY = y;
            }
        }

        // 3. Tüm görüntü dalgalı biçimde bükülür.
        var ax = Rnd(20, 35) / 10.0;
        var ay = Rnd(15, 30) / 10.0;
        var px = Rnd(0, 100);
        var py = Rnd(0, 100);

        var inkR = (byte)Rnd(10, 45);
        var inkG = (byte)Rnd(15, 45);
        var inkB = (byte)Rnd(25, 70);

        var pixels = new byte[width * height * 3];

        for (var y = 0; y < height; y++)
        for (var x = 0; x < width; x++)
        {
            var sx = (int)Math.Round(x + ax * Math.Sin((y + py) / 9.0));
            var sy = (int)Math.Round(y + ay * Math.Sin((x + px) / 13.0));
            var v = sx >= 0 && sx < width && sy >= 0 && sy < height ? ink[sy * width + sx] : 0;

            // Hafif kâğıt dokusu
            var paper = 222 + Rnd(0, 14);
            var offset = (y * width + x) * 3;
            pixels[offset] = (byte)(paper + (inkR - paper) * v);
            pixels[offset + 1] = (byte)(paper + (inkG - paper) * v);
            pixels[offset + 2] = (byte)(paper + (inkB - paper) * v);
        }

        using var output = new MemoryStream();

        output.Write(new byte[]
        {
            137, 80, 78, 71, 13, 10, 26, 10
        });

        var header = new byte[13];
        BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(0, 4), width);
        BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(4, 4), height);
        header[8] = 8;  // Kanal başına 8 bit
        header[9] = 2;  // RGB

        WriteChunk(output, "IHDR", header);

        using var compressed = new MemoryStream();

        using (var zlib = new ZLibStream(
            compressed,
            CompressionLevel.Fastest,
            leaveOpen: true))
        {
            for (var y = 0; y < height; y++)
            {
                zlib.WriteByte(0); // PNG satır filtresi: none
                zlib.Write(pixels, y * width * 3, width * 3);
            }
        }

        WriteChunk(output, "IDAT", compressed.ToArray());
        WriteChunk(output, "IEND", Array.Empty<byte>());

        return output.ToArray();
    }

    private static void WriteChunk(
        Stream stream,
        string type,
        byte[] data)
    {
        var typeBytes = Encoding.ASCII.GetBytes(type);
        var lengthBytes = new byte[4];

        BinaryPrimitives.WriteInt32BigEndian(lengthBytes, data.Length);

        stream.Write(lengthBytes);
        stream.Write(typeBytes);
        stream.Write(data);

        uint crc = 0xffffffff;

        void AddByte(byte value)
        {
            crc ^= value;

            for (var bit = 0; bit < 8; bit++)
            {
                crc = (crc & 1) != 0
                    ? 0xedb88320u ^ (crc >> 1)
                    : crc >> 1;
            }
        }

        foreach (var value in typeBytes)
            AddByte(value);

        foreach (var value in data)
            AddByte(value);

        var crcBytes = new byte[4];

        BinaryPrimitives.WriteUInt32BigEndian(
            crcBytes,
            crc ^ 0xffffffff);

        stream.Write(crcBytes);
    }
}