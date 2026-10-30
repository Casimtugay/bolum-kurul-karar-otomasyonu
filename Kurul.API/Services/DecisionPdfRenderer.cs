using System.Globalization;
using System.Text.Json;
using Kurul.API.Models;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using QRCoder;

namespace Kurul.API.Services;

public static class DecisionPdfRenderer
{
    private static readonly CultureInfo Turkish =
        CultureInfo.GetCultureInfo("tr-TR");

    // Width: arayüzde ayarlanan göreli genişlik (yüzde); eski kayıtlarda yoktur.
    private sealed record TableColumn(string Key, string Label, double? Width);

    static DecisionPdfRenderer()
    {
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public static byte[] Render(
        Decision decision,
        byte[] logo,
        bool forSigning = false,
        string? verifyUrl = null,
        bool sealing = false)
    {
        // Doğrulama kodu varsa her sayfanın altına QR ve kod basılır.
        var qrPng = verifyUrl != null && decision.VerificationCode != null
            ? QrPng(verifyUrl)
            : null;

        var unit = decision.AcademicUnit
            ?? throw new InvalidOperationException("Kurul bilgisi bulunamadı.");

        var columns = ReadColumns(decision.TableColumnsJson);
        var rows = ReadRows(decision.TableRowsJson);

        if (columns.Count == 0 && rows.Count > 0)
        {
            throw new InvalidOperationException(
                "Karar tablosunun satırları var ancak sütunları tanımlı değil.");
        }

        // Çok geniş tablolar okunabilir bir A4 çıktısı oluşturamaz.
        if (columns.Count > 10 || rows.Count > 2000)
        {
            throw new InvalidOperationException(
                "PDF tablosu en fazla 10 sütun ve 2000 satır içerebilir.");
        }

        var participants = decision.Participants
            .OrderBy(p => p.SortOrder)
            .ThenBy(p => p.UserId)
            .ToList();

        var attachments = decision.Attachments
            .OrderBy(a => a.Id)
            .ToList();

        var outcome = string.IsNullOrWhiteSpace(decision.VoteOutcome)
            ? "[oylama sonucu]"
            : decision.VoteOutcome;

        var content = (decision.Content ?? "")
            .Replace("{OY_SONUCU}", outcome);

        var statusLabel = forSigning
            ? "İMZAYA ESAS KARAR METNİ"
            : decision.Status switch
        {
            DecisionStatus.Imzalandi => "İMZA SÜRECİ TAMAMLANDI",
            DecisionStatus.ImzaBekliyor => "TASLAK — İMZA BEKLİYOR",
            DecisionStatus.Reddedildi => "REDDEDİLDİ",
            DecisionStatus.IptalEdildi => "İPTAL EDİLDİ",
            DecisionStatus.Oylamada => "TASLAK — OYLAMADA",
            _ => "TASLAK"
        };

        return Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(15, Unit.Millimetre);

                // QuestPDF ile gelen font:
                // okul sunucusunda Times New Roman kurulu olmasını gerektirmez.
                page.DefaultTextStyle(style =>
                    style.FontFamily("Lato").FontSize(10));

                page.Content().Column(body =>
                {
                    body.Spacing(12);

                    body.Item()
                        .Border(0.7f)
                        .Padding(6)
                        .AlignCenter()
                        .Text(statusLabel)
                        .Bold()
                        .FontSize(10);

                    body.Item().Row(header =>
                    {
                        header.Spacing(8);

                        header.RelativeItem(25)
                            .Image(logo)
                            .FitWidth();

                        header.RelativeItem(45)
                            .AlignCenter()
                            .Column(title =>
                            {
                                title.Item().AlignCenter().Text("T.C.").Bold();
                                title.Item().AlignCenter()
                                    .Text("SELÇUK ÜNİVERSİTESİ").Bold();

                                title.Item().AlignCenter()
                                    .Text(unit.ParentName.ToUpper(Turkish))
                                    .Bold();

                                title.Item().AlignCenter()
                                    .Text(unit.TitleLine1)
                                    .Bold();

                                title.Item().AlignCenter()
                                    .Text(unit.TitleLine2)
                                    .Bold();
                            });

                        header.RelativeItem(30).Table(info =>
                        {
                            info.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn();
                                c.RelativeColumn();
                            });

                            void Info(string label, string value)
                            {
                                info.Cell().Element(Cell)
                                    .Text(label).Bold().FontSize(8);

                                info.Cell().Element(Cell)
                                    .Text(value).FontSize(8);
                            }

                            Info(
                                "Toplantı Tarihi",
                                decision.MeetingDate.ToString(
                                    "dd.MM.yyyy", Turkish));

                            Info(
                                "Toplantı No",
                                $"{decision.MeetingYear} / {decision.MeetingNo}");

                            Info(
                                "Karar No",
                                decision.DecisionNo.ToString(
                                    CultureInfo.InvariantCulture));
                        });
                    });

                    if (!string.IsNullOrWhiteSpace(decision.Reference))
                    {
                        body.Item().Element(c =>
                            Detail(c, "İLGİ", decision.Reference));
                    }

                    body.Item().Element(c =>
                        Detail(c, "GÜNDEM", decision.Agenda));

                    body.Item().Element(c =>
                        Detail(c, "KARAR", content));

                    if (decision.Status == DecisionStatus.IptalEdildi)
                    {
                        body.Item().Element(c => Detail(
                            c,
                            "İPTAL",
                            $"{decision.CancelledByName}\n" +
                            $"{FormatTime(decision.CancelledAt)}\n" +
                            $"{decision.CancellationReason}"));
                    }

                    if (decision.SourceDecisionId is int sourceId)
                    {
                        body.Item().Element(c => Detail(
                            c,
                            "KAYNAK",
                            $"Yeniden değerlendirmeye esas karar kaydı: #{sourceId}"));
                    }

                    if (!string.IsNullOrWhiteSpace(decision.AttachmentsNote) ||
                        attachments.Count > 0)
                    {
                        var attachmentLines = attachments.Select(
                            (a, index) => $"Ek-{index + 1}: {a.OriginalName}");

                        var text = string.Join(
                            "\n",
                            new[] { decision.AttachmentsNote }
                                .Concat(attachmentLines)
                                .Where(value => !string.IsNullOrWhiteSpace(value)));

                        body.Item().Element(c => Detail(c, "EKLER", text));
                    }

                    if (columns.Count > 0)
                    {
                        body.Item().Table(table =>
                        {
                            // Genişliği olmayan sütunlar diğerlerinin ortalamasını alır (arayüzle aynı kural).
                            var known = columns.Where(col => col.Width.HasValue).Select(col => col.Width!.Value).ToList();
                            var fallback = known.Count > 0 ? known.Average() : 1;

                            table.ColumnsDefinition(c =>
                            {
                                c.ConstantColumn(30);

                                foreach (var column in columns)
                                    c.RelativeColumn((float)(column.Width ?? fallback));
                            });

                            // Başlık sonraki sayfalarda da tekrarlanır.
                            table.Header(h =>
                            {
                                h.Cell().Element(HeaderCell)
                                    .Text("Sıra").Bold();

                                foreach (var column in columns)
                                {
                                    h.Cell().Element(HeaderCell)
                                        .Text(column.Label).Bold();
                                }
                            });

                            for (var index = 0; index < rows.Count; index++)
                            {
                                table.Cell().Element(Cell)
                                    .Text((index + 1).ToString(
                                        CultureInfo.InvariantCulture));

                                foreach (var column in columns)
                                {
                                    var value = rows[index].TryGetValue(
                                        column.Key, out var cellValue)
                                        ? cellValue
                                        : "";

                                    table.Cell().Element(Cell).Text(value);
                                }
                            }
                        });
                    }

                    var dissent = participants
                        .Where(p => p.Vote == VoteType.Ret)
                        .ToList();

                    if (dissent.Count > 0)
                    {
                        body.Item().Text("KARŞI OY GEREKÇELERİ").Bold();

                        foreach (var participant in dissent)
                        {
                            body.Item().Text(text =>
                            {
                                text.Span($"{participant.DisplayName}: ").Bold();
                                text.Span(participant.VoteReason ?? "");
                            });
                        }
                    }

                    body.Item()
                        .EnsureSpace(100)
                        .Column(memberSection =>
                        {
                            memberSection.Spacing(5);

                            memberSection.Item()
                                .Text(unit.MembersLabel)
                                .Bold();

                            // İmza kutuları yalnızca toplantıya katılan üyeler için çizilir;
                            // katılmayanlar belgede yer almaz.
                            var signers = participants
                                .Where(p => p.Attendance == AttendanceStatus.Katilir)
                                .ToList();

                            memberSection.Item().Table(table =>
                            {
                                table.ColumnsDefinition(c =>
                                {
                                    c.RelativeColumn();
                                    c.RelativeColumn();
                                });

                                foreach (var participant in signers)
                                {
                                    table.Cell()
                                        .Element(Cell)
                                        .MinHeight(65)
                                        .AlignCenter()
                                        .Column(member =>
                                        {
                                            member.Spacing(3);

                                            member.Item().AlignCenter()
                                                .Text(participant.DisplayName)
                                                .Bold();

                                            member.Item().AlignCenter()
                                                .Text(participant.Duty)
                                                .FontSize(9);

                                            if (participant.Attendance !=
                                                AttendanceStatus.Katilir)
                                            {
                                                member.Item().AlignCenter()
                                                    .Text(
                                                        $"({AttendanceText(participant.Attendance)})")
                                                    .FontSize(9);
                                            }

                                            if (!forSigning && participant.SignedAt != null)
                                            {
                                                // Üyenin kendi imzası (şeffaf PNG), adının ve görevinin altında.
                                                if (participant.SignatureImagePng is { Length: > 0 } png)
                                                {
                                                    member.Item().AlignCenter()
                                                        .Height(38)
                                                        .Image(png)
                                                        .FitArea();
                                                }

                                                member.Item().AlignCenter()
                                                    .Text(
                                                        (participant.SignatureImagePng == null
                                                            ? "Sistem içi onay\n"
                                                            : "") +
                                                        FormatTime(participant.SignedAt))
                                                    .FontSize(7)
                                                    .FontColor(Colors.Grey.Darken1);
                                            }
                                        });
                                }

                                if (signers.Count % 2 != 0)
                                {
                                    table.Cell()
                                        .Element(Cell)
                                        .MinHeight(65)
                                        .Text("");
                                }
                            });
                        });

                    body.Item().Text(forSigning
                        ? "Bu dosya imzaya esas sabit karar metnidir. " +
                          "İmza ve iptal durumları sistemden veya alttaki doğrulama kodundan kontrol edilir. " +
                          "Nitelikli elektronik imzalı PDF değildir."
                        : (sealing
                            ? "Bu PDF, imzaların tamamlanmasının ardından Kurul Karar Sistemi " +
                              "sertifikasıyla elektronik olarak mühürlenmiştir; dosyada yapılan her " +
                              "değişiklik mührü bozar. "
                            : "Bu PDF, sistem kayıtlarından oluşturulan görüntüleme çıktısıdır. ") +
                        "Üye imzaları sistem içi onay imzasıdır; " +
                        "5070 sayılı Kanun kapsamında güvenli elektronik imza değildir. " +
                        (string.IsNullOrEmpty(decision.SigningPdfHash)
                            ? ""
                            : $"İmzaya esas belge özeti (SHA-256): {decision.SigningPdfHash}"))
                        .FontSize(8)
                        .FontColor(Colors.Grey.Darken2);

                    if (attachments.Count > 0)
                    {
                        body.Item().Text(
                            "Ek dosyaların adları listelenmiştir. " +
                            "Dosya içerikleri bu PDF'ye birleştirilmemiştir.")
                            .FontSize(8);
                    }

                    if (!forSigning && !string.IsNullOrWhiteSpace(decision.DocumentHash))
                    {
                        body.Item().Text(
                            "Karar verisinin kayıtlı SHA-256 özeti:\n" +
                            decision.DocumentHash)
                            .FontSize(7);
                    }
                });

