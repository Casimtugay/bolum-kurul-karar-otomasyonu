using Kurul.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options) { }

    public DbSet<AppUser> Users { get; set; }
    public DbSet<AcademicUnit> AcademicUnits { get; set; }
    public DbSet<UserUnit> UserUnits { get; set; }
    public DbSet<Decision> Decisions { get; set; }
    public DbSet<DecisionParticipant> DecisionParticipants { get; set; }
    public DbSet<Attachment> Attachments { get; set; }
    public DbSet<AuditLog> AuditLogs { get; set; }
    public DbSet<RoleDefinition> Roles { get; set; }
    public DbSet<LoginCaptcha> LoginCaptchas { get; set; }
    public DbSet<Meeting> Meetings { get; set; }
    public DbSet<MeetingParticipant> MeetingParticipants { get; set; }
    public DbSet<MeetingAgenda> MeetingAgendas { get; set; }
    public DbSet<Notification> Notifications { get; set; }

    public DbSet<MeetingAgendaPublication> MeetingAgendaPublications { get; set; }
    public DbSet<CustomAnnouncement> CustomAnnouncements { get; set; }
    public DbSet<DecisionTemplate> DecisionTemplates { get; set; }

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<Meeting>(e =>
{
    // Aynı kurulda aynı yıl/toplantı numarası tekrar kullanılamaz.
    e.HasIndex(x => new
    {
        x.AcademicUnitId,
        x.MeetingYear,
        x.MeetingNo
    }).IsUnique();

    e.HasOne(x => x.AcademicUnit)
        .WithMany()
        .HasForeignKey(x => x.AcademicUnitId)
        .OnDelete(DeleteBehavior.Restrict);

    e.HasOne(x => x.CreatedBy)
        .WithMany()
        .HasForeignKey(x => x.CreatedById)
        .OnDelete(DeleteBehavior.Restrict);

    e.ToTable(t =>
    {
        t.HasCheckConstraint(
            "CK_Meeting_PositiveNumber",
            "[MeetingNo] > 0");

        t.HasCheckConstraint(
            "CK_Meeting_YearMatchesDate",
            "[MeetingYear] = DATEPART(year, [MeetingDate])");

        t.HasCheckConstraint(
            "CK_Meeting_LastDecisionNo",
            "[LastDecisionNo] >= 0");
    });
});

        b.Entity<MeetingParticipant>(e =>
        {
            // Bir kişi aynı toplantıda iki kez bulunamaz.
            e.HasIndex(x => new
            {
                x.MeetingId,
                x.UserId
            }).IsUnique();

            e.HasOne(x => x.Meeting)
                .WithMany(x => x.Participants)
                .HasForeignKey(x => x.MeetingId)
                .OnDelete(DeleteBehavior.Restrict);

            // Toplantı geçmişinde bulunan kullanıcı silinerek
            // katılım kaydının bağlantısı kaybedilemez.
            e.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            e.Property(x => x.Attendance)
                .HasMaxLength(20)
                .IsRequired();

            e.ToTable(t =>
            {
                t.HasCheckConstraint(
                    "CK_MeetingParticipant_Attendance",
                    "[Attendance] IN ('Katilir', 'Izinli', 'Gorevli')");
            });
        });

        b.Entity<MeetingAgendaPublication>(e =>
{
    e.HasIndex(x => new { x.MeetingId, x.Version }).IsUnique();

    e.HasOne(x => x.Meeting)
        .WithMany()
        .HasForeignKey(x => x.MeetingId)
        .OnDelete(DeleteBehavior.Restrict);

    e.HasOne(x => x.PublishedBy)
        .WithMany()
        .HasForeignKey(x => x.PublishedById)
        .OnDelete(DeleteBehavior.Restrict);
});

        b.Entity<Notification>(e =>
        {
            e.HasIndex(x => new { x.UserId, x.PublicationId })
                .IsUnique()
                .HasFilter("[PublicationId] IS NOT NULL");

            e.HasIndex(x => new { x.UserId, x.UnitId, x.IsRead });

            e.HasOne(x => x.Publication)
                .WithMany()
                .HasForeignKey(x => x.PublicationId)
                .OnDelete(DeleteBehavior.Restrict);

            // Özel duyuruda her üyenin tek bildirimi ve katılım kaydı olur.
            e.HasIndex(x => new { x.UserId, x.CustomAnnouncementId })
                .IsUnique()
                .HasFilter("[CustomAnnouncementId] IS NOT NULL");

            e.HasOne(x => x.CustomAnnouncement)
                .WithMany(a => a.Notifications)
                .HasForeignKey(x => x.CustomAnnouncementId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<CustomAnnouncement>(e =>
        {
            e.HasIndex(x => new { x.UnitId, x.CreatedAt });

            e.HasOne(x => x.Unit)
                .WithMany()
                .HasForeignKey(x => x.UnitId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.PublishedBy)
                .WithMany()
                .HasForeignKey(x => x.PublishedById)
                .OnDelete(DeleteBehavior.Restrict);
        });
        b.Entity<LoginCaptcha>(e =>
{
    e.Property(x => x.AnswerHash)
        .HasMaxLength(32)
        .IsRequired();

    e.HasIndex(x => x.ExpiresAt);
});

        b.Entity<AcademicUnit>(e =>
        {
            e.Property(x => x.Code).HasMaxLength(50);
            e.HasIndex(x => x.Code).IsUnique();
        });

        b.Entity<AppUser>(e =>
        {
            e.Property(x => x.Email).HasMaxLength(200);
            e.HasIndex(x => x.Email).IsUnique();

            e.Property(x => x.Username).HasMaxLength(100);
            e.HasIndex(x => x.Username).IsUnique();
        });

        b.Entity<UserUnit>(e =>
        {
            e.HasIndex(x => new
            {
                x.UserId,
                x.AcademicUnitId
            }).IsUnique();

            e.HasOne(x => x.Role)
                .WithMany()
                .HasForeignKey(x => x.RoleId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.User)
                .WithMany(x => x.UserUnits)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<RoleDefinition>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100);

            e.HasIndex(x => new
            {
                x.AcademicUnitId,
                x.Name
            }).IsUnique();

            e.HasOne(x => x.AcademicUnit)
                .WithMany()
                .HasForeignKey(x => x.AcademicUnitId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<DecisionTemplate>(e =>
        {
            e.HasIndex(x => new { x.AcademicUnitId, x.Name }).IsUnique();
            e.HasOne(x => x.AcademicUnit).WithMany().HasForeignKey(x => x.AcademicUnitId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Decision>(e =>
        {
            e.HasOne(x => x.Meeting)
            .WithMany(x => x.Decisions)
            .HasForeignKey(x => x.MeetingId)
            .OnDelete(DeleteBehavior.Restrict);

            // Liste sıralamasını da destekleyen mevcut benzersiz indeks.
            e.HasIndex(x => new
            {
                x.AcademicUnitId,
                x.MeetingYear,
                x.MeetingNo,
                x.DecisionNo
            }).IsUnique();

            // "Belge Doğrula" sayfası kararı bu kodla bulur.
            e.HasIndex(x => x.VerificationCode)
                .IsUnique()
                .HasFilter("[VerificationCode] IS NOT NULL");

            e.HasOne(x => x.AcademicUnit)
                .WithMany()
                .HasForeignKey(x => x.AcademicUnitId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.CreatedBy)
                .WithMany()
                .HasForeignKey(x => x.CreatedById)
                .OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<DecisionParticipant>(e =>
        {
            e.HasIndex(x => new
            {
                x.DecisionId,
                x.UserId
            }).IsUnique();

            e.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            e.ToTable(t =>
            {
                t.HasCheckConstraint(
                    "CK_Participant_RetReason",
                    "[Vote] <> 'Ret' OR LEN(LTRIM(RTRIM(ISNULL([VoteReason], '')))) > 0");

                t.HasCheckConstraint(
                    "CK_Participant_NoVoteWhenAbsent",
                    "[Attendance] = 'Katilir' OR [Vote] IS NULL");
            });
        });

        b.Entity<Attachment>(e =>
        {
            e.HasOne<AppUser>()
                .WithMany()
                .HasForeignKey(x => x.UploadedById)
                .OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<AuditLog>(e =>
        {
            // Kurula göre en yeni kayıtları listeleme.
            e.HasIndex(x => new
            {
                x.AcademicUnitId,
                x.Id
            });

            // Kurul ve tarih aralığı filtresi.
            e.HasIndex(x => new
            {
                x.AcademicUnitId,
                x.CreatedAt
            });
        });

        // AuditLog.UserId için kullanıcıya silme bağı eklenmez.
        // Hesap silinse bile geçmiş log bilgileri korunur.
    }
}