                if (qrPng == null)
                {
                    page.Footer()
                        .PaddingTop(8)
                        .AlignCenter()
                        .Text(PageNumber);
                }
                else
                {
                    page.Footer()
                        .PaddingTop(6)
                        .BorderTop(0.5f)
                        .BorderColor(Colors.Grey.Lighten1)
                        .PaddingTop(4)
                        .Row(row =>
                        {
                            row.ConstantItem(17, Unit.Millimetre).Image(qrPng);
                            row.ConstantItem(3, Unit.Millimetre);
                            row.RelativeItem().AlignMiddle().Column(col =>
                            {
                                col.Item().Text(text =>
                                {
                                    text.Span("Belge doğrulama kodu: ").FontSize(8);
                                    text.Span(decision.VerificationCode).FontSize(8).Bold();
                                });
                                col.Item().Text(verifyUrl).FontSize(7).FontColor(Colors.Grey.Darken2);
                                col.Item().Text("Karekodu okutarak veya adresi açarak belgenin " +
                                    "güncel durumunu ve imzalarını doğrulayabilirsiniz.")
                                    .FontSize(6.5f).FontColor(Colors.Grey.Darken1);
                            });
                            row.ConstantItem(22, Unit.Millimetre).AlignRight().AlignMiddle()
                                .DefaultTextStyle(x => x.FontSize(8))
                                .Text(PageNumber);
                        });
                }
            });
        }).GeneratePdf();
    }

    private static void PageNumber(TextDescriptor text)
    {
        text.Span("Sayfa ");
        text.CurrentPageNumber();
        text.Span(" / ");
        text.TotalPages();
    }

    private static byte[] QrPng(string url)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(url, QRCodeGenerator.ECCLevel.M);
        return new PngByteQRCode(data).GetGraphic(8);
    }

    private static IContainer Cell(IContainer container) =>
        container.Border(0.5f).Padding(4);

    private static IContainer HeaderCell(IContainer container) =>
        container.Background(Colors.Grey.Lighten3)
            .Border(0.5f)
            .Padding(4);

    private static void Detail(
        IContainer container,
        string label,
        string value)
    {
        container.Row(row =>
        {
            row.ConstantItem(65).Text(label).Bold().Underline();
            row.ConstantItem(10).Text(":");
            row.RelativeItem().Text(value ?? "");
        });
    }

    private static string AttendanceText(string value) => value switch
    {
        "Izinli" => "İzinli",
        "Gorevli" => "Görevli",
        _ => value
    };

    private static string FormatTime(DateTime? value)
    {
        if (value == null) return "";

        var utc = DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
        var zone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul");
        var local = TimeZoneInfo.ConvertTimeFromUtc(utc, zone);

        return local.ToString("dd.MM.yyyy HH:mm", Turkish);
    }

    private static List<TableColumn> ReadColumns(string json)
    {
        using var document = JsonDocument.Parse(json);

        if (document.RootElement.ValueKind != JsonValueKind.Array)
            throw new InvalidOperationException("Tablo sütunları geçersiz.");

        var result = new List<TableColumn>();

        foreach (var item in document.RootElement.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object ||
                !item.TryGetProperty("key", out var key) ||
                !item.TryGetProperty("label", out var label) ||
                key.ValueKind != JsonValueKind.String ||
                label.ValueKind != JsonValueKind.String ||
                string.IsNullOrWhiteSpace(key.GetString()))
            {
                throw new InvalidOperationException(
                    "Tablo sütununun anahtar veya başlık bilgisi geçersiz.");
            }

            double? width = item.TryGetProperty("width", out var w) &&
                w.ValueKind == JsonValueKind.Number &&
                w.TryGetDouble(out var value) && value > 0 && value <= 100
                    ? value
                    : null;

            result.Add(new TableColumn(
                key.GetString()!,
                label.GetString() ?? "",
                width));
        }

        if (result.Select(c => c.Key).Distinct().Count() != result.Count)
            throw new InvalidOperationException("Tablo sütunları tekrarlanıyor.");

        return result;
    }

    private static List<Dictionary<string, string>> ReadRows(string json)
    {
        using var document = JsonDocument.Parse(json);

        if (document.RootElement.ValueKind != JsonValueKind.Array)
            throw new InvalidOperationException("Tablo satırları geçersiz.");

        var result = new List<Dictionary<string, string>>();

        foreach (var item in document.RootElement.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
                throw new InvalidOperationException("Tablo satırı geçersiz.");

            var row = new Dictionary<string, string>();

            foreach (var property in item.EnumerateObject())
            {
                row[property.Name] = property.Value.ValueKind switch
                {
                    JsonValueKind.Null => "",
                    JsonValueKind.String => property.Value.GetString() ?? "",
                    _ => property.Value.ToString()
                };
            }

            result.Add(row);
        }

        return result;
    }
}